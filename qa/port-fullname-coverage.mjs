// 全名覆盖率自测：拿船司名录里的「全名」当输入，看识别是否回到同一个港。
// 数据源：MSC 目录 580 港（本地，带它自己的码）+ 词典 17522 港全名抽样。
import { DatabaseSync } from 'node:sqlite';
import { findPort } from '../engine/portdb.mjs';
const db = new DatabaseSync('db/ports.db');
const rows = db.prepare("SELECT LocationName, LocationCode, CountryIsoCode FROM msc_ports").all();
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
let ok = 0, miss = [], wrong = [];
for (const r of rows) {
  const name = String(r.LocationName || '').trim();
  if (!name) continue;
  const h = findPort(name, 'msc');
  if (!h) { miss.push(name); continue; }
  // 「回到同一个港」判定：按码相等，或归一化名字相等（船司码与 UN/LOCODE 未必一致）
  if (h.locode === r.LocationCode || norm(h.name) === norm(name)) ok++;
  else wrong.push(`${name} → 认成了 ${h.name} (${h.locode})`);
}
const tot = rows.length;
console.log(`MSC 名录全名识别：${ok}/${tot} = ${(ok / tot * 100).toFixed(1)}%`);
if (miss.length) { console.log(`\n完全没认出来（${miss.length} 条，前 25）:`); miss.slice(0, 25).forEach((m) => console.log('  ✗ ' + m)); }
if (wrong.length) { console.log(`\n认成了别的港（${wrong.length} 条，前 12）:`); wrong.slice(0, 12).forEach((m) => console.log('  ⚠ ' + m)); }
