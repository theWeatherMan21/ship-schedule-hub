// 箱型/尺寸口径统一单测（10-14 审阅 P2「箱号 size/type 三家三样，显示 22G1'」回归）
// 用例取自**真网实测**的各家字段形态（见 qa 探针与 10-14 真单输出）。
import assert from 'node:assert/strict';
import { containerLabel, normalizeTracking } from '../engine/tracking/normalize.mjs';

const cases = [
  // [来源说明, 容器, 期望 label]
  ['maersk（size=20 type=DRY iso=22G1）', { size: '20', type: 'DRY', iso: '22G1' }, "20'GP"],
  ['one（type 带句点 "DRY HC."）', { size: '40', type: 'DRY HC.' }, "40'HC"],
  ['cosco（type=HQ）', { size: '40', type: 'HQ' }, "40'HC"],
  ['cma（type="(40HC)" 带括号）', { size: '40', type: '(40HC)' }, "40'HC"],
  ['yangming（type=40HQ）', { size: '40', type: '40HQ' }, "40'HC"],
  ['zim（size=type=40HC）', { size: '40HC', type: '40HC' }, "40'HC"],
  ['hapag（size=type=42GP）', { size: '42GP', type: '42GP' }, "40'GP"],
  ['hapag 45 尺柜（size=type=45GP，10-15 双端实测真单：曾错为 40\'GP）', { size: '45GP', type: '45GP' }, "45'GP"],
  ['45 尺短写（45HC）', { size: '45HC', type: '45HC' }, "45'HC"],
  ['hmm（type=货类 DRY）', { size: '40', type: 'DRY' }, "40'GP"],
  ['evergreen（size=type=40，无箱型信息）', { size: '40', type: '40' }, "40'"],
  ['只有 iso 码（22G1）', { size: '', type: '', iso: '22G1' }, "20'GP"],
  ['msc（整段描述塞进 size："40\' HIGH CUBE REEFER"）', { size: "40' HIGH CUBE REEFER", type: '' }, "40'RF"],
  ['ISO 45G1 是 40 尺高箱（长度按 40 读，不是 45）', { size: '', type: '', iso: '45G1' }, "40'GP"],
  ['冷藏箱', { size: '40', type: 'REEFER' }, "40'RF"],
  ['开顶箱', { size: '20', type: 'Open Top' }, "20'OT"],
  ['框架箱（ISO P1）', { size: '', type: '', iso: '42P1' }, "40'FR"],
  ['认不出（不许猜）', { size: '', type: '' }, ''],
  ['垃圾输入不炸', { size: '??', type: '###' }, ''],
];

for (const [label, ct, want] of cases) {
  assert.equal(containerLabel(ct), want, `${label} → 期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(containerLabel(ct))}`);
}
assert.equal(containerLabel(null), '', 'null 不许炸');

// 归一层必须把 label 挂到每个箱子上（UI 用它显示），并保留原始字段
const r = normalizeTracking({
  ok: true, carrier: 'maersk', number: '276759780',
  containers: [{ num: 'MRKU3574053', size: '20', type: 'DRY', iso: '22G1', status: 'IN_PROGRESS' }],
  events: [{ time: '2026-10-01T00:00:00Z', activity: 'Gate in', timeType: 'ACTUAL' }],
});
const c0 = r.containers[0];
assert.equal(c0.label, "20'GP", `归一层 label 应为 20'GP，实际 ${c0.label}`);
assert.equal(c0.size, '20', 'size 原值保留');
assert.equal(c0.type, 'DRY', 'type 原值保留');
assert.equal(c0.iso, '22G1', 'iso 原值保留');

console.log(`container label tests passed（${cases.length} 组真网形态 + 归一层接线）`);
