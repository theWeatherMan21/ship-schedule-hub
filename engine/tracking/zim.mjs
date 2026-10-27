// ZIM 以星 提单 / 箱号 / 参考号追踪 —— 2026-10-12（婉宜，探针实摸 + 真数据验证）
//
// 通路：zim.com 追踪页在自己的页面上下文里调站内网关（Akamai 护着，裸请求被拦）：
//   GET https://apigw.zim.com/digital/TrackShipment/v2/complete-result?reference=<号>&subscription-key=<key>
//   ★ 必须在 www.zim.com 页面内 fetch（页面姿势，2026-10-12 实测通过）；
//   ★ subscription-key 为站内公开配置值（2026-10-10 从页面 JS 提取；若失效按同法再抓）。
//
// 响应双形态（实测样本，2026-10-12）：
//   ① 箱号 → unitListItem[0]：{ unitPrefix, unitNo, cycleStatusDesc, vpBrl.vpBrl[], unitActivities.unitActivitiesItem[], finalEta, agreedEta }
//   ② 提单/参考号 → consgListItem[0]：{ referenceNo, referenceType, blRouteLeg.vpBrl[], consDetails.consContainers.consContainersItem[], finalEta, agreedEta, consCycleStatusDesc }
//   活动事件字段：activityCode / activityDesc / activityDateTz（港口当地）/ placeFromDesc / countryFromName / vesselName / voyage
//
// 输出：统一结构（与 maersk.mjs / msc.mjs 对齐，供 normalize.mjs 归一化）
//   { ok, number, carrier:'zim', docNum, searchType, origin, destination, vessel, voyage,
//     status, lastUpdate, current, eta:{time,...}, containers:[{ num, size, type, status, lastUpdate, events:[...] }], raw }

import { launch, sleep } from '../browser.mjs';

const TRACK_URL = 'https://www.zim.com/tools/track-a-shipment';
const API_BASE = 'https://apigw.zim.com/digital/TrackShipment/v2/complete-result';
const SUB_KEY = '9d63cf020a4c4708a7b0ebfe39578300';   // 站内公开配置值（2026-10-10 页面提取）

const s = (x) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim();
const t16 = (x) => { const t = String(x || ''); return t.length >= 16 ? t.slice(0, 16) : (t || null); };

/** 活动 → 统一事件（timeType 用「日期 vs 今天」判 ACTUAL/EXPECTED：ZIM 不给未来活动，防御性保留） */
export function zimEvent(a, today) {
  const time = t16(a.activityDateTz || a.activityDate);
  const timeType = (time && today && time.slice(0, 10) > today) ? 'EXPECTED' : 'ACTUAL';
  return {
    time,
    rawTime: a.activityDateTz || a.activityDate || '',
    activity: s(a.activityDesc || a.activityCode || ''),
    code: a.activityCode || '',
    city: s(a.placeFromDesc || ''),
    country: s(a.countryFromName || ''),
    placeTo: s(a.placeToDesc || ''),
    locode: a.placeFrom || '',
    vessel: s(a.vesselName || ''),
    vesselCode: a.vessel || '',
    voyage: s(a.voyage || ''),
    leg: a.leg || '',
    cargoType: s(a.cargoType || ''),
    group: a.activityGroup || '',
    timeType,
    kind: timeType,
    isCurrent: false,
  };
}

function sortEvents(evs) {
  evs.sort((x, y) => String(x.time || '').localeCompare(String(y.time || '')));
  if (evs.length) evs[evs.length - 1].isCurrent = true;
  return evs;
}

