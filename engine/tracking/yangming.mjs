// 阳明海运 Yang Ming 提单 / 箱号 / 订舱追踪 —— 2026-10-12（婉宜，探针实摸 + 真数据验证）
//
// 通路：yangming.com 追踪页在自己的页面上下文里调站内 API：
//   GET https://www.yangming.com/api/CargoTracking/GetTracking?paramTrackNo=<号>&paramTrackPosition=<模式>&paramRefNo=<上下文>
//   ★ 必须在 yangming.com 页面内 fetch（站侧风控/同源，2026-10-12 实测通过）。
//   ★ 三种用法（全部实测）：
//     · 任意号直查：position=SEARCH&refNo=（柜/提单/订舱自动识别，返回 trackType）
//     · 提单下钻柜：position=BL_CT&refNo=<提单号>&trackNo=<柜号>（=官网详情页同款"该票视角"事件）
//     · CNTR_CT 不接受 refNo（实测 successCnt=0，勿用）
//   ★ 响应结构（实测样本）：
//     { successCnt, containerList:[{ returnTrackNo, cnSize, cnType, cnTypeDesc,
//         ctStatusInfo:[...], dcsaStatusInfo:[...] }],
//       blList:[{ trackType:'B/L No', blType, bkgRef,
//         basicInfo:{receipt,loading,discharge,delivery,vesselName,vesselComn,voyageCode,vesselCode,obDate,...},
//         routingInfo:{routingSchedule:[{seq,picQlfr,placeName,dateTime,dateQlfr,berthInfo}]},
//         containerInfo:[{ctnrNo,cnSize,cnType,moveType,moveDate,lastEvent,place,sealNo,...}] }],
//       bookingList:[...], emptyList:[...] }
//     事件字段（dcsaStatusInfo 优先，含 eventClassifie:'Actual'/'Estimated'）：
//       seq / moveDate('2026/09/30 16:33') / eventDesc / atFacility / toFacility / dportETA /
//       vesselVoyage / vesselCode / tsMode / eventClassifie / nowStatus
//     ★ tsMode 可能内嵌 HTML（'VESSEL<BR />YM INTELLIGENT<BR />(298N)'）——需清洗提取船名/航次。
//     ★ 事件按 seq 递增=时间倒序（最新在前）；本模块统一转成时间正序。
//
// 输出：统一结构（与 zim.mjs / msc.mjs 对齐，供 normalize.mjs 归一化）
//   { ok, number, carrier:'yangming', docNum, searchType, origin, destination,
//     vessel, voyage, siteStatus, status, lastUpdate, current, eta,
//     containers:[{ num, size, type, desc, status, lastUpdate, events:[...] }], steps, raw }

import { launch, sleep } from '../browser.mjs';

export const API = 'https://www.yangming.com/api/CargoTracking/GetTracking';
const TRACK_URL = 'https://www.yangming.com/en/esolution/tracking/cargo_tracking';

const s = (x) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim();
const clean = (x) => s(String(x || '').replace(/<BR\s*\/?>/gi, ' '));   // 站方字段内嵌 HTML 清洗
/** 事件场所串取城市短名：'KEELUNG - YANGMING KEELUNG TERMINAL (…)' → 'KEELUNG' */
const cityShort = (x) => { const t = s(x); const i = t.indexOf(' - '); return i > 0 ? t.slice(0, i) : t; };

