// 「真实 Chrome UA」单一来源（2026-10-14 审阅 P2「UA/指纹三处不一致」）
// ---------------------------------------------------------------------------
// 背景：fastpath.mjs / tracking/cosco.mjs / tracking/one.mjs 各自写死了一份
//   Chrome/140 的 UA，而浏览器（browser.mjs）用的是**按本机 Chrome 版本生成**的 UA
//   （9-23/10-12 实测本机已是 152+）。同一项目对同一家站发出的 UA 版本不一致，正是反爬
//   最容易抓的破绽；而 CF 的 cf_clearance 等凭证本身还绑定 UA，写死版本会在 Chrome 升级
//   后漂移导致凭证失效（2026-10-12 Hapag 有头过盾后无头复用失败即此因）。
//
// 现在全项目只从这里取：取不到本机 Chrome 版本时回退到 UA_FALLBACK 常量。
// 放在 lib/ 里而不是 browser.mjs，是为了让纯 HTTP 适配器（tracking/cosco、tracking/one）
// 也能统一 UA，又不必把 browser.mjs 的目录初始化副作用带进单元测试。
import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

// 10-15 Windows 审查 W-2：原实现硬编码 macOS 的 Chrome 路径——Windows 上每次调用
// 都跑一条必然失败的 macOS 命令（stderr 多一行裸中文，还进诊断面板），且回退 UA
// 也是 Macintosh 串。现按平台分支：命令路径、UA 模板、兜底 UA 三者同平台。
const IS_WIN = process.platform === 'win32';

export const UA_FALLBACK = IS_WIN
  ? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'
  : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

const uaWith = (ver) => (IS_WIN
  ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36`
  : `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${ver}.0.0.0 Safari/537.36`);

// ⚠️ Windows 红线（2026-10-15 实机事故）：chrome.exe 不是 console 程序——
//   `chrome.exe --version` 不会「打印版本」，而是**完整启动浏览器**：用户屏幕上
//   弹出「要恢复页面吗？/新标签页」窗口（每次查询都会触发）。Windows 侧一律走
//   下面的零副作用来源，绝不对 chrome.exe 执行任何命令。
function chromeExeWin() {
  const cands = [
    `${process.env.ProgramFiles || 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
  ].filter(Boolean);
  for (const exe of cands) {
    try { if (existsSync(exe)) return exe; } catch { /* 继续 */ }
  }
  return null;
}

// Windows 取 Chrome 主版本号——三个零副作用来源依次尝试：
//   ① 注册表 BLBeacon（Chrome 安装/更新后必写，最快）
//   ② exe 文件版本属性（读元数据，不执行文件）
//   ③ 安装目录的版本子目录名（目录名即完整版本）
// 全失败返回 null → 走兜底 UA。
function chromeVersionWin() {
  const exe = chromeExeWin();
  try {
    const out = execSync('reg query "HKCU\\Software\\Google\\Chrome\\BLBeacon" /v version', { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const m = /REG_SZ\s+(\d+)/.exec(out);
    if (m) return m[1];
  } catch { /* 继续 */ }
  if (exe) {
    try {
      const q = exe.replace(/'/g, "''");
      const out = execSync(`powershell -NoProfile -NonInteractive -Command "(Get-Item -LiteralPath '${q}').VersionInfo.ProductVersion"`, { encoding: 'utf8', timeout: 8000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
      const m = /(\d+)\./.exec(out);
      if (m) return m[1];
    } catch { /* 继续 */ }
    try {
      const vers = readdirSync(path.dirname(exe)).filter((n) => /^\d+\.\d+\.\d+\.\d+$/.test(n)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      if (vers[0]) return vers[0].split('.')[0];
    } catch { /* 继续 */ }
  }
  return null;
}

function chromeVersionCmd() {
  if (IS_WIN) return null; // Windows 不用命令探测（理由见 chromeVersionWin 顶部红线）
  return '"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version';
}

let _realUA = null;
export function realChromeUA() {
  if (_realUA) return _realUA;
  try {
    if (IS_WIN) {
      const major = chromeVersionWin();
      if (major) _realUA = uaWith(major);
    } else {
      const cmd = chromeVersionCmd();
      if (cmd) {
        // 命令是**硬编码/白名单路径 + --version**（macOS 固定安装路径，且 macOS 的
        // Google Chrome 支持该参数：只打印版本不弹窗），没有用户输入拼接 → 无注入面。
        const v = execSync(cmd, { encoding: 'utf8', timeout: 5000 });
        const m = /(\d+)\./.exec(v);
        if (m) _realUA = uaWith(m[1]);
      }
    }
  } catch { /* 取不到版本时用兜底（同平台串） */ }
  return _realUA || UA_FALLBACK;
}
