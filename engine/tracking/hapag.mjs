// Hapag-Lloyd 提单/订舱号追踪 —— 2026-10-10 接入（婉宜）
//
// 实测路径（全程有头 + CDP 最小化，屏幕上零窗口）：
//   1) 入口 https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html
//      —— Cloudflare Managed Challenge（"Just a moment"/"Security Check"）。无头结构性被拦；
//         有头真指纹 8s 内自动放行（与船期页同款结论，借之）。
//   2) 表单是服务端 JSF（AEM OLB），两个字段都必填其一：
//        input#tracing_by_booking_f:hl12  Booking No.        maxlength 8
//        input#tracing_by_booking_f:hl16  Bill of Lading No. maxlength 17
//      提单号形如 HLCU + 12（共 16 位）→ 填 **hl16**；填错字段（hl12）会被站内校验回
//      "Specified value is not a valid number."（实测踩过）。
//   3) Find 按钮 #tracing_by_booking_f:hl18 → POST action `?..._a=tracing_by_booking`
//      → 302 → GET `...?blno=<号>` → **服务端渲染**结果：容器表
//      列 = Bill of Lading No. / Type / Status / Place of Activity + 每行 Details 按钮
//      （帮助页 screen-area-page5080.html 原文；Details 跳到「Tracing by container」看事件）
//   4) OLB 维护期：页面渲染 .hal-info-box__title「Due to a short maintenance our Online
//      Business Services are currently not available…」→ 本模块如实报 maintenance（不是"查不到"）。
//
// 输出统一结构（与 tracking/maersk.mjs 对齐）：
//   { ok, number, carrier, kind, maintenance, banner?, url?, containers:[{bl,type,status,place,details?}],
//     tableText?, timeline?:[{time,activity,place}], error?, evidence? }
import fs from 'node:fs';
import path from 'node:path';
import { launchHeadedQuiet, launch, sleep, EVIDENCE_DIR } from '../browser.mjs';
import { isBlockPage } from '../lib/utils.mjs';

export const BOOKING_URL = 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html';
export const FIELD = { booking: 'tracing_by_booking_f:hl12', bl: 'tracing_by_booking_f:hl16', find: 'tracing_by_booking_f:hl18' };
const MAINT_RE = /short maintenance|currently not available|services are currently not/i;

/** 提单号形态：HLCU + 12（16 位）。也接受显式指定。 */
export function guessKind(number) {
  const n = String(number || '').replace(/\s+/g, '').toUpperCase();
  if (/^HLCU[A-Z0-9]{12}$/.test(n)) return 'bl';
  if (n.length === 8) return 'booking';
  return n.length >= 12 ? 'bl' : 'booking';
}

async function passShield(page, rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    for (let j = 0; j < 12; j++) {
      await sleep(2000);
      const len = await page.evaluate(() => (document.body.innerText || '').length).catch(() => 0);
      if (!(await isBlockPage(page).catch(() => true)) && len > 150) { await sleep(2000); return true; }
    }
    if (!(await isBlockPage(page).catch(() => true))) return true;
  }
  return false;
}

const readBanner = (page) => page.evaluate(() => {
  for (const e of document.querySelectorAll('.hal-info-box__title, .hal-info-box, #HlMessages *')) {
    const t = (e.textContent || '').trim();
    if (/maintenance|not available/i.test(t)) {
      const cs = getComputedStyle(e);
      if (cs.display !== 'none' && cs.visibility !== 'hidden') return t.slice(0, 300);
    }
  }
  return '';
}).catch(() => '');

/** 从结果页 DOM 抽容器表（尽量宽松：按表头关键字定位列，行内取单元格文本）。 */
const parseTable = (page) => page.evaluate(() => {
  const out = { rows: [], headers: [], text: '', messages: [] };
  const msg = document.querySelector('#HlMessages');
  if (msg) out.messages = (msg.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  const tables = [...document.querySelectorAll('table')];
  for (const tb of tables) {
    const rows = [...tb.querySelectorAll('tr')];
    if (rows.length < 2) continue;
    const head = [...(rows[0].querySelectorAll('th,td'))].map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim());
    if (!head.some((h) => /status|place of activity|bill of lading|type/i.test(h))) continue;
    if (!out.headers.length) out.headers = head;
    for (const tr of rows.slice(1)) {
      const cells = [...tr.querySelectorAll('td,th')].map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim());
      if (!cells.length || cells.every((c) => !c)) continue;
      const row = {};
      head.forEach((h, i) => { if (h) row[h] = cells[i] ?? ''; });
      row._cells = cells;
      out.rows.push(row);
    }
    if (out.rows.length) break;
  }
  const main = document.querySelector('#contentOlb') || document.body;
  out.text = (main.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 6000);
  return out;
}).catch(() => ({ rows: [], headers: [], text: '', messages: [] }));

