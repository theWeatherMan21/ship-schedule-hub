// ONE 海洋网联 提单 / 订舱号 / 箱号追踪 —— 2026-10-10（婉宜）
//
// 与船期同源：都用 ecomm.one-line.com 的 edh API —— **公开、无需登录、无验证码、纯 HTTP**（零浏览器、零窗口）。
// 实锤来源：站内 Next.js chunk `pages/manage-shipment/cargo-tracking-*.js` 里的 axios 调用。
//
//   ① 搜索：POST /v2/edh/containers/track-and-trace/search
//        body: { page:1, page_length:20, filters:{ search_text, search_type }, timestamp }
//        search_type: 'BKG_NO'(BL/订舱号) | 'CNTR_NO'(箱号) | 'PO_NO' | 'ALL'
//      → { total, data:[{ bookingNo, containerNo, containerTypeSize, weight, socFlag, seals,
//                         por, pod, place, copNo, latestEvent, cargoEvents[], deadlineEvents[],
//                         vesselVoyage, cargoReleaseCustoms }] }
//   ② 时间线：GET /v2/edh/containers/track-and-trace/cop-events?booking_no=<b>&container_no=<c>
//      → { data:[{ eventName, eventDate(UTC), eventLocalPortDate(港口当地), triggerType:ACTUAL|ESTIMATED,
//                  matrixId, copSequence, location{code,locationName,countryName}, yard{yardCode,yardName},
//                  vessel{code,name,voyNo,dirCode} }] }
//   ③ 兜底：POST /v2/edh/containers/track-and-trace/validate-booking { bookingNos, timestamp }
//      → { data:{ bkgBefore, bkgAfter } } —— 老式订舱号会被归一成本系统认的写法（bkgAfter）。
//
// 号码写法（站方口径）：BL 号输入**不含 ONEY 前缀**的后 12 位（如 NB3JJE454300）；订舱号如 HAMG12062700。
//   带 ONEY 前缀也照收（本模块自动剥离）。箱号形如 ONEU2000881。
//
// 输出统一结构（与 engine/tracking/maersk.mjs 对齐，供 UI 卡消费）：
//   { ok, number, carrier:'one', docNum, searchType, origin, destination, lastUpdate, status, current, eta,
//     containers:[{ num, size, type, status, lastUpdate,
//                   events:[{ time, utc, activity, city, country, terminal, vessel, voyage, trigger, isCurrent }] }],
//     raw }
//   注：event.time 取港口当地时间（eventLocalPortDate，ONE 的字段本身带 Z 后缀但语义是当地时刻），
//        event.utc 为 UTC 时刻（eventDate）。航运看板习惯以港口当地时间为准。
//   · 无时刻事件（ONE 对部分中转港里程碑不给时间）不进时间线，另存 containers[].undatedEvents + raw —— 不编造时间。

const BASE = 'https://ecomm.one-line.com/api';
const HDRS = {
  'Content-Type': 'application/json',
  Accept: 'application/json',
  Origin: 'https://www.one-line.com',
  Referer: 'https://www.one-line.com/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
};

async function jpost(path, body, timeoutMs) {
  const ac = AbortSignal.timeout(timeoutMs);
  const r = await fetch(BASE + path, { method: 'POST', headers: HDRS, body: JSON.stringify(body), signal: ac });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch { /* 非 JSON */ }
  return { status: r.status, json: j, text: t.slice(0, 400) };
}

async function jget(path, timeoutMs) {
  const ac = AbortSignal.timeout(timeoutMs);
  const r = await fetch(BASE + path, { headers: HDRS, signal: ac });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch { /* 非 JSON */ }
  return { status: r.status, json: j, text: t.slice(0, 400) };
}

/** 归一化输入：去空白/大写；BL/订舱号剥掉 ONEY 前缀；判型。 */
export function normalizeOneNumber(raw) {
  let s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  let searchType = 'BKG_NO';
  if (/^ONE[UY]\d{7}$/.test(s)) searchType = 'CNTR_NO';           // 箱号 ONEU+7
  if (s.startsWith('ONEY') && !/^ONE[UY]\d{7}$/.test(s)) s = s.slice(4); // BL：剥 ONEY 前缀
  return { value: s, searchType };
}

