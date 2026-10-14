// 运行产物回收（2026-10-14 审阅 P2「运行产物无回收」）
// ---------------------------------------------------------------------------
// 现象：证据目录里 `run-*.ndjson` 每次查询新增一个、`hapag-track-*.txt` 调试 dump 每次追踪
//       新增若干，长期不清理会积到上百个（审阅实测 154 个 ndjson；本次实测 156 个 ndjson
//       + 17 个 dump；证据目录 5.8MB，整个数据目录 87MB）。
// 做法：只清「本项目自己的运行产物」，按「保留最近 N 个」滚动 —— 绝不动 png / 其它 txt / cache。
//       保留数用 SSH_KEEP_RUNS / SSH_KEEP_DUMPS 覆盖；<1 = 关掉该类清理。
// 位置：引擎（query.mjs）与追踪 CLI（tracking/cli.mjs）启动时各跑一次。
//       新写出的文件按 mtime 永远最新，所以绝不会把自己这一次的产物清掉。
import fs from 'node:fs';
import path from 'node:path';

const RUN_RE = /^run-[\w-]+\.ndjson$/;
const DUMP_RE = /^hapag-track-\d+-(?:maint|list|detail)\.txt$/;

function pruneByPattern(dir, re, keep) {
  let names;
  try { names = fs.readdirSync(dir); } catch { return { kept: 0, removed: 0 }; }
  const hits = [];
  for (const n of names) {
    if (!re.test(n)) continue;
    try { hits.push({ n, t: fs.statSync(path.join(dir, n)).mtimeMs }); } catch { /* 并发被删就算了 */ }
  }
  hits.sort((a, b) => b.t - a.t);            // 新 → 旧
  const k = Math.max(0, Math.floor(keep));
  let removed = 0;
  for (const h of hits.slice(k)) {
    try { fs.unlinkSync(path.join(dir, h.n)); removed++; } catch { /* 删不掉不拦主流程 */ }
  }
  return { kept: Math.min(hits.length, k), removed };
}

/**
 * 滚动清理证据目录里的运行产物。
 * @param {string} dir 证据目录
 * @param {{keepRuns?:number, keepDumps?:number, log?:(m:string)=>void}} opts
 */
export function pruneEvidence(dir, { keepRuns = 50, keepDumps = 40, log = () => {} } = {}) {
  const out = { runs: { kept: 0, removed: 0 }, dumps: { kept: 0, removed: 0 } };
  if (Number(keepRuns) >= 1) out.runs = pruneByPattern(dir, RUN_RE, Number(keepRuns));
  if (Number(keepDumps) >= 1) out.dumps = pruneByPattern(dir, DUMP_RE, Number(keepDumps));
  const removed = out.runs.removed + out.dumps.removed;
  if (removed) {
    log(`[reclaim] 运行产物回收：删 ${out.runs.removed} 个 run-*.ndjson、${out.dumps.removed} 个调试 dump`
      + `（各保留最近 ${keepRuns}/${keepDumps} 个）`);
  }
  return out;
}

/** 保留数（SSH_KEEP_RUNS / SSH_KEEP_DUMPS 可覆盖；未设 = 默认值）。 */
export function keepFromEnv(env = process.env) {
  const n = (v, d) => (v === undefined || v === '' ? d : Number(v));
  return { keepRuns: n(env.SSH_KEEP_RUNS, 50), keepDumps: n(env.SSH_KEEP_DUMPS, 40) };
}
