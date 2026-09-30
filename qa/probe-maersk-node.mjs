// 探针：node 直连 api.maersk.com（geography + routings-queries）9-29 婉宜
import fs from 'node:fs';
import * as https from 'node:https';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const KEY = 'uXe7bxTHLY0yY0e8jnS6kotShkLuAAqG';

async function req(url, method = 'GET', body = null, headers = {}) {
  const h = { 'user-agent': UA, accept: 'application/json', 'consumer-key': KEY, 'api-version': '1', ...headers };
  if (body) h['content-type'] = 'application/json';
  try {
    const r = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text();
    return { via: 'fetch', status: r.status, text: t };
  } catch (e) {
    const msg = String(e && e.cause || e);
    if (!/certificate/i.test(msg)) return { via: 'fetch', status: 0, text: '', error: msg.slice(0, 160) };
    // Clash TUN MITM：用系统 CA 走 https.request
    const ca = fs.readFileSync('/etc/ssl/cert.pem', 'utf8');
    return await new Promise((resolve) => {
      const u = new URL(url);
      const rq = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, headers: h, ca }, (res) => {
        let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve({ via: 'https', status: res.statusCode, text: d }));
      });
      rq.setTimeout(15000, () => rq.destroy(new Error('timeout')));
      rq.on('error', (er) => resolve({ via: 'https', status: 0, text: '', error: String(er).slice(0, 160) }));
      if (body) rq.write(JSON.stringify(body));
      rq.end();
    });
  }
}

const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const d1 = iso(new Date(today.getTime() + 864e5));
const d29 = iso(new Date(today.getTime() + 29 * 864e5));

for (const city of ['ningbo', 'istanbul', 'ambarli']) {
  const r = await req(`https://api.maersk.com/synergy/reference-data/geography/locations?cityName=${city}&pageSize=25&sort=cityName&type=city`);
  let j = null; try { j = JSON.parse(r.text); } catch { /* no-op */ }
  console.log(`\n== GEO ${city} via=${r.via} status=${r.status} err=${r.error || ''}`);
  if (Array.isArray(j)) j.forEach((x) => console.log('   ', JSON.stringify({ cityName: x.cityName, cc: x.countryCode, rkst: x.maerskRkstCode, geo: x.maerskGeoLocationId, unloc: x.unLocCode, cy: x.hasMaerskContainerYard })));
  else console.log('   raw:', r.text.slice(0, 200));
}

const body = {
  requestType: 'DATED_SCHEDULES', includeFutureSchedules: true, routingCondition: 'PREFERRED',
  exportServiceType: 'CY', importServiceType: 'CY', brandCode: 'MSL',
  startLocation: { dataObject: 'CITY', alternativeCodes: [{ alternativeCodeType: 'GEO_ID', alternativeCode: '104T898SJZ6GU' }], cityCode: '' },
  endLocation: { dataObject: 'CITY', alternativeCodes: [{ alternativeCodeType: 'GEO_ID', alternativeCode: '0FC4MM5Y0O0Z2' }], cityCode: '' },
  timeRange: { routingsBasedOn: 'DEPARTURE_DATE', earliestTime: d1, latestTime: d29 },
  cargo: { cargoType: 'DRY', isTemperatureControlRequired: false },
  carriage: { vessel: { flagCountryCode: '' } },
  equipment: { equipmentSizeCode: '40', equipmentTypeCode: 'HDRY', constructionMaterial: '', isEmpty: false, isShipperOwned: false },
  IsUseOfInternetMarkedRoutesOnly: false,
};
const r2 = await req('https://api.maersk.com/routing-unified/routing/routings-queries', 'POST', body);
console.log(`\n== ROUTINGS via=${r2.via} status=${r2.status} err=${r2.error || ''} len=${r2.text.length}`);
console.log(r2.text.slice(0, 4000));
fs.mkdirSync('qa/probe-out', { recursive: true });
fs.writeFileSync('qa/probe-out/maersk-node-routings.json', r2.text.slice(0, 200000));