/** 纯解析：ZIM complete-result JSON → 统一结构（导出便于离线单测，不依赖网络） */
export function parseZimResponse(json, number) {
  const today = new Date().toISOString().slice(0, 10);
  const out = { ok: false, number, carrier: 'zim', error: null, errorKind: null };
  if (!json || typeof json !== 'object') { out.error = 'ZIM 响应非 JSON（被拦/改版）'; out.errorKind = 'blocked'; return out; }

  const unit = (json.unitListItem || [])[0] || null;
  const consg = (json.consgListItem || [])[0] || null;

  const hasData = !!(
    (unit && ((unit.unitActivities && (unit.unitActivities.unitActivitiesItem || []).length) || (unit.vpBrl && (unit.vpBrl.vpBrl || []).length))) ||
    (consg && ((consg.blRouteLeg && (consg.blRouteLeg.vpBrl || []).length) || (consg.consDetails && ((consg.consDetails.consContainers || {}).consContainersItem || []).length)))
  );
  if (!hasData) {
    out.error = 'ZIM 官网无此号记录（只保留约 90 天内的数据）';
    out.errorKind = 'not-found';
    return out;
  }

  // 航线腿（两种形态位置不同）
  const legs = (unit?.vpBrl?.vpBrl || consg?.blRouteLeg?.vpBrl || []).filter(Boolean);
  const firstLeg = legs[0] || null;
  const lastLeg = legs[legs.length - 1] || null;

  // 箱子 + 事件
  const containers = [];
  if (consg) {
    for (const b of (consg.consDetails?.consContainers?.consContainersItem || [])) {
      const evs = sortEvents((b.unitActivities?.unitActivitiesItem || []).map((a) => zimEvent(a, today)));
      const lastAct = [...evs].reverse().find((e) => e.timeType === 'ACTUAL') || null;
      containers.push({
        num: `${s(b.unitPrefix)}${s(b.unitNo)}`,
        size: s(b.cargoType), type: s(b.cargoType), iso: '',
        status: s(b.cycleStatusDesc),
        lastUpdate: lastAct ? lastAct.time : (evs.length ? evs[evs.length - 1].time : null),
        events: evs,
      });
    }
  }
  if (!containers.length && unit) {
    const evs = sortEvents((unit.unitActivities?.unitActivitiesItem || []).map((a) => zimEvent(a, today)));
    const lastAct = [...evs].reverse().find((e) => e.timeType === 'ACTUAL') || null;
    containers.push({
      num: `${s(unit.unitPrefix)}${s(unit.unitNo)}`,
      size: s(unit.cargoType || ''), type: s(unit.cargoType || ''), iso: '',
      status: s(unit.cycleStatusDesc),
      lastUpdate: lastAct ? lastAct.time : (evs.length ? evs[evs.length - 1].time : null),
      events: evs,
    });
  }

  // 全局事件（展平）
  const allEvs = containers.flatMap((x) => x.events);
  allEvs.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  const lastEvent = allEvs[allEvs.length - 1] || null;
  const cur = [...allEvs].reverse().find((e) => e.timeType === 'ACTUAL') || null;   // 最新「已发生」

  // ETA：finalEta（票级）优先、agreedEta 兜底
  const fe = consg?.finalEta || unit?.finalEta || null;
  const ae = consg?.agreedEta || unit?.agreedEta || null;
  const etaTime = t16(fe?.etaPodDate) || t16(ae?.etaDate) || null;
  const etaDelivery = t16(fe?.etaDelDate) || null;
  const destName = s(lastLeg?.portNameTo || '');

  // 站点状态（phaseOf：CLOSED→Completed / OPEN→按事件走）——保持原样大小写，由归一化层处理
  const siteStatus = s(consg?.consCycleStatusDesc || unit?.cycleStatusDesc) || (cur ? s(cur.activity) : '');

  return {
    ok: true, number, carrier: 'zim',
    docNum: s(consg?.referenceNo || `${s(unit?.unitPrefix)}${s(unit?.unitNo)}`),
    searchType: consg ? s(consg.referenceType || 'BL') : 'CONTAINER',
    origin: s(firstLeg?.portNameFrom || ''),
    destination: destName,
    portOfLoad: s(firstLeg?.portNameFrom || ''),
    portOfDischarge: destName,
    vessel: s(lastLeg?.vesselName || firstLeg?.vesselName || ''),
    voyage: s(lastLeg?.voyage || firstLeg?.voyage || ''),
    route: legs.map((L) => ({
      from: s(L.portNameFrom), fromCode: L.portCodeFrom || '',
      to: s(L.portNameTo), toCode: L.portCodeTo || '',
      vessel: s(L.vesselName), voyage: s(L.voyage), seq: L.legSequence || '',
      sailing: t16(L.sailingDateDt), arrival: t16(L.arrivalDateDt),
    })),
    siteStatus,
    status: siteStatus,
    lastUpdate: cur ? cur.time : (lastEvent ? lastEvent.time : null),
    current: cur,
    lastEvent,
    eta: etaTime ? { time: etaTime, city: destName, terminal: '', activity: 'Estimated arrival at POD', fromSite: true } : null,
    etaDelivery,
    podFlag: consg?.podFlag || unit?.podFlag || null,
    containers,
    raw: json,
  };
}

/** 站内接口调用（必须在 www.zim.com 页面上下文里执行：Akamai 护着，裸请求被拦） */
async function apiCall(page, ref) {
  const u = `${API_BASE}?reference=${encodeURIComponent(ref)}&subscription-key=${SUB_KEY}`;
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

export async function trackZim(number, { timeoutMs = 60000, ctx = null } = {}) {
  const ref = String(number || '').trim().toUpperCase().replace(/\s+/g, '');
  const own = !ctx;
  const c = ctx || (await launch({ headless: true }));
  const page = c.pages()[0] || (await c.newPage());
  try {
    let r = null;
    for (let attempt = 0; attempt < 2 && !(r && r.json); attempt++) {
      if (attempt === 0) {
        await page.goto(TRACK_URL, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
        await sleep(6000);
      } else {
        await sleep(4000);   // 首跳未就绪：再等一拍重试一次
      }
      r = await apiCall(page, ref);
    }
    if (!r || !r.json) {
      return {
        ok: false, number, carrier: 'zim', errorKind: 'blocked',
        error: `ZIM 追踪接口被拦/改版（HTTP ${r?.status ?? '?'}，非 JSON）: ${String(r?.head || r?.error || '').slice(0, 120)}`,
      };
    }
    return parseZimResponse(r.json, number);
  } catch (e) {
    return { ok: false, number, carrier: 'zim', error: String(e).slice(0, 200), errorKind: 'exception' };
  } finally {
    if (own) await c.close().catch(() => {});
  }
}
