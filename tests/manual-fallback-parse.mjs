// 手工兜底解析单测 —— 直接测唯一实现（engine/tracking/manual-parse.mjs）
// 两边共用同一份：App 前端 import、WPS 插件走桥的 /parse-manual 也 import 它。
import { parseManualText } from '../engine/tracking/manual-parse.mjs';

const cases = [
  ['OOCL 官网样式（英文 + 日期时间）', [
    '2026-10-28 08:00  Gate In      Shanghai, China',
    '2026-10-29 14:30  Loaded       042W SHANGHAI EXPRESS',
    '2026-11-20 06:15  Arrived      Hamburg, Germany',
    '2026-11-21 09:40  Discharged   Hamburg, Germany',
  ].join('\n'), 4],
  ['斜杠日期 + 中文事件', [
    '28/10/2026 进港 上海',
    '29/10/2026 装船 SHANGHAI EXPRESS',
    '20/11/2026 到港 Hamburg',
  ].join('\n'), 3],
  ['英文月份写法', [
    '07 Nov 2026  Loaded  Ningbo, China',
    '15 Dec 2026  Arrived  Hamburg, Germany',
  ].join('\n'), 2],
  ['无日期（应解析 0 条 → 走未解析兜底）', '完全看不懂的一段话，没有任何日期信息 ABC DEF', 0],
];

let failed = 0;
for (const [name, text, expect] of cases) {
  const evs = parseManualText(text);
  const ok = evs.length === expect;
  if (!ok) failed++;
  console.log(`\n== ${name} → ${evs.length} 条（期望 ${expect}）${ok ? ' ✓' : ' ✗'}`);
  for (const e of evs) console.log(`   ${e.time} | ${e.activity} | ${e.city || '-'}`);
}

// 关键不变量：解析出的每条都带 manual 标记 + ISO 日期（插件靠这两个字段着色/排序）
const all = parseManualText(cases[0][1]);
const inv = all.length > 0 && all.every((e) => e.manual === true && /^\d{4}-\d{2}-\d{2}$/.test(e.time));
console.log(`\n不变量（manual 标记 + ISO 日期）: ${inv ? '✓' : '✗'}`);
if (!inv) failed++;

console.log(`\n${failed ? '✗ 失败 ' + failed + ' 项' : '✓ 全部通过'}`);
process.exit(failed ? 1 : 0);
