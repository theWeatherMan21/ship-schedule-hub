// CMA CGM 达飞 提单/订舱/箱号追踪 —— 2026-10-12（婉宜；真单实测 + DataDome 应对）
//
// 通路（2026-10-12 真单 NGP3170431 实测通过一次，形态如下）：
//   1) 入口：GET https://www.cma-cgm.com/eBusiness/Tracking（正常返回表单页）
//   2) 表单：input#Reference（提单/订舱/柜号均可）+ button#btnTracking（提交）
//   3) 提交：POST https://www.cma-cgm.com/ebusiness/tracking/search → 200 → 同页渲染结果
//   4) 结果块（实测文本）：
//        "Tracking details" [Booking <号>] [New search]
//        "CMAU2081132 22G1 (20ST) GATE IN EMPTY AT DEPOT ISTANBUL, AMBARLI PORT E. SIDE Thu. 05-MAR-2026 14:41 PM [Display Details]"
//      （每柜一行：柜号 箱型码 (尺寸码) 状态+地点 日期 时间 + Display Details 展开明细）
//   5) 否定态："Your shipment was not found, please modify your search"
//
// ★ DataDome 风控（实测）：官网挂了 DataDome；**偶发/密集访问会被拦**（页面无表单或提交无结果）。
//   本轮实测：首次访问通过并出真数据；连续访问后进入拦截状态（换 IP / 干净 profile 亦受制，
//   系访问频度累积所致，非本程序缺陷）。策略：**低频** + 被拦时**冷却重试**（默认 25s×2 次），
//   仍失败则如实返回 errorKind:'blocked'（不伪装成功）。
//
// 输出：统一结构（与 zim/yangming 对齐，供 normalize.mjs 归一化）
//   { ok, number, carrier:'cma', docNum, searchType, origin, destination,
//     siteStatus, status, lastUpdate, current, containers:[{num,size,type,status,lastUpdate,events}], steps, attempts, raw }

import { launch, sleep } from '../browser.mjs';

export const TRACK_URL = 'https://www.cma-cgm.com/eBusiness/Tracking';
const MONTHS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

const s = (x) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim();

/** 'Thu. 05-MAR-2026 14:41 PM' → '2026-03-05T14:41'（12 小时制换算 24 小时） */
export function cmaDate(d, hms, ap) {
  const m = /^(\d{2})-([A-Z]{3})-(\d{4})$/.exec(String(d || '').trim().toUpperCase());
  if (!m || !MONTHS[m[2]]) return null;
  let hh = parseInt(String(hms || '').slice(0, 2), 10);
  const mi = String(hms || '').slice(3, 5) || '00';
  const ap2 = String(ap || '').toUpperCase();
  if (ap2 === 'PM' && hh < 12) hh += 12;
  if (ap2 === 'AM' && hh === 12) hh = 0;
  return `${m[3]}-${MONTHS[m[2]]}-${m[1]}T${String(hh).padStart(2, '0')}:${mi}`;
}

