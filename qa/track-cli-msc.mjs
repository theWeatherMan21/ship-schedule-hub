// MSC 提单追踪 CLI 试跑（可一次多个号，共用一个浏览器）
// 用法：SSH_PROFILE_DIR=/tmp/x-$$ bash qa/quiet-probe.sh qa/track-cli-msc.mjs <号1> [号2 ...]
import { launch } from '../engine/browser.mjs';
import { trackMsc } from '../engine/tracking/msc.mjs';

const nums = process.argv.slice(2);
if (!nums.length) { console.log('用法: node qa/track-cli-msc.mjs <单号> [更多单号...]'); process.exit(1); }

const ctx = await launch({ headless: true });
let bad = 0;
for (const n of nums) {
  const t0 = Date.now();
  const r = await trackMsc(n, { ctx });
  const ms = Date.now() - t0;
  if (!r.ok) {
    console.log(`✗ ${n}  [${r.errorKind}] ${r.error}   (${ms}ms, nav=${r.nav || '-'})`);
    bad++;
    continue;
  }
  console.log(`✓ MSC ${r.trackingType || '?'} ${r.docNum}  (mode=${r.mode}, nav=${r.nav}, ${ms}ms)`);
  console.log(`  路由: ${r.origin}  →  ${r.destination}${r.transshipments && r.transshipments.length ? '  经 ' + r.transshipments.join(' / ') : ''}`);
  console.log(`  状态: ${r.siteStatus || r.status}   最近已发生: ${r.current ? r.current.time + ' | ' + r.current.activity + ' | ' + r.current.city : '—'}`);
  if (r.lastEvent) console.log(`  最新一条事件: ${r.lastEvent.time} | ${r.lastEvent.activity} [${r.lastEvent.timeType}]`);
  console.log(`  ETA: ${r.eta || '—'}   Delivered: ${r.delivered}`);
  for (const c of r.containers) {
    console.log(`  箱 ${c.num} (${c.size}) B/L=${c.bolNumber} 事件${c.events.length}条 交付=${c.delivered} 最新位置=${c.latestMove}`);
    for (const e of c.events) {
      console.log(`    ${e.time || '?'} [${e.timeType}] | ${e.activity} | ${e.city}${e.terminal ? ' @ ' + e.terminal : ''}${e.vessel ? ' | ' + e.vessel + ' ' + (e.voyage || '') : ''}${e.isCurrent ? '  ◀ 最新' : ''}`);
    }
  }
}
await ctx.close().catch(() => {});
process.exit(bad ? 2 : 0);
