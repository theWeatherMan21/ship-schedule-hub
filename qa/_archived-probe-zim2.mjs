// ⚠️ 10-09 爹地红线：探针不得弹窗。需要真指纹破反爬时，请照 qa/headed-minimized-probe.mjs
//   那套做（headless:false + CDP Browser.setWindowBounds 最小化 + 回读 AXMinimized 验证）。
// ZIM：首页 200 但 Schedules 一跳就 403 —— 枚举真实船期 URL，并试 URL 变体
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';

const PROFILE = '/Users/russospencer/Documents/trae_projects/ShipScheduleHub/browser-profile';
const log = (o) => console.log(JSON.stringify(o));
const ctx = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome', headless: true, viewport: null,
  args: ['--window-position=-2400,-2400', '--window-size=1440,900', '--disable-blink-features=AutomationControlled'],
  ignoreDefaultArgs: ['--enable-automation'],
});
try {
  const page = await ctx.newPage();
  const nav = [];
  page.on('request', (r) => { if (/schedul/i.test(r.url())) nav.push(r.url()); });
  await page.goto('https://www.zim.com/', { timeout: 45000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a')].map((a) => ({ t: (a.innerText || '').trim().slice(0, 30), href: a.href })).filter((x) => /schedul/i.test(x.href) || /schedul/i.test(x.t)));
  log({ links: links.slice(0, 20) });
  // 点 Schedules tab，抓导航目标
  const tab = page.getByRole('tab', { name: /schedules/i }).first();
  await tab.click().catch((e) => log({ clickErr: String(e).slice(0, 100) }));
  await page.waitForTimeout(6000);
  log({ requestedScheduleUrls: [...new Set(nav)].slice(0, 10), finalUrl: page.url(), title: await page.title() });
  // URL 变体直接试
  for (const u of ['https://www.zim.com/tools/schedules', 'https://www.zim.com/shipping-schedules', 'https://www.zim.com/tools/my-schedules']) {
    const r = await page.goto(u, { timeout: 30000, waitUntil: 'domcontentloaded' }).catch((e) => ({ status: () => 'ERR ' + String(e).slice(0, 60) }));
    await page.waitForTimeout(2500);
    log({ variant: u, status: typeof r.status === 'function' ? r.status() : r.status, title: await page.title() });
  }
} finally { await ctx.close(); }
