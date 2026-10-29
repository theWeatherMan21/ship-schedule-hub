// Maersk 提单/箱号/订舱号追踪 —— 2026-10-10 首战告捷
// 路径：deep link https://www.maersk.com/tracking/{号} → 页面自请求 api.maersk.com/synergy/tracking/{号}?operator=MAEU
//      → 抓该 XHR 的 JSON（船司自家数据，验证过真单）。
// 输出：统一结构 { ok, number, origin, destination, status, lastUpdate, containers:[{num,type,status,events:[...]}], raw }
//
// ★ 2026-10-29（爹地真机报障）：提单号「官网查得到，插件报查不到」，白等 84 秒。
//   根因：`www.maersk.com.cn` 这个 deep link 的壳资源（main-*.js / track-*.js）全返 302，
//   SPA 起不来 → 页面永远不发 synergy XHR；而 goto 本身是 200（302 的是子资源，不影响导航），
//   旧逻辑「goto 成功就 break」，于是死等到超时。国际站 `www.maersk.com` 同号实测正常。
//   改法 = 按窗口换站：
//     · 每站 8 秒窗口（导航也吃在这个窗口里）——窗口内没抓到 synergy 响应就换下一站；
//     · 整次硬预算 30 秒——到点就如实返回，并把「试过哪些站、各自卡在哪一步」写进结果；
//     · 提单号优先国际站（本次报障的形态），箱号维持国内站优先（实测两边都通）。
//   直连 api.maersk.com.cn 不带浏览器会 401 → 浏览器链路不能去掉，能修的只有「换站与等待」。
import { launch, sleep } from '../browser.mjs';

const HOST_WINDOW_MS = 8000;    // 每站窗口（导航 + 等 XHR 一起算）
const TOTAL_BUDGET_MS = 30000;  // 整次追踪硬预算：到点返回，不许再白等一分钟
const HOSTS_BL = ['https://www.maersk.com', 'https://www.maersk.com.cn'];   // 提单号：国际站优先
const HOSTS_CTR = ['https://www.maersk.com.cn', 'https://www.maersk.com'];  // 箱号：维持现状

