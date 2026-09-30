// COSCO 港口候选容器结构 dump：找出真正装港口候选的选择器（婉宜 9-22）
import { launch, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const ctx = await launch({});
const page = await ctx.newPage();
await page.goto('https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', { waitUntil: 'domcontentloaded', timeout: 45000 });
await dismissCookies(page);
await sleep(4000);
const o = page.getByRole('textbox', { name: /origin city/i }).first();
await o.waitFor({ state: 'visible', timeout: 20000 });
await o.click();
await o.fill('');
await o.type('ningbo', { delay: 70 });
await sleep(8000);

const info = await page.evaluate(() => {
  const out = [];
  // 找所有可见元素里文本含 Ningbo 的，记录其 tag/class/父级 class
  document.querySelectorAll('li, div, span, a').forEach((e) => {
    const t = (e.textContent || '').trim();
    if (!/ningbo/i.test(t) || t.length > 80) return;
    if (!e.offsetParent) return;
    out.push({
      tag: e.tagName,
      cls: (e.className || '').toString().slice(0, 60),
      parentCls: (e.parentElement?.className || '').toString().slice(0, 60),
      txt: t.slice(0, 50),
    });
  });
  // 去重
  const seen = new Set();
  return out.filter((x) => {
    const k = x.cls + '|' + x.txt;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 10);
});
console.log('含 Ningbo 的可见元素:');
info.forEach((x) => console.log(`  <${x.tag} class="${x.cls}"> parent="${x.parentCls}" → ${x.txt}`));

const cnt = await page.evaluate(() => {
  const q = (s) => document.querySelectorAll(s).length;
  return {
    ivuSelectItem: q('.ivu-select-item'),
    ivuSelectDropdownItem: q('.ivu-select-dropdown .ivu-select-item'),
    anyLiWithNingbo: [...document.querySelectorAll('li')].filter((e) => /ningbo/i.test(e.textContent || '')).length,
  };
});
console.log('计数:', JSON.stringify(cnt));

await ctx.close().catch(() => {});
process.exit(0);
