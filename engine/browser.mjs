// 浏览器层：有头 Chrome + 真正「不打扰爸爸」的窗口静默
// 实测结论（qa/probe-window*.mjs）：
//   macOS 会把 --window-position 钳回屏幕内（请求 -2400/-10000 都变成 left=60,top=30）；
//   CDP Browser.setWindowBounds 最小化才真·不可见（windowState=minimized 生效）。
import { chromium } from './node_modules/playwright-core/index.mjs';
import { resolveChrome } from './chrome.mjs';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';

// Windows 绝对路径：真机实测 PATH 里连 System32 都没有（fltmc 报「不是内部或外部命令」），
// 所以这些系统命令一律绝对路径调用，绝不依赖 PATH（婉宜 10-08）。
const SYS32 = process.env.SystemRoot ? `${process.env.SystemRoot}\\System32` : 'C:\\Windows\\System32';
const PS_EXE = `${SYS32}\\WindowsPowerShell\\v1.0\\powershell.exe`;
const TASKKILL_EXE = `${SYS32}\\taskkill.exe`;
export { SYS32, PS_EXE, TASKKILL_EXE };

import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');   // 只读资源（db/、配方等）

// ---------- 运行期数据目录（婉宜 9-30 修「App 管理」弹窗）----------
// macOS 的 App Management 保护会拦截 App 修改任何 .app 包 —— 包括它自己。
// 以前 evidence / browser-profile 写在 /Applications/X.app/Contents/Resources/ 里，
// 每次查询写文件都触发 kTCCServiceSystemPolicyAppBundles 弹窗（系统日志实锤：
// com.apple.tcc.notification.kTCCServiceSystemPolicyAppBundles.com.ross.shipschedulehub）。
// 现在所有可写数据搬到用户目录（符合 macOS 规范，重装 App 也不丢 profile/缓存）。
export const DATA_DIR = process.env.SSH_DATA_DIR || (process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ShipScheduleHub')
  : path.join(os.homedir(), 'Library', 'Application Support', 'ShipScheduleHub'));
export const PROFILE_DIR = process.env.SSH_PROFILE_DIR || path.join(DATA_DIR, 'browser-profile');
export const EVIDENCE_DIR = path.join(DATA_DIR, 'evidence');

// 一次性迁移：包内旧目录 → 用户目录（保住已「养熟」的 Chrome profile，反爬依赖它）
for (const [name, target] of [['browser-profile', PROFILE_DIR], ['evidence', EVIDENCE_DIR]]) {
  const legacy = path.join(PROJECT_ROOT, name);
  try {
    if (!fs.existsSync(target) && fs.existsSync(legacy)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.renameSync(legacy, target);
      console.log(JSON.stringify({ type: 'data-migrated', from: legacy, to: target }));
    }
  } catch {
    try { fs.mkdirSync(target, { recursive: true }); } catch { /* 目标建不出也不拦主流程 */ }
  }
}
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

export function launchArgs() {
  return [
    '--window-position=-2400,-2400',
    '--window-size=1440,900',
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
  ];
}

/** 启动持久化 Chrome（项目自带 profile，绝不碰爸爸日常 Chrome）。headless 默认 false 是 MSC 能过的前提。 */
// ── 浏览器来源解析（同事机器没装 Chrome 也能跑）─────────────────────────
// 优先用系统 Chrome；没有则用 Playwright 自带 Chromium；再没有就按需下载一份
// Chrome for Testing 到数据目录（只下一次，无需管理员权限）。
// 只解析一次，进程内复用；失败也不抛 —— 交回 Playwright 按 channel:'chrome' 自己找。
let chromePick; // undefined = 未解析；null = 解析不到
async function pickChrome() {
  if (chromePick !== undefined) return chromePick;
  try {
    chromePick = await resolveChrome({
      log: (msg) => console.error('[chrome]', msg),
    });
    if (chromePick) console.error(`[chrome] 使用 ${chromePick.source}: ${chromePick.path}`);
    else console.error('[chrome] 未找到可用 Chrome，交由 Playwright 自行解析');
  } catch (e) {
    console.error('[chrome] 解析异常，交回 Playwright:', e?.message || e);
    chromePick = null;
  }
  return chromePick;
}

