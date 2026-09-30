// 探针2：驱动已打开的 ONE 深链结果页，验证 oneDeep 的等待+抽取（婉宜 9-24）
// 用法：node qa/probe-onedeep.mjs <originLocode> <destLocode> [date]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

import { launchHeadedQuiet, openPage, sleep, shot } from '../engine/browser.mjs';
import { oneDeep } from '../engine/fastpath.mjs';

const [o = 'CNNGB', d = 'TRIST', isoDate = ''] = process.argv.slice(2);
const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const opened = await openPage(ctx, 'https://ecomm.one-line.com/one-ecom/manage-shipment/create-booking', { reuse: true });
  const page = opened.page;
  await sleep(3000);
  const t0 = Date.now();
  const rows = await oneDeep(page, o, d, isoDate);
  console.error(`[oneDeep] took ${((Date.now() - t0) / 1000).toFixed(1)}s url=${page.url().slice(0, 130)}`);
  console.log(JSON.stringify(rows, null, 1));
  if (!rows) {
    const t = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    fs.mkdirSync('qa/probe-out', { recursive: true });
    fs.writeFileSync(`qa/probe-out/one-fail-${d}.txt`, `URL: ${page.url()}\n\n${t.slice(0, 6000)}`);
    await shot(page, 'probe-onedeep-fail');
    console.error('[oneDeep] null — dumped body text');
  }
} catch (e) {
  console.error('[oneDeep] FAIL:', String(e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e).slice(0, 400));
} finally {
  await Promise.race([ctx.close(), sleep(4000)]).catch(() => {});
}
process.exit(0);
