// 回车即查询 · 静态契约测试（10-26）
// 目的：无 UI 环境下验证「接线」正确 —— 事件绑定存在、绑定的 id 真实存在于模板、
// 中文输入法保护存在。真实行为仍需爹地实际按键验证。
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (label, cond) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};

console.log('① 绑定函数存在');
ok('bindEnterToQuery 已定义', /function bindEnterToQuery\s*\(/.test(src));
ok('监听 keydown', /addEventListener\('keydown'/.test(src));
ok('只响应 Enter', /e\.key !== 'Enter'/.test(src));
ok('阻止默认行为', /e\.preventDefault\(\)/.test(src));
ok('中文输入法保护（isComposing）', /e\.isComposing/.test(src));

console.log('② 船期页接线');
ok("绑定 origin/destination/date → btnGo", /bind\(\['origin',\s*'destination',\s*'date'\],\s*'btnGo'\)/.test(src));
for (const id of ['origin', 'destination', 'date']) {
  ok(`模板里有 #${id}`, new RegExp(`id="${id}"`).test(src));
}
ok('模板里有 #btnGo', /id="btnGo"/.test(src));

console.log('③ 提单页接线');
ok("绑定 trackNum/trackCarrier → btnTrackGo", /bind\(\['trackNum',\s*'trackCarrier'\],\s*'btnTrackGo'\)/.test(src));
ok('模板里有 #trackNum', /id="trackNum"/.test(src));
ok('模板里有 #trackCarrier', /id="trackCarrier"/.test(src));
ok('模板里有 #btnTrackGo', /id="btnTrackGo"/.test(src));

console.log('④ 目标按钮确实有查询逻辑（不是空按钮）');
ok('btnGo 绑定了 onclick 查询', /document\.getElementById\('btnGo'\)\.onclick/.test(src));
ok('btnTrackGo 绑定了 click 查询', /getElementById\('btnTrackGo'\)\?\.addEventListener\('click'/.test(src));

console.log('⑤ 防误触：绑定块在 DOM 已渲染之后（不在模板字符串里）');
const bindIdx = src.indexOf('function bindEnterToQuery');
const tplEnd = src.lastIndexOf('#app');
ok('绑定代码不在 #app 模板内', bindIdx > 0 && (tplEnd < 0 || bindIdx > tplEnd));

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
