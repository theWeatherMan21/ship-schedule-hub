// YM 深链变体 + 表单搜索路径（无头、只读）
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

// a) 无 refNo 深链
console.log('════ a: BL_CT + trackNo（无 refNo）════');
await page.goto('https://www.yangming.com/en/esolution/tracking/cargo_tracking_detail?position=BL_CT&trackNo=YMLU3560471', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(7000);
console.log(JSON.stringify(await page.evaluate(() => ({
  rows: [...document.querySelectorAll('table tr')].length,
  head: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(40, 260),
})).catch(() => ({}))));

// b) 表单搜索路径（监听网络）
console.log('\n════ b: 表单搜索 ════');
const reqs = [];
page.on('request', (r) => {
  const u = r.url();
  if (!/\.(js|css|png|jpg|jpeg|woff2?|svg|ico|gif|map)(\?|$)/.test(u)) reqs.push(r.method() + ' ' + u.slice(0, 150));
});
await page.goto('https://www.yangming.com/en/esolution/tracking/cargo_tracking', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(5000);
const filled = await page.evaluate(() => {
  const ins = [...document.querySelectorAll('input[type="text"]')].filter((x) => x.offsetParent !== null);
  if (ins[0]) { ins[0].focus(); ins[0].value = 'YMLU3560471'; ins[0].dispatchEvent(new Event('input', { bubbles: true })); return ins.length; }
  return 0;
});
console.log('filled inputs:', filled);
await sleep(1000);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((x) => /search/i.test(x.innerText || ''));
  if (b) b.click();
});
await sleep(10000);
console.log('url after search:', page.url().slice(0, 160));
console.log('requests:', JSON.stringify(reqs.slice(-16), null, 1));
console.log('result rows:', await page.evaluate(() => document.querySelectorAll('table tr').length).catch(() => -1));
console.log('result head:', await page.evaluate(() => (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(60, 420)).catch(() => ''));

await ctx.close().catch(() => {});
