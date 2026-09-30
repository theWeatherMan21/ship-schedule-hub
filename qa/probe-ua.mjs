// Try UA-masked headless access to bot-walled carriers + find ONE real entry
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const TARGETS = [
  ['cma', 'https://www.cma-cgm.com/ebusiness/schedules'],
  ['msc', 'https://www.msc.com/en/schedules'],
  ['one-home', 'https://www.one-line.com/'],
];
const ctx = await chromium.launchPersistentContext('/Users/russospencer/Documents/trae_projects/ShipScheduleHub/browser-profile', {
  channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 },
  userAgent: UA,
});
try {
  for (const [key, url] of TARGETS) {
    const page = await ctx.newPage();
    try {
      const resp = await page.goto(url, { timeout: 45000, waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(5000);
      const snap = await page.locator('body').ariaSnapshot().catch(() => 'SNAP-FAIL');
      fs.writeFileSync(`qa/aria2-${key}.txt`, snap);
      console.log(JSON.stringify({ key, url, status: resp?.status(), title: await page.title(), len: snap.length }));
    } catch (e) {
      console.log(JSON.stringify({ key, url, error: String(e).slice(0, 140) }));
    }
    await page.close();
    await new Promise(r => setTimeout(r, 3000));
  }
} finally { await ctx.close(); }
