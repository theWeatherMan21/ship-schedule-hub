// 评估用：把最近一次 MSC 查询的原始字段 / 已归一化字段全打出来
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DIR = path.join(os.homedir(), 'Library', 'Application Support', 'ShipScheduleHub', 'evidence');
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.ndjson'))
  .map((f) => ({ f, t: fs.statSync(path.join(DIR, f)).mtimeMs })).sort((a, b) => b.t - a.t);
if (!files.length) { console.log('没有证据文件'); process.exit(0); }

console.log('最近证据文件:', files.slice(0, 3).map((x) => x.f).join('\n  '));

for (const { f } of files.slice(0, 3)) {
  const lines = fs.readFileSync(path.join(DIR, f), 'utf8').split('\n');
  for (const line of lines) {
    let d; try { d = JSON.parse(line); } catch { continue; }
    if (d.type === 'carrier-status' && d.carrier === 'msc' && Array.isArray(d.schedules) && d.schedules.length) {
      console.log('\n═══ ' + f + ' 的 MSC 行（已归一化）═══');
      console.log(JSON.stringify(d.schedules[0], null, 2));
      console.log(`  共 ${d.schedules.length} 条；msg: ${String(d.msg).slice(0, 160)}`);
      process.exit(0);
    }
  }
}
console.log('最近 3 个证据里没有 MSC 结果');
