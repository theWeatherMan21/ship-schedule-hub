// Probe candidate schedule URLs for COSCO & ONE
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const CANDIDATES = [
  ['cosco-1', 'https://elines.coscoshipping.com/ebusiness/sailingSchedule'],
  ['one-1', 'https://ecomm.one-line.com/one-ecom/manage/notLoginScheduleSearch'],
  ['one-2', 'https://www.one-line.com/en/schedule/'],
];

const ctx = await chromium.launchPersistentContext('/Users/russospencer/Documents/trae_projects/ShipScheduleHub/browser-profile', {
  channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 },
});
try {
  for (const [key, url] of CANDIDATES) {
    const page = await ctx.newPage();
    try {
      const resp = await page.goto(url, { timeout: 45000, waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
      await page.waitForTimeout(4000);
      const snap = await page.locator('body').ariaSnapshot().catch(() => 'SNAP-FAIL');
      fs.writeFileSync(`qa/aria-${key}.txt`, snap);
      console.log(JSON.stringify({ key, url, status: resp?.status(), title: await page.title(), len: snap.length }));
    } catch (e) {
      console.log(JSON.stringify({ key, url, error: String(e).slice(0, 140) }));
    }
    await page.close();
    await new Promise(r => setTimeout(r, 3000));
  }
} finally { await ctx.close(); }
