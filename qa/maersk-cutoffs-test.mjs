// 马士基截单口径单测：maerskCutoffs（API） + maerskCutoffsFromText（深链文本）
// 口径来源：站点 main-*.js 硬编码 deadlineTypes/dgDeadlineTypes（worker 10-13 挖出），官网只展示 5 行
import { maerskCutoffs, maerskCutoffsFromText, MAERSK_CUTOFF_ROWS } from '../engine/fastpath.mjs';

let pass = 0, fail = 0;
const eq = (name, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  ok ? pass++ : fail++;
  console.log(ok ? ' ✓' : ' ✗', name, ok ? '' : `\n     got=${JSON.stringify(got)}\n     exp=${JSON.stringify(exp)}`);
};

// —— 真实响应片段（Ningbo→Ambarli, MAREN MAERSK 641W；含官网不展示的 FMDGFD / ANID）——
const REAL = [
  { deadlineCode: 'FMDGFD', deadlineName: 'Final Multimodal Dangerous Goods Form Deadline', deadline: '2026-10-17T11:00:00' },
  { deadlineCode: 'ECPL', deadlineName: 'Empty Container Pickup Deadline', deadline: '2026-10-18T11:00:00' },
  { deadlineCode: 'ANID', deadlineName: 'Arrival Notice Issuance Deadline', deadline: '2026-10-18T15:00:00' },
  { deadlineCode: 'VGM', deadlineName: 'VGM Deadline', deadline: '2026-10-18T17:00:00' },
  { deadlineCode: 'SINONAMS', deadlineName: 'Shipping Instructions Deadline', deadline: '2026-10-18T04:00:00' },
  { deadlineCode: 'SIAMS', deadlineName: 'Shipping Instructions AMS', deadline: '2026-10-18T00:00:00' },
  { deadlineCode: 'SGIN', deadlineName: 'Container Gate In', deadline: '2026-10-19T03:00:00' },
];
const c = maerskCutoffs(REAL);
eq('固定 5 行（与官网一致）', Object.keys(c), MAERSK_CUTOFF_ROWS.map((r) => r.key));
eq('Empty container pickup', c['Empty container pickup'], '2026-10-18 11:00');
eq('Container gate-in（截关）', c['Container gate-in'], '2026-10-19 03:00');
eq('Shipping Instructions 取较早者(min SINONAMS,SIAMS)', c['Shipping Instructions'], '2026-10-18 00:00');
eq('Verified Gross Mass', c['Verified Gross Mass'], '2026-10-18 17:00');
eq('无 DG 码 → N/A', c['Dangerous Goods Declaration'], 'N/A');
eq('官网不展示 FMDGFD', Object.keys(c).includes('Final Multimodal Dangerous Goods Form Deadline'), false);
eq('官网不展示 ANID', JSON.stringify(c).includes('Arrival Notice'), false);

// —— 危品航线（有 DG 码时应有值）——
const dg = maerskCutoffs([{ deadlineCode: 'DGD', deadline: '2026-10-20T09:00:00' }]);
eq('DG 码命中（DGD）', dg['Dangerous Goods Declaration'], '2026-10-20 09:00');
const dgN = maerskCutoffs([{ deadlineCode: 'DGDSDN', deadline: '2026-10-20T09:00:00' }]);
eq('DG 码命中（DGDSDN）', dgN['Dangerous Goods Declaration'], '2026-10-20 09:00');

// —— 空/异常输入 ——
eq('空数组 → 全 N/A', Object.values(maerskCutoffs([])), ['N/A', 'N/A', 'N/A', 'N/A', 'N/A']);
eq('undefined → 全 N/A', Object.values(maerskCutoffs(undefined)), ['N/A', 'N/A', 'N/A', 'N/A', 'N/A']);

// —— 深链文本解析（官网渲染格式）——
const TXT = 'Book now\nGet a quote\nDeadlines\nEmpty container pickup\n18 Oct 2026 11:00\nContainer gate-in\n19 Oct 2026 03:00\nShipping Instructions\n18 Oct 2026 04:00\nVerified Gross Mass\n18 Oct 2026 17:00\nDangerous Goods Declaration\nN/A\nShow route details';
const t = maerskCutoffsFromText(TXT);
eq('文本：Empty container pickup', t['Empty container pickup'], '2026-10-18 11:00');
eq('文本：Container gate-in', t['Container gate-in'], '2026-10-19 03:00');
eq('文本：Shipping Instructions', t['Shipping Instructions'], '2026-10-18 04:00');
eq('文本：DG = N/A', t['Dangerous Goods Declaration'], 'N/A');
eq('无 Deadlines 段 → null', maerskCutoffsFromText('no deadlines here'), null);

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
