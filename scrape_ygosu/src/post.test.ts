import { chromium, type Page } from "playwright";

const DEFAULT_URL = "https://ygosu.com/board/pan_monstarz/1269094";

const CANDIDATE_SELECTORS = [
  "ul#reply_list_layer li.normal_reply",
  "ul#reply_list_layer li[id='normal_reply']",
  "ul#reply_list_layer > li",
  "ul#reply_list_layer li",
  "#reply_list_layer li",
  ".reply_list li",
  ".comment_list li",
];

async function inspect(page: Page, label: string): Promise<void> {
  console.log(`\n--- ${label} ---`);
  console.log(`  final URL: ${page.url()}`);
  console.log(`  title:     ${await page.title()}`);

  const frames = page.frames();
  console.log(`  frames:    ${frames.length}`);
  for (const f of frames) {
    if (f === page.mainFrame()) continue;
    console.log(`    child frame → ${f.url()}`);
  }

  const ul = page.locator("ul#reply_list_layer").first();
  const ulCount = await ul.count();
  console.log(`  ul#reply_list_layer count: ${ulCount}`);
  if (ulCount > 0) {
    console.log(`  ul visible: ${await ul.isVisible()}`);
    const html = (await ul.innerHTML()).replace(/\s+/g, " ").slice(0, 600);
    console.log(`  ul innerHTML[0..600]: ${html}`);
  }

  for (const sel of CANDIDATE_SELECTORS) {
    const n = await page.locator(sel).count();
    console.log(`  ${sel.padEnd(48)} → ${n}`);
  }

  const primary = page.locator("ul#reply_list_layer li.normal_reply");
  const primaryCount = await primary.count();
  if (primaryCount === 0) {
    console.log(`  (no items at primary selector)`);
    return;
  }

  for (let i = 0; i < primaryCount; i++) {
    const item = primary.nth(i);
    const nick = ((await item.locator("div.nick").first().textContent()) ?? "").trim();
    const body = ((await item.locator("div.body_wrap").first().innerText()) ?? "").trim();
    console.log(`  [${i}] nick: ${JSON.stringify(nick)}`);
    console.log(`  [${i}] body: ${JSON.stringify(body)}`);
  }

  const first = primary.first();
  const inner = (await first.innerHTML()).replace(/\s+/g, " ").slice(0, 800);
  console.log(`  sample[0].innerHTML[0..800]: ${inner}`);
}

async function main() {
  const url = process.argv[2] ?? DEFAULT_URL;
  console.log(`[test-comments] target: ${url}`);

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

    try {
      await page.waitForSelector("ul#reply_list_layer li.normal_reply", { timeout: 5000 });
      console.log("\n  primary selector appeared within 5s");
    } catch {
      console.log("\n  primary selector did NOT appear within 5s");
    }
    await inspect(page, "phase 3: after selector wait");
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