/** '2026/09/30 16:33' → '2026-09-30T16:33'（无时间部分时只留日期） */
const iso = (d) => {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})(?:\s+(\d{2}:\d{2}))?/.exec(String(d || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` + (m[4] ? `T${m[4]}` : '') : null;
};

/** tsMode 清洗：'VESSEL<BR />YM INTELLIGENT<BR />(298N)' → { mode:'VESSEL', vessel:'YM INTELLIGENT', voyage:'298N' } */
export function parseTsMode(ts) {
  if (!ts) return { mode: '', vessel: '', voyage: '' };
  const parts = String(ts).split(/<BR\s*\/?>/i).map((x) => s(x)).filter(Boolean);
  const mode = parts[0] || '';
  let vessel = parts[1] || '';
  let voyage = '';
  if (parts[2]) voyage = parts[2].replace(/[()]/g, '').trim();
  if (!parts[2] && /^\(.*\)$/.test(vessel)) { voyage = vessel.replace(/[()]/g, ''); vessel = ''; }
  return { mode, vessel, voyage };
}

/** DCSA 事件 → 统一事件（eventClassifie=Estimated 视为 EXPECTED；缺省按日期与今天比对） */
export function ymEvent(e, today) {
  const t = parseTsMode(e.tsMode);
  const time = iso(e.moveDate);
  let timeType = 'ACTUAL';
  if (e.eventClassifie === 'Estimated') timeType = 'EXPECTED';
  else if (!e.eventClassifie && time && today && time.slice(0, 10) > today) timeType = 'EXPECTED';
  return {
    time, rawTime: e.moveDate || '',
    activity: s(e.eventDesc),
    city: cityShort(e.atFacility),
    placeTo: clean(e.toFacility),
    vessel: t.vessel, voyage: t.voyage, transport: t.mode,
    dportEta: iso(e.dportETA) || null,
    eventClassifie: e.eventClassifie || '',
    timeType, kind: timeType, isCurrent: false,
  };
}

function parseEvents(c) {
  const today = new Date().toISOString().slice(0, 10);
  const src = (c.dcsaStatusInfo && c.dcsaStatusInfo.length ? c.dcsaStatusInfo : c.ctStatusInfo) || [];
  const evs = src.map((e) => ymEvent(e, today)).filter((e) => e.time || e.activity);
  evs.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  if (evs.length) evs[evs.length - 1].isCurrent = true;
  return evs;
}

/** 纯解析：GetTracking JSON → 统一结构（导出便于离线单测，不依赖网络） */
export function parseYangmingResponse(json, number) {
  const out = { ok: false, number, carrier: 'yangming', error: null, errorKind: null };
  if (!json || typeof json !== 'object') { out.error = 'YM 响应非 JSON（被拦/改版）'; out.errorKind = 'blocked'; return out; }

  const cList = json.containerList || [];
  const bList = json.blList || [];
  const c0 = cList[0] || null;
  const b0 = bList[0] || null;
  const containers = [];

  if (!c0 && !b0) {
    const bk = (json.bookingList || [])[0] || null;
    if (bk) {
      // 订舱号：结构未完全验证——尽力解析柜特征；无明细时如实标注（worker 复核缺口 c：不得误报 not-found）
      for (const ci of (bk.containerInfo || [])) {
        containers.push({
          num: s(ci.ctnrNo), size: s(ci.cnSize), type: s(ci.cnType || ''), desc: s(ci.cnTypeDesc), iso: '',
          status: s(ci.lastEvent || ''), lastUpdate: iso(ci.moveDate), events: [],
          meta: { sealNo: s(ci.sealNo), moveType: s(ci.moveType), place: s(ci.place) },
        });
      }
      out.ok = true;
      out.booking = { num: s(bk.returnTrackNo || bk.queryTrackNo), note: containers.length ? '' : '订舱号已识别；明细暂未提供' };
      out.containers = containers;
      out.searchType = 'BOOKING';
      out.docNum = out.booking.num || number;
      return out;
    }
    out.error = '阳明未返回该号的追踪数据（请核对单号）';
    out.errorKind = 'not-found';
    return out;
  }

  // —— 集装箱事件（柜模式可能多个柜——全遍历；worker 复核缺口 a）——
  if (cList.length) {
    for (const ci of cList) {
      containers.push({
        num: s(ci.returnTrackNo || ci.queryTrackNo),
        size: s(ci.cnSize), type: s(ci.cnType), desc: s(ci.cnTypeDesc), iso: '',
        status: s(ci.currentStatus || ''),
        lastUpdate: null,
        events: parseEvents(ci),
      });
    }
  } else if (b0) {
    for (const ci of (b0.containerInfo || [])) {
      containers.push({
        num: s(ci.ctnrNo), size: s(ci.cnSize), type: s(ci.cnType || ''), desc: s(ci.cnTypeDesc), iso: '',
        status: s(ci.lastEvent || ''),
        lastUpdate: iso(ci.moveDate),
        events: [],   // 事件由 trackYangming 下钻补全（BL_CT）；纯解析时保留容器清单
        meta: { sealNo: s(ci.sealNo), moveType: s(ci.moveType), place: s(ci.place), vgm: ci.vgm ?? null },
      });
    }
  }
  for (const c of containers) {
    if (!c.lastUpdate && c.events.length) c.lastUpdate = c.events[c.events.length - 1].time;
  }

  // —— 全局事件 ——
  const allEvs = containers.flatMap((x) => x.events);
  allEvs.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  const lastEvent = allEvs[allEvs.length - 1] || null;
  const cur = [...allEvs].reverse().find((e) => e.timeType === 'ACTUAL') || null;

  // —— 票级信息 ——
  let origin = '', destination = '', vessel = '', voyage = '', siteStatus = '';
  if (b0) {
    const bi = b0.basicInfo || {};
    origin = s(bi.loading || bi.receipt || '');
    destination = s(bi.discharge || bi.delivery || '');
    vessel = s(bi.vesselName || '');
    voyage = s(bi.vesselComn || '');
    siteStatus = s(b0.blType || '');
  } else if (c0) {
    // 柜模式无航线结构化字段：用最早/最新事件的城市近似（与站方"当前周期"语义一致）
    if (allEvs.length) { origin = s(allEvs[0].city); destination = s(allEvs[allEvs.length - 1].city); }
    vessel = lastEvent ? lastEvent.vessel : '';
    voyage = lastEvent ? lastEvent.voyage : '';
    siteStatus = s(c0.trackType || '');
  }

  return {
    ok: true, number, carrier: 'yangming',
    docNum: s((b0 && b0.returnTrackNo) || (c0 && c0.returnTrackNo) || number),
    searchType: s((b0 && b0.trackTypeCode) || (c0 && c0.trackTypeCode) || ''),
    origin, destination, vessel, voyage,
    siteStatus, status: siteStatus || (cur ? cur.activity : ''),
    lastUpdate: cur ? cur.time : (lastEvent ? lastEvent.time : null),
    current: cur,
    lastEvent,
    eta: (() => {
      const planned = allEvs.find((e) => e.timeType === 'EXPECTED');
      if (planned && planned.time) return { time: planned.time, city: planned.city, terminal: '', activity: planned.activity, fromSite: true };
      const e = [...allEvs].reverse().find((x) => x.dportEta);
      return e ? { time: e.dportEta, city: '', terminal: '', activity: 'ETA at POD', fromSite: true } : null;
    })(),
    routing: b0 ? ((b0.routingInfo || {}).routingSchedule || []).map((r) => ({
      seq: r.seq, type: s(r.picQlfr), place: s(r.placeName), time: iso(r.dateTime), by: s(r.dateQlfr),
    })) : [],
    containers,
    raw: json,
  };
}

/** 站内 API 调用（必须在 yangming.com 页面上下文里执行） */
async function apiCall(page, { no, pos = 'SEARCH', ref = '' }) {
  const u = `${API}?paramTrackNo=${encodeURIComponent(no)}&paramTrackPosition=${pos}&paramRefNo=${encodeURIComponent(ref)}`;
  return page.evaluate(async ({ u }) => {
    try {
      const resp = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
      const t = await resp.text();
      let j = null;
      try { j = JSON.parse(t); } catch { /* 非 JSON = 被拦/改版 */ }
      return { status: resp.status, len: t.length, json: j, head: t.slice(0, 200) };
    } catch (e) { return { error: String(e).slice(0, 160) }; }
  }, { u }).catch((e) => ({ error: String(e).slice(0, 160) }));
}

export async function trackYangming(number, { timeoutMs = 90000, ctx = null, maxContainers = 4 } = {}) {
  const ref0 = String(number || '').trim().toUpperCase().replace(/\s+/g, '');
  const own = !ctx;
  const c = ctx || (await launch({ headless: true }));
  const page = c.pages()[0] || (await c.newPage());
  const steps = [];
  try {
    let r = null;
    for (let attempt = 0; attempt < 2 && !(r && r.json); attempt++) {
      if (attempt === 0) {
        await page.goto(TRACK_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
        await sleep(5000);
      } else {
        await sleep(4000);   // 首跳未就绪：再等一拍重试
      }
      r = await apiCall(page, { no: ref0 });
    }
    if (!r || !r.json) {
      return {
        ok: false, number: ref0, carrier: 'yangming', errorKind: 'blocked',
        error: `YM 追踪接口被拦/改版（HTTP ${r?.status ?? '?'}，非 JSON）: ${String(r?.head || r?.error || '').slice(0, 120)}`,
      };
    }

    const parsed = parseYangmingResponse(r.json, ref0);
    if (!parsed.ok) return parsed;

    // BL 模式：逐柜下钻（BL_CT 视角），补全事件（最多 maxContainers 柜）
    const isBl = (r.json.containerList || []).length === 0 && (r.json.blList || []).length > 0;
    if (isBl) {
      let n = 0;
      for (const ctn of parsed.containers) {
        if (!ctn.num || n >= maxContainers) break;
        n += 1;
        const r2 = await apiCall(page, { no: ctn.num, pos: 'BL_CT', ref: ref0 });
        if (r2 && r2.json) {
          const p2 = parseYangmingResponse(r2.json, ctn.num);
          const cc = (p2.containers || [])[0];
          if (cc && cc.events && cc.events.length) { ctn.events = cc.events; ctn.lastUpdate = cc.events[cc.events.length - 1].time; }
        }
        steps.push(`bl-drill:${ctn.num}:${(ctn.events || []).length}`);
      }
      // 下钻后刷新全局事件
      const all = parsed.containers.flatMap((x) => x.events);
      all.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
      if (all.length) {
        parsed.lastEvent = all[all.length - 1];
        parsed.current = [...all].reverse().find((e) => e.timeType === 'ACTUAL') || parsed.current;
        parsed.lastUpdate = parsed.current ? parsed.current.time : parsed.lastEvent.time;
        // worker 复核缺口 e：下钻后重算票级 ETA（不能停留在下钻前的旧值）
        const plannedAfter = all.find((e) => e.timeType === 'EXPECTED');
        if (plannedAfter && plannedAfter.time) {
          parsed.eta = { time: plannedAfter.time, city: plannedAfter.city, terminal: '', activity: plannedAfter.activity, fromSite: true };
        }
      }
    }
    parsed.steps = steps;
    return parsed;
  } catch (e) {
    return { ok: false, number: ref0, carrier: 'yangming', error: String(e).slice(0, 200), errorKind: 'exception' };
  } finally {
    if (own) await c.close().catch(() => {});
  }
}

export default { trackYangming, parseYangmingResponse, parseTsMode };
