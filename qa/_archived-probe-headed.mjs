// 有头 + 屏幕外探测：确认 MSC / Maersk / ZIM 的船期页与表单（上一轮全 headless，结论作废）
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const PROFILE = '/Users/russospencer/Documents/trae_projects/ShipScheduleHub/browser-profile';
const TARGETS = process.argv.slice(2).length ? JSON.parse(process.argv[2]) : [
  ['msc-sched', 'https://www.msc.com/en/search-a-schedule'],
  ['maersk-ptp', 'https://www.maersk.com/schedules/pointToPoint'],
  ['zim-sched1', 'https://www.zim.com/tools/shipping-schedules'],
  ['zim-sched2', 'https://www.zim.com/schedules'],
];

const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome',
  headless: false,
  args: ['--window-position=-2400,-2400', '--window-size=1440,900', '--disable-blink-features=AutomationControlled'],
  ignoreDefaultArgs: ['--enable-automation'],
  viewport: null,
});
try {
  for (const [key, url] of TARGETS) {
    const page = await ctx.newPage();
    try {
      const resp = await page.goto(url, { timeout: 45000, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);
      const snap = await page.locator('body').ariaSnapshot().catch(() => 'SNAP-FAIL');
      fs.writeFileSync(`qa/h-${key}.txt`, snap);
      const info = await page.evaluate(() => ({
        inputs: [...document.querySelectorAll('input')].slice(0, 25).map((el) => ({
          name: el.name, id: el.id, ph: el.placeholder, type: el.type, vis: !!(el.offsetWidth || el.offsetHeight),
        })),
        buttons: [...document.querySelectorAll('button')].slice(0, 25).map((el) => (el.innerText || '').trim().slice(0, 40)),
      }));
      console.log(JSON.stringify({ key, status: resp?.status(), title: await page.title(), snapLen: snap.length, finalUrl: page.url(), ...info }));
    } catch (e) {
      console.log(JSON.stringify({ key, error: String(e).slice(0, 160) }));
    }
    await page.close();
    await new Promise((r) => setTimeout(r, 2500));
  }
} finally { await ctx.close(); }
