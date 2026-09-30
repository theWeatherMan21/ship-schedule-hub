// 探针4：HMM 配方跑完后 dump 结果 .do 页的 innerText + 表格 HTML 结构（婉宜 9-24）
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

const [carrierId = 'hmm', origin = 'Ningbo', destination = 'Istanbul', isoDate = ''] = process.argv.slice(2);
const carrier = byId(carrierId);
const qDate = dateFormats(isoDate || new Date().toISOString().slice(0, 10));
const qBase = { date: qDate, skipDate: !isoDate, raw: { origin, destination, date: isoDate } };
const q = new Proxy(qBase, { get(t, k) { if (k === 'originText') return t._o?.text ?? origin; if (k === 'destText') return t._d?.text ?? destination; return t[k]; } });
qBase._o = await resolvePort(carrierId, origin);
qBase._d = await resolvePort(carrierId, destination);
console.error(`[probe] ports: o=${JSON.stringify(qBase._o)} d=${JSON.stringify(qBase._d)}`);

const H = { dismissCookies, isBlockPage, waitThroughChallenge, pickOption, portPick, typeAndPickCandidate, setValue, setInputByValueShape, clickByText, fillAutocomplete, sleep, shot };
const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const opened = await openPage(ctx, carrier.urls[0], { reuse: true });
  const page = opened.page;
  await sleep(2500);
  const r = await carrier.run(page, q, H);
  console.error(`[probe] run: ${JSON.stringify(r).slice(0, 250)}`);
  await sleep(4000);
  // dump 最终页
  const dump = await page.evaluate(() => {
    const tables = [...document.querySelectorAll('table')].map((tb) => ({
      id: tb.id || tb.className || '',
      rows: [...tb.querySelectorAll('tr')].slice(0, 12).map((tr) => [...tr.querySelectorAll('th,td')].map((c) => c.innerText.trim().replace(/\s+/g, ' ').slice(0, 40))),
    })).filter((t) => t.rows.length);
    return { url: location.href, title: document.title, text: document.body.innerText.slice(0, 5000), tables };
  }).catch((e) => ({ err: String(e) }));
  fs.mkdirSync('qa/probe-out', { recursive: true });
  const f = `qa/probe-out/${carrierId}-${destination.toLowerCase()}-dump.json`;
  fs.writeFileSync(f, JSON.stringify(dump, null, 1));
  console.error(`[probe] dumped ${f} url=${(dump.url || '').slice(0, 120)}`);
  await shot(page, `probe-${carrierId}-${destination.toLowerCase()}`);
} catch (e) {
  console.error('[probe] FAIL:', String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e).slice(0, 400));
} finally {
  await Promise.race([ctx.close(), sleep(4000)]).catch(() => {});
}
process.exit(0);
