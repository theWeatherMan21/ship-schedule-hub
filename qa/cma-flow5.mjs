import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.cma-cgm.com/ebusiness/schedules', { reuse: true });
await sleep(12000);
const before = new Set(await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name)));
const allPosts = [];
ctx.on('request', (req) => {
  if (req.method() === 'POST' || req.url().includes('?')) allPosts.push({ m: req.method(), u: req.url().slice(0, 200), b: (req.postData() || '').slice(0, 400) });
});
async function pick(sel, text, want) {
  await page.click(sel, { timeout: 10000 });
  await sleep(600);
  await page.keyboard.type(text, { delay: 80 });
  await sleep(4500);
  await page.evaluate((w) => {
    const items = [...document.querySelectorAll('.place-suggestion')].filter((el) => el.offsetParent !== null && new RegExp(w, 'i').test(el.textContent));
    if (items.length) items[0].click();
  }, want);
  await sleep(2000);
}
await pick('#AutoCompletePOL', 'ningbo', 'ningbo');
await pick('#AutoCompletePOD', 'istanbul', 'ambarli');
// 填日期（必填？）
await page.evaluate(() => {
  const dp = document.querySelector('#datepicker');
  if (dp) {
    dp.value = '06-OCT-2026';
    dp.dispatchEvent(new Event('input', { bubbles: true }));
    dp.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
await sleep(1000);
// 用 form submit（如果它是 form）
const formInfo = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].filter((x) => (x.textContent || '').trim() === 'Search')[0];
  if (!b) return 'no btn';
  const f = b.closest('form');
  if (f) { const a = f.action; f.submit(); return 'submitted form to ' + a; }
  b.click(); return 'clicked (no form)';
});
console.log(formInfo);
await sleep(15000);
const after = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));
const fresh = after.filter((u) => !before.has(u) && !/\.(css|js|png|svg|woff|ico)/.test(u) && !/analytics|contentsquare|cookielaw|walkme|maze|datadome|google/i.test(u));
console.log('\n新请求:', fresh.length);
fresh.slice(0, 8).forEach((u) => console.log('  ', u.slice(0, 170)));
console.log('最终 URL:', page.url().slice(0, 160));
fs.writeFileSync('../docs/cma-final.json', JSON.stringify({ fresh, posts: allPosts.filter((p) => /cma-cgm/i.test(p.u)) }, null, 1));
await ctx.close().catch(() => {});
process.exit(0);
