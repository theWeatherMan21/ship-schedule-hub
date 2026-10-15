// Hapag-Lloyd 提单 / 订舱 / 箱号追踪 —— 2026-10-12 重构（v3：无头优先 + 有头兜底）
//
// 通路（2026-10-12 全部实测，端到端样本：HLCUTS12608CSOQ6 → UWLU4114042，9 条事件）：
//   1) 入口（legacy）：https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution-legacy.html?blno=<号>
//      ★ GET 深链免提交，服务端直接渲染结果（无 -legacy 的旧地址已 302 跳新 BETA，勿用）。
//   2) 模式（v3：auto 双模）：
//      ★ 无头（launch/headless-new）：profile 里有有效的 cf_clearance 时直接放行（秒过）。
//        凭证绑定 UA —— 无头 UA 必须与「过盾那次的有头 Chrome 版本」一致；
//        browser.mjs 的 realChromeUA() 已动态对齐真机 Chrome 版本（此前写死 140，导致无头带凭证仍被挑战）。
//      ★ 凭证缺失/过期 → 无头会被 CF 挑战 → auto 模式自动升级为有头真指纹（launchHeadedQuiet）
//        过盾并刷新 cf_clearance（落回同一 profile），此后无头又可复用。
//      ★ 组合拳实测：有头过一次盾，后续无头连续复用（2026-10-12 Hapag 实测）。
//   3) 结果页：容器列表（Type / Container No. / Status / Date / Place of Activity），每行有 Details 按钮
//      （JSF id 形如 tracing_by_booking_f:hl27:hl53；CSS 选择器里冒号需转义）。
//   4) 详情页：Container Information（Type/Description/Dimension/Tare/Max Payload）
//      + Last Movement + 事件表（Status / Place of Activity / Date / Time / Transport / Voyage No.）。
//      ★ 站方口径：事件「粗体 = 实际(ACTUAL)；非粗体 = 计划(EXPECTED)；空日期 = 待更新（undated）」。
//   5) 否定态：'DOCUMENT does not exist. (Format : HLCUHAM030712345)'（该票无记录）——如实转达，
//      别和"被拦"混（errorKind: not-found vs blocked）。
//
// 环境变量：SSH_HAPAG_MODE = auto（默认）| headless | headed
// 输出统一结构（与 maersk/msc/zim 对齐，供 normalize.mjs 消费）：
//   { ok, number, carrier:'hapag', kind, docNum, origin, destination, lastUpdate, status,
//     current, eta, containers:[{ num, size, desc, dim, tare, payload, lastMovement,
//       events:[{time,activity,city,vessel,voyage,timeType,isCurrent}], undatedEvents }], steps, mode, raw }

import fs from 'node:fs';
import path from 'node:path';
import { launch, launchHeadedQuiet, sleep, EVIDENCE_DIR } from '../browser.mjs';

// 10-15 爹地拍板：本家整次追踪的硬截止放宽到 400s（默认公式 timeoutMs×4=240s 常态撞线）。
// 依据：CF 双模（无头→挑战→有头过盾→刷新凭证）流程实测 137s-480s+（Mac 137.6s 成功样本、
// Windows 连续多次 >240s），这是站侧反爬流程的固有耗时，不是卡死。
export const deadlineMs = 400000;

export const BOOKING_URL = 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution-legacy.html';
export const FIELD = { booking: 'tracing_by_booking_f:hl12', bl: 'tracing_by_booking_f:hl16', find: 'tracing_by_booking_f:hl18' };

const cssEscapeId = (id) => '#' + String(id).replace(/:/g, '\\:');
const normNum = (n) => String(n || '').trim().toUpperCase().replace(/\s+/g, '');

/** 提单号形态：HLCU + 12（16 位）→ 'bl'；8 位 → 'booking'；其余按长度猜。 */
export function guessKind(number) {
  const n = normNum(number);
  if (/^HLCU[A-Z0-9]{12}$/.test(n)) return 'bl';
  if (n.length === 8) return 'booking';
  return n.length >= 12 ? 'bl' : 'booking';
}

