// 阳明追踪 · 离线单测（2 个真数据 fixture：柜 + 提单）
import fs from 'node:fs';
import { parseYangmingResponse, parseTsMode } from '../engine/tracking/yangming.mjs';

const j1 = JSON.parse(fs.readFileSync('qa/fixtures/yangming-track-YMLU4794134.json', 'utf8'));
const j2 = JSON.parse(fs.readFileSync('qa/fixtures/yangming-track-N237068499.json', 'utf8'));

let pass = 0, fail = 0;
const eq = (name, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  ok ? pass++ : fail++;
  console.log(ok ? ' ✓' : ' ✗', name, ok ? '' : `\n     got=${JSON.stringify(got)}\n     exp=${JSON.stringify(exp)}`);
};

// —— 柜 fixture（YMLU4794134）——
const p1 = parseYangmingResponse(j1, 'YMLU4794134');
eq('柜: ok', p1.ok, true);
eq('柜: carrier', p1.carrier, 'yangming');
eq('柜: searchType', p1.searchType, 'CTNRNO');
eq('柜: containers.length', p1.containers.length, 1);
eq('柜: 柜号', p1.containers[0].num, 'YMLU4794134');
eq('柜: size', p1.containers[0].size, '20');
eq('柜: type', p1.containers[0].type, 'DC');
eq('柜: 事件数', p1.containers[0].events.length, 20);
eq('柜: 首事件(升序)', p1.containers[0].events[0].time, '2026-08-24T13:11');
eq('柜: 末事件', p1.containers[0].events.at(-1).time, '2026-09-30T16:33');
eq('柜: 末事件 activity 前缀', p1.containers[0].events.at(-1).activity.startsWith('Gate in of Empty'), true);
eq('柜: vessel 解析(最早带船事件)', (p1.containers[0].events.find((e) => e.vessel) || {}).vessel, 'YM CENTENNIAL');
eq('柜: voyage 解析(最早带船事件)', (p1.containers[0].events.find((e) => e.voyage) || {}).voyage, '070N');
eq('柜: 另一条船解析', (p1.containers[0].events.find((e) => e.vessel === 'YM INTELLIGENT') || {}).voyage, '298N');
eq('柜: current=最新 ACTUAL', p1.current.time, '2026-09-30T16:33');
eq('柜: isCurrent 标记', p1.containers[0].events.at(-1).isCurrent, true);
const noRaw = JSON.stringify({ ...p1, raw: undefined });
eq('柜: 清洗后无 HTML 残留', /<BR/i.test(noRaw), false);

// —— BL fixture（N237068499）——
const p2 = parseYangmingResponse(j2, 'N237068499');
eq('BL: ok', p2.ok, true);
eq('BL: searchType', p2.searchType, 'BLNO');
eq('BL: origin', p2.origin, 'SHANGHAI, SH (CNSHA)');
eq('BL: destination', p2.destination, 'ROTTERDAM (NLRTM)');
eq('BL: vessel', p2.vessel, 'HMM DUBLIN');
eq('BL: containers.length', p2.containers.length, 1);
eq('BL: 柜号', p2.containers[0].num, 'YMLU4794134');
eq('BL: routing 段数', p2.routing.length, 2);
eq('BL: routing[0]', `${p2.routing[0].place}|${p2.routing[0].time}`, 'SHANGHAI|2026-02-15T11:30');

// —— 无效号 ——
const p3 = parseYangmingResponse({ successCnt: 0, containerList: [], blList: [], bookingList: [], emptyList: [{}] }, 'XXXX3432539');
eq('无效: not-found', p3.errorKind, 'not-found');

// —— tsMode 清洗 ——
eq('tsMode: 船', parseTsMode('VESSEL<BR />YM INTELLIGENT<BR />(298N)'), { mode: 'VESSEL', vessel: 'YM INTELLIGENT', voyage: '298N' });
eq('tsMode: 卡车', parseTsMode('TRUCK'), { mode: 'TRUCK', vessel: '', voyage: '' });
eq('tsMode: 空', parseTsMode(null), { mode: '', vessel: '', voyage: '' });

// —— worker 复核场景（合成输入，对应 t_d0bde9c7 的 5 个缺口）——
// a. 多柜：containerList 两个元素 → 全解析（不只第一个）
const pMulti = parseYangmingResponse({
  successCnt: 2, containerList: [
    { returnTrackNo: 'AAAA1957586', cnSize: '20', cnType: 'DC', ctStatusInfo: [{ seq: 1, moveDate: '2026/09/01 10:00', eventDesc: 'Full to Consignee', atFacility: 'X' }] },
    { returnTrackNo: 'BBBB4064835', cnSize: '40', cnType: 'HC', ctStatusInfo: [{ seq: 1, moveDate: '2026/09/02 10:00', eventDesc: 'Empty Returned', atFacility: 'Y', eventClassifie: 'Actual' }] },
  ], blList: [], bookingList: [], emptyList: [],
}, 'X');
eq('多柜: containers.length', pMulti.containers.length, 2);
eq('多柜: 第二柜解析', pMulti.containers[1].num, 'BBBB4064835');
eq('多柜: 第二柜事件数', pMulti.containers[1].events.length, 1);

// c. booking-only：不得误报 not-found
const pBk = parseYangmingResponse({ successCnt: 1, containerList: [], blList: [], bookingList: [{ returnTrackNo: 'BK1234567' }], emptyList: [] }, 'BK1234567');
eq('booking: ok=true', pBk.ok, true);
eq('booking: searchType', pBk.searchType, 'BOOKING');
eq('booking: 有 note 标注', pBk.booking.note.length > 0, true);

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
