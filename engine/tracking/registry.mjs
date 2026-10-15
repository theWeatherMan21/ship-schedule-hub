// 提单追踪 · 船司模块注册表（婉宜 2026-10-10 · UI 卡）
//
// 约定（各「船司接入卡」照此落地即自动出现在 App 里，不需要改 UI/Rust）：
//   engine/tracking/<carrierId>.mjs  导出一个以 track 开头的函数（如 trackMaersk / trackOne / trackCosco），
//   签名：(number, { timeoutMs, ctx }) => Promise<统一结构>
//   统一结构最低要求：{ ok, number, carrier, containers?, events?/raw? }
//   —— raw 越全越好（归一化层会用 raw 里的 ACTUAL/EXPECTED 与 eta_final_delivery）。
//
// 本文件只做「发现 + 装载」，不硬编码船司清单 → 兄弟卡落地即生效。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
// 非「船司模块」的帮助文件（快速排除；真正的判据见 exportsTracker —— 只认「导出了 track* 函数」的文件，
// 这样兄弟卡新加帮助模块（identify.mjs 等）不会被误当成船司）
export const HELPERS = ['cli', 'detect', 'normalize', 'registry', 'index', 'identify'];

/** 文件里是否导出了 track* 函数（船司适配器的唯一判据） */
function exportsTracker(file) {
  try {
    const src = fs.readFileSync(file, 'utf8');
    return /export\s+(?:async\s+)?(?:function|const|let|var)\s+track/i.test(src)
      || /export\s+default\s+(?:async\s+)?function\s+track/i.test(src)
      || /export\s*\{[^}]*\btrack\w*/i.test(src);
  } catch { return false; }
}

export function availableCarriers() {
  try {
    return fs.readdirSync(DIR)
      .filter((f) => f.endsWith('.mjs') && !f.startsWith('.') && !f.startsWith('_'))
      .map((f) => path.basename(f, '.mjs'))
      .filter((n) => !HELPERS.includes(n))
      .filter((n) => exportsTracker(path.join(DIR, `${n}.mjs`)))
      .sort();
  } catch { return []; }
}

/** 装载某家的 tracker 函数（找不到就抛，由调用方转成人类可读的错误）。
 *  返回 { fn, deadlineMs }：deadlineMs 是该模块可选的 `export const deadlineMs`（0=未声明）。 */
export async function loadTracker(carrierId) {
  const id = String(carrierId || '').toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(id)) throw new Error(`bad carrier id: ${carrierId}`);
  if (!availableCarriers().includes(id)) throw new Error(`no tracking module for "${id}"${availableCarriers().length ? ` (available: ${availableCarriers().join(', ')})` : ''}`);
  const mod = await import(`./${id}.mjs`);
  const entries = Object.entries(mod).filter(([, v]) => typeof v === 'function');
  let fn = entries.find(([k]) => /^track/i.test(k));
  if (!fn && entries.length === 1) fn = entries[0];           // 单函数导出也接受
  if (!fn) throw new Error(`${id}.mjs exports no tracker function (expected a name starting with "track")`);
  return { fn: fn[1], deadlineMs: Number(mod.deadlineMs) || 0 };
}

/** 整次追踪的硬截止（毫秒）计算——10-15 爹地拍板「按家可放宽」。
 *  优先级：环境变量覆盖 > 适配器声明的 deadlineMs > timeoutMs × 4（默认）。
 *  （背景：Hapag 的 CF 双模流程常态 2-8 分钟，240s 常态撞线；它自己声明 400s。） */
export function computeDeadlineMs({ envOverride = 0, carrierDeadline = 0, timeoutMs = 60000 } = {}) {
  if (Number(envOverride) > 0) return Number(envOverride);
  if (Number(carrierDeadline) > 0) return Number(carrierDeadline);
  return timeoutMs * 4;
}
