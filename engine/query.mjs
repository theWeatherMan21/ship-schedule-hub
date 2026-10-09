#!/usr/bin/env node
// ShipScheduleHub 引擎：并发打开 Top 10 船司船期页 + 尽力预填
// 用法：
//   node engine/query.mjs --origin Shanghai --destination Rotterdam --date 2026-09-21
//   node engine/query.mjs --origin Shanghai --destination Rotterdam --date 2026-09-21 --carriers msc,maersk
//   node engine/query.mjs ... --window onscreen      # 跑完把窗口显示出来给爸爸看（默认静默不可见）
// 输出：stdout 逐行 NDJSON 事件（engine-started / carrier-status / summary / engine-exit）
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';   // --diagnose 段要用；漏了会 ReferenceError 直接崩（10-09 真机诊断抓到）
import { launch, launchHeadedQuiet, quietWindow, windowBounds, openPage, jitterGap, sleep, shot, EVIDENCE_DIR } from './browser.mjs';
import { CARRIERS, byId } from './registry.mjs';
import { emit, emitCarrier } from './lib/events.mjs';
import { dateFormats } from './lib/utils.mjs';
import { dismissCookies, isBlockPage, waitThroughChallenge, pickOption, portPick, typeAndPickCandidate } from './lib/utils.mjs';
import { withTimeout, setValue, setInputByValueShape, clickByText, fillAutocomplete } from './lib/dom.mjs';
import { resolvePort } from './lib/portsolve.mjs';
import { siblingPorts } from './portdb.mjs';

// ---------- 启动守卫（Windows 盘符根路径）----------
// 爹地 9-30 实测：App 装在 D:\ 根目录时，出现驱动器相对路径（"D:" 没有反斜杠），
// Node 模块解析拿它做 realpath → `EISDIR: illegal operation on a directory, lstat 'D:'`
// → 引擎在启动阶段就死，App 表现为「点查询毫无反应」。
// 主修在 Rust 侧（fix_root 补分隔符）；这里再兜一层：cwd / 入口脚本若是光秃秃盘符就补反斜杠。
if (process.platform === 'win32') {
  try {
    const isBareDrive = (v) => /^[a-zA-Z]:$/.test(String(v || ''));
    // 环境变量自愈：TEMP/TMP 指向裸盘符时，改到我们自己的数据目录
    // （Node/浏览器/依赖都会拿 tmpdir 做 realpath，裸盘符会抛 EISDIR 让进程启动即死）
    for (const k of ['TEMP', 'TMP', 'TMPDIR']) {
      if (isBareDrive(process.env[k])) {
        console.error(`[engine] 警告：环境变量 ${k}=${process.env[k]} 是驱动器相对路径，已忽略`);
        delete process.env[k];
      }
    }
    if (isBareDrive(process.cwd())) process.chdir(process.cwd() + '\\');
    const entry = process.argv[1];
    if (entry && /^[a-zA-Z]:/.test(entry) && !/^[a-zA-Z]:[\\/]/.test(entry)) {
      console.error('[engine] 警告：入口脚本是驱动器相对路径:', entry);
    }
  } catch { /* 守卫本身不许影响主流程 */ }
}

// ---------- 自检 / 诊断（--diagnose）：把「引擎为什么起不来」一次问清 ----------
// App 的「诊断」按钮与远程排障都用它（Windows 无 Chrome / node 找不到这两个场景尤其需要）。
if (process.argv.includes('--diagnose')) {
  const os = await import('node:os');
  // ⚠️ 不能用 new URL(import.meta.url).pathname：Windows 上会得到 /D:/Program%20Files/... 
  // （前导斜杠 + 空格被百分号编码）→ 所有派生路径全废（ports.db 判成缺失、装在带空格的
  // Program Files 下必现）。真机实测（婉宜 10-08）。其它模块一直用的是 fileURLToPath，就这里漏了。
  const ROOT = path.dirname(fileURLToPath(import.meta.url));
  const info = {
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    execPath: process.execPath,
    dataDir: (await import('./browser.mjs')).DATA_DIR,
    tmpdir: os.tmpdir(),
    cwd: process.cwd(),
    engineDir: ROOT,
    portsDb: null,
    playwrightCore: null,
    chrome: null,
    chromeDownloadAllowed: true,
  };
  try {
    const db = path.join(ROOT, '..', 'db', 'ports.db');
    info.portsDb = fs.existsSync(db) ? `ok (${(fs.statSync(db).size / 1048576).toFixed(1)} MB)` : `缺失: ${db}`;
  } catch (e) { info.portsDb = 'error: ' + String(e).slice(0, 80); }
  try {
    await import('./node_modules/playwright-core/index.mjs');
    info.playwrightCore = 'ok';
  } catch (e) { info.playwrightCore = '导入失败: ' + String(e).slice(0, 120); }
  try {
    const { resolveChrome } = await import('./chrome.mjs');
    const c = await resolveChrome({ allowDownload: false, log: () => {} });
    info.chrome = c ? `${c.source} → ${c.path}` : '未找到（首次查询会自动下载 Chrome for Testing）';
  } catch (e) { info.chrome = '探测异常: ' + String(e).slice(0, 120); }
  // 网络连通性（同事机器最常踩的坑：防火墙/代理拦 node 出网 → 查询「毫无反应」）
  info.net = {};
  for (const host of ['ecomm.one-line.com', 'api.maersk.com', 'www.zim.com']) {
    const t0 = Date.now();
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(`https://${host}/`, { method: 'HEAD', signal: ctl.signal, redirect: 'manual' });
      clearTimeout(timer);
      info.net[host] = `ok (HTTP ${r.status}, ${Date.now() - t0}ms)`;
    } catch (e) {
      info.net[host] = `不通 (${String(e && e.message || e).slice(0, 80)}, ${Date.now() - t0}ms)`;
    }
  }

  process.stdout.write(JSON.stringify({ type: 'diagnose', ...info }) + '\n');
  process.exit(0);
}

