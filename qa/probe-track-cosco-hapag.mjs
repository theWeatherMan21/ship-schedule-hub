
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const reqs = [];
page.on('request', (r) => {
  const u = r.url();
  if (/track|api|public|search|bill|cntr/i.test(u) && !/\.(png|jpe?g|css|woff2?|svg|gif|ico|js$|js\?)/.test(u)) reqs.push(u.slice(0, 150));
});

// ── A. Hapag 深链（HLCU2B9E986E7C5E）
try {
  reqs.length = 0;
  await page.goto('https://www.hapag-lloyd.com/en/online-business/tracing/tracing-by-booking.html?blno=HLCU2B9E986E7C5E', { waitUntil: 'domcontentloaded', timeout: 50000 });
  await sleep(9000);
  const h = await page.evaluate(() => ({ title: document.title.slice(0, 60), body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 220) }));
  console.log('== HAPAG: ' + JSON.stringify(h));
  console.log('== HAPAG 请求: ' + JSON.stringify([...new Set(reqs)].slice(0, 10)));
} catch (e) { console.log('== HAPAG ERR ' + String(e).slice(0, 120)); }
await sleep(1200);

// ── B. COSCO 重试
for (const url of ['https://elines.coscoshipping.com/ebusiness/tracking/search?SearchBy=BL&Reference=COSU6469105960', 'https://elines.coscoshipping.com/ebusiness/tracking']) {
  try {
    reqs.length = 0;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 50000 });
    await sleep(9000);
    const c = await page.evaluate(() => ({ url: location.href.slice(0, 110), title: document.title.slice(0, 60), body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 220) }));
    console.log('== COSCO(' + url.slice(30, 70) + '): ' + JSON.stringify(c));
    console.log('== COSCO 请求: ' + JSON.stringify([...new Set(reqs)].slice(0, 10)));
    if (!/fails to load|ERROR/.test(c.body)) break;
  } catch (e) { console.log('== COSCO ERR ' + String(e).slice(0, 120)); }
  await sleep(1200);
}
await ctx.close();
