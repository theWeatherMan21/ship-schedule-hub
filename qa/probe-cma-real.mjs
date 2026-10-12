// CMA 真单实测：表单提交（真提单号）+ 网络监听 + 结果/挑战判定（无头、只读）
import { launch, sleep } from '../engine/browser.mjs';

const BL = process.env.BL || 'NGP3170431';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

const hits = [];
page.on('response', (resp) => {
  const u = resp.url();
  if (/\.(js|css|png|jpg|jpeg|woff2?|svg|ico|gif|map|ttf)(\?|$)/i.test(u)) return;
  hits.push({ m: resp.request().method(), u: u.slice(0, 150), s: resp.status(), ct: (resp.headers()['content-type'] || '').slice(0, 35) });
});

console.log('══ 打开 CMA 追踪页 ══');
const r = await page.goto('https://www.cma-cgm.com/eBusiness/Tracking', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => { console.log('gotoErr', String(e).slice(0, 90)); return null; });
console.log('status:', r ? r.status() : 'err');
await sleep(6000);
const pre = await page.evaluate(() => ({
  url: location.href.slice(0, 120),
  inputs: document.querySelectorAll('input').length,
  hasRef: !!document.querySelector('#Reference'),
  hasBtn: !!document.querySelector('#btnTracking'),
  txt: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 160),
})).catch(() => ({}));
console.log('pre:', JSON.stringify(pre));

if (pre.hasRef) {
  await page.fill('#Reference', BL).catch((e) => console.log('fillErr', String(e).slice(0, 90)));
  await sleep(900);
  const val = await page.evaluate(() => document.querySelector('#Reference')?.value || '');
  console.log('filled value:', val);
  await page.click('#btnTracking', { timeout: 12000 }).catch((e) => console.log('clickErr', String(e).slice(0, 90)));
  await sleep(15000);
}

const post = await page.evaluate(() => ({
  url: location.href.slice(0, 170),
  title: document.title,
  txt: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 700),
  dd: /datadome|captcha-delivery|slide|verify you are|human/i.test(document.documentElement.innerHTML.slice(0, 4000)),
})).catch(() => ({}));
console.log('══ 提交后 ══');
console.log(JSON.stringify(post, null, 1));

console.log('══ 网络（末 25 条）══');
for (const h of hits.slice(-25)) console.log(JSON.stringify(h));

await ctx.close().catch(() => {});
