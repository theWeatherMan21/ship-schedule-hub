// 探针9：Maersk 配方执行后跟踪结果渲染（XHR + 表单回显 + 长轮询）（婉宜 9-24）
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

import { launchHeadedQuiet, openPage, sleep, shot } from '../engine/browser.mjs';
import { byId } from '../engine/registry.mjs';
import { dateFormats, dismissCookies, isBlockPage, waitThroughChallenge, pickOption, portPick, typeAndPickCandidate } from '../engine/lib/utils.mjs';
import { setValue, setInputByValueShape, clickByText, fillAutocomplete } from '../engine/lib/dom.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';

const [origin = 'Ningbo', destination = 'Istanbul', isoDate = ''] = process.argv.slice(2);
const carrier = byId('maersk');
const qDate = dateFormats(isoDate || new Date().toISOString().slice(0, 10));
const qBase = { date: qDate, skipDate: !isoDate, raw: { origin, destination, date: isoDate } };
const q = new Proxy(qBase, { get(t, k) { if (k === 'originText') return t._o?.text ?? origin; if (k === 'destText') return t._d?.text ?? destination; return t[k]; } });
qBase._o = await resolvePort('maersk', origin);
qBase._d = await resolvePort('maersk', destination);

const H = { dismissCookies, isBlockPage, waitThroughChallenge, pickOption, portPick, typeAndPickCandidate, setValue, setInputByValueShape, clickByText, fillAutocomplete, sleep, shot };
const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const opened = await openPage(ctx, carrier.urls[0], { reuse: true });
  const page = opened.page;
  await sleep(2500);
  const xhrs = [];
  page.on('response', (r) => {
    const u = r.url();
    if (/api|schedules|route|synergy|geo/i.test(u) && !/\.(png|jpg|css|js|woff|map)/.test(u) && !/optimizely|analytics|cookie/i.test(u)) {
      xhrs.push(`${r.status()} ${r.request().method()} ${u.slice(0, 170)}`);
    }
  });
  const r = await carrier.run(page, q, H);
  console.error(`[probe] run: ${JSON.stringify(r).slice(0, 200)}`);
  // 表单回读
  const form = await page.evaluate(() => {
    const cbs = [...document.querySelectorAll('[role=combobox], input[role=combobox]')].map((c) => c.value || c.innerText);
    return { combos: cbs, url: location.href };
  }).catch(() => null);
  console.log('FORM:', JSON.stringify(form));
  // 长轮询等结果（结果区应该出现 Direct/Transshipment/Vessel 等词）
  let text = '';
  for (let i = 0; i < 24; i++) {
    await sleep(3000);
    text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    const has = /(direct|transshipment|via)/i.test(text) && /days/i.test(text);
    if (i % 4 === 0) console.log(`t+${(i + 1) * 3}s len=${text.length} has=${has}`);
    if (has) break;
  }
  fs.mkdirSync('qa/probe-out', { recursive: true });
  fs.writeFileSync('qa/probe-out/maersk-ist-text.txt', `URL: ${page.url()}\n\n${text}`);
  console.log('XHRS:', JSON.stringify(xhrs.slice(-15), null, 0));
  console.log('final len:', text.length);
  await shot(page, 'probe-maersk-ist');
} catch (e) {
  console.error('FAIL:', String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e).slice(0, 500));
} finally {
  await Promise.race([ctx.close(), sleep(4000)]).catch(() => {});
}
process.exit(0);
