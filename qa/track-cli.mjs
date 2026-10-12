// 提单追踪 CLI 试跑：node qa/track-cli.mjs <carrier> <单号>   （carrier 用 registry 动态装载，任何已接入的船司都能跑）
// 例：node qa/track-cli.mjs maersk 276759780 / node qa/track-cli.mjs hmm HDMUSHAF36562700 / node qa/track-cli.mjs cosco COSU6469105960
const [which, num] = process.argv.slice(2);
const { loadTracker, availableCarriers } = await import('../engine/tracking/registry.mjs');
if (!which || !num || !availableCarriers().includes(which)) { console.log(`用法: node qa/track-cli.mjs <${availableCarriers().join('|')}> <单号>`); process.exit(1); }
const r = await (await loadTracker(which))(num);
if (!r.ok) {
  console.log(`✗ ${r.blocked ? '站点拦截' : r.notFound ? '查无此单' : '失败'}：${r.error}`);
  if (r.raw) console.log(JSON.stringify(r.raw).slice(0, 400));
  process.exit(2);
}
console.log(`✓ ${String(r.carrier).toUpperCase()} ${r.docNum}`);
console.log(`  路由: ${r.origin}${r.departureOrigin ? ' (' + r.departureOrigin + ')' : ''}  →  ${r.destination}${r.arrivalDestination ? ' (' + r.arrivalDestination + ')' : ''}`);
if (r.lastUpdate) console.log(`  数据时间: ${r.lastUpdate}`);
console.log(`  当前状态: ${r.status}${r.current && r.current.city ? ' @ ' + r.current.city : r.current && r.current.location ? ' @ ' + r.current.location : ''}`);
if (r.events) {
  console.log(`  时间线（${r.events.length} 条，旧的在上）:`);
  for (const e of r.events) console.log(`    ${e.time || '?'} | ${String(e.location || '').padEnd(22)} | ${e.activity}${e.mode ? ' | ' + e.mode : ''}${e.isCurrent ? '  ◀ 最新' : ''}`);
}
if (r.schedule && r.schedule.length) {
  console.log('  船期段:');
  for (const row of r.schedule) console.log(`    ${row.label}: ` + Object.entries(row).filter(([k]) => k !== 'label').map(([k, v]) => `${k}=${v || '-'}`).join('  '));
}
for (const c of r.containers) {
  console.log(`  箱 ${c.num} (${c.typeSize || `${c.size || ''}' ${c.type || ''}`.trim()}) 状态=${c.status || c.blStatus || ''} 末次移动=${c.lastMovement || ''} ${(c.events || []).length ? '事件' + c.events.length + '条' : ''}`);
  for (const e of (c.events || []).slice(-4)) console.log(`    ${e.time || '?'} | ${e.activity} | ${e.city || e.location || ''}${e.vessel ? ' | ' + e.vessel + ' ' + (e.voyage || '') : ''}${e.isCurrent ? '  ◀ 最新' : ''}`);
}
