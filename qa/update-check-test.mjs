// 更新检查 · 版本比较单测（src/lib/version.js）
import { isNewer, verParts } from '../src/lib/version.js';

let pass = 0, fail = 0;
const eq = (name, got, exp) => {
  const ok = JSON.stringify(got) === JSON.stringify(exp);
  ok ? pass++ : fail++;
  console.log(ok ? ' ✓' : ' ✗', name, ok ? '' : `got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`);
};

eq('verParts 去 v', verParts('v1.4.0'), [1, 4, 0]);
eq('1.4.0 > 1.3.9', isNewer('1.4.0', '1.3.9'), true);
eq('v1.4.0 > 1.3.0', isNewer('v1.4.0', '1.3.0'), true);
eq('2.0.0 > 1.99.99', isNewer('2.0.0', '1.99.99'), true);
eq('1.4.1 > 1.4', isNewer('1.4.1', '1.4'), true);
eq('相同版本 → false', isNewer('1.4.0', '1.4.0'), false);
eq('旧版本 → false', isNewer('1.3.0', '1.4.0'), false);
eq('1.4 不新于 1.4.0', isNewer('1.4', '1.4.0'), false);
eq('空值安全', isNewer('', '1.4.0'), false);


// ── 缓存陈旧（更新完还提示同一个版本）回归 ────────────────────
// 场景：1.4.2 时检查缓存了「有新版 1.4.8」；App 更新到 1.4.8 后
// 缓存命中路径必须用「当前实际版本」重判，否则会重复弹窗
{
  const cachedLatest = '1.4.8';        // 之前检查缓存下来的「有新版」版本
  eq('缓存陈旧：已更新到该版本 → 不该再提示', isNewer(cachedLatest, '1.4.8'), false);
  eq('缓存陈旧：仍未更新 → 应提示', isNewer(cachedLatest, '1.4.6'), true);
}

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
