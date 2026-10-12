
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  await page.goto('https://www.cma-cgm.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(7000);
  for (const f of page.frames()) {
    const u = f.url();
    if (!/captcha-delivery|srcdoc/.test(u)) continue;
    console.log('==== FRAME: ' + u.slice(0, 100));
    try {
      const d = await f.evaluate(() => {
        const out = { bodyHTML: (document.body ? document.body.innerHTML : '').replace(/\s+/g, ' ').slice(0, 1500), cands: [] };
        document.querySelectorAll('*').forEach((el) => {
          const cls = String(el.className || '');
          const id = String(el.id || '');
          const txt = (el.innerText || '').replace(/\s+/g, ' ').slice(0, 30);
          if (/slider|slide|handle|btn|drag/i.test(cls + ' ' + id) || /slide/i.test(txt)) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 5) out.cands.push({ tag: el.tagName, cls: cls.slice(0, 50), id: id.slice(0, 30), txt, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
          }
        });
        out.cands = out.cands.slice(0, 24);
        return out;
      });
      console.log('CANDIDATES: ' + JSON.stringify(d.cands));
      console.log('BODY: ' + d.bodyHTML.slice(0, 900));
    } catch (e) { console.log('  frame eval ERR ' + String(e).slice(0, 100)); }
  }
} catch (e) { console.log('ERR ' + String(e).slice(0, 130)); }
await ctx.close();
