#!/usr/bin/env node
// 「WPS 回填工作台」数据聚合器 —— App 的 WPS 插件 tab 只认这一个出口
//
// 为什么要有它：WPS 插件跑在 WPS 进程里（file:// 沙盒），App 是另一个进程。
// 能共同看到的只有两样磁盘上的事实：
//   ① engine/tracking/journal.mjs 写的台账（每次追踪一行：单号/船司/成败/耗时/事件）
//   ② 插件自己落盘的配置（<doc>|<sheet>.json：列映射 + retry 待重查清单，**带行号**）
// 这里把两样缝在一起，算成「队列 + 逐行结果 + 时间线」给前端，前端不再做任何推断。
//
// 用法：
//   node engine/wps-jobs.mjs            # 输出一行 JSON（Rust 侧取最后一行）
//   node engine/wps-jobs.mjs --days 2 --now 1793264551254 --dir /tmp/x   # 测试用
//
// 铁律：**只读**。不写台账、不改插件配置、不碰桥。读不到就当空，绝不抛。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJobs, pruneJobs, JOBS_DIR as DEFAULT_JOBS_DIR, dayKey } from './tracking/journal.mjs';
const JOBS_DIR = DEFAULT_JOBS_DIR;

/** 插件状态目录（与桥一致：WPS_TRACK_CONFIG_DIR > ~/.hermes/wps-shiptrack） */
export const STATE_DIR = process.env.WPS_TRACK_CONFIG_DIR || path.join(os.homedir(), '.hermes', 'wps-shiptrack');

// 一批的边界：相邻两条台账间隔超过 3 分钟就当新的一批（并发 4 时行与行只差几秒；
// 单家中途慢会有一两分钟空档，3 分钟能吃掉这种抖动又不把「上午一轮/下午一轮」黏成一批）。
export const BATCH_GAP_MS = 180_000;
// 同一船司在这个窗口内被限流 ≥2 次 → 判「该家了，先冷一会儿」
export const THROTTLE_WINDOW_MS = 10 * 60_000;
export const THROTTLE_COOLDOWN_MS = 15 * 60_000;

const pad2 = (n) => String(n).padStart(2, '0');

/** 把 <doc>|<sheet>.json 的文件名拆开（URL 编码过，%7C 是 |） */
export function parseCfgKey(file) {
  const raw = String(file).replace(/\.json$/i, '');
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { /* 保留原样 */ }
  const i = decoded.lastIndexOf('|');
  return i < 0
    ? { doc: decoded, sheet: '' }
    : { doc: decoded.slice(0, i), sheet: decoded.slice(i + 1) };
}

/** 读插件落盘的列配置（顶层 *.json，排除 installed.json / update-url.txt 之类） */
export function readConfigs(dir = STATE_DIR, now = Date.now()) {
  const out = [];
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return out; }
  for (const f of files) {
    if (!/\.json$/i.test(f) || f === 'installed.json' || f.startsWith('.')) continue;
    const full = path.join(dir, f);
    let st = null;
    try { st = fs.statSync(full); } catch { continue; }
    if (!st.isFile()) continue;
    let cfg = null;
    try { cfg = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { continue; }
    if (!cfg || typeof cfg !== 'object') continue;
    // 只认「像列配置」的对象：至少得有 numberCol 或 retry 或 rows，避免把别的 json 混进来
    if (!('numberCol' in cfg) && !('retry' in cfg) && !('rows' in cfg)) continue;
    const { doc, sheet } = parseCfgKey(f);
    out.push({
      key: f.replace(/\.json$/i, ''),
      doc, sheet,
      cfgAt: Math.round(st.mtimeMs),
      ageMin: Math.max(0, Math.round((now - st.mtimeMs) / 60000)),
      rows: Number(cfg.rows) || 0,
      numberCol: Number(cfg.numberCol) || 0,
      outCol: Number(cfg.outCol) || 0,
      mode: String(cfg.mode || ''),
      retry: (Array.isArray(cfg.retry) ? cfg.retry : [])
        .filter((x) => x && x.n)
        .map((x) => ({ n: String(x.n), row: Number(x.row) || 0, at: Number(x.at) || 0, tries: Number(x.tries) || 0 }))
        .slice(0, 500),
    });
  }
  return out.sort((a, b) => b.cfgAt - a.cfgAt);
}

const THROTTLE_RE = /429|too many|rate.?limit|challenge|captcha|人机|验证|被拦|blocked|forbidden|频繁/i;
/** 这条失败是不是「撞限流/被拦」——决定 UI 要不要把整家标成冷却 */
export function isThrottle(rec) {
  if (!rec || rec.ok) return false;
  const k = String(rec.kind || '');
  if (/throttl|rate|block|challenge|captcha|forbidden/i.test(k)) return true;
  return THROTTLE_RE.test(`${rec.err || ''} ${rec.kind || ''}`);
}

/** 一批里某个单号对应的表格行号：优先台账自带（--row），其次插件 retry 清单 */
function rowOf(rec, tableByNumber) {
  if (rec.row) return rec.row;
  const hit = tableByNumber && tableByNumber.get(String(rec.n));
  return hit ? hit.row : 0;
}

