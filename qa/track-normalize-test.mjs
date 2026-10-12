import assert from 'node:assert/strict';
import { normalizeTracking } from '../engine/tracking/normalize.mjs';

const rawMaersk = {
  ok: true, carrier: 'maersk', number: '276759780', origin: 'XINGANG (CN)', destination: 'GDANSK (PL)', status: 'IN_PROGRESS',
  containers: [{ num: 'MRKU8582679', status: 'IN_PROGRESS', events: [] }],
  events: [
    { time: '2026-10-08T04:46:00.000', activity: 'Container Departure', city: 'XINGANG', timeType: 'ACTUAL', container: 'MRKU8582679' },
    { time: '2026-11-17T04:00:00.000', activity: 'Container Arrival', city: 'PORT TANGIER MEDITERRANEE', timeType: 'EXPECTED', container: 'MRKU8582679' },
    { time: '2026-11-19T17:00:00.000', activity: 'Container Departure', city: 'PORT TANGIER MEDITERRANEE', timeType: 'EXPECTED', container: 'MRKU8582679' },
    { time: '2026-11-26T06:00:00.000', activity: 'Container Arrival', city: 'GDANSK', timeType: 'EXPECTED', container: 'MRKU8582679' },
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
  ok: true, carrier: 'yangming', number: 'YMLU3560471',
  containers: [{ num: 'YMLU3560471', status: '' }],
  events: [
    { time: '2026-09-30T16:33', activity: 'Gate in of Empty Equipment by Truck at Depot', city: 'KEELUNG', timeType: 'ACTUAL', container: 'YMLU3560471' },
    { time: '2026-09-26T15:23', activity: 'Discharge of Laden Equipment from Vessel at Port terminal', city: 'KEELUNG', timeType: 'ACTUAL', container: 'YMLU3560471' },
  ],
};
const nYm = normalizeTracking(rawYm);
assert.equal(nYm.phase, 'Completed', 'YM empty return means completed');
assert.equal(nYm.current.activity, 'Gate In Of Empty Equipment By Truck At Depot', 'YM current stays last actual');

console.log('tracking normalize regression tests passed');
