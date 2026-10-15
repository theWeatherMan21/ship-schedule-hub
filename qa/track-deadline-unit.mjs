// 按家追踪截止（10-15 爹地拍板放宽）单测：computeDeadlineMs 优先级 + Hapag 声明核验
import assert from 'node:assert/strict';
import { computeDeadlineMs, loadTracker } from '../engine/tracking/registry.mjs';

// ① 优先级：env > 适配器声明 > timeoutMs×4
assert.equal(computeDeadlineMs({ envOverride: 12345, carrierDeadline: 400000, timeoutMs: 60000 }), 12345,
  'env 应最优先');
assert.equal(computeDeadlineMs({ envOverride: 0, carrierDeadline: 400000, timeoutMs: 60000 }), 400000,
  '无 env 时用适配器声明');
assert.equal(computeDeadlineMs({ envOverride: 0, carrierDeadline: 0, timeoutMs: 60000 }), 240000,
  '都没有时 = timeoutMs×4（保持既有行为）');
assert.equal(computeDeadlineMs({}), 240000, '全默认 = 240s');
assert.equal(computeDeadlineMs({ carrierDeadline: -1 }), 240000, '负值视为未声明');

// ② Hapag 适配器确实声明了 400s；其它家未声明（0）
const hapag = await loadTracker('hapag');
assert.equal(hapag.deadlineMs, 400000, 'hapag 应声明 deadlineMs=400000');
assert.equal(typeof hapag.fn, 'function', 'loadTracker 应返回 fn');

const one = await loadTracker('one');
assert.equal(one.deadlineMs, 0, 'one 未声明（用默认 240s）');
assert.equal(typeof one.fn, 'function');

// ③ 组合：hapag 的路径推算
assert.equal(computeDeadlineMs({ envOverride: 0, carrierDeadline: hapag.deadlineMs, timeoutMs: 60000 }), 400000,
  'hapag 实际路径应为 400s');

console.log('track deadline unit tests passed（优先级 + hapag 声明 + 默认回落）');
