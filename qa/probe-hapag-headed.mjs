// Hapag 追踪 · 有头过盾试验（爹地 10-12 指令）
// 姿势：有头 + 立即最小化（quietWindow）；CF 挑战若出现 checkbox 则尝试点击；最多 ~100s。
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { isBlockPage } from '../engine/lib/utils.mjs';

const ctx = await launch({ headless: false });
await quietWindow(ctx, 'minimized');
const page = ctx.pages()[0] || (await ctx.newPage());
console.log('headed browser launched (minimized)');

const resp = await page.goto('https://www.hapag-lloyd.com/en/online-business/track/track.html', {
  waitUntil: 'domcontentloaded', timeout: 60000,
}).catch((e) => { console.log('goto err:', String(e).slice(0, 110)); return null; });
console.log('status:', resp ? resp.status() : null);

let passed = false;
let clicked = 0;
for (let i = 0; i < 30; i++) {
  await sleep(3200);
  let st = null;
  try {
    st = await page.evaluate(() => ({
      t: (document.title || '').slice(0, 70),
      len: (document.body ? document.body.innerText || '' : '').length,
    }));
  } catch { /* page may be mid-navigation */ }
  const blocked = await isBlockPage(page).catch(() => true);
  console.log(`[${String(i).padStart(2)}] blocked=${blocked} len=${st ? st.len : '?'} title="${st ? st.t : '?'}"`);

  // 挑战 iframe 里如有 checkbox → 尝试点击一次
  if (blocked && clicked < 3) {
    try {
      for (const f of page.frames()) {
        if (/challenges\.cloudflare\.com/.test(f.url())) {
          const cb = await f.$('input[type="checkbox"], .mark').catch(() => null);
          if (cb) { await cb.click({ timeout: 2500 }).catch(() => {}); clicked += 1; console.log('  → clicked CF checkbox attempt #' + clicked); }
        }
      }
    } catch { /* ignore */ }
  }
  if (!blocked && st && st.len > 400) { passed = true; break; }
}

console.log('PASSED =', passed, '| checkbox clicks =', clicked);

if (passed) {
  const info = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    text: (document.body.innerText || '').slice(0, 1200),
    inputs: [...document.querySelectorAll('input')].map((x) => ({ id: x.id, name: x.name, ph: x.placeholder || '', type: x.type })).slice(0, 25),
    links: [...document.querySelectorAll('a')].map((a) => ({ t: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 45), h: a.href })).filter((x) => /track|booking|container|tracing/i.test(x.t + ' ' + x.h)).slice(0, 12),
  })).catch((e) => ({ err: String(e).slice(0, 120) }));
  console.log('── PAGE DUMP ──');
  console.log(JSON.stringify(info, null, 1).slice(0, 3500));
}

await ctx.close();
console.log('closed.');
