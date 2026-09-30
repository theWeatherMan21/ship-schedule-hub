import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule', { reuse: true });
await sleep(18000);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
const hits = [];
cdp.on('Network.requestWillBeSent', (e) => {
  const u = e.request.url;
  if (/one-line\.com\/api\//.test(u) && /sched|route|search|port/i.test(u) && !/cookie|banner|log/i.test(u)) {
    hits.push({ m: e.request.method, u: u.slice(0, 220), body: e.request.postData ? e.request.postData.slice(0, 600) : '', headers: e.request.headers });
    console.log('🎯', e.request.method, u.slice(0, 140));
    if (e.request.postData) console.log('   body:', e.request.postData.slice(0, 400));
  }
});
// 触发查询：在 POL 输入 ningbo → 候选 → POD istanbul → 搜索。用配方同款逻辑（ONE 配方已 10/10）
import { byId } from '../engine/registry.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';
import * as utils from '../engine/lib/utils.mjs';
import * as dom from '../engine/lib/dom.mjs';
const carrier = byId('one');
const o = await resolvePort('one', 'Ningbo');
const d = await resolvePort('one', 'Istanbul');
try {
  await carrier.run(page, { originText: o.text, destText: d.text, skipDate: true, date: null, raw: {} }, { ...utils, ...dom, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
  console.log('配方完成');
} catch (e) { console.log('配方:', String(e).slice(0, 100)); }
await sleep(20000);
console.log(hits.length, '条 API');
// dump 关键头
if (hits.length) {
  const h = hits[hits.length - 1];
  console.log('最后请求头:', JSON.stringify(Object.fromEntries(Object.entries(h.headers).filter(([k]) => /content-type|authorization|x-|api/i.test(k))), null, 1).slice(0, 500));
}
await ctx.close().catch(() => {});
process.exit(0);
