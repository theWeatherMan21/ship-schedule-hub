// Maersk：填表点搜索时抓真实请求（它家有 api.maersk.com 直连域，值得挖）
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint', { reuse: true });
await sleep(12000);
const before = new Set(await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name)));
let real = null;
ctx.on('request', (req) => {
  const u = req.url();
  if (/schedul|route|pointToPoint/i.test(u) && /api/i.test(u) && !/assets|staleIndicator|active-vessels|vessel-flags/i.test(u) && !real) {
    real = { url: u, method: req.method(), body: (req.postData() || '').slice(0, 600), headers: Object.fromEntries(Object.entries(req.headers()).filter(([k]) => ['content-type','accept','x-requested-with','authorization','api-key'].includes(k))) };
    console.log('🎯', req.method(), u.slice(0, 150));
    if (real.body) console.log('   body:', real.body.slice(0, 400));
  }
});
// Maersk 表单：originCity/destinationCity autocomplete
try {
  const oInp = page.locator('input[placeholder*="origin" i], input[placeholder*="From" i]').first();
  await oInp.click({ timeout: 10000 });
  await page.keyboard.type('ningbo', { delay: 80 });
  await sleep(4500);
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('li, [role=option], [class*=result] > *')].filter((el) => el.offsetParent !== null && /ningbo/i.test(el.textContent) && el.textContent.length < 120);
    if (items.length) items[0].click();
  });
  await sleep(2500);
  const dInp = page.locator('input[placeholder*="destination" i], input[placeholder*="To" i]').first();
  await dInp.click({ timeout: 10000 });
  await page.keyboard.type('istanbul', { delay: 80 });
  await sleep(4500);
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('li, [role=option], [class*=result] > *')].filter((el) => el.offsetParent !== null && /ambarli|istanbul/i.test(el.textContent) && el.textContent.length < 120);
    if (items.length) items[0].click();
  });
  await sleep(2500);
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => /search/i.test(b.textContent || ''))?.click(); });
  await sleep(15000);
} catch (e) { console.log('交互:', String(e).slice(0, 90)); }
const after = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
const fresh = after.filter((u) => !before.has(u) && /api/i.test(u) && !/\.(css|js|png|svg)/.test(u));
console.log('\nAPI 新请求:');
[...new Set(fresh)].slice(0, 8).forEach((u) => console.log('  ', u.slice(0, 160)));
console.log(real ? '✅ 拦到' : '❌ 没拦到');
fs.writeFileSync('../docs/maersk-flow.json', JSON.stringify({ fresh: [...new Set(fresh)], real }, null, 1));
await ctx.close().catch(() => {});
process.exit(0);
