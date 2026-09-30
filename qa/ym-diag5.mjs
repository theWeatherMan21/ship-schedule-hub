// YM diag4 重现全流程：type 后选项是否弹出 + dest 定位
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
const r = await page.goto('https://www.yangming.com/en/esolution/schedule/point_to_point_search', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>null);
console.log('HTTP', r?.status());
await sleep(6000); await dismissCookies(page).catch(()=>{}); await sleep(1000);
const inFrom = page.locator('xpath=//label[contains(., "Location From")]//following::input[1]');
await inFrom.first().click();
await page.keyboard.type('ningbo zj cnngb', { delay: 80 });
await sleep(3000);
const opts = page.getByRole('option');
let m = 0; for (let i = 0; i < 16; i++) { m = await opts.count().catch(()=>0); if (m) break; await sleep(500); }
console.log('origin options:', m);
for (let i = 0; i < Math.min(m, 3); i++) console.log('  ', (await opts.nth(i).innerText().catch(()=>'')).slice(0,70));
if (m) { await opts.first().click(); await sleep(1000); console.log('clicked first opt'); }
// dest
const inTo = page.locator('xpath=//label[contains(., "Location To")]//following::input[1]');
console.log('dest count:', await inTo.count().catch(()=>0));
await inTo.first().click();
await page.keyboard.type('istanbul trist', { delay: 80 });
await sleep(3000);
let m2 = 0; for (let i = 0; i < 16; i++) { m2 = await opts.count().catch(()=>0); if (m2) break; await sleep(500); }
console.log('dest options:', m2);
for (let i = 0; i < Math.min(m2, 3); i++) console.log('  ', (await opts.nth(i).innerText().catch(()=>'')).slice(0,70));
await ctx.close().catch(()=>{}); process.exit(0);