// 站点顺序可被环境变量覆盖（逗号分隔）——测试桩靠它指向本地假站，真机默认走上面两组
const hostList = (type) => {
  const env = String(process.env.MAERSK_TRACK_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (env.length) return env;
  return type === 'ctr' ? HOSTS_CTR : HOSTS_BL;
};
const shortHost = (u) => String(u || '').replace(/^https?:\/\//, '');

/** 页面自己说了什么（只取命中的关键词，别把整页文本塞进结果） */
async function pageHint(page) {
  try {
    const raw = await page.evaluate(() => (document.body ? document.body.innerText : '').slice(0, 4000));
    const s = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!s) return '页面空白';
    const m = s.match(/no (?:tracking )?(?:results?|data)|not found|we'?re sorry|something went wrong|查无|无数据|not available/i);
    if (m) return `页面提示「${m[0]}」`;
    return `页面有内容但没发请求（${s.slice(0, 20)}…）`;
  } catch { return ''; }
}

/** 这条 synergy 响应算不算「有数据」 */
const usableJson = (j) => !!(j && !j.error && (j.tpdoc_num || (Array.isArray(j.containers) && j.containers.length)));

export async function trackMaersk(number, { timeoutMs = 45000, ctx = null } = {}) {
  // 格式前置校验（2026-10-28 爹地案例：表里少输一位，8 位数字白跑 73s 才报「抓不到响应」）
  const _n = String(number || '').trim().toUpperCase().replace(/[\s-]/g, '');
  const _isCtr = /^[A-Z]{4}\d{7}$/.test(_n);
  const _isBl = /^[A-Z0-9]{9}$/.test(_n);
  if (!_isCtr && !_isBl) {
    return {
      ok: false, number: String(number), carrier: 'maersk', notFound: true,
      error: `Maersk 单号格式不符（当前 ${_n.length} 位）：提单号应为 9 位、箱号应为 4 字母+7 位 —— 检查是否少输/多输一位`,
    };
  }
  const own = !ctx;
  const c = ctx || (await launch({ headless: true }));
  const page = c.pages()[0] || (await c.newPage());
  let cap = null;        // 可用的响应（有数据）
  let lastCap = null;    // 抓到过但不可用的响应（HTTP 号/空数据，报错时要说清是哪种）
  let capErr = null;     // 抓取失败原因（解析失败 / HTTP 非 200 / 响应无数据）
  const onResp = async (r) => {
    if (!/synergy\/tracking/.test(r.url())) return;
    try {
      const status = r.status();
      if (status !== 200) { capErr = `HTTP ${status}`; return; }
      const j = JSON.parse(await r.text());
      if (usableJson(j)) { cap = { url: r.url(), status, json: j }; capErr = null; }
      else {
        lastCap = { url: r.url(), status, json: j };
        capErr = (j && j.error && (j.error.message || j.error)) || '响应里没有数据';
      }
    } catch (e) { capErr = String(e).slice(0, 120); }
  };
  page.on('response', onResp);
  const tried = [];
  // 硬预算：调用方给得更小就听它的（但仍要给每个站留满一个窗口）
  const budget = Math.min(TOTAL_BUDGET_MS, Math.max(2 * HOST_WINDOW_MS, Number(timeoutMs) || TOTAL_BUDGET_MS));
  const t0 = Date.now();
  try {
    for (const host of hostList(_isCtr ? 'ctr' : 'bl')) {
      if (cap) break;
      const left = budget - (Date.now() - t0);
      if (left < 1200) { tried.push({ host, nav: 'skip', ms: 0, why: `总预算 ${budget}ms 用尽` }); break; }
      const win = Math.min(HOST_WINDOW_MS, left);
      const ht = Date.now();
      cap = null; lastCap = null; capErr = null;
      const rec = { host, nav: '', ms: 0, why: '' };
      // 导航本身也吃这个窗口：超时就当「这个站打不开」，立刻轮到下一个
      try {
        await page.goto(`${host}/tracking/${encodeURIComponent(number)}`, { waitUntil: 'domcontentloaded', timeout: win });
        rec.nav = 'ok';
      } catch (e) {
        rec.nav = 'fail';
        rec.why = `打不开：${String((e && e.message) || e).slice(0, 90)}`;
      }
      if (rec.nav === 'ok') {
        while (!cap && (Date.now() - ht) < win) await sleep(150);
        if (!cap) {
          if (lastCap) rec.why = `返回了但没有数据（${String(capErr || '').slice(0, 60)}）`;
          else if (capErr) rec.why = String(capErr).slice(0, 80);
          else rec.why = (await pageHint(page)) || '窗口内没抓到 synergy 响应';
        }
      }
      rec.ms = Date.now() - ht;
      if (cap) rec.why = '抓到数据';
      tried.push(rec);
    }
  } catch (e) {
    tried.push({ host: '(未开始)', nav: 'fail', ms: Date.now() - t0, why: String((e && e.message) || e).slice(0, 100) });
  }
  try { page.off('response', onResp); } catch { /* 忽略 */ }
  if (own) await c.close().catch(() => {});

  const diag = { hostsTried: tried, budgetMs: budget, elapsedMs: Date.now() - t0 };
  const detail = tried.map((t) => `${shortHost(t.host)} ${((t.ms || 0) / 1000).toFixed(1)}s ${t.why || ''}`).join('；');
  if (!cap) {
    // 两个站都 404 = 官网真的没这个号（不是没抓到）——如实说「查无」，别让用户以为网络坏了
    const all404 = tried.length > 0 && tried.every((t) => /HTTP 404/.test(String(t.why || '')));
    if (all404) {
      return { ok: false, number, carrier: 'maersk', notFound: true, error: `Maersk 查无此单（官网 ${tried.length} 个站都返回 404，确认单号没输错）`, ...diag };
    }
    // 抓到了响应但没数据（查无此号 / 被拒）→ 原样报船司的错，别吞
    if (lastCap) {
      const j = lastCap.json || {};
      return {
        ok: false, number, carrier: 'maersk',
        error: j.error ? (j.error.message || j.error) : `not found / no data（${shortHost(lastCap.url)}）`,
        raw: j, ...diag,
      };
    }
    return { ok: false, number, carrier: 'maersk', error: `Maersk 没抓到追踪数据（试过 ${tried.length} 站：${detail || '无可用站点'}）`, ...diag };
  }
  if (cap.status !== 200 || !cap.json) return { ok: false, number, carrier: 'maersk', error: `HTTP ${cap.status}`, raw: cap.json || null, ...diag };
  const j = cap.json;
  if (j.error || (!j.tpdoc_num && !j.containers)) {
    return { ok: false, number, carrier: 'maersk', error: j.error?.message || j.error || 'not found / no data', raw: j, ...diag };
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
    containers, raw: j, ...diag,
  };
}
