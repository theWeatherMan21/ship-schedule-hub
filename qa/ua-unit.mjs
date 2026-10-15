// ua-unit —— UA 统一来源（engine/lib/ua.mjs）基本行为 + 防弹窗回归
// 10-15 血训：Windows 上 `chrome.exe --version` 会完整启动浏览器（弹「恢复页面」窗口），
// 本测试静态断言「--version 命令只能出现在 macOS 分支」，防止该坑被重新引入。
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { realChromeUA, UA_FALLBACK } from '../engine/lib/ua.mjs';

// 1) 基本行为：返回格式合法的 UA，与平台匹配
const ua = realChromeUA();
assert.ok(/^Mozilla\/5\.0 /.test(ua), 'UA 应以 Mozilla/5.0 开头');
assert.ok(/Chrome\/\d+/.test(ua), 'UA 应含 Chrome/<版本>');
const isWin = process.platform === 'win32';
assert.ok(isWin ? ua.includes('Windows NT') : ua.includes('Macintosh'),
  'UA 平台模板应与运行平台一致');
assert.ok(ua.includes(`Chrome/${/Chrome\/(\d+)/.exec(ua)[1]}.0.0.0`), '版本段格式为 <major>.0.0.0');

// 2) 进程内缓存：二次调用恒等
assert.strictEqual(realChromeUA(), ua, 'realChromeUA 进程内缓存一致');
assert.ok(typeof UA_FALLBACK === 'string' && UA_FALLBACK.includes('Chrome/'),
  '兜底 UA 常量存在且含版本');

// 3) 防回归（关键）：源码中 `--version` 只允许出现在 macOS 分支（剥掉注释后统计）
const src = readFileSync(new URL('../engine/lib/ua.mjs', import.meta.url), 'utf8');
const verLines = src.split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))   // 剥掉行内/整行注释
  .filter((l) => l.includes('--version'));
assert.strictEqual(verLines.length, 1, `--version 只允许出现 1 处（现 ${verLines.length} 处）`);
assert.ok(verLines[0].includes('/Applications/'),
  '唯一一处 --version 必须是 macOS 的 Chrome 路径（Windows 上 chrome.exe --version 会弹窗！）');

console.log('✓ ua-unit：4 组断言全过（含「--version 仅限 macOS 分支」防回归）');
