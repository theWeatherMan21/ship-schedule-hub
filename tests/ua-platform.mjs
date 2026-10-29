// 单测：Windows 审查 W-2 —— UA 必须跟运行平台一致（2026-10-15 真机事故的回归防线）
//
// 事故原样：Windows 版发出去的 UA 是 Macintosh 串（且每次调用都跑一条必然失败的 macOS 命令，
//   把裸中文错误行刷进诊断面板）。影响面是**几乎所有出网请求**（fastpath / 无头浏览器 / 追踪适配器），
//   CF 站点还把 cf_clearance 绑 UA —— 平台串不一致 = 随时掉线。
//
// 钉死四件事：
//   ① Windows 平台串必须含 `Windows NT 10.0; Win64; x64` 且**不含** Macintosh；macOS 反之
//   ② UA 里的 Chrome 版本号跟着探测结果走（不许写死漂移），取不到才用兜底版本
//   ③ realChromeUA() 必须缓存（成功/失败都缓存）—— 否则每次调用重跑 powershell（8s 超时）
//   ④ 全仓不许再有第二处硬编码 Macintosh UA（单一来源 = engine/lib/ua.mjs）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { uaFor, realChromeUA, UA_FALLBACK, DEFAULT_CHROME_MAJOR } from '../engine/lib/ua.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

console.log('\n== ① 平台串互斥（W-2 的核心断言） ==');
const win = uaFor('win32', '152');
const mac = uaFor('darwin', '152');
check('Windows 串含 Windows NT 10.0; Win64; x64', /Windows NT 10\.0; Win64; x64/.test(win), win);
check('Windows 串不含 Macintosh / Mac OS X', !/Macintosh|Mac OS X/.test(win));
check('macOS 串含 Macintosh; Intel Mac OS X', /Macintosh; Intel Mac OS X/.test(mac), mac);
check('macOS 串不含 Windows NT', !/Windows NT/.test(mac));
check('两者不相等', win !== mac);

console.log('\n== ② 版本号跟着探测结果，不写死 ==');
check('喂 152 → Chrome/152.0.0.0', /Chrome\/152\.0\.0\.0/.test(uaFor('win32', '152')));
check('喂 143 → Chrome/143.0.0.0（升级不漂移）', /Chrome\/143\.0\.0\.0/.test(uaFor('win32', '143')));
check('喂 "152.0.6723.58" 只取主版本', /Chrome\/152\.0\.0\.0/.test(uaFor('win32', '152.0.6723.58')));
check('喂 null/空 → 用兜底版本', /Chrome\/152\.0\.0\.0/.test(uaFor('win32', null)) && /Chrome\/152\.0\.0\.0/.test(uaFor('win32', '')));
check('兜底版本常量与实现一致', uaFor('win32', DEFAULT_CHROME_MAJOR) === win);

console.log('\n== ③ realChromeUA() 本机取值 + 缓存 ==');
const a = realChromeUA();
const b = realChromeUA();
check('本机串非空且形如 Mozilla/5.0 …', /^Mozilla\/5\.0 \(.+\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/.test(a), a);
check('本机串与本机平台一致（macOS 机器不许发 Windows 串）', process.platform === 'win32' ? /Windows NT/.test(a) : /Macintosh/.test(a));
check('两次调用结果一致（缓存生效）', a === b);
check('UA_FALLBACK 与本机平台一致', process.platform === 'win32' ? /Windows NT/.test(UA_FALLBACK) : /Macintosh/.test(UA_FALLBACK), UA_FALLBACK);

console.log('\n== ④ 全仓单一来源：不许别处硬编码 Macintosh UA ==');
{
  const offenders = [];
  const scan = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { scan(p); continue; }
      if (!/\.(mjs|js|ts|rs|html)$/.test(e.name)) continue;
      const rel = path.relative(ROOT, p);
      if (rel === path.join('engine', 'lib', 'ua.mjs')) continue;   // 唯一允许出现 UA 模板的地方
      const src = fs.readFileSync(p, 'utf8');
      // 只抓「Mozilla/5.0 (Macintosh…」这种完整的 UA 字面量，普通注释/文案不算
      if (/Mozilla\/5\.0 \(Macintosh/.test(src)) offenders.push(rel);
    }
  };
  scan(path.join(ROOT, 'engine'));
  scan(path.join(ROOT, 'src'));
  scan(path.join(ROOT, 'src-tauri', 'src'));
  check('engine/ src/ src-tauri/src 内无第二份 Macintosh UA 字面量', offenders.length === 0, offenders.join(', '));
}

console.log(`\n${fail === 0 ? '✓ 全部通过' : '✗ 有失败'}（${pass} 通过 / ${fail} 失败）`);
process.exit(fail === 0 ? 0 : 1);
