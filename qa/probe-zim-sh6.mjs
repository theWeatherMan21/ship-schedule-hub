
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../engine/fastpath.mjs', import.meta.url), 'utf8');
const key = (eng.match(/const key = '([a-f0-9]+)'/) || [])[1] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const from = (() => { const d = new Date(Date.now() + 5 * 864e5); return `${String(d.getUTCDate()).padStart(2,'0')}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`; })();
const loc = async (term) => {
  const u = `https://apigw.zim.com/digitalMasterData/Locations/v1/p2p-route?subscription-key=${key}&searchTerm=${encodeURIComponent(term)}&pageSize=100`;
  const r = await fetch(u, { headers: { accept: 'application/json', origin: 'https://www.zim.com' } });
  const j = await r.json().catch(() => null);
  const list = (j && j.results) || [];
  console.log('LOC', term, '=>', JSON.stringify(list.slice(0, 5).map((x) => x.code + '/' + x.name + '/' + x.locationType)));
};
const p2p = async (o, d, dir = 'true') => {
  const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=${encodeURIComponent(o)}&PortDestinationCode=${encodeURIComponent(d)}&Direction=${dir}&FromDate=${from}&WeeksAhead=12&CountryCode=US&CargoType=true`;
  const r = await fetch(u, { headers: { accept: 'application/json', origin: 'https://www.zim.com', referer: 'https://www.zim.com/' } });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  return { n: j && Array.isArray(j.midPoints) ? j.midPoints.length : -1, msg: (j && j.message) || '' };
};
for (const t of ['CNSNH', 'CNSNH;10', 'CNXIA', 'NLRTM', 'USNYC', 'GEHAM']) { await loc(t); await sleep(600); }
console.log('---');
let a = await p2p('USNYC;10', 'NLRTM;10'); console.log('USNYC;10 → NLRTM;10 :', a.n, a.msg); await sleep(700);
a = await p2p('CNSNH;10', 'NLRTM;10', 'false'); console.log('上海 → NLRTM;10 (Direction=false):', a.n, a.msg); await sleep(700);
a = await p2p('CNSNH;10', 'NLEXP;0'); console.log('上海 → NLEXP;0 :', a.n, a.msg); await sleep(700);
a = await p2p('CNSNH;10', 'NLRTM;3'); console.log('上海 → NLRTM;3 :', a.n, a.msg);
