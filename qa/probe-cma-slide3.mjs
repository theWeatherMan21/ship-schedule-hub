
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  await page.goto('https://www.cma-cgm.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(7000);
  let frame = page.frames().find((f) => /captcha-delivery/.test(f.url()));
  if (!frame) { console.log('NO_CHALLENGE'); process.exit(0); }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const hb = await frame.locator('.slider').first().boundingBox().catch(() => null);
    const tb = await frame.locator('.sliderTarget').first().boundingBox().catch(() => null);
    if (!hb || !tb) { console.log('attempt', attempt, 'no handle/target'); break; }
    const hx = hb.x + hb.width / 2, hy = hb.y + hb.height / 2;
    const tx = tb.x + tb.width / 2;
    console.log(`attempt ${attempt}: drag (${Math.round(hx)},${Math.round(hy)}) -> (${Math.round(tx)},${Math.round(hy)})`);
    await page.mouse.move(hx, hy);
    await sleep(250);
    await page.mouse.down();
    await sleep(120);
    const dist = tx - hx, segs = 30;
    for (let i = 1; i <= segs; i++) {
      const p = i / segs;
      const ease = p < 0.4 ? (p * p) / 0.32 : 0.5 + (1 - Math.pow(1 - p, 3)) * 0.5; // 混合缓动
      const x = hx + dist * ease + (Math.random() - 0.5) * 1.6;
      const y = hy + (Math.random() - 0.5) * 2.2;
      await page.mouse.move(x, y);
      await sleep(10 + Math.random() * 16);
    }
    await sleep(150);
    await page.mouse.up();
    await sleep(3500);
    const f2 = page.frames().find((f) => /captcha-delivery/.test(f.url()));
    if (!f2) { console.log('CHALLENGE_GONE after attempt', attempt); break; }
    const st = await f2.evaluate(() => ({
      passed: document.querySelector('#analyticsCaptchaPassed') ? document.querySelector('#analyticsCaptchaPassed').getAttribute('data-analytics-captcha-passed') : '?',
      visible: !!document.querySelector('.sliderContainer') && !!document.querySelector('.sliderContainer').offsetParent,
      txt: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
    })).catch((e) => 'gone:' + String(e).slice(0, 60));
    console.log('attempt', attempt, 'state:', JSON.stringify(st));
    if (st === 'gone:' + String(st).slice(5)) break;
  }
  await sleep(2500);
  const main = await page.evaluate(() => ({
    title: document.title, hasForm: !!document.querySelector('#AutoCompletePOL'),
    body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120),
  }));
  console.log('MAIN: ' + JSON.stringify(main));
  await page.screenshot({ path: '/tmp/cma-slide.png' });
  console.log('SHOT /tmp/cma-slide.png');
} catch (e) { console.log('ERR ' + String(e).slice(0, 140)); }
await ctx.close();
