// 提单追踪结果归一化：各家 tracker 的返回 → UI 需要的统一形状（婉宜 2026-10-10 · UI 卡）
//
// 为什么不改引擎配方文件：配方（maersk.mjs 等）由「船司接入卡」各自维护，本模块只做**只读归一化**，
// 不动别人的文件。有 raw 就用 raw（字段最全、带 ACTUAL/EXPECTED），没有就退回统一结构。
//
// 统一输出（UI 契约）：
// {
//   ok, carrier, number, docNum, origin, destination,
//   siteStatus, phase, lastUpdate, containerCount,
//   containers: [{ num, size, type, iso, status }],
//   current: { time, activity, city, terminal, vessel, voyage, timeType } | null,   // 最新 ACTUAL 事件
//   eta:     { time, city, terminal, activity } | null,                             // 到港/交付预计
//   events:  [{ time, activity, city, terminal, vessel, voyage, timeType, container, isCurrent }]  // 升序
// }
//
// 判定口径（重要，别自作聪明）：
//   · ACTUAL  = 已发生；EXPECTED = 网站给的预计时间 —— **不能把 EXPECTED 当成「当前位置」**。
//     旧版统一结构把「排序最后一条」标成 current，而那往往是未来的预计到港 → 摘要会写成「已到格但斯克」的假象。
//   · phase 只是把网站自己的状态值翻译成人话（IN_PROGRESS → In Transit），不做任何推断。

const A = (s) => String(s || '').toUpperCase();

export function prettyActivity(act) {
  const s = String(act || '').trim();
  if (!s) return '';
  return s.toLowerCase().replace(/[_\s]+/g, ' ').split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

function phaseOf(siteStatus, containers, actuals) {
  const explicit = [...(containers || []).map((c) => A(c.status)), A(siteStatus)];
  if (explicit.some((st) => /^(DELIVERED|COMPLETED|CLOSED|EMPTY CONTAINER RETURNED)$/.test(st))) return 'Completed';
  if (!actuals.length) return 'Planned';
  const last = A(actuals[actuals.length - 1].activity);
  if (/^(EMPTY RETURN|GATE IN OF EMPTY)/.test(last)) return 'Completed';   // 空箱归还=该票结束（YM 实测两形态）；ZIM 短名同覆盖
  if (/^(DELIVERED|GATE.?OUT)$/.test(last) && /IMPORT|DELIVER/i.test(A(siteStatus))) return 'Completed';
  return 'In Transit';
}

/** 从 raw 里抽事件（信息最全：带 ACTUAL/EXPECTED、船名、码头） */
function eventsFromRaw(raw) {
  const out = [];
  if (!raw || !Array.isArray(raw.containers)) return out;
  for (const ct of raw.containers) {
    const num = ct.container_num || '';
    for (const loc of (ct.locations || [])) {
      for (const ev of (loc.events || [])) {
        out.push({
          time: ev.event_time || null,
          activity: prettyActivity(ev.activity),
          city: loc.city || '',
          terminal: loc.terminal || '',
          vessel: ev.vessel_name || '',
          voyage: ev.voyage_num || '',
          timeType: A(ev.event_time_type) || '',
          container: num,
        });
      }
    }
  }
  return out;
}

/** 退回统一结构（老 tracker 没有 raw 时） */
function eventsFromUnified(r) {
  if (Array.isArray(r.events) && r.events.length) {
    return r.events.map((ev) => ({
      time: ev.time || null,
      activity: prettyActivity(ev.activity),
      city: ev.city || '',
      terminal: ev.terminal || '',
      vessel: ev.vessel || '',
      voyage: ev.voyage || '',
      timeType: A(ev.timeType) || '',
      container: ev.container || '',
    }));
  }
  const out = [];
  for (const ct of (r.containers || [])) {
    for (const ev of (ct.events || [])) {
      out.push({
        time: ev.time || null,
        activity: prettyActivity(ev.activity),
        city: ev.city || '',
        terminal: ev.terminal || '',
        vessel: ev.vessel || '',
        voyage: ev.voyage || '',
        timeType: A(ev.timeType) || '',
        container: ct.num || '',
      });
    }
  }
  return out;
}

const timeKey = (e) => String(e.time || '').slice(0, 19);

export function normalizeTracking(r) {
  if (!r || !r.ok) {
    return { ok: false, carrier: r?.carrier || '', number: r?.number || '', error: r?.error || 'no data' };
  }
  const raw = r.raw || null;

  let events = eventsFromRaw(raw);
  if (!events.length) events = eventsFromUnified(r);
  events = events.filter((e) => e.time || e.activity);
  events.sort((a, b) => timeKey(a).localeCompare(timeKey(b)));

  const actuals = events.filter((e) => e.timeType === 'ACTUAL');
  const current = actuals.length ? actuals[actuals.length - 1] : (events.length ? events[events.length - 1] : null);
  if (current) current.isCurrent = true;

  // ETA：优先用网站自己给的「最终交付预计」（raw.containers[].eta_final_delivery），
  // 没有就取第一条「预计」性质的到港/交付事件。**绝不拿已发生的事件当 ETA。**
  let eta = null;
  if (r.eta?.time) {
    eta = { ...r.eta, time: r.eta.time, fromSite: !!r.eta.fromSite };
  } else {
    const siteEta = raw?.containers?.find((c) => c.eta_final_delivery)?.eta_final_delivery;
    if (siteEta) {
      const destCity = r.destination || '';
      eta = { time: siteEta, city: destCity, terminal: '', activity: 'Final delivery', fromSite: true };
    } else {
      const f = events.find((e) => e.timeType === 'EXPECTED'
        && /ARRIV|DISCHARGE|DELIVER|AVAILABLE|GATE.?OUT/.test(A(e.activity)));
      if (f) eta = { time: f.time, city: f.city, terminal: f.terminal, activity: f.activity, fromSite: true };
    }
  }

  const containers = Array.isArray(r.containers) ? r.containers.map((c) => ({
    num: c.num || '', size: c.size || '', type: c.type || '', iso: c.iso || '', status: c.status || '',
  })) : [];

  return {
    ok: true,
    carrier: r.carrier || '',
    number: r.number || '',
    docNum: r.docNum || r.number || '',
    origin: r.origin || (raw?.origin ? `${raw.origin.city || ''} (${raw.origin.country_code || ''})` : ''),
    destination: r.destination || (raw?.destination ? `${raw.destination.city || ''} (${raw.destination.country_code || ''})` : ''),
    siteStatus: raw?.status || r.status || '',
    phase: phaseOf(raw?.status || r.status, r.containers, actuals),
    lastUpdate: raw?.last_update_time || r.lastUpdate || '',
    containerCount: containers.length,
    containers,
    current,
    eta,
    events,
  };
}
