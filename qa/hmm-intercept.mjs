import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { byId } from '../engine/registry.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';
import * as utils from '../engine/lib/utils.mjs';
import * as dom from '../engine/lib/dom.mjs';
import { fillAutocomplete } from '../engine/lib/dom.mjs';

const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.hmm21.com/eng/business/liner/schedule/pointToPoint/index.html', { reuse: true });
await sleep(15000);
const H = { ...utils, ...dom, fillAutocomplete, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
// 拦响应
const hits = [];
const h = async (resp) => {
  const u = resp.url();
  if (/apiPointToPoint|schedule.*\.do/i.test(u)) {
    try {
      const t = await resp.text();
      hits.push({ u: u.slice(0, 120), status: resp.status(), len: t.length, head: t.slice(0, 150) });
    } catch {}
  }
};
ctx.on('response', h);
const carrier = byId('hmm');
const o = await resolvePort('hmm', 'Ningbo');
const d = await resolvePort('hmm', 'Gdansk');
try {
  await carrier.run(page, { originText: o.text, destText: d.text, skipDate: true, date: null, raw: {} }, H);
  console.log('配方完成');
} catch (e) { console.log('配方:', String(e).slice(0, 80)); }
await sleep(22000);
console.log('拦截到', hits.length, '个响应:');
hits.forEach((x) => console.log(`  [${x.status}] len=${x.len} ${x.u}`));
if (hits.length) console.log('首响应体:', hits[0].head);
await ctx.close().catch(() => {});
process.exit(0);
