// CMA 追踪 · 离线单测（用 2026-10-12 真单实况样本，不联网）
import { parseCmaText, cmaDate, splitStatusPlace } from '../engine/tracking/cma.mjs';

let pass = 0, fail = 0;
const eq = (name, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  ok ? pass++ : fail++;
  console.log(ok ? ' ✓' : ' ✗', name, ok ? '' : `\n     got=${JSON.stringify(got)}\n     exp=${JSON.stringify(exp)}`);
};

// —— 真单实况样本（NGP3170431，2026-10-12 实测输出）——
const SAMPLE = `About us Find your local offices My Customer Service Guides Corporate website English Industries Shipping End-To-End Solutions Air Freight News My CMA CGM Track my Shipment *Required information Search by Container Number, Shipment Ref or My Ref* Search Sign up to enjoy a range of benefits stay informed in real time view the location of your container on a map track your inland shipments Log In Tracking details Booking NGP3170431 New search CMAU2081135 22G1 (20ST) GATE IN EMPTY AT DEPOT ISTANBUL, AMBARLI PORT E. SIDE Thu. 05-MAR-2026 14:41 PM Display Details CMAU7247424 22G1 (20ST) GATE IN EMPTY AT DEPOT ISTANBUL, AMBARLI PORT E. SIDE Thu. 05-MAR-2026 14:35 PM Display Details Discover CMA CGM`;

const p = parseCmaText(SAMPLE, 'NGP3170431');
eq('ok', p.ok, true);
eq('carrier', p.carrier, 'cma');
eq('docNum', p.docNum, 'NGP3170431');
eq('containers 数', p.containers.length, 2);
eq('柜1 号', p.containers[0].num, 'CMAU2081135');
eq('柜1 箱型', p.containers[0].size, '22G1');
eq('柜1 尺寸', p.containers[0].type, '(20ST)');
eq('柜1 状态', p.containers[0].status, 'GATE IN EMPTY AT DEPOT');
eq('柜1 地点', p.containers[0].place, 'ISTANBUL, AMBARLI PORT E. SIDE');
eq('柜1 事件时间', p.containers[0].events[0].time, '2026-03-05T14:41');
eq('柜2 号', p.containers[1].num, 'CMAU7247424');
eq('current', p.current.activity, 'GATE IN EMPTY AT DEPOT');
eq('searchType', p.searchType, 'BOOKING');

// —— 否定态 ——
const nf = parseCmaText('Your shipment was not found, please modify your search', 'XXX');
eq('not-found', nf.errorKind, 'not-found');

// —— 拦截/空页 ——
eq('空页 blocked', parseCmaText('', 'X').errorKind, 'blocked');
eq('无结果区 blocked', parseCmaText('About us Products Contact', 'X').errorKind, 'blocked');

// —— 时间换算 ——
eq('cmaDate 14:41 PM', cmaDate('05-MAR-2026', '14:41', 'PM'), '2026-03-05T14:41');
eq('cmaDate 12:30 AM', cmaDate('01-JAN-2026', '12:30', 'AM'), '2026-01-01T00:30');
eq('cmaDate 12:30 PM', cmaDate('01-JAN-2026', '12:30', 'PM'), '2026-01-01T12:30');
eq('cmaDate 09:05 AM', cmaDate('31-DEC-2025', '09:05', 'AM'), '2025-12-31T09:05');
eq('cmaDate 非法', cmaDate('garbage', '99:99', 'PM'), null);

// —— 状态/地点拆分 ——
eq('split 样本', splitStatusPlace('GATE IN EMPTY AT DEPOT ISTANBUL, AMBARLI PORT E. SIDE'),
  { status: 'GATE IN EMPTY AT DEPOT', place: 'ISTANBUL, AMBARLI PORT E. SIDE' });
eq('split 无地点词', splitStatusPlace('SOMETHING HAPPENED'), { status: 'SOMETHING HAPPENED', place: '' });

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
