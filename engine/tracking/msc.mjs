// MSC 提单 / 箱号 / 订舱号追踪 —— 2026-10-10（婉宜，XHR 实摸 + 真单实测）
//
// 通路：msc.com 追踪页在提交时打自己的站内接口
//   POST https://www.msc.com/api/feature/tools/TrackingInfo
//   头：content-type: application/json + x-requested-with: XMLHttpRequest（缺它 → 200 空响应，跟船期那条坑同一套）
//   体：{ trackingNumber: <号>, trackingMode: '0' | '1' }
//        '0' = Container/Bill of Lading Number   '1' = Booking Number
//   ★ Akamai 护着（裸 curl 403 Access Denied），必须在 msc.com 页面上下文里 fetch（带它的 cookie）。
//   ★ 另有深链（实测可用，页面自己会查）：?params=base64('trackingNumber='+号+'&trackingMode=0')
//
// 输出：统一结构（与 maersk.mjs 对齐）
//   { ok, number, carrier:'msc', docNum, trackingType, origin, destination, portOfLoad, portOfDischarge,
//     transshipments, lastUpdate, status, eta, delivered, current, lastMove, containers:[...], raw }
import { launch, sleep } from '../browser.mjs';

// 国内直连实测：www.msc.com.cn → 200，www.msc.com → 被挡/403。
// 页面与 API 都用同一个 host，先国内站、失败再国际站（项目内兜底，不动用户网络设置）。
// 爹地实测：国内查 MSC 走 https://www.msccargo.cn（不是 msc.com.cn），/zh/track-a-shipment 返回 200
const MSC_HOSTS = ['https://www.msccargo.cn', 'https://www.msc.com'];
const TRACK_URL = `${MSC_HOSTS[0]}/en/track-a-shipment`;

// API 日期是 dd/MM/yyyy（MSC 瑞士口径，实测 '11/01/2026' = 2026-01-11），可带 ' HH:mm'
export function mscDate(s) {
  const m = String(s || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, mi] = m;
  if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return null;
  return `${yyyy}-${mm}-${dd}${hh ? `T${hh}:${mi}` : ''}`;
}

function parseEvents(ci, serverToday) {
  const evs = (ci.Events || []).map((ev) => {
    const hasVessel = !!(ev.Vessel && (ev.Vessel.IMO || ev.Vessel.FlagName));
    const det = Array.isArray(ev.Detail) ? ev.Detail : [];
    // 有船的航段：Detail[0]=船名, Detail[1]=航次（实测 MSC TARA III / HS552A）；无船事件 Detail 是 ['LADEN'/'EMPTY']
    const vessel = hasVessel ? (det[0] || '') : '';
    const voyage = hasVessel ? (det[1] || '') : '';
    const via = (ev.IntermediaryPortCalls || []).map((p) => ({ name: p.LocationName || '', country: p.Country || '', eta: mscDate(String(p.Eta || '').slice(0, 16)), etd: mscDate(String(p.Etd || '').slice(0, 16)) }));
    const time = mscDate(ev.Date);
    const isEta = /estimated time of arrival/i.test(ev.Description || '');
    // ★ 与 UI 卡归一化层（engine/tracking/normalize.mjs）的契约：timeType 区分「已发生 ACTUAL / 预计 EXPECTED」。
    //   判据用 MSC 自己回包的 CurrentDate（服务端今天）比日期 —— 未来日期的都不是"现状"。
    //   漏了它 → 摘要会把未来的 ETA 当成"当前位置"（归一化层明确禁止的错法）。
    const timeType = (isEta || (time && serverToday && time.slice(0, 10) > serverToday)) ? 'EXPECTED' : 'ACTUAL';
    return {
      time,
      rawTime: ev.Date || '',
      activity: ev.Description || '',
      city: ev.Location || '',
      locode: ev.UnLocationCode || '',
      terminal: (ev.EquipmentHandling && ev.EquipmentHandling.Name) || '',
      terminalCode: (ev.EquipmentHandling && ev.EquipmentHandling.Smdg) || '',
      vessel, voyage,
      imo: (ev.Vessel && ev.Vessel.IMO) || '',
      flag: (ev.Vessel && ev.Vessel.FlagName) || '',
      via: via.length ? via : null,
      order: typeof ev.Order === 'number' ? ev.Order : null,
      isEta,
      timeType,
      kind: timeType,          // 兄弟卡（cosco/one）同款冗余字段，保持各家统一
      isCurrent: false,
    };
  });
  // 排序：先按日期，同日期用 API 自己的 Order（实测 Order 升序 = 时间顺序）
  evs.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')) || ((a.order ?? 0) - (b.order ?? 0)));
  if (evs.length) evs[evs.length - 1].isCurrent = true;
  return evs;
}

