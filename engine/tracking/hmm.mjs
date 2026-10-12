// HMM 提单 / 箱号 / 订舱号 / P-O 追踪 —— 2026-10-10 实测打通（真单 HDMUSHAF36562700）
//
// 通路（三条，逐级降级）：
//   ① 深链：https://www.hmm21.com/e-service/search/index.do?query=<号>
//      —— 这是首页 T&T 小部件 `gotoTrkNTrc()` 唯一做的事（读 TS 源码为证），
//         站点自己 302 到 /e-service/general/trackNTrace/TrackNTrace.do
//   ② 页面 JS 再请求 selectTrackNTrace.do（服务端渲染的**完整结果片段**）
//      —— 整条时间线都在这个片段里（含隐藏的 clsPreviousMoves = 历史全量），不用点「Display Previous Moves」。
//   ③ 片段抓不到时，退回实时 DOM 的 #trackingInfomationDateResultTable.outerHTML（同一份结构）。
//
// 前置：直连 hmm21.com 会被 WAF 顶回 `Access Denied / abnormal connection`（curl 实测 100% 被拒）；
//       真 Chrome（无头新档）+ **先开首页热身** 才稳定拿到结果页。
//
// 输出（与 maersk.mjs 对齐的统一结构）：
//   { ok, number, carrier:'hmm', docNum, origin, destination, departureOrigin, arrivalDestination,
//     lastUpdate, status, current, events:[{time,date,location,activity,mode,vessel}], containers:[], schedule, raw }
import { launch, sleep } from '../browser.mjs';

const HOME = 'https://www.hmm21.com/';
const deepLink = (n) => `https://www.hmm21.com/e-service/search/index.do?query=${encodeURIComponent(String(n).trim().toUpperCase())}`;
// WAF / 限流页的正文特征（原话务必如实回传，别长成「查无结果」）
const BLOCK_RE = /access denied|abnormal connection|access to this site has been limited|security@hmm21\.com/i;
const NODATA_RE = /there is no data found|no data found|please input the valid|is invalid\./i;

