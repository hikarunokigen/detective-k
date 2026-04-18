import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto("https://ygosu.com");
  console.log("title:", await page.title());
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
