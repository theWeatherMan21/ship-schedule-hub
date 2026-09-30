// 诊断：输入 Shanghai 后，下拉候选到底是什么结构
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const ctx = await launch({});
await quietWindow(ctx, 'minimized');
const page = await ctx.newPage();
await page.goto('https://www.maersk.com/schedules/pointToPoint', { waitUntil: 'domcontentloaded', timeout: 45000 });
await dismissCookies(page);

const from = page.getByRole('combobox', { name: /from \(city, country\/region\)/i }).first();
await from.waitFor({ state: 'visible', timeout: 20000 });
await from.click();
await from.pressSequentially('Shanghai', { delay: 80 });
await sleep(2500);

// 1) role=option 带名字过滤（v1 的成功写法）
const named = page.getByRole('option', { name: /shanghai/i });
console.log('role=option[name~=shanghai] 数量:', await named.count().catch(() => -1));
console.log('第一个可见?', await named.first().isVisible().catch(() => false));

// 2) 全量 option
const all = page.getByRole('option');
console.log('全量 option 数量:', await all.count().catch(() => -1));
for (let i = 0; i < Math.min(await all.count().catch(() => 0), 8); i++) {
  const o = all.nth(i);
  console.log(`  [${i}] innerText="${(await o.innerText().catch(() => '<err>')).slice(0, 50)}" textContent="${(await o.evaluate(el => el.textContent).catch(() => '<err>')).slice(0, 50)}" visible=${await o.isVisible().catch(() => '?')}`);
}

// 3) listbox 结构 + HTML
const lb = page.getByRole('listbox');
console.log('listbox 数量:', await lb.count().catch(() => -1));
const lbHtml = await lb.first().evaluate(el => el.outerHTML).catch(() => '<no listbox>');
console.log('listbox HTML(1200字):', lbHtml.slice(0, 1200));

// 4) 扩展搜索：页面上可见文本含 Shanghai 的元素
const vis = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('*').forEach(el => {
    if (el.children.length === 0 && /shanghai/i.test(el.textContent || '') && el.offsetParent !== null) {
      out.push(`${el.tagName}.${(el.className || '').toString().slice(0, 40)}: ${el.textContent.trim().slice(0, 60)}`);
    }
  });
  return out.slice(0, 10);
});
console.log('可见含 Shanghai 的元素:', JSON.stringify(vis, null, 1));

await page.screenshot({ path: 'evidence/diag-dropdown.png' });
await ctx.close().catch(() => {});
process.exit(0);
