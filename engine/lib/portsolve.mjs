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
  const alias = (hit.carrierAliases || []).find((a) => a.carrier === carrierId)
    || (hit.carrierAliases || []).find((a) => a.carrier === 'un');
  if (alias) {
    // alias 表存的是小写规范化串，候选匹配按不区分大小写进行
    return { word: w, locode: hit.locode, name: hit.name, country: hit.country, text: alias.alias, source: 'verified' };
  }
  return { word: w, locode: hit.locode, name: hit.name, country: hit.country, text: `${hit.name} (${hit.locode})`, source: 'fallback' };
}
