// OOCL 东方海外 提单 / 订舱 / 箱号追踪 —— 2026-10-29（婉宜，真单实测打通）
//
// ★ 为什么以前「判死」：OOCL 的 PC 版追踪页是 CargoSmart 的 SPA + 图形验证码，无头浏览器过不去，
//   于是被记成「免费路 0 成功率」。10-29 拿真单复测，发现它自己有个**移动版匿名查询页**：
//     GET  https://pbservice.moc.oocl.com/party/cargotracking/mobile/mobile_ct_search.jsf?ANONYMOUS_BEHAVIOR=BUILD_UP&ENTRY=MCC&ENTRY_TYPE=OOCL
//   只要「先 GET 拿 JSF 表单 + JSESSIONID，再把单号 POST 回去」，就直接返回整页 HTML 结果：
//   **无验证码、无登录、无浏览器、无 Cookie 授权**，一次查询 ~0.9-1.6s（真单实测 2026-10-29）。
//   所以本模块**不启 Playwright**：纯 fetch，天然不碰 TEMP/mkdtemp（W-1 那条病根对它不适用）。
//
//   字段来源（真单实测的 span id，站方改版时先看这里）：
//     · 表头文字：'B/L Vessel Voyage: <船名> <航次>'、'Bill of Lading Number: <号> (<状态>)'、
//       'Booking Number: <号> (<状态>)'、'Cargo Release Status: …'、'Advanced Manifest: …'、
//       'Original B/L Received by Carrier: …'、'Inbound Customs Clearance Status: …'
//     · 箱列表：onclick="selectOneContainerToShow('<箱号>')" 起的行，配
//       form:cntSizeType{i} / form:quantity{i} / form:gross{i} / form:eventLocation{i} /
//       form:eventDate{i} / form:finalDestinationCopy{i} / form:arrivalDate{i}
//     · 设备动态（事件）：form:eventLocationDetail{i} / form:eventDateDetail{i}，
//       行内第 1 列=事件名、第 2 列=Facility、第 4 列=Mode
//     · 查无此号：页面里就是一句 "No records were found."
//
//   多箱提单：结果页里的「设备动态」只给**当前选中箱**的事件（真单实测），所以本模块对每个箱号
//   单独再查一次（箱号模式），把每箱事件收齐；上限 6 箱（站方单页最多显示 10 箱，够用又不拖时间）。
//
//   纯解析函数 parseOoclResult 单独导出 —— 单测喂脱敏 HTML 夹具，不联网也能回归（见 tests/oocl-parse.mjs）。

import { realChromeUA } from '../lib/ua.mjs';

export const BASE = 'https://pbservice.moc.oocl.com/party/cargotracking/mobile/mobile_ct_search.jsf';
const QUERY = '?ANONYMOUS_BEHAVIOR=BUILD_UP&ENTRY=MCC&ENTRY_TYPE=OOCL';
const FORM_URL = BASE + QUERY;
/** 三次请求（表单 + 结果 + 多箱补查）预留充足余量；单次请求 1-2s 实测 */
export const deadlineMs = 90000;
const MAX_CONTAINER_LOOKUPS = 6;

const s = (x) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim();