import { tryFastPath, mscInPage, coscoInPage, hapagInPage, zimInPage, maerskInPage, oneDeep } from './fastpath.mjs';

// ---------- 参数 ----------
function parseArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const nxt = argv[i + 1];
      // 注意：空字符串 '' 是合法值（如 --date "" 表示「不填日期」），不能当 flag —— 婉宜 9-23 踩过
      a[k.slice(2)] = (nxt !== undefined && !nxt.startsWith('--')) ? argv[++i] : true;
    }
  }
  return a;
}
const args = parseArgs(process.argv.slice(2));
const origin = args.origin || 'Shanghai';
const destination = args.destination || 'Rotterdam';
// 日期改为可选：不传 --date 时跳过填日期，用网站默认（通常=当天）——少一个脆弱步骤（爹地 9-22 建议）
const isoDate = typeof args.date === 'string' ? args.date : '';   // 非字符串（flag 形态）一律视为未提供
// 船司列表。逆逻辑测试出的三个坑（9-30）：
// ① `--carriers ''`（显式空串）旧写法 `args.carriers || 全部` 会**静默变成查全部** → 11 家浏览器抓取，白等十几分钟；
// ② `one,one` 会**把同一家跑两遍**（2 条同家状态、条数翻倍）；
// ③ 写错船司名（`foo`）不报错，只回一句「没有选中任何船司」，用户不知道是名字写错了。
// 现在：省略参数 = 查全部；显式空串 = fail fast；重复去重；名字写错列出可用 id。
let ids;
if (args.carriers === undefined || args.carriers === null) {
  ids = CARRIERS.map((c) => c.id);                     // 省略 = 全部（CLI 裸跑）
} else {
  ids = String(args.carriers).split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    console.error(JSON.stringify({ type: 'engine-error', msg: '参数 --carriers 为空：至少要选一家船司（省略该参数才表示查全部）' }));
    process.exit(2);
  }
  const seenIds = new Set();
  const dups = [];
  ids = ids.filter((id) => {
    if (seenIds.has(id)) { dups.push(id); return false; }
    seenIds.add(id); return true;
  });
  if (dups.length) console.error(`[query] 忽略重复的船司：${[...new Set(dups)].join(',')}`);
  const unknown = ids.filter((id) => !CARRIERS.some((c) => c.id === id));
  if (unknown.length) {
    console.error(JSON.stringify({ type: 'engine-error', msg: `未知船司：${unknown.join(', ')}。可用：${CARRIERS.map((c) => c.id).join(', ')}` }));
    process.exit(2);
  }
}
const windowMode = args.window || 'minimized'; // minimized(默认静默) | offscreen | onscreen
const perCarrier = Number(args['per-carrier-timeout'] || 60000);
const batchSize = Number(args.batch || 1);
// 9-30 加固：origin/destination 必须是非空字符串。事故：CLI 参数被 shell 传成布尔/空值时，
// 垃圾输入会一路走到港口解析（甚至静默查成别的港口）。这里 fail fast，给一句可读的错。
for (const [k, v] of [['origin', args.origin], ['destination', args.destination]]) {
  if (typeof v !== 'string' || v.trim().length < 2) {
    console.error(JSON.stringify({ type: 'engine-error', msg: `参数 --${k} 非法（收到 ${JSON.stringify(v)}）：必须是非空港口名` }));
    process.exit(2);
  }
}
// 9-30 加固：--date 必须是真的日历日期。事故（逆逻辑测试）：传 2026-13-45 时不报错，
// 一路带着垃圾日期去查各家网站（浏览器抓取每家 40-90 秒才发现查不到）——用户白等十几分钟。
// 空/缺省仍然合法（= 用网站默认当天）。
{
  const raw = args.date;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const s = String(raw).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    let bad = !m;
    if (m) {
      const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const dt = new Date(Date.UTC(y, mo - 1, d));
      // 回读校验：2026-13-45 会被 Date 归一化成 2027-02-14，回读就对不上 → 判非法
      bad = dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d;
    }
    if (bad) {
      console.error(JSON.stringify({ type: 'engine-error', msg: `参数 --date 非法（收到 ${JSON.stringify(s)}）：请用 YYYY-MM-DD 且是真实存在的日期，或留空用网站默认当天` }));
      process.exit(2);
    }
  }
}
// 串行时复用同一个标签页：newPage() 会把最小化的窗口唤醒成 normal，
// 复用单页则全程 minimized（有头真指纹 + 屏幕不可见，婉宜 9-23 实测）
const reusePage = batchSize === 1;      // 红线：每批 ≤3；默认 1（串行）最稳——并发抖动实测（婉宜 9-22）
const keepOpen = !!args['keep-open'];
const reveal = !!args.reveal;
const noShots = !!args['no-shots'];

