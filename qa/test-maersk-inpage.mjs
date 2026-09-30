// 直接单测 maerskInPage（页内 API 适配器）9-29 婉宜
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import { maerskInPage } from '../engine/fastpath.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
try {
  const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint', { reuse: true });
  await sleep(8000);
  await dismissCookies(page).catch(() => {});
  const o = await resolvePort('maersk', 'Ningbo');
  const d = await resolvePort('maersk', 'Istanbul');
  console.log('dict: o=', JSON.stringify(o), 'd=', JSON.stringify(d));
  const t0 = Date.now();
  const r = await maerskInPage(page, o.locode, d.locode, '', o.name, d.name);
  console.log(`took ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(r, null, 1).slice(0, 3000));
  if (r && r.rows) {
    console.log('\n--- 前 3 行 ---');
    r.rows.slice(0, 3).forEach((x) => console.log(`${x.vessel} ${x.voyage} ETD ${x.etd} → ETA ${x.eta} ${x.transitDays}天 via=${x.via} direct=${x.direct}`));
  }
} catch (e) {
  console.log('!! 异常:', String(e && e.stack || e).slice(0, 500));
} finally {
  await ctx.close().catch(() => {});
  process.exit(0);
}
