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

// ---------- 箱型/尺寸口径统一（2026-10-14 审阅 P2「箱号 size/type 三家三样，显示 22G1'」）----------
// 实测各家给的字段形态完全不同（同一项目里并存）：
//   maersk  size=20  type=DRY    iso=22G1         one  size=40  type="DRY HC."（带句点）
//   cosco   size=40  type=HQ                      cma  size=40  type="(40HC)"（带括号）
//   evergreen / zim / hapag  size 与 type 是**同一个值**（"40" 或 "42GP"）
//   hmm     type=货类  size=从括号里抠的两位
// 旧 UI 一律渲染 `${size}' ${type}` → 出现 "40' (40HC)"、"40' 40"、"22G1'" 这类不伦不类的显示。
// 这里按**行业习惯**（长度 + 箱型简码，如 40'HC / 20'GP）算一个 label；认不出来就返回 ''，
// 由 UI 回退到原样显示 —— 没有的信息绝不猜。
const A_ = (x) => String(x == null ? '' : x).toUpperCase().replace(/[^0-9A-Z]+/g, '');
const LEN_FROM_ISO = { 2: '20', 3: '30', 4: '40', L: '45', M: '48', P: '53' };
const LEN_OK = new Set(['20', '30', '40', '45', '48', '53']);
// 顺序即优先级：冷藏/开顶/框架/罐/散装 先于 高箱/普柜 判（"40RF" 不能被 GC 规则误吃）
const TYPE_RULES = [
  [/REEF|RF/, 'RF'],
  [/OPEN.?TOP|OT/, 'OT'],
  [/FLAT|PLATFORM|FR/, 'FR'],
  [/TANK|TK/, 'TK'],
  [/BULK|BU/, 'BU'],
  [/HIGH.?CUBE|HQ|HC/, 'HC'],
  [/GENERAL|STANDARD|DRY|DV|GP/, 'GP'],
];
// ISO 6346 箱型码后两位 → 箱型族（G=普柜 R=冷藏 U=开顶 P=平台 T=罐 B=散装）
const ISO_TYPE = { G0: 'GP', G1: 'GP', R0: 'RF', R1: 'RF', U0: 'OT', U1: 'OT', P0: 'FR', P1: 'FR', T0: 'TK', T1: 'TK', B0: 'BU', B1: 'BU' };

function containerLength(size, type, iso) {
  const s = A_(size);
  const t = A_(type);
  if (/^\d{2}$/.test(s)) return LEN_OK.has(s) ? s : (LEN_FROM_ISO[s[0]] || '');   // 22 这类 ISO 尺寸码前两位 → 20
  // 「2 数字 + 2 纯字母」直拼写法（Hapag 实测 "45GP"）：数字段命中合法长度时按长度读（45GP → 45'GP）。
  // 与 4 位 ISO 码的区分：45G1 是「数字+字母数字」混合（G1 含数字），不匹配本分支，仍走 ISO（45→40 族）；
  // 42GP 的数字段 42 不是合法长度（LEN_OK）→ 同样落回 ISO 分支（42→40 族）。10-15 双端测试发现
  // （Windows/Mac 同病）：45GP 曾被当 ISO 码读成 40'GP。
  const m2 = /^(\d{2})([A-Z]{2})$/.exec(s);
  if (m2 && LEN_OK.has(m2[1])) return m2[1];
  // 4 位 ISO 尺寸/箱型码（22G1 / 42GP / 45G1）→ 首字符定长度。**必须排在「取开头两位」之前**：
  // 45G1 的 "45" 是「40 尺 + 高箱」，当长度读会变成 45 尺（错）。
  if (/^[0-9A-Z]{4}$/.test(s) && LEN_FROM_ISO[s[0]]) return LEN_FROM_ISO[s[0]];
  if (/^[0-9A-Z]{4}$/.test(t) && LEN_FROM_ISO[t[0]]) return LEN_FROM_ISO[t[0]];
  // 自由文本（10-14 真单实测：MSC 把整段描述塞进 size —— "40' HIGH CUBE REEFER"）→ 取开头的合法长度
  const lead = /^(20|30|40|45|48|53)/.exec(s) || /^(20|30|40|45|48|53)/.exec(t);
  if (lead) return lead[1];
  const i = A_(iso);
  if (/^[0-9A-Z]{4}$/.test(i) && LEN_FROM_ISO[i[0]]) return LEN_FROM_ISO[i[0]];
  return '';
}

function containerType(size, type, iso) {
  const t = A_(type);
  const s = A_(size);
  for (const [re, code] of TYPE_RULES) if (re.test(t)) return code;
  if (/^[A-Z]{2}$/.test(t)) return t;                 // 已是短码（如 OT/FR 被上面吃掉，其它原样）
  // 描述被塞进 size 的情况（MSC："40' HIGH CUBE REEFER"）——T 没给时从 size 找箱型词
  for (const [re, code] of TYPE_RULES) if (re.test(s)) return code;
  const i = A_(iso);
  if (/^[0-9A-Z]{4}$/.test(i)) {
    if (ISO_TYPE[i.slice(2)]) return ISO_TYPE[i.slice(2)];
    for (const [re, code] of TYPE_RULES) if (re.test(i)) return code;
  }
  return '';
}

/** 箱号显示用标签：长度 + 箱型简码（40'HC / 22'GP…）；认不出返回 ''（UI 回退原样）。 */
export function containerLabel(c) {
  if (!c) return '';
  const len = containerLength(c.size, c.type, c.iso);
  const tc = containerType(c.size, c.type, c.iso);
  if (len && tc) return `${len}'${tc}`;
  if (len) return `${len}'`;
  return tc || '';
}

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
  // 修复（10-14 审阅 P0-2）：只认 ACTUAL 为「当前位置」；无 ACTUAL 时不得拿 EXPECTED 兜底
  // （会让 UI 主行把未发生的预计事件显示成现状，与本文件 16-18 行自述口径冲突）。
  const current = actuals.length ? actuals[actuals.length - 1] : null;
  if (current) current.isCurrent = true;

  // ETA：优先用网站自己给的「最终交付预计」（raw.containers[].eta_final_delivery），
  // 没有就取第一条「预计」性质的到港/交付事件。**绝不拿已发生的事件当 ETA。**
  let eta = null;
  if (typeof r.eta === 'string' && r.eta) {
    // 10-14 审阅 C5 防御：个别适配器曾给字符串 → 别再静默丢弃（口径应统一为对象，此处只兜底）
    eta = { time: r.eta, city: '', terminal: '', activity: 'Estimated arrival', fromSite: false };
  } else if (r.eta?.time) {
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

  const containers = Array.isArray(r.containers) ? r.containers.map((c) => {
    const ct = { num: c.num || '', size: c.size || '', type: c.type || '', iso: c.iso || '', status: c.status || '' };
    ct.label = containerLabel(ct);   // 10-14 P2：跨家统一的显示标签（长度+箱型简码，如 40'HC）
    return ct;
  }) : [];

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
