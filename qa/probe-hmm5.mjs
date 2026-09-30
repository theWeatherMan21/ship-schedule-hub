// 探针8：HMM e-service P2P —— 用正确字段 srchPointFrom/srchPointTo + btnRetrieve（婉宜 9-24）
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

import { launchHeadedQuiet, openPage, sleep, shot } from '../engine/browser.mjs';

const [origin = 'Ningbo', destination = 'Istanbul', oLocode = 'CNNGB', dLocode = 'TRHAY'] = process.argv.slice(2);
const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const opened = await openPage(ctx, 'https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do', { reuse: true });
  const page = opened.page;
  await sleep(5000);
  const xhrs = [];
  page.on('response', async (r) => {
    const u = r.url();
    if (/\.do/i.test(u) && !/\.(png|jpg|css|js|ico|woff)/.test(u)) xhrs.push(`${r.status()} ${r.request().method()} ${u.slice(0, 150)}`);
  });

  const pick = async (inpSel, word, wantLocode) => {
    const inp = page.locator(inpSel);
    await inp.click({ timeout: 8000 });
    await inp.fill('').catch(() => {});
    await inp.type(word.toLowerCase(), { delay: 80 });
    // 等候选（HMM 候选结构未知：抓所有可见 li/下拉项）
    let picked = null;
    for (let i = 0; i < 16; i++) {
      await sleep(1000);
      const found = await page.evaluate(({ want }) => {
        const els = [...document.querySelectorAll('li, [class*=suggest] li, [class*=autocomplete] li, .ui-menu-item, [class*=dropdown] *')].filter((el) => {
          const t = (el.innerText || '').trim();
          return el.offsetParent && t.length > 4 && !/loading/i.test(t) && (t.toUpperCase().includes(want) || t.includes(want));
        });
        // 取最内层（最深）的匹配元素
        els.sort((a, b) => b.querySelectorAll('*').length - a.querySelectorAll('*').length);
        if (els.length) {
          const el = els[0];
          const txt = el.innerText.trim().replace(/\s+/g, ' ').slice(0, 70);
          el.click();
          return txt;
        }
        return null;
      }, { want: wantLocode });
      if (found) { picked = found; break; }
    }
    return picked;
  };

  const pO = await pick('#srchPointFrom', origin, oLocode);
  console.log('picked origin:', JSON.stringify(pO));
  await sleep(1200);
  const pD = await pick('#srchPointTo', destination, dLocode);
  console.log('picked dest:', JSON.stringify(pD));
  await sleep(1200);
  // 回读表单
  const state = await page.evaluate(() => {
    const g = (id) => { const el = document.getElementById(id); return el ? String(el.value).slice(0, 40) : '(none)'; };
    return { from: g('srchPointFrom'), fromCode: g('srchPointFrom_code'), to: g('srchPointTo'), toCode: g('srchPointTo_code'), date: g('srchSailDate'), weeks: g('srchSelWeeks') };
  });
  console.log('FORM:', JSON.stringify(state));
  if (!state.fromCode && !state.toCode) { console.log('BOTH CODES EMPTY — abort'); process.exit(0); }

  // 点 Retrieve
  xhrs.length = 0;
  await page.evaluate(() => { const b = document.getElementById('btnRetrieve'); if (b) b.click(); });
  // 等结果：body 变长或出现表格
  let resultUrl = '';
  for (let i = 0; i < 14; i++) {
    await sleep(2500);
    const st = await page.evaluate(() => ({ url: location.href, len: document.body.innerText.length, nTables: document.querySelectorAll('table').length, sample: document.body.innerText.slice(0, 200).replace(/\n/g, '|') })).catch(() => null);
    console.log(`t+${(i + 1) * 2.5}s`, JSON.stringify(st).slice(0, 320));
    if (st && (st.nTables > 0 || st.len > 2500)) { resultUrl = st.url; break; }
  }
  console.log('XHRS:', JSON.stringify(xhrs.slice(-10), null, 0));
  const dump = await page.evaluate(() => {
    const tables = [...document.querySelectorAll('table')].map((tb) => ({
      cls: String(tb.className).slice(0, 50),
      nRows: tb.querySelectorAll('tr').length,
      rows: [...tb.querySelectorAll('tr')].slice(0, 8).map((tr) => [...tr.querySelectorAll('th,td')].map((c) => (c.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 30))),
    })).filter((t) => t.nRows > 1);
    return { url: location.href, text: document.body.innerText.slice(0, 5000), tables };
  }).catch((e) => ({ err: String(e) }));
  fs.mkdirSync('qa/probe-out', { recursive: true });
  fs.writeFileSync(`qa/probe-out/hmm5-${destination.toLowerCase()}.json`, JSON.stringify(dump, null, 1));
  console.log('TABLES:', JSON.stringify(dump.tables || [], null, 0).slice(0, 2500));
  await shot(page, `probe-hmm5-${destination.toLowerCase()}`);
} catch (e) {
  console.error('FAIL:', String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e).slice(0, 500));
} finally {
  await Promise.race([ctx.close(), sleep(4000)]).catch(() => {});
}
process.exit(0);