/** HTML 实体解码 + 去标签（&#160; 在站方页面里当空格用） */
export function htmlToText(html) {
  return s(String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** 站方时间 '21 Oct 2026, 15:49 SGT' / '13 Nov 2026, 14:00 TRST (Estimated)' → { time, tz, estimated }
 *  time 统一成 'YYYY-MM-DDTHH:MM'（无时分就给 'YYYY-MM-DD'），与 YM/HMM 等适配器同形。 */
export function parseOoclTime(raw) {
  const t = s(raw);
  if (!t) return { time: null, tz: '', estimated: false };
  const estimated = /\(?\s*estimated\s*\)?/i.test(t);
  const m = /(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})(?:[,\s]+(\d{1,2}):(\d{2}))?/.exec(t);
  if (!m) return { time: null, tz: '', estimated };
  const mo = MONTHS[m[2].toLowerCase()];
  if (!mo) return { time: null, tz: '', estimated };
  const date = `${m[3]}-${String(mo).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
  const time = m[4] ? `${date}T${String(+m[4]).padStart(2, '0')}:${m[5]}` : date;
  // 时区代号（SGT/CCT/TRST…）：紧跟在时间/日期后面的那一串大写字母
  const tz = (/(?:,\s*\d{1,2}:\d{2}\s+|\d{4}\s+)([A-Z]{2,4})\b/.exec(t) || [])[1] || '';
  return { time, tz, estimated };
}

/** 取 <span id="form:xxxN">…</span> 的文本 */
function spanById(html, id) {
  const re = new RegExp(`<span[^>]*id="form:${id}"[^>]*>([\\s\\S]*?)</span>`, 'i');
  const m = re.exec(html);
  return m ? htmlToText(m[1]) : '';
}

/** 结果页是否为「查无此号」 */
export function isNotFoundPage(html) {
  return /No records were found/i.test(String(html || ''));
}

/** 被站方限流：CargoSmart 的 QF8 文案。命中时**绝不能重试**（越试越久），只能如实报「稍后再查」。
 *  真单实测 2026-10-29：连查 5-6 次后整站返回 142 字节的 QF8 文案。 */
export function isThrottledPage(html) {
  return /\[QF8\]|access too frequent|too frequent/i.test(String(html || ''));
}

/** 是不是真的结果页（站方结果页的标记是表头里的 "Search Result - Bill of Lading Number …"） */
export function isResultPage(html) {
  return /Search Result/i.test(String(html || ''));
}

/**
 * 纯解析：结果页 HTML → 统一结构（离线可测；不联网）。
 * @param {string} html  站方返回的结果页
 * @param {{number:string, mode?:'bl'|'bkg'|'cntr'}} opts
 */
export function parseOoclResult(html, { number = '', mode = 'bl' } = {}) {
  const page = String(html || '');
  const out = { ok: false, number, carrier: 'oocl', error: null, errorKind: null };
  if (isThrottledPage(page)) {
    out.error = 'OOCL 站方限流（QF8：访问过于频繁）——过几分钟再查，不要连续重试';
    out.errorKind = 'throttled';
    return out;
  }
  if (isNotFoundPage(page)) {
    out.error = 'OOCL 官网查无此号（提单号需带 OOLU/OOCL 前缀，订舱号保留约 1 年）';
    out.errorKind = 'not-found';
    return out;
  }
  if (!isResultPage(page)) {
    out.error = 'OOCL 页面结构与预期不符（改版或被拦）';
    out.errorKind = 'blocked';
    return out;
  }

  const text = htmlToText(page);

  // —— 表头：单号 / 船名航次 / 各种放行状态 ——
  const pick = (re) => { const m = re.exec(text); return m ? s(m[1]) : ''; };
  const vesselVoyage = pick(/B\/L Vessel Voyage:\s*([^\n]{0,80}?)(?:\s+Bill of Lading Number:|\s+Booking Number:|$)/i);
  const blLine = pick(/Bill of Lading Number:\s*(\d{6,20}\s*\([^)]{0,40}\))/i);
  const bkgLine = pick(/Booking Number:\s*(\d{6,20}\s*\([^)]{0,40}\))/i);
  const docNum = (/(\d{6,20})/.exec(blLine) || [])[1] || number;
  const vesselParts = /^(.+?)\s+([0-9A-Z]{2,6}[A-Z]?)$/.exec(vesselVoyage) || [];
  const vessel = s(vesselParts[1] || vesselVoyage);
  const voyage = s(vesselParts[2] || '');
  const containerTypes = pick(/Total Containers:\s*([^\n]{0,80}?)(?:\s+Total Quantity:|$)/i);

  // 表头那几个「状态」字段：站方是纯文本连排（A 值 B 标签 C 值…），
  // 只截到下一个已知标签 —— 否则 "Not Released" 会拖上后面半句（10-29 实测）。
  const STATUS_RE = /^(?:\s*Payment Status[^:]*:)?\s*([\s\S]{0,60}?)(?=\s+(?:Advanced Manifest|Inbound Customs Clearance Status|Cargo Release Status|Original B\/L Received by Carrier|Containers|Detention|Total Quantity|Total Containers)\b|\s*$)/;
  const statusOf = (label) => {
    const i = text.indexOf(label);
    if (i < 0) return '';
    const rest = text.slice(i + label.length);
    const after = rest.replace(/^\s*:/, '');
    return s((STATUS_RE.exec(after) || [])[1] || '');
  };

  // —— 箱列表（onclick=selectOneContainerToShow('<箱号>') 的行）——
  const containers = [];
  const seen = new Set();
  for (const m of page.matchAll(/selectOneContainerToShow\('([^']+)'\)/g)) {
    const num = s(m[1]).toUpperCase();
    if (!num || seen.has(num)) continue;
    seen.add(num);
    const i = containers.length;
    containers.push({
      num,
      size: spanById(page, `cntSizeType${i}`),
      quantity: spanById(page, `quantity${i}`),
      gross: spanById(page, `gross${i}`),
      status: '',   // 由事件补齐（最新 ACTUAL）
      lastUpdate: null,
      etaFinal: parseOoclTime(spanById(page, `arrivalDate${i}`)).time,
      finalDestination: spanById(page, `finalDestinationCopy${i}`),
      events: [],
    });
  }

  // —— 设备动态（事件表）：把每个 <tr> 切开，认带 eventLocationDetail 的行 ——
  const rows = page.split(/<tr\b/i).slice(1);
  for (const row of rows) {
    if (!/eventLocationDetail\d+/i.test(row)) continue;
    const tds = row.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || [];
    if (tds.length < 5) continue;
    const activity = htmlToText(tds[0]);
    const facility = htmlToText(tds[1]);
    const locTxt = htmlToText(tds[2]);
    const transport = htmlToText(tds[3]);
    const parsed = parseOoclTime(htmlToText(tds[4]));
    if (!activity && !parsed.time) continue;
    const events = out.events || (out.events = []);
    events.push({
      time: parsed.time,
      rawTime: s(htmlToText(tds[4])),
      tz: parsed.tz,
      activity,
      facility,
      city: locTxt,
      transport,
      vessel: '', voyage: '',
      // 站方事件表不带 ACTUAL/EXPECTED 标记 → 只按「时间是否已过」判（口径与其它适配器一致：不改写站点值）
      timeType: parsed.estimated ? 'EXPECTED' : (parsed.time && parsed.time.slice(0, 10) > new Date().toISOString().slice(0, 10) ? 'EXPECTED' : 'ACTUAL'),
    });
  }

  if (!containers.length && !(out.events || []).length && !docNum) {
    out.error = 'OOCL 结果页解析不出任何内容（改版？）';
    out.errorKind = 'parse';
    return out;
  }

  const events = out.events || [];
  delete out.events;
  events.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  if (events.length) events[events.length - 1].isCurrent = true;

  // 最新事件回填到单箱（多箱时只在箱级事件补查后才有意义，这里给首箱兜底）
  for (const c of containers) {
    const own = events.filter((e) => !e.container || e.container === c.num);
    if (!own.length) continue;
    const last = own[own.length - 1];
    c.status = last.activity;
    c.lastUpdate = last.time;
  }

  const destination = spanById(page, 'finalDestination0') || containers[0]?.finalDestination || '';
  const siteStatus = statusOf('Cargo Release Status');
  // ETA：站方在箱行给了「最终目的地预计到达」→ 直接当 eta 交给归一化层
  // （10-29 真单实测：事件表里只有已发生的 ACTUAL，预计到港只在箱行里，不补就等于丢 ETA）
  const etaFinal = containers.map((c) => c.etaFinal).find(Boolean) || null;
  return {
    ok: true,
    number,
    carrier: 'oocl',
    searchType: mode === 'cntr' ? 'CONTAINER' : mode === 'bkg' ? 'BOOKING' : 'BL',
    docNum,
    blStatus: s(blLine).replace(/^\d+\s*/, '') || '',
    bkgStatus: s(bkgLine).replace(/^\d+\s*/, '') || '',
    booking: (/\d{6,20}/.exec(bkgLine) || [])[1] || '',
    vessel, voyage,
    siteStatus,
    advancedManifest: statusOf('Advanced Manifest'),
    customsClearance: statusOf('Inbound Customs Clearance Status'),
    originalBl: statusOf('Original B/L Received by Carrier'),
    eta: etaFinal ? { time: etaFinal, city: destination, terminal: '', activity: 'Estimated arrival', fromSite: true } : null,
    containerSummary: containerTypes,
    origin: spanById(page, 'PORLocation0'),
    destination,
    containers,
    events,
    raw: { status: siteStatus, last_update_time: events.length ? events[events.length - 1].time : null, containers: [] },
  };
}

// ---------------- 网络层（纯 fetch，无浏览器） ----------------

function hiddenFields(html) {
  const out = {};
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/type\s*=\s*["']hidden["']/i.test(tag)) continue;
    const n = /name\s*=\s*["']([^"']*)["']/i.exec(tag);
    const v = /value\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (n) out[n[1]] = v ? v[1] : '';
  }
  return out;
}

const FIELD_OF = { bl: 'form:bl_num', bkg: 'form:bkg_num', cntr: 'form:cntr_num' };
const SUBMIT_OF = { bl: 'form:goToCargoTrackingBL', bkg: 'form:goToCargoTrackingBkg', cntr: 'form:goToCargoTrackingCntr' };

/** 一次「取表单 → POST 单号」，返回结果页 HTML。超时/网络错按项目内兜底重试 1 次。 */
async function queryOnce(value, mode, { timeoutMs = 30000, attempt = 0 } = {}) {
  const ua = realChromeUA();   // 用本机真装 Chrome 的版本号（UA 里的版本要和真机一致，站方会比对）
  const deadline = AbortSignal.timeout(Math.max(5000, timeoutMs));
  try {
    const g = await fetch(FORM_URL, { headers: { 'user-agent': ua, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' }, signal: deadline });
    if (!g.ok) throw new Error(`HTTP ${g.status}`);
    const cookie = (g.headers.getSetCookie ? g.headers.getSetCookie() : []).map((c) => String(c).split(';')[0]).filter(Boolean).join('; ');
    const html = await g.text();
    // ★ 站方限流（QF8）会把整页换成一段纯文本 → 直接把这页交回解析层报「限流」，
    //   既不要重试（越试越久），也不要误报成「页面改版」。
    if (isThrottledPage(html)) return html;
    const hid = hiddenFields(html);
    if (!hid['jsf_state_64'] && !hid['jsf_tree_64']) throw new Error('拿不到 JSF 表单状态（页面可能改版）');
    const body = new URLSearchParams({ ...hid, [FIELD_OF[mode]]: value, [SUBMIT_OF[mode]]: 'Search' });
    const p = await fetch(FORM_URL, {
      method: 'POST',
      headers: { 'user-agent': ua, 'content-type': 'application/x-www-form-urlencoded', cookie, referer: FORM_URL, accept: 'text/html' },
      body,
      signal: deadline,
    });
    if (!p.ok) throw new Error(`HTTP ${p.status}`);
    return await p.text();
  } catch (e) {
    if (attempt < 1) return queryOnce(value, mode, { timeoutMs, attempt: attempt + 1 });   // 只重试一次（项目内兜底，不动用户网络）
    throw e;
  }
}

/**
 * 追踪入口（registry 约定：导出 track* 函数）。
 * 箱号 → 箱号模式；其它 → 先按提单号查，查不到且长得像纯数字再按订舱号查一次。
 */
export async function trackOocl(number, { timeoutMs = 60000 } = {}) {
  const raw = String(number || '').trim().toUpperCase().replace(/[\s-]/g, '');
  if (!raw) return { ok: false, carrier: 'oocl', number: String(number), error: '单号为空', errorKind: 'bad-args' };
  // 单号形态：箱号 4 字母+7 位；提单 OOLU/OOCL+10 位；纯数字 10 位（站方也收）
  const isCntr = /^[A-Z]{4}\d{7}$/.test(raw);
  const perQuery = Math.max(4000, Math.floor(timeoutMs / 3));

  if (isCntr) {
    const html = await queryOnce(raw, 'cntr', { timeoutMs: perQuery });
    return parseOoclResult(html, { number: raw, mode: 'cntr' });
  }

  let html = await queryOnce(raw, 'bl', { timeoutMs: perQuery });
  let r = parseOoclResult(html, { number: raw, mode: 'bl' });
  if (r.errorKind === 'throttled') return r;   // 限流时不再叠加请求（越试越久）
  // 兜底①：带前缀查不到时，去掉 SCAC 前缀用纯数字再试（站方结果页里显示的正是纯数字）
  if (!r.ok && r.errorKind === 'not-found' && /^[A-Z]{4}(\d{6,14})$/.test(raw)) {
    html = await queryOnce(raw.slice(4), 'bl', { timeoutMs: perQuery });
    r = parseOoclResult(html, { number: raw, mode: 'bl' });
  }
  // 兜底②：纯 8-10 位数字还查不到 → 当订舱号再试一次
  if (!r.ok && r.errorKind === 'not-found' && /^\d{8,10}$/.test(raw)) {
    html = await queryOnce(raw, 'bkg', { timeoutMs: perQuery });
    r = parseOoclResult(html, { number: raw, mode: 'bkg' });
  }
  if (!r.ok) return r;

  // 多箱提单：结果页的设备动态只给当前选中箱 → 逐箱补查（上限 6 箱，按剩余时间收口）
  const budgetEnd = Date.now() + Math.max(4000, timeoutMs);
  if (r.containers.length > 1) {
    for (const c of r.containers.slice(0, MAX_CONTAINER_LOOKUPS)) {
      if (Date.now() > budgetEnd - 2000) break;
      try {
        const h = await queryOnce(c.num, 'cntr', { timeoutMs: Math.max(3000, budgetEnd - Date.now()) });
        const cr = parseOoclResult(h, { number: c.num, mode: 'cntr' });
        if (cr.ok && cr.events.length) {
          c.events = cr.events;
          const last = cr.events[cr.events.length - 1];
          c.status = last.activity;
          c.lastUpdate = last.time;
        }
      } catch { /* 单箱补查失败不影响整票：保留首箱事件 + 箱列表 */ }
    }
    // 合并：首箱事件当作整票时间线，其余箱事件挂到箱上（normalize 只读统一 events）
    const first = r.containers[0];
    if (first && first.events.length) r.events = first.events;
  }
  return r;
}
