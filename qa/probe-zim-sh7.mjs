
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../engine/fastpath.mjs', import.meta.url), 'utf8');
const key = (eng.match(/const key = '([a-f0-9]+)'/) || [])[1] || '';
const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const from = (() => { const d = new Date(Date.now() + 5 * 864e5); return `${String(d.getUTCDate()).padStart(2,'0')}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`; })();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const p2p = async (o, d, cc) => {
  const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=${encodeURIComponent(o)}&PortDestinationCode=${encodeURIComponent(d)}&Direction=true&FromDate=${from}&WeeksAhead=12&CountryCode=${cc}&CargoType=true`;
  const r = await fetch(u, { headers: { accept: 'application/json', origin: 'https://www.zim.com', referer: 'https://www.zim.com/' } });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  return { n: j && Array.isArray(j.midPoints) ? j.midPoints.length : -1, msg: (j && j.message) || '' };
};
for (const cc of ['CN', 'NL', 'IL', 'GB']) {
  const a = await p2p('CNSNH;10', 'NLRTM;10', cc);
  console.log('上海→鹿特丹 CountryCode=' + cc, ':', a.n, a.msg);
  await sleep(650);
}
