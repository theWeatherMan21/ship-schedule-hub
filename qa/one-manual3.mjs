// 候选选上了、点了 Search，但除地点搜索外没有其他 API —— 可能按钮 disabled（要选日期？）或结果在同页渲染（component state）
// 最后一招：点击后等更久 + 记录全部请求（不限 /api/）
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule', { reuse: true });
await sleep(18000);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
const reqs = [];
cdp.on('Network.requestWillBeSent', (e) => {
  const u = e.request.url;
  if (/cookie|banner|event-log|\.js|\.css|\.png|\.svg|\.woff|analytics|gtm|googletag/i.test(u)) return;
  reqs.push({ m: e.request.method, u, body: e.request.postData || '' });
});
const oInp = page.locator('#tag-input-origin');
await oInp.click({ timeout: 10000 });
await page.keyboard.type('ningbo', { delay: 70 });
await sleep(5000);
await page.evaluate(() => {
  const items = [...document.querySelectorAll('li, [role=option]')].filter((el) => el.offsetParent !== null && /ningbo/i.test(el.textContent || '') && (el.textContent || '').length < 120);
  if (items.length) items[0].click();
});
await sleep(3000);
const dInp = page.locator('#tag-input-destination');
await dInp.click({ timeout: 10000 });
await page.keyboard.type('istanbul', { delay: 70 });
await sleep(5000);
await page.evaluate(() => {
  const items = [...document.querySelectorAll('li, [role=option]')].filter((el) => el.offsetParent !== null && /istanbul/i.test(el.textContent || '') && (el.textContent || '').length < 120);
  if (items.length) items[0].click();
});
await sleep(2500);
// Search 按钮 disabled 状态检查
const btnState = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /search/i.test(b.textContent || '')).map((b) => ({ txt: (b.textContent || '').trim().slice(0, 20), disabled: b.disabled, cls: (b.className || '').slice(0, 60) })));
console.log('按钮状态:', JSON.stringify(btnState));
await page.evaluate(() => { [...document.querySelectorAll('button')].filter((b) => /search/i.test(b.textContent || ''))[0]?.click(); });
await sleep(30000);
console.log('请求:');
const seen = new Set();
for (const r of reqs) {
  const k = r.m + ' ' + r.u.split('?')[0];
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`[${r.m}] ${r.u.slice(0, 170)}`);
  if (r.body) console.log('    body:', r.body.slice(0, 400));
}
await ctx.close().catch(() => {});
process.exit(0);
