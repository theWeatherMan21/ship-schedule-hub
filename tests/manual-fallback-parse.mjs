// 单测：从 src/main.js 里抽出真实的 parseManualText 跑样例（不复制第二份逻辑）
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const start = src.indexOf('const MONTHS3');
const end = src.indexOf('function manualFallbackHTML');
if (start < 0 || end < 0) throw new Error('抽不到 parseManualText');
const chunk = src.slice(start, end);
const parseManualText = new Function(chunk + '\nreturn parseManualText;')();

const cases = [
  ['OOCL 官网样式（英文 + 日期时间）', [
    '2026-10-28 08:00  Gate In      Shanghai, China',
    '2026-10-29 14:30  Loaded       042W SHANGHAI EXPRESS',
    '2026-11-20 06:15  Arrived      Hamburg, Germany',
    '2026-11-21 09:40  Discharged   Hamburg, Germany',
  ].join('\n')],
  ['斜杠日期 + 中文事件', [
    '28/10/2026 进港 上海',
    '29/10/2026 装船 SHANGHAI EXPRESS',
    '20/11/2026 到港 Hamburg',
  ].join('\n')],
  ['英文月份写法', [
    '07 Nov 2026  Loaded  Ningbo, China',
    '15 Dec 2026  Arrived  Hamburg, Germany',
  ].join('\n')],
  ['无日期（应解析 0 条 → 走未解析兜底）', '完全看不懂的一段话，没有任何日期信息 ABC DEF'],
];

for (const [name, text] of cases) {
  const evs = parseManualText(text);
  console.log(`\n== ${name} → ${evs.length} 条`);
  for (const e of evs) console.log(`   ${e.time} | ${e.activity} | ${e.city || '-'}`);
}
