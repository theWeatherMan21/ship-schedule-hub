
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
let cap = null;
page.on('response', async (r) => {
  if (/synergy\/tracking/.test(r.url())) {
    try { cap = { url: r.url(), status: r.status(), body: (await r.text()).slice(0, 900) }; } catch (e) { cap = { url: r.url(), status: r.status(), body: 'ERR ' + String(e).slice(0, 80) }; }
  }
});
try {
  await page.goto('https://www.maersk.com/tracking/276759780', { waitUntil: 'domcontentloaded', timeout: 50000 });
  for (let i = 0; i < 20 && !cap; i++) await sleep(1500);
  console.log('CAP: ' + JSON.stringify(cap).slice(0, 1400));
  await sleep(2500);
  const b = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400));
  console.log('BODY: ' + b);
} catch (e) { console.log('ERR ' + String(e).slice(0, 130)); }
await ctx.close();
