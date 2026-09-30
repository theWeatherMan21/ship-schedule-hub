// COSCO 表单交互细节：打字后 input 值、候选容器、是否需要 blur/点候选
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await sleep(4000); await dismissCookies(page).catch(()=>{}); await sleep(1000);
// 位置 modal
const modal = page.locator('.ivu-modal-wrap, .ivu-modal').first();
if (await modal.isVisible({ timeout: 3000 }).catch(() => false)) {
  console.log('modal up');
  await page.getByRole('button', { name: /confirm/i }).first().click({ timeout: 3000 }).catch(()=>{});
  await sleep(1500);
}
const o = page.getByRole('textbox', { name: /origin city/i }).first();
await o.click(); await sleep(300);
await page.keyboard.type('ningbo china', { delay: 60 }); await sleep(2000);
console.log('after type value:', JSON.stringify(await o.inputValue().catch(()=>'ERR')));
// 找可见的候选类容器
const candInfo = await page.evaluate(() => {
  const sels = ['.ivu-select-dropdown', '.ivu-select-item', '[class*="dropdown"]', '[class*="autocomplete"]', 'ul li'];
  const out = [];
  for (const s of sels) {
    const els = [...document.querySelectorAll(s)].filter(e => e.offsetParent !== null);
    if (els.length) out.push([s, els.length, (els[0].innerText||'').replace(/\s+/g,' ').slice(0,60)]);
  }
  return out;
});
console.log('visible candidates:', JSON.stringify(candInfo, null, 1));
// ivu-select 检查：input 外层结构
const wrap = await page.evaluate(() => {
  const el = [...document.querySelectorAll('input')].find(i => /origin city/i.test(i.placeholder || i.getAttribute('aria-label') || ''));
  if (!el) return null;
  const w = el.closest('.ivu-select') || el.parentElement;
  return { placeholder: el.placeholder, wrapClass: w?.className, wrapTag: w?.tagName };
});
console.log('origin input wrap:', JSON.stringify(wrap));
await page.screenshot({ path: '../evidence/diag-cosco-v6b.png' });
await ctx.close().catch(()=>{}); process.exit(0);
