// 提单/箱号/订舱号 → 船司 识别器（SCAC 前缀路由表 + 兜底预测）
// ─────────────────────────────────────────────────────────────────────────────
// 用途：App「提单/箱号」页签收到一个号码后，判断它归哪家船司（决定去查谁）。
// 设计对齐业界做法（Terminal49 SCACbot / project44）：
//   ① 能确定 → 直接路由；② 不能确定 → 返回「可手选的候选」+ 置信度 + 原因，交给用户选。
//
// 数据来源（R1/R2，2026-10-10 校核）：
//   · project44 Ocean SCAC appendix（主 SCAC + 备用 SCAC）
//   · Terminal49 SCAC CSV / per-carrier 页（含 box owner 前缀、订舱号形态）
//   · Vizion「Bill of lading number formatting」（各船司 MBL 形态）
//   · Hapag-Lloyd EDI MIG（自家 8 位订舱号）、MSC 2018 公告（MEDU 为提单前缀）
//   · 本卡情报（HLCU→Hapag；COSU/COAU/COEU→COSCO；HDMU→HMM；MEDU/MSCU→MSC；
//     MAEU/9 位纯数字→Maersk；YMLU/YMJA→Yangming；ZIMU→Zim；ONEY→ONE；
//     EGLV→Evergreen；CMDU→CMA；OOLU→OOCL）
//
// ⚠ 别把两类前缀混为一谈（行业最常见的「查不到」原因之一）：
//   · SCAC（提单前缀，4 字母）—— 出单船司自己的代码，**跟提单走**。
//   · 箱主码（BIC owner code，4 字母，末位通常 U/J/Z）—— 跟**箱子**走；
//     租箱/共享箱可能挂在别家提单上 → 按箱主码路由只是「高把握的猜测」，不是铁证。
//
// 输出统一结构：见 identify() 注释。

