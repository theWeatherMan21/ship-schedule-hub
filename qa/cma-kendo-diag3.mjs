// 打字后 listbox 内容（等待渲染后再取）
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.cma-cgm.com/ebusiness/schedules', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await sleep(5000); await dismissCookies(page).catch(()=>{}); await sleep(1500);
const box = page.getByRole('combobox', { name: /port, city, country name or code/i }).first();
await box.click(); await sleep(500);
await page.keyboard.type('ningbo', { delay: 80 });
// 轮询 listbox 直到有 li
let dump = 'none';
for (let i = 0; i < 20; i++) {
  await sleep(500);
  dump = await page.evaluate(() => {
    const ul = document.getElementById('AutoCompletePOL_listbox');
    if (!ul) return 'NO LISTBOX';
    const lis = Array.from(ul.querySelectorAll('li'));
    return { n: lis.length, first: lis[0]?.outerHTML.slice(0, 500), second: lis[1]?.outerHTML.slice(0, 300) };
  }).catch(e => String(e));
  if (typeof dump === 'object' && dump.n > 0) break;
}
console.log(JSON.stringify(dump, null, 1).slice(0, 2000));
await ctx.close().catch(()=>{}); process.exit(0);