// 站内接口调用（必须在该域页面上下文里执行：Akamai 护着，裸 curl 403）
async function apiCall(page, number, mode) {
  return page.evaluate(async ({ n, m }) => {
    try {
      // 相对路径 ⇒ 自动跟随当前页面 origin（国内站/国际站都对）
      const resp = await fetch('/api/feature/tools/TrackingInfo', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/plain, */*',
          'x-requested-with': 'XMLHttpRequest',   // 缺它 → 200 但空响应（与船期同坑）
        },
        body: JSON.stringify({ trackingNumber: n, trackingMode: m }),
      });
      const t = await resp.text();
      let j = null;
      try { j = JSON.parse(t); } catch { /* 非 JSON = 被拦/改版 */ }
      return { status: resp.status, len: t.length, json: j, head: t.slice(0, 200) };
    } catch (e) { return { error: String(e).slice(0, 160) }; }
  }, { n: String(number).trim().toUpperCase(), m: mode }).catch((e) => ({ error: String(e).slice(0, 160) }));
}

export async function trackMsc(number, { timeoutMs = 60000, ctx = null } = {}) {
  const own = !ctx;
  const c = ctx || (await launch({ headless: true }));
  const page = c.pages()[0] || (await c.newPage());
  const out = { ok: false, number, carrier: 'msc', error: null, errorKind: null };
  try {
    // 两级入口（2026-10-10 实测）：轻量页同源即够（2.2-2.7s），拿不到 JSON 再退回完整追踪页
    const NAV = [
      { label: 'page-cn', url: `${MSC_HOSTS[0]}/zh/track-a-shipment`, settle: 0, waitInput: true },
      { label: 'page-com', url: `${MSC_HOSTS[1]}/en/track-a-shipment`, settle: 0, waitInput: true },
      { label: 'light-com', url: `${MSC_HOSTS[1]}/__light__`, settle: 700 },
    ];
    let r = null, navUsed = null;
    for (const t of NAV) {
      try {
        await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      } catch { continue; }
      if (t.settle) await sleep(t.settle);
      if (t.waitInput) {
        for (let i = 0; i < 12; i++) {
          const ready = await page.evaluate(() => !!document.querySelector('#trackingNumber')).catch(() => false);
          if (ready) break;
          await sleep(800);
        }
      }
      const rr = await apiCall(page, number, '0');
      if (rr && rr.json) { r = rr; navUsed = t.label; break; }   // JSON = 通路成立（IsSuccess:false 也是业务答案）
    }
    const apiUsed = navUsed;
    if (!r) {
      // 两级入口都没拿到 JSON：不是"查无此号"，是通路被拦/改版 —— 如实报
      const last = await apiCall(page, number, '0').catch(() => null);
      out.error = `MSC 追踪接口被拦/改版（HTTP ${(last && last.status) || '?'}，非 JSON）: ${String((last && last.head) || '').slice(0, 120)}`;
      out.errorKind = 'blocked';
      return out;
    }
    let mode = '0';
    if (r.json.IsSuccess === false) {
      // 单号可能是订舱号：两种模式各查一次（各自有明确否定文案，不会互相污染）
      const r2 = await apiCall(page, number, '1');
      if (r2 && r2.json && r2.json.IsSuccess === true) { r = r2; mode = '1'; }
    }
    out.nav = apiUsed;
    out.mode = mode;
    if (!r.json.IsSuccess || typeof r.json.Data !== 'object' || !r.json.Data) {
      // 站点自己的明确否定 —— 原话转达，别和"我们没抓到"混成一句
      out.error = typeof r.json.Data === 'string' ? r.json.Data : 'MSC 未返回追踪数据';
      out.errorKind = 'not-found';
      return out;
    }

    const D = r.json.Data;
    // MSC 自己回包的服务端"今天"（dd/MM/yyyy）—— 用来判 ACTUAL / EXPECTED
    const serverToday = mscDate(D.CurrentDate) || new Date().toISOString().slice(0, 10);
    const bols = Array.isArray(D.BillOfLadings) ? D.BillOfLadings : [];
    const containers = [];
    for (const bol of bols) {
      for (const ci of (bol.ContainersInfo || [])) {
        const evs = parseEvents(ci, serverToday);
        const lastActualEv = [...evs].reverse().find((e) => e.timeType === 'ACTUAL') || null;
        containers.push({
          num: ci.ContainerNumber || '?',
          size: ci.ContainerType || '',
          type: '', iso: '',
          status: lastActualEv ? lastActualEv.activity : (evs.length ? evs[evs.length - 1].activity : ''),
          lastUpdate: lastActualEv ? lastActualEv.time : (evs.length ? evs[evs.length - 1].time : null),
          delivered: !!ci.Delivered,
          eta: mscDate(ci.PodEtaDate),
          latestMove: ci.LatestMove || '',
          bolNumber: bol.BillOfLadingNumber || '',
          events: evs,
        });
      }
    }
    const allEvs = containers.flatMap((x) => x.events);
    allEvs.sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')) || ((a.order ?? 0) - (b.order ?? 0)));
    const lastEvent = allEvs[allEvs.length - 1] || null;              // 最新一条（可能是预计）
    const cur = [...allEvs].reverse().find((e) => e.timeType === 'ACTUAL') || null;   // 最新"已发生"
    const g = (bols[0] && bols[0].GeneralTrackingInfo) || {};
    const etaEv = [...allEvs].reverse().find((e) => e.isEta)
      || [...allEvs].reverse().find((e) => e.timeType === 'EXPECTED' && /arriv|discharge|deliver|available/i.test(e.activity))
      || null;
    const etaTime = (containers.map((x) => x.eta).filter(Boolean).sort().pop()) || (etaEv && etaEv.time) || null;
    // 10-14 审阅 C5：统一为对象口径（曾给字符串 → 归一化层只认 r.eta?.time，站点 ETA 被静默丢弃显示 'ETA —'）
    const eta = etaTime ? { time: etaTime, city: g.ShippedTo || '', terminal: '', activity: 'Estimated arrival', fromSite: true } : null;
    const delivered = containers.length > 0 && containers.every((x) => x.delivered);
    // 归一化层读 raw.status 做 siteStatus/phase —— 给它一个能翻译成人话的状态，
    // 别让它拿到"Empty received at CY"却判成 In Transit（已交付的柜子 phase 应为 Completed）
    const siteStatus = delivered ? 'Delivered' : (cur ? cur.activity : '');

    return {
      ok: true, number, carrier: 'msc', mode, nav: apiUsed,
      docNum: D.TrackingNumber || number,
      trackingType: D.TrackingType || '',
      origin: g.ShippedFrom || '',
      destination: g.ShippedTo || '',
      portOfLoad: g.PortOfLoad || '',
      portOfDischarge: g.PortOfDischarge || '',
      transshipments: g.Transshipments || [],
      priceCalculationDate: mscDate(g.PriceCalculationDate),
      resultsLabel: D.TrackingResultsLabel || '',
      siteStatus,
      lastUpdate: cur ? cur.time : (lastEvent ? lastEvent.time : null),
      status: siteStatus,
      current: cur,          // 最新一条"已发生"事件（= 归一化层的 current 口径）
      lastEvent,             // 最新一条事件（可能是未来的 ETA）
      eta,
      delivered,
      containers,
      // raw = MSC 原始 Data（只补一个 status，供归一化层取 siteStatus；兄弟卡 one.mjs 同款做法）
      raw: { ...D, status: siteStatus },
    };
  } catch (e) {
    out.error = String(e).slice(0, 200);
    out.errorKind = 'exception';
    return out;
  } finally {
    if (own) await c.close().catch(() => {});
  }
}
