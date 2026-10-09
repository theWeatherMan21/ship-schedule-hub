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
  // ⚠️ 填进输入框的必须是**能触发表站自动补全的短地名前缀**（爹地 10-09 指出"填表 approach 有问题"）。
  // 反面：把"给人看的标签"当输入 —— `Tianjin (CNTNJ)` / `ningbo cnngb` 这类带括号/码的全串，
  // 站点联想框匹配不到（技能里早有此条：候选多为前缀匹配，别名要存短前缀）。
  const bare = (x) => String(x || '').trim().replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean);
  const shortPrefix = (a) => {
    const t = bare(a).filter((w) => !/^[A-Z0-9]{3,6}$/.test(w));   // 去掉纯码片段
    return t.length === 1 && t[0].length >= 3 && t[0].length <= 14 ? t[0] : '';
  };
  const userWord = /^[A-Za-z][A-Za-z .'-]{1,23}$/.test(w) ? w : '';   // 用户自己打的纯地名（最贴近站点习惯）
  let text = '';
  let src = 'name';
  if (own && shortPrefix(own.alias)) { text = shortPrefix(own.alias); src = 'verified'; }
  else if (userWord) { text = userWord; src = 'user'; }
  else if (own) { text = bare(own.alias).slice(0, 2).join(' '); src = 'verified'; }
  else { text = bare(hit.name).slice(0, 2).join(' ') || hit.name; src = 'name'; }
  let siblings = [];
  try { siblings = siblingPorts({ locode: hit.locode, name: hit.name }, 4); } catch { /* 忽略 */ }
  return { word: w, locode: hit.locode, name: hit.name, country: hit.country, text, source: src, siblings };
}
