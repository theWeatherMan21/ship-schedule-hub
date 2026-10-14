// engine/query.mjs 数值参数校验单测（10-14 审阅 A2 回归）
// 背景：--batch 0/-1 → 主循环死循环；--batch abc → NaN 静默丢浏览器船司；timeout 非法 → 立即 reject
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const run = (extra) => spawnSync('node', ['engine/query.mjs', '--carriers', 'maersk', '--origin', 'Shanghai', '--destination', 'Istanbul', ...extra], { encoding: 'utf8', timeout: 20000, cwd: process.cwd() });

// 非法值 → exit 2 + engine-error 消息（不启动浏览器）
for (const [args, label] of [
  [['--batch', '0'], '--batch 0'],
  [['--batch', '-1'], '--batch -1'],
  [['--batch', 'abc'], '--batch abc'],
  [['--per-carrier-timeout', '0'], '--per-carrier-timeout 0'],
  [['--per-carrier-timeout', 'abc'], '--per-carrier-timeout abc'],
]) {
  const r = run(args);
  assert.equal(r.status, 2, `${label} 应 exit 2（实际 ${r.status}，stderr: ${r.stderr.slice(0, 200)}）`);
  assert.match(r.stderr, /engine-error/, `${label} 应给出 engine-error`);
}
console.log('query args validation tests passed（5 组非法值全部 fail fast）');
