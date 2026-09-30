import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { reuse: true });
await sleep(18000);
const reqs = [];
page.on('request', (r) => {
  const u = r.url();
  if (/oocl/.test(u) && !/\.js|\.css|\.png|\.woff|\.gif|angular/.test(u)) reqs.push({ m: r.method(), u: u.slice(0, 150), body: (r.postData() || '').slice(0, 400) });
});
// 填 port_of_Load（第一个 name=sailing input）
const inputs = page.locator('input[name=sailing]');
console.log('输入框数:', await inputs.count());
await inputs.nth(0).click({ timeout: 10000 });
await page.keyboard.type('ningbo', { delay: 80 });
await sleep(5000);
// angular 候选下拉
const picked = await page.evaluate(() => {
  const items = [...document.querySelectorAll('li, .dropdown li, [class*=option], [class*=item]')].filter((el) => el.offsetParent !== null && /ningbo/i.test(el.textContent || '') && (el.textContent || '').length < 80);
  if (items.length) { items[0].click(); return items[0].textContent.trim().slice(0, 50); }
  return null;
});
console.log('POL 候选:', picked);
await sleep(4000);
await inputs.nth(1).click({ timeout: 10000 }).catch(() => {});
await page.keyboard.type('istanbul', { delay: 80 });
await sleep(5000);
const picked2 = await page.evaluate(() => {
  const items = [...document.querySelectorAll('li, .dropdown li, [class*=option], [class*=item]')].filter((el) => el.offsetParent !== null && /istanbul|ambarli/i.test(el.textContent || '') && (el.textContent || '').length < 80);
  if (items.length) { items[0].click(); return items[0].textContent.trim().slice(0, 50); }
  return null;
});
console.log('POD 候选:', picked2);
await sleep(3000);
// 点 Search
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => /^search$/i.test((b.textContent || '').trim()))?.click(); });
await sleep(20000);
console.log('查询后的 API 请求:');
const seen = new Set();
for (const r of reqs) {
  const k = r.m + ' ' + r.u.split('?')[0];
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`[${r.m}] ${r.u}`);
  if (r.body) console.log('   body:', r.body.slice(0, 300));
}
await ctx.close().catch(() => {});
process.exit(0);
