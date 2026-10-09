
// OOCL：直接发搜索接口，不给 captchaToken（试软校验）
import { launch, sleep } from '../engine/browser.mjs';
const r0 = await launch({});
const ctx = r0.ctx || r0;
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://moc.oocl.com/nj_prs_wss/client/sailing_schedules/views/search.html', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(4000);
const out = await page.evaluate(async () => {
  const res = { steps: [] };
  // ① 城市解析拿 id 和时区/国家
  const city = async (q, bound) => {
    const r = await fetch(`https://moc.oocl.com/nj_prs_wss/mocss/secured/supportData/gsp/cityAutoComplete?userQuery=${encodeURIComponent(q)}&bound=${bound}`).then((x) => x.json()).catch(() => null);
    const hit = r && r.data && r.data.results && r.data.results[0];
    return hit ? { id: hit._id, name: hit.Names && hit.Names[0] && hit.Names[0].UpperAdministrativeLocation, country: (hit.CountryCode || hit.countryCode || ''), tz: (hit.TimeZone || hit.timeZone || '') } : null;
  };
  const o = await city('Ningbo', 'OB');
  const d = await city('Hamburg', 'IB');
  res.steps.push('city: ' + JSON.stringify({ o, d }).slice(0, 300));
  if (!o || !d) return { err: 'city resolve failed', steps: res.steps };
  // ② 直接搜索，不带 captchaToken
  const body = {
    date: '2026-10-10', displayDate: '2026-10-10', transhipment_Port: null, port_of_Load: null, port_of_Discharge: null,
    sailing: 'sailing.from', weeks: '12', transhipment_PortId: null, service: null, port_of_LoadId: null, port_of_DischargeId: null,
    origin_Haulage: 'cy', destination_Haulage: 'cy', cargo_Nature: 'dry',
    direction: null, originId: o.id, destinationId: d.id,
    origin: o.name, destination: d.name,
  };
  const sr = await fetch('https://moc.oocl.com/nj_prs_wss/mocss/secured/supportData/nsso/searchHubToHubRoute', {
    method: 'POST', headers: { 'Content-Type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body),
  }).then(async (x) => ({ s: x.status, t: await x.text() })).catch((e) => ({ s: -1, t: String(e) }));
  res.steps.push('search HTTP ' + sr.s + ' body=' + sr.t.slice(0, 220));
  let j = null; try { j = JSON.parse(sr.t); } catch {}
  res.routes = j && j.data && j.data.standardRoutes ? j.data.standardRoutes.length : -1;
  if (res.routes > 0) res.sample = JSON.stringify(j.data.standardRoutes[0]).slice(0, 400);
  return res;
});
console.log(JSON.stringify(out, null, 1).slice(0, 1400));
await ctx.close().catch(() => {});