// ── 船司表（单一事实来源；顺序 = App 里的候选下拉顺序）─────────────────────────
// scac      : 提单号开头（SCAC，4 字母），命中 → 高置信路由
// container : 箱主码（BIC，4 字母），命中 → 中置信（箱可能挂在别家提单上）
// booking   : 订舱号形态（各家不一，仅作低置信线索，宁可只给候选）
// tracking  : 追踪适配器状态（live=已接 / planned=本批在建 / none=未排期）
export const CARRIERS = [
  {
    id: 'maersk', name: '马士基 Maersk',
    scac: ['MAEU'],
    container: ['MSKU', 'MRKU', 'MRSU', 'MIEU', 'MNBU', 'MAEU', 'SEAU', 'PONU'],
    booking: [{ re: /^\d{9}$/, label: '9 位纯数字（Maersk 订舱/提单）', score: 0.6 }],
    tracking: 'live',
  },
  {
    id: 'msc', name: '地中海航运 MSC',
    scac: ['MSCU', 'MEDU'],           // MEDU = 2018 起新提单前缀；MSCU = 船司识别码/旧单
    container: ['MSCU', 'MEDU', 'MSDU', 'MSMU', 'MSNU', 'MSPU', 'MSYU', 'GTIU'],
    // 181 系列 = MSC 订舱/参考号（无 SCAC 前缀）。实证（2026-10-10 批次 + 10-12 live 复核）：
    // 181AS0266823514M1 经 MSC 查询成功（SHEKOU→ISTANBUL, MSC METTE）；181AY… 同族归入本规则。
    booking: [{ re: /^181[A-Z]{2}[A-Z0-9]{5,}$/, label: '181 系列（MSC 订舱/参考号，真单实证）', score: 0.6 }],
    tracking: 'live',
  },
  {
    id: 'hapag', name: '赫伯罗特 Hapag-Lloyd',
    scac: ['HLCU', 'HLUS', 'HPET'],
    container: ['HLCU', 'HLXU', 'HLBU', 'UACU', 'UAEU', 'HAMU'],
    booking: [{ re: /^\d{8}$/, label: '8 位纯数字（Hapag 订舱号）', score: 0.45 }],
    tracking: 'live',
  },
  {
    id: 'cosco', name: '中远海运 COSCO',
    scac: ['COSU', 'COAU', 'COEU'],
    container: ['CSNU', 'CBHU', 'CCLU', 'CSLU'],
    // 10 位纯数字 = COSCO BL/订舱形态（官网例 5051645160）。多义（OOCL 同形）→ 只作候选，不自动。
    booking: [{ re: /^\d{10}$/, label: '10 位纯数字（COSCO BL/订舱形态）', score: 0.5 }],
    tracking: 'live',
  },
  {
    id: 'hmm', name: '现代商船 HMM',
    scac: ['HDMU', 'HMMU'],
    container: ['HDMU', 'HMMU'],
    booking: [],
    tracking: 'live',
  },
  {
    id: 'one', name: '海洋网联 ONE',
    scac: ['ONEY'],
    container: ['ONEU', 'MOAU', 'NYKU', 'KKFU', 'KKTU', 'KLFU'], // ONE = K Line+MOL+NYK 合并
    // ONE BL 官网口径（one-line.com，2026-10-12 复核）：BL = ONEY + 12 字符；官网输入不含 ONEY 的「后 12 位」。
    //   官方两种形态：3 字母+9 数字（PUS123456789）/ 4 字母+8 数字（PUSA12345678；同订舱号样例 HAMG12062700）。
    //   真单实证：GYEG18729700 / SZPG70884900 均可查；带 ONEY 前缀的输入由适配器（one.mjs）自动剥离为官网格式后查询。
    booking: [
      { re: /^[A-Z]{3}\d{9}$/, label: '3 字母 + 9 位数字（ONE BL 后 12 位形态）', score: 0.6 },
      { re: /^[A-Z]{4}\d{8}$/, label: '4 字母 + 8 位数字（ONE BL / 订舱号形态）', score: 0.6 },
    ],
    tracking: 'live',
  },
  {
    id: 'zim', name: '以星 ZIM',
    scac: ['ZIMU'],
    container: ['ZIMU', 'ZCSU', 'ZMOU'],
    // Terminal49：ZIM 订舱/预订号形如 M0123456（M + 数字）。
    booking: [{ re: /^M\d{7,}$/, label: 'M + 数字（ZIM 订舱/预订号形态）', score: 0.3 }],
    tracking: 'live',
  },
  {
    id: 'cma', name: '达飞 CMA CGM',
    scac: ['CMDU'],
    container: ['CMAU', 'CGMU', 'ECMU', 'APZU', 'APHU', 'CNCU'],
    booking: [],
    tracking: 'live',
  },
  {
    id: 'evergreen', name: '长荣 Evergreen',
    scac: ['EGLV'],
    container: ['EGHU', 'EGSU', 'EMCU', 'EISU', 'EITU', 'EGMU', 'EVGU', 'EMEU', 'IMTU', 'LTIU', 'UGMU', 'HMCU'],
    // 12 位纯数字 = Evergreen BL/订舱形态（官方 ShipmentLink 例 012345678900）。多义 → 只作候选。
    booking: [{ re: /^\d{12}$/, label: '12 位纯数字（Evergreen BL/订舱形态）', score: 0.5 }],
    tracking: 'live',
  },
  {
    id: 'oocl', name: '东方海外 OOCL',
    scac: ['OOLU'],
    container: ['OOLU', 'OOCU'],
    // 10 位纯数字 = OOCL BL 形态（多义：与 COSCO 同形）→ 只作候选，不自动。
    booking: [{ re: /^\d{10}$/, label: '10 位纯数字（OOCL BL 形态）', score: 0.5 }],
    tracking: 'none',
  },
  {
    id: 'yangming', name: '阳明 Yang Ming',
    scac: ['YMLU', 'YMJA'],            // 2023 起主码由 YMLU 迁往 YMJA
    container: ['YMLU', 'YMMU'],
    booking: [],
    tracking: 'live',
  },
];

