import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.hmm21.com/eng/business/liner/schedule/pointToPoint/index.html', { reuse: true });
await sleep(15000);
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
cdp.on('Network.requestWillBeSent', (e) => {
  if (/apiPointToPointList/.test(e.request.url)) {
    console.log('🎯 头:');
    for (const [k, v] of Object.entries(e.request.headers)) {
      if (/content-type|origin|referer|x-|cookie|accept/i.test(k)) console.log(`  ${k}: ${String(v).slice(0, 100)}`);
    }
    if (e.request.postData) console.log('  body:', e.request.postData.slice(0, 300));
  }
});
// 在页面上手动触发：填 from/to（HMM 配方已能 10/10）—— 直接跑配方
import { byId } from '../engine/registry.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';
import * as utils from '../engine/lib/utils.mjs';
import * as dom from '../engine/lib/dom.mjs';
import { fillAutocomplete } from '../engine/lib/dom.mjs';
const carrier = byId('hmm');
const o = await resolvePort('hmm', 'Ningbo');
const d = await resolvePort('hmm', 'Gdansk');
try {
  await carrier.run(page, { originText: o.text, destText: d.text, skipDate: true, date: null, raw: {} }, { ...utils, ...dom, fillAutocomplete, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
  console.log('配方完成');
} catch (e) { console.log('配方:', String(e).slice(0, 80)); }
await sleep(20000);
await ctx.close().catch(() => {});
process.exit(0);
