// 用对输入框：#tag-input-origin / #tag-input-destination
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule', { reuse: true });
await sleep(18000);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
const reqs = [];
cdp.on('Network.requestWillBeSent', (e) => {
  const u = e.request.url;
  if (/one-line\.com\/api\//.test(u) && !/cookie|banner|event-log|config/i.test(u)) reqs.push({ m: e.request.method, u, body: e.request.postData || '' });
});
const oInp = page.locator('#tag-input-origin');
await oInp.click({ timeout: 10000 });
await page.keyboard.type('ningbo', { delay: 70 });
await sleep(5000);
const picked = await page.evaluate(() => {
  const items = [...document.querySelectorAll('li, [role=option]')].filter((el) => el.offsetParent !== null && /ningbo/i.test(el.textContent || '') && (el.textContent || '').length < 120);
  if (items.length) { items[0].click(); return items[0].textContent.trim().slice(0, 70); }
  return null;
});
console.log('POL:', picked);
await sleep(3000);
const dInp = page.locator('#tag-input-destination');
await dInp.click({ timeout: 10000 });
await page.keyboard.type('istanbul', { delay: 70 });
await sleep(5000);
const picked2 = await page.evaluate(() => {
  const items = [...document.querySelectorAll('li, [role=option]')].filter((el) => el.offsetParent !== null && /ambarli|istanbul/i.test(el.textContent || '') && (el.textContent || '').length < 120);
  if (items.length) { items[0].click(); return items[0].textContent.trim().slice(0, 70); }
  return null;
});
console.log('POD:', picked2);
await sleep(2500);
await page.evaluate(() => { [...document.querySelectorAll('button')].filter((b) => /search/i.test(b.textContent || ''))[0]?.click(); });
await sleep(25000);
console.log('API:');
const seen = new Set();
for (const r of reqs) {
  const k = r.m + ' ' + r.u.split('?')[0];
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`[${r.m}] ${r.u.slice(0, 170)}`);
  if (r.body) console.log('    body:', r.body.slice(0, 500));
}
await ctx.close().catch(() => {});
process.exit(0);