// 已知「待归户」素材（2026-10-10 爹地真单批次里暂时定不了归属的），
// 记录在此供后续人工确认；不在此处硬猜，识别器一律走「候选」兜底。
export const PENDING = [
  { number: 'M237055674', hypothesis: 'ZIM 订舱号形态(M+数字) / 亦被当作 MSC 候选；两说未定，需人工确认', candidates: ['zim', 'msc'] },
  { number: 'CANF…', hypothesis: '4 字母但非海洋船司 SCAC，疑为货代/NVOCC 自己的 SCAC（分单）', candidates: [] },
  { number: 'NGP…', hypothesis: '非船司 SCAC 开头，疑为货代分单号/他项引用', candidates: [] },
];
// 已归户（2026-10-12）：181AS0266823514M1 / 181AY… → MSC「181 系列」（见 msc.booking 规则；181AS 经缓存+live 双实证）

// ── 索引 ─────────────────────────────────────────────────────────────────────
const BY_ID = new Map(CARRIERS.map((c) => [c.id, c]));
const BL_INDEX = new Map();        // 4 字母 SCAC → carrierId
const CT_INDEX4 = new Map();       // 4 字母箱主码 → carrierId
const CT_INDEX3 = new Map();       // 3 字母箱主码（去掉 U/J/Z）→ carrierId
for (const c of CARRIERS) {
  for (const p of c.scac) BL_INDEX.set(p, c.id);
  for (const p of c.container) {
    CT_INDEX4.set(p, c.id);
    CT_INDEX3.set(p.slice(0, 3), c.id);
  }
}
// 箱主码 3 字母索引可能撞车（不同船司共享首 3 字母），撞了就丢，退回 4 字母匹配。
{
  const seen = new Map();
  for (const c of CARRIERS) for (const p of c.container) {
    const k = p.slice(0, 3);
    if (seen.has(k) && seen.get(k) !== c.id) CT_INDEX3.delete(k);
    else seen.set(k, c.id);
  }
}

export function carrierById(id) { return BY_ID.get(id) || null; }

// ── 归一化 ───────────────────────────────────────────────────────────────────
// 只保留字母数字并转大写：`MSKU 307703-8` → `MSKU1432299`。
// 注意：不「修复」任何字符，宁可原样返回（防幻觉）。
export function normalize(raw) {
  return String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ── ISO 6346 箱号校验位（第 11 位）───────────────────────────────────────────
const LETTER_VALUE = (() => {
  const v = {}; let n = 10;
  for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    while (n % 11 === 0) n++;          // 跳过 11 的倍数（11,22,33）
    v[ch] = n++;
  }
  return v;
})();
export function iso6346Check(first10) {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = first10[i];
    const val = /[0-9]/.test(ch) ? Number(ch) : LETTER_VALUE[ch];
    if (val == null) return null;
    sum += val * Math.pow(2, i);
  }
  const r = sum % 11;
  return r === 10 ? 0 : r;
}
export function containerCheck(number) {
  const n = normalize(number);
  if (!/^[A-Z]{4}\d{7}$/.test(n)) return { isContainerShape: false, expected: null, actual: null, valid: false };
  const expected = iso6346Check(n.slice(0, 10));
  const actual = Number(n[10]);
  return { isContainerShape: true, expected, actual, valid: expected === actual };
}

// ── 识别 ─────────────────────────────────────────────────────────────────────
/**
 * @param {string} raw 用户输入的号码（可带空格/连字符）
 * @returns {{
 *   input:string, normalized:string,
 *   ok:boolean,                     // true = 可直接路由（置信度 >= 0.6）
 *   carrierId:string|null, carrierName:string|null,
 *   confidence:'high'|'medium'|'low'|'none', score:number,
 *   matchedBy:'scac'|'container'|'booking-format'|'none',
 *   docType:'bl'|'container'|'booking'|'unknown',
 *   candidates:Array<{carrierId,carrierName,reason,score}>,
 *   note:string,
 *   flags:{containerValid:boolean|null, foreignPrefix:boolean, houseBlPossible:boolean}
 * }}
 */
