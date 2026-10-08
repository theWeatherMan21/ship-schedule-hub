// 把「市场名/缩写/拼错别名」与「主干港信号」落库并导出前端数据。
// 数据源（都在 data/ 下，人工+自动生成，全部经过存在性核验）：
//   port-aka.json    alias → UN/LOCODE（市场名/旧名/常用缩写/常见拼错）+ prefer（同名港优先）
//   major-ports.json 公开吞吐量排名（Lloyd's List Top 100 / WSC，经维基百科整理）
// 信号源（≥2 个独立来源才叫「主干港」，爹地 10-08 要求：不能只看一家船司）：
//   ① major_ports 公开排名 ② MSC 名录（msc_ports 表，580 港，本地）③ 各船司已验证别名（aliases 表，10 家）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('db/ports.db');
const aka = JSON.parse(readFileSync('data/port-aka.json', 'utf8'));
const major = JSON.parse(readFileSync('data/major-ports.json', 'utf8'));

// 1) 别名入库（carrier='un' = 通用，船司专属别名仍优先）
db.exec("DELETE FROM aliases WHERE source = 'aka'");
const ins = db.prepare("INSERT OR REPLACE INTO aliases (alias, carrier, locode, source) VALUES (?, 'un', ?, 'aka')");
let n = 0;
for (const [alias, code] of Object.entries(aka.aka)) { ins.run(alias, code); n++; }

// 2) 信号表：主干港排名 / MSC 名录 / 船司别名数
db.exec(`CREATE TABLE IF NOT EXISTS port_signal (
  locode TEXT PRIMARY KEY, major_rank INTEGER, in_msc INTEGER DEFAULT 0, carrier_hits INTEGER DEFAULT 0
)`);
db.exec('DELETE FROM port_signal');
const msc = new Set(db.prepare('SELECT UPPER(LocationCode) c FROM msc_ports').all().map(r => r.c));
const hits = new Map();
for (const r of db.prepare("SELECT locode, COUNT(DISTINCT carrier) n FROM aliases WHERE carrier <> 'un' GROUP BY locode").all()) hits.set(r.locode, r.n);
const codes = new Set([...Object.values(major.rank), ...msc, ...hits.keys()]);
const insSig = db.prepare('INSERT OR REPLACE INTO port_signal (locode, major_rank, in_msc, carrier_hits) VALUES (?,?,?,?)');
for (const c of codes) insSig.run(c, major.rank[c] ?? null, msc.has(c) ? 1 : 0, hits.get(c) ?? 0);
console.log(`aliases: +${n} 条(aka) · port_signal: ${codes.size} 个港口（主干排名 ${Object.keys(major.rank).length} / MSC 名录 ${[...codes].filter(c=>msc.has(c)).length} / 有余家别名 ${hits.size}）`);

// 2.5) 同名港优先表（物流语境下的人工选择：portland→USPDX 而非 AUPTJ）
db.exec('CREATE TABLE IF NOT EXISTS port_prefer (name_norm TEXT PRIMARY KEY, locode TEXT)');
db.exec('DELETE FROM port_prefer');
const insPref = db.prepare('INSERT OR REPLACE INTO port_prefer (name_norm, locode) VALUES (?,?)');
let pn = 0;
for (const [name, code] of Object.entries(aka.prefer || {})) { insPref.run(String(name).toLowerCase().replace(/[^a-z0-9]/g, ''), code); pn++; }
console.log(`port_prefer: ${pn} 条同名港人工优先`);

// 3) 前端小文件（datalist 与提示用；避免把 17k 词典塞进别名逻辑）
mkdirSync('src', { recursive: true });
writeFileSync('src/port-aka.json', JSON.stringify({
  aka: aka.aka,
  prefer: aka.prefer,
  major: Object.fromEntries(Object.entries(major.rank).slice(0, 100)),
  msc: [...msc].slice(0, 2000),
  signal: Object.fromEntries(db.prepare('SELECT locode, major_rank, in_msc, carrier_hits FROM port_signal').all()
    .map((r) => [r.locode, [r.major_rank, r.in_msc, r.carrier_hits]])),
}, null, 0));
console.log('导出 src/port-aka.json:', (readFileSync('src/port-aka.json').length / 1024).toFixed(1) + ' KB');
