
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  await page.goto('https://www.zim.com/tools/track-a-shipment', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3500);
  const r = await page.evaluate(async () => {
    const t = await (await fetch('/react/static/TrackShipmentV3-CPqAMKxP.js')).text();
    const grab = (needle, n = 3, w = 320) => {
      const out = []; let i = -1;
      while ((i = t.indexOf(needle, i + 1)) !== -1 && out.length < n) out.push(t.slice(Math.max(0, i - w), i + w).replace(/\s+/g, ' '));
      return out;
    };
    return {
      si: grab('SiTracker', 2),
      gt: grab('getTracing', 4),
      sn: grab('sendNonDsa', 3),
      dig: grab('/digital', 6),
      cfg: grab('apimDomain', 4),
    };
  });
  for (const k of ['si', 'gt', 'sn', 'dig', 'cfg']) {
    console.log('══ ' + k + ':');
    for (const c of r[k]) console.log('  …' + c.slice(0, 500) + '\n');
  }
} catch (e) { console.log('ERR ' + String(e).slice(0, 140)); }
await ctx.close();
