import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.cma-cgm.com/ebusiness/schedules', { reuse: true });
await sleep(12000);
let real = null;
ctx.on('request', (req) => {
  const u = req.url();
  if (/SearchSchedules|GetSchedules|schedules\?|Schedules\/Search/i.test(u) && !real) {
    real = { url: u, method: req.method(), body: (req.postData() || '').slice(0, 600) };
    console.log('🎯', req.method(), u.slice(0, 160));
    if (real.body) console.log('   body:', real.body.slice(0, 400));
  }
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
// 点第一个真正的 Search（可能点击没生效，用 dispatch）
const clicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => (b.textContent || '').trim() === 'Search');
  if (btns.length) { btns[0].click(); return btns.length; }
  return 0;
});
console.log('点了 Search 按钮 x', clicked);
await page.waitForURL('**/schedules**', { timeout: 20000 }).catch(() => {});
await sleep(12000);
console.log('当前 URL:', page.url().slice(0, 160));
console.log(real ? '✅ 拦到: ' + real.url.slice(0, 100) : '❌ 没拦到');
fs.writeFileSync('../docs/cma-real.json', JSON.stringify({ real, finalUrl: page.url() }, null, 1));
await ctx.close().catch(() => {});
process.exit(0);
