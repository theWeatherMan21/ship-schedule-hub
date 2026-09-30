// YM 输入框诊断：找 Location From 的真实 input
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.yangming.com/en/esolution/schedule/point_to_point_search', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await sleep(5000); await dismissCookies(page).catch(()=>{}); await sleep(1000);
const info = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('input')).map(i => ({ tag: i.tagName, type: i.type, ph: i.placeholder, haspopup: i.getAttribute('aria-haspopup'), cls: String(i.className).slice(0,50), id: i.id, visible: i.offsetParent !== null, autocomplete: i.getAttribute('autocomplete') }));
});
console.log(JSON.stringify(info, null, 1).slice(0, 2000));
await ctx.close().catch(()=>{}); process.exit(0);
