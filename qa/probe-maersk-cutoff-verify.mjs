// 马士基截单/截关「双路互证」探针（10-13）
//   路 A：页内 API —— routings → deadlines/queries（maerskDeadlines/maerskApplyDeadlines）
//   路 B：官网自己的深链渲染文本（同一批航次，官网卡片逐行）
// 断言：同一航次（船名/航次）两路 5 行值完全一致 → 证明「App 看到的 = 官网看到的」
// 用法（必须静默包装）：bash qa/quiet-probe.sh qa/probe-maersk-cutoff-verify.mjs
import { launch, openPage, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';
import {
  maerskResolve, maerskQuery, maerskRowsFromRoutings,
  maerskDeadlines, maerskApplyDeadlines, maerskCutoffsFromText,
} from '../engine/fastpath.mjs';

const ORIGIN = { name: 'Ningbo', rkst: 'CNNPO', locode: 'CNNGB' };
const DEST = { name: 'Ambarli', rkst: 'TRAMB', locode: 'TRAMB' };
const iso = new Date().toISOString().slice(0, 10);
const add = (s, n) => { const t = new Date(`${s}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const earliest = add(iso, 1), latest = add(iso, 57);

const ctx = await launch({ headless: true });
const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint');
await sleep(8000);
try {
  const rv = await maerskResolve(page, ORIGIN.name, DEST.name, ORIGIN.locode, DEST.locode);
  if (!rv || rv.error) throw new Error(`resolve 失败: ${JSON.stringify(rv).slice(0, 200)}`);
  const d0 = rv.dList[0];
  console.log(`[resolve] 起运 ${rv.o.cityName}(${rv.o.rkst}/${rv.o.geo}) → 目的 ${d0.cityName}(${d0.rkst}/${d0.geo})`);

  // ---- 路 A：页内 API ----
  const qr = await maerskQuery(page, rv.o.geo, d0.geo, earliest, latest);
  if (!qr || qr.status !== 200) throw new Error(`routings HTTP ${qr && qr.status}`);
  const rows = maerskRowsFromRoutings(qr.routings);
  const dl = await maerskDeadlines(page, rows.map((r) => r._dl).filter(Boolean));
  console.log(`[A] routings ${rows.length} 条；deadlines HTTP ${dl && dl.status}，返回 ${dl && dl.data ? dl.data.length : 0} 段`);
  maerskApplyDeadlines(rows, dl);
  const api = {};
  for (const r of rows) api[r.voyage] = { vessel: r.vessel, cuts: (r.detail && r.detail.cutoffs) || null };

  // ---- 路 B：官网深链渲染 ----
  const deep = 'https://www.maersk.com/schedules/pointToPoint?' + [
    `from=${rv.o.geo}`, `to=${d0.geo}`,
    `fromRkstCode=${rv.o.rkst}`, `toRkstCode=${d0.rkst}`,
    'containerIsoCode=45G1', 'fromServiceMode=CY', 'toServiceMode=CY',
    'numberOfWeeks=8', 'dateType=D', `date=${earliest}`, `dateTo=${latest}`, 'vesselFlag=',
  ].join('&');
  await page.goto(deep, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  // ⚠️ 官网卡片是「先出 label、后填值」的两段渲染：只等 /Deadlines/ 会抓到 5 个空 label（10-13 踩过，
  //    会误判成"两路不一致"）。等到出现 ≥5 个 "dd Mon yyyy hh:mm" 值、或连续 5 轮文本不再变长为止。
  let text = '';
  const valCount = (t) => (t.match(/\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}/g) || []).length;
  let stable = 0, prev = -1;
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    if (/no schedules available/i.test(text)) break;
    if (valCount(text) >= 2 * (text.match(/\bDeadlines\b/g) || []).length && valCount(text) > 0) break;
    stable = (text.length === prev) ? stable + 1 : 0;
    prev = text.length;
    if (stable >= 5) break;
  }
  console.log(`[B] 取值线渲染：${valCount(text)} 个时间值 / ${(text.match(/\bDeadlines\b/g) || []).length} 张卡片`);
  fs.writeFileSync('/tmp/maersk-cutoff-verify-site.txt', text);
  const site = {};
  const cardRe = /Vessel\/Voyage\n(.+?)\n[\s\S]*?Deadlines\n([\s\S]*?)(?=\nShow route details)/g;
  let cm;
  while ((cm = cardRe.exec(text)) !== null) {
    const label = cm[1].trim();
    const vm = /^(.*?)\s*(\d{3,4}[EWNS])$/.exec(label) || [];
    const voyage = (vm[2] || label).trim();
    site[voyage] = { vessel: (vm[1] || label).trim(), cuts: maerskCutoffsFromText('Deadlines\n' + cm[2]) };
  }
  console.log(`[B] 官网渲染卡片 ${Object.keys(site).length} 张（文本落 /tmp/maersk-cutoff-verify-site.txt）`);

  // ---- 比对 ----
  let bad = 0, cmp = 0;
  for (const [voy, a] of Object.entries(api)) {
    const b = site[voy];
    if (!b) { console.log(`  ? ${a.vessel} ${voy}: 官网渲染里没这张卡片（窗口/时序差异），跳过`); continue; }
    cmp++;
    const ka = JSON.stringify(a.cuts || {});
    const kb = JSON.stringify(b.cuts || {});
    const same = ka === kb;
    if (!same) bad++;
    console.log(`  ${same ? '✓' : '✗'} ${a.vessel} ${voy}`);
    if (!same) console.log(`      API : ${ka}\n      官网: ${kb}`);
  }
  const first = Object.entries(api)[0];
  if (first) console.log(`\n样本 ${first[1].vessel} ${first[0]}:\n  ${JSON.stringify(first[1].cuts, null, 1)}`);
  console.log(`\n[结果] 可比航次 ${cmp} 个，不一致 ${bad} 个`);
  await ctx.close().catch(() => {});
  process.exit(bad ? 1 : 0);
} catch (e) {
  console.log('!! 异常:', String((e && e.stack) || e).slice(0, 400));
  await ctx.close().catch(() => {});
  process.exit(2);
}
