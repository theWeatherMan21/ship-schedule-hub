// 手动填 ONE 表单（绕过配方），全程拦 API
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
// 找 POL 输入框（第一个空 input）
const inputs = await page.evaluate(() => [...document.querySelectorAll('input')].map((i, ix) => ({ ix, id: i.id, name: i.name, ph: i.placeholder, aria: i.getAttribute('aria-label') })));
console.log('inputs:', JSON.stringify(inputs));
// 填第一个
const first = page.locator('input').first();
await first.click({ timeout: 10000 }).catch(() => {});
await page.keyboard.type('ningbo', { delay: 70 }).catch((e) => console.log('type:', String(e).slice(0, 50)));
await sleep(5000);
// 候选点击
const picked = await page.evaluate(() => {
  const items = [...document.querySelectorAll('li, [role=option], [class*=dropdown] li, [class*=option]')].filter((el) => el.offsetParent !== null && /ningbo/i.test(el.textContent || '') && (el.textContent || '').length < 100);
  if (items.length) { items[0].click(); return items[0].textContent.trim().slice(0, 60); }
  return null;
});
console.log('POL 候选:', picked);
await sleep(4000);
const second = page.locator('input').nth(1);
await second.click({ timeout: 10000 }).catch(() => {});
await page.keyboard.type('istanbul', { delay: 70 }).catch(() => {});
await sleep(5000);
const picked2 = await page.evaluate(() => {
  const items = [...document.querySelectorAll('li, [role=option], [class*=dropdown] li, [class*=option]')].filter((el) => el.offsetParent !== null && /istanbul|ambarli/i.test(el.textContent || '') && (el.textContent || '').length < 100);
  if (items.length) { items[0].click(); return items[0].textContent.trim().slice(0, 60); }
  return null;
});
console.log('POD 候选:', picked2);
await sleep(3000);
await page.evaluate(() => { [...document.querySelectorAll('button')].filter((b) => /search/i.test(b.textContent || ''))[0]?.click(); });
await sleep(25000);
console.log('点搜索后 API:');
const seen = new Set();
for (const r of reqs) {
  const k = r.m + ' ' + r.u.split('?')[0];
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`[${r.m}] ${r.u.slice(0, 160)}`);
  if (r.body) console.log('    body:', r.body.slice(0, 400));
}
await ctx.close().catch(() => {});
process.exit(0);
