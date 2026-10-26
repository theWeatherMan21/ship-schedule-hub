import assert from 'node:assert/strict';
import { normalizeTracking } from '../engine/tracking/normalize.mjs';

const rawMaersk = {
  ok: true, carrier: 'maersk', number: '276759780', origin: 'XINGANG (CN)', destination: 'GDANSK (PL)', status: 'IN_PROGRESS',
  containers: [{ num: 'MRKU3574056', status: 'IN_PROGRESS', events: [] }],
  events: [
    { time: '2026-10-08T04:46:00.000', activity: 'Container Departure', city: 'XINGANG', timeType: 'ACTUAL', container: 'MRKU3574056' },
    { time: '2026-11-17T04:00:00.000', activity: 'Container Arrival', city: 'PORT TANGIER MEDITERRANEE', timeType: 'EXPECTED', container: 'MRKU3574056' },
    { time: '2026-11-19T17:00:00.000', activity: 'Container Departure', city: 'PORT TANGIER MEDITERRANEE', timeType: 'EXPECTED', container: 'MRKU3574056' },
    { time: '2026-11-26T06:00:00.000', activity: 'Container Arrival', city: 'GDANSK', timeType: 'EXPECTED', container: 'MRKU3574056' },
  ],
  eta: { time: '2026-11-26T06:00:00.000', city: 'GDANSK' },
};
const normalized = normalizeTracking(rawMaersk);
assert.equal(normalized.events.length, 4, 'normalized cache events are preserved');
assert.equal(normalized.current.activity, 'Container Departure', 'current remains last actual event');
assert.equal(normalized.eta.time, '2026-11-26T06:00:00.000', 'cached ETA survives normalization');
assert.equal(normalized.phase, 'In Transit', 'arrival forecast does not mean delivered');

// YM：空箱归还（Gate in of Empty Equipment）→ phase=Completed（worker 复核缺口 d）
const rawYm = {
  ok: true, carrier: 'yangming', number: 'YMLU4794131',
  containers: [{ num: 'YMLU4794131', status: '' }],
  events: [
    { time: '2026-09-30T16:33', activity: 'Gate in of Empty Equipment by Truck at Depot', city: 'KEELUNG', timeType: 'ACTUAL', container: 'YMLU4794131' },
    { time: '2026-09-26T15:23', activity: 'Discharge of Laden Equipment from Vessel at Port terminal', city: 'KEELUNG', timeType: 'ACTUAL', container: 'YMLU4794131' },
  ],
};
const nYm = normalizeTracking(rawYm);
assert.equal(nYm.phase, 'Completed', 'YM empty return means completed');
assert.equal(nYm.current.activity, 'Gate In Of Empty Equipment By Truck At Depot', 'YM current stays last actual');


// ── 10-14 审阅 P0-2 回归：全 EXPECTED（无任何 ACTUAL）时 current 必须为 null ──
// 场景：新订舱/仅计划事件的票 —— 之前会把未来的预计事件标成「当前位置」显示在 UI 主行
const rawAllExpected = {
  ok: true, carrier: 'test', number: 'PLAN1',
  containers: [{ num: 'TCLU3054361', status: 'PLANNED' }],
  events: [
    { time: '2026-11-26T06:00:00.000', activity: 'Container Arrival', city: 'GDANSK', timeType: 'EXPECTED', container: 'TCLU3054361' },
    { time: '2026-11-30T06:00:00.000', activity: 'Container Delivery', city: 'GDANSK', timeType: 'EXPECTED', container: 'TCLU3054361' },
  ],
};
const nAllExp = normalizeTracking(rawAllExpected);
assert.equal(nAllExp.current, null, 'P0-2: 全 EXPECTED 时 current 必须为 null（不得拿预计事件当现状）');
assert.equal(nAllExp.events.some((e) => e.isCurrent), false, 'P0-2: 任何 EXPECTED 事件都不得被标 isCurrent');

// 对照：有 ACTUAL 时仍取最后一条 ACTUAL（回归保护，防修过头）
const rawMixed = {
  ok: true, carrier: 'test', number: 'MIX1',
  containers: [{ num: 'TCLU3054361', status: '' }],
  events: [
    { time: '2026-11-01T06:00:00.000', activity: 'Discharged', city: 'GDANSK', timeType: 'ACTUAL', container: 'TCLU3054361' },
    { time: '2026-11-30T06:00:00.000', activity: 'Delivery', city: 'GDANSK', timeType: 'EXPECTED', container: 'TCLU3054361' },
  ],
};
const nMixed = normalizeTracking(rawMixed);
assert.equal(nMixed.current.activity, 'Discharged', 'P0-2 对照：有 ACTUAL 时 current 仍是最后 ACTUAL');
assert.equal(nMixed.current.timeType, 'ACTUAL', 'P0-2 对照：current 的 timeType 必须为 ACTUAL');

console.log('tracking normalize regression tests passed');
