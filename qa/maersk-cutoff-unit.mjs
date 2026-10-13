// 马士基截单/截关口径单测（离线，10-13）—— 键名与 5 行固定对齐官网卡片
//   口径来源：官网 schedules JS 硬编码 deadlineTypes / dgDeadlineTypes（见 engine/fastpath.mjs:MAERSK_CUTOFF_ROWS 注释）
// 运行：node qa/maersk-cutoff-unit.mjs   （期望 ALL PASS，退出码 0）
import fs from 'node:fs';
import { maerskCutoffs, maerskCutoffsFromText, maerskApplyDeadlines, MAERSK_CUTOFF_ROWS } from '../engine/fastpath.mjs';

let fail = 0;
const eq = (got, want, name) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log(`✗ ${name}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`); }
  else console.log(`✓ ${name}`);
};

// ① 接口 deadlines[] → 官网 5 行（干柜：危品行 N/A；FMDGFD / ANID 官网不展示，须过滤）
const api = [
  { deadlineCode: 'FMDGFD', deadlineName: 'Final Multimodal Dangerous Goods Form Deadline', deadline: '2026-10-17T11:00:00' },
  { deadlineCode: 'SINONAMS', deadlineName: 'Shipping Instructions Deadline for Non AMS Cargo', deadline: '2026-10-18T04:00:00' },
  { deadlineCode: 'SIAMS', deadlineName: 'Shipping Instructions Deadline for Advance Manifest Cargo', deadline: '2026-10-18T03:00:00' },
  { deadlineCode: 'ECPL', deadlineName: 'Empty Container Pickup Deadline', deadline: '2026-10-18T11:00:00' },
  { deadlineCode: 'SGIN', deadlineName: 'Container Gate In Deadline', deadline: '2026-10-19T03:00:00' },
  { deadlineCode: 'VGM', deadlineName: 'Verified Gross Mass Deadline', deadline: '2026-10-18T17:00:00' },
  { deadlineCode: 'ANID', deadlineName: 'Arrival Notice Issuance Deadline', deadline: '2026-11-01T00:00:00' },
];
eq(maerskCutoffs(api), {
  'Empty container pickup': '2026-10-18 11:00',
  'Container gate-in': '2026-10-19 03:00',
  'Shipping Instructions': '2026-10-18 03:00',   // min(SINONAMS, SIAMS)
  'Verified Gross Mass': '2026-10-18 17:00',
  'Dangerous Goods Declaration': 'N/A',          // FMDGFD / ANID 都不算危品行
}, '接口 → 5 行（站点文案键名 · SI 取较早 · 危品 N/A · 滤掉 FMDGFD/ANID）');

// ② 深链卡片渲染文本（真实抓取片段）→ 同口径
const txt = fs.readFileSync(new URL('./probe-out/maersk-deeplink-TRAMB-CY.txt', import.meta.url), 'utf8');
const seg = txt.slice(0, txt.indexOf('Show route details') + 20);
eq(maerskCutoffsFromText(seg), {
  'Empty container pickup': '2026-10-04 17:00',
  'Container gate-in': '2026-10-06 00:00',
  'Shipping Instructions': '2026-10-05 04:00',
  'Verified Gross Mass': '2026-10-05 17:00',
  'Dangerous Goods Declaration': 'N/A',
}, '深链文本 → 同口径（官网真实渲染片段）');
eq(maerskCutoffsFromText('没有截单段的文本'), null, '无 Deadlines 段 → null');

// ③ 合并进 rows（按 船代码|航次 匹配）
const rows = [
  { vessel: 'A', voyage: '641W', _dl: { vesselMaerskCode: '1VM', voyageNumber: '641W' } },
  { vessel: 'B', voyage: '999W', _dl: { vesselMaerskCode: '9XX', voyageNumber: '999W' } },
];
maerskApplyDeadlines(rows, { status: 200, data: [{ vesselMaerskCode: '1VM', voyageNumber: '641W', deadlines: api }] });
eq(rows[0].detail.cutoffs['Container gate-in'], '2026-10-19 03:00', '命中 → 写入 row.detail.cutoffs');
eq(rows[1].detail, undefined, '未命中 → 不改 row');
eq(MAERSK_CUTOFF_ROWS.length, 5, '口径固定 5 行');

console.log(fail ? `\nFAIL ${fail}` : '\nALL PASS');
process.exit(fail ? 1 : 0);
