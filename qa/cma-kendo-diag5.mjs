// 找 CNNGB 行的可点击祖先 li
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
  const spans = Array.from(document.querySelectorAll('span.code')).filter(e => /CNNGB/i.test(e.textContent||''));
  return spans.map(sp => {
    let li = sp.closest('li');
    return { liFound: !!li, liId: li?.id?.slice(0,50), liCls: String(li?.className||'').slice(0,80), liIdx: li?.getAttribute('data-idx'), liVisible: li ? li.offsetParent !== null : false, liText: li?.textContent?.slice(0,80), ulId: li?.parentElement?.id?.slice(0,50), role: li?.getAttribute('role') };
  });
}).catch(e => String(e));
console.log(JSON.stringify(info, null, 1).slice(0, 1800));
await ctx.close().catch(()=>{}); process.exit(0);