/**
 * 核心聚合。纯函数（jobs/cfgs 都从参数来），单测直接喂。
 * @param {{jobs: object[], cfgs: object[], installed?: object|null, now?: number}} input
 */
export function buildWorkbench({ jobs = [], cfgs = [], installed = null, now = Date.now() } = {}) {
  const records = jobs
    .filter((r) => r && r.n && Number.isFinite(Number(r.ts)))
    .slice()
    .sort((a, b) => a.ts - b.ts);

  // 单号 → {row, tableKey}（用于给「成功行」也补上行号；拿不到就 0）
  const tableByNumber = new Map();
  const tables = cfgs.map((c) => {
    const byNumber = new Map();
    for (const x of c.retry) {
      if (!byNumber.has(x.n)) byNumber.set(x.n, { row: x.row, tries: x.tries });
      if (!tableByNumber.has(x.n)) tableByNumber.set(x.n, { row: x.row, tableKey: c.key });
    }
    const dueAt = c.retry.length ? Math.min(...c.retry.map((x) => x.at || 0)) : 0;
    return { ...c, byNumber: undefined, retryDueAt: dueAt, retryCount: c.retry.length, _byNumber: byNumber };
  });

  // 切批：间隔 > BATCH_GAP_MS 就新开一批
  const batches = [];
  let cur = null;
  for (const r of records) {
    if (!cur || r.ts - cur.endedAt > BATCH_GAP_MS) {
      cur = { startedAt: r.ts, endedAt: r.ts, items: [] };
      batches.push(cur);
    }
    cur.endedAt = r.ts;
    cur.items.push(r);
  }

  // 每批关联到哪张表：批内单号命中某表配置最多的那本（命中不到就是「未关联」= App 单票查询）
  const outBatches = batches.slice(-6).map((b, idx, arr) => {
    const votes = new Map();
    for (const it of b.items) {
      const hit = tableByNumber.get(String(it.n));
      if (hit && hit.tableKey) votes.set(hit.tableKey, (votes.get(hit.tableKey) || 0) + 1);
    }
    let tableKey = '';
    let best = 0;
    for (const [k, v] of votes) if (v > best) { best = v; tableKey = k; }
    // 一条都没命中（全成功的一轮不会进 retry）→ 用**时间对齐**兜：插件每轮结束都会
    // saveCfg，配置文件的 mtime 会落在这一轮的时间窗附近。没有这条，全成功的批次会
    // 显示成「未关联表」，让人以为账记错了。
    if (!tableKey) {
      let near = null;
      for (const t of tables) {
        if (t.cfgAt < b.startedAt - 60_000 || t.cfgAt > b.endedAt + 300_000) continue;
        const d = Math.abs(t.cfgAt - b.endedAt);
        if (!near || d < near.d) near = { t, d };
      }
      if (near) tableKey = near.t.key;
    }
    const items = b.items.map((it) => ({
      ts: it.ts,
      n: it.n,
      c: it.c || '',
      ok: !!it.ok,
      ms: it.ms || 0,
      cached: !!it.cached,
      manual: !!it.manual,
      err: it.err || '',
      kind: it.kind || '',
      phase: it.phase || '',
      cur: it.cur || '',
      curt: it.curt || '',
      curc: it.curc || '',
      etat: it.etat || '',
      etac: it.etac || '',
      cont: it.cont || 0,
      evc: it.evc || 0,
      events: Array.isArray(it.events) ? it.events : [],
      url: it.url || '',
      row: rowOf(it, tableByNumber),
      throttle: isThrottle(it),
    }));
    const ok = items.filter((i) => i.ok).length;
    const fail = items.length - ok;
    const manual = items.filter((i) => !i.ok && i.url).length;
    const byCarrier = {};
    for (const i of items) {
      const k = i.c || '?';
      const s = byCarrier[k] || (byCarrier[k] = { total: 0, ok: 0, fail: 0, throttle: 0 });
      s.total++; s.ok += i.ok ? 1 : 0; s.fail += i.ok ? 0 : 1; s.throttle += i.throttle ? 1 : 0;
    }
    const t = tables.find((x) => x.key === tableKey) || null;
    return {
      id: `b${b.startedAt}`,
      seq: arr.length - idx,
      startedAt: b.startedAt,
      endedAt: b.endedAt,
      ms: Math.max(0, b.endedAt - b.startedAt),
      total: items.length,
      ok, fail, manual,
      cached: items.filter((i) => i.cached).length,
      throttled: items.filter((i) => i.throttle).length,
      tableKey,
      doc: t ? t.doc : '',
      sheet: t ? t.sheet : '',
      label: t ? `${t.doc}${t.sheet ? ' · ' + t.sheet : ''}` : '未关联表（App 单票 / 桥直查）',
      rowsPlanned: t ? t.rows : 0,
      byCarrier,
      items,
    };
  });

  // 船司层面的限流/冷却（跨批次看最近 10 分钟）
  const carrierStats = new Map();
  for (const r of records) {
    const k = r.c || '?';
    const s = carrierStats.get(k) || { carrier: k, total: 0, ok: 0, fail: 0, throttle: 0, lastTs: 0, lastErr: '', cooldownUntil: 0 };
    s.total++; s.lastTs = Math.max(s.lastTs, r.ts);
    if (r.ok) s.ok++;
    else { s.fail++; s.lastErr = r.err || s.lastErr; }
    if (isThrottle(r) && now - r.ts <= THROTTLE_WINDOW_MS) {
      s.throttle++;
      s.cooldownUntil = Math.max(s.cooldownUntil, r.ts + THROTTLE_COOLDOWN_MS);
    }
    carrierStats.set(k, s);
  }
  const carriers = [...carrierStats.values()].sort((a, b) => b.lastTs - a.lastTs);
  const warnings = carriers
    .filter((c) => c.throttle >= 2 && c.cooldownUntil > now)
    .map((c) => ({
      carrier: c.carrier,
      kind: 'throttle',
      text: `${c.carrier.toUpperCase()} 近 10 分钟撞了 ${c.throttle} 次限流/验证 —— 这家先冷到 ${hhmm(c.cooldownUntil)}，别再点`,
      cooldownUntil: c.cooldownUntil,
    }));

  const lastTs = records.length ? records[records.length - 1].ts : 0;
  const currentTable = tables[0] || null;

  return {
    ok: true,
    now,
    version: 1,
    journal: {
      dir: JOBS_DIR,
      days: [...new Set(records.map((r) => dayKey(r.ts)))].sort(),
      records: records.length,
      lastTs,
    },
    plugin: installed
      ? { version: String(installed.version || ''), installedAt: String(installed.installedAt || ''), dir: String(installed.dir || '') }
      : null,
    currentTable: currentTable
      ? { key: currentTable.key, doc: currentTable.doc, sheet: currentTable.sheet, cfgAt: currentTable.cfgAt, ageMin: currentTable.ageMin, rows: currentTable.rows }
      : null,
    tables: tables.map((t) => ({
      key: t.key,
      doc: t.doc,
      sheet: t.sheet,
      cfgAt: t.cfgAt,
      ageMin: t.ageMin,
      rows: t.rows,
      numberCol: t.numberCol,
      outCol: t.outCol,
      mode: t.mode,
      retryCount: t.retryCount,
      retryDueAt: t.retryDueAt,
      retry: t.retry,
    })),
    batches: outBatches,
    carriers,
    warnings,
  };
}

