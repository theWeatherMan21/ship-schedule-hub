// qa/probe-codes2.mjs — 船司码头码矩阵探测（2026-10-10）
// 目的：对每个中国基港，测出 ONE / 阳明 / ZIM 各自接受哪种码；
//       目的地同理。全部直连 API，安静无浏览器。
// 用法: node qa/probe-codes2.mjs > /tmp/codes-matrix.jsonl
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (u) => {
  try {
    const r = await fetch(u, { headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' } });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch { /* */ }
    return { s: r.status, j, head: t.slice(0, 70) };
  } catch (e) { return { s: -1, err: String(e).slice(0, 70) }; }
};
const iso = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const isoC = (n) => iso(n).replace(/-/g, '');

// —— 中国基港候选码（联合国 vs 行业老码）
const CN_PORTS = {
  shanghai: ['CNSHA', 'CNSHG', 'CNSGH'],
  ningbo: ['CNNGB', 'CNNBG'],
  qingdao: ['CNTAO', 'CNQIN', 'CNQDG'],
  tianjin: ['CNTXG', 'CNTNJ', 'CNTNG'],
  xingang: ['CNTXG', 'CNXGA', 'CNXIP'],
  shenzhen: ['CNSZX', 'CNSZP', 'CNYTN'],
  yantian: ['CNYTN', 'CNSZX'],
  xiamen: ['CNXMN', 'CNXMG'],
  dalian: ['CNDLC', 'CNDAL', 'CNDAG'],
  nansha: ['CNNSA'],
};
// —— 目的地候选（全部到 Rotterdam 为主测线：服务密集，无结果≈码不对）
const DESTS = ['NLRTM', 'DEHAM', 'PLGDN', 'TRIST', 'ILASH', 'AEJEA', 'SGSIN', 'USLAX', 'USNYC', 'BEANR', 'GBFXT', 'GRPIR'];

async function oneAt(code, dest) {
  const r = await get(`https://ecomm.one-line.com/api/v1/schedule/point-to-point?porCode=${code}&delCode=${dest}&rcvTermCode=Y&deTermCode=Y&tsFlag=&fromDate=${iso(6)}&toDate=${iso(48)}&cargoNature=GP&searchType=List&sourcePage=schedule`);
  const n = r.j && Array.isArray(r.j.scheduleLines) ? r.j.scheduleLines.length : -1;
  return { s: r.s, n, head: n < 1 ? (r.head || r.err || '') : '' };
}
async function ymAt(from, to) {
  const r = await get(`https://www.yangming.com/api/P2P/GetP2PRoutes?locationCodeFrom=${from}&serviceTermFrom=Y&locationCodeTo=${to}&serviceTermTo=Y&priorityWay=ALL&dateDefinition=DEP&startDate=${isoC(6)}&endDate=${isoC(48)}`);
  const n = Array.isArray(r.j) ? r.j.length : -1;
  return { s: r.s, n, head: n < 1 ? (r.head || r.err || '') : '' };
}
import { readFileSync } from 'node:fs';
const ZKEY = (() => { try { const e = readFileSync(new URL('../engine/fastpath.mjs', import.meta.url), 'utf8'); return (e.match(/subscription-key=([A-Za-z0-9]+)/) || [])[1] || ''; } catch { return ''; } })();
async function zimLoc(name) {
  const r = await get(`https://apigw.zim.com/digitalMasterData/Locations/v1/p2p-route?subscription-key=${ZKEY}&searchTerm=${encodeURIComponent(name)}&pageSize=100`);
  const items = r.j && Array.isArray(r.j.items) ? r.j.items : [];
  const marine = items.filter((x) => JSON.stringify(x.locationType || x.LocationType || '').includes('MARINE'));
  return { s: r.s, marine: marine.map((x) => (x.code || x.Code || x.locationCode || '')).slice(0, 3), head: items.length === 0 ? (r.head || r.err || '') : '' };
}

const OUT = (o) => console.log(JSON.stringify(o));

// ① 中国基港 → Rotterdam：找每家接受的码
for (const [port, codes] of Object.entries(CN_PORTS)) {
  for (const code of codes) {
    const a = await oneAt(code, 'NLRTM');
    OUT({ test: 'one', port, code, dest: 'NLRTM', status: a.s, rows: a.n, head: a.head });
    await sleep(400);
    const b = await ymAt(code, 'NLRTM');
    OUT({ test: 'ym', port, code, dest: 'NLRTM', status: b.s, rows: b.n, head: b.head });
    await sleep(400);
  }
}
// ② 目的港（从宁波 CNNGB 出发，服务密集）
for (const dest of DESTS) {
  const a = await oneAt('CNNGB', dest);
  OUT({ test: 'one-dest', dest, code: dest, status: a.s, rows: a.n, head: a.head });
  await sleep(400);
  const b = await ymAt('CNNGB', dest);
  OUT({ test: 'ym-dest', dest, code: dest, status: b.s, rows: b.n, head: b.head });
  await sleep(400);
}
console.log('DONE');
