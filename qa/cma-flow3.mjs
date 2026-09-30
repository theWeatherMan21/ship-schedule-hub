// 候选类名是 .place-suggestion（Kendo UI popup: sortedAutocompletePopup-*）
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
    realReq = { url: u, method: req.method(), body: (req.postData() || '').slice(0, 600) };
    console.log('🎯', req.method(), u.slice(0, 130));
    console.log('   body:', realReq.body.slice(0, 350));
  }
});
async function pick(sel, text, want) {
  await page.click(sel, { timeout: 10000 });
  await sleep(600);
  await page.keyboard.type(text, { delay: 80 });
  await sleep(4500);
  const got = await page.evaluate((w) => {
    const items = [...document.querySelectorAll('.place-suggestion')].filter((el) => el.offsetParent !== null && new RegExp(w, 'i').test(el.textContent));
    if (items.length) { items[0].click(); return items[0].textContent.trim().replace(/\s+/g, ' ').slice(0, 70); }
    return null;
  }, want);
  await sleep(2000);
  return got;
}
console.log('起运:', await pick('#AutoCompletePOL', 'ningbo', 'ningbo'));
console.log('目的:', await pick('#AutoCompletePOD', 'istanbul', 'ambarli'));
await sleep(1500);
await page.evaluate(() => { [...document.querySelectorAll('button')].filter((b) => (b.textContent || '').trim() === 'Search')[0]?.click(); });
await sleep(15000);
const after = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
const fresh = after.filter((u) => !before.has(u) && !/\.(css|js|png|svg|woff|ico)/.test(u) && !/analytics|contentsquare|cookielaw|walkme|maze|datadome/i.test(u));
console.log('\n新请求:');
fresh.slice(0, 10).forEach((u) => console.log('  ', u.slice(0, 160)));
console.log(realReq ? '✅ 拦到 API' : '❌ 没拦到');
fs.writeFileSync('../docs/cma-flow.json', JSON.stringify({ fresh, realReq }, null, 1));
await ctx.close().catch(() => {});
process.exit(0);
