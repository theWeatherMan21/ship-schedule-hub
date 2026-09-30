// Round 6: probe Yang Ming real schedule page
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const ctx = await chromium.launchPersistentContext('/Users/russospencer/Documents/trae_projects/ShipScheduleHub/browser-profile', {
  channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 },
  userAgent: UA,
});
try {
  const page = await ctx.newPage();
  const resp = await page.goto('https://www.yangming.com/esolution/schedule/overview&lang=en-us', { timeout: 45000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  const snap = await page.locator('body').ariaSnapshot().catch(() => 'SNAP-FAIL');
  fs.writeFileSync('qa/aria6-yangming-sched.txt', snap);
  console.log(JSON.stringify({ status: resp?.status(), title: await page.title(), len: snap.length, finalUrl: page.url() }));
  await page.close();
} finally { await ctx.close(); }