/** 组装启动参数：有具体可执行文件就用它，否则退回 channel:'chrome' */
async function chromeOpts(extra = {}) {
  const pick = await pickChrome();
  return pick ? { executablePath: pick.path, ...extra } : { channel: 'chrome', ...extra };
}

export async function launch({ headless = 'auto' } = {}) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  // headless 语义（2026-09-21 起）：
  //   'auto'  = 默认。无头新档（--headless=new + 真 UA），零窗口零打扰；Akamai 挡时由调用方手动传 false 重试
  //   true    = 同 'auto'
  //   false   = 有头 + CDP 最小化（Maersk 等需要真有头的站用）
  // 红线（2026-09-21 ross 两次反馈窗口打扰）：headless:false 仅在 SSH_ALLOW_HEADED=1 时生效，
  // 否则一律降级为无头新档 —— 保证无论调用方怎么写，屏幕上都不会出现窗口。
  const allowHeaded = process.env.SSH_ALLOW_HEADED === '1';
  const useHeadless = !(headless === false && allowHeaded);
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    ...(await chromeOpts()),
    headless: useHeadless,
    args: useHeadless
      ? [
          // 无头新档：真 Chrome 无头，指纹接近真机（MSC 新 profile 实测 3 连 200）
          '--headless=new',
          '--window-size=1440,900',
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-session-crashed-bubble',
          '--hide-crash-restore-bubble',
        ]
      : launchArgs(),
    ignoreDefaultArgs: ['--enable-automation', ...(useHeadless ? ['--headless=old'] : [])],
    viewport: useHeadless ? { width: 1440, height: 900 } : null,
    ...(useHeadless ? { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' } : {}),
  });
  try { ctx.setDefaultTimeout(15000); } catch { /* older core */ }
  return ctx;
}

async function cdpSession(ctx) {
  const page = ctx.pages()[0] || (await ctx.newPage());
  const s = await ctx.newCDPSession(page);
  const { windowId } = await s.send('Browser.getWindowForTarget');
  return { s, windowId };
}

export async function windowBounds(ctx) {
  try {
    const { s, windowId } = await cdpSession(ctx);
    const { bounds } = await s.send('Browser.getWindowBounds', { windowId });
    return { windowId, ...bounds };
  } catch (e) { return { error: String(e).slice(0, 120) }; }
}

/**
 * 静默窗口：mode = 'minimized'（默认，真不可见）| 'offscreen'（尽力移出屏幕）| 'onscreen'（给爸爸看）
 * 返回真实的窗口 bounds 作为证据。
 */
export async function quietWindow(ctx, mode = 'minimized') {
  try {
    const { s, windowId } = await cdpSession(ctx);
    if (mode === 'minimized') {
      await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
    } else if (mode === 'offscreen') {
      await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
      await s.send('Browser.setWindowBounds', { windowId, bounds: { left: -5000, top: -5000 } });
    } else {
      await s.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    }
    await new Promise((r) => setTimeout(r, 600));
    const { bounds } = await s.send('Browser.getWindowBounds', { windowId });
    return { windowId, requested: mode, ...bounds };
  } catch (e) { return { requested: mode, error: String(e).slice(0, 140) }; }
}

/**
 * 静默有头启动（2026-09-23，爹地思路验证通过）：
 *   有头真指纹 → 立即 CDP 最小化 → 串行下复用单页 → 窗口全程不可见，
 *   但 CF Managed Challenge / Akamai 会自动放行（它们只看指纹，不看窗口可见性）。
 * 安全兜底：最小化失败（windowState 仍 normal）就立刻关掉，降级无头 —— 屏幕绝不留下窗口。
 */