/** 页面状态探针：result / notfound / challenge / maintenance / loading */
async function probeState(page) {
  return page.evaluate(() => {
    const t = document.body ? document.body.innerText || '' : '';
    const title = document.title || '';
    if (/Security Check|Interactive Challenge|Just a moment/i.test(title + t.slice(0, 400))) return { kind: 'challenge' };
    if (/Container No\./.test(t) && /Status/.test(t)) return { kind: 'result' };
    if (/DOCUMENT does not exist|Tracking information could not be found/i.test(t)) {
      return { kind: 'notfound', msg: (t.match(/DOCUMENT does not exist[^\n]*/) || ['Tracking information could not be found'])[0] };
    }
    if (/short maintenance|currently not available/i.test(t)) return { kind: 'maintenance' };
    return { kind: 'loading', len: t.length };
  }).catch(() => ({ kind: 'loading', len: -1 }));
}

async function waitState(page, stopKinds, budgetMs) {
  const t0 = Date.now();
  let last = { kind: 'loading' };
  while (Date.now() - t0 < budgetMs) {
    await sleep(2500);
    last = await probeState(page);
    if (stopKinds.includes(last.kind)) return last;
  }
  return { ...last, timedOut: true };
}

/** 结果列表解析（容器行 + Details 按钮 id） */
const parseList = (page) => page.evaluate(() => {
  const tbl = [...document.querySelectorAll('table')].find((t) => /container no\./i.test((t.innerText || '').slice(0, 500)));
  if (!tbl) return [];
  const out = [];
  for (const tr of [...tbl.querySelectorAll('tr')]) {
    const cells = [...tr.querySelectorAll('td,th')];
    const texts = cells.map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim());
    const btn = [...tr.querySelectorAll('button')].find((b) => /detail/i.test(b.innerText || ''));
    const box = texts.find((x) => /^[A-Z]{4}\s?\d{7}$/.test(x));
    if (!box) continue;                                   // 只收含箱号的行（表头/按钮行不要）
    const prev = out.find((r) => r.cells.includes(box));
    if (prev) { if (!prev.detailsBtnId && btn) prev.detailsBtnId = btn.id; continue; }  // 同箱多行去重，优先带有按钮的
    out.push({ cells: texts, detailsBtnId: btn ? btn.id : null });
  }
  return out;
}).catch(() => []);

/** 详情页解析（容器信息 + Last Movement + 事件表，含粗体=实际判定） */
const parseDetail = (page) => page.evaluate(() => {
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const kv = {};
  for (const tr of document.querySelectorAll('tr')) {
    const cs = [...tr.querySelectorAll('td,th')].map((c) => norm(c.innerText));
    if (cs.length === 2 && cs[0] && cs[1] && cs[0].length < 40) kv[cs[0]] = cs[1];
  }
  const t = document.body.innerText || '';
  const lm = t.match(/Last Movement[\s\S]{0,240}?container was ([^\n]+)/i);
  const lastMovement = lm ? norm(lm[1]) : '';
  const events = [];
  const evTbl = [...document.querySelectorAll('table')].find((tbl) => {
    const h = (tbl.innerText || '').slice(0, 700);
    return /place of activity/i.test(h) && /voyage/i.test(h);
  });
  if (evTbl) {
    for (const tr of [...evTbl.querySelectorAll('tr')]) {
      const cells = [...tr.querySelectorAll('td,th')];
      const texts = cells.map((c) => norm(c.innerText));
      if (!texts.filter(Boolean).length) continue;
      if (cells.length < 4) continue;                                  // 布局行只有 1-2 列
      if (/place of activity|voyage no/i.test(texts.join(' ').slice(0, 80))) continue;  // 表头
      const dcol = (texts[2] || '').trim();
      if (dcol && !/^\d{4}-\d{2}-\d{2}$/.test(dcol)) continue;         // 日期列不合法 → 非事件行
      if (!texts[0] || texts[0].length > 40 || /^(type|description|dimension|tare|max|container information|last movement)/i.test(texts[0])) continue;
      const bold = cells.some((c) => {
        const b = c.querySelector('b, strong');
        if (b && norm(b.innerText)) return true;
        const fw = getComputedStyle(c).fontWeight;
        return fw === 'bold' || Number(fw) >= 600;
      });
      events.push({
        activity: texts[0] || '', place: texts[1] || '', date: texts[2] || '', time: texts[3] || '',
        transport: texts[4] || '', voyage: texts[5] || '', bold,
      });
    }
  }
  return { kv, lastMovement, events };
}).catch(() => ({ kv: {}, lastMovement: '', events: [] }));

const detailReady = (page) => page.evaluate(() => {
  const t = document.body.innerText || '';
  return { ready: /Container Information/i.test(t) || (/Place of Activity/i.test(t) && /Voyage/i.test(t)) };
}).catch(() => ({ ready: false }));