// 港口词典解析：origin/destination → { word: 原始输入, text: 该船司实际称呼, locode, source }
// runCarrier 内对该船司再次 resolvePort（各家 alias 不同），此处结果供事件与兜底 kind=open 使用。
const qDate = dateFormats(isoDate || new Date().toISOString().slice(0, 10));
const skipDate = !args.date;
const qBase = { date: qDate, skipDate, raw: { origin, destination, date: isoDate } };
// 同一港口的多写法（给「候选点选」用）：船司词 → 纯港名 → Name (LOCODE) → 用户原词
const cap1 = (x) => { const s = String(x || '').trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; };
// 数组左移 n 位（n 可正可负）—— 用于"换下一种写法重试"
function rotate(n, arr) {
  if (!Array.isArray(arr) || arr.length < 2) return arr;
  const k = ((Number(n || 0) % arr.length) + arr.length) % arr.length;
  return k ? arr.slice(k).concat(arr.slice(0, k)) : arr;
}
function portVariants(resolved, raw) {
  const out = [];
  const push = (x) => { const y = cap1(x); if (y && !out.includes(y)) out.push(y); };
  push(resolved?.text);                       // 该船司自己的别名（最准）
  push(resolved?.name);                       // 词典港名
  if (resolved?.name && resolved?.locode) push(`${resolved.name} (${resolved.locode})`);
  // 同组港名（同城不同码头）：各家叫法不同，天津 = Tianjin / Xingang / Xingang Pt…
  // ⚠️ 关键（10-09 长荣实测）：多数船司的候选是**前缀匹配**，而它们库里根本没有 "Tianjin…"，
  //    只有 "XINGANG (CNTXG)"。所以除了全名，还要试**去掉城市前缀的尾巴**（"Tianjin Xingang Pt" → "Xingang Pt" / "Xingang"）。
  for (const sib of siblingPorts(resolved, 3)) {
    const nm = String(sib.name || '').trim();
    if (!nm) continue;
    const tail = nm.split(/\s+/).slice(1).join(' ');   // 去掉首词（城市名）
    if (tail && tail.length >= 4) { push(tail); push(tail.split(/\s+/)[0]); }
    push(nm);
  }
  push(raw);                                  // 用户原词
  return out.slice(0, 9);
}
// 可接受的港口码集合：本港 + 同组港（船司把天津叫 Xingang 时，回读码是 CNTXG 也要认）
function portCodes(resolved) {
  const out = [];
  if (resolved?.locode) out.push(resolved.locode);
  for (const sib of siblingPorts(resolved, 4)) if (sib.locode && !out.includes(sib.locode)) out.push(sib.locode);
  return out;
}

const q = new Proxy(qBase, {
  get(t, k) {
    if (k === 'originText') return t._o?.text ?? origin;
    if (k === 'destText') return t._d?.text ?? destination;
    // _variantShift：配方报"无结果"时，引擎换下一种港名写法重查（rotate 一位）
    if (k === 'originVariants') return rotate(t._variantShift, portVariants(t._o, origin));
    if (k === 'destVariants') return rotate(t._variantShift, portVariants(t._d, destination));
    if (k === 'originCodes') return rotate(t._variantShift, portCodes(t._o));
    if (k === 'destCodes') return rotate(t._variantShift, portCodes(t._d));
    return t[k];
  },
});
const selected = ids.map(byId).filter(Boolean);

