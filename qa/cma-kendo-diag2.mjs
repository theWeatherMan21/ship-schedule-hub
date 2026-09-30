// Kendo 下拉 item 的 DOM 结构（找可点击/可选的真实元素）
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.cma-cgm.com/ebusiness/schedules', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await sleep(5000); await dismissCookies(page).catch(()=>{}); await sleep(1500);
const box = page.getByRole('combobox', { name: /port, city, country name or code/i }).first();
await box.click(); await sleep(500);
await page.keyboard.type('ningbo', { delay: 80 }); await sleep(3000);
const dump = await page.evaluate(() => {
  const ul = document.getElementById('AutoCompletePOL_listbox');
  if (!ul) return 'NO LISTBOX';
  return Array.from(ul.children).slice(0, 5).map(li => ({ idx: li.getAttribute('data-idx') ?? li.id, cls: String(li.className).slice(0,60), html: li.outerHTML.slice(0, 400) }));
});
console.log(JSON.stringify(dump, null, 1).slice(0, 2500));
await ctx.close().catch(()=>{}); process.exit(0);
