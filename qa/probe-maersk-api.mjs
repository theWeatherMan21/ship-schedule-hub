// 探针：验证 Maersk routings-queries API 能否页内 fetch + 探响应结构（9-29 婉宜）
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
const hdrs = [];
ctx.on('request', (r) => {
  if (/routing-unified|geography\/locations/.test(r.url())) {
    hdrs.push({ m: r.method(), u: r.url().slice(0, 220), h: Object.fromEntries(Object.entries(r.headers()).filter(([k]) => /content-type|accept|authoriz|x-|api|cookie|consumer|token/i.test(k))) });
  }
});
try {
  const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint', { reuse: true });
  await sleep(9000);
  await dismissCookies(page).catch(() => {});

  // ① 页内拿 GEO_ID：geography locations API
  const geo = await page.evaluate(async () => {
    const q = async (city) => {
      const r = await fetch(`https://api.maersk.com/synergy/reference-data/geography/locations?cityName=${city}&pageSize=25&sort=cityName&type=city`, { headers: { accept: 'application/json' } });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch { return { status: r.status, raw: t.slice(0, 300) }; }
      return { status: r.status, keys: Object.keys(j), sample: JSON.stringify(j).slice(0, 2500) };
    };
    return { ningbo: await q('ningbo'), istanbul: await q('istanbul') };
  }).catch((e) => ({ error: String(e).slice(0, 200) }));
  console.log('== GEO ==');
  console.log(JSON.stringify(geo, null, 1).slice(0, 4500));

  // ② 页内 POST routings-queries（用候选里拿到的 GEO_ID/rkstCode 组合做实验）
  const combos = [
    { name: 'TRAMB-CY(ambarli)', endGeo: '0FC4MM5Y0O0Z2', toRkst: 'TRAMB' },
  ];
  for (const c of combos) {
    const res = await page.evaluate(async ({ endGeo }) => {
      const body = {
        requestType: 'DATED_SCHEDULES', includeFutureSchedules: true, routingCondition: 'PREFERRED',
        exportServiceType: 'CY', importServiceType: 'CY', brandCode: 'MSL',
        startLocation: { dataObject: 'CITY', alternativeCodes: [{ alternativeCodeType: 'GEO_ID', alternativeCode: '104T898SJZ6GU' }], cityCode: '' },
        endLocation: { dataObject: 'CITY', alternativeCodes: [{ alternativeCodeType: 'GEO_ID', alternativeCode: endGeo }], cityCode: '' },
        timeRange: { routingsBasedOn: 'DEPARTURE_DATE', earliestTime: '2026-09-30', latestTime: '2026-10-28' },
        cargo: { cargoType: 'DRY', isTemperatureControlRequired: false },
        carriage: { vessel: { flagCountryCode: '' } },
        equipment: { equipmentSizeCode: '40', equipmentTypeCode: 'HDRY', constructionMaterial: '', isEmpty: false, isShipperOwned: false },
        IsUseOfInternetMarkedRoutesOnly: false,
      };
      try {
        const r = await fetch('https://api.maersk.com/routing-unified/routing/routings-queries', {
          method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(body),
        });
        const t = await r.text();
        return { status: r.status, len: t.length, head: t.slice(0, 3000) };
      } catch (e) { return { error: String(e).slice(0, 200) }; }
    }, c).catch((e) => ({ error: String(e).slice(0, 200) }));
    console.log(`\n== ROUTINGS ${c.name} ==`);
    console.log(JSON.stringify(res, null, 1).slice(0, 3500));
    fs.mkdirSync('qa/probe-out', { recursive: true });
    fs.writeFileSync(`qa/probe-out/maersk-routings-${c.toRkst}.json`, JSON.stringify(res, null, 1));
  }
} catch (e) {
  console.log('!! 异常:', String(e).slice(0, 300));
} finally {
  console.log('\n== 请求头 ==');
  hdrs.slice(0, 8).forEach((h) => console.log('  ', h.m, h.u.slice(0, 90), JSON.stringify(h.h).slice(0, 300)));
  fs.writeFileSync('qa/probe-out/maersk-api-headers.json', JSON.stringify(hdrs, null, 1));
  await ctx.close().catch(() => {});
  process.exit(0);
}
