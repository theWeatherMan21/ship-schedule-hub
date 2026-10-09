// 港口解析层：用户输入的港口词 → 各船司的称呼
// 词典优先：db/ports.db aliases 表（实测映射，66 条）；无 alias 时兜底 "NAME (LOCODE)"。
// 用法：const r = await resolvePort('maersk', 'Ningbo') → { word, locode, name, country, text, source }
//   r.text 即填进输入框的字符串；r.source ∈ verified|un|fallback
import { findPort } from '../portdb.mjs';

export async function resolvePort(carrierId, word) {
  const w = String(word || '').trim();
  if (!w) return { word: w, text: w, source: 'empty' };
  const hit = findPort(w, carrierId);
  if (!hit) return { word: w, text: w, source: 'unknown' }; // 词典没查到：原样传，不编造
  const own = (hit.carrierAliases || []).find((a) => a.carrier === carrierId);
  if (own) {
    // 该船司【实测】过的叫法 —— 最准，直接用
    return { word: w, locode: hit.locode, name: hit.name, country: hit.country, text: own.alias, source: 'verified' };
  }
  // ⚠️ 通用 aka（含市场名/缩写/内部码）**只用来"认出输入"，不拿去填表**：
  //   它们可能是船司内部码头码（nbshan / kfaraviv 之类），填进别家表单就是"搜不到"。
  //   填表一律用词典港名 + 码（10-09 真机：HMM 被填 'nbshan' → Search Results 0）。
  return { word: w, locode: hit.locode, name: hit.name, country: hit.country, text: `${hit.name} (${hit.locode})`, source: 'name' };
  return { word: w, locode: hit.locode, name: hit.name, country: hit.country, text: `${hit.name} (${hit.locode})`, source: 'fallback' };
}
