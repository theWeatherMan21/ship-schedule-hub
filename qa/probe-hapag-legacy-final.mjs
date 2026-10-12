// Hapag legacy 最终试验：清空输入 → 逐字输入完整 BL → 提交 → 读结果
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';

const BL = process.env.BL || 'HLCUTS12609DETN4';
const r = await launchHeadedQuiet();
console.log('mode:', r.mode);
const ctx = r.ctx;
const page = ctx.pages().find((p) => !p.isClosed()) || (await ctx.newPage());

try {
  await page.goto('https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution-legacy.html', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto err', String(e).slice(0, 100)));

  const SEL = 'input[id="tracing_by_booking_f:hl16"]';
  let ok = false;
  for (let i = 0; i < 70; i++) {
    await sleep(2500);
    if (await page.locator(SEL).count().catch(() => 0)) { ok = true; console.log(`form ready @${i * 2.5}s`); break; }
  }
  if (!ok) { console.log('NO FORM'); } else {
    // 1) 先看空/现有值
    console.log('initial value:', JSON.stringify(await page.locator(SEL).inputValue().catch(() => '?')));
    // 2) 清空（三重保险）
    await page.click(SEL).catch(() => {});
    await page.keyboard.press('Control+A').catch(() => {});
    await page.keyboard.press('Meta+A').catch(() => {});
    await page.keyboard.press('Backspace').catch(() => {});
    await page.fill(SEL, '').catch(() => {});
    await sleep(400);
    console.log('after clear:', JSON.stringify(await page.locator(SEL).inputValue().catch(() => '?')));
    // 3) 逐字输入
    await page.locator(SEL).pressSequentially(BL, { delay: 55 }).catch((e) => console.log('type err', String(e).slice(0, 80)));
    const rb = await page.locator(SEL).inputValue().catch(() => '?');
    console.log('readback:', JSON.stringify(rb), 'len:', String(rb).length);
    await sleep(800);
    // 4) 提交
    await page.click('#tracing_by_booking_f\\:hl18').catch((e) => console.log('click err', String(e).slice(0, 80)));
    console.log('submitted at', new Date().toISOString().slice(11, 19));
    // 5) 等结果
    let done = false;
    for (let i = 0; i < 24 && !done; i++) {
      await sleep(2500);
      const st = await page.evaluate(() => {
        const txt = (document.body.innerText || '');
        const msg = (document.querySelector('#HlMessages') || {}).innerText || '';
        const tbl = [...document.querySelectorAll('table')].find((t) => {
          const h = (t.innerText || '').slice(0, 700);
          return /status/i.test(h) && /place of activity/i.test(h);
        });
        return { len: txt.length, msg: String(msg).replace(/\s+/g, ' ').trim().slice(0, 200), rows: tbl ? tbl.querySelectorAll('tr').length : 0, url: location.href };
      }).catch(() => ({}));
      console.log(`[F.${i}] rows=${st.rows} msg="${st.msg}" len=${st.len} url=${String(st.url).slice(0, 120)}`);
      if ((st.rows && st.rows > 1) || (st.msg && st.msg.length > 3) || /does not exist|no data|not found/i.test(st.msg || '')) done = true;
    }
    const fin = await page.evaluate(() => ({ url: location.href, text: (document.body.innerText || '').slice(0, 3800) })).catch(() => ({}));
    console.log('══ FINAL ══');
    console.log(fin.text || JSON.stringify(fin));
    await page.screenshot({ path: '/Users/russospencer/.hermes/cache/scratch/hapag-after-submit.png' }).catch((e) => console.log('shot1 err', String(e).slice(0, 80)));
    // 直接 GET 结果 URL 复访（服务端渲染路径）
    await page.goto('https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution-legacy.html?blno=' + BL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto2 err', String(e).slice(0, 80)));
    await sleep(9000);
    await page.screenshot({ path: '/Users/russospencer/.hermes/cache/scratch/hapag-direct-get.png' }).catch(() => {});
    const d2 = await page.evaluate(() => ({ url: location.href, bodyLen: (document.body.innerText || '').length, text: (document.body.innerText || '').slice(0, 1600) })).catch(() => ({}));
    console.log('DIRECT GET:', JSON.stringify(d2).slice(0, 1700));
  }
} finally {
  await ctx.close().catch(() => {});
  console.log('closed');
}