/** 拆「状态 + 地点」：在 DEPOT/TERMINAL/PORT/… 之后开始是地点（实测形态） */
export function splitStatusPlace(seg) {
  const t = s(seg);
  const m = /^(.*?\b(?:DEPOT|TERMINAL|PORT|YARD|VESSEL|WAREHOUSE|PLANT|STATION|RAIL|BORDER))\s+([A-Z][A-Z0-9\s,.\-()/'&]+)$/i.exec(t);
  if (m) return { status: s(m[1]), place: s(m[2]) };
  // 退化：全串当状态（地点留空，不猜）
  return { status: t, place: '' };
}

/** 纯解析：结果页文本 → 统一结构（导出便于离线单测，不依赖网络） */
export function parseCmaText(text, number) {
  const out = { ok: false, number, carrier: 'cma', error: null, errorKind: null };
  const t = String(text || '').replace(/\s+/g, ' ');
  if (!t) { out.error = 'CMA 页面为空（可能被 DataDome 拦截）'; out.errorKind = 'blocked'; return out; }
  if (/was not found|no information|not available/i.test(t) && !/Tracking details/i.test(t)) {
    out.error = 'CMA 未找到该号（请核对单号）';
    out.errorKind = 'not-found';
    return out;
  }
  if (!/Tracking details/i.test(t)) {
    out.error = 'CMA 结果区未出现（页面形态异常或被拦）';
    out.errorKind = 'blocked';
    return out;
  }

  // 单据类型（Booking / Bill of Lading / Container）
  const docType = (/Tracking details\s*(Booking|Bill of Lading|B\/L|Container)\s*([A-Z0-9\-]+)?/i.exec(t) || [])[1] || '';

  // 柜行：柜号 箱型 (尺寸码) 状态+地点 星期. 日-月-年 时:分 AM/PM
  const re = /([A-Z]{4}\d{7})\s+([0-9A-Z]{4})\s+\(([^)]{2,10})\)\s+(.+?)\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.\s+(\d{2}-[A-Z]{3}-\d{4})\s+(\d{2}:\d{2})\s*(AM|PM)?/gi;
  const byNum = new Map();
  let m;
  while ((m = re.exec(t))) {
    const num = m[1].toUpperCase();
    const time = cmaDate(m[6], m[7], m[8]);
    const { status, place } = splitStatusPlace(m[4]);
    if (!byNum.has(num)) {
      byNum.set(num, { num, size: m[2], type: `(${m[3]})`, iso: '', status, lastUpdate: time, place, events: [] });
    }
    const c = byNum.get(num);
    if (time && !c.events.some((e) => e.time === time)) {
      c.events.push({ time, activity: status, city: place, terminal: '', vessel: '', voyage: '', timeType: 'ACTUAL', kind: 'ACTUAL', isCurrent: false });
    }
    if (!c.lastUpdate && time) c.lastUpdate = time;
  }
  const containers = [...byNum.values()];
  if (!containers.length) {
    out.error = 'CMA 结果区无柜级数据（解析未命中，可能页面改版）';
    out.errorKind = 'unexpected-response';
    return out;
  }
  for (const c of containers) {
    c.events.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    if (c.events.length) c.events[c.events.length - 1].isCurrent = true;
  }
  const all = containers.flatMap((c) => c.events).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  const cur = all.length ? all[all.length - 1] : null;

  return {
    ok: true, number, carrier: 'cma',
    docNum: s((t.match(/Tracking details\s*(?:Booking|Bill of Lading|B\/L|Container)\s*([A-Z0-9\-]+)/i) || [])[1] || number),
    searchType: docType ? docType.toUpperCase() : 'REF',
    origin: '', destination: '',   // 列表级结果不含航线（明细在 Display Details，下一版补）
    siteStatus: cur ? cur.activity : '',
    status: cur ? cur.activity : '',
    lastUpdate: cur ? cur.time : null,
    current: cur,
    lastEvent: cur,
    eta: null,
    containers,
    raw: { text: t.slice(0, 4000) },
  };
}

/** 页面是否是"未出表单"的拦截态 */
const probeForm = (page) => page.evaluate(() => ({
  hasRef: !!document.querySelector('#Reference'),
  hasBtn: !!document.querySelector('#btnTracking') || !!document.querySelector('button[name="search"]'),
})).catch(() => ({ hasRef: false, hasBtn: false }));

const probeResult = (page) => page.evaluate(() => {
  const t = document.body ? document.body.innerText : '';
  return {
    details: /Tracking details/i.test(t),
    notfound: /was not found|no information/i.test(t),
    len: t.length,
  };
}).catch(() => ({ details: false, notfound: false, len: 0 }));

/**
 * 查 CMA 提单/订舱/柜号。
 * @param {string} number
 * @param {{timeoutMs?:number, ctx?:any, cooldownMs?:number, retries?:number}} opt
 */
export async function trackCma(number, opt = {}) {
  const { timeoutMs = 90000, cooldownMs = 25000, retries = 2 } = opt;
  const num = s(number).toUpperCase();
  const own = !opt.ctx;
  const c = opt.ctx || (await launch({ headless: true }));
  const page = c.pages()[0] || (await c.newPage());
  page.setDefaultTimeout(20000);
  const steps = [];
  try {
    let lastReason = '';
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      await page.goto(TRACK_URL, { waitUntil: 'domcontentloaded', timeout: Math.min(timeoutMs, 60000) }).catch(() => {});
      // 等表单（被拦时不会出现）
      let form = { hasRef: false, hasBtn: false };
      for (let w = 0; w < 12; w++) {
        await sleep(2500);
        form = await probeForm(page);
        if (form.hasRef) break;
      }
      steps.push(`a${attempt}:form=${form.hasRef}`);
      if (!form.hasRef) { lastReason = '表单未出现（DataDome 拦截或改版）'; }
      else {
        await page.fill('#Reference', num).catch(() => {});
        await sleep(800);
        await page.click('#btnTracking', { timeout: 15000 }).catch(() => {});
        let done = null;
        for (let w = 0; w < 16; w++) {
          await sleep(3000);
          const r = await probeResult(page);
          if (r.details || r.notfound) { done = r; break; }
        }
        steps.push(`a${attempt}:result=${done ? (done.details ? 'details' : 'notfound') : 'timeout'}`);
        if (done) {
          const text = await page.evaluate(() => (document.body ? document.body.innerText : '').slice(0, 12000)).catch(() => '');
          const parsed = parseCmaText(text, num);
          parsed.steps = steps;
          parsed.attempts = attempt;
          return parsed;
        }
        lastReason = '提交后结果区未出现（DataDome 拦截或超时）';
      }
      if (attempt <= retries) {
        steps.push(`cooldown:${cooldownMs}ms`);
        await sleep(cooldownMs);
      }
    }
    return {
      ok: false, number: num, carrier: 'cma', errorKind: 'blocked',
      error: `CMA 追踪被 DataDome 拦截（${lastReason}）——官网对高频访问限流，请隔几分钟再试`,
      steps,
    };
  } catch (e) {
    return { ok: false, number: num, carrier: 'cma', error: String(e).slice(0, 200), errorKind: 'exception', steps };
  } finally {
    if (own) await c.close().catch(() => {});
  }
}

export default { trackCma, parseCmaText, cmaDate, splitStatusPlace };
