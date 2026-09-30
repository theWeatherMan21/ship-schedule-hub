// 探针：Maersk 目的地候选 dump + 抓 api.maersk.com 请求（9-29，婉宜）
// 用法：node qa/probe-maersk-ist.mjs [word1 word2 ...]（默认 istanbul ambarli）
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage } from '../engine/lib/utils.mjs';

const ENTRY = 'https://www.maersk.com/schedules/pointToPoint';
const argv = process.argv.slice(2);
const words = argv.length ? argv : ['istanbul', 'ambarli'];

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
const reqs = [];
ctx.on('request', (r) => {
  const u = r.url();
  if (/api\.maersk\.com/.test(u) && !/vessel|audience|experiment|signals|analytics|site-search|dqcs|argus/i.test(u)) {
    reqs.push({ m: r.method(), u: u.slice(0, 400), b: (r.postData() || '').slice(0, 900) });
  }
});
const out = {};
try {
  const { page } = await openPage(ctx, ENTRY, { reuse: true });
  await sleep(10000);
  await dismissCookies(page).catch(() => {});
  if (await isBlockPage(page)) console.log('!! 被拦截');

  const fillField = async (field, word) => {
    await field.click({ timeout: 8000 }).catch(() => {});
    await field.fill('').catch(() => {});
    await field.type(word, { delay: 80 }).catch(() => {});
    await sleep(5000);
  };

  const from = page.getByRole('combobox', { name: /from \(city, country\/region\)/i }).first();
  await from.waitFor({ state: 'visible', timeout: 30000 });

  await fillField(from, 'ningbo');
  const opts = page.locator('[role="option"]');
  const dump = async (max = 25) => {
    const n = await opts.count().catch(() => 0);
    const list = [];
    for (let i = 0; i < Math.min(n, max); i++) {
      let s = ''; try { s = await opts.nth(i).ariaSnapshot(); } catch { /* no-op */ }
      const t = (s || '').replace(/\s+/g, ' ').trim();
      if (t) list.push(t);
    }
    return list;
  };
  const oc = await dump();
  console.log(`=== origin "ningbo" candidates(${oc.length}):`);
  oc.forEach((t, i) => console.log('  O', i, JSON.stringify(t)));
  out.ningbo = oc;
  let oi = oc.findIndex((t) => /ningbo/i.test(t) && /\bCY\b/i.test(t));
  if (oi < 0) oi = oc.findIndex((t) => /ningbo/i.test(t));
  if (oi < 0) oi = 0;
  await opts.nth(oi).click({ timeout: 5000 }).catch(() => {});
  await sleep(1500);
  console.log('origin 回读:', JSON.stringify(await from.inputValue().catch(() => '?')));

  const to = page.getByRole('combobox', { name: /to \(city, country\/region\)/i }).first();
  for (const w of words) {
    await fillField(to, w);
    const list = await dump(30);
    console.log(`\n=== destination "${w}" candidates(${list.length}):`);
    list.forEach((t, i) => console.log('  D', i, JSON.stringify(t)));
    out[w] = list;
  }
} catch (e) {
  console.log('!! probe 异常:', String(e).slice(0, 300));
} finally {
  console.log('\n== api.maersk.com 请求 ==');
  [...new Set(reqs.map((r) => r.m + ' ' + r.u))].slice(0, 40).forEach((x) => console.log('  ', x));
  reqs.filter((r) => r.b).slice(-6).forEach((r) => console.log('  BODY', r.m, r.u.slice(0, 130), '|', r.b.slice(0, 400)));
  fs.mkdirSync('qa/probe-out', { recursive: true });
  fs.writeFileSync('qa/probe-out/maersk-cands.json', JSON.stringify({ out, reqs }, null, 1));
  await ctx.close().catch(() => {});
  process.exit(0);
}
