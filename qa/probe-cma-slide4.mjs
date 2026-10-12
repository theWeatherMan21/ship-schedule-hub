
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
const t0 = Date.now();
const { ctx, mode } = await launchHeadedQuiet();
console.log('launched mode=' + mode);
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  await page.goto('https://www.cma-cgm.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(7000);
  let frame = page.frames().find((f) => /captcha-delivery/.test(f.url()));
  if (!frame) {
    const hasForm = await page.evaluate(() => !!document.querySelector('#AutoCompletePOL'));
    console.log('NO_CHALLENGE form=' + hasForm);
  } else {
    const hb = await frame.locator('.slider').first().boundingBox().catch(() => null);
    const tb = await frame.locator('.sliderTarget').first().boundingBox().catch(() => null);
    if (hb && tb) {
      const hx = hb.x + hb.width / 2, hy = hb.y + hb.height / 2, tx = tb.x + tb.width / 2;
      console.log(`drag (${Math.round(hx)},${Math.round(hy)}) -> (${Math.round(tx)},${Math.round(hy)})`);
      await page.mouse.move(hx + 40, hy + 30); await sleep(400);   // 先"看"一下
      await page.mouse.move(hx, hy); await sleep(220);
      await page.mouse.down(); await sleep(130);
      const dist = tx - hx, segs = 34;
      for (let i = 1; i <= segs; i++) {
        const p = i / segs;
        const ease = p < 0.35 ? (p * p) / 0.245 : 0.5 + (1 - Math.pow(1 - p, 3)) * 0.5;
        await page.mouse.move(hx + dist * ease + (Math.random() - 0.5) * 1.4, hy + (Math.random() - 0.5) * 2);
        await sleep(9 + Math.random() * 15);
      }
      await sleep(180);
      await page.mouse.up();
      await sleep(4000);
    } else console.log('no handle/target');
  }
  await sleep(3000);
  const f2 = page.frames().find((f) => /captcha-delivery/.test(f.url()));
  const main = await page.evaluate(() => ({
    title: document.title, hasForm: !!document.querySelector('#AutoCompletePOL'),
    body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 160),
  }));
  console.log('MAIN: ' + JSON.stringify(main));
  if (f2) {
    const st = await f2.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 160)).catch((e) => 'gone');
    console.log('FRAME: ' + JSON.stringify(st));
  }
  await page.screenshot({ path: '/tmp/cma-slide4.png', timeout: 8000 }).catch(() => console.log('shot skip'));
  console.log('SHOT done, took ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
} catch (e) { console.log('ERR ' + String(e).slice(0, 140)); }
await ctx.close();
