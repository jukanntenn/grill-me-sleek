import { chromium } from '@playwright/test';

const url = process.argv[2];
if (!url) {
  console.error('usage: node probe.mjs <url>');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url);
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(2000);
const testid = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('[data-testid]')).map(e => `[${e.tagName.toLowerCase()}.${e.getAttribute('data-testid')}]`);
});
console.log('testids:', testid);
const html = await page.evaluate(() => document.body.innerHTML.substring(0, 6000));
console.log('body:', html);
await browser.close();