// ---------- 页面动作集（配方可用） ----------
const H = {
  dismissCookies, isBlockPage, waitThroughChallenge, pickOption, portPick, typeAndPickCandidate,
  setValue, setInputByValueShape, clickByText,
  fillAutocomplete, sleep, shot,
};

// ---------- 单家执行（任何失败都被吃掉，只影响这一家） ----------
export async function runCarrier(ctx, carrier) {
  const res = { carrier: carrier.id, name: carrier.name, status: 'failed', level: 3, url: carrier.entry, httpStatus: 0, msg: '', shots: [], ms: 0 };
  const t0 = Date.now();
  emitCarrier(carrier.id, 'running', { name: carrier.name, url: carrier.entry });
  let page = null, blocked = false, status = 0, lastErr = null;
  try {
    // 词典驱动：按船司解析输入词（aliases 实测映射 → NAME (LOCODE) 兜底 → 原样）
    // ⚠️ 必须用【本家私有】对象：runCarrier 是 12 家并发的，写共享 qBase 会互相串词 ——
    //    9-30 实测事故：HMM 读到 Evergreen 的 "ningbo china cnngb" → 候选点不中、整家失败。
    const oRes = await resolvePort(carrier.id, origin);
    const dRes = await resolvePort(carrier.id, destination);
    const qLocal = new Proxy({ ...qBase, _o: oRes, _d: dRes }, {
      get(t, k) {
        if (k === 'originText') return t._o?.text ?? origin;
        if (k === 'destText') return t._d?.text ?? destination;
        // _variantShift：配方报"无结果"时，引擎换下一种港名写法重查（rotate 一位）
        if (k === 'originVariants') return rotate(t._variantShift, portVariants(t._o, origin));
        if (k === 'destVariants') return rotate(t._variantShift, portVariants(t._d, destination));
        if (k === 'originCodes') return rotate(t._variantShift, portCodes(t._o));
        if (k === 'destCodes') return rotate(t._variantShift, portCodes(t._d));
        return t[k];
      },
    });
    res.ports = { origin: { word: origin, text: oRes.text, locode: oRes.locode || '', source: oRes.source }, dest: { word: destination, text: dRes.text, locode: dRes.locode || '', source: dRes.source } };
    // ① 尝试候选入口（深链接：本项目实测均不支持，故退化为「找到能打开的那个入口」）
    for (const cand of carrier.urls) {
      if (page && !reusePage) { await Promise.race([page.close(), sleep(3000)]).catch(() => {}); }
      const opened = await openPage(ctx, cand, { reuse: reusePage });
      page = opened.page;
      status = opened.status || status;
      lastErr = opened.error || null;
      await sleep(2500); // JS 壳页（COSCO/ONE）domcontentloaded 后 body 为空，直接判 block 会误拦；等渲染
      blocked = await isBlockPage(page);
      if (!blocked && !opened.error) break;
    }
    res.httpStatus = status;
    res.url = page.url();
    res.blocked = blocked;

    if (!page || (lastErr && !status)) {
      res.status = 'failed';
      res.msg = `打不开页面：${lastErr || '未知网络错误'}`;
      return res;
    }

    // ①.5 MSC/COSCO 专属：页面里直接调它自己的 API（比填表快 10 倍 + 结构化船期）婉宜 9-23
    // maersk 额外要港口名（geography API 按城市名查，不认 LOCODE）——包一层传 name
    const maerskApi = (pg, o, d, iso) => maerskInPage(pg, o, d, iso, oRes?.name, dRes?.name);
    const coscoApi = (pg, o, d, iso) => coscoInPage(pg, o, d, iso, oRes?.name, dRes?.name); // 9-30：港名兜底（PLGDN 等 CITY 表外的港）
    const inPageApi = carrier.id === 'msc' ? mscInPage : carrier.id === 'cosco' ? coscoApi : carrier.id === 'hapag' ? hapagInPage : carrier.id === 'zim' ? zimInPage : carrier.id === 'maersk' ? maerskApi : null;
    if (!blocked && inPageApi) {
      try {
        // 同组港码兜底（爹地 10-09 点透）：船司接口认的是**码头码**，天津 = CNTNJ（市）/ CNTXG（新港）。
        // 主码空手就换同组码再试 —— MSC 实测：递 CNTNJ 无结果、递 CNTXG 出 7 条。
        const oCodes = portCodes(oRes).slice(0, 2);
        const dCodes = portCodes(dRes).slice(0, 2);
        let fp = null;
        outer:
        for (const oc of oCodes) {
          for (const dc of dCodes) {
            const r = await withTimeout(inPageApi(page, oc, dc, isoDate), 90000, 'inpage api').catch(() => null);
            if (r && r.rows && r.rows.length) {
              const same = oc === oCodes[0] && dc === dCodes[0];
              fp = same ? r : { ...r, note: `${r.note}（同组港码 ${oc}→${dc}）` };
              break outer;
            }
          }
        }
        if (fp && fp.rows && fp.rows.length) {
          res.status = 'done';
          res.level = 1;
          res.msg = `${fp.note}：` + fp.rows.slice(0, 3).map((r) => `${r.vessel} ETD ${r.etd} → ${r.eta} ${r.transitDays}天${r.direct ? ' 直达' : ' 转' + r.via}`).join(' ｜ ');
          res.schedules = fp.rows;
          res.fastpath = true;
          res.ms = Date.now() - t0;
          emitCarrier(carrier.id, 'done', { name: carrier.name, level: 1, msg: res.msg, url: res.url, ms: res.ms, schedules: fp.rows, fastpath: true });
          return res;
        }
      } catch { /* 走原填表路径 */ }
    }

    // ② DOM 填表 + 搜索（kind=dom）；③ 兜底只开页面（kind=open）
    let domErr = null;
    if (!blocked && carrier.kind === 'dom') {
      // 抖动重试：候选下拉/SPA 渲染是时序敏感的，失败多为瞬时（同代码单跑 OK、并发随机挂）。
      // 失败后重开入口页再试一次，把随机失败抹平（婉宜 9-22）。
      const attempts = 2;
      for (let k = 1; k <= attempts; k++) {
        try {
          // 接口已明确无此线的，页面兜底只给 25s 确认窗口，别让爹地干等
          const tmo = apiEmptyHint[carrier.id] ? Math.min(carrier.timeoutMs || perCarrier, 25000) : (carrier.timeoutMs || perCarrier);
          const r = await withTimeout(Promise.resolve(carrier.run(page, qLocal, H)), tmo, `配方超时(${tmo}ms)`);
          res.status = 'prefilled';
          res.level = 2;
          res.msg = (r && r.msg) || '已预填并搜索';
          // 9-24：配方若从结果页抽出结构化船期 → 升级为 done + schedules（前端行内展示，同 fastpath 口径）
          if (r && Array.isArray(r.schedules) && r.schedules.length) {
            res.status = 'done';
            res.level = 1;
            res.schedules = r.schedules;
            break;
          }
          // ★ 10-09 教训（爹地实证"明明能查到"）：配方报"无方案/无结果"时，**先怀疑自己递的港名**，
          //   换下一种写法重查一次，别直接把锅甩给官网（天津在马士基库叫 Xingang(Tianjin)、长荣库叫 Xingang）。
          // 只要**没拿到结构化船期**就换下一种写法再试（不再挑文案：CMA 那次报的是"已预填…"，
          // 文案不匹配就漏掉了重试 —— 判据应该是「有没有拿到行」，不是「消息怎么写」）
          // 只在"还有别的写法可试"时才重查（只有一种写法时重跑一遍毫无意义，纯浪费时间）
          const moreVariants = (portVariants(qLocal._o, origin).length > 1) || (portVariants(qLocal._d, destination).length > 1);
          if (k < attempts && moreVariants && !(res.schedules && res.schedules.length)) {
            qLocal._variantShift = (qLocal._variantShift || 0) + 1;
            domErr = null;
            await sleep(1500);
            continue;
          }
          break;
        } catch (e) {
          domErr = String(e.message || e).split('\n')[0];
          if (k < attempts) {
            await sleep(2000);
            try {
              const re = await openPage(ctx, carrier.entry, { reuse: reusePage });
              page = re.page;
              await sleep(2500);
              blocked = await isBlockPage(page);
              if (blocked) break;
            } catch { /* 重开失败就保留原错误 */ }
          }
        }
      }
    } else if (carrier.kind === 'open') {
      try { await withTimeout(Promise.resolve(carrier.run(page, qLocal, H)), Math.min(perCarrier, 25000), '兜底超时'); }
      catch (e) { domErr = String(e.message || e).split('\n')[0]; }
      blocked = await isBlockPage(page);
    }

    if (res.status !== 'prefilled' && res.status !== 'done') {
      res.status = 'opened';                    // 保底价值：页面已打开
      res.level = 3;
      res.msg = blocked
        ? `反爬拦截（HTTP ${res.httpStatus || '?'}），已打开页面兜底`
        : (domErr || carrier.fallbackNote || '仅打开页面');
    }
  } catch (e) {
    res.status = 'failed';
    res.msg = String(e.message || e).split('\n')[0].slice(0, 200);
  } finally {
    if (page && !noShots) {
      const p = await shot(page, carrier.id);
      if (p) res.shots.push(path.relative(path.dirname(EVIDENCE_DIR), p));
    }
    if (page && !keepOpen && !reusePage) await Promise.race([page.close(), sleep(3000)]).catch(() => {});
    res.ms = Date.now() - t0;
    if (!res.fastpath) {   // fastpath 命中分支已经 emit 过 done —— 别重复发（9-23：同一家连发两条，App 显示成两次查询）
      emitCarrier(carrier.id, res.status, { name: carrier.name, level: res.level, msg: res.msg, url: res.url, httpStatus: res.httpStatus, ms: res.ms, schedules: res.schedules });
    }
  }
  return res;
}

