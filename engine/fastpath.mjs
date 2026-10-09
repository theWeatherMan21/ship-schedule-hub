// fastpath.mjs —— API 优先层（婉宜 9-23）
// 不是什么"官方 API"：就是各家**自己网页查询时发的请求**，原样复制、原样参数。
// 价值：秒级（0.7s vs 浏览器 30-90s）+ 结构化船期（船名/航次/ETD/ETA/航程）。
// 设计：每家一个 adapter；拿不到（被拦/字段不认识）就返回 null，引擎自然回退浏览器填表。
import fs from 'node:fs';
import * as httpsMod from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);   // ESM 里拿 CJS 的 node:sqlite（同步查词典）
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// 词典别名 → 各家 API 需要的 LOCODE（fastpath 只认 LOCODE，比文本稳）
// resolvePort 的结果里已有 locode 字段可直接用；这里只处理没有 locode 时的兜底映射
const UA_CN = ['yangming'];
// MSC 页面上的 data-setting-id（9-23 实测；页面拿不到时兜底）
const MSC_DSID_FALLBACK = '{E9CCBD25-6FBA-4C5C-85F6-FC4F9E5A931F}';
let mscPortTable = null;   // 懒加载：docs/msc-ports-raw.json 的 Ports 数组

// ---------- 工具 ----------
// GUI App（launchd）环境常缺 SSL_CERT_FILE → node fetch 报 unable to get local issuer certificate。
// 首选显式 CA（系统 /etc/ssl/cert.pem）；一次成功后缓存 Agent 复用。
let httpsAgent = undefined;
async function getJSON(url, timeoutMs = 12000, headers = {}) {
  const doFetch = async (dispatcher) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': UA, accept: 'application/json', ...headers }, dispatcher });
      const text = await r.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* 非 JSON（可能是拦截页） */ }
      return { status: r.status, text, json };
    } finally { clearTimeout(timer); }
  };
  try {
    return await doFetch(httpsAgent);
  } catch (e1) {
    const msg = String(e1 && e1.cause || e1);
    if (/certificate/i.test(msg)) {
      // 代理 MITM（Clash TUN 等）或企业 HTTPS 检查：node 不认注入的 CA → 显式加载证书再请求。
      // 平台差异：macOS/Linux 有系统 PEM 包；Windows 没有 PEM 包（走系统证书存储），
      //   所以在 Windows 上按需从证书存储导出一次 PEM 缓存到数据目录（企业代理环境必需）。
      try {
        const fsMod = await import('node:fs');
        const winDataDir = path.join(process.env.LOCALAPPDATA || '', 'ShipScheduleHub');
        const candidates = (process.platform === 'win32'
          ? [
              process.env.SSL_CERT_FILE,
              process.env.NODE_EXTRA_CA_CERTS,
              path.join(winDataDir, 'win-roots.pem'),
              path.join(process.env.USERPROFILE || '', '.hermes', 'clash-ca.pem'),
            ]
          : [
              process.env.SSL_CERT_FILE,
              process.env.NODE_EXTRA_CA_CERTS,
              '/etc/ssl/cert.pem',
              '/opt/homebrew/etc/openssl@3/cert.pem',
              path.join(process.env.HOME || '', '.hermes', 'clash-ca.pem'),
            ]).filter(Boolean);
        let ca = null;
        for (const f of candidates) {
          try { const c = fsMod.readFileSync(f, 'utf8'); if (c.includes('BEGIN CERTIFICATE')) { ca = c; console.error('[fastpath] 用 CA:', f); break; } } catch {}
        }
        // Windows 首次遇到证书错：把系统根证书（机器+用户）导出成 PEM 备用
        if (!ca && process.platform === 'win32') {
          try {
            const { execSync } = await import('node:child_process');
            const { PS_EXE } = await import('./browser.mjs');
            const out = path.join(winDataDir, 'win-roots.pem');
            const ps = [
              `$out = '${out.replace(/'/g, "''")}'`,
              `New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null`,
              `$sb = New-Object System.Text.StringBuilder`,
              `foreach ($st in @('LocalMachine','CurrentUser')) {`,
              `  $s = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', $st)`,
              `  $s.Open('ReadOnly')`,
              `  foreach ($c in $s.Certificates) {`,
              `    [void]$sb.AppendLine('-----BEGIN CERTIFICATE-----')`,
              `    [void]$sb.AppendLine([Convert]::ToBase64String($c.RawData, 'InsertLineBreaks'))`,
              `    [void]$sb.AppendLine('-----END CERTIFICATE-----') }`,
              `  $s.Close() }`,
              `[IO.File]::WriteAllText($out, $sb.ToString())`,
            ].join('; ');
            execSync(`"${PS_EXE}" -NoProfile -NonInteractive -Command "${ps}"`, { stdio: 'ignore', timeout: 30000 });
            const c = fsMod.readFileSync(out, 'utf8');
            if (c.includes('BEGIN CERTIFICATE')) { ca = c; console.error('[fastpath] 已从 Windows 证书存储导出 CA:', out); }
          } catch { /* 导出失败就继续报原错 */ }
        }
        if (!ca) throw new Error('no usable CA file');
        const body = await new Promise((resolve, reject) => {
          const u = new URL(url);
          const req = httpsMod.request({
            hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
            headers: { 'user-agent': UA, accept: 'application/json', ...headers },
            ca,
          }, (res) => {
            let d = '';
            res.on('data', (c) => (d += c));
            res.on('end', () => resolve(d));
          });
          req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
          req.on('error', reject);
          req.end();
        });
        let json = null; try { json = JSON.parse(body); } catch {}
        return { status: 200, text: body, json };
      } catch (e2) {
        return { status: 0, text: '', json: null, error: String(e2).slice(0, 120) };
      }
    }
    return { status: 0, text: '', json: null, error: String(e1).slice(0, 120) };
  }
}

// 日期窗口：现在各家窗口不一（YM 是 DEP 起始日），统一给 [今天, 今天+21天]
function dateWindow(iso, daysArg) {
  const base = iso ? new Date(iso + 'T00:00:00Z') : new Date();
  const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
  const days = Number(process.env.SSH_WIN_DAYS) > 0 ? Number(process.env.SSH_WIN_DAYS) : (daysArg || 35); // SSH_WIN_DAYS 供调窗/探针用
  return { start: fmt(base), end: fmt(new Date(base.getTime() + days * 864e5)) };
}

// "Tue 6th Oct 2026" → "10-06"（各家英文日期统一成 MM-DD，年份另注）
const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
function fmtEn(s) {
  const m = /^\w{3}\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\w{3})\s+(\d{4})$/i.exec((s || '').trim());
  if (!m) return (s || '').replace(/T.*/, '');
  return `${m[3]}-${MONTHS[m[2]] || m[2]}-${String(m[1]).padStart(2, '0')}`;
}

