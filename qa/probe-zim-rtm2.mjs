
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../engine/fastpath.mjs', import.meta.url), 'utf8');
const key = (eng.match(/const key = '([a-f0-9]+)'/) || [])[1] || '';
const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const from = (() => { const d = new Date(Date.now() + 5 * 864e5); return `${String(d.getUTCDate()).padStart(2,'0')}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`; })();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const loc = async (term) => {
  const u = `https://apigw.zim.com/digitalMasterData/Locations/v1/p2p-route?subscription-key=${key}&searchTerm=${encodeURIComponent(term)}&pageSize=100`;
  const r = await fetch(u, { headers: { accept: 'application/json', origin: 'https://www.zim.com', referer: 'https://www.zim.com/' } });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  const rows = j && (j.data || j.items || j.results || j);
  const out = [];
  if (Array.isArray(rows)) for (const x of rows.slice(0, 40)) out.push([x.locationName || x.name || x.displayName || '?', x.locationCode || x.code || x.pointCode || '?'].join('='));
  return t.length > 4000 ? out.slice(0, 25) : out.slice(0, 25);
};
const p2p = async (o, d, cc) => {
  const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=${encodeURIComponent(o)}&PortDestinationCode=${encodeURIComponent(d)}&Direction=true&FromDate=${from}&WeeksAhead=12&CountryCode=${cc}&CargoType=true`;
  const r = await fetch(u, { headers: { accept: 'application/json', origin: 'https://www.zim.com', referer: 'https://www.zim.com/' } });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  return { http: r.status, n: j && Array.isArray(j.midPoints) ? j.midPoints.length : -1, msg: (j && j.message) || '' };
};
console.log('SHANGHAI:', JSON.stringify(await loc('shanghai')));
await sleep(650);
console.log('ROTTERDAM:', JSON.stringify(await loc('rotterdam')));
await sleep(650);
console.log('HAMBURG:', JSON.stringify(await loc('hamburg')));
for (const [o, d, cc] of [['CNSNH;10','NLRTM;10','NL'], ['CNSNH;10','GEHAM;10','DE'], ['NLRTM;10','CNSNH;10','CN']]) {
  console.log(o, '->', d, 'cc=' + cc, ':', JSON.stringify(await p2p(o, d, cc)));
  await sleep(900);
}
