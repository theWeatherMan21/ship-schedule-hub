// 提单 / 箱号追踪 CLI —— App 与命令行共用的入口（婉宜 2026-10-10 · UI 卡）
//
// 用法：
//   node engine/tracking/cli.mjs --number 276759780
//   node engine/tracking/cli.mjs --number MRKU8582679 --carrier maersk
//   node engine/tracking/cli.mjs --list                      # 列出已接入的船司
//   --no-cache / SSH_TRACK_CACHE_TTL_MS=0                    # 关缓存（默认 20 分钟）
//
// 输出：stdout 逐行 NDJSON（Rust 侧原样转成 `track://event` 事件），stderr 留给错误/调试。
//   {type:'track-started', number, carrier, auto, detected:{...}, available:[...]}
//   {type:'track-result',  ok, carrier, number, ...归一化结果}      ← 成功
//   {type:'track-result',  ok:false, carrier, number, error}        ← 跑了但没数据（如实报）
//   {type:'track-error',   msg, code}                               ← 参数/模块级错误（退出码 2）
//   {type:'track-exit',    ok, cached, ms}
//
// 静默红线：追踪一律走无头浏览器（engine/browser.mjs 的 headless 语义保证零窗口），
// 且复用与船期查询同一份运行期数据目录（~/Library/Application Support/ShipScheduleHub）。
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { EVIDENCE_DIR } from '../browser.mjs';
import { detectCarrier, describeShape, CARRIER_LABELS } from './detect.mjs';
import { loadTracker, availableCarriers } from './registry.mjs';
import { normalizeTracking } from './normalize.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const k = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[k] = true;   // 空值/开关
    else { out[k] = next; i++; }
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const emit = (type, obj = {}) => process.stdout.write(JSON.stringify({ type, ...obj }) + '\n');
// 10-14 审阅 C3：process.exit 不等 stdout 异步 flush → 大结果（>64KB 管道容量）被截断（实测 807KB→64KB）。
// 空写回调 = 前面所有写都进内核后退出；1.5s 保险丝防 stdout 异常挂死。
const flushExit = (code) => {
  process.stdout.write('', () => process.exit(code));
  setTimeout(() => process.exit(code), 1500).unref();
};

// ---------- --list：UI 打开页签时用它填充「船司」下拉（只列已接入的） ----------
if (args.list) {
  emit('track-carriers', { available: availableCarriers().map((id) => ({ id, label: CARRIER_LABELS[id] || id })) });
  flushExit(0);
}

const number = typeof args.number === 'string' ? args.number.trim() : '';
if (!number) { emit('track-error', { code: 'bad-args', msg: 'need --number <B/L or container number>' }); flushExit(2); }

// 船司：显式指定（--carrier X）优先；否则自动识别
let carrier = typeof args.carrier === 'string' ? args.carrier.trim().toLowerCase() : '';
let detected = null;
const auto = !carrier || carrier === 'auto';
if (auto) {
  const d = detectCarrier(number);
  detected = d;
  if (!d.ok) {
    const short = d.reason === 'too-short';
    emit('track-error', {
      code: 'unknown-carrier',
      number: d.number,
      shape: describeShape(number),
      reason: d.reason,
      msg: short
        ? `"${d.number}" is too short for a B/L or container number (need at least 5 characters)`
        : `Cannot tell which carrier owns "${d.number}" — pick one manually`,
      available: availableCarriers(),
    });
    flushExit(2);
  }
  carrier = d.carrier;
}

const available = availableCarriers();
if (!available.includes(carrier)) {
  emit('track-error', {
    code: 'no-tracker',
    number, carrier,
    msg: `Tracking is not wired up for ${CARRIER_LABELS[carrier] || carrier} yet${available.length ? ` (available: ${available.join(', ')})` : ''}`,
    available,
  });
  flushExit(2);
}

const started = Date.now();
emit('track-started', {
  number,
  carrier,
  label: CARRIER_LABELS[carrier] || carrier,
  auto,
  detected: detected ? { carrier: detected.carrier, how: detected.how, scac: detected.scac, shape: describeShape(number) } : null,
  available,
});

// ---------- 缓存（同条件重复查 = 秒回；口径与船期查询一致：只缓存「真的有数据」的结果） ----------
const CACHE_TTL_MS = process.env.SSH_TRACK_CACHE_TTL_MS === undefined ? 20 * 60 * 1000 : Number(process.env.SSH_TRACK_CACHE_TTL_MS);
const cacheDir = path.join(EVIDENCE_DIR, 'cache');
const CACHE_SCHEMA = 2; // phase/status 语义变化时 bump，淘汰旧归一化缓存
const cacheKey = createHash('sha1').update(`track|v${CACHE_SCHEMA}|${carrier}|${number}`).digest('hex');
const cachePath = path.join(cacheDir, `track-${cacheKey}.json`);
if (CACHE_TTL_MS > 0 && !args['no-cache']) {
  try {
    const c = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const age = Date.now() - (c.at || 0);
    if (age >= 0 && age < CACHE_TTL_MS && c.result && c.result.ok) {
      const mins = Math.max(1, Math.round(age / 60000));
      emit('track-result', { ...c.result, cached: true, cachedAgoMin: mins });
      emit('track-exit', { ok: true, cached: true, ms: Date.now() - started });
      flushExit(0);
    }
  } catch { /* 没缓存或坏了 → 正常查 */ }
}

// ---------- 实查 ----------
let result = null;
try {
  const fn = await loadTracker(carrier);
  const timeoutMs = Number(process.env.SSH_TRACK_TIMEOUT_MS || args.timeout || 60000);
  // 10-14 审阅 C4：截止兜底 —— 适配器内部各步骤各自吃 timeoutMs，多步骤相加最坏能挂十几分钟
  // （hapag 实测最坏 ≈10-17 分钟）。给整次追踪加硬截止（默认 timeoutMs×4=4 分钟，SSH_TRACK_DEADLINE_MS 可覆盖）。
  const deadlineMs = Number(process.env.SSH_TRACK_DEADLINE_MS || 0) || timeoutMs * 4;
  const trackPromise = Promise.resolve(fn(number, { timeoutMs }));
  const r = await Promise.race([
    trackPromise,
    new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(`track deadline exceeded (${deadlineMs}ms)`)), deadlineMs); if (t.unref) t.unref(); }),
  ]);
  result = normalizeTracking({ ...(r || {}), carrier: (r && r.carrier) || carrier, number: (r && r.number) || number });
} catch (e) {
  result = { ok: false, carrier, number, error: String(e?.message || e).slice(0, 300) };
}

emit('track-result', result);
const ms = Date.now() - started;
if (result.ok) {
  if (CACHE_TTL_MS > 0 && !args['no-cache']) {
    try { fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cachePath, JSON.stringify({ at: Date.now(), result })); } catch { /* 缓存写不了不影响结果 */ }
  }
}
emit('track-exit', { ok: !!result.ok, cached: false, ms });
flushExit(0);
