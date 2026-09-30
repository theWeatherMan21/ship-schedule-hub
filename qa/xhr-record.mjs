// 给 runCarrier 挂 XHR 记录：跑一家 → 存它发的所有 API 请求（URL+method+body）
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { CARRIERS, byId } from '../engine/registry.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';
import fs from 'node:fs';

const targets = (process.argv[2] || 'cma,cosco,hmm,evergreen,one,hapag,maersk,zim').split(',');
const origin = process.argv[3] || 'Ningbo';
const dest = process.argv[4] || 'Istanbul';

const { ctx } = await launchHeadedQuiet();
const all = {};

for (const id of targets) {
  const carrier = byId(id);
  if (!carrier) continue;
  console.log(`\n═══ ${id} ═══`);
  const reqs = [];
  const handler = (req) => {
    const u = req.url();
    if (/\.(css|js|png|jpg|webp|svg|woff2?|gif|ico)(\?|$)/i.test(u)) return;
    if (/cls_report|google|doubleclick|analytics|datadome|maze|hotjar|sentry/i.test(u)) return;
    reqs.push({ method: req.method(), url: u.slice(0, 220), body: (req.postData() || '').slice(0, 300) });
  };
  const respHandler = async (resp) => {
    const u = resp.url();
    const m = reqs.find((r) => u.startsWith(r.url.slice(0, 150)));
    if (m && !m.respHead) {
      try { m.respHead = (await resp.text()).slice(0, 400); m.status = resp.status(); } catch {}
    }
  };
  ctx.on('request', handler);
  ctx.on('response', respHandler);
  try {
    const { page } = await openPage(ctx, carrier.entry, { reuse: true });
    await sleep(6000);
    const o = await resolvePort(id, origin);
    const d = await resolvePort(id, dest);
    await carrier.run(page, { originText: o.text, destText: d.text, skipDate: true, date: null }, {}).catch((e) => console.log('  配方:', String(e).slice(0, 80)));
    await sleep(12000);  // 等结果请求发出
  } catch (e) { console.log('  err:', String(e).slice(0, 100)); }
  ctx.removeListener('request', handler);
  ctx.removeListener('response', respHandler);
  // 只留像是数据接口的
  const dataReqs = reqs.filter((r) => /api|json|search|schedul|route|voyage|sailing|p2p|query|list/i.test(r.url) || r.method === 'POST');
  console.log(`  数据请求 ${dataReqs.length} 条:`);
  dataReqs.slice(0, 8).forEach((r) => {
    console.log(`   [${r.status || '?'}] ${r.method} ${r.url.slice(0, 130)}`);
    if (r.body) console.log(`        body: ${r.body.slice(0, 120)}`);
  });
  all[id] = dataReqs;
}

fs.writeFileSync('../docs/xhr-record.json', JSON.stringify(all, null, 1));
console.log('\n→ docs/xhr-record.json');
await ctx.close().catch(() => {});
process.exit(0);