export function identify(raw) {
  const n = normalize(raw);
  const base = {
    input: String(raw == null ? '' : raw), normalized: n,
    ok: false, carrierId: null, carrierName: null,
    confidence: 'none', score: 0, matchedBy: 'none', docType: 'unknown',
    candidates: [], note: '',
    flags: { containerValid: null, foreignPrefix: false, houseBlPossible: false },
  };
  if (!n) return { ...base, note: '请输入提单号 / 箱号 / 订舱号' };

  const allCandidates = () => buildCandidates(n);

  // ① 箱子号（4 字母 + 7 数字）——按箱主码归属，校验位算额外证据
  if (/^[A-Z]{4}\d{7}$/.test(n)) {
    const chk = containerCheck(n);
    if (chk.valid === false) {
      const name4 = n.slice(0, 4);
      // 11 位形态 + 前 4 位是某家「提单前缀(SCAC)」→ 更像「提单号」而非打错的箱号：
      // 提单号无校验位，勿用 ISO 6346 拦杀；低置信放行（note 保留核对提示）。
      const scacId = BL_INDEX.get(name4);
      if (scacId) {
        const c = BY_ID.get(scacId);
        return { ...base, ok: true, carrierId: scacId, carrierName: c.name,
          confidence: 'low', score: 0.55, matchedBy: 'scac-loose', docType: 'bl',
          candidates: orderCandidates(allCandidates(), scacId),
          flags: { ...base.flags, containerValid: false },
          note: `前缀 ${name4} → ${c.name}；第 11 位校验位不符（若这是箱号请核对输入；若是提单号可直接查询）` };
      }
      // 校验位不对、且前 4 位不是提单前缀：多半是打错的箱子，别当成箱子办。
      const cid = CT_INDEX4.get(name4) || CT_INDEX3.get(n.slice(0, 3));
      const out = { ...base, docType: 'unknown', matchedBy: 'none', confidence: 'none',
        candidates: orderCandidates(allCandidates(), cid || null), flags: { ...base.flags, containerValid: false } };
      out.note = `像箱号但校验位不符（算得 ${chk.expected}，第 11 位是 ${chk.actual}）——请核对是否输错`
        + (cid ? `；箱主码 ${name4} 指向 ${BY_ID.get(cid).name}，可手动选该船司` : '');
      return out;
    }
    const cid = CT_INDEX4.get(n.slice(0, 4)) || CT_INDEX3.get(n.slice(0, 3));
    const flags = { ...base.flags, containerValid: chk.valid };
    if (cid) {
      const c = BY_ID.get(cid);
      return { ...base, ok: true, carrierId: cid, carrierName: c.name,
        confidence: 'medium', score: 0.7, matchedBy: 'container', docType: 'container',
        candidates: orderCandidates(allCandidates(), cid), flags,
        note: `箱主码 ${n.slice(0, 4)} → ${c.name}（箱号有效）。提示：箱子可能挂在别家提单上，查不到时可手动换船司。` };
    }
    return { ...base, docType: 'container', matchedBy: 'none',
      candidates: orderCandidates(allCandidates(), null), flags,
      note: `箱号有效，但箱主码 ${n.slice(0, 4)} 不在已知船司库——请手动选择船司。` };
  }

  // ② 提单号（以船司 SCAC 4 字母开头）
  const four = n.slice(0, 4);
  if (/^[A-Z]{4}/.test(n) && BL_INDEX.has(four)) {
    const cid = BL_INDEX.get(four);
    const c = BY_ID.get(cid);
    const dupCt = CT_INDEX4.get(four) === cid ? '（该码同时是箱主码）' : '';
    return { ...base, ok: true, carrierId: cid, carrierName: c.name,
      confidence: 'high', score: 0.95, matchedBy: 'scac', docType: 'bl',
      candidates: orderCandidates(allCandidates(), cid),
      note: `提单前缀 ${four} → ${c.name}${dupCt}` };
  }

  // ③ 订舱号形态（各家不一，仅作线索；够把握的才自动路由）
  for (const c of CARRIERS) {
    for (const b of c.booking) {
      if (b.re.test(n)) {
        const strong = b.score >= 0.6;
        return { ...base, ok: strong, carrierId: strong ? c.id : null,
          carrierName: strong ? c.name : null,
          confidence: strong ? 'medium' : 'low', score: b.score,
          matchedBy: 'booking-format', docType: 'booking',
          candidates: orderCandidates(allCandidates(), c.id),
          note: strong
            ? `订舱号形态匹配 ${c.name}（${b.label}）`
            : `形态像 ${c.name} 的订舱号（${b.label}），但不唯一——请确认后手选船司` };
      }
    }
  }

  // ②b（10-14 审阅 C2 后移：订舱形态优先）4 字母是已知箱主码、但既不是船司提单前缀、形态也不像完整箱号 → 低置信线索
  const ctId = CT_INDEX4.get(four) || CT_INDEX3.get(n.slice(0, 3));
  if (/^[A-Z]{4}/.test(n) && ctId && !BL_INDEX.has(four)) {
    const c = BY_ID.get(ctId);
    return { ...base, ok: false, carrierId: null, docType: 'container', matchedBy: 'container',
      confidence: 'low', score: 0.5,
      candidates: orderCandidates(allCandidates(), ctId),
      note: `前缀 ${four} 是 ${c.name} 的箱主码，但整体不像完整箱号——请确认后手选船司。` };
  }

  // ④ 兜底：4 字母但不是海洋船司 SCAC → 可能是货代分单（HBL）
  const flags = { ...base.flags };
  if (/^[A-Z]{4}/.test(n)) {
    flags.houseBlPossible = true;
    flags.foreignPrefix = true;
    return { ...base, docType: 'unknown', matchedBy: 'none',
      candidates: orderCandidates(allCandidates(), null), flags,
      note: `前缀 ${four} 不是已知海洋船司 SCAC——可能是货代分单号（HBL，只存在于货代系统）或非提单引用。`
        + '请手动选择船司；若是分单，改用箱号更靠谱。' };
  }

  return { ...base, candidates: orderCandidates(allCandidates(), null),
    note: '认不出归属（无船司前缀）——请手动选择船司。' };
}

