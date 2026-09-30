import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.yangming.com/en/esolution/schedule/point_to_point_search', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e=>console.log('ERR',String(e).slice(0,80)));
await sleep(6000); await dismissCookies(page).catch(()=>{}); await sleep(1000);
// 用 playwright locators（穿 shadow DOM）而不是 evaluate
const inputs = page.locator('input');
const n = await inputs.count().catch(()=>0);
console.log('input count:', n);
for (let i = 0; i < Math.min(n, 8); i++) {
  const el = inputs.nth(i);
  console.log(i, await el.getAttribute('placeholder').catch(()=>''), await el.getAttribute('aria-haspopup').catch(()=>''), await el.getAttribute('type').catch(()=>''));
}
// aria snapshot 找 From 区块结构
const snap = await page.locator('body').ariaSnapshot().catch(()=>'');
console.log(snap.split('\n').filter(l => /location from|location to|combobox|textbox/i.test(l)).join('\n').slice(0, 600));
await ctx.close().catch(()=>{}); process.exit(0);
