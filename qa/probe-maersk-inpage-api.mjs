// 探针：页内 fetch routings-queries（带 consumer-key）+ geography('ambarli') 结构 9-29 婉宜
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const d1 = iso(new Date(today.getTime() + 864e5));
const d29 = iso(new Date(today.getTime() + 29 * 864e5));

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint', { reuse: true });
  await sleep(8000);
  await dismissCookies(page).catch(() => {});

  const geo = await page.evaluate(async () => {
    const g = async (c) => {
      const r = await fetch(`https://api.maersk.com/synergy/reference-data/geography/locations?cityName=${c}&pageSize=25&sort=cityName&type=city`, { headers: { accept: 'application/json' } });
      const j = await r.json().catch(() => null);
      return { status: r.status, list: Array.isArray(j) ? j.map((x) => ({ cityName: x.cityName, cc: x.countryCode, rkst: x.maerskRkstCode, geo: x.maerskGeoLocationId, unloc: x.unLocCode })) : j };
    };
    return { ambarli: await g('ambarli'), istanbul: await g('istanbul') };
  }).catch((e) => ({ error: String(e).slice(0, 200) }));
  console.log('== GEO ==\n' + JSON.stringify(geo, null, 1).slice(0, 1800));

  const res = await page.evaluate(async ({ d1, d29, geo }) => {
    const body = {
      requestType: 'DATED_SCHEDULES', includeFutureSchedules: true, routingCondition: 'PREFERRED',
      exportServiceType: 'CY', importServiceType: 'CY', brandCode: 'MSL',
      startLocation: { dataObject: 'CITY', alternativeCodes: [{ alternativeCodeType: 'GEO_ID', alternativeCode: '104T898SJZ6GU' }], cityCode: '' },
      endLocation: { dataObject: 'CITY', alternativeCodes: [{ alternativeCodeType: 'GEO_ID', alternativeCode: geo }], cityCode: '' },
      timeRange: { routingsBasedOn: 'DEPARTURE_DATE', earliestTime: d1, latestTime: d29 },
      cargo: { cargoType: 'DRY', isTemperatureControlRequired: false },
      carriage: { vessel: { flagCountryCode: '' } },
      equipment: { equipmentSizeCode: '40', equipmentTypeCode: 'HDRY', constructionMaterial: '', isEmpty: false, isShipperOwned: false },
      IsUseOfInternetMarkedRoutesOnly: false,
    };
    try {
      const r = await fetch('https://api.maersk.com/routing-unified/routing/routings-queries', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'consumer-key': 'uXe7bxTHLY0yY0e8jnS6kotShkLuAAqG', 'api-version': '1' },
        body: JSON.stringify(body),
      });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch { /* no-op */ }
      return { status: r.status, len: t.length, keys: j ? Object.keys(j) : null, head: t.slice(0, 3500) };
    } catch (e) { return { error: String(e).slice(0, 200) }; }
  }, { d1, d29, geo: '0FC4MM5Y0O0Z2' }).catch((e) => ({ error: String(e).slice(0, 200) }));
  console.log('\n== ROUTINGS TRAMB ==');
  console.log(JSON.stringify(res, null, 1).slice(0, 4500));
  fs.mkdirSync('qa/probe-out', { recursive: true });
  fs.writeFileSync('qa/probe-out/maersk-inpage-routings.json', JSON.stringify(res, null, 1));
} catch (e) {
  console.log('!! 异常:', String(e).slice(0, 300));
} finally {
  await ctx.close().catch(() => {});
  process.exit(0);
}
