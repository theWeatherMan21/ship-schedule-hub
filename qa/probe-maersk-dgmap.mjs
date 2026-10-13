// 探针：① 取 Deadlines.vue 组件 JS，找出「站点文案 ← deadlineCode」映射；② 验证 facilityId 可由 routings 直接推出
import { launch, openPage, quietWindow, sleep } from '../engine/browser.mjs';
import { maerskResolve, maerskQuery, maerskRowsFromRoutings } from '../engine/fastpath.mjs';

const ctx = await launch({ headless: true });
const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint');
await sleep(6000);
await quietWindow(ctx, 'minimized').catch(() => {});

// ① 组件 JS 里的映射
const map = await page.evaluate(async () => {
  const out = { url: '', codes: [], texts: [], raw: '' };
  try {
    const html = document.documentElement.innerHTML;
    const m = /src="([^"]*Deadlines[^"]*\.js)"/.exec(html);
    const u = m ? m[1] : '/schedules/assets/Deadlines.vue_vue_type_style_index_0_lang-D1XJm7fN.js';
    out.url = u;
    const t = await (await fetch(u)).text();
    out.len = t.length;
    out.codes = [...new Set([...t.matchAll(/["']([A-Z]{3,6})["']/g)].map((x) => x[1]))].slice(0, 80);
    // 文案附近的片段
    for (const w of ['Container gate-in', 'Empty container pickup', 'Verified Gross Mass', 'Shipping Instructions', 'Dangerous Goods']) {
      const i = t.indexOf(w);
      out.texts.push(i >= 0 ? t.slice(Math.max(0, i - 260), i + 160) : w + ' <<未出现>>');
    }
    out.raw = t.slice(0, 200);
  } catch (e) { out.err = String(e).slice(0, 200); }
  return out;
});
console.log('[probe] 组件 JS:', map.url, 'len=', map.len, map.err || '');
console.log('[probe] 候选码:', JSON.stringify(map.codes));
map.texts.forEach((s, i) => console.log(`\n[probe] 片段${i}:\n` + s.replace(/\s+/g, ' ')));

// ② facilityId 从 routings 推导验证
const rv = await maerskResolve(page, 'Ningbo', 'Ambarli', 'CNNGB', 'TRAMB');
console.log('\n[probe] resolve:', JSON.stringify({ o: rv.o, d0: rv.dList && rv.dList[0], err: rv.error }).slice(0, 300));
const d0 = (rv.dList && rv.dList[0]) || {};
const qr = await maerskQuery(page, rv.o.geo, d0.geo, '2026-10-14', '2026-12-08');
console.log('[probe] routings HTTP', qr && qr.status, 'len', qr && qr.routings && qr.routings.length);
const rows = maerskRowsFromRoutings(qr.routings);
console.log('[probe] rows', rows.length);
for (const r of rows.slice(0, 6)) {
  const leg0 = (r.detail && r.detail.legs && r.detail.legs[0]) || {};
  console.log('   ', r.vessel, r.voyage, r.etd, '| fromCode', leg0.fromCode);
}
// 直接看原始 legs 里的 GEO_ID
for (const rt of (qr.routings || []).slice(0, 6)) {
  const sea = (rt.routingLegs || []).filter((l) => ((l.carriage || {}).carriageType) === 'OCEAN');
  const f = sea[0] || {};
  const st = (f.carriage || {}).vesselPortCallStart || {};
  const fac = (st.location || {}).facility || {};
  const geo = (fac.alternativeCodes || []).map((a) => a.alternativeCode + '/' + a.alternativeCodeType).join(',');
  console.log('[probe] key:', (f.carriage || {}).vessel && ((f.carriage || {}).vessel.vesselMaerskCode), st.departureVoyageNumber, '|', fac.facilityCode, '|', geo);
}

// ③ 用推出来的 key 打 deadlines（页内）
const keys = (qr.routings || []).slice(0, 12).map((rt) => {
  const sea = (rt.routingLegs || []).filter((l) => ((l.carriage || {}).carriageType) === 'OCEAN');
  const f = sea[0] || {};
  const st = (f.carriage || {}).vesselPortCallStart || {};
  const fac = (st.location || {}).facility || {};
  const g = ((fac.alternativeCodes || []).find((a) => a.alternativeCodeType === 'GEO_ID') || {}).alternativeCode;
  return g && (f.carriage.vessel || {}).vesselMaerskCode && st.departureVoyageNumber
    ? { facilityId: g, vesselMaerskCode: f.carriage.vessel.vesselMaerskCode, voyageNumber: st.departureVoyageNumber, deadlineGroupName: 'DOCUMENTATION' }
    : null;
}).filter(Boolean);
console.log('\n[probe] deadlines keys:', JSON.stringify(keys));
const ddl = await page.evaluate(async (body) => {
  try {
    const r = await fetch('https://api.maersk.com/deadlines/queries', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'consumer-key': 'uXe7bxTHLY0yY0e8jnS6kotShkLuAAqG' },
      body: JSON.stringify(body),
    });
    return { status: r.status, text: (await r.text()).slice(0, 12000) };
  } catch (e) { return { status: 0, err: String(e).slice(0, 200) }; }
}, keys);
console.log('[probe] deadlines HTTP', ddl.status, ddl.err || '');
try {
  const arr = JSON.parse(ddl.text);
  for (const it of arr) {
    console.log('  *', it.facilityId, it.vesselMaerskCode, it.voyageNumber);
    for (const dl of it.deadlines || []) console.log('      ', dl.deadlineCode, '|', dl.deadlineName, '|', dl.transportActivity, '|', dl.deadline);
  }
} catch { console.log(ddl.text.slice(0, 400)); }

await ctx.close().catch(() => {});
process.exit(0);
