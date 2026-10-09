// 港口解析层：用户输入的港口词 → 各船司的称呼
// 词典优先：db/ports.db aliases 表（实测映射，66 条）；无 alias 时兜底 "NAME (LOCODE)"。
// 用法：const r = await resolvePort('maersk', 'Ningbo') → { word, locode, name, country, text, source }
//   r.text 即填进输入框的字符串；r.source ∈ verified|un|fallback
import { findPort, siblingPorts, aliasRowsContaining } from '../portdb.mjs';

// ★ 船司"港口替代"规则（爹地 2026-10-09 给的）：
//   船司名录里没有这个小港时，用它有的大港代替搜索。
//   maersk: Aliaga → Izmir（马士基名录无 Aliaga，只有 Izmir/TRIZM；实测 maersk 库自身别名 izmir→TRIZM）
//   新增同类规则时在这里加一行即可（key 一律小写、不带空格）。
const CARRIER_PORT_REDIRECT = {
  maersk: { aliaga: 'izmir' },
};

export async function resolvePort(carrierId, word) {
  const w0 = String(word || '').trim();
  if (!w0) return { word: w0, text: w0, source: 'empty' };
  // ★ 船司港口替代（爹地规则）：如 maersk 无 Aliaga → 用 izmir 代替搜索
  let redirectedFrom = '';
  let w = w0;
  {
    const to = (CARRIER_PORT_REDIRECT[carrierId] || {})[w0.toLowerCase()];
    if (to && to !== w0.toLowerCase()) { redirectedFrom = w0; w = to; }
  }
  const hit = findPort(w, carrierId);
  if (!hit) return { word: w, text: w, source: 'unknown' }; // 词典没查到：原样传，不编造
  // ★ 10-09 定案（爹地铁证：马士基库里 天津=Xingang、伊斯坦布尔=Ambarli）：
  //   填表必须**用船司自己的词**（只取首词短前缀）。三个来源汇集候选：
  //   ① 本条目上该船司的别名 ② 同组港条目上该船司的别名（天津→Xingang 走这条）
  //   ③ 全库里"别名文本含本港名"的该船司别名（Istanbul→Ambarli 走这条，Ambarli 挂在另一个条目上）
  //   排序原则：**与词典港名不同的候选优先**——船司特意起别名，就说明它不按我们的名字叫。
  const firstTok = (x) => String(x || '').replace(/[(),]/g, ' ').split(/\s+/).filter(Boolean)[0] || '';
  const mine = new Set();
  for (const a of (hit.carrierAliases || [])) if (a.carrier === carrierId) mine.add(firstTok(a.alias));
  try {
    for (const sib of siblingPorts({ locode: hit.locode, name: hit.name }, 4)) {
      const h2 = findPort(sib.name, carrierId);
      for (const a of ((h2 && h2.carrierAliases) || [])) if (a.carrier === carrierId) mine.add(firstTok(a.alias));
    }
  } catch { /* 忽略 */ }
  try {
    const nm = String(hit.name || '').toLowerCase();
    if (nm.length >= 4) {
      for (const row of aliasRowsContaining(nm, carrierId)) mine.add(firstTok(row));
    }
  } catch { /* 忽略 */ }
  const nameTok = (String(hit.name || '').replace(/[(),]/g, ' ').split(/\s+/)[0] || hit.name || '').trim();
  const userWord = /^[A-Za-z][A-Za-z .'-]{1,23}$/.test(w) ? w : '';
  const all = [...mine].filter((x) => x && x.length >= 3);
  const distinctive = all.filter((x) => x.toLowerCase() !== nameTok.toLowerCase() && x.toLowerCase() !== String(w).toLowerCase());
  const text = distinctive[0] || userWord || nameTok;
  const src = distinctive.length ? 'carrier' : (userWord ? 'user' : 'name');
  const altNames = distinctive.slice(1).concat([userWord, nameTok, ...all]).filter((x, i, a) => x && a.indexOf(x) === i && x !== text);
  let siblings = [];
  try { siblings = siblingPorts({ locode: hit.locode, name: hit.name }, 4); } catch { /* 忽略 */ }
  return { word: w0, locode: hit.locode, name: hit.name, country: hit.country, text, source: src, siblings, alts: altNames, redirectedFrom };
}
