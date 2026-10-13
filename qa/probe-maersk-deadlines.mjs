// 验证：能否用 routings 响应里的字段直接调 deadlines/queries（决定实现方案）
import fs from 'node:fs';
import { launch, openPage, quietWindow, sleep } from '../engine/browser.mjs';

const code = fs.readFileSync(new URL('../engine/fastpath.mjs', import.meta.url), 'utf8');
const KEY = (code.match(/MAERSK_KEY\s*=\s*'([^']+)'/) || [])[1] || '';

const ctx = await launch({ headless: true });
const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint');
await quietWindow(ctx, 'minimized').catch(() => {});
await sleep(8000);

const { maerskResolve } = await import('../engine/fastpath.mjs');
const rv = await maerskResolve(page, 'Ningbo', 'Ambarli', 'CNNGB', 'TRAMB').catch((e) => ({ error: String(e).slice(0, 120) }));
if (!rv || rv.error) { console.log('resolve 失败:', JSON.stringify(rv).slice(0, 200)); await ctx.close(); process.exit(1); }
const d0 = rv.dList[0];
console.log('[probe] 起运:', rv.o.cityName, rv.o.geo, rv.o.rkst, '| 目的:', d0.cityName, d0.geo, d0.rkst);

const out = await page.evaluate(async ({ key, oG, dG }) => {
  const H = { 'content-type': 'application/json', accept: 'application/json', 'consumer-key': key };
  const rq = await fetch('https://api.maersk.com/routing-unified/routing/routings-queries', {
    method: 'POST', headers: { ...H, 'api-version': '1' },
    body: JSON.stringify({
      requestType: 'DATED_SCHEDULES', includeFutureSchedules: true, routingCondition: 'PREFERRED',
      exportServiceType: 'CY', importServiceType: 'CY', brandCode: 'MSL',
      startLocation: { dataObject: 'CITY', alternativeCodes: [{ alternativeCodeType: 'GEO_ID', alternativeCode: oG }], cityCode: '' },
      endLocation: { dataObject: 'CITY', alternativeCodes: [{ alternativeCodeType: 'GEO_ID', alternativeCode: dG }], cityCode: '' },
      timeRange: { routingsBasedOn: 'DEPARTURE_DATE', earliestTime: new Date(Date.now() + 864e5).toISOString().slice(0, 10), latestTime: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10) },
      cargo: { cargoType: 'DRY', isTemperatureControlRequired: false },
      carriage: { vessel: { flagCountryCode: '' } },
      equipment: { equipmentSizeCode: '40', equipmentTypeCode: 'HDRY', constructionMaterial: '', isEmpty: false, isShipperOwned: false },
      IsUseOfInternetMarkedRoutesOnly: false,
    }),
  });
  const rj = await rq.json();
  const items = [];
  for (const rt of (rj.routings || []).slice(0, 8)) {
    const legs = rt.routingLegs || [];
    const sea = legs.filter((l) => ((l.transportMode || {}).transportModeCode) === 'MVS');
    const f = (sea[0] || legs[0] || {}).carriage || {};
    const st = f.vesselPortCallStart || {};
    const fac = (st.location || {}).facility || {};
    const geoId = ((fac.alternativeCodes || []).find((a) => a.alternativeCodeType === 'GEO_ID') || {}).alternativeCode;
    items.push({
      facilityId: geoId || '',
      facilityCode: fac.facilityCode || '',
      vesselMaerskCode: (f.vessel || {}).vesselMaerskCode || '',
      voyageNumber: st.departureVoyageNumber || '',
      vessel: (f.vessel || {}).vesselName || '',
    });
  }
  // ① 用 routings 里的 facility GEO_ID 试
  const payloadA = items.filter((x) => x.facilityId).map((x) => ({ facilityId: x.facilityId, vesselMaerskCode: x.vesselMaerskCode, voyageNumber: x.voyageNumber, deadlineGroupName: 'DOCUMENTATION' }));
  const rA = await fetch('https://api.maersk.com/deadlines/queries', { method: 'POST', headers: H, body: JSON.stringify(payloadA) });
  const tA = await rA.text();
  // ② 用页面同款 facilityId（3JZPDO9X1OI32）对照
  const payloadB = items.slice(0, 3).map((x) => ({ facilityId: '3JZPDO9X1OI32', vesselMaerskCode: x.vesselMaerskCode, voyageNumber: x.voyageNumber, deadlineGroupName: 'DOCUMENTATION' }));
  const rB = await fetch('https://api.maersk.com/deadlines/queries', { method: 'POST', headers: H, body: JSON.stringify(payloadB) });
  const tB = await rB.text();
  return { items, a: { status: rA.status, body: tA.slice(0, 1500) }, b: { status: rB.status, body: tB.slice(0, 1500) } };
}, { key: KEY, oG: rv.o.geo, dG: d0.geo });

console.log('\n══ routings 里提取的装运段 ══');
for (const it of out.items) console.log(' ', JSON.stringify(it));
console.log('\n══ ① 用 routings 的 facilityGEO_ID → deadlines ══');
console.log('HTTP', out.a.status);
console.log(out.a.body.replace(/\s+/g, ' ').slice(0, 700));
console.log('\n══ ② 用页面同款 facilityId(3JZPDO9X1OI32) → deadlines ══');
console.log('HTTP', out.b.status);
console.log(out.b.body.replace(/\s+/g, ' ').slice(0, 900));
fs.writeFileSync('/tmp/maersk-deadlines-test.json', JSON.stringify(out, null, 1));
console.log('\n[probe] 落盘 /tmp/maersk-deadlines-test.json');
await ctx.close().catch(() => {});
process.exit(0);