// ---------- 主流程 ----------
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const ndjsonPath = path.join(EVIDENCE_DIR, `run-${stamp}.ndjson`);
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
const ndjson = fs.createWriteStream(ndjsonPath, { flags: 'a' });

emit('engine-started', { origin, destination, date: isoDate, carriers: selected.map((c) => c.id), windowMode });
ndjson.write(JSON.stringify({ type: 'engine-started', origin, destination, date: isoDate, carriers: selected.map((c) => c.id), windowMode }) + '\n');

// 红线：没有选中任何船司 → 立刻退出，绝不去启动浏览器（否则会弹一个空白窗口，爹地 9-23 报过）
if (selected.length === 0) {
  emit('engine-error', { msg: '没有选中任何船司（carriers 为空），已跳过——请在左侧勾选船司' });
  ndjson.write(JSON.stringify({ type: 'engine-error', msg: '没有选中任何船司（carriers 为空），已跳过——请在左侧勾选船司' }) + '\n');
  ndjson.end();
  emit('engine-exit', { total: 0, prefilled: 0, opened: 0, failed: 0 });
  process.exit(0);
}

const results = [];

// ---------- 结果缓存（婉宜 9-30）----------
// 同条件（起运/目的/日期/船司集合）在 TTL 内重复查询 → 直接回放上次结果，秒回。
// 意义：① 重复查询不再等 60s ② 显著减少对船司官网的重复请求（防限速/防封）。
// 关闭方式：--no-cache 或 SSH_CACHE_TTL_MS=0；TTL 默认 20 分钟。
// 诚实性：回放的行 msg 前缀标注「⚡ 缓存」，不冒充实时结果。
const CACHE_TTL_MS = process.env.SSH_CACHE_TTL_MS === undefined ? 20 * 60 * 1000 : Number(process.env.SSH_CACHE_TTL_MS);
const cacheDir = path.join(EVIDENCE_DIR, 'cache');
const cacheKey = createHash('sha1')
  .update(`${origin.toLowerCase()}|${destination.toLowerCase()}|${isoDate}|${selected.map((c) => c.id).join(',')}`)
  .digest('hex').slice(0, 16);
