
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const reqs = [];
page.on('request', (r) => {
  const u = r.url();
  if (/synergy|track|cntr|container|bl_|search|bill/i.test(u) && !/\.(png|jpe?g|css|woff2?|svg|gif|ico)/.test(u)) reqs.push(u.slice(0, 160));
});

// ── A. 马士基深链（276759780）
try {
  reqs.length = 0;
  await page.goto('https://www.maersk.com/tracking/276759780', { waitUntil: 'domcontentloaded', timeout: 50000 });
  await sleep(11000);
  console.log('== MAERSK 请求: ' + JSON.stringify([...new Set(reqs)].slice(0, 12)));
  const m = await page.evaluate(() => ({
    title: document.title.slice(0, 70),
    body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 260),
  }));
  console.log('== MAERSK 页面: ' + JSON.stringify(m));
} catch (e) { console.log('== MAERSK ERR ' + String(e).slice(0, 120)); }
await sleep(1500);

// ── B. COSCO 追踪（COSU6469105960）
try {
  reqs.length = 0;
  await page.goto('https://elines.coscoshipping.com/ebusiness/tracking', { waitUntil: 'domcontentloaded', timeout: 50000 });
  await sleep(8000);
  const info = await page.evaluate(() => ({
    title: document.title.slice(0, 70),
    inputs: [...document.querySelectorAll('input')].filter((el) => el.offsetParent && !['hidden','checkbox','radio'].includes(el.type))
      .map((el) => ({ ph: (el.placeholder || '').slice(0, 40), id: (el.id || '').slice(0, 24) })).slice(0, 6),
    body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 180),
  }));
  console.log('== COSCO 页: ' + JSON.stringify(info));
  console.log('== COSCO 初始请求: ' + JSON.stringify([...new Set(reqs)].slice(0, 8)));
  const inp = page.locator('input:visible').first();
  await inp.fill('COSU6469105960', { timeout: 8000 }).catch(() => {});
  reqs.length = 0;
  await page.keyboard.press('Enter');
  await sleep(9000);
  console.log('== COSCO 提交后: ' + JSON.stringify([...new Set(reqs)].slice(0, 12)));
  const b2 = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300));
  console.log('== COSCO 结果: ' + JSON.stringify(b2));
} catch (e) { console.log('== COSCO ERR ' + String(e).slice(0, 120)); }
await ctx.close();
