// Batch ARIA probe all carriers sequentially (rate-limited), save snapshots to qa/
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const CARRIERS = [
  ['cma', 'https://www.cma-cgm.com/ebusiness/schedules'],
  ['cosco', 'https://elines.coscoshipping.com/'],
  ['hapag', 'https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html'],
  ['one', 'https://ecomm.one-line.com/one-ecom/schedule'],
  ['evergreen', 'https://www.shipmentlink.com/'],
  ['yangming', 'https://www.yangming.com/'],
  ['hmm', 'https://www.hmm21.com/'],
  ['zim', 'https://www.zim.com/'],
  ['msc', 'https://www.msc.com/en/schedules'],
];

const ctx = await chromium.launchPersistentContext('/Users/russospencer/Documents/trae_projects/ShipScheduleHub/browser-profile', {
  channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 },
});
const results = [];
try {
  for (const [key, url] of CARRIERS) {
    const page = await ctx.newPage();
    let entry = { key, url };
    try {
      const resp = await page.goto(url, { timeout: 45000, waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(5000);
      const snap = await page.locator('body').ariaSnapshot().catch(e => 'SNAP-FAIL: ' + e.message);
      fs.writeFileSync(`qa/aria-${key}.txt`, snap);
      const title = await page.title();
      entry = { ...entry, status: resp?.status(), title, snapLen: snap.length };
      console.log(JSON.stringify(entry));
    } catch (e) {
      entry = { ...entry, error: String(e).slice(0, 160) };
      console.log(JSON.stringify(entry));
    }
    await page.close();
    await new Promise(r => setTimeout(r, 3000));
  }
} finally { await ctx.close(); }
fs.writeFileSync('qa/batch-probe-summary.json', JSON.stringify(results, null, 1));
