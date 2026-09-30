// YM：goto 挂后仍有 DOM？直接找 Location From 附近的 input（父容器定位）
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
for (let t = 0; t < 3; t++) {
  const r = await page.goto('https://www.yangming.com/en/esolution/schedule/point_to_point_search', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>null);
  if (r) { console.log('HTTP', r.status()); break; }
  console.log('retry', t); await sleep(5000);
}
await sleep(6000); await dismissCookies(page).catch(()=>{}); await sleep(1000);
// Location From 容器（aria: text "From Location From:" 后面的 combobox 是 input[role=combobox]?）
const from = page.getByText('Location From:', { exact: false }).first();
console.log('label visible:', await from.isVisible().catch(()=>false));
// 容器附近 input：用 XPath 从 label 找后续 input
const inFrom = page.locator('xpath=//label[contains(., "Location From")]//following::input[1]');
console.log('xpath input count:', await inFrom.count().catch(()=>0));
if (await inFrom.count().catch(()=>0)) {
  await inFrom.first().click().catch(e=>console.log('click', String(e).slice(0,50)));
  await sleep(500);
  await page.keyboard.type('ningbo', { delay: 80 });
  await sleep(2500);
  const opts = page.getByRole('option');
  let m = 0; for (let i = 0; i < 16; i++) { m = await opts.count().catch(()=>0); if (m) break; await sleep(500); }
  console.log('options:', m);
  for (let i = 0; i < Math.min(m, 6); i++) console.log('  opt:', (await opts.nth(i).innerText().catch(()=>'')).slice(0,70));
}
await ctx.close().catch(()=>{}); process.exit(0);
