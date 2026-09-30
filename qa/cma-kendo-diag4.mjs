// listbox 到底在哪个容器/层级
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.cma-cgm.com/ebusiness/schedules', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await sleep(5000); await dismissCookies(page).catch(()=>{}); await sleep(1500);
const box = page.getByRole('combobox', { name: /port, city, country name or code/i }).first();
await box.click(); await sleep(500);
await page.keyboard.type('ningbo', { delay: 80 }); await sleep(3500);
const info = await page.evaluate(() => {
  const inp = document.getElementById('AutoCompletePOL');
  const r = { inputExpanded: inp?.getAttribute('aria-expanded'), listHTML: null, anywhereList: [] };
  const ul = document.getElementById('AutoCompletePOL_listbox');
  if (ul) { r.listHTML = { inner: ul.innerHTML.slice(0,200), liCount: ul.querySelectorAll('li').length, visible: ul.offsetParent !== null, cls: ul.className }; }
  // 全文档找含 CNNGB 的元素
  const hit = Array.from(document.querySelectorAll('*')).filter(e => e.children.length === 0 && /CNNGB/i.test(e.textContent||'')).slice(0,3);
  r.anywhereList = hit.map(e => ({ tag: e.tagName, id: e.id?.slice(0,40), cls: String(e.className).slice(0,60), txt: e.textContent.slice(0,60), parentChain: (e.parentElement?.id || e.parentElement?.className || e.parentElement?.tagName || '?') + '/' + (e.parentElement?.parentElement?.id || e.parentElement?.parentElement?.className || '') }));
  return r;
}).catch(e => String(e));
console.log(JSON.stringify(info, null, 1).slice(0, 2500));
await ctx.close().catch(()=>{}); process.exit(0);
