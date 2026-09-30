// 探针：Maersk 目的地候选逐个实测（选候选→点 Search→看回显）9-29 婉宜
// 用法：node qa/probe-maersk-variants.mjs
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

import { launchHeadedQuiet, openPage, sleep, shot } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage } from '../engine/lib/utils.mjs';

const ENTRY = 'https://www.maersk.com/schedules/pointToPoint';
// [打字词, 目标候选标签（ariaSnapshot 里含此子串）]
const VARIANTS = [
  ['istanbul', 'Istanbul, Turkey CY'],
  ['istanbul', 'Ambarli Port Istanbul, Turkey CY'],
  ['istanbul', 'Istanbul, Turkey SD'],
  ['ambarli', 'Ambarli Port Istanbul, Turkey CY'],
];

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
let reqs = [];
ctx.on('request', (r) => {
  const u = r.url();
  if (/api\.maersk\.com/.test(u) && !/reference-data|vessel|audience|experiment|signals|analytics|site-search|dqcs|argus/i.test(u)) {
    reqs.push({ m: r.method(), u: u.slice(0, 350), b: (r.postData() || '').slice(0, 900) });
  }
});

const results = [];
try {
  for (const [word, label] of VARIANTS) {
    reqs = [];
    const { page } = await openPage(ctx, ENTRY, { reuse: true });
    await sleep(9000);
    await dismissCookies(page).catch(() => {});
    if (await isBlockPage(page)) { console.log('!! 被拦截'); }
    const r = { word, label, picked: null, oVal: '', dVal: '', echo: false, count: null, text: '', err: '' };
    try {
      const from = page.getByRole('combobox', { name: /from \(city, country\/region\)/i }).first();
      await from.waitFor({ state: 'visible', timeout: 30000 });
      const opts = page.locator('[role="option"]');
      const typeAndPick = async (field, w, match) => {
        await field.click({ timeout: 8000 }).catch(() => {});
        await field.fill('').catch(() => {});
        await field.type(w, { delay: 80 }).catch(() => {});
        for (let i = 0; i < 15; i++) {
          await sleep(1000);
          const n = await opts.count().catch(() => 0);
          if (!n) continue;
          const list = [];
          for (let k = 0; k < Math.min(n, 25); k++) {
            let s = ''; try { s = await opts.nth(k).ariaSnapshot(); } catch { /* no-op */ }
            const t = (s || '').replace(/\s+/g, ' ').trim();
            if (t) list.push({ k, t });
          }
          const hit = list.find((x) => x.t.includes(match));
          if (hit) { await opts.nth(hit.k).click({ timeout: 5000 }).catch(() => {}); await sleep(1500); return hit.t; }
        }
        return null;
      };
      r.picked = await typeAndPick(from, 'ningbo', 'Ningbo (Zhejiang), China CY');
      r.oVal = await from.inputValue().catch(() => '?');
      const to = page.getByRole('combobox', { name: /to \(city, country\/region\)/i }).first();
      const dp = await typeAndPick(to, word, label);
      if (!dp) { r.err = '候选未出/未命中: ' + label; results.push(r); console.log(JSON.stringify(r)); continue; }
      r.dVal = await to.inputValue().catch(() => '?');
      const search = page.getByRole('button', { name: /^\s*search\s*$/i }).first();
      await search.click({ timeout: 8000 }).catch((e) => { r.err = 'search click: ' + String(e).slice(0, 80); });
      let text = '';
      for (let i = 0; i < 18; i++) {
        await sleep(3000);
        text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
        if (/vessel\/voyage|no schedules|search results/i.test(text)) break;
      }
      r.text = text.replace(/\s+/g, ' ').slice(0, 700);
      const m = text.match(/search results[^0-9]{0,20}(\d+)/i);
      r.count = m ? Number(m[1]) : null;
      r.echo = /search results/i.test(text);
      r.url = page.url();
      r.api = [...new Set(reqs.map((x) => x.m + ' ' + x.u))].slice(0, 8);
      r.apiBody = reqs.filter((x) => x.b).slice(0, 2);
      if (r.count) await shot(page, `maersk-ist-${label.replace(/[^a-z]+/gi, '-')}`);
    } catch (e) {
      r.err = String(e).slice(0, 200);
    }
    results.push(r);
    console.log('\n#### ' + JSON.stringify(r, null, 1));
    await Promise.race([page.close(), sleep(3000)]).catch(() => {});
  }
} catch (e) {
  console.log('!! probe 异常:', String(e).slice(0, 300));
} finally {
  fs.mkdirSync('qa/probe-out', { recursive: true });
  fs.writeFileSync('qa/probe-out/maersk-variants.json', JSON.stringify(results, null, 1));
  await ctx.close().catch(() => {});
  process.exit(0);
}