// 启动前清理：上次异常退出可能留下占用同一 profile 的 Chrome，
// 它会让 launchPersistentContext 直接失败（爹地 9-23 撞过：点了两次查询 → 第二次崩 + 弹空白页）。
// 只杀「命令行里带我们自己的 PROFILE_DIR」的进程 —— 绝不碰爹地日常 Chrome。
// 清理「占用本项目 profile」的残留 Chrome —— 绝不碰用户日常 Chrome。
// 跨平台：macOS/Linux 用 pgrep 按命令行匹配；Windows 用 PowerShell 查 Win32_Process（含命令行）+ taskkill。
function killStaleProfileChrome() {
  try {
    if (process.platform === 'win32') {
      const ps = `Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*${PROFILE_DIR.replace(/\\/g, '\\\\')}*' } | Select-Object -ExpandProperty ProcessId`;
      const out = execSync(`"${PS_EXE}" -NoProfile -NonInteractive -Command "${ps}"`, { encoding: 'utf8', timeout: 20000 }).trim();
      if (!out) return 0;
      const pids = out.split(/\s+/).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
      for (const pid of pids) { try { execSync(`"${TASKKILL_EXE}" /F /PID ${pid}`, { stdio: 'ignore', timeout: 10000 }); } catch { /* 已退出 */ } }
      if (pids.length) console.error(`[engine] 清理残留 profile 进程 ${pids.length} 个（windows）`);
      return pids.length;
    }
    const out = execSync(`pgrep -f ${JSON.stringify(PROFILE_DIR)} 2>/dev/null || true`, { encoding: 'utf8' }).trim();
    if (!out) return 0;
    const pids = out.split('\n').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0);
    for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch { /* 已退出 */ } }
    if (pids.length) console.error(`[engine] 清理残留 profile 进程 ${pids.length} 个`);
    return pids.length;
  } catch { return 0; }
}

export async function launchHeadedQuiet() {
  // 先清残留，再等一下让 profile 锁释放（否则立刻重试仍会失败）
  if (killStaleProfileChrome() > 0) await sleep(1500);
  let ctx = null;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      ...(await chromeOpts()),
      headless: false,
      args: launchArgs(),
      ignoreDefaultArgs: ['--enable-automation'],
    });
    try { ctx.setDefaultTimeout(15000); } catch { /* older core */ }
    const w = await quietWindow(ctx, 'minimized');
    if (w && w.windowState === 'minimized') return { ctx, mode: 'headed-minimized', window: w };
    // 最小化没生效 —— 立刻关掉，别让窗口留在屏幕上
    await ctx.close().catch(() => {});
    ctx = null;
  } catch { try { await ctx?.close(); } catch {} ctx = null; }
  const fallback = await launch({});
  return { ctx: fallback, mode: 'headless-fallback', window: null };
}

export async function openPage(ctx, url, opts = {}) {
  // reuse=true：串行模式下复用同一个标签页（不 newPage）。
  // 为什么重要：newPage() 会把最小化的窗口唤醒成 normal（实测 9-23），
  // 复用单页则全程保持 minimized —— 有头真指纹 + 屏幕不可见。
  let page = null;
  if (opts.reuse) {
    page = ctx.pages().find((p) => !p.isClosed()) || null;
  }
  let created = false;
  if (!page) { page = await ctx.newPage(); created = true; }
  // 新建标签页会把窗口唤醒 —— 立刻按回去
  if (created) { try { await quietWindow(ctx, 'minimized'); } catch {} }
  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // SPA 壳页（COSCO/ONE 等）domcontentloaded 时 body 还是空的：
    // 给 load 事件一点时间（最多 5s，不拖垮并发），避免下游把「没渲染完」判成「被拦截」。
    await Promise.race([
      page.waitForLoadState('load').catch(() => {}),
      sleep(5000),
    ]);
    return { page, status: resp ? resp.status() : 0 };
  } catch (e) {
    return { page, status: 0, error: String(e).split('\n')[0].slice(0, 160) };
  }
}

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 红线：不全速轰炸船司。批次间隔 2~4 秒随机。
export function jitterGap(min = 2000, max = 4000) {
  return sleep(min + Math.floor(Math.random() * (max - min)));
}

export async function shot(page, name) {
  try {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const p = path.join(EVIDENCE_DIR, `${name}.png`);
    await page.screenshot({ path: p, timeout: 20000 });
    return p;
  } catch (e) { return null; }
}
