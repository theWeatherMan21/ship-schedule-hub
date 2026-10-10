
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
  return { status: r.status, n: j && Array.isArray(j.midPoints) ? j.midPoints.length : -1, head: t.slice(0, 130) };
};
// 已知好：青岛→格但斯克 11 条（刚才扫描实录）
const cases = [
  ['CNQIN;10','PLGDZ;10'],   // 已知好（对照）
  ['CNNGB;10','NLRTM;10'],   // 宁波→鹿特丹
  ['CNSNH;10','NLRTM;10'],   // 上海→鹿特丹（问题线）
  ['CNSNH;10','PLGDZ;10'],   // 上海→格但斯克
  ['CNXIA;10','NLRTM;10'],   // 厦门→鹿特丹（问题线）
];
for (const [o, d] of cases) {
  const a = await p2p(o, d, 12);
  console.log(o, '→', d, ': HTTP', a.status, 'n=', a.n, '|', a.head.replace(/\n/g,' '));
  await sleep(800);
}
