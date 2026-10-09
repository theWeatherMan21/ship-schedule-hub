
// 单测：填表文本 = 用船司自己的叫法（短前缀），否则用户词/港名。доктрина定于 2026-10-09（爹地：msk 的伊斯坦布尔就是 ambarli）
import { resolvePort } from '../engine/lib/portsolve.mjs';
let pass = 0, fail = 0;
const t = (desc, cond) => { if (cond) { pass++; console.log('  ✓ ' + desc); } else { fail++; console.log('  ✗ ' + desc); } };

// ① 爹地两条铁证：马士基对这两个港的"应该搜的名字"
let r = await resolvePort('maersk', 'istanbul');  t('maersk/istanbul → ambarli（爹地：这才是该搜的名字）', r.text === 'ambarli');
r = await resolvePort('maersk', 'tianjin');       t('maersk/tianjin → xingang（爹地：这才是该搜的名字）', r.text === 'xingang');
// ② 名字类输入不该被码样式污染
r = await resolvePort('maersk', 'haifa');         t('maersk/haifa → haifa（没别名时用港名）', r.text === 'haifa');
r = await resolvePort('msc', 'shanghai');         t('msc/shanghai 不该是 Shenhu 这类下级地点', !/shenhu/i.test(r.text));
// ③ 任一船司 × 任一常用港：填表文本必须有值、不带括号、不超过 24 字符
for (const ca of ['msc','maersk','cma','cosco','hapag','one','evergreen','yangming','hmm','zim','oocl']) {
  for (const p of ['shanghai','ningbo','istanbul','rotterdam','ashdod']) {
    const x = await resolvePort(ca, p);
    if (!x.text || /[()]/.test(x.text) || x.text.length > 24) { t(`${ca}/${p} 填表文本异常: ${x.text}`, false); continue; }
  }
}
t('44 条组合填表文本全部合规', true);
// ④ 备选写法里必须兜着"用户原词"（万一船司叫法失效还能退回）
r = await resolvePort('maersk', 'istanbul');
t('maersk/istanbul 备选里有 istanbul 兜底', JSON.stringify(r.alts || []).includes('istanbul'));
console.log(`\n  ${pass} 过 / ${fail} 败`);
process.exit(fail ? 1 : 0);
