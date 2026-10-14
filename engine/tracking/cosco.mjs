// COSCO 提单 / 箱号追踪 —— 2026-10-10 实测打通（真单 COSU6469105960）
//
// 现状与通路（结论先行）：
//   · 页面侧：elines.coscoshipping.com/ebusiness/cargoTracking 这个 SPA 在无头档里会自己跳
//     /ebusiness/error404/（"the webpage fails to load itself"）→ 页面路线不通，**不走页面**。
//   · 接口侧：公共接口家族可**纯 HTTP 直取**（不用浏览器、不用 cookie）：
//       根路径 /ebtracking/public/... ，必须带 `accept: application/json`。
//       ⚠ 路径不在 /ebusiness/ 下：加 /ebusiness 前缀只会拿回 SPA 的 index.html。
//   端点（从 dist/main.95697f.js 的接口表 + chunk 74406（/cargoTracking 视图）调用点逆出）：
//       GET /ebtracking/public/bill/{10位号}              → trackingPath（起讫/船名航次/码头）+ actualShipment（航段）+ 箱列表 + 到手时间
//       GET /ebtracking/public/bill/containers/{10位号}   → 每箱最新动态（label / location / locationDateTime）
//       GET /ebtracking/public/container/eta/{箱号}       → 该箱 ETA
//       GET /ebtracking/public/containers/{箱号}          → 箱号直查（circle status）
//       （/public/container/status/{箱}?billNumber= —— 逐箱"完整历史"对未登录用户返回全空记录：
//         公开视野只到「当前位置 + 最新状态」，别把它当"没历史"或"查无结果"。）
//
// 号码口径（实测，非常关键）：
//   · 提单：接口只认**不含 SCAC 前缀的 10 位数字**。COSU6469105960 → 6469105960。
//     带前缀直接查 bill 会得到 code 200 + message "无数据"（isbillOfLadingExist:false）——
//     看着像"没这票货"，其实是"号码写法不对"，所以这里做前缀剥离。
//   · 箱号：4 字母 + 7 位数字 → 走 /public/containers/。
//
// 输出（与 maersk/hmm/msc/one 对齐的统一结构；containers[].events 是 UI 时间线主来源）：
//   { ok, number, carrier:'cosco', docNum, origin, destination, vessel, voyage, svvd,
//     cargoAvailTime, lastUpdate, status, current, events[...], legs[...],
//     containers:[{ num, size, type, iso, status, lastUpdate, eta, transportation,
//                   events:[{ time, activity, city, terminal, vessel, voyage, timeType, isCurrent }] }],
//     raw:{ bill, containers } }
import fs from 'node:fs';
import https from 'node:https';
import { realChromeUA } from '../lib/ua.mjs';

const BASE = 'https://elines.coscoshipping.com';
// UA 与浏览器实际版本统一（2026-10-14 审阅 P2「UA/指纹三处不一致」；单一来源 engine/lib/ua.mjs）
const UA = () => realChromeUA();

// ---------- HTTP ----------
// GUI/launchd 环境常缺 SSL_CERT_FILE（Clash TUN 等 MITM 代理）→ fetch 报 unable to get local issuer certificate。
// 与 fastpath.mjs 同一套路：证书错时显式带系统 CA 用 node:https 再请求一次。
let caCache;
function systemCa() {
  if (caCache !== undefined) return caCache;
  caCache = null;
  const cands = [
    process.env.SSL_CERT_FILE,
    process.env.NODE_EXTRA_CA_CERTS,
    ...(process.platform === 'win32' ? [] : ['/etc/ssl/cert.pem', '/opt/homebrew/etc/openssl@3/cert.pem']),
    `${process.env.HOME || process.env.USERPROFILE || ''}/.hermes/clash-ca.pem`,
  ].filter(Boolean);
  for (const f of cands) {
    try { const c = fs.readFileSync(f, 'utf8'); if (c.includes('BEGIN CERTIFICATE')) { caCache = c; break; } } catch { /* 下一个 */ }
  }
  return caCache;
}

async function getJSON(url, timeoutMs = 20000) {
  const headers = { 'user-agent': UA(), accept: 'application/json, text/plain, */*' };
  const parse = (text, status) => {
    let json = null; try { json = JSON.parse(text); } catch { /* 非 JSON = 路由被 SPA 兜住/被拦 */ }
    return { status, text, json, error: json ? null : `non-JSON response (HTTP ${status}) —— 路径或 accept 头不对` };
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    try {
      const r = await fetch(url, { signal: ctl.signal, headers });
      return parse(await r.text(), r.status);
    } catch (e1) {
      const msg = String((e1 && e1.cause) || e1);
      if (!/certificate/i.test(msg)) return { status: 0, text: '', json: null, error: msg.slice(0, 160) };
      const ca = systemCa();
      if (!ca) return { status: 0, text: '', json: null, error: msg.slice(0, 160) };
      const body = await new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers, ca }, (res) => {
          let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d));
        });
        req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
        req.on('error', reject);
        req.end();
      });
      return parse(body, 200);
    }
  } finally { clearTimeout(timer); }
}