// 候选列表：命中的排前面，其余按 App 顺序补齐（够手动选）。
function buildCandidates(n) {
  const out = [];
  const four = n.slice(0, 4);
  for (const c of CARRIERS) {
    if (BL_INDEX.get(four) === c.id) out.push({ carrierId: c.id, carrierName: c.name, reason: `提单前缀 ${four}`, score: 0.95 });
    else if (CT_INDEX4.get(four) === c.id || CT_INDEX3.get(n.slice(0, 3)) === c.id) out.push({ carrierId: c.id, carrierName: c.name, reason: `箱主码 ~${four}`, score: 0.7 });
  }
  for (const c of CARRIERS) {
    for (const b of c.booking) if (b.re.test(n)) out.push({ carrierId: c.id, carrierName: c.name, reason: b.label, score: b.score });
  }
  return out;
}
function orderCandidates(cands, firstId) {
  const seen = new Set();
  const out = [];
  for (const c of cands) { if (c.carrierId === firstId && !seen.has(c.carrierId)) { out.push(c); seen.add(c.carrierId); } }
  for (const c of cands) { if (!seen.has(c.carrierId)) { out.push(c); seen.add(c.carrierId); } }
  for (const c of CARRIERS) { if (!seen.has(c.id)) { out.push({ carrierId: c.id, carrierName: c.name, reason: '待确认（手选）', score: 0 }); seen.add(c.id); } }
  return out;
}

// 机器可读路由表导出（给前端/其他模块；与 CARRIERS 同源，勿手改）
export function exportTable() {
  return {
    version: 1,
    generatedFrom: 'engine/tracking/identify.mjs',
    carriers: CARRIERS.map((c) => ({
      id: c.id, name: c.name, scac: c.scac, container: c.container, tracking: c.tracking,
      booking: c.booking.map((b) => ({ label: b.label, score: b.score, pattern: String(b.re) })),
    })),
  };
}

export default identify;
