// Maersk 提单/箱号/订舱号追踪 —— 2026-10-10 首战告捷
// 路径：deep link https://www.maersk.com/tracking/{号} → 页面自请求 api.maersk.com/synergy/tracking/{号}?operator=MAEU
//      → 抓该 XHR 的 JSON（船司自家数据，验证过真单：276759780）。
// 输出：统一结构 { ok, number, origin, destination, status, lastUpdate, containers:[{num,type,status,events:[...]}], raw }
import { launch, sleep } from '../browser.mjs';

export async function trackMaersk(number, { timeoutMs = 45000, ctx = null } = {}) {
  const own = !ctx;
  const c = ctx || (await launch({ headless: true }));
  const page = c.pages()[0] || (await c.newPage());
  let cap = null, capErr = null;
  const onResp = async (r) => {
    if (!/synergy\/tracking/.test(r.url())) return;
    try {
      const t = await r.text();
      cap = { url: r.url(), status: r.status(), json: JSON.parse(t) };
    } catch (e) { capErr = String(e).slice(0, 120); }
  };
  page.on('response', onResp);
  try {
    // 国内直连 www.maersk.com 打不开（实测 000/连接失败），但 www.maersk.com.cn 是 200。
    // 两个都试：先国内站，失败再国际站 —— 全程在本项目内兜底，不动用户网络设置。
    const TRACK_HOSTS = ['https://www.maersk.com.cn', 'https://www.maersk.com'];
    let loaded = false, lastErr = null;
    for (const host of TRACK_HOSTS) {
      try {
        await page.goto(`${host}/tracking/${encodeURIComponent(number)}`, { waitUntil: 'domcontentloaded', timeout: Math.max(8000, Math.floor(timeoutMs / TRACK_HOSTS.length)) });
        loaded = true;
        break;
      } catch (e) { lastErr = e; }
    }
    if (!loaded) throw lastErr || new Error('Maersk 站点都打不开');
    const deadline = Date.now() + timeoutMs;
    while (!cap && !capErr && Date.now() < deadline) await sleep(1000);
  } catch (e) { capErr = String(e).slice(0, 140); }
  try { page.off('response', onResp); } catch { /* 忽略 */ }
  if (own) await c.close().catch(() => {});
  if (!cap) return { ok: false, number, error: capErr || 'no tracking response captured' };
  if (cap.status !== 200 || !cap.json) return { ok: false, number, error: `HTTP ${cap.status}`, raw: cap.json || null };
  const j = cap.json;
  if (j.error || (!j.tpdoc_num && !j.containers)) {
    return { ok: false, number, error: j.error?.message || j.error || 'not found / no data', raw: j };
  }
  const containers = (j.containers || []).map((ct) => {
    const evs = [];
    for (const loc of (ct.locations || [])) {
      for (const ev of (loc.events || [])) {
        evs.push({ time: ev.event_time || null, activity: ev.activity || '', kind: ev.event_time_type || '', city: loc.city || '', terminal: loc.terminal || '', vessel: ev.vessel_name || '', voyage: ev.voyage_num || '', isCurrent: false });
      }
    }
    evs.sort((a, b2) => String(a.time || '').localeCompare(String(b2.time || '')));
    if (evs.length) evs[evs.length - 1].isCurrent = true;
    return { num: ct.container_num || '?', size: ct.container_size || '', type: ct.container_type || '', iso: ct.iso_code || '', status: ct.status || '', lastUpdate: ct.last_update_time || null, etaFinal: ct.eta_final_delivery || null, events: evs };
  });
  const allEvs = containers.flatMap((x) => x.events);
  allEvs.sort((a, b2) => String(a.time || '').localeCompare(String(b2.time || '')));
  const cur = allEvs[allEvs.length - 1] || null;
  return {
    ok: true, number, carrier: 'maersk', docNum: j.tpdoc_num || number,
    planTasks: (j.activity_plan_tasks || []).map((t) => ({ name: t.task_name || '', closed: !!t.closed })),
    origin: j.origin ? `${j.origin.city || ''} (${j.origin.country_code || ''}) ${j.origin.terminal || ''}`.trim() : '',
    destination: j.destination ? `${j.destination.city || ''} (${j.destination.country_code || ''}) ${j.destination.terminal || ''}`.trim() : '',
    lastUpdate: j.last_update_time || null,
    status: cur ? cur.activity : '',
    current: cur,
    containers, raw: j,
  };
}
