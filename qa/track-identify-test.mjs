// 单号识别器测试台：node qa/track-identify-test.mjs
//   · 默认：跑测试矩阵 + 校验 engine/tracking/prefixes.json 与模块同源（漂移守卫）
//   · --sync：按模块重建 engine/tracking/prefixes.json（改表后跑一次）
// 证据口径：真实执行、逐条断言，失败即退出码 1。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  identify, normalize, containerCheck, iso6346Check, exportTable, CARRIERS, PENDING,
} from '../engine/tracking/identify.mjs';
import { normalizeOneNumber } from '../engine/tracking/one.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TABLE_PATH = join(HERE, '..', 'engine', 'tracking', 'prefixes.json');
const SYNC = process.argv.includes('--sync');

let pass = 0; const fails = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; return true; }
  fails.push(`${name}${detail ? ' — ' + detail : ''}`); return false;
}
function expect(name, raw, want) {
  const r = identify(raw);
  const ok = Object.entries(want).every(([k, v]) => {
    if (k === 'candidatesInclude') return v.every((id) => r.candidates.some((c) => c.carrierId === id));
    if (k === 'candidatesFirst') return r.candidates[0] && r.candidates[0].carrierId === v;
    if (k === 'candidatesLen') return r.candidates.length === v;
    if (k === 'flags') return Object.keys(v).every((kk) => r.flags[kk] === v[kk]);
    return r[k] === v;
  });
  check(name, ok, ok ? '' : `got ${JSON.stringify({ ok: r.ok, carrierId: r.carrierId, docType: r.docType, confidence: r.confidence, matchedBy: r.matchedBy, flags: r.flags })}`);
  return r;
}

console.log('=== A. DoD 真单素材（爹地批次）===');
expect('Maersk 9 位纯数字 276759780 → 马士基(订舱形态)', '276759780', { ok: true, carrierId: 'maersk', matchedBy: 'booking-format', docType: 'booking' });
expect('COSU6469105960 → COSCO', 'COSU6469105960', { ok: true, carrierId: 'cosco', matchedBy: 'scac', docType: 'bl', confidence: 'high' });
expect('HLCU2B9E986E7C5E → Hapag', 'HLCU2B9E986E7C5E', { ok: true, carrierId: 'hapag', matchedBy: 'scac', docType: 'bl' });
expect('HDMUSHAF36562700 → HMM', 'HDMUSHAF36562700', { ok: true, carrierId: 'hmm', matchedBy: 'scac', docType: 'bl' });

console.log('=== B. 待归户素材（定不了就只给候选，不硬猜）===');
expect('M237055674 → 不确定，候选含 zim/msc（ZIM 订舱形态 + MSC 候选两说）', 'M237055674',
  { ok: false, docType: 'booking', candidatesInclude: ['zim', 'msc'], candidatesFirst: 'zim' });
// 181 系列 2026-10-12 已归户 MSC（181AS 缓存+live 双实证；见 msc.booking 规则）
expect('181AS0266823514M1（MSC 181 系列）→ MSC', '181AS0266823514M1', { ok: true, carrierId: 'msc', matchedBy: 'booking-format', docType: 'booking' });
expect('181AY12345（181 系列同族）→ MSC', '181AY12345', { ok: true, carrierId: 'msc', matchedBy: 'booking-format' });
expect('177FCACAS347328（MSC 177 系列，10-23 live 复核）→ MSC', '177FCACAS347328', { ok: true, carrierId: 'msc', matchedBy: 'booking-format', docType: 'booking' });
expect('177FCACAS347312（MSC 177 系列同族）→ MSC', '177FCACAS347312', { ok: true, carrierId: 'msc', matchedBy: 'booking-format' });
expect('CANF… → 疑货代分单(HBL)标记', 'CANF123456789', { ok: false, flags: { houseBlPossible: true, foreignPrefix: true, containerValid: null } });
expect('NGP… → 认不出', 'NGP12345678', { ok: false, matchedBy: 'none' });

console.log('=== C. 全表巡检：每个船的每个前缀都路由到自己 ===');
for (const c of CARRIERS) {
  for (const p of c.scac) {
    expect(`BL ${p} → ${c.id}`, p + 'X1234567890', { ok: true, carrierId: c.id, matchedBy: 'scac' });
  }
  for (const p of c.container) {
    // 造一个校验位合法的箱号（4 字母 + 6 数字 + 算出的校验位）
    const body = p + '123456';
    const cd = iso6346Check(body);
    expect(`箱 ${p}xxxxxx → ${c.id}`, body + cd, { ok: true, carrierId: c.id, matchedBy: 'container', docType: 'container' });
  }
}

