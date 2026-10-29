// 运行期临时目录选择 —— Windows 审查 W-1（2026-10-15）的**引擎侧**收口
// ---------------------------------------------------------------------------
// 病根（真机实测，非推测）：TEMP/TMP/TMPDIR 若指向**不存在或不可写**的目录，
//   Playwright 起浏览器第一步 `mkdtemp('<TEMP>/playwright-artifacts-XXXXXX')` 就抛 ENOENT/EACCES，
//   所有浏览器类船司（MSC 等）全灭、0 条结果，而用户侧只看到「查询中」——**静默失败**。
//   Rust 侧（src-tauri/src/lib.rs）已改为优先用数据目录、建不出来才不动系统 TEMP；
//   这里补引擎侧的兜底链：**任何入口（App / 追踪 CLI / 报价）都不许拿着死 TEMP 去上班**。
//
// 选择顺序（先可用先用，全部不可用就抛可读错误，绝不静默挂起）：
//   ① SSH_TMPDIR —— 显式覆盖（排障/测试用）
//   ② 当前系统 TEMP（os.tmpdir()，即 Node 真正会用的那个）
//   ③ <数据目录>/.tmp —— App 自己的数据目录，profile/evidence 都写这里，必然可写
//   ④ 平台兜底（macOS /tmp、Windows %LOCALAPPDATA%\Temp）
//
// 纯逻辑 + 可注入 probe：`resolveTmpDir({ probe })` 可以在任意平台被测，
// 三种失败场景（未设置 / 不存在的路径 / 不可写）见 tests/tmpdir-fallback.mjs。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 目录能不能真的写东西：mkdir -p → 写一个探针文件 → 删掉。返回 {ok, error} */
export function probeDir(dir) {
  if (!dir || !String(dir).trim()) return { ok: false, error: '路径为空' };
  try {
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `.ssh-tmp-probe-${process.pid}-${Date.now()}`);
    fs.writeFileSync(f, 'ok');
    fs.unlinkSync(f);
    return { ok: true, error: null };
  } catch (e) {
    return { ok: false, error: (e && (e.code || e.message)) || String(e) };
  }
}

/** 平台兜底目录（③④ 都挂了才用） */
export function platformTmpFallback(platform = process.platform, env = process.env) {
  if (platform === 'win32') {
    const base = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(base, 'Temp');
  }
  return '/tmp';
}

/**
 * 选一个真的能写的临时目录。
 * @returns {{dir:string, source:string, tried:{source:string,dir:string,ok:boolean,error:string|null}[], degraded:boolean}}
 * @throws 全部候选都不可用时抛 Error（message 带每个候选的失败原因，直接可读）
 */
export function resolveTmpDir({ dataDir, env = process.env, platform = process.platform, probe = probeDir, sysTmp = null } = {}) {
  const cands = [];
  const explicit = (env.SSH_TMPDIR || '').trim();
  if (explicit) cands.push({ source: 'SSH_TMPDIR', dir: explicit });
  // ② 系统 TEMP：Node 的 os.tmpdir() 就是「当前环境变量指的那个」，也就是 Playwright 会用的那个
  //   （sysTmp 只为单测注入，正常调用永远是 os.tmpdir()）
  cands.push({ source: 'system', dir: sysTmp || os.tmpdir() });
  // ③ 数据目录（App 一定在那写 profile/evidence）
  if (dataDir) cands.push({ source: 'data-dir', dir: path.join(dataDir, '.tmp') });
  // ④ 平台兜底
  cands.push({ source: 'platform', dir: platformTmpFallback(platform, env) });

  const tried = [];
  const seen = new Set();
  for (const c of cands) {
    const key = String(c.dir || '').toLowerCase();
    if (!key || seen.has(key)) continue;   // 同一个目录不重复探
    seen.add(key);
    const r = probe(c.dir);
    tried.push({ source: c.source, dir: c.dir, ok: !!r.ok, error: r.error || null });
    if (r.ok) return { dir: c.dir, source: c.source, tried, degraded: c.source !== 'system' && c.source !== 'SSH_TMPDIR' };
  }
  const detail = tried.map((t) => `${t.source}=${t.dir || '(空)'}（${t.error || '不可用'}）`).join('；');
  throw new Error(`临时目录全部不可用，浏览器/下载类查询会直接失败。请检查 TEMP/TMP/TMPDIR：${detail}`);
}

/**
 * 把选中的目录写回 process.env（Node、Playwright 子进程都读这个）。
 * 降级时打一行日志（含实际用的目录 + 被跳过的候选原因）——审计 W-1 要求「所有降级路径都要留痕」。
 */
export function ensureTmpDir({ dataDir, env = process.env, platform = process.platform, probe = probeDir, sysTmp = null, log } = {}) {
  const picked = resolveTmpDir({ dataDir, env, platform, probe, sysTmp });
  for (const k of ['TEMP', 'TMP', 'TMPDIR']) env[k] = picked.dir;
  if (log && picked.degraded) {
    const skipped = picked.tried.filter((t) => !t.ok).map((t) => `${t.source}=${t.dir}（${t.error}）`).join('；');
    log(`[engine] 临时目录降级：系统 TEMP 不可用 → 改用 ${picked.dir}（来源 ${picked.source}）${skipped ? '；已跳过 ' + skipped : ''}`);
  }
  return picked;
}
