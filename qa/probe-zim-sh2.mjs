
import { readFileSync } from 'node:fs';
const eng = readFileSync(new URL('../engine/fastpath.mjs', import.meta.url), 'utf8');
const key = (eng.match(/const key = '([a-f0-9]+)'/) || [])[1] || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const from = (() => { const d = new Date(Date.now() + 5 * 864e5); return `${String(d.getUTCDate()).padStart(2,'0')}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()}`; })();
const p2p = async (o, d, w) => {
  const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=${encodeURIComponent(o)}&PortDestinationCode=${encodeURIComponent(d)}&Direction=true&FromDate=${from}&WeeksAhead=${w}&CountryCode=US&CargoType=true`;
  const r = await fetch(u, { headers: { accept: 'application/json', origin: 'https://www.zim.com', referer: 'https://www.zim.com/' } });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch {}
  return { status: r.status, n: j && Array.isArray(j.midPoints) ? j.midPoints.length : -1, head: t.slice(0, 90) };
};
// 解析一下 zim 对 shanghai/xiamen 的实际解析路径（模拟引擎）
const { resolvePort } = await import('../engine/lib/portsolve.mjs');
for (const n of ['shanghai', 'xiamen']) {
  const r = await resolvePort('zim', n);
  console.log('resolve zim', n, '→', r.locode, '| name:', r.name || '(?)');
}
console.log('---');
for (const [o, d] of [['CNSNH;10','NLRTM;10'], ['CNXIA;10','NLRTM;10'], ['CNXIA;10','NLRTM'], ['CNSNH;10','NLRTM']]) {
  const a = await p2p(o, d, 12);
  const b = a.n <= 0 ? await p2p(o, d, 6) : a;
  console.log(o, '→', d, ': 12周=', a.n, a.head || '', '| 6周=', b.n, b.head || '');
  await sleep(700);
}