console.log('=== D. 形态/边界 ===');
check('归一化：小写+空格+连字符', normalize(' msku 307703-8 ') === 'MSKU1432299', normalize(' msku 307703-8 '));
expect('带空格/连字符的箱号仍路由', 'MSKU 307703-8', { ok: true, carrierId: 'maersk', docType: 'container' });
check('ISO6346 已知样本 CSQU9208547 校验位=3', iso6346Check('CSQU9208547') === 3, String(iso6346Check('CSQU9208547')));
expect('箱号校验位错 → 不路由，仅提示', 'MSKU1312523', { ok: false, carrierId: null });
check('箱号校验位错时 flag 置 false', containerCheck('MSKU1312523').valid === false);
// 【修复 10-12】11 位形态 + 提单前缀(SCAC)：不得被箱号校验拦杀（爹地报「其他船司无法自动识别」）
expect('MEDU9453000（MSC 提单形态）→ 低置信放行', 'MEDU9453000', { ok: true, carrierId: 'msc', matchedBy: 'scac-loose', docType: 'bl', flags: { containerValid: false } });
expect('COSU2241230（COSCO 提单形态）→ 低置信放行', 'COSU2241230', { ok: true, carrierId: 'cosco', matchedBy: 'scac-loose' });
expect('ONEY1012502（ONE 提单形态）→ 低置信放行', 'ONEY1012502', { ok: true, carrierId: 'one', matchedBy: 'scac-loose' });
expect('对照：MSKU1312523（纯箱主码、非提单前缀）维持不路由', 'MSKU1312523', { ok: false, carrierId: null });
expect('已知箱主码(非提单前缀)但形态不完整 → 低置信线索(msc 首选)', 'MSDU12345', { ok: false, carrierId: null, matchedBy: 'container', candidatesFirst: 'msc' });
expect('ZIM 订舱形态 M0123456 → 低置信候选(zim 首选)', 'M0123456', { ok: false, carrierId: null, docType: 'booking', candidatesFirst: 'zim' });
expect('Hapag 8 位订舱号 → 低置信候选', '12345678', { docType: 'booking', candidatesFirst: 'hapag' });
expect('空输入 → 提示', '', { ok: false, docType: 'unknown' });

console.log('=== F. ONE 官网口径：ONEY 识别与自动剥离（10-12）===');
expect('PUS123456789（后 12 位 3+9 形态）→ ONE', 'PUS123456789', { ok: true, carrierId: 'one', matchedBy: 'booking-format' });
expect('PUSA12345678（后 12 位 4+8 形态）→ ONE', 'PUSA12345678', { ok: true, carrierId: 'one', matchedBy: 'booking-format' });
expect('ONEYNB3JJE454300（带 ONEY 完整号）→ ONE', 'ONEYNB3JJE454300', { ok: true, carrierId: 'one' });
check('ONEY 前缀自动剥离 → 官网格式', normalizeOneNumber('ONEYNB3JJE454300').value === 'NB3JJE454300', JSON.stringify(normalizeOneNumber('ONEYNB3JJE454300')));
check('官网格式输入（无 ONEY）原样保留', normalizeOneNumber('NB3JJE454300').value === 'NB3JJE454300');
check('ONE 箱号不被剥离', normalizeOneNumber('ONEU4227196').value === 'ONEU4227196');

console.log('=== G. 数字形态候选补充（10-12）===');
expect('5051645160（10 位数字）→ COSCO/OOCL 候选（不自动）', '5051645160', { ok: false, docType: 'booking', candidatesInclude: ['cosco', 'oocl'], candidatesFirst: 'cosco' });
expect('012345678900（12 位数字）→ Evergreen 候选（不自动）', '012345678900', { ok: false, docType: 'booking', candidatesFirst: 'evergreen' });

console.log('=== E. 路由表 JSON 同源守卫 ===');
const table = exportTable();
if (SYNC) {
  writeFileSync(TABLE_PATH, JSON.stringify(table, null, 1) + '\n');
  console.log(`  ↻ 已重建 ${TABLE_PATH}`);
} else if (!existsSync(TABLE_PATH)) {
  check('prefixes.json 存在', false, '缺失，跑 --sync 生成');
} else {
  const onDisk = JSON.parse(readFileSync(TABLE_PATH, 'utf8'));
  check('prefixes.json 与模块一致', JSON.stringify(onDisk) === JSON.stringify(table), '不一致 → 跑节点 --sync');
}

console.log('\n=== 汇总 ===');
console.log(`通过 ${pass}，失败 ${fails.length}`);
for (const f of fails) console.log('  ✗ ' + f);
if (fails.length === 0) {
  console.log('\n样例输出（M237055674）:');
  const r = identify('M237055674');
  console.log(JSON.stringify({ normalized: r.normalized, docType: r.docType, candidates: r.candidates.slice(0, 3), note: r.note }, null, 1));
  console.log(`\n待归户（需人工确认）: ${PENDING.map((p) => p.number).join(', ')}`);
}
process.exit(fails.length ? 1 : 0);
