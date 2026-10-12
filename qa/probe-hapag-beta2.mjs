// Hapag BETA 深抓：API 422 的请求/响应详情 + 页面上「Track by Booking/Container」旧版入口链接
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';

const BL = process.env.BL || 'HLCU2B9E986E7C5E';
const r = await launchHeadedQuiet();
console.log('mode:', r.mode);
const ctx = r.ctx;
const page = ctx.pages().find((p) => !p.isClosed()) || (await ctx.newPage());
let apiDone = false;

page.on('response', async (resp) => {
  if (!/tracking\.api\.hlag\.cloud/.test(resp.url())) return;
  apiDone = true;
  try {
    console.log('═API═', resp.status(), resp.url().slice(0, 170));
    const req = resp.request();
    console.log('  reqH:', JSON.stringify(req.headers()).slice(0, 900));
    const pd = req.postData();
    if (pd) console.log('  postData:', String(pd).slice(0, 300));
    const b = await resp.text().catch(() => '');
    console.log('  respBody:', b.slice(0, 800));
  } catch (e) { console.log('  (capture err)', String(e).slice(0, 90)); }
});

try {
  await page.goto('https://www.hapag-lloyd.com/solutions/tracking/#/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
  await sleep(6000);

  const links = await page.evaluate(() => [...document.querySelectorAll('a')]
    .map((a) => ({ t: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 42), h: a.href }))
    .filter((x) => /booking|container|tracing|track/i.test(x.t + ' ' + x.h)))
    .catch(() => []);
  console.log('links:', JSON.stringify(links.slice(0, 16), null, 1));

  await page.waitForSelector('input[type="search"]', { timeout: 30000 });
  await page.fill('input[type="search"]', BL);
  await sleep(3500);
  await page.press('input[type="search"]', 'Enter');
  for (let i = 0; i < 20 && !apiDone; i++) await sleep(1500);
  await sleep(3000);
  console.log('apiDone:', apiDone);
} finally {
  await ctx.close().catch(() => {});
  console.log('closed');
}
