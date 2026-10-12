// Hapag 详情行结构 dump：拿事件表每行的原始 cells（修过滤器用）
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';

const BL = process.env.BL || 'HLCUE300F5C71EA7';
const r = await launchHeadedQuiet();
const ctx = r.ctx;
const page = ctx.pages().find((p) => !p.isClosed()) || (await ctx.newPage());

try {
  await page.goto('https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution-legacy.html?blno=' + BL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

  let listOk = false;
  for (let i = 0; i < 50; i++) {
    await sleep(2500);
    if (await page.evaluate(() => /Container No\./.test(document.body.innerText || '')).catch(() => false)) { listOk = true; break; }
  }
  console.log('list:', listOk);
  if (!listOk) { await ctx.close(); process.exit(0); }

  // 找 Details 按钮并点击
  const btnId = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /detail/i.test(x.innerText || ''));
    return b ? b.id : null;
  });
  console.log('details btn:', btnId);
  if (btnId) {
    await page.click('#' + btnId.replace(/:/g, '\\:')).catch((e) => console.log('click err', String(e).slice(0, 80)));
    let ready = false;
    for (let i = 0; i < 40; i++) {
      await sleep(2500);
      ready = await page.evaluate(() => /Container Information|Place of Activity/i.test(document.body.innerText || '')).catch(() => false);
      if (ready) break;
    }
    console.log('detail ready:', ready);
    if (ready) {
      const dumpAll = await page.evaluate(() => {
        const out = [];
        let ti = 0;
        for (const tbl of document.querySelectorAll('table')) {
          const h = (tbl.innerText || '').slice(0, 300);
          const rows = [...tbl.querySelectorAll('tr')].map((tr) => {
            const cells = [...tr.querySelectorAll('td,th')];
            return { n: cells.length, t: cells.map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 60)) };
          }).filter((x) => x.t.filter(Boolean).length);
          out.push({ table: ti++, head: h.replace(/\s+/g, ' ').slice(0, 120), rows: rows.slice(0, 20) });
        }
        return out;
      }).catch((e) => ({ err: String(e).slice(0, 120) }));
      console.log(JSON.stringify(dumpAll, null, 1).slice(0, 6000));
    }
  }
} finally {
  await ctx.close().catch(() => {});
  console.log('closed');
}