function stripTags(s) {
  return String(s || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// —— 片段解析（纯字符串，离线可测；输入 = selectTrackNTrace.do 的响应体或结果容器 outerHTML）——
export function parseHmmFragment(html) {
  const h = String(html || '');
  const out = { events: [], containers: [], schedule: [], blNumbers: [], containersLabel: '', docNumber: '' };

  // 隐藏域：thisBl / thisCntr（站点内部口径，B/L 不含 SCAC 前缀）
  const thisBl = /id="thisBl"\s+value="([^"]*)"/.exec(h);
  if (thisBl) out.docNumber = thisBl[1].trim();

  // B/L 页签列表（一个查询可能命中多票同箱提单）
  const blTab = /id="blTab"[\s\S]*?<\/div>\s*<\/div>/.exec(h);
  if (blTab) {
    for (const m of blTab[0].matchAll(/class="tab"[^>]*>([\s\S]*?)<\/(?:a|span|div)>/g)) {
      const t = stripTags(m[1]);
      if (t) out.blNumbers.push(t);
    }
  }
  if (!out.blNumbers.length && out.docNumber) out.blNumbers = [out.docNumber];

  // Shipment Progress 两端（站点自己的「起运离港 / 到达目的」两个时间）
  // 结构：<div class="location"><div>港名</div><div>标签</div><div>时间</div></div>，全页恰好两处（起点/终点）
  // ⚠️ 外层捕获会把「时间 div 的收尾 </div>」当终止符吃掉 → 内层按 `<div` 切段取文本，别要求配对的 </div>
  const locs = [...h.matchAll(/<div class="location">([\s\S]*?)<\/div>\s*<\/div>/g)].map((m) => {
    const d = m[1].split(/<div\b/).slice(1).map((x) => stripTags(x.slice(x.indexOf('>') + 1).split('</div>')[0]));
    return { port: d[0] || '', label: d[1] || '', time: d[2] || '' };
  });
  if (locs[0]) { out.origin = locs[0].port; out.departureOrigin = locs[0].time; }
  if (locs.length > 1) { out.destination = locs[locs.length - 1].port; out.arrivalDestination = locs[locs.length - 1].time; }

  // Shipment History：所有 tr.clsMoves（含 clsPreviousMoves 隐藏行 = 完整时间线）
  const hist = /id="shipmentProgress"([\s\S]*?)<\/table>/.exec(h);
  if (hist) {
    for (const m of hist[1].matchAll(/<tr class="(clsMoves[^"]*)">([\s\S]*?)<\/tr>/g)) {
      const tds = [...m[2].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((x) => stripTags(x[1]));
      if (tds.length < 4) continue;
      out.events.push({
        date: tds[0] || '', time: tds[1] || '', location: tds[2] || '',
        activity: tds[3] || '', mode: tds[4] || '',
        timeFull: `${tds[0] || ''} ${tds[1] || ''}`.trim(),
        previous: /clsPreviousMoves/.test(m[1]),
      });
    }
  }

  // 箱型/箱量
  const cntrTitle = /id="cntrInfoTitleTable"([\s\S]*?)<\/table>/.exec(h);
  if (cntrTitle) {
    const td = /<td>([\s\S]*?)<\/td>/.exec(cntrTitle[1]);
    out.containersLabel = td ? stripTags(td[1]) : '';
  }

  // Container Information 明细表
  const cntr = /id="containerStatus"([\s\S]*?)<\/table>/.exec(h);
  if (cntr) {
    const body = /<tbody>([\s\S]*)$/.exec(cntr[1]);
    if (body) {
      for (const m of body[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
        const tds = [...m[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((x) => stripTags(x[1]));
        if (tds.length < 5) continue;
        out.containers.push({
          num: tds[1] || '', cargoType: tds[3] || '', typeSize: tds[4] || '', weight: tds[5] || '',
          bl: tds[6] || '', serviceTerm: tds[8] || '',
          blStatus: String(tds[9] || '').split(/ tooltip/i)[0].trim(), seal: tds[10] || '',
          movement: tds[11] || '', lastMovement: tds[12] || '', status: tds[13] || '',
        });
      }
    }
  }

  // Shipment Schedule（Origin / Loading Port / T/S Port / Discharging Port / Destination）
  const sch = /id="cntrChangeArea"([\s\S]*?)<\/table>/.exec(h);
  if (sch) {
    const heads = [...(/<thead>([\s\S]*?)<\/thead>/.exec(sch[1]) || [, ''])[1].matchAll(/<th>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/g)].map((m) => stripTags(m[1]));
    const cols = heads.slice(1); // 第一列是标签列
    for (const m of sch[1].matchAll(/<tr>\s*<th>([\s\S]*?)<\/th>([\s\S]*?)<\/tr>/g)) {
      const label = stripTags(m[1]);
      const vals = [...m[2].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((x) => stripTags(x[1]));
      if (!label || !vals.length) continue;
      const row = { label };
      vals.forEach((v, i) => { row[cols[i] || `col${i + 1}`] = v; });
      out.schedule.push(row);
    }
  }
  return out;
}

/**
 * 追踪一票 HMM 单据。
 * @param {string} number B/L No.（如 HDMUSHAF36562700 / SHAF36562700）/ 箱号 / 订舱号 / P/O 号
 */
export async function trackHmm(number, { timeoutMs = 60000, ctx = null, keepRaw = false } = {}) {
  const own = !ctx;
  const c = ctx || (await launch({ headless: true }));
  const page = c.pages()[0] || (await c.newPage());
  let frag = null;
  const onResp = async (r) => {
    if (!/selectTrackNTrace\.do/i.test(r.url())) return;
    try { frag = await r.text(); } catch { /* 忽略 */ }
  };
  page.on('response', onResp);

  const finish = async (obj) => {
    try { page.off('response', onResp); } catch { /* 忽略 */ }
    if (own) await c.close().catch(() => {});
    return obj;
  };

  try {
    // 首页热身（直连深链易给门户壳；实测首页→深链稳定）
    await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await sleep(2500);

    let text = '', pageUrl = '';
    // 「查无此单」的指纹（实测）：**不跳转**、停在站内搜索页 /e-service/search/index.do 且全 0 条
    const looksNotFound = () => NODATA_RE.test(text)
      || (/\/e-service\/search\/index\.do/i.test(pageUrl) && !/shipment history/i.test(text) && /total 0/i.test(text));
    const settled = () => BLOCK_RE.test(text) || /shipment history/i.test(text) || looksNotFound();
    for (let attempt = 1; attempt <= 2; attempt++) {
      await page.goto(deepLink(number), { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
      const deadline = Date.now() + Math.min(timeoutMs, 45000);
      let polls = 0;
      while (Date.now() < deadline) {
        await sleep(1500);
        polls++;
        text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
        pageUrl = await page.evaluate(() => location.href).catch(() => '');
        // 给足 6s：有效查询会先落在站内搜索页、再跳追踪页，别抢跑判成「无此单」
        if (settled() && (!looksNotFound() || polls >= 4)) break;
      }
      if (settled()) break;
      // 门户壳/白页 → 再热一次身重试（最多 2 轮）
      await page.goto(HOME, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
      await sleep(3000);
    }

    // ① 站点限流 / WAF：如实回传，绝不写成「查无结果」
    if (BLOCK_RE.test(text)) {
      return finish({ ok: false, number, carrier: 'hmm', blocked: true, error: 'access limited（HMM 站点限流/异常连接拦截页）', raw: { pageUrl, text: text.slice(0, 300) } });
    }
    // ② 站点的明确否定 = 业务答案
    if (looksNotFound()) {
      return finish({
        ok: false, number, carrier: 'hmm', notFound: true,
        error: 'HMM 官网检索无此单号（站点未跳转到追踪页，站内搜索结果 Total 0）',
        raw: { pageUrl, text: text.replace(/\s+/g, ' ').slice(0, 300) },
      });
    }
    if (!/shipment history/i.test(text)) {
      return finish({ ok: false, number, carrier: 'hmm', error: '结果页未出现（门户壳/超时）——稍后重查', raw: { pageUrl, text: text.replace(/\s+/g, ' ').slice(0, 300) } });
    }

    // 片段：优先用站点自己的响应（含隐藏历史行），抓不到就用实时 DOM 的结果容器
    let html = frag;
    if (!html) {
      html = await page.evaluate(() => {
        const el = document.getElementById('trackingInfomationDateResultTable');
        return el ? el.outerHTML : (document.body?.innerHTML || '');
      }).catch(() => '');
    }
    const p = parseHmmFragment(html);

    // 「Tracking results are provided by HMM ... : 2026-10-10 Saturday 15:21」（只在实时 DOM 上有）
    const lu = /Tracking results are provided by HMM[^:]*:\s*([^\n]+)/i.exec(text);
    const lastUpdate = lu ? lu[1].trim() : '';

    // 时间线按时间升序（站点是倒序：最新在上；剔掉无日期的空行）
    // 地点→码头：从 Shipment Schedule 的 Location/Terminal 两行拉出对照表（时间线行本身不带码头）
    const locRow = p.schedule.find((r) => r.label === 'Location') || {};
    const terRow = p.schedule.find((r) => r.label === 'Terminal') || {};
    const termOf = {};
    for (const [k, v] of Object.entries(locRow)) {
      if (k !== 'label' && v && terRow[k]) termOf[String(v).toUpperCase()] = terRow[k];
    }
    // Mode 列有两种内容：运输方式（Truck / Feeder）或船名航次（HMM ALGECIRAS 0017W）——按形态分流
    const splitVessel = (mode) => {
      const s = String(mode || '').trim();
      if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return { vessel: '', voyage: '' };
      const m = /^(.*\S)\s+(\S*\d\S*)$/.exec(s);
      return m ? { vessel: m[1], voyage: m[2] } : { vessel: s, voyage: '' };
    };
    // 站点图例：红=已发生（Actual）、蓝=预计。Shipment History 里的行全部是**已发生**的移动 → ACTUAL
    const events = p.events
      .filter((e) => e.date && e.activity)
      .map((e) => {
        const { vessel, voyage } = splitVessel(e.mode);
        return {
          time: e.timeFull, date: e.date, location: e.location, city: e.location,
          terminal: termOf[String(e.location || '').toUpperCase()] || '',
          activity: e.activity, mode: e.mode, vessel, voyage,
          timeType: 'ACTUAL', isCurrent: false,
        };
      })
      .sort((a, b) => String(a.time).localeCompare(String(b.time)));
    if (events.length) events[events.length - 1].isCurrent = true;
    const cur = events[events.length - 1] || null;

    // 统一结构的契约（UI 时间线主来源）：容器条目带 num/size/type/iso/status + events。
    // ⚠️ HMM 的时间线是**提单级**（不分箱），所以只挂在第一只箱上，避免多箱时被 UI 重复渲染；
    //    顶层 events 也保留（识别到该约定的调用方直接用顶层、别两边相加）。
    const boxType = (c) => {
      const m = /^([^/]+)\/(.+)$/.exec(String(c.typeSize || ''));
      return { type: c.cargoType || (m ? m[1].trim() : ''), size: m ? m[2].trim() : '', iso: '' };
    };
    const containers = p.containers.map((c, i) => {
      const t = boxType(c);
      return {
        num: c.num, size: t.size, type: t.type, iso: t.iso,
        cargoType: c.cargoType, weight: c.weight, bl: c.bl, serviceTerm: c.serviceTerm,
        blStatus: c.blStatus, seal: c.seal, lastUpdate: c.lastMovement, lastMovement: c.lastMovement,
        status: c.movement || c.status,
        events: i === 0 ? events : [],
        shipmentLevel: true,
      };
    });

    const raw = {
      pageUrl, fragmentBytes: html.length, hiddenBl: p.docNumber, blNumbers: p.blNumbers,
      containersLabel: p.containersLabel, status: cur ? cur.activity : '',
      last_update_time: lastUpdate,
    };
    if (keepRaw) raw.html = html;

    return finish({
      ok: true, number, carrier: 'hmm',
      docNum: p.blNumbers[0] || p.docNumber || String(number).trim().toUpperCase(),
      blNumbers: p.blNumbers,
      origin: p.origin || '', destination: p.destination || '',
      departureOrigin: p.departureOrigin || '', arrivalDestination: p.arrivalDestination || '',
      lastUpdate, status: cur ? cur.activity : '', current: cur,
      events, containers, schedule: p.schedule, raw,
    });
  } catch (e) {
    return finish({ ok: false, number, carrier: 'hmm', error: String(e).slice(0, 200) });
  }
}
