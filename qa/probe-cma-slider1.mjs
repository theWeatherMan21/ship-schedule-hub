
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  await page.goto('https://www.cma-cgm.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(7000);
  const diag = await page.evaluate(() => {
    const out = { url: location.href, title: document.title, iframes: [], cands: [] };
    document.querySelectorAll('iframe').forEach((f) => out.iframes.push(f.src || '(empty)'));
    // 找滑块候选：含 class/text slider 的元素
    document.querySelectorAll('div, span, button, input').forEach((el) => {
      const cls = String(el.className || '').toLowerCase();
      const txt = (el.innerText || '').replace(/\s+/g, ' ').slice(0, 40);
      if (/slider|slide|captcha|ddv|dd_|verification/i.test(cls) || /slide right/i.test(txt)) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.cands.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), txt, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    out.cands = out.cands.slice(0, 20);
    // challenge 根片段的 HTML
    const root = document.querySelector('[class*="ddv"], [id*="ddv"], [class*="captcha"], [id*="captcha"]');
    out.rootHTML = root ? root.outerHTML.slice(0, 700).replace(/\s+/g, ' ') : '(无常见挑战根)';
    return out;
  });
  console.log(JSON.stringify(diag, null, 1).slice(0, 2600));
  // 也看看 frame 里
  const frames = page.frames();
  console.log('FRAMES: ' + frames.map((f) => f.url().slice(0, 90)).join(' || '));
} catch (e) { console.log('ERR ' + String(e).slice(0, 130)); }
await ctx.close();