const cachePath = path.join(cacheDir, `${cacheKey}.json`);
if (CACHE_TTL_MS > 0 && !args['no-cache']) {
  try {
    const c = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const age = Date.now() - Number(c.ts || 0);
    if (age >= 0 && age < CACHE_TTL_MS && Array.isArray(c.results) && c.results.length) {
      const mins = Math.max(0, Math.round(age / 60000));
      const ago = age < 90000 ? '刚刚' : `${mins} 分钟前`;
      for (const r of c.results) {
        const payload = { ...r, cached: true, msg: `⚡ 缓存（${ago}的结果，20 分钟内有效）${r.msg ? '：' + r.msg : ''}` };
        emitCarrier(r.carrier, r.status, { name: r.name, level: r.level, msg: payload.msg, url: r.url, httpStatus: r.httpStatus, ms: r.ms, schedules: r.schedules, cached: true });
        results.push(payload);
      }
      const cc = results.reduce((m, r) => { const k = r.status === 'done' ? 'prefilled' : r.status; m[k] = (m[k] || 0) + 1; return m; }, {});
      const csum = {
        type: 'summary', origin, destination, date: isoDate, total: results.length, cached: true,
        prefilled: cc.prefilled || 0, opened: cc.opened || 0, failed: cc.failed || 0,
        carriers: results.map((r) => ({ carrier: r.carrier, status: r.status, level: r.level, msg: r.msg, httpStatus: r.httpStatus, ms: r.ms })),
        ndjson: ndjsonPath,
      };
      console.log(JSON.stringify(csum));
      ndjson.write(JSON.stringify({ type: 'cache-hit', key: cacheKey, ageMs: age }) + '\n');
      ndjson.write(JSON.stringify(csum) + '\n');
      emit('engine-exit', { total: results.length, prefilled: csum.prefilled, opened: csum.opened, failed: csum.failed, cached: true });
      ndjson.end();
      setTimeout(() => process.exit(0), 200);
    }
  } catch { /* 没缓存就走实时查询 */ }
}

