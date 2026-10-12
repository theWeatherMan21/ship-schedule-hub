
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const reqs = [];
page.on('request', (r) => {
  const u = r.url();
  if (/apigw|track|digital/i.test(u)) reqs.push(u.slice(0, 150));
});
try {
  await page.goto('https://www.zim.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(4000);
  const links = await page.evaluate(() => [...document.querySelectorAll('a')]
    .map((a) => ({ t: (a.innerText || '').trim().slice(0, 30), h: a.href }))
    .filter((x) => /track/i.test(x.t) || /track/i.test(x.h)).slice(0, 8));
  console.log('TRACK链接: ' + JSON.stringify(links));
  const target = (links.find((l) => /track/i.test(l.t)) || {}).h || 'https://www.zim.com/tools/track-a-shipment';
  reqs.length = 0;
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(8000);
  const info = await page.evaluate(() => ({
    url: location.href.slice(0, 120),
    inputs: [...document.querySelectorAll('input')].filter((el) => el.offsetParent).map((el) => (el.placeholder || el.id || '').slice(0, 44)).slice(0, 6),
    apigwRefs: [...new Set((document.documentElement.innerHTML.match(/apigw\.zim\.com\/[a-zA-Z0-9\/_-]+/g) || []))].slice(0, 10),
    hasKey: /subscription-key=[a-f0-9]{8}/.test(document.documentElement.innerHTML),
  }));
  console.log('ZIM页: ' + JSON.stringify(info));
  console.log('ZIM请求: ' + JSON.stringify([...new Set(reqs)].slice(0, 10)));
} catch (e) { console.log('ERR ' + String(e).slice(0, 130)); }
await ctx.close();
