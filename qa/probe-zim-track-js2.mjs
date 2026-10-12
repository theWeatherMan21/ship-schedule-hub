
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  await page.goto('https://www.zim.com/tools/track-a-shipment', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(3500);
  const r = await page.evaluate(async () => {
    const t = await (await fetch('/react/static/TrackShipmentV3-CPqAMKxP.js')).text();
    const out = { size: t.length, ctxs: [], urls: [] };
    let i = -1;
    while ((i = t.indexOf('subscription-key', i + 1)) !== -1) {
      out.ctxs.push(t.slice(Math.max(0, i - 260), i + 120).replace(/\s+/g, ' '));
      if (out.ctxs.length >= 3) break;
    }
    const us = t.match(/https?:\/\/[^"'`\s\\]{6,120}/g) || [];
    out.urls = [...new Set(us)].filter((u) => /zim|api|az|azure|func/i.test(u)).slice(0, 30);
    // 也找拼接式：'digital' 开头的字符串
    out.digital = [...new Set((t.match(/"digital[^"]{0,80}"/g) || []))].slice(0, 20);
    return out;
  });
  console.log('size=' + r.size);
  console.log('── subscription-key 上下文:');
  for (const c of r.ctxs) console.log('  …' + c.slice(0, 330) + '\n');
  console.log('── URL:', JSON.stringify(r.urls));
  console.log('── digital*:', JSON.stringify(r.digital));
} catch (e) { console.log('ERR ' + String(e).slice(0, 140)); }
await ctx.close();
