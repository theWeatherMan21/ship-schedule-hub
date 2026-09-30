import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.yangming.com/en/esolution/schedule/point_to_point_search', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e=>console.log('ERR',String(e).slice(0,60)));
await sleep(6000); await dismissCookies(page).catch(()=>{}); await sleep(1000);
const cb = page.getByRole('combobox');
const n = await cb.count().catch(()=>0);
console.log('combobox count:', n);
for (let i = 0; i < Math.min(n, 5); i++) {
  const el = cb.nth(i);
  console.log(i, 'role-name:', await el.evaluate(e => e.getAttribute('aria-label')).catch(()=>''), 'tag:', await el.evaluate(e => e.tagName).catch(()=>''), 'cls:', await el.evaluate(e => String(e.className).slice(0,60)).catch(()=>''));
}
// 试点击第一个 combobox 再看 input
await cb.first().click({ timeout: 5000 }).catch(e => console.log('click err', String(e).slice(0,60)));
await sleep(1000);
const n2 = await page.locator('input').count().catch(()=>0);
console.log('inputs after click:', n2);
await page.keyboard.type('ningbo', { delay: 80 }).catch(()=>{});
await sleep(2500);
const opts = page.getByRole('option');
let m = 0;
for (let i = 0; i < 16; i++) { m = await opts.count().catch(()=>0); if (m) break; await sleep(500); }
console.log('options:', m);
for (let i = 0; i < Math.min(m, 6); i++) console.log('  opt:', (await opts.nth(i).innerText().catch(()=>'')).slice(0,70));
await ctx.close().catch(()=>{}); process.exit(0);
