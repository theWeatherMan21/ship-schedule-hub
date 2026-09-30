// 探针11：Evergreen 主页表单结构 + Search 行为（婉宜 9-24）
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

import { launchHeadedQuiet, openPage, sleep, shot } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const opened = await openPage(ctx, 'https://www.shipmentlink.com/', { reuse: true });
  const page = opened.page;
  await sleep(4000);
  await dismissCookies(page);
  const dom = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input, select, textarea')].map((i) => ({ tag: i.tagName, id: i.id, name: i.name, type: i.type, ph: i.placeholder, val: String(i.value).slice(0, 25) })).filter((x) => !['hidden', 'checkbox', 'radio', 'submit', 'button', 'image'].includes(x.type));
    const btns = [...document.querySelectorAll('button, a')].map((b) => ({ tag: b.tagName, id: b.id, text: (b.innerText || '').trim().slice(0, 30), onclick: String(b.getAttribute('onclick') || '').slice(0, 60), href: String(b.href || '').slice(0, 80) })).filter((x) => /search|sail|schedule|advance/i.test(x.text + x.onclick + x.href + x.id)).slice(0, 20);
    const tabs = [...document.querySelectorAll('[role=tab], .tab, li')].map((t) => (t.innerText || '').trim()).filter((t) => t && t.length < 40 && /search by/i.test(t));
    return { url: location.href, inputs: inputs.slice(0, 20), btns, tabs: [...new Set(tabs)].slice(0, 10) };
  }).catch((e) => ({ err: String(e) }));
  fs.mkdirSync('qa/probe-out', { recursive: true });
  fs.writeFileSync('qa/probe-out/evg-dom.json', JSON.stringify(dom, null, 1));
  console.log(JSON.stringify(dom, null, 1).slice(0, 3000));
} catch (e) {
  console.error('FAIL:', String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e).slice(0, 400));
} finally {
  await Promise.race([ctx.close(), sleep(4000)]).catch(() => {});
}
process.exit(0);
