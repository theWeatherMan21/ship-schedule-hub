// 探针：ZIM 上海码终验 —— CNSNH;0 / CNSNH;10 起运，多目的港
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));
import { launch, openPage, sleep } from '../engine/browser.mjs';

const ctx = await launch({});
const { page } = await openPage(ctx, 'https://www.zim.com/');
await sleep(6000);

const key = '9d63cf020a4c4708a7b0ebfe39578300';
const from = '30-September-2026';
const origins = ['CNNGB;0','CNSNH;0','CNSNH;10']; const ctrl = 1;
const dests = ['TRIST;0','NLRTM;0'];
const out = await page.evaluate(async ({ key, from, origins, dests }) => {
  const res = [];
  for (const o of origins) for (const d of dests) {
    try {
      const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=${encodeURIComponent(o)}&PortDestinationCode=${encodeURIComponent(d)}&Direction=true&FromDate=${from}&WeeksAhead=4&CountryCode=US&CargoType=true`;
      const r = await fetch(u, { headers: { accept: 'application/json' } });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch {}
      const n = Array.isArray(j && j.routes) ? j.routes.length : null;
      res.push({ o, d, status: r.status, routes: n, raw: n === null ? t.slice(0, 140) : '' });
    } catch (e) { res.push({ o, d, err: String(e).slice(0, 70) }); }
  }
  return res;
}, { key, from, origins, dests });
console.log(JSON.stringify(out, null, 1));
await ctx.close().catch(() => {});
