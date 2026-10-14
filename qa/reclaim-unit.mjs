// engine/lib/reclaim.mjs 单测（10-14 审阅 P2「运行产物无回收」回归）
// 背景：证据目录里 run-*.ndjson 每次查询新增一个、hapag-track-*.txt 每次追踪新增若干，
//       长期不清理会积到上百个（审阅实测 154 个 ndjson）。这里验证保留策略「只清自己的运行产物」。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pruneEvidence, keepFromEnv } from '../engine/lib/reclaim.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-reclaim-'));
const touch = (name, ageMs = 0) => {
  const p = path.join(dir, name);
  fs.writeFileSync(p, 'x');
  if (ageMs) {
    const t = new Date(Date.now() - ageMs);
    fs.utimesSync(p, t, t);
  }
  return p;
};

// 60 个 run-*.ndjson（越早越旧）+ 50 个 hapag 调试 dump + 不该动的文件
for (let i = 0; i < 60; i++) touch(`run-2026-10-${String(i % 28 + 1).padStart(2, '0')}T00-00-0${i % 10}-000Z.ndjson`, (60 - i) * 60000);
for (let i = 0; i < 50; i++) touch(`hapag-track-17917760${String(i).padStart(2, '0')}-list.txt`, (50 - i) * 60000);
const keepPng = touch('maersk.png');
const keepTxt = touch('aria-cosco.txt');                 // 别的 txt 不是运行产物，不许动
const keepNdjson = touch('something-else.ndjson');       // 名字不匹配 run-* 的也不许动

const r1 = pruneEvidence(dir, { keepRuns: 50, keepDumps: 40, log: () => {} });
const left = fs.readdirSync(dir);
const countRe = (re) => left.filter((n) => re.test(n)).length;

assert.equal(countRe(/^run-[\w-]+\.ndjson$/), 50, `run-*.ndjson 应留 50，实际 ${countRe(/^run-[\w-]+\.ndjson$/)}`);
assert.equal(countRe(/^hapag-track-.*\.txt$/), 40, `dump 应留 40，实际 ${countRe(/^hapag-track-.*\.txt$/)}`);
assert.equal(r1.runs.removed, 10, `run 应删 10，实际 ${r1.runs.removed}`);
assert.equal(r1.dumps.removed, 10, `dump 应删 10，实际 ${r1.dumps.removed}`);
for (const f of [keepPng, keepTxt, keepNdjson]) assert.ok(fs.existsSync(f), `${path.basename(f)} 不该被删`);
// 保留的是**最新的**那批：最旧的那些应已消失
const oldestRun = path.join(dir, 'run-2026-10-01T00-00-00-000Z.ndjson');
assert.ok(!fs.existsSync(oldestRun), '最旧的 run-*.ndjson 应被删');

// 幂等：再跑一次不再删（已只剩 50/40）
const r2 = pruneEvidence(dir, { keepRuns: 50, keepDumps: 40, log: () => {} });
assert.equal(r2.runs.removed + r2.dumps.removed, 0, '第二次跑应无删除（幂等）');

// keepRuns=0 → 关掉该类清理（不删）
const r3 = pruneEvidence(dir, { keepRuns: 0, keepDumps: 0, log: () => {} });
assert.equal(r3.runs.removed + r3.dumps.removed, 0, 'keepRuns/keepDumps=0 应关闭清理');
assert.equal(countRe(/^run-[\w-]+\.ndjson$/), 50, '关闭后 run 数不变');

// 目录不存在也不许抛
assert.doesNotThrow(() => pruneEvidence(path.join(dir, 'nope'), { log: () => {} }));

// env 解析
assert.deepEqual(keepFromEnv({}), { keepRuns: 50, keepDumps: 40 });
assert.deepEqual(keepFromEnv({ SSH_KEEP_RUNS: '5', SSH_KEEP_DUMPS: '' }), { keepRuns: 5, keepDumps: 40 });

fs.rmSync(dir, { recursive: true, force: true });
console.log('reclaim tests passed（保留策略 50/40 · 只清自己产物 · 幂等 · 可关 · dir 不存在不抛）');
