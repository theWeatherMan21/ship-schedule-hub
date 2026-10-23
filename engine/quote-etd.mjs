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
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const pol = arg('pol');
const pod = arg('pod');
const carriersArg = arg('carriers', '');
const daysAhead = Number(arg('days', '6'));
const timeoutSec = Number(arg('timeout', '240'));

if (!pol || !pod) {
  console.log(JSON.stringify({ ok: false, error: 'missing --pol / --pod' }));
  process.exit(2);
}

const carriers = carriersArg.split(',').map((s) => s.trim()).filter(Boolean);

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
  path.join(HERE, 'query.mjs'),
  '--origin', pol,
  '--destination', pod,
];
if (carriers.length) args.push('--carriers', carriers.join(','));

const t0 = Date.now();
const child = spawn(process.execPath, args, {
  cwd: HERE,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
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
      carrier,
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
