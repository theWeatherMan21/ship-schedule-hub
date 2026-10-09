// 港口解析层：用户输入的港口词 → 各船司的称呼
// 词典优先：db/ports.db aliases 表（实测映射，66 条）；无 alias 时兜底 "NAME (LOCODE)"。
// 用法：const r = await resolvePort('maersk', 'Ningbo') → { word, locode, name, country, text, source }
//   r.text 即填进输入框的字符串；r.source ∈ verified|un|fallback
import { findPort, siblingPorts } from '../portdb.mjs';

export async function resolvePort(carrierId, word) {
  const w = String(word || '').trim();
  if (!w) return { word: w, text: w, source: 'empty' };
  const hit = findPort(w, carrierId);
  if (!hit) return { word: w, text: w, source: 'unknown' }; // 词典没查到：原样传，不编造
  const own = (hit.carrierAliases || []).find((a) => a.carrier === carrierId);
  // ⚠️ 10-09 修正（爹地指出"名录匹配有问题"，离线单测抓到）：**不能让学来的船司别名直接决定填什么**。
  // 反例：马士基的 verified 别名里有一条 `bhatiari`（吉大港的码头名）→ 用户打 chittagong，
  // 我们却往表单里填 bhatiari（rotterdam → overschie 同病）→ **静默查了别的地方**，比失败危险得多。
  // 新规则：填表文本 = 用户自己打的纯地名（最贴近站点习惯）→ 否则词典港名的短前缀；
  // 船司别名退回"备选写法"角色（由 portVariants 在首选失败时依次试）。
  const bare = (x) => String(x || '').trim().replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean);
  const nameTok = bare(hit.name).slice(0, 2).join(' ') || hit.name;
  const userWord = /^[A-Za-z][A-Za-z .'-]{1,23}$/.test(w) ? w : '';
  const text = userWord || nameTok;
  const src = userWord ? 'user' : 'name';
  let siblings = [];
  try { siblings = siblingPorts({ locode: hit.locode, name: hit.name }, 4); } catch { /* 忽略 */ }
  return { word: w, locode: hit.locode, name: hit.name, country: hit.country, text, source: src, siblings };
}