// ---------- 号码归一 ----------
/**
 * COSCO 号码口径归一。
 * @returns {{kind:'bill'|'container', api:string, given:string, stripped?:string}}
 */
export function normalizeCoscoNumber(input) {
  const raw = String(input || '').trim().toUpperCase().replace(/[\s-]/g, '');
  if (/^\d{10}$/.test(raw)) return { kind: 'bill', api: raw, given: raw };
  const m = /^([A-Z]{4})(\d{10})$/.exec(raw);                      // SCAC 前缀写法：COSU6469105960
  if (m) return { kind: 'bill', api: m[2], given: raw, stripped: m[1] };
  if (/^[A-Z]{4}\d{7}$/.test(raw)) return { kind: 'container', api: raw, given: raw };
  return { kind: /^\d/.test(raw) ? 'bill' : 'container', api: raw, given: raw };
}

const s = (v) => (v === null || v === undefined ? '' : String(v));
const t16 = (v) => s(v).slice(0, 16);

// ---------- 航段（public 视野里唯一的"过程"信息源） ----------
function mapLegs(rows) {
  return (rows || []).map((x) => ({
    seq: Number(s(x.sequenceNumber) || 0),
    vessel: s(x.vesselName),
    voyage: s(x.voyageNo),
    service: s(x.service),
    transType: s(x.transType),
    from: s(x.portOfLoading),
    to: s(x.portOfDischarge),
    etd: t16(x.expectedDateOfDeparture),
    atd: t16(x.actualDepartureDate),
    eta: t16(x.estimatedDateOfArrival),
    ata: t16(x.actualArrivalDate),
    shipped: t16(x.actualShippingDate),
    discharged: t16(x.actualDischargeDate),
  }));
}

/** 航段 → 事件：实际值 = ACTUAL，计划值 = EXPECTED（归一化层靠 timeType 区分，别把"预计"当成"现状"）。
 *  同时写 `kind`（UI 卡按 e.kind 决定"预计"样式）—— 两个字段保持同值，谁读都不会漏。 */
function legEvents(leg) {
  const out = [];
  const add = (time, activity, actual) => {
    if (!time) return;
    out.push({ time, activity, city: '', terminal: '', vessel: leg.vessel, voyage: leg.voyage, timeType: actual ? 'ACTUAL' : 'EXPECTED', kind: actual ? 'ACTUAL' : 'EXPECTED' });
  };
  if (leg.shipped) add(leg.shipped, `Loaded on ${leg.vessel} ${leg.voyage}${leg.from ? ' at ' + leg.from : ''}`.trim(), true);
  add(leg.atd, `Departed ${leg.from}`.trim(), true);
  if (!leg.atd) add(leg.etd, `Expected departure ${leg.from}`.trim(), false);
  add(leg.ata, `Arrived ${leg.to}`.trim(), true);
  // 归一层挑 ETA 的正则认 ARRIV/DISCHARGE/DELIVER/AVAILABLE/GATE-OUT 这类词 → 到港事件别写成裸 "ETA xxx"
  if (!leg.ata) add(leg.eta, `Arrival at ${leg.to}`.trim(), false);
  add(leg.discharged, `Discharged at ${leg.to}`.trim(), true);
  return out;
}

/**
 * 追踪一票 COSCO 提单 / 箱号。
 * @param {string} number B/L（COSU6469105960 或 6469105960）或箱号（FFAU8700256）
 */
