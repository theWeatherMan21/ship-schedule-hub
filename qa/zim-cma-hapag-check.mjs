// 一次性确认：CMA / Hapag 无头下当前状态（新 profile 履历已积累数轮）
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { isBlockPage, dismissCookies, waitThroughChallenge } from '../engine/lib/utils.mjs';
function log(s) { console.log(`[${new Date().toISOString().slice(11,19)}] ${s}`); }
const TARGETS = [
  ['CMA', 'https://www.cma-cgm.com/ebusiness/schedules'],
  ['Hapag', 'https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html'],
];
const ctx = await launch({});
await quietWindow(ctx, 'minimized').catch(() => {});
for (const [name, url] of TARGETS) {
  const page = await ctx.newPage();
  const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => { log(`${name} ERR ` + String(e).slice(0,80)); return null; });
  await sleep(5000);
  const title = await page.title().catch(() => '');
  const bodyLen = await page.evaluate(() => document.body?.innerText?.length || 0).catch(() => 0);
  const blocked = await isBlockPage(page);
  log(`${name}: HTTP ${r?.status() ?? 'ERR'} | title="${title.slice(0,50)}" | body=${bodyLen} | blocked=${blocked}`);
  if (blocked) { const ok = await waitThroughChallenge(page, 12000); log(`${name}: waitChallenge=${ok}`); }
  if (name === 'CMA' && !blocked) {
    await dismissCookies(page).catch(() => {});
    await sleep(1500);
    const snap = await page.locator('body').ariaSnapshot().catch(() => '');
    log('CMA 表单元素: ' + snap.split('\n').filter(l => /textbox|combobox|search|button/i.test(l)).slice(0, 10).join(' | ').slice(0, 500));
  }
  await page.close().catch(() => {});
  await sleep(3000);
}
await ctx.close().catch(() => {});
process.exit(0);
