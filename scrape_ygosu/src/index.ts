import { writeFile } from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "playwright";

const MEMBER_ID = "684134";
const PAGE_NUM = 1;

const CONCURRENCY = 3;
const MIN_JITTER_MS = 600;
const MAX_JITTER_MS = 1800;

const LISTING_URL = (page: number) =>
  `https://ygosu.com/minilog/?m2=article&m3=list&member=${MEMBER_ID}&search=&searcht=s&page=${page}`;

interface Comment {
  nickname: string;
  commentBody: string;
}

interface PostSummary {
  category: string;
  title: string;
  url: string;
  listingDate: string;
  views: number;
  recommend: number;
  commentCount: number;
}

interface Post extends PostSummary {
  postBody: string;
  comments: Comment[];
}

function absolutize(href: string): string {
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `https://ygosu.com${href}`;
  return href;
}

function parseInt10(s: string | null | undefined): number {
  if (!s) return 0;
  const m = s.replace(/[, +]/g, "").match(/-?\d+/);
  return m ? Number(m[0]) : 0;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const jitterMs = () =>
  MIN_JITTER_MS + Math.random() * (MAX_JITTER_MS - MIN_JITTER_MS);

async function scrapeListing(page: Page, pageNum: number): Promise<PostSummary[]> {
  const listingUrl = LISTING_URL(pageNum);
  console.log(`[listing] ${listingUrl}`);
  await page.goto(listingUrl, { waitUntil: "domcontentloaded" });

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
    const commentCount = commentMatch?.[1] ? Number(commentMatch[1]) : 0;

    const cellTexts = (await row.locator("td").allTextContents()).map((t) => t.trim());
    const listingDate = cellTexts.find((t) => /^\d{2}\.\d{2}\.\d{2}/.test(t)) ?? "";
    const recommendText = cellTexts.find((t) => /^\+\d/.test(t));
    const viewsText = cellTexts.find((t) => /^\d[\d,]*$/.test(t));
    const category = cellTexts[0] && cellTexts[0] !== titText ? cellTexts[0] : "";

    summaries.push({
      category,
      title,
      url: absolutize(href),
      listingDate,
      views: parseInt10(viewsText),
      recommend: parseInt10(recommendText),
      commentCount,
    });
  }

  return summaries;
}

async function scrapePostDetail(
  page: Page,
  url: string,
): Promise<{ postBody: string; comments: Comment[] }> {
  console.log(`[detail] ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const body = page.locator(".board_body .container").first();
  const postBody =
    (await body.count()) > 0 ? ((await body.innerText()) ?? "").trim() : "";

  const commentItems = page.locator("ul#reply_list_layer li#normal_reply");
  const n = await commentItems.count();
  const comments: Comment[] = [];
  for (let i = 0; i < n; i++) {
    const item = commentItems.nth(i);
    const nickname = ((await item.locator("div.nick").first().textContent()) ?? "").trim();
    const commentBody = ((await item.locator("div.body_wrap").first().innerText()) ?? "").trim();
    comments.push({ nickname, commentBody });
  }

  return { postBody, comments };
}

/**
 * Fan out `items` across N worker lanes. Each lane is tied to its own
 * Playwright page so the browser-side navigations don't contend.
 */
async function mapWithWorkers<T, R>(
  items: T[],
  workers: ((item: T, index: number) => Promise<R>)[],
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    workers.map(async (worker) => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        results[i] = await worker(items[i]!, i);
      }
    }),
  );
  return results;
}

async function scrapePage(
  context: BrowserContext,
  pageNum: number,
): Promise<Post[]> {
  const listPage = await context.newPage();
  let summaries: PostSummary[];
  try {
    summaries = await scrapeListing(listPage, pageNum);
  } finally {
    await listPage.close();
  }

  const detailPages = await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, Math.max(summaries.length, 1)) }, () =>
      context.newPage(),
    ),
  );

  try {
    const workers = detailPages.map((page) => async (s: PostSummary) => {
      await sleep(jitterMs());
      const detail = await scrapePostDetail(page, s.url);
      return { ...s, ...detail } satisfies Post;
    });
    return await mapWithWorkers(summaries, workers);
  } finally {
    await Promise.all(detailPages.map((p) => p.close()));
  }
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
    locale: "ko-KR",
  });

  try {
    const posts = await scrapePage(context, PAGE_NUM);
    const filename = `ygosu_${MEMBER_ID}_${PAGE_NUM}.json`;
    await writeFile(filename, JSON.stringify(posts, null, 2), "utf8");
    console.log(`[write] ${posts.length} posts → ${filename}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
