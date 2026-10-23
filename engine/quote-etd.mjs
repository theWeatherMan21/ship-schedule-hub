#!/usr/bin/env node
// 报价用 ETD 查询：给定 POL/POD + 船司列表，找每家「下一水」开船日。
//
// 口径（爹地 2026-10-23 拍板）：
//   「下一水」= ETD ≥ 今天+6 天的最早一班（有船期就一定给结果，
//   不卡严格的 +7±1 天窗口——实测宁波→格但斯克 10-29~10-31 根本没船）。
//
// 实现：薄封装在 query.mjs 之上 —— 复用已有的 11 家船司编排（fastpath 秒查 +
// 浏览器兜底），解析它的 NDJSON 事件流，只取 status=done 的 schedules。
//
// 用法：
//   node engine/quote-etd.mjs --pol NINGBO --pod GDANSK --carriers one,maersk,msc,cma
//   node engine/quote-etd.mjs --pol 宁波 --pod 格但斯克 --days 6 --timeout 240
//
// 输出（stdout 单个 JSON，便于 Rust 侧解析）：
//   { ok: true, targetDate: "2026-10-29", ms: 12345,
//     results: [{ carrier, name, etd, eta, vessel, voyage, transitDays }],
//     errors: [{ carrier, msg }] }
//
// 静默要求：query.mjs 默认不开可见窗口（只有 --window onscreen 才显示），符合爹地红线。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ★ P0（10-23 审阅）：主 App 的 stop_query 兜底清理是 `pkill -f <engine>/query.mjs`。
// 如果 ETD 查询也直接用 query.mjs，爹地点「停止」或在船期页操作时会把正在跑的
// ETD 查询一起杀掉。复制成 query-quote.mjs（内容随 query.mjs 自动刷新）→ 路径不同，
// pkill 不命中，两条链路彻底互不干扰。
const QUERY_SRC = path.join(HERE, 'query.mjs');
const QUERY_COPY = path.join(HERE, 'query-quote.mjs');
let queryEntry = QUERY_SRC;
try {
  const needCopy =
    !fs.existsSync(QUERY_COPY) ||
    fs.statSync(QUERY_COPY).mtimeMs < fs.statSync(QUERY_SRC).mtimeMs;
  if (needCopy) fs.copyFileSync(QUERY_SRC, QUERY_COPY);
  queryEntry = QUERY_COPY;
} catch {
  /* 复制失败就退回原脚本：功能仍可用，只是可能被 stop_query 误杀 */
}

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const pol = arg('pol');
const pod = arg('pod');
const carriersArg = arg('carriers', '');
const daysAhead = Number(arg('days', '6'));
const timeoutSec = Number(arg('timeout', '240'));
// 并发批次：默认 2（4 家同时开会互相踩浏览器 —— 实测 "Target page, context or browser has been closed"）
const batch = arg('batch', '2');

if (!pol || !pod) {
  console.log(JSON.stringify({ ok: false, error: 'missing --pol / --pod' }));
  process.exit(2);
}

const carriers = carriersArg.split(',').map((s) => s.trim()).filter(Boolean);

// 船司名映射：报价表里写的是 MSK/MSC/CMA/HPL…，引擎认的是 maersk/msc/cma/hapag…
// （10-23 实案：不做映射会查空——状态显示"已完成"但一条 ETD 都没有）
const CARRIER_ID = {
  msk: 'maersk', maersk: 'maersk', 'msk lines': 'maersk',
  msc: 'msc',
  cma: 'cma', 'cma cgm': 'cma', cmacgm: 'cma',
  one: 'one',
  cosco: 'cosco', 'cosco shipping': 'cosco',
  hapag: 'hapag', 'hapag-lloyd': 'hapag', hpl: 'hapag', 'hpl soc': 'hapag', hl: 'hapag',
  zim: 'zim',
  evergreen: 'evergreen', emc: 'evergreen', 'ever green': 'evergreen',
  yangming: 'yangming', 'yang ming': 'yangming', yml: 'yangming',
  hmm: 'hmm',
  oocl: 'oocl',
  pa: 'maersk', 'cog h': 'cosco', cogh: 'cosco',
};
function toCarrierId(name) {
  const k = String(name || '').trim().toLowerCase();
  return CARRIER_ID[k] || k;
}

// engine id → 表格里的原始写法（输出时还原，前端用它当 key）
const idToOriginal = new Map();
const queryIds = [];
for (const c of carriers) {
  const id = toCarrierId(c);
  if (id && !idToOriginal.has(id)) {
    idToOriginal.set(id, c);
    queryIds.push(id);
  }
}

// 目标日期：今天 + N 天（本地时区，避免 UTC 跨日）
const now = new Date();
const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);
const pad = (n) => String(n).padStart(2, '0');
const targetISO = `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`;

