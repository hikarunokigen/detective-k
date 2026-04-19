import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import type { Comment } from "ygosu_types";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = join(REPO_ROOT, "data", "yg_comment");

const MEMBER_ID = "684134";

const PAGE_COOLDOWN_MIN_MS = 2000;
const PAGE_COOLDOWN_MAX_MS = 4000;

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
      board_id: boardId,
      board_name: boardName,
      vote_good: voteGood,
      vote_bad: voteBad,
    });
  }

  return { comments, lastPage };
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
