
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
const { ctx } = await launchHeadedQuiet();
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://www.zim.com/schedules/point-to-point', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(5000);
await H.dismissCookies(page); await sleep(1000);
const out = await page.evaluate(async () => {
  const key = '9d63cf020a4c4708a7b0ebfe39578300';
  const res = [];
  const t = new Date(Date.now() + 864e5);
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const fdate = `${String(t.getUTCDate()).padStart(2,'0')}-${months[t.getUTCMonth()]}-${t.getUTCFullYear()}`;
  const variants = [
    { name: '原样 CountryCode=US', q: `&CountryCode=US&CargoType=true` },
    { name: 'CountryCode=CN', q: `&CountryCode=CN&CargoType=true` },
    { name: '去 CountryCode', q: `&CargoType=true` },
    { name: 'CargoType=false', q: `&CountryCode=US&CargoType=false` },
    { name: '不带 CargoType', q: `&CountryCode=US` },
    { name: 'WeeksAhead=6', q: `&WeeksAhead=6&CountryCode=US&CargoType=true` },
  ];
  for (const v of variants) {
    const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=${encodeURIComponent('CNNGB;0')}&PortDestinationCode=${encodeURIComponent('ILASD;0')}&Direction=true&FromDate=${fdate}${v.q}`;
    try {
      const r = await fetch(u, { headers: { accept: 'application/json', 'accept-language': 'en-US,en;q=0.9' } });
      const txt = await r.text();
      let j = null; try { j = JSON.parse(txt); } catch {}
      const n = Array.isArray(j && j.routes) ? j.routes.length : -1;
      res.push({ v: v.name, status: r.status, routes: n, msg: (j && (j.message || j.Message || j.error)) || txt.slice(0, 150) });
    } catch (e) { res.push({ v: v.name, status: 'ERR', routes: -1, msg: String(e).slice(0, 90) }); }
  }
  return { fdate, res };
});
console.log('FromDate = ' + out.fdate);
for (const r of out.res) console.log(`   ${r.v.padEnd(22)} HTTP ${r.status} routes=${r.routes} | ${String(r.msg).slice(0, 130)}`);
await ctx.close().catch(() => {});
