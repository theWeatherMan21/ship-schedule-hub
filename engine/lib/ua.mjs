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

export const UA_FALLBACK = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

let _realUA = null;
export function realChromeUA() {
  if (_realUA) return _realUA;
  try {
    // 命令是**硬编码字面量**（本机 Chrome 的固定安装路径 + --version），没有任何用户输入拼接
    // → 不存在 shell 注入面（原 browser.mjs 里就是这么写的，此处原样搬过来）。
    const v = execSync('"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --version', { encoding: 'utf8', timeout: 5000 });
    const m = /(\d+)\./.exec(v);
    if (m) _realUA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${m[1]}.0.0.0 Safari/537.36`;
  } catch { /* 取不到版本时用兜底 */ }
  return _realUA || UA_FALLBACK;
}
