// 追踪查询台账（journal）—— 一行一次查询，给 App 的「WPS 回填工作台」读
//
// 为什么在这里：WPS 插件点③ 之后，钱是桥在花、浏览器是桥在开，但**爹地要看结果只能回到
// WPS 表格里猜**（哪行失败、为什么失败、查了几次）。插件是 file:// 沙盒，App 是另一个进程，
// 两边唯一的公共地面就是磁盘。所以追踪 CLI 每跑完一单，就往
// ~/.hermes/wps-shiptrack/jobs/jobs-YYYY-MM-DD.ndjson 追加一行，App 侧只读不写。
//
// 铁律（婉宜 2026-10-29）：
// 1. **绝不因为写台账失败而影响查询** —— 全部 try/catch，失败静默（磁盘满/权限/只读都要能查）。
// 2. **单条记录必须小于 4KB** —— 多进程（桥并发 4 + App 单票）同时 append，超过 PIPE_BUF
//    就不再是原子写，会出现半行把整个文件读坏。events 只留最新 12 条，字段一律裁剪。
// 3. 这里只记「引擎看到的事实」（单号/船司/成败/耗时/事件），**不记表格行号** ——
//    行号只有插件知道，App 侧用插件配置（doc|sheet.json 的 retry[].row）回补。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 台账目录。测试用 WPS_JOBS_DIR 覆盖，App/桥不传就用默认位置。 */
export const JOBS_DIR = process.env.WPS_JOBS_DIR || path.join(os.homedir(), '.hermes', 'wps-shiptrack', 'jobs');

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const dayFile = (ts, dir = JOBS_DIR) => path.join(dir, `jobs-${dayKey(ts)}.ndjson`);

const s = (v, n = 120) => String(v == null ? '' : v).slice(0, n);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** 把归一化后的追踪结果压成台账里的一行（纯函数，单测直接喂它） */
export function toRecord(result, meta = {}) {
  const r = result || {};
  const ev = Array.isArray(r.events) ? r.events : [];
  const tail = ev.slice(-12).map((e) => ({
    t: s(e && e.time, 20),
    a: s(e && e.activity, 60),
    c: s(e && e.city, 32),
    v: s(e && e.vessel, 24),
    y: s(e && (e.voyage || ''), 16),
    x: e && (e.timeType === 'EXPECTED' || e.isEta) ? 1 : 0,
    m: e && e.manual ? 1 : 0,
    k: e && e.container ? s(e.container, 16) : '',
  }));
  const cur = r.current || {};
  const eta = r.eta || {};
  return {
    v: 1,
    ts: num(meta.ts) || Date.now(),
    n: s(r.number || meta.number, 40),
    c: s(r.carrier || meta.carrier, 16),
    ok: !!r.ok,
    ms: num(meta.ms),
    cached: meta.cached ? 1 : 0,
    manual: r.manual ? 1 : 0,
    // 「跑到一半没数据 / 查无此号 / 被限流」在 UI 上是三种颜色，别只留一个 ok:false
    err: r.ok ? '' : s(r.error, 200),
    kind: s(r.errorKind || (r.notFound ? 'not-found' : ''), 24),
    phase: s(r.phase, 60),
    cur: s(cur.activity, 60),
    curt: s(cur.time, 20),
    curc: s(cur.city, 32),
    etat: s(eta.time, 20),
    etac: s(eta.city, 32),
    cont: Array.isArray(r.containers) ? r.containers.length : num(r.containerCount),
    evc: ev.length,
    events: tail,
    url: s(r.manualUrl, 200),
    src: s(meta.src, 16) || 'cli',   // 将来桥/插件带 --doc 时可按来源分桶
    doc: s(meta.doc, 200),
    sheet: s(meta.sheet, 60),
    row: num(meta.row),
  };
}

/**
 * 追加一条台账。**永不抛异常**（调用点也不需要 try/catch，但保留也行）。
 * @returns {object|null} 落盘的记录；失败返回 null。
 */
export function journalJob(result, meta = {}) {
  try {
    const dir = meta.dir || JOBS_DIR;
    const rec = toRecord(result, meta);
    if (!rec.n) return null;
    // 兜底裁剪：极端长错误串已在上游截到 200 字，这里再兜一次总量
    let line = JSON.stringify(rec);
    if (line.length > 3900) {
      rec.events = rec.events.slice(-3);
      rec.err = rec.err.slice(0, 120);
      line = JSON.stringify(rec);
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(dayFile(rec.ts, dir), line + '\n');
    return rec;
  } catch {
    return null;
  }
}

/** 读最近 days 天的台账（默认 2 天：够覆盖跨零点的长批次）。坏行跳过，不炸。 */
export function readJobs(days = 2, now = Date.now(), dir = JOBS_DIR) {
  const out = [];
  for (let i = 0; i < Math.max(1, days); i++) {
    const f = dayFile(now - i * 86400_000, dir);
    let txt = '';
    try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const ln of txt.split('\n')) {
      const t = ln.trim();
      if (!t) continue;
      try { out.push(JSON.parse(t)); } catch { /* 半行/坏行：跳过 */ }
    }
  }
  return out.sort((a, b) => (a.ts || 0) - (b.ts || 0));
}

/** 滚动清理：只留最近 keepDays 天，顺手防止目录无限长。返回删掉的个数。 */
export function pruneJobs(keepDays = 7, now = Date.now(), dir = JOBS_DIR) {
  let n = 0;
  try {
    const keep = new Set();
    for (let i = 0; i < keepDays; i++) keep.add(`jobs-${dayKey(now - i * 86400_000)}.ndjson`);
    for (const f of fs.readdirSync(dir)) {
      if (!/^jobs-\d{4}-\d{2}-\d{2}\.ndjson$/.test(f)) continue;
      if (keep.has(f)) continue;
      try { fs.unlinkSync(path.join(dir, f)); n++; } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return n;
}