// ---------- fastpath：API 优先（婉宜 9-23）----------
// 不是官方 API：就是各家网页自己查询时发的请求。秒级 + 结构化船期。
// 只有需要浏览器兜底的船司才会启动浏览器 —— 大幅提速 + 不弹窗。
const fastResults = new Map();   // carrierId -> {rows, note, ms}
const needBrowser = [];
const apiEmptyHint = Object.create(null);   // 接口明确查无此线的船司 → 页面兜底用短超时
// 先并行解析各家港口（各家 alias/LOCODE 不同）
const portResolutions = await Promise.all(selected.map(async (c) => {
  try {
    const o = await resolvePort(c.id, origin);
    const d = await resolvePort(c.id, destination);
    return { c, o, d };
  } catch { return { c, o: { locode: '' }, d: { locode: '' } }; }
}));
// 并发打 fastpath（互不依赖；每家有超时保护，总耗时≈最慢一家）
await Promise.all(portResolutions.map(async ({ c, o, d }) => {
  const fr = await tryFastPath(c.id, portCodes(o), portCodes(d), isoDate);   // 传同组港码（天津 CNTNJ/CNTXG）
  if (fr && fr.apiEmpty && !(fr.rows || []).length) {
    // 接口明确无此线 → 页面兜底只给"确认一下"的时间，不陪着死等（省爹地的时间）
    apiEmptyHint[c.id] = true;
    emitCarrier(c.id, 'running', { name: c.name, msg: '接口查无此线，页面兜底确认中…' });
  }
  if (fr && fr.rows && fr.rows.length) {
    fastResults.set(c.id, fr);
    emitCarrier(c.id, 'done', {
      name: c.name, level: 1,
      msg: `${fr.note}：` + fr.rows.slice(0, 3).map((r) =>
        `${r.vessel} ${r.voyage} ETD ${r.etd} → ${r.eta} ${r.transitDays}天${r.via ? ' 转' + r.via : ' 直达'}`).join(' ｜ '),
      ms: fr.ms, fastpath: true, schedules: fr.rows,
    });
  } else {
    needBrowser.push(c);
  }
}));
// 全部 fastpath 命中 → 根本不用开浏览器
if (needBrowser.length === 0) {
  for (const c of selected) {
    const fr = fastResults.get(c.id);
    const r = { carrier: c.id, name: c.name, status: 'done', level: 1, url: c.entry, httpStatus: 200, msg: fr.note, shots: [], ms: fr.ms, schedules: fr.rows, fastpath: true };
    results.push(r);
    ndjson.write(JSON.stringify({ type: 'carrier-status', ...r }) + '\n');
  }
} else {
  console.log(JSON.stringify({ type: 'fastpath-partial', fast: [...fastResults.keys()], browser: needBrowser.map((c) => c.id) }));
  // 部分命中：fastpath 已拿到结果的也计入 results（否则 summary 漏数，婉宜 9-23）
  for (const c of selected) {
    if (!fastResults.has(c.id)) continue;
    const fr = fastResults.get(c.id);
    const r = { carrier: c.id, name: c.name, status: 'done', level: 1, url: c.entry, httpStatus: 200, msg: fr.note, shots: [], ms: fr.ms, schedules: fr.rows, fastpath: true };
    results.push(r);
    ndjson.write(JSON.stringify({ type: 'carrier-status', ...r }) + '\n');
  }
}

// --record-xhr：给每页挂 fetch 记录器（挖各家 API 用，婉宜 9-23）
const recordXhr = !!args['record-xhr'];

