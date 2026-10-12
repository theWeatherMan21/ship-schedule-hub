// Hapag 结果详情抓取 v2：GET 深链 → 结果表全文 → 找 Details 入口
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';

const BL = process.env.BL || 'HLCUE300F5C71EA7';
const r = await launchHeadedQuiet();
console.log('mode:', r.mode);
const ctx = r.ctx;
const page = ctx.pages().find((p) => !p.isClosed()) || (await ctx.newPage());

try {
  await page.goto('https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution-legacy.html?blno=' + BL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto err', String(e).slice(0, 90)));

  let ok = false;
  for (let i = 0; i < 45; i++) {
    await sleep(2500);
    const st = await page.evaluate(() => {
      const t = document.body.innerText || '';
      return { has: /Container No\./.test(t) && /Status/.test(t), len: t.length, title: (document.title || '').slice(0, 50) };
    }).catch(() => ({}));
    if (i % 4 === 0) console.log(`[w.${i}] len=${st.len} hasTable=${st.has} t="${st.title}"`);
    if (st.has) { ok = true; console.log(`table ready @${i * 2.5}s`); break; }
  }
  console.log('table:', ok);

  if (ok) {
    const full = await page.evaluate(() => (document.body.innerText || '').slice(0, 6000));
    console.log('══ FULL TEXT ══');
    console.log(full);
    const links = await page.evaluate(() => [...document.querySelectorAll('a, button, input[type="submit"], input[type="button"]')]
      .map((x) => ({ tag: x.tagName, t: (x.innerText || x.value || '').trim().slice(0, 30), h: String(x.href || '').slice(0, 140), id: x.id || '' }))
      .filter((x) => /detail|container|track|customs|UWLU/i.test(x.t + ' ' + x.h + ' ' + x.id)).slice(0, 14));
    console.log('LINKS:', JSON.stringify(links, null, 1));
  }
  await page.screenshot({ path: '/Users/russospencer/.hermes/cache/scratch/hapag-result-list.png' }).catch(() => {});
} finally {
  await ctx.close().catch(() => {});
  console.log('closed');
}
