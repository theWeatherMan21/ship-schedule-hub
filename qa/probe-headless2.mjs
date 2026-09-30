// 探针：无窗口模式直接跑配方（不经过 query.mjs CLI），验证「零弹窗 + 仍能抓到船期」
// 用法：SSH_PROFILE_DIR=/tmp/ssh-hl2 node ../qa/probe-headless2.mjs Ningbo Istanbul hmm,evergreen,cma
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launch, openPage, sleep, shot } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage, waitThroughChallenge, pickOption, portPick, typeAndPickCandidate, dateFormats } from '../engine/lib/utils.mjs';
import { setValue, setInputByValueShape, clickByText, fillAutocomplete } from '../engine/lib/dom.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';
import { byId } from '../engine/registry.mjs';

const H = { dismissCookies, isBlockPage, waitThroughChallenge, pickOption, portPick, typeAndPickCandidate, setValue, setInputByValueShape, clickByText, fillAutocomplete, sleep, shot };

const [origin = 'Ningbo', destination = 'Istanbul', list = 'hmm,evergreen,cma'] = process.argv.slice(2);
const isoDate = '';
const qDate = dateFormats(new Date().toISOString().slice(0, 10));

console.log(`=== 无窗口（--headless=new）实测 ${origin}→${destination} | 家=${list} | profile=${process.env.SSH_PROFILE_DIR || '(默认)'}`);
const ctx = await launch({});
const hasPages = ctx.pages().length;
console.log('启动 OK，初始标签页数 =', hasPages, '（无窗口 = 屏幕上不会有 Chrome）');

for (const id of list.split(',').map((s) => s.trim())) {
  const c = byId(id);
  if (!c) { console.log(`!! 未知船司 ${id}`); continue; }
  const qBase = {
    date: qDate, skipDate: true, raw: { origin, destination, date: isoDate },
    _o: await resolvePort(c.id, origin), _d: await resolvePort(c.id, destination),
  };
  const q = new Proxy(qBase, {
    get(t, k) { if (k === 'originText') return t._o?.text ?? origin; if (k === 'destText') return t._d?.text ?? destination; return t[k]; },
  });
  const { page } = await openPage(ctx, c.entry);
  const t0 = Date.now();
  try {
    const out = await Promise.race([
      Promise.resolve(c.run(page, q, H)),
      new Promise((_, rej) => setTimeout(() => rej(new Error('探针超时 ' + (c.timeoutMs || 100000) + 'ms')), c.timeoutMs || 100000)),
    ]);
    const n = (out?.schedules || []).length;
    console.log(`>>> ${c.id}: status=${out?.status} 船期=${n}条 用时=${((Date.now() - t0) / 1000).toFixed(1)}s msg=${String(out?.msg || '').slice(0, 80)}`);
    (out?.schedules || []).slice(0, 3).forEach((s) => console.log(`      ${s.vessel} ${s.voyage} ${s.etd} → ${s.eta} ${s.transitDays}天`));
  } catch (e) {
    console.log(`>>> ${c.id}: 异常 ${String(e).slice(0, 120)}（用时 ${((Date.now() - t0) / 1000).toFixed(1)}s）`);
  }
  await sleep(600);
}
await ctx.close().catch(() => {});
