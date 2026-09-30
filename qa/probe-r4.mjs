// Round 4: ZIM schedule page + Yang Ming schedule page
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const TARGETS = [
  ['zim-sched', 'https://www.zim.com/tools/schedules', 6000],
  ['yangming-sched', 'https://www.yangming.com/eService/schedules.aspx', 6000],
];
const ctx = await chromium.launchPersistentContext('/Users/russospencer/Documents/trae_projects/ShipScheduleHub/browser-profile', {
  channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 },
  userAgent: UA,
});
try {
  for (const [key, url, wait] of TARGETS) {
    const page = await ctx.newPage();
    try {
      const resp = await page.goto(url, { timeout: 45000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(wait);
      const snap = await page.locator('body').ariaSnapshot().catch(() => 'SNAP-FAIL');
      fs.writeFileSync(`qa/aria4-${key}.txt`, snap);
      console.log(JSON.stringify({ key, url, status: resp?.status(), title: await page.title(), len: snap.length, finalUrl: page.url() }));
    } catch (e) {
      console.log(JSON.stringify({ key, url, error: String(e).slice(0, 140) }));
    }
    await page.close();
    await new Promise(r => setTimeout(r, 3000));
  }
} finally { await ctx.close(); }
