// ONE 追踪 CLI 试跑：node qa/track-one-cli.mjs <单号>（BL/订舱号/箱号，可带 ONEY 前缀）
import { trackOne } from '../engine/tracking/one.mjs';
const num = process.argv[2];
if (!num) { console.log('用法: node qa/track-one-cli.mjs <BL/订舱号/箱号>'); process.exit(1); }
const r = await trackOne(num);
if (!r.ok) { console.log('✗ ' + r.error); if (r.raw) console.log(JSON.stringify(r.raw).slice(0, 500)); process.exit(2); }
console.log(`✓ ${r.carrier.toUpperCase()} ${r.docNum}  (查询类型 ${r.searchType})`);
console.log(`  路由: ${r.origin}  →  ${r.destination}`);
console.log(`  最近更新: ${r.lastUpdate}`);
console.log(`  当前状态: ${r.status}${r.current && r.current.city ? ' @ ' + r.current.city : ''}${r.vessel ? ' | ' + r.vessel : ''}`);
if (r.eta) console.log(`  ETA(预估): ${r.eta}`);
for (const c of r.containers) {
  console.log(`  箱 ${c.num} (${c.size}' ${c.type}) 状态=${c.status} 事件${c.events.length}条`);
  for (const e of c.events) {
    console.log(`    ${e.time || '?'} | ${e.trigger === 'ESTIMATED' ? '~' : ' '}${e.activity} | ${e.city}${e.terminal ? ' / ' + e.terminal : ''}${e.vessel ? ' | ' + e.vessel + ' ' + (e.voyage || '') : ''}${e.isCurrent ? '  ◀ 最新' : ''}`);
  }
}
