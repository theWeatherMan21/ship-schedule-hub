// YM 搜索 XHR 抓取：监听网络 + 柜号搜索 + 响应提取（无头、只读）
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

const hits = [];
page.on('response', async (resp) => {
  const u = resp.url();
  if (/\.(js|css|png|jpg|jpeg|woff2?|svg|ico|gif|map|ttf)(\?|$)/.test(u)) return;
  const ct = (resp.headers()['content-type'] || '').slice(0, 50);
  const entry = { m: resp.request().method(), u: u.slice(0, 150), s: resp.status(), ct };
  hits.push(entry);
  // 对疑似搜索响应的 JSON 抓一小段
  if (/json/i.test(ct) && /yangming\.com\/api/i.test(u) && !/MenuList|Maintenance|ContentData|BlockStatus/i.test(u)) {
    try {
      const t = await resp.text();
      entry.preview = t.slice(0, 400);
      entry.len = t.length;
    } catch { /* ignore */ }
  }
});

await page.goto('https://www.yangming.com/en/esolution/tracking/cargo_tracking', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(5000);
const before = hits.length;

const firstId = await page.evaluate(() => {
  const ins = [...document.querySelectorAll('input[type="text"]')].filter((x) => x.offsetParent !== null);
  return ins[0] ? ins[0].id : null;
});
console.log('input id:', firstId);
if (firstId) {
  await page.fill('#' + firstId.replace(/([^\w-])/g, '\\$1'), 'YMLU4794134').catch(() => {});
  await sleep(700);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /^search$/i.test((x.innerText || '').trim()));
    if (b) b.click();
  });
  await sleep(10000);
}
console.log('── 搜索期间新请求（after click）──');
for (const h of hits.slice(before)) console.log(JSON.stringify(h));

// 渲染结果快照
const snap = await page.evaluate(() => {
  const t = (document.body ? document.body.innerText : '').replace(/\s+/g, ' ');
  const i = t.indexOf('Container No.');
  return { around: t.slice(Math.max(0, i - 60), i + 340), rows: document.querySelectorAll('table tr').length };
}).catch(() => ({}));
console.log('snapshot:', JSON.stringify(snap));

await ctx.close().catch(() => {});
