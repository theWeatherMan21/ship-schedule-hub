// CMA：#AutoCompletePOL / #AutoCompletePOD + Search 按钮
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.cma-cgm.com/ebusiness/schedules', { reuse: true });
await sleep(12000);
const before = new Set(await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name)));
let realReq = null;
ctx.on('request', (req) => {
  const u = req.url();
  if (/api/i.test(u) && /schedul|route|search/i.test(u) && !realReq) {
    realReq = { url: u, method: req.method(), body: (req.postData() || '').slice(0, 500) };
    console.log('🎯 API 请求:', req.method(), u.slice(0, 130));
    console.log('   body:', realReq.body.slice(0, 300));
  }
});
await page.click('#AutoCompletePOL', { timeout: 10000 });
await page.keyboard.type('ningbo', { delay: 80 });
await sleep(4000);
const p1 = await page.evaluate(() => {
  const items = [...document.querySelectorAll('[class*=ui-menu-item], [class*=autocomplete] li, [id*=ui-id] li, .ui-corner-all')].filter((el) => el.offsetParent !== null && /ningbo/i.test(el.textContent));
  if (items.length) { items[0].click(); return items[0].textContent.trim().slice(0, 60); }
  return null;
});
console.log('起运:', p1);
await sleep(2000);
await page.click('#AutoCompletePOD', { timeout: 10000 });
await page.keyboard.type('istanbul', { delay: 80 });
await sleep(4000);
const p2 = await page.evaluate(() => {
  const items = [...document.querySelectorAll('[class*=ui-menu-item], [class*=autocomplete] li, [id*=ui-id] li, .ui-corner-all')].filter((el) => el.offsetParent !== null && /ambarli|istanbul/i.test(el.textContent) && /port/i.test(el.textContent));
  if (items.length) { items[0].click(); return items[0].textContent.trim().slice(0, 60); }
  return null;
});
console.log('目的:', p2);
await sleep(2000);
await page.evaluate(() => { [...document.querySelectorAll('button')].filter((b) => (b.textContent || '').trim() === 'Search')[0]?.click(); });
await sleep(14000);
const after = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
const fresh = after.filter((u) => !before.has(u) && !/\.(css|js|png|svg|woff|ico)/.test(u) && !/analytics|contentsquare|cookielaw|walkme|maze|datadome/i.test(u));
console.log('\n新请求:');
fresh.slice(0, 10).forEach((u) => console.log('  ', u.slice(0, 160)));
console.log(realReq ? '✅ 拦到 API' : '❌ 没拦到 API');
fs.writeFileSync('../docs/cma-flow.json', JSON.stringify({ fresh, realReq }, null, 1));
await ctx.close().catch(() => {});
process.exit(0);
