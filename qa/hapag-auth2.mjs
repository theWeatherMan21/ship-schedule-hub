// 用配方跑 hapag（会点搜索），CDP 拦 routes 的请求头 + 响应体
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { byId } from '../engine/registry.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';
import * as utils from '../engine/lib/utils.mjs';
import * as dom from '../engine/lib/dom.mjs';
import fs from 'node:fs';

const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.hapag-lloyd.com/solutions/vessel-schedule/#/?language=en', { reuse: true });
await sleep(28000);

let captured = null;
const cdp = await ctx.newCDPSession(page).catch(() => null);
if (cdp) {
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (e) => {
    if (/schedule\.api\.hlag\.cloud\/api\/routes/.test(e.request.url) && !captured) {
      captured = { url: e.request.url, headers: e.request.headers, body: e.request.postData };
      console.log('🎯 routes 请求!');
      for (const [k, v] of Object.entries(e.request.headers)) {
        if (/auth|key|token/i.test(k)) console.log(`  ${k}: ${String(v).slice(0, 80)}`);
      }
      if (e.request.postData) console.log('  body:', e.request.postData.slice(0, 300));
    }
  });
  cdp.on('Network.responseReceived', async (e) => {
    if (/schedule\.api\.hlag\.cloud\/api\/routes/.test(e.response.url)) {
      console.log('  响应:', e.response.status, e.response.mimeType);
      try {
        const { result } = await cdp.send('Network.getResponseBody', { requestId: e.requestId });
        console.log('  响应体前 600:', (result.body || '').slice(0, 600));
        fs.writeFileSync('../docs/hapag-routes-resp.json', (result.body || '').slice(0, 100000));
      } catch (err) { console.log('  读响应失败:', String(err).slice(0, 60)); }
    }
  });
}
const carrier = byId('hapag');
const o = await resolvePort('hapag', 'Ningbo');
const d = await resolvePort('hapag', 'Istanbul');
try {
  await carrier.run(page, { originText: o.text, destText: d.text, skipDate: true, date: null, raw: {} }, { ...utils, ...dom, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
  console.log('配方完成');
} catch (e) { console.log('配方:', String(e).slice(0, 80)); }
await sleep(25000);
console.log(captured ? '✅ 拦到请求' : '❌ 没拦到（配方可能没点搜索）');
await ctx.close().catch(() => {});
process.exit(0);
