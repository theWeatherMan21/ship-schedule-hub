// 港口词典：ports = UN/LOCODE 权威（17,520 港）；aliases = 船司实测映射
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(path.join(__dirname, '..', 'db', 'ports.db'));

// 语义（9-29 澄清）：aliases.locode = 【船司自己用的码头码】（可能是 CNSHA、TRHYY 这种
// 不在 UN/LOCODE 表里的值）；ports 表才是权威地名来源。所以别名命中后，名字/国家用
// ports 表兜底解析（先按码精确查，查不到就按港名模糊查），码本身照船司的用。
//
// 9-30 修正：alias 查询必须【按船司】。同一城市不同船司的码可以不同（上海 = CNSHA 给 10 家，
// ZIM 却是 CNSNH），旧的 `WHERE alias=? LIMIT 1` 会把「任意一家」的码当成所有人的码 ——
// 谁先被查到就用谁，HMM 能否点中【候选 [CNSHA]】纯属撞运气。现按 carrier 优先（其次 'un' 通用）。
export function findPort(word, carrierId) {
  // 9-30 加固：空串/过短/非字符串一律拒绝。
  //   事故：destination=true（CLI 参数被 shell 传成布尔）→ LIKE '%%' 命中全表第一行 →
  //   变成 "Struer (DKSTR)"（"sTRUE r"！）；空串同理命中 "Abu al Bukhoosh"。
  //   垃圾输入必须立刻返回 null（走 unknown 兜底），绝不静默查一个随机港口。
  if (typeof word !== 'string' && typeof word !== 'number') return null;
  const w = String(word).toLowerCase().trim();
  if (w.length < 3) return null; // 前端 matchPort 早就要求 ≥3 字符，后端此前漏了
  const first = (sql, ...args) => db.prepare(sql).get(...args)?.locode || null;
  let aliasCode = null;
  if (carrierId) {
    aliasCode = first('SELECT locode FROM aliases WHERE alias = ? AND carrier = ? LIMIT 1', w, carrierId)
      || first("SELECT locode FROM aliases WHERE alias = ? AND carrier = 'un' LIMIT 1", w);
  }
  if (!aliasCode) aliasCode = first('SELECT locode FROM aliases WHERE alias = ? LIMIT 1', w); // 未指定船司时的旧行为
  const nameRe = "function LIKE '%1%' LIMIT 1";
  const port = (aliasCode && db.prepare('SELECT * FROM ports WHERE locode=?').get(aliasCode))
    || db.prepare(`SELECT * FROM ports WHERE LOWER(name_ascii)=? AND ${nameRe}`).get(w)
    // 前缀优先于「包含」：字符串 "true" 曾在「包含」兜底里命中 "sTRUE r"（Struer, DK）
    || db.prepare(`SELECT * FROM ports WHERE LOWER(name_ascii) LIKE ? AND ${nameRe}`).get(`${w}%`)
    || (w.length >= 5 // 「包含」兜底要求 ≥5 字符：否则 "true" 会命中 "sTRUE r"(Struer)"
      ? db.prepare(`SELECT * FROM ports WHERE LOWER(name_ascii) LIKE ? AND ${nameRe}`).get(`%${w}%`)
      : null)
    || null;
  if (!port) return null; // 词典与 ports 都查不到 → unknown 兜底，绝不抛错拖垮整批
  const locode = aliasCode || port.locode; // 有船司别名码就优先用船司的码
  const carrierAliases = db.prepare('SELECT carrier, alias FROM aliases WHERE locode=?').all(locode);
  return { locode, name: port.name_ascii, country: port.country, carrierAliases };
}
