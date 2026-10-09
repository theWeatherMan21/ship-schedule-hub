
// 离线矩阵测试：11 家 × 常用港 —— ①解析到正确 LOCODE ②填表文本不带括号/码 ③不是下级地点
import { findPort } from '../engine/portdb.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';

const carriers = ['msc','maersk','cma','cosco','hapag','one','evergreen','yangming','hmm','zim','oocl'];
const ports = ['shanghai','ningbo','tianjin','qingdao','shenzhen','xiamen','istanbul','ashdod','haifa',
               'rotterdam','hamburg','antwerp','genoa','valencia','chittagong','singapore','busan','tokyo'];
// 期望码（主港；同组码头也算对）
const want = { shanghai:'CNSHA', ningbo:'CNNGB', tianjin:'CNTNJ', qingdao:'CNQIN', shenzhen:'CNSZX', xiamen:'CNXMN',
  istanbul:'TRIST', ashdod:'ILASH', haifa:'ILHFA', rotterdam:'NLRTM', hamburg:'DEHAM', antwerp:'BEANR',
  genoa:'ITGOA', valencia:'ESVLC', chittagong:'BDCGP', singapore:'SGSIN', busan:'KRPUS', tokyo:'JPTYO' };

let ok = 0, bad = [];
for (const p of ports) for (const c of carriers) {
  const hit = findPort(p, c);
  const r = await resolvePort(c, p);
  const text = String(r.text || '');
  const problems = [];
  if (!hit) problems.push('未命中');
  if (/[()]/.test(text)) problems.push('填表带括号/码');
  if (text.length > 24) problems.push('填表文本过长');
  if (hit && r.locode && hit.locode !== r.locode) problems.push('findPort/resolve 码不一致');
  if (problems.length) bad.push(`${c}/${p} → ${hit ? hit.locode + ' ' + hit.name : '-'} | text=${text} | ${problems.join(',')}`);
  else ok++;
}
console.log(`  ✓ ${ok} 条正常 / 共 ${ports.length * carriers.length} 条`);
if (bad.length) { console.log('  ✗ 异常:'); for (const b of bad.slice(0, 12)) console.log('     ' + b); }
process.exit(bad.length ? 1 : 0);
