// 引擎冒烟：模块能不能加载 + --diagnose 能不能跑通。
// 教训（10-09 真机诊断）：query.mjs 的 --diagnose 段用了 fileURLToPath 却没 import，
// 一跑预检就 ReferenceError → App 起来永远"engine 未启动"、查询全废。
// 这类错只有"真的跑那一段"才能发现 —— 所以本测试必须执行 --diagnose，不能只做静态检查。
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
const E = path.resolve('engine');
let fail = 0;
// ① 各模块动态 import（能加载=无顶层错）
const mods = ['portdb.mjs', 'fastpath.mjs', 'browser.mjs', 'chrome.mjs', 'registry.mjs', 'lib/utils.mjs', 'lib/portsolve.mjs', 'lib/dom.mjs', 'lib/events.mjs', ...readdirSync(path.join(E, 'recipes')).map((f) => 'recipes/' + f)];
for (const m of mods) {
  const r = spawnSync('node', ['-e', `import('./engine/${m}').then(()=>process.exit(0)).catch(e=>{console.error(String(e).slice(0,200));process.exit(1)})`], { encoding: 'utf8', timeout: 60000 });
  if (r.status !== 0) { console.log(`  ✗ 加载失败 ${m}: ${(r.stderr || '').trim().slice(0, 160)}`); fail++; }
}
console.log(`模块加载：${mods.length - fail}/${mods.length}`);
// ② --diagnose 真跑一次（App 的开工预检走的就是这条路）
const d = spawnSync('node', ['engine/query.mjs', '--diagnose'], { encoding: 'utf8', timeout: 90000 });
const okDiag = d.status === 0 && /"type":"diagnose"/.test(d.stdout || '');
console.log(`${okDiag ? '✅' : '❌'} --diagnose 退出码=${d.status}${okDiag ? '' : '  stderr: ' + (d.stderr || '').trim().slice(0, 200)}`);
if (!okDiag) fail++;
process.exit(fail ? 1 : 0);
