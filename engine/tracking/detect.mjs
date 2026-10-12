// 提单 / 箱号 → 船司归属识别 —— UI 侧适配层（婉宜 2026-10-10）
//
// ⚠ 表已归一到识别器卡（t_e66aa5a1）：本文件不再自带 PREFIX/OWNER 表，
//   改为委托 engine/tracking/identify.mjs（单一事实来源），只把它的返回
//   适配成 UI/CLI 一直使用的那份契约（detectCarrier / describeShape / CARRIER_LABELS）。
//
//   改前缀 / 加订舱号格式 → 只改 identify.mjs，然后 `node qa/track-identify-test.mjs --sync`。
//
// 契约（cli.mjs 与 Rust 侧依赖，别动）：
//   detectCarrier(input) -> { ok, number, carrier?, label?, scac?, how?, reason?, candidates? }
//     ok:false 时 reason ∈ { 'too-short', 'bad-container-check', 'foreign-prefix', 'unknown-prefix' }
//     candidates: [{ carrier, label, reason, score }]（UI 手选用；不自动路由）
import { identify, CARRIERS, normalize, containerCheck, iso6346Check } from './identify.mjs';

// 船司 id → 展示名（英文，与 src/main.js 的 CARRIERS / engine 配方目录一致）
export const CARRIER_LABELS = {
  maersk: 'Maersk', msc: 'MSC', cma: 'CMA CGM', cosco: 'COSCO', hapag: 'Hapag-Lloyd',
  one: 'ONE', evergreen: 'Evergreen', yangming: 'Yang Ming', hmm: 'HMM', zim: 'ZIM', oocl: 'OOCL',
};

export const normalizeNumber = normalize;
export const isContainerNumber = (s) => /^[A-Z]{4}\d{7}$/.test(normalize(s));
export { iso6346Check };

/**
 * 识别号码归属（内部走 identify.mjs 的权威表）。
 * @returns {{ok:boolean, number:string, carrier?:string, label?:string, scac?:string, how?:string, reason?:string, candidates?:Array<{carrier:string,label:string,reason:string,score:number}>}}
 */
export function detectCarrier(input) {
  const number = normalize(input);
  if (number.length < 5) return { ok: false, number, reason: 'too-short', candidates: [] };

  const r = identify(input);
  const cands = (r.candidates || []).map((c) => ({
    carrier: c.carrierId, label: CARRIER_LABELS[c.carrierId] || c.carrierId, reason: c.reason, score: c.score,
  }));

  if (r.ok) {
    const scac = /^[A-Z]{4}/.test(number) ? number.slice(0, 4) : '';
    return { ok: true, number, carrier: r.carrierId, label: CARRIER_LABELS[r.carrierId] || r.carrierName, scac, how: r.matchedBy, confidence: r.confidence, flags: r.flags, candidates: cands };
  }

  let reason = 'unknown-prefix';
  if (r.flags && r.flags.containerValid === false) reason = 'bad-container-check';
  else if (r.flags && r.flags.houseBlPossible) reason = 'foreign-prefix';
  return { ok: false, number, reason, candidates: cands, docType: r.docType, note: r.note };
}

/** 号码形态的中文说明（UI 提示用；内容是英文数据，外壳保持中文） */
export function describeShape(input) {
  const s = normalize(input);
  if (!s) return '';
  const chk = containerCheck(s);
  if (chk.isContainerShape) return chk.valid ? `集装箱号（箱主 ${s.slice(0, 4)}）` : `集装箱号形态但校验位有误（箱主 ${s.slice(0, 4)}）`;
  if (/^\d{9}$/.test(s)) return '提单/订舱号（9 位数字）';
  if (/^[A-Z]{4}/.test(s)) return `单据号（前缀 ${s.slice(0, 4)}）`;
  return '';
}

// 便于别的模块（Rust/脚本）拿到整表
export { CARRIERS };
