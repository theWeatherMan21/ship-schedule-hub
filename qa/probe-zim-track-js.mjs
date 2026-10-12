
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  await page.goto('https://www.zim.com/tools/track-a-shipment', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(4000);
  const r = await page.evaluate(async () => {
    const u = '/react/static/TrackShipmentV3-CPqAMKxP.js';
    const t = await (await fetch(u)).text();
    const hits = [...new Set((t.match(/[^"'`\s]{0,60}(apigw|digitalTrack|Tracking\/|subscription-key|digitalMasterData)[^"'`\s]{0,90}/g) || []))].slice(0, 50);
    return { size: t.length, hits };
  });
  console.log('JS大小: ' + r.size);
  for (const h of r.hits) console.log(' · ' + h);
} catch (e) { console.log('ERR ' + String(e).slice(0, 140)); }
await ctx.close();