// 统一解析各种 ETD 写法 → YYYY-MM-DD（解析不了返回 ''）
function normDate(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);           // 2026-11-03
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);         // 03/11/2026
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);         // 2026/11/3
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return '';
}

const args = [
  queryEntry,
  '--origin', pol,
  '--destination', pod,
];
if (queryIds.length) args.push('--carriers', queryIds.join(','));
args.push('--batch', String(batch));
// ETD 必须是最新的：query.mjs 默认缓存 20 分钟，而且**失败结果也会被缓存**
// （10-23 实案：并发撞车失败 → 缓存下来 → 重试 0.3s 返回的还是那条错误）
args.push('--no-cache');

// 独立 profile（10-23 根因）：主 App 的船期引擎和报价 ETD 查询**共用同一个
// browser-profile**，两边同时开浏览器就撞锁 → 对方报 "Target page/context/browser
// has been closed"、整批查询没有任何结果（爹地实测「未查到 ETD」）。
// ETD 查询用独立档案目录：既不会踩主引擎，也不会被打断；实测新档案查 MSC/MSK/CMA 全过。
const DATA_DIR = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || process.env.TEMP || '.', 'ShipScheduleHub')
  : path.join(process.env.HOME || '.', 'Library/Application Support/ShipScheduleHub');
const ETD_PROFILE_DIR = path.join(DATA_DIR, 'etd-profile');

const t0 = Date.now();
const child = spawn(process.execPath, args, {
  cwd: HERE,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    NODE_PATH: '',
    NODE_OPTIONS: '',
    SSH_PROFILE_DIR: ETD_PROFILE_DIR,   // 与主 App 的 browser-profile 隔离
    // ★ P1（10-23 审阅）：--no-cache 只阻止「读」，写缓存的分支照样执行 →
    // ETD 查询会污染主 App 的 20 分钟结果缓存。TTL=0 才是真正既不读也不写。
    SSH_CACHE_TTL_MS: '0',
  },
});

let buf = '';
const byCarrier = new Map();   // carrier -> { done: bool, schedules: [], msg: '' }
const errors = [];

child.stdout.setEncoding('utf8');
child.stdout.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let ev;
    try { ev = JSON.parse(line); } catch { continue; }
    if (ev.type !== 'carrier-status') continue;
    const cur = byCarrier.get(ev.carrier) || { done: false, schedules: [], msg: '' };
    if (ev.status === 'done') {
      cur.done = true;
      cur.schedules = Array.isArray(ev.schedules) ? ev.schedules : [];
      cur.msg = ev.msg || '';
    } else if (ev.status === 'error' || ev.status === 'fail') {
      cur.done = true;
      cur.msg = ev.msg || ev.status;
    } else {
      cur.msg = ev.msg || cur.msg;
    }
    byCarrier.set(ev.carrier, cur);
  }
});

const killTimer = setTimeout(() => {
  errors.push({ carrier: '*', msg: `timeout ${timeoutSec}s，已终止查询` });
  try { child.kill('SIGKILL'); } catch { /* ignore */ }
}, timeoutSec * 1000);

child.stderr.setEncoding('utf8');
let errBuf = '';
child.stderr.on('data', (c) => { errBuf += c; if (errBuf.length > 4000) errBuf = errBuf.slice(-4000); });

child.on('close', () => {
  clearTimeout(killTimer);
  const results = [];
  for (const [carrier, info] of byCarrier) {
    if (!info.done) {
      errors.push({ carrier, msg: info.msg || 'no result' });
      continue;
    }
    if (!info.schedules.length) {
      errors.push({ carrier, msg: info.msg || 'no schedules (route not served)' });
      continue;
    }
    // 「下一水」= ETD ≥ target 的最早一班
    const dated = info.schedules
      .map((s) => ({ ...s, _etd: normDate(s.etd || s.ETD) }))
      .filter((s) => s._etd && s._etd >= targetISO)
      .sort((a, b) => (a._etd < b._etd ? -1 : a._etd > b._etd ? 1 : 0));
    if (!dated.length) {
      const latest = info.schedules.map((s) => normDate(s.etd)).filter(Boolean).sort().pop();
      errors.push({ carrier, msg: `no ETD ≥ ${targetISO}（最早可见 ${latest || '—'}）` });
      continue;
    }
    const pick = dated[0];
    results.push({
      carrier: idToOriginal.get(carrier) || carrier,   // 还原成表格里的写法（MSK/MSC/CMA/ONE）
      name: pick.name || '',
      etd: pick._etd,
      eta: normDate(pick.eta) || pick.eta || '',
      vessel: pick.vessel || pick.vesselName || '',
      voyage: pick.voyage || '',
      transitDays: pick.transitDays || '',
    });
  }
  console.log(JSON.stringify({
    ok: true,
    targetDate: targetISO,
    ms: Date.now() - t0,
    results,
    errors,
    carriersQueried: carriers,
  }));
});
