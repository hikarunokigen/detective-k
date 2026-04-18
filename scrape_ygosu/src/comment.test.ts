import { chromium, type Locator, type Page } from "playwright";

const DEFAULT_URL =
  "https://ygosu.com/minilog/?m2=article&m3=comment&member=684134&search=&page=1";

// Candidate selectors for the comment body — COMMENT.md doesn't pin one, so
// we probe several and let the output tell us which matches reality.
const BODY_CANDIDATES = [
  "div.mrbox div.content",
  "div.mrbox p.content",
  "div.mrbox .comment_content",
  "div.mrbox .comment_body",
  "div.mrbox p:nth-child(3)",
  "div.mrbox p.body",
  "div.mrbox > div:nth-child(1) > p:nth-of-type(2)",
  "div.mrbox > div:nth-child(2) span:nth-child(1)",
  "div.mrbox > div:nth-child(2) span:nth-child(2)",
];

async function textOr(loc: Locator, missing: string): Promise<string> {
  if ((await loc.count()) === 0) return missing;
  return ((await loc.textContent()) ?? "").trim();
}

async function inspect(page: Page, label: string): Promise<void> {
  console.log(`\n--- ${label} ---`);
  console.log(`  final URL: ${page.url()}`);
  console.log(`  title:     ${await page.title()}`);

  const boxes = page.locator("div.mrbox");
  const boxCount = await boxes.count();
  console.log(`  div.mrbox count: ${boxCount}`);
  if (boxCount === 0) return;

  // Matrix over the first two boxes so we can spot per-row variance.
  const sampleN = Math.min(2, boxCount);
  for (let i = 0; i < sampleN; i++) {
    const box = boxes.nth(i);
    console.log(`\n  === mrbox[${i}] ===`);

    const header = box.locator(":scope > div").nth(0);
    const tail = box.locator(":scope > div").nth(1);

    const board = await textOr(header.locator("h5 a").nth(0), "(missing)");
    const postTitle = await textOr(header.locator("h5 a").nth(1), "(missing)");
    const postHref =
      (await header.locator("h5 a").nth(1).count()) > 0
        ? ((await header.locator("h5 a").nth(1).getAttribute("href")) ?? "")
        : "(missing)";
    const dateText = await textOr(header.locator("p").nth(0), "(missing)");
    const voteText = await textOr(tail.locator("span").nth(2), "(missing)");

    console.log(`    board:      ${JSON.stringify(board)}`);
    console.log(`    post href:  ${JSON.stringify(postHref)}`);
    console.log(`    post title: ${JSON.stringify(postTitle)}`);
    console.log(`    date:       ${JSON.stringify(dateText)}`);
    console.log(`    vote span:  ${JSON.stringify(voteText)}`);

    console.log(`\n    -- header innerText --`);
    const headerInner = ((await header.innerText()) ?? "").trim();
    console.log(
      headerInner
        .split("\n")
        .map((l) => `      ${JSON.stringify(l)}`)
        .join("\n"),
    );

    console.log(`\n    -- body selector probe --`);
    for (const sel of BODY_CANDIDATES) {
      // Scope to this specific box via nth — Playwright doesn't support
      // passing a selector that references a parent, so we rebuild per box.
      const scoped = box.locator(sel.replace(/^div\.mrbox\s*/, "").trim() || sel);
      const n = await scoped.count();
      if (n === 0) {
        console.log(`      ${sel.padEnd(56)} → 0`);
        continue;
      }
      const t = ((await scoped.first().innerText()) ?? "").trim().replace(/\s+/g, " ");
      console.log(`      ${sel.padEnd(56)} → ${n}  ${JSON.stringify(t.slice(0, 80))}`);
    }

    console.log(`\n    -- box innerHTML[0..1200] --`);
    const html = (await box.innerHTML()).replace(/\s+/g, " ").slice(0, 1200);
    console.log(`      ${html}`);
  }
}

async function main() {
  const url = process.argv[2] ?? DEFAULT_URL;
  console.log(`[test-comment-listing] target: ${url}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
    locale: "ko-KR",
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await inspect(page, "phase 1: domcontentloaded");

    await page.waitForLoadState("networkidle").catch(() => {});
    await inspect(page, "phase 2: networkidle");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
