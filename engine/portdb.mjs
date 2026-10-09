// 港口词典：ports = UN/LOCODE 权威（17,522 港）；aliases = 船司实测别名 + 市场名/缩写（carrier='un'）
// 解析顺序（爹地 10-08 定：只看英文名，要能正确识别 + 对上各船司名录）：
//   ① 归一化（大小写/空格/连字符/点号都无所谓：Port-of-Spain = port of spain = portofspain）
//   ② 别名精确命中（船司专属优先 → 通用）—— 覆盖市场名/旧名/常用缩写/常见拼错
//   ③ 词典名字精确 → 前缀 → 包含（包含要求 ≥5 字符，防 "true"→"sTruer" 那类事故）
//   ④ 多候选时排序：人工同名优先表 > 公开吞吐量排名 > MSC 名录 > 多家船司别名命中数 > 名字完全相等
//      —— 「主干港优先」必须多源交叉（不能只看一家船司，爹地 10-08 纠正）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, '..', 'db', 'ports.db'));

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const normSp = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const sigOf = (locode) => db.prepare('SELECT * FROM port_signal WHERE locode = ?').get(locode)
  || { locode, major_rank: null, in_msc: 0, carrier_hits: 0 };

// 候选打分（越大越优先）
function score(p, wn) {
  const s = sigOf(p.locode);
  let v = 0;
  if (norm(p.name_ascii) === wn) v += 500;                 // 归一化后与输入完全相等
  if (s.major_rank) v += 300 - Math.min(280, Number(s.major_rank));  // 公开排名越靠前越高
  if (s.in_msc) v += 120;                                  // 船司①：MSC 名录里有
  v += Math.min(120, Number(s.carrier_hits || 0) * 40);    // 船司②：有几家船司的已验证别名命中
  v -= (p.name_ascii || '').length > 24 ? 5 : 0;           // 名字特别长的（"xxx Terminal"）稍降权
  return v;
}

// 全库反查：该船司（或通用）的别名文本里**含某个词**的那些别名（用于"伊斯坦布尔→ambarli"这类跨条目映射）
export function aliasRowsContaining(word, carrierId) {
  const like = `%${String(word || '').toLowerCase()}%`;
  try {
    return db.prepare("SELECT alias FROM aliases WHERE LOWER(alias) LIKE ? AND carrier = ?")
      .all(like, carrierId).map((r) => r.alias);
  } catch { return []; }
}

