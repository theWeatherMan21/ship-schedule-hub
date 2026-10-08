// 从运行证据里学「船司自己认的港口写法」→ 别名（source='verified'，带船司作用域）。
// 自校验：抽出来的写法必须能被本地解析回同一个 LOCODE，否则丢弃（绝不污染词典）。
// 用法：node tools/learn_aliases_from_evidence.mjs [证据目录]
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { findPort } from '../engine/portdb.mjs';

const DIR = process.argv[2] || path.join(process.env.HOME, 'Library/Application Support/ShipScheduleHub/evidence');
const db = new DatabaseSync('db/ports.db');
const NORM = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

let learned = 0, seen = 0, dropped = 0;
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith('.ndjson')) : [];
for (const f of files) {
  const lines = fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').filter(Boolean);
  let io = null;
  for (const line of lines) {
    let j = null; try { j = JSON.parse(line); } catch { continue; }
    if (j.type === 'engine-started' || (j.type === 'summary' && j.origin)) io = { o: j.origin, d: j.destination };
    if (j.type !== 'carrier-status' || !j.msg || !io) continue;
    const msg = String(j.msg);
    // 只认「X → Y」这种填表成功/预填的句子；两边各取第一个 token
    const m = msg.match(/([A-Za-z][A-Za-z .'-]{1,40}?)\s*(?:→|->|到)\s*([A-Za-z][A-Za-z .'-]{1,40}?)(?:（|$|,|\.|\s{2})/);
    if (!m) continue;
    const pairs = [[io.o, m[1]], [io.d, m[2]]];
    for (const [input, filledRaw] of pairs) {
      seen++;
      const filled = NORM(String(filledRaw).split(/\s+(?:turkiye|turkey|china|india|vietnam|korea|japan|port|terminal)\b/i)[0] || filledRaw);
      if (!filled || filled.length < 3) { dropped++; continue; }
      const want = findPort(input, j.carrier);
      const got = findPort(filled, j.carrier);
      // 自校验：填法解析回同一个港才算学到
      if (!want || !got || want.locode !== got.locode) { dropped++; continue; }
      const exists = db.prepare('SELECT locode FROM aliases WHERE alias = ? AND carrier = ? LIMIT 1').get(filled, j.carrier);
      if (exists && exists.locode === want.locode) continue;
      db.prepare('INSERT OR REPLACE INTO aliases (alias, carrier, locode, source) VALUES (?,?,?,?)').run(filled, j.carrier, want.locode, 'verified');
      learned++;
      console.log(`  + ${j.carrier.padEnd(10)} 「${filled}」→ ${want.locode} ${want.name}`);
    }
  }
}
console.log(`\n从 ${files.length} 份证据里：候选 ${seen} · 学到 ${learned} · 丢弃 ${dropped}（自校验未通过）`);
