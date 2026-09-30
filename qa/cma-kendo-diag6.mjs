// 直接点 li.place-suggestion（CNNGB + Port），验证 input 是否选中
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.cma-cgm.com/ebusiness/schedules', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await sleep(5000); await dismissCookies(page).catch(()=>{}); await sleep(1500);
const box = page.getByRole('combobox', { name: /port, city, country name or code/i }).first();
await box.click(); await sleep(500);
await page.keyboard.type('ningbo', { delay: 80 }); await sleep(3000);
const li = page.locator('li.place-suggestion').filter({ hasText: /CNNGB/ }).filter({ hasText: /port/i }).first();
console.log('li count:', await li.count());
await li.click({ timeout: 5000 }).catch(e => console.log('click err', String(e).slice(0,80)));
await sleep(1500);
const v = await page.evaluate(() => document.getElementById('AutoCompletePOL')?.value);
console.log('input value after click:', JSON.stringify(v));
// 起运块周边文本（确认选中显示）
const t = await page.evaluate(() => {
  const el = document.getElementById('AutoCompletePOL');
  return el?.closest('fieldset, form, div')?.innerText?.slice(0, 200) || '';
});
console.log('form area:', JSON.stringify(t.replace(/\n/g,' | ').slice(0,200)));
await ctx.close().catch(()=>{}); process.exit(0);