let ctx;
try {
  // 9-29 起：默认【零窗口】——Chrome 新无头档（--headless=new），屏幕上不会出现任何窗口。
  // 部署态实测覆盖：HMM 6 / CMA 10 / Evergreen 7 / OOCL 3 全通（真实 profile）；
  // maersk/one 已改 API 直查、其余 5 家走 fastpath，均不需要浏览器。
  // 需要真·有头排查时：SSH_ALLOW_HEADED=1 启动 App/引擎 → 回退「有头 + 最小化」。
  if (needBrowser.length > 0) {
    const lq = process.env.SSH_ALLOW_HEADED === '1'
      ? await launchHeadedQuiet()
      : { ctx: await launch({}), mode: 'headless-new', window: null };
    ctx = lq.ctx;
    const win = lq.window || { mode: lq.mode, visible: false };
    console.log(JSON.stringify({ type: 'window', ...win }));
    ndjson.write(JSON.stringify({ type: 'window', ...win }) + '\n');
    if (recordXhr) {
      await ctx.addInitScript(() => {
        window.__xhrLog = [];
        const of = window.fetch;
        window.fetch = function (...args) {
          try {
            const u = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
            if (/api/i.test(u) && !/analytics|doubleclick|google|audience|active-vessels|vessel-flags|cls_report/i.test(u)) {
              window.__xhrLog.push({ u: String(u).slice(0, 250), m: (args[1] && args[1].method) || 'GET', b: String((args[1] && args[1].body) || '').slice(0, 700) });
            }
          } catch {}
          return of.apply(this, args);
        };
        // XHR 也拦（很多老站用 XMLHttpRequest）
        const oo = XMLHttpRequest.prototype.open;
        const os = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = u; return oo.apply(this, arguments); };
        XMLHttpRequest.prototype.send = function (b) {
          try {
            const u = String(this.__u || '');
            if (/api/i.test(u) && !/analytics|doubleclick|google|audience|cls_report/i.test(u)) {
              window.__xhrLog.push({ u: u.slice(0, 250), m: this.__m || 'GET', b: String(b || '').slice(0, 700) });
            }
          } catch {}
          return os.apply(this, arguments);
        };
      }).catch(() => {});
    }

    for (let i = 0; i < needBrowser.length; i += batchSize) {
      const batch = needBrowser.slice(i, i + batchSize);
      emit('batch-start', { index: Math.floor(i / batchSize) + 1, carriers: batch.map((c) => c.id) });
      // v6b 并发加固：批内错峰启动（每家间隔 3-5s），降低同 IP 同时打多家触发反爬的概率
      const done = await Promise.all(batch.map((c, j) => (async () => {
        // 错峰启动：全家并发（9-24 爹地要求全部同时），只留 0.8~1.6s×j 的小错峰
        // 让浏览器开页动作错开，页面加载本身完全并行
        if (j > 0) await jitterGap(800 * j, 1600 * j);
        return runCarrier(ctx, c).catch((e) => ({ carrier: c.id, name: c.name, status: 'failed', level: 3, msg: String(e).slice(0, 160), shots: [] }));
      })()));
      for (const d of done) { results.push(d); ndjson.write(JSON.stringify({ type: 'carrier-status', ...d }) + '\n'); }
      if (recordXhr) {
        for (const pg of ctx.pages()) {
          try {
            const log = await pg.evaluate(() => (window.__xhrLog || []).slice(-30));
            if (log && log.length) console.log(JSON.stringify({ type: 'xhr-record', xhr: log }));
          } catch {}
        }
      }
      if (i + batchSize < needBrowser.length) await jitterGap(2000, 4000); // 红线：批间隔 2~4 秒
    }

    if (reveal) { const w = await quietWindow(ctx, 'onscreen'); console.log(JSON.stringify({ type: 'window-revealed', ...w })); }
    else { const w = await windowBounds(ctx); console.log(JSON.stringify({ type: 'window-final', ...w })); }
  }
} catch (e) {
  // 关键：错误必须同时写 ndjson，否则 App 前端只看得到「未查询」而看不到原因（婉宜 9-23）
  const emsg = String(e && e.stack ? e.stack : e).slice(0, 500);
  emit('engine-error', { msg: emsg });
  try { ndjson.write(JSON.stringify({ type: 'engine-error', msg: emsg }) + '\n'); } catch {}
  console.error('[engine] fatal:', e);
} finally {
  // 写缓存：至少一家真出结果才写（避免把整批失败固化 20 分钟）
  try {
    if (CACHE_TTL_MS > 0 && results.length && results.some((r) => r.status === 'done')) {
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cachePath, JSON.stringify({
        ts: Date.now(), origin, destination, date: isoDate,
        results: results.map((r) => ({ carrier: r.carrier, name: r.name, status: r.status, level: r.level, msg: r.msg, url: r.url, httpStatus: r.httpStatus, ms: r.ms, schedules: r.schedules })),
      }));
    }
  } catch { /* 缓存写失败不影响结果 */ }
  const counts = results.reduce((m, r) => { const k = r.status === 'done' ? 'prefilled' : r.status; m[k] = (m[k] || 0) + 1; return m; }, {});   // done(artapi)=prefilled 档，App 汇总口径不变
  const summary = {
    type: 'summary', origin, destination, date: isoDate,
    total: results.length,
    prefilled: counts.prefilled || 0, opened: counts.opened || 0, failed: counts.failed || 0,
    carriers: results.map((r) => ({ carrier: r.carrier, status: r.status, level: r.level, msg: r.msg, httpStatus: r.httpStatus, ms: r.ms })),
    ndjson: ndjsonPath,
  };
  console.log(JSON.stringify(summary));
  ndjson.write(JSON.stringify(summary) + '\n');
  emit('engine-exit', { total: results.length, prefilled: summary.prefilled, opened: summary.opened, failed: summary.failed });
  if (!keepOpen && ctx) await Promise.race([ctx.close(), sleep(4000)]).catch(() => {});
  ndjson.end();
  setTimeout(() => process.exit(0), 300);
}
