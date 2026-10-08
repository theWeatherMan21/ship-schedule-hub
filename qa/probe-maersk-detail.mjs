// 探马士基 routing 原始响应：有没有 legs 细节 + 截单时间（在 maersk 页面上下文里发请求）
import fs from 'node:fs';
import { launch, openPage, quietWindow, sleep } from '../engine/browser.mjs';

const code = fs.readFileSync(new URL('../engine/fastpath.mjs', import.meta.url), 'utf8');
const KEY = (code.match(/MAERSK_KEY\s*=\s*'([^']+)'/) || [])[1] || '';

const ctx = await launch({});
try {
  await quietWindow(ctx, 'minimized').catch(() => {});
  const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint');
  await sleep(7000);

  const out = await page.evaluate(async ({ key }) => {
    const geo = async (city) => {
      const u = `https://api.maersk.com/synergy/reference-data/geography/locations?cityName=${city}&pageSize=25&sort=cityName&type=city`;
      const r = await fetch(u, { headers: { accept: 'application/json', 'consumer-key': key } });
      if (r.status !== 200) return { status: r.status };
      const j = await r.json();
      const arr = Array.isArray(j) ? j : (j.locations || j.content || []);
      const hit = arr.find((x) => String(x.unLocCode || '').toUpperCase() === 'CNNGB') || arr.find((x) => /ningbo/i.test(x.cityName || '')) || arr[0];
      return { status: 200, first: hit || null, n: arr.length };
    };
    const o = await geo('ningbo'); const d = await geo('istanbul');
    if (!o.first || !d.first) return { o, d, note: 'geo 解析失败' };
    const body = {
      requestType: 'DATED_SCHEDULES', includeFutureSchedules: true, routingCondition: 'PREFERRED',
      exportServiceType: 'CY', importServiceType: 'CY', brandCode: 'MSL',
      startLocation: { dataObject: 'CITY', alternativeCodes: [{ alternativeCodeType: 'GEO_ID', alternativeCode: o.first.maerskGeoLocationId }], cityCode: '' },
      endLocation: { dataObject: 'CITY', alternativeCodes: [{ alternativeCodeType: 'GEO_ID', alternativeCode: d.first.maerskGeoLocationId }], cityCode: '' },
      timeRange: { routingsBasedOn: 'DEPARTURE_DATE', earliestTime: new Date(Date.now() + 864e5).toISOString().slice(0, 10), latestTime: new Date(Date.now() + 29 * 864e5).toISOString().slice(0, 10) },
      cargo: { cargoType: 'DRY', isTemperatureControlRequired: false },
      carriage: { vessel: { flagCountryCode: '' } },
      equipment: { equipmentSizeCode: '40', equipmentTypeCode: 'HDRY', constructionMaterial: '', isEmpty: false, isShipperOwned: false },
      IsUseOfInternetMarkedRoutesOnly: false,
    };
    const r = await fetch('https://api.maersk.com/routing-unified/routing/routings-queries', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'consumer-key': key, 'api-version': '1' },
      body: JSON.stringify(body),
    });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch { /* noop */ }
    return { status: r.status, n: ((j && j.routings) || []).length, rt0: (j && j.routings && j.routings[0]) || null, raw: t.slice(0, 200) };
  }, { key: KEY }).catch((e) => ({ error: String(e).slice(0, 160) }));

  console.log('HTTP', out.status, out.error || out.note || '', 'routings:', out.n);
  if (out.rt0) {
    console.log('\n═══ routing[0] 顶层字段 ═══');
    for (const [k, v] of Object.entries(out.rt0)) {
      const t = v && typeof v === 'object' ? (Array.isArray(v) ? `[${v.length}]` : '{...}') : String(v).slice(0, 80);
      console.log(`  ${k}: ${t}`);
    }
    const legs = out.rt0.routingLegs || [];
    console.log(`\n═══ routingLegs ${legs.length} 段 ═══`);
    if (legs[0]) {
      console.log('── legs[0] 全字段 ──');
      for (const [k, v] of Object.entries(legs[0])) console.log(`  ${k}: ${JSON.stringify(v).slice(0, 200)}`);
    }
    console.log('\n═══ 含 cut/close/document/deadline 的字段（递归找一层）═══');
    const scan = (obj, path = '') => {
      if (!obj || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        if (/cut|clos|deadline|document/i.test(k)) console.log(`  ${path}${k} = ${JSON.stringify(v).slice(0, 180)}`);
        else if (v && typeof v === 'object' && path.split('.').length < 3) scan(v, `${path}${k}.`);
      }
    };
    scan(out.rt0);
  } else if (out.raw) console.log('  原始返回:', out.raw);
} finally {
  await ctx.close().catch(() => {});
}
