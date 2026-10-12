// Hapag 表单直查探针 —— 发现「维护横幅」与「表单可用」并存，绕过 banner 短路直接试查询
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import { isBlockPage } from '../engine/lib/utils.mjs';

const BL = process.env.BL || 'HLCU2B9E986E7C5E';
const r = await launchHeadedQuiet();
console.log('mode:', r.mode);
const ctx = r.ctx;
const page = ctx.pages().find((p) => !p.isClosed()) || (await ctx.newPage());

try {
  const LEGACY = process.env.LEGACY !== '0';
  const url = (LEGACY
    ? 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution-legacy.html?blno=' + BL
    : 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html?blno=' + BL);
  const resp = await page.goto(url, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  }).catch((e) => { console.log('goto err', String(e).slice(0, 100)); return null; });
  console.log('http:', resp ? resp.status() : null);

  // 过盾：轮询直到「真表单出现」（inputs>0）或正文显著增长；最长 ~175s
  let passed = false;
  for (let i = 0; i < 70; i++) {
    await sleep(2500);
    const st = await page.evaluate(() => ({
      len: (document.body ? document.body.innerText || '' : '').length,
      inputs: document.querySelectorAll('input[id^="tracing_by_booking_f"], input').length,
      title: (document.title || '').slice(0, 60),
    })).catch(() => ({ len: 0, inputs: 0, title: '?' }));
    const blk = await isBlockPage(page).catch(() => true);
    if (i % 4 === 0) console.log(`[${i}] blk=${blk} len=${st.len} inputs=${st.inputs} t="${st.title}"`);
    if (!blk && (st.inputs > 0 || st.len > 2000)) { passed = true; console.log(`shield passed @${i * 2.5}s (len=${st.len} inputs=${st.inputs})`); break; }
  }
  if (!passed) { console.log('shield NOT passed'); } else {
    // 等「真表单」渲染（最长 45s）再定位
    const FORM_SEL = 'input[id="tracing_by_booking_f:hl16"], input[id="tracing_by_booking_f:hl12"]';
    let ready = false;
    try { await page.waitForSelector(FORM_SEL, { timeout: 45000, state: 'attached' }); ready = true; } catch { ready = false; }
    console.log('form ready:', ready);
    if (!ready) {
      const diag = await page.evaluate(() => ({
        title: document.title, url: location.href, len: (document.body.innerText || '').length,
        text: (document.body.innerText || '').slice(0, 900),
        inputs: [...document.querySelectorAll('input')].map((x) => ({ id: x.id, type: x.type, name: x.name })).slice(0, 12),
      })).catch((e) => ({ err: String(e).slice(0, 100) }));
      console.log('DIAG:', JSON.stringify(diag, null, 1).slice(0, 1600));
    }
    const found = ready ? await page.locator('input[id="tracing_by_booking_f:hl16"]').count().catch(() => 0) : 0;
    console.log('BL field count:', found);
    if (found) {
      await page.fill('input[id="tracing_by_booking_f:hl16"]', BL).catch((e) => console.log('fill err', String(e).slice(0, 90)));
      const rb = await page.locator('input[id="tracing_by_booking_f:hl16"]').inputValue().catch(() => '');
      console.log('filled readback:', rb);
      // Find
      await page.click('#tracing_by_booking_f\\:hl18', { timeout: 15000 }).then(() => console.log('clicked Find ✓')).catch(async () => {
        console.log('id-click failed → role button');
        await page.getByRole('button', { name: /^\s*find\s*$/i }).first().click({ timeout: 15000 }).then(() => console.log('clicked Find(role) ✓')).catch(() => {});
      });
      // 等「真结果」：结果表头（Status+Place of Activity）或明确否定；给足 60s
      let dumped = false;
      for (let i = 0; i < 24; i++) {
        await sleep(2500);
        const st = await page.evaluate(() => {
          const msg = document.querySelector('#HlMessages');
          const msgT = msg ? (msg.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 250) : '';
          const tbl = [...document.querySelectorAll('table')].find((t) => {
            const head = (t.innerText || '').slice(0, 700);
            return /status/i.test(head) && /place of activity/i.test(head);
          });
          const tblRows = tbl ? tbl.querySelectorAll('tr').length : 0;
          const txt = (document.body.innerText || '');
          return { msgT, tblRows, noData: /no data|not found|no container|invalid|not available|could not/i.test(txt), len: txt.length };
        }).catch(() => ({}));
        console.log(`[R.${i}] msg="${st.msgT || ''}" tblRows=${st.tblRows || 0} noData=${st.noData} len=${st.len}`);
        if ((st.tblRows && st.tblRows > 1) || st.noData || (st.msgT && st.msgT.length > 3)) { dumped = true; console.log('── 命中 ──'); break; }
      }
      const fin = await page.evaluate(() => ({ text: (document.body.innerText || '').slice(0, 3600), url: location.href })).catch((e) => ({ err: String(e).slice(0, 100) }));
      console.log('══ FINAL DUMP (' + (dumped ? 'hit' : 'timeout') + ') ══');
      console.log(fin.text || JSON.stringify(fin));
    }
  }
} finally {
  await ctx.close().catch(() => {});
  console.log('closed');
}
