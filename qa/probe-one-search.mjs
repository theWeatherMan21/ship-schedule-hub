// 探针3：ONE 深链后读表单值并点 Search，dump 结果 innerText（婉宜 9-24）
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

import { launchHeadedQuiet, openPage, sleep, shot } from '../engine/browser.mjs';

const [o = 'CNNGB', d = 'TRIST', isoDate = ''] = process.argv.slice(2);
const today = isoDate || new Date().toISOString().slice(0, 10);
const y = today.slice(0, 4), m = String(+today.slice(5, 7));
const u = `https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule?oriLocNmParam=&destLocNmParam=&oriLocCdParam=${o}&destLocCdParam=${d}&oriTermCdPara=Y&desTermCdPara=Y&frmDtParam=${today}&nextWeekValue=14&cargoNature=GP&isEnabledCO2=false&year=${y}&month=${m}&searchType=List&isPolPodOn=false`;

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const opened = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/manage-shipment/create-booking', { reuse: true });
  const page = opened.page;
  await sleep(4000);
  await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(8000);
  // 读表单回显
  const form = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')].map((i) => ({ v: i.value, ph: i.placeholder, n: i.name, t: i.type })).filter((x) => x.v || x.ph);
    return { url: location.href.slice(0, 150), inputs: inputs.slice(0, 12), text: document.body.innerText.slice(0, 1200) };
  }).catch((e) => ({ err: String(e) }));
  console.log('== FORM ==\n' + JSON.stringify(form, null, 1));
  // 点 Search
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean);
    const b = [...document.querySelectorAll('button')].find((x) => /^search$/i.test(x.innerText.trim()));
    if (b) { b.click(); return { ok: true, btns: btns.slice(0, 15) }; }
    return { ok: false, btns: btns.slice(0, 15) };
  }).catch((e) => ({ err: String(e) }));
  console.log('== CLICK ==\n' + JSON.stringify(clicked));
  // 轮询结果
  let text = '';
  for (let i = 0; i < 16; i++) {
    await sleep(2500);
    text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    if (/day\(s\)|Total \d+ results|No results/i.test(text)) break;
  }
  fs.mkdirSync('qa/probe-out', { recursive: true });
  const f = `qa/probe-out/one-search-${d}.txt`;
  fs.writeFileSync(f, `URL: ${page.url()}\n\n${text}`);
  console.log(`== RESULT == len=${text.length} dumped ${f}`);
  await shot(page, `probe-one-search-${d}`);
} catch (e) {
  console.error('FAIL:', String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e).slice(0, 400));
} finally {
  await Promise.race([ctx.close(), sleep(4000)]).catch(() => {});
}
process.exit(0);
