import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type Page } from "playwright";
import type { Comment } from "ygosu_types";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = join(REPO_ROOT, "data", "yg_comment");

const MEMBER_ID = "684134";

const PAGE_COOLDOWN_MIN_MS = 2000;
const PAGE_COOLDOWN_MAX_MS = 4000;

// For per-post nickname fetches.
const NICK_CONCURRENCY = 3;
const NICK_JITTER_MIN_MS = 600;
const NICK_JITTER_MAX_MS = 1800;

// Cache of nicknames per post so we don't re-fetch a post once we've seen it.
// Key: `<board_id>/<post_id>` → map of comment_id → nickname.
const nicknameCache = new Map<string, Map<string, string>>();

const LISTING_URL = (page: number) =>
  `https://ygosu.com/minilog/?m2=article&m3=comment&member=${MEMBER_ID}&search=&page=${page}`;

function absolutize(href: string): string {
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `https://ygosu.com${href}`;
  return href;
}

function extractPostId(url: string): string {
  // /board/pan_monstarz/1290400/?comment_idx=2755303  →  "1290400"
  return url.match(/\/board\/[^/]+\/(\d+)/)?.[1] ?? "";
}

function extractCommentId(url: string): string {
  // /board/pan_monstarz/1290400/?comment_idx=2755303  →  "2755303"
  return url.match(/[?&]comment_idx=(\d+)/)?.[1] ?? "";
}

