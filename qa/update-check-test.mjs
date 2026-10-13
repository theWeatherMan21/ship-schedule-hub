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

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
