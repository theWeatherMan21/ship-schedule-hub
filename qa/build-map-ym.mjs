
// 全量建图：阳明 GetLocations 过一遍常用港（名字→它的码；只收同国家前缀）
import { readFileSync, writeFileSync } from 'node:fs';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const names = JSON.parse(readFileSync(new URL('./ports-list.json', import.meta.url), 'utf8'));
const akaRaw = JSON.parse(readFileSync(new URL('../data/port-aka.json', import.meta.url), 'utf8'));
const aka = akaRaw.aka || {};
const inv = {};
for (const [a, lc] of Object.entries(aka)) { (inv[lc] = inv[lc] || []).push(a); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
for (const [lc, name] of Object.entries(names)) {
  const cc = lc.slice(0, 2);
  const cands = new Set([name]);
  const strip = name.replace(/\s*(Pt|Port|Terminal|New Pt|New Port)\.?$/i, '').trim();
  if (strip && strip !== name) cands.add(strip);
  for (const a of (inv[lc] || [])) { if (a.length >= 5 && !a.includes('-') && cands.size < 4) cands.add(a); }
  let got = null, gotName = '', gotCand = '';
  for (const cand of cands) {
    try {
      const r = await fetch(`https://www.yangming.com/api/P2P/GetLocations?queryType=F&searchByCode=TRUE&locationName=${encodeURIComponent(cand)}`, { headers: { 'user-agent': UA, accept: 'application/json' } });
      const j = await r.json().catch(() => null);
      const list = Array.isArray(j) ? j : [];
      const hit = list.find((x) => String(x.locationCode || '').toUpperCase().startsWith(cc));
      if (hit) { got = hit.locationCode; gotName = hit.locationName; gotCand = cand; break; }
    } catch {}
    await sleep(1300);
  }
  out[lc] = { name, ym: got || '', ymName: gotName, via: gotCand };
  console.log(JSON.stringify({ lc, name, ym: got || '', ymName: gotName, via: gotCand }));
  await sleep(1100);
}
writeFileSync(new URL('./ym-map-raw.json', import.meta.url), JSON.stringify(out, null, 1));
console.log('DONE ' + Object.values(out).filter((x) => x.ym).length + '/' + Object.keys(out).length);
