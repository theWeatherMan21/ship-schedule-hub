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
const hits = [];
const attach = (pg) => {
  pg.on('response', async (resp) => {
    const u = resp.url();
    if (/apiPointToPoint|\.do|schedule/i.test(u) && !/\.css|\.js|\.png|\.jpg|\.woff/i.test(u)) {
      try { const t = await resp.text(); hits.push({ u: u.slice(0, 130), status: resp.status(), len: t.length, head: t.slice(0, 120) }); } catch {}
    }
  });
};
attach(page);
ctx.on('page', (p2) => { console.log('🆕 新页:', p2.url().slice(0, 80)); attach(p2); });
const carrier = byId('hmm');
const o = await resolvePort('hmm', 'Ningbo');
const d = await resolvePort('hmm', 'Gdansk');
try { await carrier.run(page, { originText: o.text, destText: d.text, skipDate: true, date: null, raw: {} }, H); } catch (e) { console.log('配方:', String(e).slice(0, 80)); }
await sleep(25000);
console.log('URL 现在:', page.url().slice(0, 100));
console.log('拦截', hits.length, '个:');
hits.slice(0, 10).forEach((x) => console.log(`  [${x.status}] len=${x.len} ${x.u}`));
if (hits.length) console.log('体:', JSON.stringify(hits[0].head));
await ctx.close().catch(() => {});
process.exit(0);
