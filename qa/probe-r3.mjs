// Round 3: ONE real path, Hapag (wait CF), CMA retry, HMM/ZIM UA-masked
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const TARGETS = [
  ['one', 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule', 5000],
  ['hapag', 'https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html', 20000],
  ['cma-retry', 'https://www.cma-cgm.com/ebusiness/schedules', 12000],
  ['hmm', 'https://www.hmm21.com/', 8000],
  ['zim', 'https://www.zim.com/', 8000],
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
      const title = await page.title();
      // CF challenge retry loop: reload up to 2x if still "Just a moment"
      let snap = await page.locator('body').ariaSnapshot().catch(() => 'SNAP-FAIL');
      if (/just a moment/i.test(title)) {
        await page.reload({ timeout: 45000, waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(10000);
        snap = await page.locator('body').ariaSnapshot().catch(() => 'SNAP-FAIL');
      }
      fs.writeFileSync(`qa/aria3-${key}.txt`, snap);
      console.log(JSON.stringify({ key, url, status: resp?.status(), title, len: snap.length, finalUrl: page.url() }));
    } catch (e) {
      console.log(JSON.stringify({ key, url, error: String(e).slice(0, 140) }));
    }
    await page.close();
    await new Promise(r => setTimeout(r, 3000));
  }
} finally { await ctx.close(); }
