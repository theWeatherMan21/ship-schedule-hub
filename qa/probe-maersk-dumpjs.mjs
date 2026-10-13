// 探针：落盘 main JS + i18n en.json，供本地 grep 找 Deadlines 文案映射
import fs from 'node:fs';
import { launch, openPage, quietWindow, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint');
await sleep(8000);
await quietWindow(ctx, 'minimized').catch(() => {});

const res = await page.evaluate(async () => {
  const out = {};
  const grab = async (u) => { try { return await (await fetch(u)).text(); } catch (e) { return 'ERR ' + String(e).slice(0, 80); } };
  out.main = await grab('https://www.maersk.com/schedules/assets/main-CT0q0Fro.js');
  const entries = performance.getEntriesByType('resource').map((e) => e.name);
  const i18n = entries.filter((u) => /content\/keys\/query\/.*\.json/.test(u)).slice(0, 3);
  out.i18n = {};
  for (const u of i18n) out.i18n[u] = await grab(u);
  out.entries = entries.filter((u) => /\.js(\?|$)/.test(u)).length;
  return out;
});
fs.writeFileSync('/tmp/maersk-main.js', res.main || '');
console.log('[probe] main.js len', (res.main || '').length, '| js 资源数', res.entries);
for (const [u, t] of Object.entries(res.i18n || {})) {
  const name = '/tmp/maersk-i18n-' + u.split('/').slice(-1)[0].slice(0, 20) + '.json';
  fs.writeFileSync(name, t);
  console.log('[probe] i18n', u.slice(0, 120), 'len', t.length, '->', name);
}
await ctx.close().catch(() => {});
process.exit(0);
