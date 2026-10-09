
import { resolvePort } from '../engine/lib/portsolve.mjs';
const cases = [
  ['tianjin', 'tianjin', '短前缀：不带括号/码'],
  ['ningbo', 'ningbo', '短前缀'],
  ['Shanghai', 'Shanghai', '保留用户大小写'],
  ['istanbul', 'istanbul', '短前缀'],
  ['chittagong', 'chittagong', '词典无也要能原样传'],
  ['rotterdam', 'rotterdam', '普通港（曾被解析成 overschie ✗）'],
  ['chittagong', 'chittagong', '词典外写法（曾被解析成 bhatiari ✗）'],
];
let pass = 0, fail = 0;
for (const [input, want, note] of cases) {
  const r = await resolvePort('maersk', input);
  const ok = String(r.text || '').toLowerCase() === want.toLowerCase() && !/[()]/.test(String(r.text || ''));
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + input.padEnd(12) + ' → ' + String(r.text).padEnd(14) + ' (' + note + ')');
  ok ? pass++ : fail++;
}
console.log('  ' + pass + ' 过 / ' + fail + ' 败');
process.exit(fail ? 1 : 0);
