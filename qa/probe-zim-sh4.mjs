
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../engine/fastpath.mjs', import.meta.url), 'utf8');
const key = (eng.match(/const key = '([a-f0-9]+)'/) || [])[1] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const from = (() => { const d = new Date(Date.now() + 5 * 864e5); return `${String(d.getUTCDate()).padStart(2,'0')}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`; })();
const p2p = async (o, d) => {
  const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=${encodeURIComponent(o)}&PortDestinationCode=${encodeURIComponent(d)}&Direction=true&FromDate=${from}&WeeksAhead=12&CountryCode=US&CargoType=true`;
  const r = await fetch(u, { headers: { accept: 'application/json', origin: 'https://www.zim.com', referer: 'https://www.zim.com/' } });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, n: j && Array.isArray(j.midPoints) ? j.midPoints.length : -1, msg: j ? j.message || '' : '' };
};
// ① Rotterdam 的原始条目（全字段）
const u = `https://apigw.zim.com/digitalMasterData/Locations/v1/p2p-route?subscription-key=${key}&searchTerm=rotterdam&pageSize=100`;
const r = await fetch(u, { headers: { accept: 'application/json', origin: 'https://www.zim.com' } });
const j = await r.json();
const first = (j.results || []).filter((x) => /MARINE/.test(x.locationType || ''))[0];
console.log('ROTTERDAM-RAW', JSON.stringify(first));
await sleep(600);
// ② 变体矩阵
for (const d of ['NLRTM;10', 'NLRTM;0', 'NLRTM;1', 'NLRTM;2', 'NLRTM;11', 'NLRTM;12']) {
  const a = await p2p('CNSNH;10', d);
  console.log('上海 →', d, ':', a.status, 'n=', a.n, a.msg);
  await sleep(700);
}
// ③ 其他目的港是否正常（对照）
for (const d of ['DEHAM;10', 'BEANR;10', 'GBFXT;10', 'SGSIN;10']) {
  const a = await p2p('CNSNH;10', d);
  console.log('上海 →', d, ':', a.status, 'n=', a.n, a.msg);
  await sleep(700);
}
