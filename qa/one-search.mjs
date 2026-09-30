// ONE 的船期查询不是 /search —— 点搜索后的请求可能走了别的路径（或 GraphQL）。全量记录所有 API 再点搜索
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule', { reuse: true });
await sleep(18000);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
const reqs = [];
cdp.on('Network.requestWillBeSent', (e) => {
  const u = e.request.url;
  if (/one-line\.com\/api\//.test(u) && !/cookie|banner|event-log|config|emissions/i.test(u)) {
    reqs.push({ m: e.request.method, u, body: e.request.postData || '' });
  }
});
import { byId } from '../engine/registry.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';
import * as utils from '../engine/lib/utils.mjs';
import * as dom from '../engine/lib/dom.mjs';
const carrier = byId('one');
const o = await resolvePort('one', 'Ningbo');
const d = await resolvePort('one', 'Istanbul');
try {
  await carrier.run(page, { originText: o.text, destText: d.text, skipDate: true, date: null, raw: {} }, { ...utils, ...dom, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
} catch (e) { console.log('配方:', String(e).slice(0, 80)); }
await sleep(22000);
console.log('全部 API 请求:');
const seen = new Set();
for (const r of reqs) {
  const k = r.m + ' ' + r.u.split('?')[0];
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`[${r.m}] ${r.u.slice(0, 150)}`);
  if (r.body) console.log('    body:', r.body.slice(0, 300));
}
await ctx.close().catch(() => {});
process.exit(0);
