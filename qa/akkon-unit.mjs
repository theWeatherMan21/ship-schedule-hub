// Akkon 适配器离线单测（不联网）：解析纯函数 + 识别规则
import { parseAkkonRows, akkonDate, looksLikeContainer } from '../engine/tracking/akkon.mjs';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}\n      got : ${g}\n      want: ${w}`); }
};

console.log('① 日期解析（站点 DD/MM/YYYY）');
eq('21/11/2025 → ISO', akkonDate('21/11/2025'), '2025-11-21');
eq('1/2/2025 → 补零', akkonDate('1/2/2025'), '2025-02-01');
eq('已是 ISO', akkonDate('2025-12-17'), '2025-12-17');
eq('空值', akkonDate(''), '');
eq('乱码', akkonDate('N/A'), '');

console.log('② 箱号形态判断');
// 注：Akkon 站上箱号写作 CAAU296407-3 = 4 字母 + 6 位数字 + 校验位
eq('CAAU296407-3 → 箱号（带校验位后缀）', looksLikeContainer('CAAU296407-3'), true);
eq('CAAU296407 → 箱号形态（6 位数字，缺校验位也算）', looksLikeContainer('CAAU296407'), true);
eq('MSKU9813389 → 箱号（7 位数字）', looksLikeContainer('MSKU9813389'), true);
eq('AKKNBO51085597 → 不是箱号', looksLikeContainer('AKKNBO51085597'), false);

console.log('③ 真实表格行 → 统一结构（2026-10-23 实测数据）');
const realRow = {
  bl: 'AKKNBO51085597',
  container: 'CAAU296407-3',
  vessel: 'MV LIANG XIANG 85',
  voyage: 'LIN0125W',
  pol: 'NINGBO',
  ets: '21/11/2025',
  pod: 'GEMLIK RODAPORT',
  eta: '17/12/2025',
  finalDestination: '',
  finalEta: '',
};
const r = parseAkkonRows([realRow], 'AKKNBO51085597');
eq('ok', r.ok, true);
eq('docNum', r.docNum, 'AKKNBO51085597');
eq('origin', r.origin, 'NINGBO');
eq('destination', r.destination, 'GEMLIK RODAPORT');
eq('vessel', r.vessel, 'MV LIANG XIANG 85');
eq('voyage', r.voyage, 'LIN0125W');
eq('容器数', r.containers.length, 1);
eq('容器号', r.containers[0].num, 'CAAU296407-3');
eq('事件数（ETS + ETA）', r.events.length, 2);
eq('事件1 时间/类型', [r.events[0].time, r.events[0].timeType], ['2025-11-21', 'ACTUAL']);
eq('事件1 名称/城市', [r.events[0].activity, r.events[0].city], ['Departure (ETS)', 'NINGBO']);
eq('事件2 时间/城市', [r.events[1].time, r.events[1].city], ['2025-12-17', 'GEMLIK RODAPORT']);
eq('lastUpdate', r.lastUpdate, '2025-12-17');

console.log('④ 未来日期 → EXPECTED（不能把预计当已发生）');
const future = { ...realRow, ets: '21/11/2099', eta: '17/12/2099' };
const f = parseAkkonRows([future], 'X');
eq('2099 的 ETS 是 EXPECTED', f.events[0].timeType, 'EXPECTED');

console.log('⑤ 空结果 → not-found');
const nf = parseAkkonRows([], 'AKKNBO51085597');
eq('ok', nf.ok, false);
eq('errorKind', nf.errorKind, 'not-found');

console.log('⑥ 多箱同单（同一 BL 两行）→ 每个箱各自的事件都保留');
const two = [
  realRow,
  { ...realRow, container: 'CAAU296408-1' },
];
const t = parseAkkonRows(two, 'AKKNBO51085597');
eq('两个箱号', t.containers.length, 2);
eq('事件数 = 2 箱 × (ETS+ETA)', t.events.length, 4);
eq('事件里带容器号区分', t.events.map((e) => e.container).sort(), ['CAAU296407-3', 'CAAU296407-3', 'CAAU296408-1', 'CAAU296408-1']);

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
