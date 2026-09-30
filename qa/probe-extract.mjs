// 探针：跑单家配方的填表+搜索，然后 dump 结果页 innerText/URL 供抽取设计（婉宜 9-24）
// 用法：node qa/probe-extract.mjs <carrierId> <origin> <dest> [date]
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

const [carrierId, origin = 'Ningbo', destination = 'Istanbul', isoDate = ''] = process.argv.slice(2);
const carrier = byId(carrierId);
if (!carrier) { console.error('no carrier ' + carrierId); process.exit(1); }

const qDate = dateFormats(isoDate || new Date().toISOString().slice(0, 10));
const skipDate = !isoDate;
const qBase = { date: qDate, skipDate, raw: { origin, destination, date: isoDate } };
const q = new Proxy(qBase, {
  get(t, k) {
    if (k === 'originText') return t._o?.text ?? origin;
    if (k === 'destText') return t._d?.text ?? destination;
    return t[k];
  },
});
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
  const t0 = Date.now();
  const r = await carrier.run(page, q, H);
  console.error(`[probe] run ok (${Date.now() - t0}ms): ${JSON.stringify(r).slice(0, 300)}`);
  // 配方点搜索后：轮询等结果渲染，dump
  let text = '', url = '';
  for (let i = 0; i < 20; i++) {
    await sleep(2500);
    text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    url = page.url();
    console.error(`[probe] t+${(i + 1) * 2.5}s url=${url.slice(0, 120)} len=${text.length}`);
    if (/\d+ day|\d+ days|transit|schedule|sailing|departure|arrival|etd|eta|vessel|voyage/i.test(text) && text.length > 400) break;
  }
  const outDir = path.join(ROOT, 'qa', 'probe-out');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${carrierId}-${destination.toLowerCase()}-text.txt`), `URL: ${url}\n\n${text}`);
  await shot(page, `probe-${carrierId}-${destination.toLowerCase()}`);
  console.error(`[probe] dumped qa/probe-out/${carrierId}-${destination.toLowerCase()}-text.txt (${text.length} chars)`);
} catch (e) {
  console.error('[probe] FAIL:', String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e).slice(0, 500));
} finally {
  await Promise.race([ctx.close(), sleep(4000)]).catch(() => {});
}
process.exit(0);
