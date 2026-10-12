// 四家追踪入口体检：YM / EGLV / OOCL / CMA（无头、只读、无副作用）
import { launch, sleep } from '../engine/browser.mjs';

const PAGES = [
  ['yangming', 'https://www.yangming.com/en/esolution/tracking/cargo_tracking'],
  ['evergreen', 'https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do'],
  ['oocl', 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx'],
  ['cma', 'https://www.cma-cgm.com/eBusiness/Tracking'],
];

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
for (const [id, url] of PAGES) {
  const t0 = Date.now();
  const out = { id };
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => { out.gotoErr = String(e).slice(0, 80); return null; });
    out.status = resp ? resp.status() : null;
    await sleep(6000);
    const st = await page.evaluate(() => ({
      title: (document.title || '').slice(0, 70),
      inputs: document.querySelectorAll('input').length,
      buttons: document.querySelectorAll('button, input[type="submit"], a[role="button"]').length,
      text: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 240),
      challenge: /datadome|captcha|challenge|just a moment|人机|验证/i.test(((document.title || '') + ' ' + (document.body ? document.body.innerText : '')).slice(0, 800)),
    })).catch(() => ({}));
    Object.assign(out, st);
  } catch (e) { out.err = String(e).slice(0, 110); }
  out.ms = Date.now() - t0;
  console.log(JSON.stringify(out));
}
await ctx.close().catch(() => {});