/** 完整流程（在给定 ctx 上跑；ctx 生命周期由调用方管理）。 */
async function runFlow(ctx, { num, mode, timeoutMs }) {
  const page = ctx.pages().find((p) => !p.isClosed()) || (await ctx.newPage());
  page.setDefaultTimeout(20000);
  const url = `${BOOKING_URL}?blno=${encodeURIComponent(num)}`;
  const steps = [];
  const t0 = Date.now();

  const save = (suffix, text) => {
    try {
      const f = path.join(EVIDENCE_DIR, `hapag-track-${Date.now()}-${suffix}`);
      fs.writeFileSync(f, text);
      return f;
    } catch { return null; }
  };

  try {
    // 阶段1：过盾 + 拿结果（最多 3 轮重试）
    let st = null;
    for (let round = 1; round <= 3; round++) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.min(timeoutMs, 60000) })
        .catch((e) => steps.push('goto:' + String(e).slice(0, 80)));
      st = await waitState(page, ['result', 'notfound'], round === 1 ? 160000 : 120000);
      steps.push(`round${round}=${st.kind}${st.timedOut ? '(timeout)' : ''}`);
      if (st.kind === 'result' || st.kind === 'notfound') break;
      await sleep(3000);
    }

    if (!st || st.kind === 'notfound') {
      return {
        ok: false, number: num, carrier: 'hapag', kind: guessKind(num), errorKind: 'not-found',
        error: (st && st.msg) || 'Hapag: DOCUMENT does not exist（该号在 Hapag 系统无记录）', steps, mode,
      };
    }
    if (st.kind !== 'result') {
      return {
        ok: false, number: num, carrier: 'hapag', kind: guessKind(num), errorKind: 'blocked',
        challenge: true,
        error: `Hapag 追踪页 CF 挑战未通过（mode=${mode}，${Math.round((Date.now() - t0) / 1000)}s）`,
        steps, mode,
      };
    }

    // 阶段2：容器列表
    const rows = await parseList(page);
    const listText = await page.evaluate(() => (document.body.innerText || '').slice(0, 6000)).catch(() => '');
    save('list.txt', listText);
    const containers = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const box = (r.cells || []).find((x) => /^[A-Z]{4}\s?\d{7}$/.test(x)) || '';
      const type = (r.cells || []).find((x) => /^\d{2}[A-Z]{2,3}$/.test(x)) || '';
      const rec = {
        num: box.replace(/\s/g, ''), size: type, type,
        status: '', place: '', desc: '', dim: '', tare: '', payload: '', lastMovement: '',
        events: [], undatedEvents: [],
      };
      const nonEmpty = (r.cells || []).filter(Boolean);
      if (nonEmpty.length >= 3) { rec.status = nonEmpty[nonEmpty.length - 3] || ''; rec.place = nonEmpty[nonEmpty.length - 1] || ''; }

      if (r.detailsBtnId && i < 6) {     // 10-14 提升：详情抓前 6 箱（普通票 1-4 箱全覆盖；>6 箱的极端票其余仅列号，防单票拖爆）
        let detailed = false;
        for (let attempt = 1; attempt <= 3 && !detailed; attempt++) {
          if (attempt > 1) {
            // 挑战可能在上一轮把页面顶掉——回到结果页再点（同一 JSF 按钮 id 重新加载后不变）
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.min(timeoutMs, 60000) }).catch(() => {});
            await waitState(page, ['result'], 90000);
            await sleep(1000);
          }
          await page.click(cssEscapeId(r.detailsBtnId), { timeout: 15000 })
            .catch((e) => steps.push('details-click:' + String(e).slice(0, 60)));
          let chw = 0;
          for (let w = 0; w < 48; w++) {          // 2 分钟预算（CF 挑战可自愈，不立即放弃）
            await sleep(2500);
            const dr = await detailReady(page);
            if (dr.ready) { detailed = true; break; }
            if (w % 4 === 3) {
              const ps = await probeState(page);
              if (ps.kind === 'challenge') { chw++; if (chw === 1) steps.push(`details-challenge@w${w}`); }
              if (chw >= 10) break;               // ~100s 挑战仍未过 → 回列表重试
            }
          }
          if (!detailed) steps.push(`details-retry${attempt}`);
        }
        if (detailed) {
          const d = await parseDetail(page);
          const dtext = await page.evaluate(() => (document.body.innerText || '').slice(0, 8000)).catch(() => '');
          save('detail.txt', dtext);
          rec.desc = d.kv['Description'] || '';
          rec.dim = d.kv['Dimension'] || '';
          rec.tare = d.kv['Tare (kg)'] || '';
          rec.payload = d.kv['Max. Payload (kg)'] || '';
          rec.lastMovement = d.lastMovement;
          if (d.kv['Type']) rec.type = d.kv['Type'];
          for (const e of d.events) {
            const time = e.date && e.time ? `${e.date}T${e.time}` : (e.date || null);
            const ev = {
              time,
              activity: e.activity,
              city: e.place,
              vessel: e.transport,
              voyage: e.voyage,
              timeType: e.bold ? 'ACTUAL' : 'EXPECTED',
              kind: e.bold ? 'ACTUAL' : 'EXPECTED',
              isCurrent: false,
            };
            if (time) rec.events.push(ev); else rec.undatedEvents.push(ev);
          }
          rec.events.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
          if (rec.events.length) rec.events[rec.events.length - 1].isCurrent = true;
        }
      }
      containers.push(rec);
    }

    // 阶段3：组装统一结构
    const allEvs = containers.flatMap((c) => c.events);
    allEvs.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    const lastEvent = allEvs[allEvs.length - 1] || null;
    const cur = [...allEvs].reverse().find((e) => e.timeType === 'ACTUAL') || null;
    const firstEv = allEvs[0] || null;
    const planned = allEvs.find((e) => e.timeType === 'EXPECTED');
    const destCity = lastEvent ? lastEvent.city : '';

    return {
      ok: true, number: num, carrier: 'hapag', kind: guessKind(num),
      docNum: num,
      origin: firstEv ? firstEv.city : '',
      destination: destCity,
      lastUpdate: cur ? cur.time : (lastEvent ? lastEvent.time : null),
      siteStatus: cur ? cur.activity : (lastEvent ? lastEvent.activity : ''),
      status: cur ? cur.activity : '',
      current: cur ? { time: cur.time, activity: cur.activity, city: cur.city, vessel: cur.vessel, voyage: cur.voyage, timeType: 'ACTUAL' } : null,
      lastEvent,
      eta: planned ? { time: planned.time, city: planned.city, terminal: '', activity: planned.activity, fromSite: true } : null,
      containers,
      steps, mode, ms: Date.now() - t0,
      raw: { url, listRows: rows, containers },
    };
  } catch (e) {
    return { ok: false, number: num, carrier: 'hapag', kind: guessKind(num), error: String(e).slice(0, 250), errorKind: 'exception', steps, mode };
  }
}