export async function trackCosco(number, { timeoutMs = 20000, etaLookup = true } = {}) {
  const norm = normalizeCoscoNumber(number);
  if (!norm.api) return { ok: false, number: String(number || ''), carrier: 'cosco', error: 'empty number' };

  // ── 箱号直查 ──────────────────────────────────────────────
  if (norm.kind === 'container') {
    const cn = await getJSON(`${BASE}/ebtracking/public/containers/${encodeURIComponent(norm.api)}`, timeoutMs);
    if (!cn.json) return { ok: false, number: norm.given, carrier: 'cosco', error: cn.error || `HTTP ${cn.status}` };
    const box = (cn.json?.data?.content?.containers || [])[0];
    const nf = s(cn.json?.data?.content?.notFound);
    if (!box || nf) return { ok: false, number: norm.given, carrier: 'cosco', notFound: true, error: `官网回：无此箱号数据（${nf || norm.api}）`, raw: cn.json };
    const circle = (box.containerCircleStatus || [])[0] || {};
    const etaR = await getJSON(`${BASE}/ebtracking/public/container/eta/${encodeURIComponent(norm.api)}`, timeoutMs);
    const eta = t16(etaR.json?.data?.content);
    const events = [];
    if (s(circle.timeOfIssue) || s(circle.containerNumberStatus)) {
      events.push({ time: t16(circle.timeOfIssue), activity: s(circle.containerNumberStatus), city: s(circle.location), terminal: '', vessel: '', voyage: '', timeType: 'ACTUAL', kind: 'ACTUAL', isCurrent: true });
    }
    if (eta) events.push({ time: eta, activity: 'Arrival at destination', city: '', terminal: '', vessel: '', voyage: '', timeType: 'EXPECTED', kind: 'EXPECTED' });
    const ct = s(box.container?.containerType);
    return {
      ok: true, number: norm.given, carrier: 'cosco', docNum: norm.api,
      origin: '', destination: '',
      lastUpdate: events.length ? events[0].time : null,
      status: s(circle.containerNumberStatus) || '',
      current: events[0] || null,
      events: events.slice(), legs: [],
      containers: [{ num: norm.api, size: (ct.match(/\d+/) || [''])[0], type: (ct.match(/[A-Z]+/) || [''])[0], iso: '', status: s(circle.containerNumberStatus), lastUpdate: t16(circle.timeOfIssue), eta, transportation: s(circle.transportation), events }],
      // ⚠ 归一化层（normalize.mjs）约定 raw.containers 必须是**数组**（它会 .find / 遍历），
      //   所以这里给数组，原始整包另挂 containersResponse。
      raw: { containersResponse: cn.json, containers: (cn.json?.data?.content?.containers || []) },
    };
  }

  // ── 提单主信息 ────────────────────────────────────────────
  const main = await getJSON(`${BASE}/ebtracking/public/bill/${encodeURIComponent(norm.api)}`, timeoutMs);
  if (!main.json) return { ok: false, number: norm.given, carrier: 'cosco', error: main.error || `HTTP ${main.status}` };
  const c = main.json?.data?.content;
  if (!c || c.isbillOfLadingExist === false) {
    const hint = norm.stripped ? `（已把 ${norm.stripped} 前缀剥掉再查 ${norm.api}）` : '';
    return { ok: false, number: norm.given, carrier: 'cosco', notFound: true, error: `官网回：无数据 ${hint}`.trim(), raw: main.json };
  }

  // 箱列表（每箱最新动态）
  const cl = await getJSON(`${BASE}/ebtracking/public/bill/containers/${encodeURIComponent(norm.api)}`, timeoutMs);
  const rows = (cl.json?.data?.content?.containers) || (Array.isArray(cl.json?.data?.content) ? cl.json.data.content : []) || [];

  const legs = mapLegs(c.actualShipment);
  const shipLegEvs = legs.flatMap(legEvents);

  // 逐箱 ETA（公开接口响应很小；箱数不多时一并取）
  const etaMap = {};
  if (etaLookup && rows.length && rows.length <= 12) {
    for (const r of rows) {
      const num = s(r.containerNumber);
      if (!num) continue;
      const e = await getJSON(`${BASE}/ebtracking/public/container/eta/${encodeURIComponent(num)}`, timeoutMs);
      etaMap[num] = t16(e.json?.data?.content);
    }
  }

  const containers = rows.map((r) => {
    const num = s(r.containerNumber);
    const ct = s(r.containerType);
    // 同一提单下每箱走同一批航段（与 maersk 逐箱事件口径一致），再挂上本箱自己的最新动态
    const evs = shipLegEvs.map((e) => ({ ...e }));
    if (s(r.locationDateTime) || s(r.label)) {
      evs.push({ time: t16(r.locationDateTime), activity: s(r.label), city: s(r.location), terminal: '', vessel: '', voyage: '', timeType: 'ACTUAL', kind: 'ACTUAL' });
    }
    // 逐箱 ETA：只有当航段里没有「预计到港」时才补一条，避免同一时刻两行 ETA
    if (etaMap[num] && !evs.some((x) => x.timeType === 'EXPECTED' && /ARRIV/i.test(x.activity))) {
      evs.push({ time: etaMap[num], activity: `Arrival at ${s(c.trackingPath?.toCity) || 'destination'}`.trim(), city: s(c.trackingPath?.toCity), terminal: '', vessel: '', voyage: '', timeType: 'EXPECTED', kind: 'EXPECTED' });
    }
    evs.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
    const lastActual = [...evs].reverse().find((x) => x.timeType === 'ACTUAL');
    if (lastActual) lastActual.isCurrent = true;
    return {
      num, size: (ct.match(/\d+/) || [''])[0], type: (ct.match(/[A-Z]+/) || [''])[0], iso: '',
      status: s(r.label), lastUpdate: t16(r.locationDateTime), eta: etaMap[num] || '',
      // 到手时间（COSCO 的 cgoAvailTm）：App 引擎按 containers[0].etaFinal 取「最终交付预计」
      etaFinal: t16(c.trackingPath?.cgoAvailTm) || null,
      transportation: s(r.transportation), events: evs,
    };
  });
  // 提单接口给了箱、箱列表接口却没给（少见）：兜底成空事件箱，别把箱子吞掉
  for (const b of (c.cargoTrackingContainer || [])) {
    const num = s(b.cntrNum);
    if (num && !containers.some((x) => x.num === num)) containers.push({ num, size: '', type: '', iso: '', status: '', lastUpdate: null, eta: etaMap[num] || '', transportation: '', events: [] });
  }

  // 顶层扁平时间线（船期段 + 箱动态，按 时间+动作 去重）
  const seen = new Set();
  const events = [];
  const push = (e) => { const k = `${e.time}|${e.activity}`; if (seen.has(k)) return; seen.add(k); events.push({ ...e }); };
  for (const e of shipLegEvs) push(e);
  for (const ct of containers) for (const e of ct.events) if (e.timeType === 'ACTUAL' && !shipLegEvs.some((x) => x.time === e.time && x.activity === e.activity)) push(e);
  events.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  const lastActual = [...events].reverse().find((x) => x.timeType === 'ACTUAL') || null;
  if (lastActual) lastActual.isCurrent = true;

  const withUpdate = containers.filter((x) => x.lastUpdate).sort((a, b) => String(b.lastUpdate).localeCompare(String(a.lastUpdate)));
  const cur = withUpdate[0] || null;

  return {
    ok: true,
    number: norm.given,
    carrier: 'cosco',
    docNum: s(c.trackingPath?.billOfladingRefCode) || norm.api,
    normalizedFrom: norm.stripped ? `${norm.stripped} 前缀已剥离（接口只认 10 位）` : null,
    origin: [s(c.trackingPath?.fromCity), s(c.trackingPath?.pol)].filter(Boolean).join(' / '),
    destination: [s(c.trackingPath?.toCity), s(c.trackingPath?.pod)].filter(Boolean).join(' / '),
    vessel: s(c.trackingPath?.vslNme),
    voyage: s(c.trackingPath?.voyNumber),
    svvd: s(c.trackingPath?.svvd),
    blType: s(c.trackingPath?.blType),
    cargoAvailTime: t16(c.trackingPath?.cgoAvailTm),
    lastUpdate: cur ? cur.lastUpdate : (lastActual ? lastActual.time : null),
    status: cur ? cur.status : (lastActual ? lastActual.activity : ''),
    current: cur
      ? { time: cur.lastUpdate, activity: cur.status, city: '', terminal: '', vessel: '', voyage: '', timeType: 'ACTUAL', container: cur.num, isCurrent: true }
      : lastActual,
    events,
    legs,
    containers,
    // UI 卡按 ev.route.origin/destination 渲染航线（归一层给的是扁平 origin/destination，两处都给，谁都读得到）
    route: {
      origin: [s(c.trackingPath?.fromCity), s(c.trackingPath?.pol)].filter(Boolean).join(' / '),
      destination: [s(c.trackingPath?.toCity), s(c.trackingPath?.pod)].filter(Boolean).join(' / '),
    },
    eta: (() => {
      const e = [...events].reverse().find((x) => x.timeType === 'EXPECTED' && /ARRIV/i.test(x.activity));
      return e ? { time: e.time, city: e.city || s(c.trackingPath?.toCity), terminal: '', activity: e.activity } : null;
    })(),
    etaFinal: t16(c.trackingPath?.cgoAvailTm) || null,
    bookingNumbers: (c.bookingNumbersInBillOfLadingTrackingGroupAssociationList || []).map((x) => s(x.bookingNumber || x)).filter(Boolean),
    // ⚠ 归一化层（normalize.mjs）约定 raw.containers 必须是**数组**：它会 raw.containers.find(...) / 逐箱遍历。
    //   COSCO 的原始箱数据是对象包在 data.content 里，直接塞进去会炸（raw?.containers?.find is not a function）。
    //   这里给数组（顺带把原始两包挂上），让它走「统一结构回退」分支取 containers[].events。
    raw: { bill: main.json, containersResponse: cl.json, containers: rows },
  };
}
