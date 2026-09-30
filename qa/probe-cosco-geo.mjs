// 探针：COSCO 页内 geo 接口对 gdansk / rotterdam / shanghai 的返回
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));
import { launch, openPage, sleep } from '../engine/browser.mjs';

const ctx = await launch({});
const { page } = await openPage(ctx, 'https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity');
await sleep(5000);
const out = await page.evaluate(async () => {
  const res = {};
  for (const p of ['shanghai', 'gdansk', 'rotterdam', 'Gdansk', 'GDANSK']) {
    try {
      const r = await fetch('/ebbase/public/general/findCityDistrictByPrefix?prefix=' + p, { headers: { accept: 'application/json' } });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch {}
      const c = j && j.data && j.data.content;
      res[p] = { status: r.status, hasContent: Array.isArray(c), n: Array.isArray(c) ? c.length : 0, first: Array.isArray(c) && c[0] ? `${c[0].cityLocName}/${c[0].unloCode}` : '', raw: t.slice(0, 180) };
    } catch (e) { res[p] = { err: String(e).slice(0, 100) }; }
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await ctx.close().catch(() => {});