/**
 * 查 Hapag 提单/订舱/箱号。模式：SSH_HAPAG_MODE=auto（默认：无头优先，被拦自动升级有头）| headless | headed
 * @param {string} number
 * @param {{timeoutMs?:number, ctx?:any, mode?:string}} opt
 */
export async function trackHapag(number, opt = {}) {
  const { timeoutMs = 240000 } = opt;
  const num = normNum(number);
  const modeEnv = String(opt.mode || process.env.SSH_HAPAG_MODE || 'auto').toLowerCase();

  if (opt.ctx) {
    return runFlow(opt.ctx, { num, mode: 'reused', timeoutMs });
  }

  if (modeEnv === 'headed') {
    const h = await launchHeadedQuiet();
    if (h.mode !== 'headed-minimized') console.error('[hapag] 警告：未进入有头最小化（' + h.mode + '）');
    try {
      return await runFlow(h.ctx, { num, mode: h.mode, timeoutMs });
    } finally {
      await h.ctx.close().catch(() => {});
    }
  }

  // auto / headless：先无头（profile 里有 cf_clearance 时秒过）
  const hc = await launch({ headless: true });
  let res;
  try {
    res = await runFlow(hc, { num, mode: 'headless', timeoutMs });
  } finally {
    await hc.close().catch(() => {});
  }
  if (res.ok || res.errorKind === 'not-found' || modeEnv === 'headless') return res;

  // 无头被拦（凭证缺失/过期）→ 有头真指纹兜底过盾并刷新 cf_clearance（下次无头即可复用）
  const hh = await launchHeadedQuiet();
  if (hh.mode !== 'headed-minimized') console.error('[hapag] 警告：未进入有头最小化（' + hh.mode + '）');
  try {
    const r2 = await runFlow(hh.ctx, { num, mode: hh.mode, timeoutMs });
    return { ...r2, fallback: 'headless-blocked' };
  } finally {
    await hh.ctx.close().catch(() => {});
  }
}

export default { trackHapag, guessKind, BOOKING_URL };
