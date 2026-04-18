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

type PostDetail = {
  url: string;
  title: string | null;
  author: string | null;
  postedAt: string | null;
  contentText: string | null;
  contentHtml: string | null;
};

function absolutize(href: string): string {
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `https://ygosu.com${href}`;
  return href;
}

async function scrapeListing(page: Page, pageNum: number): Promise<PostSummary[]> {
  await page.goto(LISTING_URL(pageNum), { waitUntil: "domcontentloaded" });

  // `.tit` is on the title cell. Each row is its nearest `<tr>` (or parent row
  // container). We walk from `.tit` outward so we don't depend on the outer
  // table's exact class name.
  return page
    .$$eval(".tit", (titleCells) => {
      const parseInt10 = (s: string | null | undefined): number | null => {
        if (!s) return null;
        const m = s.replace(/[, +]/g, "").match(/-?\d+/);
        return m ? Number(m[0]) : null;
      };

      return titleCells
        .map((tit) => {
          const row = tit.closest("tr") ?? tit.parentElement;
          if (!row) return null;

          const anchor = tit.querySelector("a[href]") as HTMLAnchorElement | null;
          if (!anchor) return null;

          const rawTitle = (anchor.textContent ?? "").trim();
          // Title cell sometimes has a trailing "(N)" for comment count.
          const commentMatch = (tit.textContent ?? "").match(/\((\d+)\)\s*$/);
          const commentCount = commentMatch && commentMatch[1] ? Number(commentMatch[1]) : null;

          const cells = Array.from(row.querySelectorAll("td"));
          const cellTexts = cells.map((c) => (c.textContent ?? "").trim());

          const dateCell = cellTexts.find((t) => /^\d{2}\.\d{2}\.\d{2}/.test(t)) ?? null;
          const numericCells = cellTexts.filter((t) => /^\+?\d[\d,]*$/.test(t));
          const viewsText = numericCells[0] ?? null;
          const recommendText = cellTexts.find((t) => /^\+\d/.test(t)) ?? null;

          const categoryCell = cells[0];
          const category =
            categoryCell && categoryCell !== tit
              ? (categoryCell.textContent ?? "").trim() || null
              : null;

          return {
            category,
            title: rawTitle,
            url: anchor.getAttribute("href") ?? "",
            listingDate: dateCell,
            views: parseInt10(viewsText),
            recommend: parseInt10(recommendText),
            commentCount,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
    })
    .then((rows) => rows.filter((r) => r.url).map((r) => ({ ...r, url: absolutize(r.url) })));
}

async function scrapePostDetail(page: Page, url: string): Promise<PostDetail> {
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const detail = await page.evaluate(() => {
    const pick = (sel: string) => (document.querySelector(sel)?.textContent ?? "").trim() || null;

    // Title is usually an h3/h2 near the top of the post view.
    const title =
      pick("h3.tit") ||
      pick(".view_top .tit") ||
      pick(".board_view .tit") ||
      pick("h3") ||
      pick("h2");

    // Body: try a few common ygosu containers, then fall back to the largest
    // block of text inside an `article`-ish element.
    const bodyEl =
      (document.querySelector(".view_content") as HTMLElement | null) ||
      (document.querySelector(".board_view .content") as HTMLElement | null) ||
      (document.querySelector("#bo_v_con") as HTMLElement | null) ||
      (document.querySelector("article") as HTMLElement | null);

    const contentText = bodyEl ? (bodyEl.innerText ?? "").trim() || null : null;
    const contentHtml = bodyEl ? bodyEl.innerHTML : null;

    // Author / timestamp often live in an info/meta strip near the title.
    const metaEl =
      document.querySelector(".view_top") ||
      document.querySelector(".board_view .info") ||
      document.querySelector(".view_info");
    const metaText = metaEl ? (metaEl.textContent ?? "").replace(/\s+/g, " ").trim() : "";

    const postedAtMatch = metaText.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?/);
    const postedAt = postedAtMatch ? postedAtMatch[0] : null;

    const authorEl = metaEl?.querySelector(".name, .writer, a[href*='member=']") ?? null;
    const author = authorEl ? (authorEl.textContent ?? "").trim() || null : null;

    return { title, author, postedAt, contentText, contentHtml };
  });

  return { url, ...detail };
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
    const summaries = await scrapeListing(page, 1);
    console.log(`[listing] page=1 found ${summaries.length} posts`);
    console.log(JSON.stringify(summaries, null, 2));

    // Smoke test: fetch body of the first 2 posts only.
    const sample = summaries.slice(0, 2);
    const details: PostDetail[] = [];
    for (const s of sample) {
      console.log(`[detail] fetching ${s.url}`);
      details.push(await scrapePostDetail(page, s.url));
    }
    console.log(JSON.stringify(details, null, 2));
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
