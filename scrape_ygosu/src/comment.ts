import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = join(REPO_ROOT, "data", "yg_comment");

const MEMBER_ID = "684134";

const PAGE_COOLDOWN_MIN_MS = 2000;
const PAGE_COOLDOWN_MAX_MS = 4000;

const LISTING_URL = (page: number) =>
  `https://ygosu.com/minilog/?m2=article&m3=comment&member=${MEMBER_ID}&search=&page=${page}`;

interface Comment {
  post_id: string;
  post_title: string;
  comment_body: string;
  comment_datetime: string;
  vote_good: number;
  vote_bad: number;
}

function absolutize(href: string): string {
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `https://ygosu.com${href}`;
  return href;
}

function extractPostId(url: string): string {
  // /board/pan_monstarz/1290400/?comment_idx=2755303  →  "1290400"
  return url.match(/\/board\/[^/]+\/(\d+)/)?.[1] ?? "";
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function readLastPage(page: Page): Promise<number | null> {
  const lastEl = page.locator("b.last").first();
  if ((await lastEl.count()) === 0) return null;

  const text = ((await lastEl.textContent()) ?? "").trim();
  const textNum = text.match(/\d+/)?.[0];
  if (textNum) return Number(textNum);

  const anchor = page.locator("a:has(b.last)").first();
  if ((await anchor.count()) === 0) return null;
  const href = (await anchor.getAttribute("href")) ?? "";
  const onclick = (await anchor.getAttribute("onclick")) ?? "";
  const fromHref = href.match(/[?&]page=(\d+)/)?.[1];
  if (fromHref) return Number(fromHref);
  const fromOnclick = onclick.match(/(\d+)/)?.[1];
  return fromOnclick ? Number(fromOnclick) : null;
}

async function scrapeCommentListing(
  page: Page,
  pageNum: number,
): Promise<{ comments: Comment[]; lastPage: number | null }> {
  const url = LISTING_URL(pageNum);
  console.log(`[listing] ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });

  const lastPage = await readLastPage(page);
  if (lastPage !== null && pageNum > lastPage) {
    console.log(`[listing] page ${pageNum} > last page ${lastPage} — skipping`);
    return { comments: [], lastPage };
  }

  const boxes = page.locator("div.mrbox");
  const count = await boxes.count();
  console.log(`[listing] ${count} comment boxes matched`);

  const comments: Comment[] = [];
  for (let i = 0; i < count; i++) {
    const box = boxes.nth(i);

    // COMMENT.md anatomy:
    //   div.mrbox
    //     > div:nth-child(1)            ← header (div.title)
    //         > h5 > a:nth-child(1)     ← board link
    //         > h5 > a:nth-child(2)     ← post link
    //         > p:nth-child(2)          ← datetime
    //         (body lives somewhere in the box; selector not in the spec)
    //     > div:nth-child(2)
    //         > span:nth-child(3)       ← "good | bad" vote counts
    const header = box.locator(":scope > div").nth(0);
    const tail = box.locator(":scope > div").nth(1);

    const boardAnchor = header.locator("h5 a").nth(0);
    const postAnchor = header.locator("h5 a").nth(1);
    const dateP = header.locator("p").nth(0);
    const voteSpan = tail.locator("span").nth(2);

    const postTitle =
      (await postAnchor.count()) > 0 ? ((await postAnchor.textContent()) ?? "").trim() : "";
    const postHref =
      (await postAnchor.count()) > 0 ? ((await postAnchor.getAttribute("href")) ?? "") : "";
    const postUrl = absolutize(postHref);
    const postId = extractPostId(postUrl);

    const boardText =
      (await boardAnchor.count()) > 0 ? ((await boardAnchor.textContent()) ?? "").trim() : "";

    const rawDate = (await dateP.count()) > 0 ? ((await dateP.textContent()) ?? "").trim() : "";
    const commentDatetime = rawDate.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] ?? "";

    // Body: COMMENT.md doesn't pin a selector for the comment body. As a
    // first cut, take the header's full text and strip the parts we already
    // identified (board, post title, datetime). Refine once we see real
    // output — the body probably has its own class worth targeting.
    const headerInner =
      (await header.count()) > 0 ? ((await header.innerText()) ?? "").trim() : "";
    let commentBody = headerInner;
    for (const piece of [boardText, postTitle, rawDate]) {
      if (piece) commentBody = commentBody.split(piece).join("");
    }
    commentBody = commentBody.replace(/\n{3,}/g, "\n\n").trim();

    const voteText =
      (await voteSpan.count()) > 0 ? ((await voteSpan.textContent()) ?? "").trim() : "";
    const voteNums = [...voteText.matchAll(/\d+/g)].map((m) => Number(m[0]));
    const voteGood = voteNums[0] ?? 0;
    const voteBad = voteNums[1] ?? 0;

    comments.push({
      post_id: postId,
      post_title: postTitle,
      comment_body: commentBody,
      comment_datetime: commentDatetime,
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

    for (let pageNum = 1; ; pageNum++) {
      const { comments, lastPage } = await scrapeCommentListing(page, pageNum);
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
