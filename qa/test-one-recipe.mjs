// 单测 ONE 配方（浏览器兜底路径，模拟 fastpath 不可用时）9-29 婉宜
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';
import * as utils from '../engine/lib/utils.mjs';
import * as dom from '../engine/lib/dom.mjs';
import { byId } from '../engine/registry.mjs';

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const { page } = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule', { reuse: true });
  const o = await resolvePort('one', 'Ningbo');
  const d = await resolvePort('one', 'Istanbul');
  const q = { raw: { origin: 'Ningbo', destination: 'Istanbul', date: '' }, skipDate: true, date: null, _o: o, _d: d, originText: o.text, destText: d.text };
  console.log('dict:', JSON.stringify(o), JSON.stringify(d));
  const t0 = Date.now();
  const r = await byId('one').run(page, q, { ...utils, ...dom, sleep: (ms) => new Promise((x) => setTimeout(x, ms)) });
  console.log(`配方 ${((Date.now() - t0) / 1000).toFixed(1)}s →`, JSON.stringify(r).slice(0, 1400));
} catch (e) {
  console.log('!! 异常:', String(e && e.stack || e).slice(0, 400));
} finally {
  await ctx.close().catch(() => {});
  process.exit(0);
}