function hhmm(ts) {
  const d = new Date(ts || 0);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 探测本地桥（8791）。**在 Node 里探，不在 WebView 里 fetch** ——
 * Tauri 生产环境的 origin 是 tauri://localhost，桥的 CORS 白名单只放本机 http 页面，
 * 前端直连必被 403（而且浏览器侧的失败只剩一句 CORS 报错，排障极难）。
 */
export async function probeBridge(port = Number(process.env.WPS_TRACK_PORT || 8791), timeoutMs = 800) {
  const base = { port, online: false };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: ctl.signal });
    clearTimeout(timer);
    if (!r.ok) return { ...base, error: `HTTP ${r.status}` };
    const j = await r.json();
    if (!j || !j.ok) return { ...base, error: 'health 非 ok' };
    return {
      port, online: true,
      service: String(j.service || ''),
      busy: Number(j.busy || 0),
      cached: Number(j.cached || 0),
      concurrency: Number(j.concurrency || 0),
      repo: String(j.repo || ''),
    };
  } catch (e) {
    // 连不上是**常态**（爹地没开 WPS/桥没起），不是错误 —— UI 显示「桥未启动」即可
    return { ...base, error: String((e && e.message) || e).slice(0, 80) };
  }
}

/** 读盘 + 聚合（CLI 入口与 Rust 命令共用） */
export async function collect({ days = 2, now = Date.now(), stateDir = STATE_DIR, jobsDir = JOBS_DIR, prune = true, probe = true } = {}) {
  let installed = null;
  try { installed = JSON.parse(fs.readFileSync(path.join(stateDir, 'installed.json'), 'utf8')); } catch { /* 没装 */ }
  if (prune) { try { pruneJobs(Math.max(7, days), now, jobsDir); } catch { /* ignore */ } }
  const jobs = (() => { try { return readJobs(days, now, jobsDir); } catch { return []; } })();
  const cfgs = readConfigs(stateDir, now);
  const out = buildWorkbench({ jobs, cfgs, installed, now });
  out.journal.dir = jobsDir;
  out.bridge = probe ? await probeBridge() : { port: 0, online: false, error: 'skipped' };
  return out;
}

// ---------- CLI ----------
const isMain = (() => {
  try { return !!process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();

if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (name, dflt) => {
    const i = argv.indexOf('--' + name);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt;
  };
  const days = Number(opt('days', 2)) || 2;
  const now = Number(opt('now', 0)) || Date.now();
  let out;
  try {
    out = await collect({ days, now, stateDir: String(opt('state', STATE_DIR)), jobsDir: String(opt('dir', JOBS_DIR)) });
  } catch (e) {
    out = { ok: false, error: String((e && e.message) || e).slice(0, 300), now };
  }
  process.stdout.write(JSON.stringify(out) + '\n');
}
