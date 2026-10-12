// OOCL Control Tower 深探：网络监听 + API 端点发现 + captcha-config（无头、只读）
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

const hits = [];
page.on('response', (resp) => {
  const u = resp.url();
  if (/\.(js|css|png|jpg|jpeg|woff2?|svg|ico|gif|map|ttf)(\?|$)/i.test(u)) return;
  hits.push({ m: resp.request().method(), u: u.slice(0, 170), s: resp.status(), ct: (resp.headers()['content-type'] || '').slice(0, 40) });
});

const EXPRESS = 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/ExpressLink.aspx?eltype=ct&businessType=blNumber&businessNumber=OOLU1234567890&language=en';
console.log('== 打开 ExpressLink（示例号）==');
const r = await page.goto(EXPRESS, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => { console.log('gotoErr', String(e).slice(0, 100)); return null; });
console.log('status:', r ? r.status() : 'err');
await sleep(14000);
console.log('final URL:', page.url().slice(0, 170));
console.log('title:', await page.title().catch(() => ''));
console.log('text:', await page.evaluate(() => (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 350)).catch(() => ''));

console.log('\n== 网络请求（去掉静态）==');
for (const h of hits.slice(-45)) console.log(JSON.stringify(h));

console.log('\n== 试探：captcha-config ==');
const cc = await page.evaluate(async () => {
  const tries = ['/scct/scct_customer/public/moc-cargo-tracking/captcha-config'];
  const out = [];
  for (const u of tries) {
    try {
      const resp = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
      const t = await resp.text();
      out.push({ u, s: resp.status, t: t.slice(0, 300) });
    } catch (e) { out.push({ u, err: String(e).slice(0, 120) }); }
  }
  return out;
}).catch((e) => [{ err: String(e).slice(0, 120) }]);
console.log(JSON.stringify(cc, null, 1));

console.log('\n== 试探：页面内可见的 API 路径关键字 ==');
const kw = await page.evaluate(() => {
  const html = document.documentElement.outerHTML;
  const out = {};
  for (const k of ['moc-cargo-tracking', 'api/', 'cargoTracking', 'searchShipment', 'trackAndTrace']) {
    const idx = html.indexOf(k);
    out[k] = idx >= 0 ? html.slice(Math.max(0, idx - 60), idx + 120).replace(/\s+/g, ' ') : null;
  }
  return out;
}).catch(() => ({}));
console.log(JSON.stringify(kw, null, 1).slice(0, 1500));

await ctx.close().catch(() => {});
