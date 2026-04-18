import { chromium, type Page } from "playwright";

const MEMBER_ID = "684134";
const LISTING_URL = (page: number) =>
  `https://ygosu.com/minilog/?m2=article&m3=list&member=${MEMBER_ID}&search=&searcht=s&page=${page}`;

type PostSummary = {
  category: string | null;
  title: string;
  url: string;
  listingDate: string | null;
  views: number | null;
  recommend: number | null;
  commentCount: number | null;
};

function absolutize(href: string): string {
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `https://ygosu.com${href}`;
  return href;
}

function parseInt10(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.replace(/[, +]/g, "").match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

async function scrapeListing(page: Page, pageNum: number): Promise<PostSummary[]> {
  const listingUrl = LISTING_URL(pageNum);
  console.log(`[listing] ${listingUrl}`);
  await page.goto(listingUrl, { waitUntil: "domcontentloaded" });

  // `table.tbl_ua` holds the posts list; each row has a `td.tit` with the
  // post link. Extraction runs Node-side via the locator API, so no user
  // callback is serialized into the browser.
  const rows = page.locator("table.tbl_ua tr:has(td.tit)");
  const count = await rows.count();
  console.log(`[listing] ${count} rows matched`);

  const summaries: PostSummary[] = [];
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    const titCell = row.locator("td.tit").first();
    const anchor = titCell.locator("a[href]").first();
    if ((await anchor.count()) === 0) continue;

    const title = ((await anchor.textContent()) ?? "").trim();
    const href = (await anchor.getAttribute("href")) ?? "";
    const titText = ((await titCell.textContent()) ?? "").trim();

    const commentMatch = titText.match(/\((\d+)\)\s*$/);
    const commentCount =
      commentMatch && commentMatch[1] ? Number(commentMatch[1]) : null;

    const cellTexts = (await row.locator("td").allTextContents()).map((t) => t.trim());
    const listingDate = cellTexts.find((t) => /^\d{2}\.\d{2}\.\d{2}/.test(t)) ?? null;
    const recommendText = cellTexts.find((t) => /^\+\d/.test(t)) ?? null;
    const viewsText = cellTexts.find((t) => /^\d[\d,]*$/.test(t)) ?? null;
    const category = cellTexts[0] && cellTexts[0] !== titText ? cellTexts[0] : null;

    const summary: PostSummary = {
      category,
      title,
      url: absolutize(href),
      listingDate,
      views: parseInt10(viewsText),
      recommend: parseInt10(recommendText),
      commentCount,
    };
    console.log(summary);
    summaries.push(summary);
  }

  return summaries;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
    locale: "ko-KR",
  });
  const page = await context.newPage();

  try {
    await scrapeListing(page, 1);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
