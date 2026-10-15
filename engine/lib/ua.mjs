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
import { existsSync } from 'node:fs';

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

function chromeVersionCmd() {
  if (IS_WIN) {
    const cands = [
      `${process.env.ProgramFiles || 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
      process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : null,
    ].filter(Boolean);
    for (const exe of cands) {
      try { if (existsSync(exe)) return `"${exe}" --version`; } catch { /* 继续 */ }
    }
    return null;
  }
  return '"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version';
}

let _realUA = null;
export function realChromeUA() {
  if (_realUA) return _realUA;
  try {
    const cmd = chromeVersionCmd();
    if (cmd) {
      // 命令是**硬编码/白名单路径 + --version**（各平台固定安装路径），没有用户输入拼接
      // → 不存在 shell 注入面。
      const v = execSync(cmd, { encoding: 'utf8', timeout: 5000 });
      const m = /(\d+)\./.exec(v);
      if (m) _realUA = uaWith(m[1]);
    }
  } catch { /* 取不到版本时用兜底（同平台串） */ }
  return _realUA || UA_FALLBACK;
}
