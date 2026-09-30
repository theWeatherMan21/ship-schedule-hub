// 探针：ZIM 上海码 —— 页内 fetch Locations suggest + P2P 码扫（headless）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));
import { launch, openPage, sleep } from '../engine/browser.mjs';

const ctx = await launch({});
const { page } = await openPage(ctx, 'https://www.zim.com/');
await sleep(6000);

// ① Locations suggest（页面自带 key）
const loc = await page.evaluate(async () => {
  const tries = [
    '/digitalMasterData/Locations/v1/p2p-route?searchTerm=shanghai&subscription-key=9d63cf020a4c4708a7b0ebfe39578300',
    '/digitalMasterData/Locations/v1/p2p-route?searchTerm=shanghai',
    '/digitalMasterData/Locations/v1/p2p-route?SearchTerm=shanghai',
  ];
  const out = [];
  for (const p of tries) {
    try {
      const r = await fetch('https://apigw.zim.com' + p, { headers: { accept: 'application/json' } });
      const t = await r.text();
      out.push({ p: p.slice(0, 70), status: r.status, body: t.slice(0, 600) });
    } catch (e) { out.push({ p: p.slice(0, 70), err: String(e).slice(0, 80) }); }
  }
  return out;
});
console.log('=== ZIM Locations suggest ===');
console.log(JSON.stringify(loc, null, 1));

// ② P2P 码扫：shanghai→rotterdam，试多个上海码
const key = '9d63cf020a4c4708a7b0ebfe39578300';
const from = '30-September-2026';
const codes = ['CNSHA;0', 'CNSHA;10', 'CNSGS;0', 'CNSGH;0', 'CNPDG;0', 'CNSH;0', 'CNSHA'];
const swept = await page.evaluate(async ({ key, from, codes }) => {
  const out = [];
  for (const c of codes) {
    try {
      const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=${encodeURIComponent(c)}&PortDestinationCode=${encodeURIComponent('NLRTM;0')}&Direction=true&FromDate=${from}&WeeksAhead=4&CountryCode=US&CargoType=true`;
      const r = await fetch(u, { headers: { accept: 'application/json' } });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch {}
      out.push({ code: c, status: r.status, routes: Array.isArray(j && j.routes) ? j.routes.length : (j ? 'noRoutes' : (t || '').slice(0, 90)) });
    } catch (e) { out.push({ code: c, err: String(e).slice(0, 80) }); }
  }
  return out;
}, { key, from, codes });
console.log('=== ZIM P2P code sweep (shanghai→rotterdam NLRTM;0) ===');
console.log(JSON.stringify(swept, null, 1));

await ctx.close().catch(() => {});