export function findPort(word, carrierId) {
  // 加固（9-30）：空串/过短/非字符串一律拒绝 —— 垃圾输入必须走 unknown 兜底，绝不随机命中一个港口。
  if (typeof word !== 'string' && typeof word !== 'number') return null;
  const raw = String(word).trim();
  const w = raw.toLowerCase();
  if (w.length < 3) return null;
  const wn = norm(w);

  // ② 别名（船司专属 → 通用 'un'）—— 先按原样（老别名含空格），再按归一化
  const pick1 = (sql, ...args) => db.prepare(sql).get(...args)?.locode || null;
  let aliasCode = null;
  for (const a of [w, normSp(w), wn]) {
    if (aliasCode) break;
    if (carrierId) aliasCode = pick1('SELECT locode FROM aliases WHERE alias = ? AND carrier = ? LIMIT 1', a, carrierId)
      || pick1("SELECT locode FROM aliases WHERE alias = ? AND carrier = 'un' LIMIT 1", a);
    if (!aliasCode) aliasCode = pick1('SELECT locode FROM aliases WHERE alias = ? LIMIT 1', a);
  }
  // 同名港人工优先表（portland→USPDX、alexandria→EGALY …）
  const prefCode = pick1('SELECT locode FROM port_prefer WHERE name_norm = ? LIMIT 1', wn);

  const first = (sql, ...args) => db.prepare(sql).get(...args) || null;
  let port = aliasCode ? first('SELECT * FROM ports WHERE locode = ?', aliasCode) : null;

  if (!port) {
    // ③ 词典（精确 → 前缀 → 包含≥5）
    const cands = [];
    for (const r of db.prepare('SELECT * FROM ports WHERE LOWER(name_ascii) = ? OR LOWER(name) = ?').all(w, w)) cands.push(r);
    if (!cands.length) {
      // 前缀匹配 + **词边界**约束：名字必须在词边界处接着输入（"Ningbo" → "Ningbo Pt" ✓，
      // 但 "Aal" ✗ "Aalborg"、"Aach" ✗ "Aachen"）—— 防短输入静默认到不相干的地方（10-08 实测）
      const pre = db.prepare("SELECT * FROM ports WHERE LOWER(name_ascii) LIKE ? ESCAPE '\\'").all(`${w.replace(/[%_]/g, '\\$&')}%`);
      for (const r of pre) {
        const rest = String(r.name_ascii || '').slice(w.length);
        if (rest === '' || /^[\s,.\-–—/()'’]/.test(rest)) cands.push(r);
      }
    }
    if (!cands.length && w.length >= 5) {
      // 包含匹配同样要求**词边界**：输入必须在港名里作为完整词出现
      // （"Ningbo" ⊂ "Ningbo Pt" ✓；"Adams" ⊄ "Adamston" ✗、"Acala" ⊄ "Nacala" ✗）
      const inc = db.prepare("SELECT * FROM ports WHERE LOWER(name_ascii) LIKE ? ESCAPE '\\'").all(`%${w.replace(/[%_]/g, '\\$&')}%`);
      for (const r of inc) {
        const re = new RegExp(`(^|[\\s,.\\-–—/()'’])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[\\s,.\\-–—/()'’])`, 'i');
        if (re.test(String(r.name_ascii || ''))) cands.push(r);
      }
    }
    if (!cands.length) {
      // 后缀容错：船司全名常带地区/类型后缀（PORTLAND, OR / UMM QASR PT / WILMINGTON, NC）
      const stripped = w.replace(/,\s*[a-z]{2,3}$/i, '').replace(/\s+(pt|port|harbour|harbor|terminal)$/i, '').trim();
      if (stripped && stripped !== w && stripped.length >= 3) {
        const sp = db.prepare('SELECT * FROM ports WHERE LOWER(name_ascii) = ? OR LOWER(name) = ?').all(stripped, stripped);
        cands.push(...sp);
        for (const r of db.prepare('SELECT * FROM ports WHERE LOWER(name_ascii) LIKE ?').all(`${stripped}%`)) {
          const rest = String(r.name_ascii || '').slice(stripped.length);
          if (rest === '' || /^[\s,.\-–—/()'’]/.test(rest)) cands.push(r);
        }
      }
    }
    if (!cands.length) {
      // 归一化兜底（连字符/空格/点号/大小写一律忽略）：
      //   先求「归一化后完全相等」（Port-of-Spain ↔ portofspain、St. John's ↔ stjohns），
      //   再退「归一化前缀」（Ningbo-Zhoushan → ningbo*）；只在前面都没命中时才全表扫。
      for (const r of db.prepare('SELECT * FROM ports').all()) {
        if (norm(r.name_ascii) === wn) cands.push(r);
      }
      if (!cands.length && wn.length >= 5) {
        for (const r of db.prepare('SELECT * FROM ports').all()) {
          const na = norm(r.name_ascii);
          if (!na.startsWith(wn)) continue;
          const rawRest = String(r.name_ascii || '').slice(String(r.name_ascii || '').toLowerCase().replace(/[^a-z0-9]/g, '').length - na.length + wn.length);
          if (rawRest === '' || /^[\s,.\-–—/()'’]/.test(rawRest)) cands.push(r);
        }
      }
    }
    if (!cands.length) return null;
    // ④ 排序（人工优先表 > 多源信号）
    cands.sort((a, b) => {
      const pa = prefCode && a.locode === prefCode ? 1 : 0, pb = prefCode && b.locode === prefCode ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return score(b, wn) - score(a, wn);
    });
    port = cands[0];
  }
  const locode = aliasCode || port.locode;
  const carrierAliases = db.prepare('SELECT carrier, alias FROM aliases WHERE locode = ?').all(locode);
  return { locode, name: port.name_ascii, country: port.country, carrierAliases };
}

// 同城/同组港：名字首词相同（Tianjin / Tianjin Pt / Tianjin Xingang Pt / Tianjinbaoshuiqu）。
// 爹地 10-09 点透的根因：**各家船司对同一座城市用的港口名不一样**（天津有的船司只认 "Tianjin Xingang"），
// 我们只填一个名字 → 那些船司下拉里没有 → "候选未出"。所以填表要能试同组名字、并接受同组港口码。
export function siblingPorts(resolved, limit = 4) {
  try {
    const name = String(resolved?.name || '');
    const locode = resolved?.locode;
    if (!name || !locode) return [];
    const first = name.split(/[\s,–-]/)[0];
    if (first.length < 4) return [];
    // 排序（重要）：优先「船司名录里有的 / 主干港」——天津组里 "Tianjin Xingang Pt" 才是集装箱码头，
    // 而它在字典顺序里排第三，早先按 LIMIT 2 取会被截掉（10-09 实测：长荣/赫伯罗特因此候选未出）。
    return db.prepare(`SELECT p.locode, p.name_ascii AS name,
        COALESCE(s.in_msc,0) AS in_msc, COALESCE(s.carrier_hits,0) AS hits, COALESCE(s.major_rank,999) AS rank
      FROM ports p LEFT JOIN port_signal s ON s.locode = p.locode
      WHERE LOWER(p.name_ascii) LIKE ? AND p.locode <> ?
      ORDER BY in_msc DESC, hits DESC, rank ASC, LENGTH(p.name_ascii) ASC
      LIMIT ?`).all(first.toLowerCase() + '%', locode, limit);
  } catch { return []; }
}

// 供诊断/测试：看某个词会命中哪些候选以及打分
export function explainPort(word) {
  const w = String(word || '').toLowerCase().trim();
  if (!w) return [];
  const wn = norm(w);
  const cands = [];
  for (const r of db.prepare('SELECT * FROM ports WHERE LOWER(name_ascii) = ? OR LOWER(name) = ?').all(w, w)) cands.push(r);
  if (!cands.length) cands.push(...db.prepare("SELECT * FROM ports WHERE LOWER(name_ascii) LIKE ?").all(`${w}%`));
  if (!cands.length && w.length >= 5) cands.push(...db.prepare("SELECT * FROM ports WHERE LOWER(name_ascii) LIKE ?").all(`%${w}%`));
  if (!cands.length) for (const r of db.prepare('SELECT * FROM ports').all()) if (norm(r.name_ascii) === wn) cands.push(r);
  return cands.slice(0, 8).map((p) => ({ locode: p.locode, name: p.name_ascii, country: p.country, score: score(p, wn), sig: sigOf(p.locode) }));
}
