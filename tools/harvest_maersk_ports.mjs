// 抓 Maersk 城市/港口名录（他们的 reference-data 接口，公开 consumer-key）——
// page 参数无效，改用「前缀枚举」：先单字母，命中 100（饱和）就拆成两位前缀继续。
import { writeFileSync } from 'node:fs';
const MK = 'uXe7bxTHLY0yY0e8jnS6kotShkLuAAqG';
const seen = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function q(prefix) {
  const u = `https://api.maersk.com/synergy/reference-data/geography/locations?cityName=${prefix}&pageSize=100&sort=cityName&type=city`;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(u, { headers: { accept: 'application/json', 'consumer-key': MK }, signal: AbortSignal.timeout(20000) });
      if (r.status !== 200) { await sleep(500); continue; }
      const j = await r.json();
      return Array.isArray(j) ? j : [];
    } catch { await sleep(700); }
  }
  return null;
}
const letters = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
let calls = 0;
for (const L of letters) {
  const rows = await q(L); calls++;
  if (rows === null) { console.log(`前缀 ${L}: 失败`); continue; }
  for (const r of rows) if (r.cityName) seen.set(r.cityName.toLowerCase() + '|' + (r.unLocCode || ''), r);
  let sub = '';
  if (rows.length >= 100) {
    sub = ` (饱和→拆两位)`;
    for (const L2 of letters) {
      const rows2 = await q(L + L2); calls++;
      if (!rows2) continue;
      for (const r of rows2) if (r.cityName) seen.set(r.cityName.toLowerCase() + '|' + (r.unLocCode || ''), r);
      if (rows2.length >= 100) sub += ` ${L}${L2}饱和`;
      await sleep(80);
    }
  }
  console.log(`前缀 ${L}: ${rows.length} 条${sub} · 累计 ${seen.size}`);
  await sleep(80);
}
const out = [...seen.values()].map((r) => ({ name: r.cityName, locode: r.unLocCode || null, country: r.countryCode || null, yard: !!r.hasMaerskContainerYard }));
writeFileSync('data/carrier-ports-maersk.json', JSON.stringify({ source: 'api.maersk.com/synergy/reference-data/geography/locations (公开 consumer-key，只读)', count: out.length, ports: out }, null, 0));
console.log(`\n完成：${out.length} 个城市/港口，HTTP 调用 ${calls} 次`);
console.log('带 LOCODE 的:', out.filter((x) => x.locode).length, '· 有堆场的:', out.filter((x) => x.yard).length);
