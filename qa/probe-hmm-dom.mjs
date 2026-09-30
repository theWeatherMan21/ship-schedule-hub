// 探针6：HMM 首页表单 DOM + gotoPortToPort JS 源码 + 候选结构（婉宜 9-24）
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

import { launchHeadedQuiet, openPage, sleep, shot } from '../engine/browser.mjs';

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const opened = await openPage(ctx, 'https://www.hmm21.com/', { reuse: true });
  const page = opened.page;
  await sleep(4000);
  const dom = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')].map((i) => ({ id: i.id, name: i.name, type: i.type, ph: i.placeholder, cls: String(i.className).slice(0, 40), val: String(i.value).slice(0, 30) })).filter((x) => x.type !== 'hidden');
    const hiddens = [...document.querySelectorAll('input[type=hidden]')].map((i) => ({ id: i.id, name: i.name, val: String(i.value).slice(0, 30) }));
    const selects = [...document.querySelectorAll('select')].map((s) => ({ id: s.id, name: s.name, opts: [...s.options].slice(0, 6).map((o) => o.text) }));
    const scripts = [...document.querySelectorAll('script:not([src])')].map((s) => s.textContent).join('\n');
    const fn = scripts.match(/function\s+gotoPortToPort[\s\S]{0,1800}/);
    const labels = [...document.querySelectorAll('label')].map((l) => ({ text: l.innerText.trim().slice(0, 30), for: l.htmlFor })).slice(0, 15);
    return { inputs, hiddens: hiddens.slice(0, 25), selects, gotoSrc: fn ? fn[0] : null, labels };
  }).catch((e) => ({ err: String(e) }));
  fs.mkdirSync('qa/probe-out', { recursive: true });
  fs.writeFileSync('qa/probe-out/hmm3-dom.json', JSON.stringify(dom, null, 1));
  console.log(JSON.stringify(dom, null, 1).slice(0, 4500));
} catch (e) {
  console.error('FAIL:', String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e).slice(0, 400));
} finally {
  await Promise.race([ctx.close(), sleep(4000)]).catch(() => {});
}
process.exit(0);
