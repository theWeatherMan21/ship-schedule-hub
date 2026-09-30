// Round 7: YM esolution with correct query format + Evergreen advanced page
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';
const TARGETS = [
  ['ym2', 'https://www.yangming.com/esolution/schedule/overview?lang=en-us'],
  ['eg-adv', 'https://www.shipmentlink.com/tvs2/jsp/TVS2_InteractiveSchedule.jsp'],
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
      await page.waitForTimeout(5000);
      const snap = await page.locator('body').ariaSnapshot().catch(() => 'SNAP-FAIL');
      fs.writeFileSync(`qa/aria7-${key}.txt`, snap);
      console.log(JSON.stringify({ key, status: resp?.status(), title: await page.title(), len: snap.length, finalUrl: page.url() }));
    } catch (e) {
      console.log(JSON.stringify({ key, error: String(e).slice(0, 140) }));
    }
    await page.close();
    await new Promise(r => setTimeout(r, 2500));
  }
} finally { await ctx.close(); }
