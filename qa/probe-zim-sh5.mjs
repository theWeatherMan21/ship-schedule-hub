
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../engine/fastpath.mjs', import.meta.url), 'utf8');
const key = (eng.match(/const key = '([a-f0-9]+)'/) || [])[1] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const from = (() => { const d = new Date(Date.now() + 5 * 864e5); return `${String(d.getUTCDate()).padStart(2,'0')}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`; })();
const p2p = async (o, d, weeks = 12) => {
  const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=${encodeURIComponent(o)}&PortDestinationCode=${encodeURIComponent(d)}&Direction=true&FromDate=${from}&WeeksAhead=${weeks}&CountryCode=US&CargoType=true`;
  const r = await fetch(u, { headers: { accept: 'application/json', origin: 'https://www.zim.com', referer: 'https://www.zim.com/' } });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, n: j && Array.isArray(j.midPoints) ? j.midPoints.length : -1, msg: (j && j.message) || '' };
};
const cases = [
  ['CNSNH;10','GEHAM;10','上海→汉堡(正确码)'],
  ['CNQIN;10','NLRTM;10','青岛→鹿特丹'],
  ['NLRTM;10','CNSNH;10','鹿特丹→上海(反向)'],
  ['CNSNH;10','USNYC;10','上海→纽约'],
  ['CNSNH;10','ILASH;10','上海→阿什杜德'],
  ['CNXIA;10','GEHAM;10','厦门→汉堡'],
];
for (const [o, d, tag] of cases) {
  const a = await p2p(o, d);
  console.log(tag, o, '→', d, ':', a.status, 'n=', a.n, a.msg);
  await sleep(700);
}
