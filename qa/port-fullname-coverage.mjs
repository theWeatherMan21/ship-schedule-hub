// 全名覆盖率自测（多船司）：拿各家目录里的「全名」当输入，看识别是否回到同一个港。
//   ① MSC 目录 580   ② Maersk 目录（13,130 个带 LOCODE）
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { findPort } from '../engine/portdb.mjs';
const db = new DatabaseSync('db/ports.db');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function run(label, rows) {
  let ok = 0; const miss = [], wrong = [];
  for (const r of rows) {
    const name = String(r.name || '').trim();
    if (!name || name.length < 3) continue;
    const h = findPort(name, r.carrier);
    if (!h) { miss.push(name); continue; }
    // 「回到同一个港」：船司码相等（若给了码）或归一化名字相等
    if ((r.code && h.locode === r.code) || norm(h.name) === norm(name)) ok++;
    else wrong.push(`${name} → ${h.name} (${h.locode})`);
  }
  const tot = rows.length;
  console.log(`${label}：${ok}/${tot} = ${(tot ? (ok / tot * 100).toFixed(1) : 0)}%`);
  if (miss.length) { console.log(`  未认出 ${miss.length} 条，样例：${miss.slice(0, 8).join(' | ')}`); }
  if (wrong.length) { console.log(`  认成别的港 ${wrong.length} 条，样例：${wrong.slice(0, 6).join(' | ')}`); }
  return { tot, ok };
}
const msc = db.prepare('SELECT LocationName name, LocationCode code FROM msc_ports').all().map((r) => ({ ...r, carrier: 'msc' }));
run('MSC 目录全名', msc);
if (existsSync('data/carrier-ports-maersk.json')) {
  const mk = JSON.parse(readFileSync('data/carrier-ports-maersk.json', 'utf8')).ports.filter((p) => p.locode).map((p) => ({ name: p.name, code: p.locode, carrier: 'maersk' }));
  run('Maersk 目录全名（带 LOCODE）', mk);
}
