// 提单 / 箱号追踪 CLI —— App 与命令行共用的入口（婉宜 2026-10-10 · UI 卡）
//
// 用法：
//   node engine/tracking/cli.mjs --number 276759780
//   node engine/tracking/cli.mjs --number <箱号> --carrier maersk
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
import { pruneEvidence, keepFromEnv } from '../lib/reclaim.mjs';
import { detectCarrier, describeShape, CARRIER_LABELS } from './detect.mjs';
import { loadTracker, availableCarriers, computeDeadlineMs } from './registry.mjs';
import { normalizeTracking } from './normalize.mjs';
// ★ 10-28（爹地拍板 ②）：任何一行查不出结果都要「给链接 + 收粘贴」——链接取自 identify 里实测过的官网页
import { carrierById } from './identify.mjs';
// ★ 10-29（架构②）：每跑完一单追加一行台账，App 的「WPS 回填工作台」靠它看逐行结果与时间线。
//   写台账失败绝不影响查询（journalJob 内部全 try/catch，永不抛）。
import { journalJob } from './journal.mjs';
const jobMeta = (extra = {}) => ({
  ...extra,
  // 桥/插件将来若带上 --doc --sheet --row，就直接落到台账里（现在没有也不报错）
  doc: typeof args.doc === 'string' ? args.doc : '',
  sheet: typeof args.sheet === 'string' ? args.sheet : '',
  row: Number(args.row) || 0,
});
const manualUrlOf = (id) => (carrierById(id) || {}).manualUrl || '';

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
// ★ 10-14 审阅 P2「运行产物无回收」：追踪路径自己也会产出 hapag 调试 dump（每次追踪若干个），
//   这里启动时滚动清理一次（与船期引擎同一套策略，见 engine/lib/reclaim.mjs）。
try { pruneEvidence(EVIDENCE_DIR, { ...keepFromEnv(), log: (m) => console.error(m) }); } catch { /* 回收失败不影响追踪 */ }
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
    manualUrl: manualUrlOf(carrier),   // ★ 10-28：没接入也要给一条能点的路，不再只丢一句死文案
    manualLabel: CARRIER_LABELS[carrier] || carrier,
  });
  // ★ 10-28：原来用 flushExit(2)，但它是异步的 → 后面的 track-started / track-result 仍会照跑一遍，
  //   UI 先显示 track-error 的友好文案、再被英文 error 覆盖。这条分支后面没有任何可做的事，直接退出。
  process.exit(2);
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
const CACHE_SCHEMA = 3; // phase/status 语义变化时 bump，淘汰旧归一化缓存（10-14：containers[].label 新增）
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
      journalJob(c.result, jobMeta({ ms: Date.now() - started, cached: true }));
      flushExit(0);
    }
  } catch { /* 没缓存或坏了 → 正常查 */ }
}

// ---------- 实查 ----------
let result = null;
try {
  const { fn, deadlineMs: carrierDeadline } = await loadTracker(carrier);
  const timeoutMs = Number(process.env.SSH_TRACK_TIMEOUT_MS || args.timeout || 60000);
  // 10-14 审阅 C4：截止兜底 —— 适配器内部各步骤各自吃 timeoutMs，多步骤相加最坏能挂十几分钟
  // （hapag 实测最坏 ≈10-17 分钟）。给整次追踪加硬截止。
  // 10-15 爹地拍板：支持「按家放宽」——优先级 env(SSH_TRACK_DEADLINE_MS) > 适配器声明的
  // deadlineMs（Hapag 自declare 400000：CF 双模流程常态 2-8 分钟） > timeoutMs×4=240s。
  const deadlineMs = computeDeadlineMs({
    envOverride: Number(process.env.SSH_TRACK_DEADLINE_MS || 0),
    carrierDeadline,
    timeoutMs,
  });
  const trackPromise = Promise.resolve(fn(number, { timeoutMs }));
  const r = await Promise.race([
    trackPromise,
    new Promise((_, rej) => { const t = setTimeout(() => rej(new Error(`track deadline exceeded (${deadlineMs}ms)`)), deadlineMs); if (t.unref) t.unref(); }),
  ]);
  result = normalizeTracking({ ...(r || {}), carrier: (r && r.carrier) || carrier, number: (r && r.number) || number });
  // ★ 10-29：适配器「跑了但没结果」（查无此号/限流/被拦）时 normalize 会丢掉 manualUrl，
  //   前端「查到→手工兜底」那条路就断了。这里补回：任何 ok:false 都要能点开官网页。
  if (result && !result.ok) {
    result.manualUrl = manualUrlOf(carrier);
    result.manualLabel = CARRIER_LABELS[carrier] || carrier;
    if (r && r.errorKind) result.errorKind = r.errorKind;
    if (r && r.notFound) result.notFound = true;
  }
} catch (e) {
  result = {
    ok: false, carrier, number,
    error: String(e?.message || e).slice(0, 300),
    manualUrl: manualUrlOf(carrier),        // ★ 10-28：查挂了也给出路
    manualLabel: CARRIER_LABELS[carrier] || carrier,
  };
}

emit('track-result', result);
const ms = Date.now() - started;
journalJob(result, jobMeta({ ms, cached: false }));
if (result.ok) {
  if (CACHE_TTL_MS > 0 && !args['no-cache']) {
    try {
      fs.mkdirSync(cacheDir, { recursive: true });
      // 10-14 审阅：原子写（tmp + rename）——直接 writeFileSync 在中断/并发下可能留半截文件
      const tmp = cachePath + '.tmp' + process.pid;
      fs.writeFileSync(tmp, JSON.stringify({ at: Date.now(), result }));
      fs.renameSync(tmp, cachePath);
    } catch { /* 缓存写不了不影响结果 */ }
  }
}
emit('track-exit', { ok: !!result.ok, cached: false, ms });
flushExit(0);