// ---------- YangMing ----------
// GET /api/P2P/GetP2PRoutes?locationCodeFrom=CNNGB&serviceTermFrom=Y&locationCodeTo=TRIST
//                     &serviceTermTo=Y&priorityWay=ALL&dateDefinition=DEP&startDate=20260929&endDate=20261006
// 响应：[{ masterETD, masterETA, transitDays, masterVesselName, masterVoyageCode, routeDetails: [...] }]
async function yangming(origin, dest, dateWin) {
  // YangMing API 规则（9-24 实测）：startDate 必须 >= 今天+4；窗口长度 ≤ 30 天
  const base = dateWin.start;
  const add = (d, n) => { const t = new Date(d.slice(0,4)+'-'+d.slice(4,6)+'-'+d.slice(6,8)+'T00:00:00Z'); t.setUTCDate(t.getUTCDate()+n); return t.toISOString().slice(0,10).replace(/-/g,''); };
  // ★ 10-09：站侧窗口 ≤30 天 → 分两段查（D+4~D+34 / D+34~D+64），凑够 5 条以上（爹地要求每家 ≥5 条）
  const one = async (s0, e0) => {
    const url = 'https://www.yangming.com/api/P2P/GetP2PRoutes'
      + `?locationCodeFrom=${origin}&serviceTermFrom=Y`
      + `&locationCodeTo=${dest}&serviceTermTo=Y`
      + `&priorityWay=ALL&dateDefinition=DEP&startDate=${s0}&endDate=${e0}`;
    const r = await getJSON(url);
    if (r.status !== 200 || !Array.isArray(r.json)) {
      console.error(`[fastpath] yangming status=${r.status} isArray=${Array.isArray(r.json)} err=${r.error || ''} body=${(r.text || '').slice(0, 60)}`);
      return null;
    }
    return r.json;
  };
  let js = await one(add(base, 4), add(base, 34));
  if (js && js.length < 5) {
    const js2 = await one(add(base, 34), add(base, 64));
    if (js2 && js2.length) js = js.concat(js2);
  }
  if (!js) return null;
  const seen = new Set();
  const rows = js.filter((x) => {
    const k = `${x.masterVesselName || ''}|${x.masterVoyageCode || ''}|${x.masterETD || ''}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  }).map((x) => {
    const legs = Array.isArray(x.routeDetails) ? x.routeDetails : [];
    // routeDetails 是逐段航段：最后一段的 locationCodeTo = 目的港；中间段的 locationCodeTo = 中转港
    const finalCode = (x.placeOfDeliveryCode || '').toUpperCase();
    const vias = legs.slice(0, -1)
      .map((d) => d.locationNameTo || d.locationCodeTo || '')
      .filter((n) => n && n.toUpperCase() !== finalCode);
    return {
      vessel: x.masterVesselName || '',
      voyage: x.masterVoyageCode || x.masterComnVoyage || '',
      etd: x.masterETD || '',
      eta: x.masterETA || '',
      transitDays: x.transitDays ?? '',
      via: vias.join(' / '),
      direct: vias.length === 0,
      cutoffCY: x.cutoffCY || '',
      detail: yangmingDetail(x),      // 逐段航程 + CY 截关
    };
  });
  if (!rows.length) return { rows, note: '窗口内无船期' };
  return { rows, note: `API 直查 ${rows.length} 条` };
}

// ---------- ONE（第一档：node 直连，9-29 实测）----------
// GET /api/v1/schedule/point-to-point?porCode=CNNGB&delCode=TRIST&rcvTermCode=Y&deTermCode=Y&tsFlag=
//     &fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD&cargoNature=GP&searchType=List&sourcePage=schedule
// 要点（9-29 婉宜实测，证据 qa/probe-out/one-api-raw.json）：
//   ① 无鉴权、无 cookie：node 直连 200（node fetch 撞 Clash MITM 证书 → getJSON 的 https+CA 兜底）
//   ② 响应 { scheduleLines:[ { sailInfo:[{vvd, vsslName, departureDate, arrivalDate, serviceLaneCode}],
//      journeys:[{vesselName, departureDate, berthingDate, transitTime, podName, ...}],
//      displayTransitDays:"26", totalTransshipment:0, transshipmentType:"DIRECT",
//      podArrivalDate, cct/dct 截止 } ] } —— 每条 scheduleLine = 一条船期
//   ③ porCode/delCode 用 UN LOCODE（CNNGB/TRIST）；rcvTermCode/deTermCode Y=CY
//   ④ 窗口 = 42 天（6 周）—— 9-30 实测：14 天只有 2 条（用户报「ONE 怎么才两条」），
//      42 天 8 条；而 >42 天（8/10 周）接口直接返回 0 条 —— 所以 42 是上限，不要再加。
//      与官网深链 nextWeekValue=14 的差别就在这里：官网默认只给 2 周，所以官网上也显得少。
async function one(origin, dest, dateWin) {
  const base = dateWin.start;
  const t = new Date(`${base.slice(0, 4)}-${base.slice(4, 6)}-${base.slice(6, 8)}T00:00:00Z`);
  // ★ 10-09：单窗口上限 42 天（>42 接口返 0）→ 不足 5 条时补第二段窗口（爹地要求每家 ≥5 条）
  const q = async (offset) => {
    const from = new Date(t.getTime() + offset * 864e5);
    const to = new Date(t.getTime() + (offset + 42) * 864e5);
    const url = 'https://ecomm.one-line.com/api/v1/schedule/point-to-point'
      + `?porCode=${origin}&delCode=${dest}&rcvTermCode=Y&deTermCode=Y&tsFlag=`
      + `&fromDate=${from.toISOString().slice(0, 10)}&toDate=${to.toISOString().slice(0, 10)}`
      + '&cargoNature=GP&searchType=List&sourcePage=schedule';
    // 偶发 miss（并发/限速抖动）→ 重试一次再放弃
    let r = await getJSON(url);
    if (r.status !== 200 || !r.json) r = await getJSON(url);
    if (r.status !== 200 || !r.json || !Array.isArray(r.json.scheduleLines)) {
      console.error(`[fastpath] one status=${r.status} err=${r.error || ''} body=${(r.text || '').slice(0, 120)}`);
      return null;
    }
    return r.json.scheduleLines;
  };
  let lines = await q(0);
  if (lines && oneRowsFromLines(lines).length < 5) {
    const l2 = await q(42);
    if (l2 && l2.length) lines = lines.concat(l2);
  }
  if (!lines) return null;
  const rows = oneRowsFromLines(lines);
  if (!rows.length) return null;
  return { rows, note: 'API 直查 ' + rows.length + ' 条' };
}

// scheduleLines → 统一行（配方兜底也复用这条映射，避免两处口径漂移）
export function oneRowsFromLines(lines) {
  const rows = [];
  for (const ln of (lines || []).slice(0, 12)) {
    const js = Array.isArray(ln.journeys) ? ln.journeys.filter((x) => x && x.departureDate) : [];
    const sail = (Array.isArray(ln.sailInfo) ? ln.sailInfo[0] : null) || {};
    const first = js[0] || {}; const last = js[js.length - 1] || first;
    const etd = String(first.departureDate || sail.departureDate || ln.polDepartureDate || '').slice(0, 10);
    const eta = String(last.berthingDate || sail.arrivalDate || ln.podArrivalDate || '').slice(0, 10);
    if (!etd || !eta) continue;
    rows.push({
      vessel: sail.vsslName || String(first.vesselName || '').replace(/\s+[A-Z0-9]{4}\d{4,}[A-Z]?$/, '') || '',
      voyage: sail.vvd || '',
      etd, eta,
      transitDays: Number(ln.displayTransitDays) || daysBetween(etd, eta),
      via: js.length > 1 ? (first.podName || first.podYardName || '') : '',
      direct: js.length <= 1 && (Number(ln.totalTransshipment) || 0) === 0,
      cutoffCY: ln.cct || '',
      detail: oneDetail(ln),          // 逐段航程 + 三类截单（cct/dct/inlandCct）
    });
  }
  rows.sort((a, b) => (a.etd > b.etd ? 1 : -1));
  return rows;
}

const ADAPTERS = { yangming, one };

// ---------- 入口 ----------
// 返回 null = 该家没有可用 fastpath（引擎回退浏览器填表）
export async function tryFastPath(carrierId, originLocode, destLocode, isoDate) {
  const fn = ADAPTERS[carrierId];
  if (!fn) return null;
  if (!originLocode || !destLocode) return null;
  // 同组港码兜底（爹地 10-09 点透的根因）：船司对同一座城市用的**码头码**不同 ——
  // 天津 = CNTNJ（市）/ CNTXG（新港，集装箱码头）。主码没结果显示时换同组码再试：
  // MSC 实测 CNTNJ 空手、CNTXG 出 7 条。每侧最多 2 个码 → 最多 4 次尝试，首次出结果即停。
  const oList = (Array.isArray(originLocode) ? originLocode : [originLocode]).filter(Boolean).slice(0, 2);
  const dList = (Array.isArray(destLocode) ? destLocode : [destLocode]).filter(Boolean).slice(0, 2);
  try {
    const win = dateWindow(isoDate);
    const t0 = Date.now();
    for (const o of oList) {
      for (const d of dList) {
        const out = await fn(o, d, win);
        if (out && Array.isArray(out.rows) && out.rows.length) {
          const same = o === oList[0] && d === dList[0];
          return { carrier: carrierId, ms: Date.now() - t0, ...out, note: same ? out.note : `${out.note}（同组港码 ${o}→${d}）` };
        }
      }
    }
    // 所有码都试过、接口都通了，但**确实没船期** —— 把这个信息带出去，
    // 让上层别再无谓地死等页面兜底（阳明 天津→海法 实测：接口 0 条，白等 60s）
    return { carrier: carrierId, rows: [], apiEmpty: true, ms: Date.now() - t0, note: '接口查无此线' };
  } catch (e) {
    console.error(`[fastpath] ${carrierId} 异常: ${String(e && e.stack ? e.stack.split('\n')[0] : e).slice(0, 150)}`);
    return null; // fastpath 永不抛错：失败就回退浏览器
  }
}

// ---------- MSC（第二档：浏览器上下文内 fetch）----------
// MSC 的 API 被 Akamai 护着：无痕 fetch 403；带 profile cookie 的页面内 fetch 能过（9-23 实测）。
// 三要素（全部实测得出）：
//   ① body: {FromDate:"YYYY-MM-DD", fromPortId:441, toPortId:106, language:"en", dataSourceId:"{GUID}"}
//      - PortId 来自 GetAllAvailableCountriesAndPorts 全量表（docs/msc-ports-raw.json，580 港）
//      - dataSourceId 是页面 [data-setting-id] 的 GUID，每站固定
//   ② 头: x-requested-with: XMLHttpRequest（缺它 → 200 但返回空字符串 ""！）
//   ③ 必须在 MSC 自己的页面上下文里 fetch（带它的 cookie）
export async function mscInPage(page, originLocode, destLocode, isoDate) {
  if (!mscPortTable) {
    // 优先 db/ports.db（部署态打包在 Resources/db/），docs/*.json 是开发态备份
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(path.join(__dirname, '../db/ports.db'), { readOnly: true });
      mscPortTable = db.prepare('SELECT PortId, LocationName, LocationCode, CountryIsoCode FROM msc_ports').all();
      db.close();
    } catch {
      try { mscPortTable = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/msc-ports-raw.json'), 'utf8')).Ports; } catch { return null; }
    }
    if (mscPortTable && mscPortTable.length) console.error(`[fastpath] MSC 港口表 ${mscPortTable.length} 港已加载`);
  }
  const F = mscPortTable.find((p) => p.LocationCode === String(originLocode || '').toUpperCase());
  const T = mscPortTable.find((p) => p.LocationCode === String(destLocode || '').toUpperCase());
  if (!F || !T) return null;                       // MSC 没挂靠的港 → 交给浏览器
  const win = dateWindow(isoDate);
  const r = await page.evaluate(async ({ fromPortId, toPortId, fromDate, dataSourceId }) => {
    try {
      const el = document.querySelector('[data-setting-id]');
      const dsid = el ? el.dataset.settingId : dataSourceId;
      const resp = await fetch('/api/feature/tools/SearchSailingRoutes', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/plain, */*',
          'x-requested-with': 'XMLHttpRequest',   // 没有它 → 200 + 空响应（9-23 踩坑）
        },
        body: JSON.stringify({ FromDate: fromDate, fromPortId, toPortId, language: 'en', dataSourceId: dsid }),
      });
      const t = await resp.text();
      let p = null; try { p = JSON.parse(t); } catch { return { error: 'non-json len=' + t.length }; }
      return p;
    } catch (e) { return { error: String(e).slice(0, 120) }; }
  }, { fromPortId: F.PortId, toPortId: T.PortId, fromDate: `${win.start.slice(0,4)}-${win.start.slice(4,6)}-${win.start.slice(6,8)}`, dataSourceId: MSC_DSID_FALLBACK }).catch(() => null);
  if (!r || r.error || r.IsSuccess === false || !Array.isArray(r.Data)) return null;
  // FromDate 语义（9-24 实测）：返回从该日起 ~6 周内所有班次；Data 按航线聚合，
// 每条 Data[i].Routes 是多班次数组 —— 每班一行，不是只取第一班
const rows = [];
for (const x of r.Data) {
  for (const leg0 of (Array.isArray(x.Routes) ? x.Routes : [x.Routes || {}]).slice(0, 12)) {
    const etd = fmtEn((leg0.EstimatedDepartureDateFormatted || x.EstimatedDepartureTimeFormatted || '').slice(0, 20));
    const eta = fmtEn((leg0.EstimatedArrivalDateFormatted || x.EstimatedArrivalTimeFormatted || '').slice(0, 20));
    if (!etd || !eta) continue;
    // 9-24 实测字段名：航次=DepartureVoyageNo；每班自己的 transit=TotalTransitTime(Hours)（x 级的是聚合值，会错）
    const tdH = leg0.TotalTransitTimeHours != null ? leg0.TotalTransitTimeHours : x.TransitTimeHours;
    const tdays = tdH != null ? Math.round(tdH / 24) : (leg0.TotalTransitTime || x.TransitTime || '');
    rows.push({
      vessel: leg0.VesselName || '',
      voyage: leg0.DepartureVoyageNo || leg0.VoyageNumber || leg0.VoyageCode || leg0.Voyage || '',
      etd, eta,
      transitDays: tdays,
      via: x.RoutingType === 'Direct' ? '' : (x.Key && x.Key.ViaPortName || (x.Routes || []).slice(1).map((lg) => lg.PortOfLoad || lg.PortOfLoading || '').filter(Boolean)[0] || ''),
      direct: x.IsDirectRoute === true || x.RoutingType === 'Direct',
      // ── 详情（婉宜 9-30 · 爹地要「点一下看航程和截单」）──
      // 这些字段本来就在同一个响应里，之前全丢了。严格按官网返回值呈现，不做推断。
      detail: mscDetail(x, leg0),
    });
  }
  if (rows.length >= 12) break;
}
if (!rows.length) return null;
return { rows, note: 'API 直查 ' + rows.length + ' 条' };
}

// ── 详情归一化（婉宜 9-30：ONE / 阳明 / COSCO / ZIM 的原始响应里本来就带这些，之前全丢了）──
// 口径说明：截单时间一律**按官网返回值原样呈现**，不做时区换算、不做格式改写。
// 同一船的原始行可能是「不同目的码头」的备选，而不是连续航段 —— 按 起/到/码头 去重，保留首次出现的顺序
function dedupeLegs(legs) {
  const seen = new Set(); const out = [];
  for (const l of legs || []) {
    // 同一「起运港+开船时间」= 同一班实体（COSCO 同一船会有多个目的码头备选行）；真实中转段的 ETD 必然不同
    const k = l.etd ? `${l.from}|${l.etd}` : `${l.from}|${l.to}|${l.toTerminal || ''}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push({ ...l, seq: out.length + 1 });
  }
  return out;
}

function mkDetail({ service = '', routing = '', co2 = '', legs = [], cutoffs = {} } = {}) {
  const cleanLegs = (legs || []).filter((l) => l && (l.from || l.to || l.vessel));
  const cleanCuts = Object.fromEntries(Object.entries(cutoffs || {}).filter(([, v]) => v));
  if (!cleanLegs.length && !Object.keys(cleanCuts).length) return undefined;
  return { service, routing, co2, legs: cleanLegs, cutoffs: cleanCuts };
}

// ONE：journeys[] 是逐段航程（含码头名），cct/dct/inlandCct 是三类截单
function oneDetail(ln) {
  const js = Array.isArray(ln.journeys) ? ln.journeys : [];
  const sail = (Array.isArray(ln.sailInfo) ? ln.sailInfo[0] : null) || {};
  const legs = js.map((j, i) => ({
    seq: i + 1,
    from: j.polName || '',
    fromCode: j.polCode || '',
    fromTerminal: j.polYardName || '',
    etd: String(j.departureDate || '').slice(0, 16),
    to: j.podName || '',
    toCode: j.podCode || '',
    toTerminal: j.podYardName || '',
    eta: String(j.berthingDate || '').slice(0, 16),
    vessel: j.vsslName || j.vesselName || '',
    service: j.serviceLaneName || j.serviceLane || '',
    co2: '',
    calls: [],
  }));
  return mkDetail({
    service: (legs[0] && legs[0].service) || sail.serviceLaneName || '',
    routing: js.length > 1 ? 'Via' : 'Direct',
    legs,
    cutoffs: { 'CY 截关': ln.cct || '', '文件截止': ln.dct || '', '内陆截关': ln.inlandCct || '' },
  });
}

// 阳明：routeDetails[] 逐段航段（含码头名），顶层带 cutoffCY / cutoffSI / cutoffVGM 三类截单
function yangmingDetail(x) {
  const legs = (Array.isArray(x.routeDetails) ? x.routeDetails : []).map((d, i) => ({
    seq: d.detailSeq || i + 1,
    from: d.locationNameFrom || '',
    fromCode: d.locationCodeFrom || '',
    fromTerminal: d.terminalNameFrom || '',
    etd: String(d.etd || '').replace(/\//g, '-').slice(0, 16),
    to: d.locationNameTo || '',
    toCode: d.locationCodeTo || '',
    toTerminal: d.terminalNameTo || '',
    eta: String(d.eta || '').replace(/\//g, '-').slice(0, 16),
    vessel: d.vesselName || '',
    service: d.serviceCode || '',
    co2: '',
    calls: [],
  }));
  return mkDetail({
    service: (legs[0] && legs[0].service) || '',
    routing: (Number(x.transshipment) || legs.length > 1) ? 'Via' : 'Direct',
    legs,
    cutoffs: { 'CY 截关': x.cutoffCY || '', '提单指示': x.cutoffSI || '', 'VGM 截止': x.cutoffVGM || '' },
  });
}

// 赫伯罗特截单码 → 中文备注（代码本身照原样显示，备注只是帮助理解，不改变口径）
const HAPAG_CUT_NAMES = {
  FCO: '满箱截关', LCO: '晚到截关', VCO: 'VGM/重量', DOC: '单证', SHI: '提单指示',
  DGD: '危险品申报', OOG: '超限箱', REF: '冷藏箱',
};

// 赫伯罗特单班详情：legs（含码头名/IMO/呼号/服务名）+ gateInCutOffDateTimes
function hapagDetail(x) {
  const legs = (Array.isArray(x.legs) ? x.legs : []).map((lg, i) => {
    const dep = lg.departureLocation || {}; const arr = lg.arrivalLocation || {};
    const vd = lg.vesselDetails || {};
    return {
      seq: i + 1,
      from: dep.locationName || '', fromCode: dep.unLocationCode || '', fromTerminal: dep.name || '',
      etd: String(lg.departureDateTime || '').slice(0, 16).replace('T', ' '),
      to: arr.locationName || '', toCode: arr.unLocationCode || '', toTerminal: arr.name || '',
      eta: String(lg.arrivalDateTime || '').slice(0, 16).replace('T', ' '),
      vessel: vd.name || '', imo: vd.imoNumber || '', built: '', flag: vd.callSign ? `呼号 ${vd.callSign}` : '',
      service: lg.serviceName ? `${lg.serviceName}${lg.serviceCode ? ' (' + lg.serviceCode + ')' : ''}` : (lg.serviceCode || ''),
      co2: '', calls: [],
    };
  });
  const cutoffs = {};
  for (const g of (Array.isArray(x.gateInCutOffDateTimes) ? x.gateInCutOffDateTimes : [])) {
    const code = g.cutOffDateTimeCode || '';
    const when = String(g.cutOffDateTime || '').replace('T', ' ');
    if (!code || !when) continue;
    const zh = HAPAG_CUT_NAMES[code];
    cutoffs[zh ? `${code}（${zh}）` : code] = when;
  }
  return mkDetail({
    service: (legs.find((l) => l.service) || {}).service || '',
    routing: (Number(x.transitTimeInDays) ? (legs.filter((l) => l.service).length > 1 ? 'Via' : 'Direct') : ''),
    legs,
    cutoffs,
  });
}

// 由设施码前缀取港口名（马士基只给 facilityCode，如 CNNPOMT → CNNPO → Ningbo）
let _portNameMap = null;
function portNameByFacility(code) {
  const loc = String(code || '').toUpperCase().slice(0, 5);
  if (loc.length < 5) return '';
  try {
    if (!_portNameMap) {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(path.join(__dirname, '..', 'db', 'ports.db'), { readOnly: true });
      _portNameMap = new Map(db.prepare('SELECT locode, name_ascii FROM ports').all().map((r) => [String(r.locode).toUpperCase(), r.name_ascii]));
      db.close();
    }
    return _portNameMap.get(loc) || '';
  } catch { return ''; }
}

// MSC 单班详情：航程（分段/码头/船信息/挂靠港）+ 截单时间（官网原样）
function mscDetail(x, leg) {
  const c = leg.CutOffs || {};
  const legs = (leg.RouteScheduleLegDetails || []).map((l) => ({
    seq: l.LegSequence,
    from: l.DeparturePortName || '',
    fromCode: l.DeparturePortUNCode || '',
    fromTerminal: l.DepartureEquipmentHandlingFacilityName || '',
    etd: (l.EstimatedDepartureTimeFormatted || l.EstimatedDepartureTime || '').slice(0, 24),
    to: l.ArrivalPortName || '',
    toCode: l.ArrivalPortUNCode || '',
    toTerminal: l.ArrivalEquipmentHandlingFacilityName || '',
    eta: (l.EstimatedArrivalTimeFormatted || l.EstimatedArrivalTime || '').slice(0, 24),
    vessel: (l.Vessel && l.Vessel.VesselName) || '',
    imo: (l.Vessel && l.Vessel.VesselImoCode) || '',
    built: (l.Vessel && l.Vessel.VesselBuiltYear) || '',
    flag: (l.Vessel && l.Vessel.VesselFlag) || '',
    service: l.MaritimeServiceName || '',
    co2: l.CO2FootPrint || '',
    // 挂靠港序列（该船这一程沿途挂的港）
    calls: (l.PortCalls || []).map((pc) => `${pc.PortName || ''}${pc.PortCode ? '(' + pc.PortCode + ')' : ''}`).filter(Boolean),
  }));
  const cut = [
    ['CY 截关', c.ContainerYardCutOffDate],
    ['VGM 截止', c.VerifiedGrossMassCutOffDate],
    ['提单指示', c.ShippingInstructionsCutOffDate],
    ['危险品', c.DangerousCargoCutOffDate],
    ['冷藏箱', c.ReeferCutOffDate],
  ].filter(([, v]) => v);
  return {
    service: (legs[0] && legs[0].service) || x.LoadingService || '',
    routing: x.RoutingType || (x.IsDirectRoute ? 'Direct' : ''),
    co2: leg.CO2FootPrint || x.CO2FootPrint || '',
    legs,
    cutoffs: Object.fromEntries(cut),
  };
}

// ---------- COSCO（第二档：页面内 fetch）----------
// 三步（全部实测 9-23）：
//   ① GET /ebbase/public/general/findCityDistrictByPrefix?prefix=ningbo → cityUuid（注意 COSCO 用 CNNBO！）
//   ② POST /ebschedule/public/purpoShipmentWs {fromDate,originCityUuid,destinationCityUuid,originCity:"Ningbo,Ningbo,Zhejiang,China,CNNBO",...}
//   ③ 响应 data.content.data[]: {vessel, voyage, etd, eta, cutOff, pol, pod, outbound/inboundFacilityName}
export async function coscoInPage(page, originLocode, destLocode, isoDate, oName, dName) {
  // 窗口 84 天（9-30 实测：35 天 5 条 / 56 天 7 条 / 84 天 11 条；MSC 不受此参数影响，仍走自己的 6 周逻辑）
  const win = dateWindow(isoDate, 84);
  const fromDate = `${win.start.slice(0, 4)}-${win.start.slice(4, 6)}-${win.start.slice(6, 8)}`;
  const toDate = `${win.end.slice(0, 4)}-${win.end.slice(4, 6)}-${win.end.slice(6, 8)}`;
  const r = await page.evaluate(async ({ fromLocode, toLocode, fromDate, toDate, oName0, dName0 }) => {
    try {
      const geo = async (kw) => (await (await fetch('/ebbase/public/general/findCityDistrictByPrefix?prefix=' + kw, { headers: { accept: 'application/json' } })).json()).data.content;
      // COSCO 用自己的 LOCODE 体系（Ningbo=CNNBO）：拿全部候选，按后缀匹配
      // COSCO 的 geo 接口只认城市名前缀（不认 LOCODE）；常用中国港口映射，其他用 LOCODE 后 3 位城市名兜底
      const CITY = { CNNGB: 'ningbo', CNNBO: 'ningbo', CNSHA: 'shanghai', CNTAO: 'qingdao', CNSZX: 'shenzhen', CNSHK: 'shekou', CNYTN: 'yantian', CNNSA: 'nansha', CNNNP: 'nansha', CNTXG: 'tianjin', CNXMN: 'xiamen', CNDLC: 'dalian', TRIST: 'istanbul', NLRTM: 'rotterdam', TRAMR: 'ambarli' };
      // 9-30：locode 无映射时优先用权威港名（如 PLGDN→"Gdansk"），再退 LOCODE 后 3 位 —— 避免 'gdn' 这类无效前缀
      const kw = (locode, name) => CITY[String(locode || '').toUpperCase()] || (name && String(name).toLowerCase()) || String(locode || '').slice(2).toLowerCase();
      const oList = (await geo(kw(fromLocode, oName0))) || [];
      const dList = (await geo(kw(toLocode, dName0))) || [];
      const o = oList.find((x) => x.unloCode === fromLocode) || oList.find((x) => x.unloCode && x.unloCode.startsWith(fromLocode.slice(0, 2))) || oList[0];
      const d = dList.find((x) => x.unloCode === toLocode) || dList.find((x) => x.unloCode && x.unloCode.startsWith(toLocode.slice(0, 2))) || dList[0];
      if (!o || !d) return { error: `city not found: o=${JSON.stringify(oList && oList[0] || null).slice(0, 80)} d=${JSON.stringify(dList && dList[0] || null).slice(0, 80)}` };
      const body = {
        fromDate, pickup: 'B', delivery: 'B', estimateDate: 'D', toDate,
        originCityUuid: o.cityUuid, destinationCityUuid: d.cityUuid,
        originCity: `${o.cityLocName},${o.county || ''},${o.state || ''},${o.country},${o.unloCode}`,
        destinationCity: `${d.cityLocName},${d.county || ''},${d.state || ''},${d.country},${d.unloCode}`,
        cargoNature: 'All',
      };
      const resp = await fetch('/ebschedule/public/purpoShipmentWs', {
        method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
      return await resp.json();
    } catch (e) { return { error: String(e).slice(0, 120) }; }
  }, { fromLocode: originLocode, toLocode: destLocode, fromDate, toDate, oName0: oName, dName0: dName }).catch(() => null);
  if (!r || r.error || r.code !== '200') {
    console.error(`[fastpath] cosco 失败: ${JSON.stringify(r).slice(0, 200)}`);
    return null;
  }
  const rowsRaw = (r.data && r.data.content && r.data.content.data) || [];
  // COSCO 返回的是逐航段（leg），按 vessel+voyage 聚合出「一次运输」
  const trips = new Map();
  for (const x of rowsRaw) {
    const key = `${x.vessel}|${x.voyage}`;
    if (!trips.has(key)) trips.set(key, { vessel: x.vessel || '', voyage: x.extVoyage || x.voyage || '', etd: '', eta: '', via: '', direct: true, cutoffCY: x.cutOff || '', _legs: [] });
    const t = trips.get(key);
    // 每一行原始数据就是一段航程（含挂靠港与码头），顺手留下来做详情
    t._legs.push({
      seq: t._legs.length + 1,
      from: x.pol || '', fromCode: '', fromTerminal: x.outboundFacilityName || x.polFacilityName || '',
      etd: (x.etd || '').slice(0, 16),
      to: x.pod || '', toCode: '', toTerminal: x.inboundFacilityName || x.podFacilityName || '',
      eta: (x.eta || '').slice(0, 16),
      vessel: x.vessel || '', service: x.serviceName || x.service || '', co2: '', calls: [],
    });
    if (x.pol && !t.etd) t.etd = (x.etd || '').slice(0, 16);
    if (x.pod) { t.eta = (x.eta || '').slice(0, 16); }
  }
  const rows = [...trips.values()].filter((t) => t.etd && t.eta).map((t) => {
    const { _legs, ...rest } = t;
    return {
      ...rest,
      transitDays: daysBetween(t.etd, t.eta),
      detail: mkDetail({ routing: _legs.length > 1 ? 'Via' : 'Direct', legs: dedupeLegs(_legs), cutoffs: { 'CY 截关': t.cutoffCY || '' } }),
    };
  });
  if (!rows.length) return null;
  rows.sort((a, b) => (a.etd > b.etd ? 1 : -1));
  return { rows: rows.slice(0, 12), note: 'API 直查 ' + rows.length + ' 条' };
}

function daysBetween(a, b) {
  try {
    const d = (new Date(b.replace(' ', 'T')) - new Date(a.replace(' ', 'T'))) / 864e5;
    return Number.isFinite(d) ? Math.round(d) : '';
  } catch { return ''; }
}

// ---------- Hapag-Lloyd（第二档：页面内 fetch）----------
// 要点（9-23 全部实测）：
//   ① 必须在 hapag 自己页面上下文里 fetch（API 被 Cloudflare 护，直连拿 HTML 挑战页）
//   ② 头 x-token: public（SPA 匿名 token，无时效问题）
//   ③ containerType 必填且只允许 22GP/42GP/45GP/22RT/45RT（错值时 API 会 422 并告知允许列表）
//   ④ 响应 { routes: [{ placeOfReceiptDateTime, placeOfDeliveryDateTime, transitTimeInDays, legs[] }] }
export async function hapagInPage(page, originLocode, destLocode, isoDate) {
  const win = dateWindow(isoDate);
  const startDate = `${win.start.slice(0, 4)}-${win.start.slice(4, 6)}-${win.start.slice(6, 8)}`;
  const r = await page.evaluate(async ({ o, d, startDate }) => {
    try {
      const u = `https://schedule.api.hlag.cloud/api/routes?startLocation=${o}&endLocation=${d}&startDate=${startDate}&startHaulage=MERCHANT&endHaulage=MERCHANT&containerType=42GP`;
      const resp = await fetch(u, { headers: { accept: 'application/json', 'x-token': 'public' } });
      const t = await resp.text();
      let j = null; try { j = JSON.parse(t); } catch { return { error: 'non-json' }; }
      return j;
    } catch (e) { return { error: String(e).slice(0, 120) }; }
  }, { o: originLocode, d: destLocode, startDate }).catch(() => null);
  if (!r || r.error || !Array.isArray(r.routes)) return null;
  const rows = r.routes.slice(0, 12).map((x) => {
    const legs = Array.isArray(x.legs) ? x.legs : [];
    const first = legs[0] || {};
    const last = legs[legs.length - 1] || {};
    // 9-24 实测：船名在 first.vesselDetails.vesselName（locationName 是地名 NINGBO！）
    const vd = first.vesselDetails || {};
    const vessel = vd.vesselName || first.onboardVesselName || first.vesselName || '';
    // 承运航段的船：找第一个 modeOfTransport===VESSEL 的 leg
    const seaLeg = legs.find((lg) => (lg.modeOfTransport || '').toUpperCase() === 'VESSEL') || first;
    const seaVd = seaLeg.vesselDetails || {};
    const via = legs.length > 1 ? (legs.slice(1).map((lg) => (lg.departureLocation && lg.departureLocation.locationName) || '').filter(Boolean)[0] || '') : '';
    return {
      vessel: seaVd.name || seaVd.vesselName || vessel,
      voyage: first.scheduleVoyageNumber || first.voyageNumber || first.voyage || '',
      etd: (x.placeOfReceiptDateTime || '').slice(0, 16).replace('T', ' '),
      eta: (x.placeOfDeliveryDateTime || '').slice(0, 16).replace('T', ' '),
      transitDays: x.transitTimeInDays ?? '',
      via,
      direct: legs.filter((lg) => (lg.modeOfTransport || '').toUpperCase() === 'VESSEL').length <= 1,
      // 逐段航程 + 截单（gateInCutOffDateTimes：官网给的是一组代码，原样呈现 + 中文备注）
      detail: hapagDetail(x),
    };
  }).filter((r2) => r2.etd);
  if (!rows.length) return null;
  return { rows, note: 'API 直查 ' + rows.length + ' 条' };
}

const ZIM_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---------- ZIM（第二档：页面内 fetch）----------
// 要点（9-23 实测）：
//   ① apigw.zim.com 需 subscription-key —— 但它是 SPA 页面自己带在 URL 里的公开 key
//     （ZIM_SUB_KEY，页面明文，非机密），页面内 fetch 带 key 可用
//   ② 日期格式 d-MMMM-yyyy（23-September-2026）；参数 PortCode=CNNGB;0（URL 编码 %3B）
//   ③ 响应 { routes: [[leg,leg,...],...] }，leg.vesselName/portDepartureName/departureDate/arrivalDate/isLandTrans
//   ④ 端口后缀 ;0 = 默认码头级；首段常是驳船(Land Trans)
export async function zimInPage(page, originLocode, destLocode, isoDate, originName, destName) {
  // ★ 2026-10-09 重写（爹地："使用正确的路径"）：改走 ZIM 自己的两条接口，**不再猜港口码后缀、不再填表**。
  //   ① digitalMasterData/Locations/v1/p2p-route?searchTerm=CNNGB  → 拿准确的 { code: "CNNGB;10", locationType }
  //      （必须挑 locationType 含 MARINE 的那条 —— 它才是能装船的港；同名的 LAND 条目是内陆点）
  //   ② digitalSchedules/PointToPoint/v2?PortCode=CNNGB;10&PortDestinationCode=ILASH;10
  //      &Direction=true&FromDate=dd-Month-yyyy&WeeksAhead=6&CountryCode=US&CargoType=true
  //   证据：2026-10-09 实录（qa/probe-zim-correct.mjs、probe-zim-struct.mjs、/tmp/zim-struct.json）
  //   旧实现的三个错：WeeksAhead=4（站点用 6）、码头后缀靠猜 ;0/;10、拿词典 LOCODE 直接当 ZIM 码
  //   （ZIM 对阿什杜德用 ILASH，我们词典是 ILASD → 必空）
  const win = dateWindow(isoDate);
  const r = await page.evaluate(async ({ o, d, oName, dName, from }) => {
    const key = '9d63cf020a4c4708a7b0ebfe39578300';   // 页面自带公开 key（非机密）
    const resolve = async (term) => {
      const u = `https://apigw.zim.com/digitalMasterData/Locations/v1/p2p-route?subscription-key=${key}&searchTerm=${encodeURIComponent(term)}&pageSize=100`;
      const resp = await fetch(u, { headers: { accept: 'application/json' } });
      const j = await resp.json().catch(() => null);
      const list = (j && j.results) || [];
      const marine = list.filter((x) => /MARINE/i.test(x.locationType || ''));
      const hit = marine.find((x) => String(x.code || '').toUpperCase().startsWith(String(term).toUpperCase())) || marine[0] || list[0];
      return hit ? { code: hit.code, name: hit.name, country: hit.country } : null;
    };
    try {
      // ★ 10-09 修：ZIM 的码常与联合国码不同（汉堡是 GEHAM 不是 DEHAM）→ 按码查不到就退回按**港口名**查
      //   （名字是通用语言，实测 Hamburg → GEHAM;10）。不回退的话整条链静默失败 = 用户看到"zim 搜不出来"。
      const resolve2 = async (term, name) => {
        const a = await resolve(term);
        if (a) return a;
        if (name && String(name).toLowerCase() !== String(term).toLowerCase()) return await resolve(name);
        return null;
      };
      const oo = await resolve2(o, oName);
      const dd = await resolve2(d, dName);
      if (!oo || !dd) return { error: 'Locations 解析不到港口（码和名字都试过）' };
      const ask = async (weeks) => {
        const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}`
          + `&PortCode=${encodeURIComponent(oo.code)}&PortDestinationCode=${encodeURIComponent(dd.code)}`
          + `&Direction=true&FromDate=${from}&WeeksAhead=${weeks}&CountryCode=US&CargoType=true`;
        const resp = await fetch(u, { headers: { accept: 'application/json' } });
        const j = await resp.json().catch(() => null);
        return j || null;
      };
      // 先要 12 周（爹地要求每家 ≥5 条）；站侧不认就退回 6 周（站点自己用 6）
      let j = await ask(12);
      if (!j || !Array.isArray(j.midPoints) || !j.midPoints.length) j = await ask(6);
      if (!j) return { error: '接口无响应' };
      return { from: oo, to: dd, midPoints: j.midPoints || [], isSuccess: j.isSuccess };
    } catch (e) { return { error: String(e).slice(0, 120) }; }
  }, { o: originLocode, d: destLocode, oName: originName || '', dName: destName || '', from: `${win.start.slice(6, 8)}-${ZIM_MONTHS[+win.start.slice(4, 6) - 1]}-${win.start.slice(0, 4)}` }).catch(() => null);
  if (!r || r.error || !Array.isArray(r.midPoints) || !r.midPoints.length) return null;
  const sea = (legs) => legs.filter((x) => !x.isLandTrans);
  const rows = r.midPoints.slice(0, 12).map((legs) => {
    if (!Array.isArray(legs) || !legs.length) return null;
    const slegs = sea(legs);
    const main = slegs[0] || legs[0];
    const f = legs[0];
    const l = legs[legs.length - 1];
    const etd = String(f.departureDate || main.departureDate || '').slice(0, 10);
    const eta = String(l.berthArrivalDateTo || l.arrivalDate || '').slice(0, 10);
    if (!etd || !eta) return null;
    const via = slegs.slice(1).map((x) => x.portName).filter((n) => n && n !== ((r.to && r.to.name) || ''));   // 中转港；剔除终点名（接口不直接给中转港字段）
    return {
      vessel: main.vesselName || '',
      voyage: (main.voyageNumber || '') + (main.leg || ''),
      etd,
      eta,
      transitDays: Math.round((new Date(eta) - new Date(etd)) / 86400000) || '',
      via: via.slice(0, 2).join('+'),
      direct: slegs.length <= 1,
      cutoffCY: '',
      detail: mkDetail({
        routing: slegs.length > 1 ? 'Via' : 'Direct',
        legs: slegs.map((x, i) => ({
          seq: i + 1,
          from: x.portName || '', fromCode: x.portCode || '',
          fromTerminal: x.depotName || '',
          etd: String(x.departureDate || '').slice(0, 16),
          to: (slegs[i + 1] && slegs[i + 1].portName) || (i === slegs.length - 1 ? (r.to && r.to.name) || '' : ''),
          eta: String(x.berthArrivalDateTo || '').slice(0, 16),
          vessel: x.vesselName || '', service: x.line || '',
        })),
        extra: main.line ? '航线: ' + main.line : '',
      }),
    };
  }).filter(Boolean);
  if (!rows.length) return null;
  return { rows, note: `接口直查 ${rows.length} 条（ZIM 码 ${r.from.code} → ${r.to.code}）` };
}

// ---------- Maersk（第二档：页面内 fetch）----------
// 9-29 实测（婉宜，证据 qa/probe-out/maersk-inpage-routings.json、qa/probe-out/maersk-deeplink-TRAMB-CY.txt）：
//   ① GET api.maersk.com/synergy/reference-data/geography/locations?cityName=<小写城市名>&pageSize=25&sort=cityName&type=city
//      公开无鉴权；返回 {cityName, maerskGeoLocationId(GEO_ID), maerskRkstCode, unLocCode, countryCode}
//      **cityName 必须小写**：'Ningbo' → 空数组，'ningbo' → 2 城市
//   ② POST api.maersk.com/routing-unified/routing/routings-queries
//      需要两个**页面明文公开常量**头：consumer-key + api-version:1（匿名可取，无登录态）。
//      node 直连被 TLS 指纹拒（fetch 证书错 → https.request 挂死）→ **必须页内 fetch**
//   ③ body：startLocation/endLocation = {dataObject:'CITY', alternativeCodes:[{alternativeCodeType:'GEO_ID',…}]}
//      timeRange earliestTime=今天+1 / latestTime=今天+29（=官网 numberOfWeeks=4 默认窗口）
//   ④ 响应 { routings:[ { estimatedTransitTime:"P25DT22H8M", routingLegs:[ {carriage:{carriageType:'OCEAN',
//      vessel:{vesselName}, vesselPortCallStart:{departureVoyageNumber, estimatedTimeOfDeparture},
//      vesselPortCallEnd:{estimatedTimeOfArrival}}} ] } ] }；官网卡片显示**首段**船名/航次 + 整程 transit
//   ⑤ 城市级 ≠ Maersk 服务港：Istanbul(TRIST) 对 Ningbo 出 HTTP 422 / 官网 "No schedules available"
//      —— 马士基在该航线卖的是 Ambarli Port Istanbul(TRAMB, UN=TRAMR)
//      → 主城市无结果时自动退回「同城其它别名」（istanbul → ambarli → TRAMB）
//   ⑥ SPA 深链（走官网自己的请求，带 auth）也能渲染：
//      /schedules/pointToPoint?from=<GEO>&to=<GEO>&fromRkstCode=CNNPO&toRkstCode=TRAMB
//        &containerIsoCode=45G1&fromServiceMode=CY&toServiceMode=CY&numberOfWeeks=4&dateType=D&date=<D+1>&dateTo=<D+29>
const MAERSK_KEY = 'uXe7bxTHLY0yY0e8jnS6kotShkLuAAqG';
let maerskAltCache = null;
let maerskAltProm = null;
// 同城其它叫法：词典 aliases 里含该城市名的 maersk/un 别名取首词（istanbul → ambarli）
function maerskAltWords(name) {
  return maerskAltLoad().then((all) => {
    const key = String(name || '').toLowerCase().trim();
    if (!key) return [];
    const out = [];
    for (const a of all) {
      if (!a.includes(key)) continue;
      const w = a.split(/\s+/)[0].trim();
      if (w && w !== key && !out.includes(w)) out.push(w);
    }
    return out.slice(0, 2);
  }).catch(() => []);
}
function maerskAltLoad() {
  if (maerskAltCache) return Promise.resolve(maerskAltCache);
  if (!maerskAltProm) {
    maerskAltProm = (async () => {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(path.join(__dirname, '../db/ports.db'), { readOnly: true });
      maerskAltCache = db.prepare("SELECT DISTINCT alias FROM aliases WHERE carrier IN ('maersk','un')").all().map((r) => String(r.alias || ''));
      db.close();
      return maerskAltCache;
    })().catch(() => (maerskAltCache = []));
  }
  return maerskAltProm;
}

// ① 页内解析 GEO_ID / RKST 码（起运 1 个 + 目的按候选顺序多个）
export async function maerskResolve(page, oName, dName, oLocode, dLocode) {
  const dWords = [dName, ...(await maerskAltWords(dName))];
  return page.evaluate(async ({ oName0, dWords0, expectO, expectD, key }) => {
    const geo = async (city) => {
      try {
        // 9-30 修：必须带 Consumer-Key（页面对同一个接口就是这么发的）——
        // 此前只发 accept，土耳其城市会被网关判 API Key Validation Failed(401)，
        // 于是 Maersk 查伊斯坦布尔整家掉兜底。Key 是官网页面明文公开常量。
        const resp = await fetch(`https://api.maersk.com/synergy/reference-data/geography/locations?cityName=${encodeURIComponent(String(city).toLowerCase())}&pageSize=25&sort=cityName&type=city`, { headers: { accept: 'application/json', 'consumer-key': key } });
        const j = await resp.json();
        return Array.isArray(j) ? j : [];
      } catch { return []; }
    };
    // 优先按 UN LOCODE 精确命中（同名前缀城市多时防选错国）
    const pick = (list, locode) => list.find((x) => (x.unLocCode || '').toUpperCase() === String(locode || '').toUpperCase() && locode)
      || list.find((x) => String(x.cityName || '').toLowerCase().startsWith(String(locode || '').slice(2).toLowerCase()) && locode)
      || list[0] || null;
    const wrap = (x) => (x ? { cityName: x.cityName, geo: x.maerskGeoLocationId, rkst: x.maerskRkstCode, code: x.unLocCode, country: x.countryCode } : null);
    const o = wrap(pick(await geo(oName0), expectO));
    if (!o) return { error: 'origin geo not found: ' + oName0 };
    const dList = []; const tried = [];
    for (const w of dWords0) {
      const d = wrap(pick(await geo(w), expectD));
      if (!d) { tried.push(w + ':geo-none'); continue; }
      tried.push(w + '(' + d.rkst + ')');
      dList.push({ word: w, ...d });
      if (dList.length >= 2) break;
    }
    if (!dList.length) return { error: 'dest geo not found; tried ' + tried.join(',') };
    return { o, dList, tried };
  }, { oName0: oName, dWords0: dWords, expectO: oLocode, expectD: dLocode, key: MAERSK_KEY }).catch((e) => ({ error: String(e).slice(0, 150) }));
}

// ② 页内 POST 船期查询 → rows（无结果返回空数组；异常返回 null）
export async function maerskQuery(page, oGeo, dGeo, earliest, latest) {
  const r = await page.evaluate(async ({ oG, dG, e, l, key }) => {
    const body = {
      requestType: 'DATED_SCHEDULES', includeFutureSchedules: true, routingCondition: 'PREFERRED',
      exportServiceType: 'CY', importServiceType: 'CY', brandCode: 'MSL',
      startLocation: { dataObject: 'CITY', alternativeCodes: [{ alternativeCodeType: 'GEO_ID', alternativeCode: oG }], cityCode: '' },
      endLocation: { dataObject: 'CITY', alternativeCodes: [{ alternativeCodeType: 'GEO_ID', alternativeCode: dG }], cityCode: '' },
      timeRange: { routingsBasedOn: 'DEPARTURE_DATE', earliestTime: e, latestTime: l },
      cargo: { cargoType: 'DRY', isTemperatureControlRequired: false },
      carriage: { vessel: { flagCountryCode: '' } },
      equipment: { equipmentSizeCode: '40', equipmentTypeCode: 'HDRY', constructionMaterial: '', isEmpty: false, isShipperOwned: false },
      IsUseOfInternetMarkedRoutesOnly: false,
    };
    try {
      const resp = await fetch('https://api.maersk.com/routing-unified/routing/routings-queries', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'consumer-key': key, 'api-version': '1' },
        body: JSON.stringify(body),
      });
      const t = await resp.text();
      let j = null; try { j = JSON.parse(t); } catch { /* no-op */ }
      return { status: resp.status, routings: (j && j.routings) || [], raw: t.slice(0, 120), full: t };
    } catch (e2) { return { status: 0, routings: [], raw: String(e2).slice(0, 120) }; }
  }, { oG: oGeo, dG: dGeo, e: earliest, l: latest, key: MAERSK_KEY }).catch(() => null);
  return r;
}

// ③ routings → 统一行
export function maerskRowsFromRoutings(routings) {
  const rows = [];
  for (const rt of (routings || []).slice(0, 12)) {
    const all = Array.isArray(rt.routingLegs) ? rt.routingLegs : [];
    const sea = all.filter((l) => ((l.transportMode || {}).transportModeCode || '') === 'MVS' || ((l.carriage || {}).carriageType || '') === 'OCEAN');
    const legs = sea.length ? sea : all;
    const f = legs[0] || {}; const l2 = legs[legs.length - 1] || {};
    const fc = f.carriage || {}; const lc = l2.carriage || {};
    const etd = String((fc.vesselPortCallStart || {}).estimatedTimeOfDeparture || '').slice(0, 10);
    const eta = String((lc.vesselPortCallEnd || {}).estimatedTimeOfArrival || '').slice(0, 10);
    if (!etd || !eta) continue;
    const vias = legs.slice(0, -1).map((x) => (((x.carriage || {}).vesselPortCallEnd || {}).location || {}).facility || {})
      .map((fa) => fa.facilityName || fa.locationName || fa.facilityCode || '').filter(Boolean);
    const m = /P(?:(\d+)D)?(?:T(?:(\d+)H)?)?/.exec(rt.estimatedTransitTime || '') || [];
    const h = (Number(m[1]) || 0) * 24 + (Number(m[2]) || 0);
    rows.push({
      vessel: ((fc.vessel || {}).vesselName) || '',
      voyage: ((fc.vesselPortCallStart || {}).departureVoyageNumber) || '',
      etd, eta,
      // 与 MSC/ZIM 口径一致：总小时数四舍五入到天（官网卡片 "25 days 22 hours" → 26）
      transitDays: h ? Math.round(h / 24) : daysBetween(etd, eta),
      via: vias.join(' → '),
      direct: legs.length <= 1,
      // 逐段航程（马士基 routing 里每段带码头代码/设施、服务名、船名；截单时间在另一个接口，未取）
      detail: mkDetail({
        service: ((f.vesselPortCallStart || {}).departureService || {}).serviceName
          || ((f.carriage || {}).vesselPortCallStart || {}).departureService && ((f.carriage || {}).vesselPortCallStart || {}).departureService.serviceName
          || (rt.routeCode || ''),
        routing: legs.length > 1 ? 'Via' : 'Direct',
        legs: legs.map((lg0, i) => {
          const c = lg0.carriage || {};
          const st = c.vesselPortCallStart || {};
          const en = c.vesselPortCallEnd || {};
          const loc = (o) => (o.location || {});
          return {
            seq: i + 1,
            from: ((loc(st).city || {}).cityName) || loc(st).facilityName || portNameByFacility((loc(st).facility || {}).facilityCode) || '',
            fromCode: (loc(st).facility || {}).facilityCode || '',
            fromTerminal: loc(st).facilityName || '',
            etd: String(st.estimatedTimeOfDeparture || '').replace('T', ' ').slice(0, 16),
            to: ((loc(en).city || {}).cityName) || loc(en).facilityName || portNameByFacility((loc(en).facility || {}).facilityCode) || '',
            toCode: (loc(en).facility || {}).facilityCode || '',
            toTerminal: loc(en).facilityName || '',
            eta: String(en.estimatedTimeOfArrival || '').replace('T', ' ').slice(0, 16),
            vessel: (c.vessel || {}).vesselName || '',
            service: (st.departureService || {}).serviceName || '',
            co2: '', calls: [],
          };
        }),
        cutoffs: {},
      }),
    });
  }
  return rows.filter((x) => x.etd && x.eta);
}

// ④ 页内 API 适配器（引擎 inPageApi 注入用）
export async function maerskInPage(page, originLocode, destLocode, isoDate, oName, dName) {
  if (!page || !oName || !dName) return null;
  const win = dateWindow(isoDate);
  const add = (s, n) => { const t = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const earliest = add(win.start, 1), latest = add(win.start, 57);  // ★ 10-09：8 周（原来 4 周，爹地要求每家 ≥5 条）
  const res = await maerskResolve(page, oName, dName, originLocode, destLocode);
  if (!res || res.error) { console.error(`[fastpath] maersk 港口解析失败: ${res && res.error}`); return null; }
  const tried = [...res.tried];
  for (const d of res.dList) {
    const qr = await maerskQuery(page, res.o.geo, d.geo, earliest, latest);
    if (!qr) { tried.push(d.rkst + ':exception'); continue; }
    tried.push(`${d.rkst}:HTTP${qr.status}/${(qr.routings || []).length}`);
    // 探针用：SSH_DUMP_RAW=maersk 时把原始响应落盘，便于挖字段（不影响正常运行）
    if (process.env.SSH_DUMP_RAW === 'maersk' && qr.full) {
      try {
        const fs = await import('node:fs');
        fs.writeFileSync('/tmp/maersk-raw.json', qr.full);
        console.error('[fastpath] 原始响应已写 /tmp/maersk-raw.json');
      } catch { /* 忽略 */ }
    }
    if (qr.status !== 200 || !qr.routings.length) continue;
    const rows = maerskRowsFromRoutings(qr.routings);
    // 马士基只给设施码（CNNPOMT 这种），首尾港口名用查询上下文补齐（用户输入的就是这两个城市）
    for (const r2 of rows) {
      const lg2 = (r2.detail && r2.detail.legs) || [];
      if (lg2.length) {
        if (!lg2[0].from) lg2[0].from = res.o.cityName || '';
        if (!lg2[lg2.length - 1].to) lg2[lg2.length - 1].to = d.cityName || '';
      }
    }
    if (!rows.length) continue;
    return { rows, note: `API 直查 ${rows.length} 条（${res.o.cityName}(${res.o.rkst}) → ${d.cityName}(${d.rkst})，试过 ${tried.join(',')}）` };
  }
  console.error(`[fastpath] maersk 无船期: ${tried.join(',')}`);
  return null;
}

// ---------- ONE（第三档：深链+读渲染结果）----------
// ONE 的结果页是 next.js 客户端渲染，深链参数自包含查询条件：
//   ?oriLocCdParam=CNNGB&destLocCdParam=TRIST&oriTermCdPara=Y&desTermCdPara=Y
//   &frmDtParam=YYYY-MM-DD&nextWeekValue=14&cargoNature=GP&searchType=List...
// 9-24 实测（婉宜）：ONE hydration 偶发挂掉——直接 goto 深链大概率停在壳页不渲染；
//   唯一稳定顺序 = 先在 one-line.com 主页预热 10-15s → 再 goto 深链 → 轮询等 Total N results/day(s)。
//   60s 仍不渲染返回 null（ONE 站侧问题，用户已知悉），配方保持 prefilled 兜底，不死磕。
export async function oneDeep(page, originLocode, destLocode, isoDate) {
  const d = isoDate || new Date().toISOString().slice(0, 10);
  const y = d.slice(0, 4), m = String(+d.slice(5, 7));
  const u = `https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule?oriLocNmParam=&destLocNmParam=&oriLocCdParam=${originLocode}&destLocCdParam=${destLocode}&oriTermCdPara=Y&desTermCdPara=Y&frmDtParam=${d}&nextWeekValue=14&cargoNature=GP&isEnabledCO2=false&year=${y}&month=${m}&searchType=List&isPolPodOn=false`;
  // ① 主页预热 12s（hydration/session 需要；已在 ONE 域名下则跳过）
  try {
    if (!/one-line\.com/.test(page.url() || '')) {
      await page.goto('https://ecomm.one-line.com/one-ecom/manage-shipment/create-booking', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await new Promise((r) => setTimeout(r, 12000));
    }
  } catch {}
  // ② 深链
  try { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch {}
  // ③ 轮询等结果渲染（最多 60s；不渲染=放弃）
  let text = '';
  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    if (/Total \d+ results/i.test(text) || /day\(s\)/.test(text)) break;
  }
  if (!/Total \d+ results/i.test(text) && !/day\(s\)/.test(text)) return null;
  const rows = await page.evaluate(() => {
    const t = document.body.innerText;
    // 每条: Origin \n YYYY-MM-DD NINGBO, ZHEJIANG \n NN day(s) Direct/Via \n ISTANBUL Destination \n YYYY-MM-DD ... Vessel \n NAME Voyage/SERVICE
    const re = /(\d{4}-\d{2}-\d{2}) ([A-Z ,()'\-]+?) (\d+) day\(s\) (Direct|Via [^\n]+?) ([A-Z ,()'\-]+?) Destination/g;
    const out = [];
    let m2;
    while ((m2 = re.exec(t)) !== null) {
      out.push({ etd: m2[1], from: m2[2].trim(), days: m2[3], direct: m2[4].startsWith('Direct'), via: m2[4] === 'Direct' ? '' : m2[4].slice(4).trim(), eta: null, to: m2[5].trim() });
      if (out.length > 7) break;
    }
    // 配船名：Vessel 后面的行
    const vm = [...t.matchAll(/Vessel\s+Voyage \/ Service Lane\s+([^\n]+?)\s+([A-Z0-9]+W?)\s*\//g)];
    out.forEach((r2, ix) => { if (vm[ix]) { r2.vessel = vm[ix][1].trim(); r2.voyage = vm[ix][2]; } });
    // eta：Origin 下一条日期
    out.forEach((r2) => {
      const at = t.indexOf(r2.etd + ' ' + r2.from);
      if (at >= 0) {
        const seg = t.slice(at, at + 400);
        const dts = [...seg.matchAll(/\d{4}-\d{2}-\d{2}/g)].map((x) => x[0]);
        if (dts.length > 1) r2.eta = dts[dts.length - 1];
      }
    });
    return out;
  });
  if (!rows.length) return null;
  return rows.map((r2) => ({
    vessel: r2.vessel || '', voyage: r2.voyage || '', etd: r2.etd, eta: r2.eta || '',
    transitDays: r2.days, via: r2.via || '', direct: r2.direct,
  }));
}