function splitSizeType(containerTypeSize) {
  // 站上两种写法实测都有：`20'DRY ST.` / `40'DRY HC.`（带引号）与 `40H.REEFER`（不带引号）
  const s = String(containerTypeSize || '').trim();
  const m = s.match(/^(\d{2})\s*'?\s*(.*)$/);
  return m ? { size: m[1], type: m[2].trim() } : { size: '', type: s };
}

function toEvents(copEvents) {
  const evs = (copEvents || []).map((e) => ({
    time: e.eventLocalPortDate || e.eventDate || null,
    utc: e.eventDate || null,
    activity: e.eventName || '',
    city: e.location?.locationName || '',
    country: e.location?.countryName || '',
    terminal: e.yard?.yardName || '',
    vessel: e.vessel?.name || e.edhVessel?.name || '',
    voyage: e.vessel?.voyNo || e.edhVessel?.voyNo || '',
    trigger: e.triggerType || '',
    // 归一化层（engine/tracking/normalize.mjs）按 timeType 区分「已发生 ACTUAL / 预计 EXPECTED」，
    // 绝不能把预计事件当成当前位置 —— ONE 站上叫 ESTIMATED，这里翻译成 EXPECTED。
    timeType: e.triggerType === 'ESTIMATED' ? 'EXPECTED' : 'ACTUAL',
    seq: Number(e.copSequence || 0),
    isCurrent: false,
  }));
  const bySeq = (a, b) => (a.seq - b.seq) || String(a.time || '').localeCompare(String(b.time || ''));
  evs.sort(bySeq);
  return evs;
}

/**
 * 把一批事件切成「可上时间线的」与「无时刻的」。
 * 为什么必须切：归一化层只按 time 排序，无时刻的事件（实测存在：中转港的
 * 「Feeder Loading at O/B Inland Port」ONE 就是不给时间）会排到时间线最前面 ——
 * 一条 5 月的事件出现在 4 月事件上面 = 假象。宁可不上时间线，也**不编造时间**；
 * 无时刻的里程碑原样留在 raw 与 undatedEvents 里，不丢信息。
 */
function splitDated(evs) {
  const dated = evs.filter((e) => e.time);
  const undated = evs.filter((e) => !e.time);
  // 全都没时刻（极端情况）：留原样，至少给人看顺序（seq 序在稳定排序下保持）
  if (!dated.length) return { dated: evs, undated: [] };
  const actuals = dated.filter((x) => x.trigger === 'ACTUAL');
  const cur = actuals[actuals.length - 1] || dated[dated.length - 1];
  if (cur) cur.isCurrent = true;
  return { dated, undated };
}

/**
 * 追踪一票 ONE 货物。number = BL 号 / 订舱号 / 箱号（可带 ONEY 前缀）。
 * 返回统一结构；查不到 → { ok:false, error }。
 */
export async function trackOne(number, { timeoutMs = 30000 } = {}) {
  const { value, searchType } = normalizeOneNumber(number);
  if (!value) return { ok: false, number, error: 'empty tracking number' };

  const body = { page: 1, page_length: 20, filters: { search_text: value, search_type: searchType }, timestamp: Date.now() };
  let sr;
  try { sr = await jpost('/v2/edh/containers/track-and-trace/search', body, timeoutMs); }
  catch (e) { return { ok: false, number, error: `search request failed: ${String(e).slice(0, 120)}` }; }
  if (!sr.json) return { ok: false, number, error: `search HTTP ${sr.status}: ${sr.text}` };
  if (sr.json.status && sr.json.status !== 200) {
    // 号码格式不合法 / 网关拒绝：站方返回 APIGEE-ERR-400，对用户等价于「查不到」
    const plural = searchType === 'CNTR_NO' ? 'container' : 'BL/booking';
    return { ok: false, number, error: `no ${plural} found for "${value}" (site rejected the number)`, raw: sr.json };
  }

  let hits = Array.isArray(sr.json.data) ? sr.json.data : [];
  let usedValue = value;

  // 兜底：老式订舱号归一（BL/订舱号查不到时试一次 validate-booking 的 bkgAfter）
  if (!hits.length && searchType === 'BKG_NO') {
    try {
      const v = await jpost('/v2/edh/containers/track-and-trace/validate-booking', { bookingNos: value, timestamp: Date.now() }, timeoutMs);
      const after = v.json?.data?.bkgAfter;
      if (after && after !== value) {
        const sr2 = await jpost('/v2/edh/containers/track-and-trace/search', { ...body, filters: { search_text: after, search_type: 'BKG_NO' } }, timeoutMs);
        if (Array.isArray(sr2.json?.data) && sr2.json.data.length) { hits = sr2.json.data; usedValue = after; }
      }
    } catch { /* 归一失败按原样报无结果 */ }
  }

  if (!hits.length) {
    const plural = searchType === 'CNTR_NO' ? 'container' : 'BL/booking';
    return { ok: false, number, error: `no ${plural} found for "${value}"`, raw: sr.json };
  }

  // 逐票（通常是 1 票）拉完整时间线
  const containers = [];
  for (const h of hits) {
    let evs = toEvents(h.cargoEvents); // 搜索响应自带的粗时间线（3 条左右）
    let raw = null;
    if (h.bookingNo && h.containerNo) {
      try {
        const ce = await jget(`/v2/edh/containers/track-and-trace/cop-events?booking_no=${encodeURIComponent(h.bookingNo)}&container_no=${encodeURIComponent(h.containerNo)}`, timeoutMs);
        const list = ce.json?.data;
        if (Array.isArray(list) && list.length) { evs = toEvents(list); raw = list; }
      } catch { /* 拿不到细时间线就用搜索里的粗事件 */ }
    }
    const { size, type } = splitSizeType(h.containerTypeSize);
    const { dated, undated } = splitDated(evs);
    const cur = dated.find((e) => e.isCurrent) || null;
    const ests = dated.filter((e) => e.trigger === 'ESTIMATED');
    containers.push({
      num: h.containerNo || '?',
      size, type,
      status: h.latestEvent?.eventName || (cur ? cur.activity : ''),
      lastUpdate: h.latestEvent?.date || (cur ? cur.utc || cur.time : null),
      weight: h.weight || '',
      copNo: h.copNo || '',
      eta: ests.length ? ests[ests.length - 1].time : null,
      events: dated,
      undatedEvents: undated,
      rawCopEvents: raw,
      rawSearch: h,
    });
  }

  const allEvs = containers.flatMap((x) => x.events);
  const actuals = allEvs.filter((e) => e.trigger === 'ACTUAL');
  const cur = actuals[actuals.length - 1] || allEvs[allEvs.length - 1] || null;
  const first = hits[0];
  const loc = (o) => (o ? `${o.locationName || ''}${o.countryName ? ' (' + o.countryName + ')' : ''}`.trim() : '');
  const ests = allEvs.filter((e) => e.trigger === 'ESTIMATED');

  return {
    ok: true,
    number,
    carrier: 'one',
    docNum: first.bookingNo || usedValue,
    searchType,
    origin: loc(first.por),
    destination: loc(first.pod),
    lastUpdate: first.latestEvent?.date || (cur ? cur.utc || cur.time : null),
    status: cur ? cur.activity : (first.latestEvent?.eventName || ''),
    current: cur,
    eta: ests.length ? ests[ests.length - 1].time : null,
    vessel: first.vesselVoyage ? `${first.vesselVoyage.vesselName || ''} ${first.vesselVoyage.voyageNo || ''}`.trim() : '',
    containers,
    // raw 供归一化层读取（normalize.mjs 优先用 raw.status 判 phase）
    raw: { search: sr.json, match: first, status: cur ? cur.activity : (first.latestEvent?.eventName || '') },
  };
}

export default trackOne;