function extractBoardId(url: string): string {
  // /board/pan_monstarz/1290400/?comment_idx=2755303  →  "pan_monstarz"
  return url.match(/\/board\/([^/?#]+)/)?.[1] ?? "";
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const nickJitterMs = () =>
  NICK_JITTER_MIN_MS + Math.random() * (NICK_JITTER_MAX_MS - NICK_JITTER_MIN_MS);

async function readTotalCount(page: Page): Promise<number | null> {
  // The pagination strip's `b.last` only advances one window at a time
  // (e.g. stops at 10 even when 11+ pages exist), so we derive the real
  // last page from the total count advertised on the profile header.
  const loc = page.locator(".det_myboard > h3:nth-child(1) > i:nth-child(3)").first();
  if ((await loc.count()) === 0) return null;
  const text = ((await loc.textContent()) ?? "").replace(/,/g, "");
  const m = text.match(/\d+/);
  return m ? Number(m[0]) : null;
}

async function scrapeCommentListing(
  page: Page,
  pageNum: number,
  knownLastPage: number | null,
): Promise<{ comments: Comment[]; lastPage: number | null }> {
  const url = LISTING_URL(pageNum);
  console.log(`[listing] ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });

  if (knownLastPage !== null && pageNum > knownLastPage) {
    console.log(`[listing] page ${pageNum} > last page ${knownLastPage} — skipping`);
    return { comments: [], lastPage: knownLastPage };
  }

  const boxes = page.locator("div.mrbox");
  const count = await boxes.count();
  console.log(`[listing] ${count} comment boxes matched`);

  // Derive last page from total count on the first page only; carry forward.
  let lastPage = knownLastPage;
  if (lastPage === null && pageNum === 1 && count > 0) {
    const total = await readTotalCount(page);
    if (total !== null) {
      lastPage = Math.ceil(total / count);
      console.log(`[listing] total=${total}, per_page=${count}, last_page=${lastPage}`);
    }
  }

  const comments: Comment[] = [];
  for (let i = 0; i < count; i++) {
    const box = boxes.nth(i);

    // Anatomy (per COMMENT.md + real page):
    //   div.mrbox
    //     > div:nth-child(1)            ← header
    //         > h5 > a:nth-child(1)     ← board link
    //         > h5 > a:nth-child(2)     ← post link
    //         > p:nth-child(2)          ← datetime
    //     > div.desc                    ← comment body (as innerText)
    //         > span (with "추천 N 비추 M")  ← vote counts
    const header = box.locator(":scope > div").nth(0);
    const desc = box.locator("div.desc").first();

    const boardAnchor = header.locator("h5 a").nth(0);
    const postAnchor = header.locator("h5 a").nth(1);
    const dateP = header.locator("p").nth(0);

    const boardName =
      (await boardAnchor.count()) > 0 ? ((await boardAnchor.textContent()) ?? "").trim() : "";
    const postTitle =
      (await postAnchor.count()) > 0 ? ((await postAnchor.textContent()) ?? "").trim() : "";
    const postHref =
      (await postAnchor.count()) > 0 ? ((await postAnchor.getAttribute("href")) ?? "") : "";
    const postUrl = absolutize(postHref);
    const postId = extractPostId(postUrl);
    const commentId = extractCommentId(postUrl);
    const boardId = extractBoardId(postUrl);

    const rawDate = (await dateP.count()) > 0 ? ((await dateP.textContent()) ?? "").trim() : "";
    const commentDatetime = rawDate.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] ?? "";

    // Vote span lives inside div.desc and is labelled "추천 N 비추 M" (any
    // separator, any whitespace). Pick it by text match so we don't depend
    // on its positional index among siblings.
    const voteSpan = desc.locator("span", { hasText: "추천" }).first();
    const voteText =
      (await voteSpan.count()) > 0 ? ((await voteSpan.textContent()) ?? "").trim() : "";
    const voteGood = Number(voteText.match(/추천[^\d-]*(-?\d+)/)?.[1] ?? 0);
    const voteBad = Number(voteText.match(/비추[^\d-]*(-?\d+)/)?.[1] ?? 0);

    // Body: innerText of div.desc minus the vote span text (which is the
    // only non-body node inside desc).
    const descText = (await desc.count()) > 0 ? ((await desc.innerText()) ?? "") : "";
    const commentBody = (voteText ? descText.replace(voteText, "") : descText).trim();

    comments.push({
      post_id: postId,
      post_title: postTitle,
      comment_id: commentId,
      comment_body: commentBody,
      comment_datetime: commentDatetime,
      nickname: "", // filled in by enrichWithNicknames after all listing rows are collected
      board_id: boardId,
      board_name: boardName,
      vote_good: voteGood,
      vote_bad: voteBad,
    });
  }

  return { comments, lastPage };
}

/**
 * Visit a post page once and extract every comment's nickname, keyed by
 * comment id. Result is cached so repeat comments on the same post are free.
 *
 * Comment items carry `div.body_wrap > div[id^="reply_body_"]` with an id
 * shaped like `reply_body_<board>_<commentId>`. Walking from that id up to
 * the enclosing `li.normal_reply` / `li.inner_reply` gives us the comment
 * row, and `div.nick` within it holds the nickname anchor.
 */
async function fetchNicknamesForPost(
  page: Page,
  boardId: string,
  postId: string,
): Promise<Map<string, string>> {
  const postKey = `${boardId}/${postId}`;
  const cached = nicknameCache.get(postKey);
  if (cached) return cached;

  const url = `https://ygosu.com/board/${boardId}/${postId}`;
  console.log(`[nick] ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const items = page.locator(
    "ul#reply_list_layer li.normal_reply, ul#reply_list_layer li.inner_reply",
  );
  const n = await items.count();
  const result = new Map<string, string>();
  for (let i = 0; i < n; i++) {
    const item = items.nth(i);
    const bodyLoc = item.locator("div[id^='reply_body_']").first();
    if ((await bodyLoc.count()) === 0) continue;
    const id = (await bodyLoc.getAttribute("id")) ?? "";
    const commentId = id.match(/_(\d+)$/)?.[1];
    if (!commentId) continue;
    const nickLoc = item.locator("div.nick").first();
    const nickname =
      (await nickLoc.count()) > 0 ? ((await nickLoc.textContent()) ?? "").trim() : "";
    result.set(commentId, nickname);
  }

  nicknameCache.set(postKey, result);
  return result;
}

async function enrichWithNicknames(
  context: BrowserContext,
  comments: Comment[],
): Promise<void> {
  // Deduplicate target posts; respect the module cache so pages already
  // visited in earlier iterations (different listing page, same post) are
  // free.
  const targets: Array<{ boardId: string; postId: string }> = [];
  const seen = new Set<string>();
  for (const c of comments) {
    if (!c.board_id || !c.post_id) continue;
    const key = `${c.board_id}/${c.post_id}`;
    if (seen.has(key) || nicknameCache.has(key)) continue;
    seen.add(key);
    targets.push({ boardId: c.board_id, postId: c.post_id });
  }

  if (targets.length > 0) {
    const poolSize = Math.min(NICK_CONCURRENCY, targets.length);
    const pool = await Promise.all(
      Array.from({ length: poolSize }, () => context.newPage()),
    );
    try {
      let cursor = 0;
      await Promise.all(
        pool.map(async (page) => {
          while (true) {
            const i = cursor++;
            if (i >= targets.length) return;
            const { boardId, postId } = targets[i]!;
            await sleep(nickJitterMs());
            await fetchNicknamesForPost(page, boardId, postId);
          }
        }),
      );
    } finally {
      await Promise.all(pool.map((p) => p.close()));
    }
  }

  // Backfill nicknames onto the comments.
  for (const c of comments) {
    if (!c.board_id || !c.post_id) continue;
    const postKey = `${c.board_id}/${c.post_id}`;
    const nickMap = nicknameCache.get(postKey);
    c.nickname = nickMap?.get(c.comment_id) ?? "";
  }
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
    const now = new Date();
    const dateStr = [
      String(now.getFullYear()).slice(-2),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("_");
    await mkdir(DATA_DIR, { recursive: true });

    let lastPage: number | null = null;
    for (let pageNum = 1; ; pageNum++) {
      const result = await scrapeCommentListing(page, pageNum, lastPage);
      if (result.lastPage !== null) lastPage = result.lastPage;
      const { comments } = result;
      if (comments.length === 0) {
        console.log(`[done] page ${pageNum} returned 0 comments — stopping`);
        break;
      }

      await enrichWithNicknames(context, comments);

      const filename = `ygosu__cmt__user_${MEMBER_ID}__${pageNum}__${dateStr}.json`;
      const outPath = join(DATA_DIR, filename);
      await writeFile(outPath, JSON.stringify(comments, null, 2), "utf8");
      console.log(`[write] ${comments.length} comments → ${outPath}`);

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