/**
 * 查 Hapag 提单/订舱号。
 * @param {string} number 提单号（HLCU…）或订舱号
 * @param {{timeoutMs?:number, ctx?:any, kind?:'bl'|'booking', evidence?:boolean, wantEvents?:boolean}} opt
 */
export async function trackHapag(number, opt = {}) {
  const { timeoutMs = 90000, kind = guessKind(number), evidence = true } = opt;
  const own = !opt.ctx;
  let ctx = opt.ctx, mode = 'reused';
  if (own) {
    // CF Managed Challenge：必须真指纹 → 有头 + CDP 最小化（库层硬闸保证屏幕上不出窗）
    const r = await launchHeadedQuiet();
    ctx = r.ctx; mode = r.mode;
    if (mode !== 'headed-minimized') console.error('[hapag] 警告：未进入有头最小化（' + mode + '），CF 挑战大概率过不去');
  }
  const page = ctx.pages().find((p) => !p.isClosed()) || (await ctx.newPage());
  page.setDefaultTimeout(20000);
  const evid = { mode, steps: [] };
  const tag = Date.now();
  const save = (suffix, text) => {
    if (!evidence) return null;
    try {
      const f = path.join(EVIDENCE_DIR, `hapag-track-${tag}-${suffix}`);
      fs.writeFileSync(f, text);
      return f;
    } catch { return null; }
  };

  try {
    const url = `${BOOKING_URL}?blno=${encodeURIComponent(number)}`;
    let last = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        last = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.min(timeoutMs, 60000) });
      } catch (e) { evid.steps.push('goto:' + String(e).slice(0, 80)); }
      const passed = await passShield(page);
      evid.steps.push(`attempt${attempt} shield=${passed} http=${last ? last.status() : 0}`);
      if (!passed) continue;
      const banner = await readBanner(page);
      if (banner) {
        evid.steps.push('maintenance-banner');
        save('maint.txt', banner + '\n' + (await page.evaluate(() => document.body.innerText || '')).slice(0, 4000));
        return { ok: false, number, carrier: 'hapag', kind, maintenance: true, banner, error: 'OLB maintenance', evidence: evid };
      }
      const found = await page.locator(`input[id="${kind === 'bl' ? FIELD.bl : FIELD.booking}"]`).count().catch(() => 0);
      if (!found) { evid.steps.push('no-field'); continue; }
      // 填号 + 点 Find
      await page.fill(`input[id="${kind === 'bl' ? FIELD.bl : FIELD.booking}"]`, number);
      const readback = await page.locator(`input[id="${kind === 'bl' ? FIELD.bl : FIELD.booking}"]`).inputValue().catch(() => '');
      evid.steps.push('filled=' + readback);
      await page.click(`#${FIELD.find.replace(/([:])/g, '\\$1')}`, { timeout: 15000 }).catch(async () => {
        await page.getByRole('button', { name: /^\s*find\s*$/i }).first().click({ timeout: 15000 }).catch(() => {});
      });
      // 等结果（结果表出现 或 消息出现 或 超时）
      const deadline = Date.now() + timeoutMs;
      let parsed = { rows: [], headers: [], text: '', messages: '' };
      while (Date.now() < deadline) {
        await sleep(2500);
        const banner2 = await readBanner(page);
        if (banner2) {
          evid.steps.push('maintenance-after-search');
          return { ok: false, number, carrier: 'hapag', kind, maintenance: true, banner: banner2, error: 'OLB maintenance', evidence: evid };
        }
        parsed = await parseTable(page);
        if (parsed.rows.length || /no data|not found|keine|no container|invalid/i.test(parsed.messages || '')) break;
      }
      const html = await save('result.html', await page.content().catch(() => ''));
      const txt = await save('result.txt', parsed.text || '');
      evid.steps.push('rows=' + parsed.rows.length + ' url=' + page.url().slice(0, 120));
      const containers = parsed.rows.map((r) => ({
        bl: r['Bill of Lading Number'] || r._cells?.[0] || '',
        type: r['Type'] || r._cells?.[1] || '',
        status: r['Status'] || r._cells?.[2] || '',
        place: r['Place of Activity'] || r._cells?.[3] || '',
      })).filter((c) => c.bl || c.type || c.status);
      if (!containers.length && !parsed.messages) {
        return { ok: false, number, carrier: 'hapag', kind, error: 'no result table', tableText: parsed.text, evidence: evid, html: html || undefined, text: txt || undefined };
      }
      return {
        ok: true, number, carrier: 'hapag', kind,
        containers, headers: parsed.headers, messages: parsed.messages,
        tableText: parsed.text, url: page.url(), evidence: evid,
        savedHtml: html || undefined, savedText: txt || undefined,
      };
    }
    return { ok: false, number, carrier: 'hapag', kind, error: 'shield/field unresolved', evidence: evid };
  } finally {
    if (own) await ctx.close().catch(() => {});
  }
}

export default { trackHapag, guessKind, BOOKING_URL };
