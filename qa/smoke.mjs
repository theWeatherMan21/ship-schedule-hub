// Smoke: verify playwright-core + system Chrome channel launches headless
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';

const ctx = await chromium.launchPersistentContext('/Users/russospencer/Documents/trae_projects/ShipScheduleHub/browser-profile', {
  channel: 'chrome',
  headless: true,
  viewport: { width: 1366, height: 900 },
});
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('https://example.com', { timeout: 20000, waitUntil: 'domcontentloaded' });
const title = await page.title();
console.log(JSON.stringify({ ok: true, title, ua: await page.evaluate(() => navigator.userAgent) }));
await ctx.close();
