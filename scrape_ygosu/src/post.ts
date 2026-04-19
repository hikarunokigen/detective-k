import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = join(REPO_ROOT, "data", "yg_post");
import { chromium, type BrowserContext, type Page } from "playwright";
import type { Post, PostComment } from "ygosu_types";

const MEMBER_ID = "684134";

const CONCURRENCY = 3;
const MIN_JITTER_MS = 650;
const MAX_JITTER_MS = 1800;

const PAGE_COOLDOWN_MIN_MS = 2000;
const PAGE_COOLDOWN_MAX_MS = 4000;

const LISTING_URL = (page: number) =>
  `https://ygosu.com/minilog/?m2=article&m3=list&member=${MEMBER_ID}&search=&searcht=s&page=${page}`;

// Scraper-internal shape — the bare listing row; scrapePage merges this
// with scrapePostDetail's output to produce the exported `Post`.
interface PostSummary {
  category: string;
  title: string;
  url: string;
  listing_date: string;
  views: number;
  recommend: number;
  comment_count: number;
}

function extractPostId(url: string): string {
  return url.match(/\/(\d+)(?:[?#/]|$)/)?.[1] ?? "";
}

function extractUserId(onclick: string): string {
  // show_nick_dropdown($(this), 0, 666527, 'N', '')  →  "666527"
  return onclick.match(/show_nick_dropdown\([^,]+,\s*\d+\s*,\s*(\d+)/)?.[1] ?? "";
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
const jitterMs = () => MIN_JITTER_MS + Math.random() * (MAX_JITTER_MS - MIN_JITTER_MS);

async function readTotalCount(page: Page): Promise<number | null> {
  // `b.last` only advances one window at a time (stops at 10 even when
  // 60+ pages exist), so we derive the real last page from the total
  // record count advertised on the profile header.
  const loc = page
    .locator(".det_myboard > h3:nth-child(1) > i:nth-child(3) > strong:nth-child(1)")
    .first();
  if ((await loc.count()) === 0) return null;
  const text = ((await loc.textContent()) ?? "").replace(/,/g, "");
  const m = text.match(/\d+/);
  return m ? Number(m[0]) : null;
}

async function scrapeListing(
  page: Page,
  pageNum: number,
  knownLastPage: number | null,
): Promise<{ summaries: PostSummary[]; lastPage: number | null }> {
  const listingUrl = LISTING_URL(pageNum);
  console.log(`[listing] ${listingUrl}`);
  await page.goto(listingUrl, { waitUntil: "domcontentloaded" });

  if (knownLastPage !== null && pageNum > knownLastPage) {
    console.log(`[listing] page ${pageNum} > last page ${knownLastPage} — skipping`);
    return { summaries: [], lastPage: knownLastPage };
  }

  const rows = page.locator("table.tbl_ua tr:has(td.tit)");
  const count = await rows.count();
  console.log(`[listing] ${count} rows matched`);

  // Derive last page from total record count on the first page only; carry forward.
  let lastPage = knownLastPage;
  if (lastPage === null && pageNum === 1 && count > 0) {
    const total = await readTotalCount(page);
    if (total !== null) {
      lastPage = Math.ceil(total / count);
      console.log(`[listing] total=${total}, per_page=${count}, last_page=${lastPage}`);
    }
  }

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
      listing_date: listingDate,
      views: parseInt10(viewsText),
      recommend: parseInt10(recommendText),
      comment_count: commentCount,
    });
  }

  return { summaries, lastPage };
}

async function scrapePostDetail(
  page: Page,
  url: string,
): Promise<{
  is_blinded: boolean;
  post_body: string;
  listing_datetime: string;
  good_vote: number;
  bad_vote: number;
  comments: PostComment[];
}> {
  console.log(`[detail] ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Blinded (admin-flagged) posts render a placeholder headline in
  // `.board_t h2`: "관리자에 의해서 블라인드된 게시글입니다." — the post body
  // is replaced, so detect it early and short-circuit the other fields.
  const blindHeadline = page.locator(".board_t h2", { hasText: "블라인드" }).first();
  const is_blinded = (await blindHeadline.count()) > 0;

  const body = page.locator(".board_body .container").first();
  const postBody = (await body.count()) > 0 ? ((await body.innerText()) ?? "").trim() : "";

  // `.right_etc div.date` text looks like "2026-04-14 21:49:21 (4일 전) / ".
  const dateLoc = page.locator(".right_etc div.date").first();
  const dateText = (await dateLoc.count()) > 0 ? ((await dateLoc.textContent()) ?? "") : "";
  const listing_datetime = dateText.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] ?? "";

  // Post-level vote element ids are `board_<board>_<postId>_{good,bad}`.
  // Suffixing on `_<postId>_{good|bad}` keeps us off of comment vote nodes,
  // which end in a different numeric segment (the comment id).
  const postId = extractPostId(url);
  const postGoodLoc = postId ? page.locator(`[id$="_${postId}_good"]`).first() : null;
  const postBadLoc = postId ? page.locator(`[id$="_${postId}_bad"]`).first() : null;
  const good_vote =
    postGoodLoc && (await postGoodLoc.count()) > 0
      ? parseInt10((await postGoodLoc.textContent()) ?? "")
      : 0;
  const bad_vote =
    postBadLoc && (await postBadLoc.count()) > 0
      ? parseInt10((await postBadLoc.textContent()) ?? "")
      : 0;

  // Top-level replies carry `normal_reply`; a reply-to-a-reply is
  // `inner_reply` (same <ul>, sibling order preserved). Match both so nested
  // replies land in the comments array right after the parent comment they
  // belong to.
  const commentItems = page.locator(
    "ul#reply_list_layer li.normal_reply, ul#reply_list_layer li.inner_reply",
  );
  const n = await commentItems.count();
  const comments: PostComment[] = [];
  for (let i = 0; i < n; i++) {
    const item = commentItems.nth(i);
    const nickLoc = item.locator("div.nick").first();
    const bodyLoc = item.locator("div.body_wrap").first();
    const nickAnchor = item.locator("div.nick a").first();
    const voteWrap = item.locator("div.vote_wrap").first();
    const goodLoc = voteWrap.locator("[id$='_good']").first();
    const badLoc = voteWrap.locator("[id$='_bad']").first();
    // `span.reply_nick` only appears on inner replies — it names the parent
    // comment's author. Absent on top-level replies, so we default to null.
    const replyNickLoc = item.locator("span.reply_nick").first();

    const nickname =
      (await nickLoc.count()) > 0 ? ((await nickLoc.textContent()) ?? "").trim() : "";
    const commentBody =
      (await bodyLoc.count()) > 0 ? ((await bodyLoc.innerText()) ?? "").trim() : "";
    const userId =
      (await nickAnchor.count()) > 0
        ? extractUserId((await nickAnchor.getAttribute("onclick")) ?? "")
        : "";
    const voteGood =
      (await goodLoc.count()) > 0 ? parseInt10((await goodLoc.textContent()) ?? "") : 0;
    const voteBad = (await badLoc.count()) > 0 ? parseInt10((await badLoc.textContent()) ?? "") : 0;
    const replyNick =
      (await replyNickLoc.count()) > 0
        ? ((await replyNickLoc.textContent()) ?? "").trim() || null
        : null;

    comments.push({
      user_id: userId,
      nickname,
      reply_nick: replyNick,
      comment_body: commentBody,
      vote_good: voteGood,
      vote_bad: voteBad,
    });
  }

  return { is_blinded, post_body: postBody, listing_datetime, good_vote, bad_vote, comments };
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
  knownLastPage: number | null,
): Promise<{ posts: Post[]; lastPage: number | null }> {
  const listPage = await context.newPage();
  let summaries: PostSummary[];
  let lastPage: number | null;
  try {
    ({ summaries, lastPage } = await scrapeListing(listPage, pageNum, knownLastPage));
  } finally {
    await listPage.close();
  }

  if (summaries.length === 0) {
    return { posts: [], lastPage };
  }

  const detailPages = await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, summaries.length) }, () => context.newPage()),
  );

  try {
    const workers = detailPages.map((page) => async (s: PostSummary) => {
      await sleep(jitterMs());
      const detail = await scrapePostDetail(page, s.url);
      return { post_id: extractPostId(s.url), ...s, ...detail } satisfies Post;
    });
    const posts = await mapWithWorkers(summaries, workers);
    return { posts, lastPage };
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
    const now = new Date();
    const dateStr = [
      String(now.getFullYear()).slice(-2),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("_");
    await mkdir(DATA_DIR, { recursive: true });

    let lastPage: number | null = null;
    for (let pageNum = 1; ; pageNum++) {
      const result = await scrapePage(context, pageNum, lastPage);
      if (result.lastPage !== null) lastPage = result.lastPage;
      const { posts } = result;
      if (posts.length === 0) {
        console.log(`[done] page ${pageNum} returned 0 posts — stopping`);
        break;
      }
      const filename = `ygosu__pt__user_${MEMBER_ID}__${pageNum}__${dateStr}.json`;
      const outPath = join(DATA_DIR, filename);
      await writeFile(outPath, JSON.stringify(posts, null, 2), "utf8");
      console.log(`[write] ${posts.length} posts → ${outPath}`);
      if (lastPage !== null && pageNum >= lastPage) {
        console.log(`[done] reached last page ${lastPage} — stopping`);
        break;
      }

      const cool =
        PAGE_COOLDOWN_MIN_MS + Math.random() * (PAGE_COOLDOWN_MAX_MS - PAGE_COOLDOWN_MIN_MS);
      await sleep(cool);
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
