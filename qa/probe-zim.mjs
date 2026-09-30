// ZIM：深路径 /schedules 与 /tools/shipping-schedules 有头也 403；试从首页点进 Schedules
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const PROFILE = '/Users/russospencer/Documents/trae_projects/ShipScheduleHub/browser-profile';
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome', headless: true, args: ['--headless=new','--disable-blink-features=AutomationControlled'], ignoreDefaultArgs: ['--enable-automation'], userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', viewport: {width:1440,height:900},
  args: ['--window-position=-2400,-2400', '--window-size=1440,900', '--disable-blink-features=AutomationControlled'],
  ignoreDefaultArgs: ['--enable-automation'],
});
const log = (o) => console.log(JSON.stringify(o));
try {
  const page = await ctx.newPage();
  const resp = await page.goto('https://www.zim.com/', { timeout: 45000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  log({ step: 'home', status: resp?.status(), title: await page.title() });
  // cookie: I Agree
  for (const re of [/^\s*i agree\s*$/i, /accept all/i, /^\s*agree\s*$/i]) {
    const b = page.getByRole('button', { name: re }).first();
    if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(600); log({ cookie: String(re) }); break; }
  }
  // 点 Schedules tab
  const tab = page.getByRole('tab', { name: /schedules/i }).first();
  const hasTab = await tab.isVisible().catch(() => false);
  log({ schedulesTab: hasTab });
  if (hasTab) {
    await tab.click().catch(() => {});
    await page.waitForTimeout(5000);
    log({ afterTabUrl: page.url(), title: await page.title() });
    const snap = await page.locator('body').ariaSnapshot().catch(() => 'FAIL');
    fs.writeFileSync('qa/h-zim-tab.txt', snap);
    const info = await page.evaluate(() => ({
      inputs: [...document.querySelectorAll('input')].slice(0, 20).map((el) => ({ id: el.id, name: el.name, ph: el.placeholder, vis: !!(el.offsetWidth || el.offsetHeight) })),
      buttons: [...document.querySelectorAll('button')].slice(0, 30).map((el) => (el.innerText || '').trim().slice(0, 30)).filter(Boolean),
      selects: [...document.querySelectorAll('select')].map((el) => el.id || el.name),
    }));
    log({ snapLen: snap.length, ...info });
  }
} finally { await ctx.close(); }
