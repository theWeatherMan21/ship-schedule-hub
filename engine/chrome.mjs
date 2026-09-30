// 浏览器可执行文件解析 —— 「同事电脑没装 Chrome 也能跑」的关键一层。
//
// 解析顺序（第一个可用者胜出）：
//   ① SSH_CHROME_PATH 显式指定
//   ② 系统已装的 Google Chrome（各平台常见安装位置）
//   ③ Playwright 自带的 Chromium（若安装过）
//   ④ 受管 Chrome for Testing（首次按需下载到 DATA_DIR/chrome，无管理员权限）
//
// 返回 { path, source } 或 null；null = 交回 Playwright 用 channel:'chrome' 自己找。
// 全程静默失败：任何一步出错都不抛，只是继续往下试。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const LAZY = () => import('./browser.mjs').then((m) => m.DATA_DIR); // 避免与 browser.mjs 循环依赖

const isWin = process.platform === 'win32';
const isMac = process.platform === 'darwin';

/** 各平台「系统 Chrome」的常见安装位置 */
function systemChromeCandidates() {
  if (isWin) {
    const out = [];
    for (const key of ['PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA']) {
      const b = process.env[key];
      if (b) out.push(path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }
    return out;
  }
  if (isMac) {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    ];
  }
  return ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
}

/** Chrome for Testing：平台标识 + 解包后可执行文件相对路径 */
function cftPlatform() {
  if (isWin) return { key: 'win64', exe: path.join('chrome-win64', 'chrome.exe') };
  if (isMac) {
    const arch = process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
    return { key: arch, exe: path.join(`chrome-${arch}`, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing') };
  }
  return { key: 'linux64', exe: path.join('chrome-linux64', 'chrome') };
}

function managedDir(dataDir) {
  return process.env.SSH_CHROME_DIR || path.join(dataDir, 'chrome');
}

/** 读缓存（下载过一次就不再找） */
function readManaged(dataDir) {
  const meta = path.join(managedDir(dataDir), 'current.json');
  try {
    const j = JSON.parse(fs.readFileSync(meta, 'utf8'));
    if (j.path && fs.existsSync(j.path)) return j;
  } catch { /* 没有缓存 */ }
  return null;
}

function playwrightChromium() {
  try {
    // playwright-core 的注册表在 macOS/Linux 有固定目录；找不到就跳过
    const base = isWin
      ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
      : path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
    if (!fs.existsSync(base)) return null;
    const dirs = fs.readdirSync(base).filter((d) => d.startsWith('chromium'));
    dirs.sort().reverse();
    for (const d of dirs) {
      const p = isWin
        ? path.join(base, d, 'chrome-win', 'chrome.exe')
        : isMac
          ? path.join(base, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium')
          : path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  } catch { /* 忽略 */ }
  return null;
}

/** 用平台原生工具下载（PowerShell / curl）：比 node fetch 更能吃到系统代理与证书 */
function download(url, destFile) {
  try {
    if (isWin) {
      execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
        `$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '${url}' -OutFile '${destFile}' -UseBasicParsing`],
        { stdio: 'ignore', timeout: 20 * 60 * 1000 });
    } else {
      execFileSync('curl', ['-fsSL', '--retry', '2', '-o', destFile, url], { stdio: 'ignore', timeout: 20 * 60 * 1000 });
    }
    return fs.existsSync(destFile) && fs.statSync(destFile).size > 1000;
  } catch (e) {
    console.error('[chrome] 下载失败:', e?.message || e);
    return false;
  }
}

function extract(zipFile, intoDir) {
  try {
    if (isWin) {
      execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -Force -Path '${zipFile}' -DestinationPath '${intoDir}'`],
        { stdio: 'ignore', timeout: 10 * 60 * 1000 });
    } else {
      execFileSync('unzip', ['-q', '-o', zipFile, '-d', intoDir], { stdio: 'ignore', timeout: 10 * 60 * 1000 });
    }
    return true;
  } catch (e) {
    console.error('[chrome] 解包失败:', e?.message || e);
    return false;
  }
}

/**
 * 按需下载「Chrome for Testing」到数据目录（独立副本，不碰用户已装 Chrome，不需要管理员权限）。
 * 只下载一次；之后由 current.json 直接命中。
 */
export async function ensureManagedChrome(dataDir, log = () => {}) {
  const dir = managedDir(dataDir);
  const cached = readManaged(dataDir);
  if (cached) return cached;

  const { key, exe } = cftPlatform();
  const metaUrl = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json';
  let url = null;
  let version = '';
  try {
    const r = await fetch(metaUrl, { signal: AbortSignal.timeout(30000) });
    const j = await r.json();
    const stable = j?.channels?.Stable;
    version = stable?.version || '';
    url = (stable?.downloads?.chrome || []).find((d) => d.platform === key)?.url || null;
  } catch (e) {
    console.error('[chrome] 取版本清单失败:', e?.message || e);
    return null;
  }
  if (!url) {
    console.error('[chrome] 清单里没有本平台包:', key);
    return null;
  }

  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, `cft-${version}-${key}.zip`);
  log(`首次运行：正在准备浏览器（Chrome for Testing ${version}，约 150MB，只下一次）…`);
  console.error(`[chrome] 下载 Chrome for Testing ${version} (${key}) → ${zip}`);
  if (!download(url, zip)) return null;
  if (!extract(zip, dir)) return null;
  try { fs.rmSync(zip, { force: true }); } catch { /* 留着也无害 */ }

  const exePath = path.join(dir, exe);
  if (!fs.existsSync(exePath)) {
    console.error('[chrome] 解包后找不到可执行文件:', exePath);
    return null;
  }
  try {
    fs.chmodSync(exePath, 0o755);
  } catch { /* Windows 不适用 */ }
  const rec = { path: exePath, version, source: 'chrome-for-testing', dir };
  try { fs.writeFileSync(path.join(dir, 'current.json'), JSON.stringify(rec, null, 2)); } catch { /* 忽略 */ }
  console.error('[chrome] 就绪:', exePath);
  log('浏览器就绪 ✓');
  return rec;
}

/**
 * 解析要用的 Chrome。
 * @param {{ allowDownload?: boolean, log?: Function }} opts
 * @returns {Promise<{path:string, source:string}|null>}
 */
export async function resolveChrome({ allowDownload = true, log = () => {} } = {}) {
  // ① 显式指定
  if (process.env.SSH_CHROME_PATH && fs.existsSync(process.env.SSH_CHROME_PATH)) {
    return { path: process.env.SSH_CHROME_PATH, source: 'env' };
  }
  // SSH_SKIP_SYSTEM_CHROME=1 用来模拟「同事机器没装 Chrome」（验收测试用）
  const skipSystem = process.env.SSH_SKIP_SYSTEM_CHROME === '1';
  // ② 系统 Chrome
  if (!skipSystem) {
    for (const p of systemChromeCandidates()) {
      if (p && fs.existsSync(p)) return { path: p, source: 'system' };
    }
    // ③ Playwright 自带 Chromium
    const pw = playwrightChromium();
    if (pw) return { path: pw, source: 'playwright' };
  }
  // ④ 受管 Chrome for Testing（按需下载）
  const dataDir = process.env.SSH_DATA_DIR || (await LAZY());
  const cached = readManaged(dataDir);
  if (cached) return { path: cached.path, source: 'chrome-for-testing' };
  if (!allowDownload) return null;
  const dl = await ensureManagedChrome(dataDir, log);
  return dl ? { path: dl.path, source: dl.source } : null;
}
