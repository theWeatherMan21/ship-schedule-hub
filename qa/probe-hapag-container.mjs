// Hapag 容器详情抓取：结果页 → 点 Details → 事件时间线全文
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';

const BL = process.env.BL || 'HLCUTS12608CSOQ6';
const r = await launchHeadedQuiet();
console.log('mode:', r.mode);
const ctx = r.ctx;
const page = ctx.pages().find((p) => !p.isClosed()) || (await ctx.newPage());

try {
  await page.goto('https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution-legacy.html?blno=' + BL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto err', String(e).slice(0, 90)));

  let listOk = false;
  for (let i = 0; i < 45; i++) {
    await sleep(2500);
    if (await page.evaluate(() => /Container No\./.test(document.body.innerText || '')).catch(() => false)) { listOk = true; console.log(`list ready @${i * 2.5}s`); break; }
  }
  console.log('list:', listOk);

  if (listOk) {
    const btn = '#tracing_by_booking_f\\:hl27\\:hl53';
    let clicked = false;
    for (let attempt = 0; attempt < 3 && !clicked; attempt++) {
      await page.click(btn, { timeout: 15000 }).then(() => { clicked = true; console.log(`clicked Details (attempt ${attempt})`); }).catch((e) => console.log('click err', String(e).slice(0, 90)));
      await sleep(7000);
      const st = await page.evaluate(() => ({ len: (document.body.innerText || '').length, url: location.href })).catch(() => ({}));
      console.log(`[a${attempt}] len=${st.len} url=${String(st.url).slice(0, 110)}`);
      if ((st.len || 0) > 800) break;
    }
    await sleep(6000);
    const full = await page.evaluate(() => (document.body.innerText || '').slice(0, 8000)).catch(() => '');
    console.log('══ DETAIL FULL TEXT ══');
    console.log(full);
  }
  await page.screenshot({ path: '/Users/russospencer/.hermes/cache/scratch/hapag-container-detail.png' }).catch(() => {});
} finally {
  await ctx.close().catch(() => {});
  console.log('closed');
}
