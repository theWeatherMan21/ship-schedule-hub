// M4 统一探针：Ningbo→Rotterdam 全流程（打开→cookie→读起运/目的候选→日期→搜索→结果文本+XHR）
// 用法：node qa/m4-probe.mjs <carrier>   carrier ∈ maersk|msc|cma|cosco|hapag|one|evergreen|yangming|hmm|zim
// 产物：evidence/m4-<carrier>.txt（console 全文）、evidence/m4-<carrier>.png、evidence/m4-<carrier>-xhr.json
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage, waitThroughChallenge, dateFormats } from '../engine/lib/utils.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';
import fs from 'node:fs';
import path from 'node:path';

const CARRIER = process.argv[2] || 'maersk';
const ORIGIN = process.env.M4_ORIGIN || 'Ningbo';
const DEST = process.env.M4_DEST || 'Istanbul';
const DATE_ISO = process.env.M4_DATE || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

const ENTRIES = {
  maersk: { url: 'https://www.maersk.com/schedules/pointToPoint', name: 'Maersk' },
  msc: { url: 'https://www.msc.com/en/search-a-schedule', name: 'MSC' },
  cma: { url: 'https://www.cma-cgm.com/ebusiness/schedules', name: 'CMA CGM' },
  cosco: { url: 'https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', name: 'COSCO' },
  hapag: { url: 'https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html', name: 'Hapag-Lloyd' },
  one: { url: 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule', name: 'ONE' },
  evergreen: { url: 'https://www.shipmentlink.com/', name: 'Evergreen' },
  yangming: { url: 'https://www.yangming.com/en/esolution/schedule/point_to_point_search', name: 'Yang Ming' },
  hmm: { url: 'https://www.hmm21.com/', name: 'HMM' },
  zim: { url: 'https://www.zim.com/', name: 'ZIM' },
};
const E = ENTRIES[CARRIER];
if (!E) { console.error('未知 carrier'); process.exit(2); }

// 词典驱动：ORIGIN/DEST → 该船司实际称呼（portdb aliases 优先，NAME (LOCODE) 兜底）
const oPort = await resolvePort(CARRIER, ORIGIN);
const dPort = await resolvePort(CARRIER, DEST);
const ORIGIN_TYPED = oPort.text;
const DEST_TYPED = dPort.text;
const out = { carrier: E.name, url: E.url, date: DATE_ISO, ports: { origin: oPort, dest: dPort }, steps: [], xhr: [], candidates: { origin: [], dest: [] }, resultText: null, verdict: 'RUNNING' };
function log(s) { const line = `[${new Date().toISOString().slice(11, 19)}] ${s}`; console.log(line); out.steps.push(line); }
log(`词典: ${ORIGIN} → "${ORIGIN_TYPED}" (${oPort.source}); ${DEST} → "${DEST_TYPED}" (${dPort.source})`);
const OUT = fs.mkdtempSync(path.join(process.env.HOME, '.hermes/profiles/manong/cache/scratch', `m4-${CARRIER}-`));

function dateF(fmt) {
  const f = dateFormats(DATE_ISO);
  if (fmt === 'slashes') return DATE_ISO.replaceAll('-', '/');
  return f[fmt] || DATE_ISO;
}

// ---- 通用：等候选并按文本点选；记录所有候选文本（ariaSnapshot 优先，textContent 兜底）----
async function pickCandidate(page, field, word, label, opts = {}) {
  const role = page.getByRole('option', { name: new RegExp(word.slice(0, 4), 'i') }).catch?.() || page.getByRole('option', { name: new RegExp(word.slice(0, 4), 'i') });
  let cands = null, n = 0;
  // 1) role=option；2) 通用候选选择器；3) field 同级 dropdown li
  const selectors = [
    () => page.locator('[role="option"], [role="listbox"] [role="option"]').all(),
    () => page.locator('ul.autocomplete li, li[role="option"], [class*="autocomplete"] li, [class*="suggest"] li, .k-list .k-item, li.ui-menu-item, .pac-item, .ivu-select-item, [class*="select-item"], [class*="option"]').all(),
    () => page.locator('ul:not([class]) li, ul[class=""] li').all(),
  ];
  for (let t = 0; t < 30; t++) {
    for (const s of selectors) {
      try { const els = await s(); const vis = []; for (const e of els) { if (await e.isVisible().catch(() => false)) vis.push(e); } if (vis.length) { cands = vis; break; } } catch {}
    }
    // 瞬态候选（Searching.../Loading...）不算数：等 1.5s 重扫（ZIM Shadow DOM 组件实测）
    if (cands) {
      let transient = true;
      // MSC: emphasis "No Results" 也不算
      const joined = (await Promise.all(cands.slice(0, 4).map(e => e.innerText().catch(() => '')))).join(' ');
      if (/no results/i.test(joined)) { cands = null; await sleep(800); continue; }
      for (const e of cands) { const x = (await e.innerText().catch(() => '')).trim(); if (x && !/^search(ing)?\.?\.?$|^loading/i.test(x)) { transient = false; break; } }
      if (transient) { cands = null; await sleep(1500); continue; }
    }
    if (cands) break;
    await sleep(500);
  }
  if (!cands || !cands.length) { log(`  ⚠️ ${label}: 无下拉候选`); return null; }
  const texts = [];
  for (const el of cands) {
    let snap = '';
    try { snap = await el.ariaSnapshot(); } catch {}
    let txt = (snap || '').replace(/\s+/g, ' ').trim();
    if (!txt) txt = (await el.textContent().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (txt) texts.push(txt);
  }
  (label.includes('起运') ? out.candidates.origin : out.candidates.dest).push(...texts);
  const real = texts.filter(t => !/^(containers|boxes & pallets|ports service)$/i.test(t.trim()) && !/place names including/i.test(t));
  if (real.length) texts.splice(0, texts.length, ...real);
  texts.slice(0, 12).forEach((t, i) => log(`  ${label}候选[${i}]: ${t.slice(0, 90)}`));

  // 打分：pick 函数优先 → 关键词匹配（首词匹配，避免 Ports Service 之类垃圾命中）
  const first = (t) => t.toLowerCase().replace(/^- option "/, '').split(/[(,]/)[0].trim();
  let idx = -1;
  if (opts.pick) { const j = texts.findIndex(opts.pick); if (j >= 0) idx = j; }
  if (idx < 0) { const key = word.toLowerCase(); const j = texts.findIndex(t => first(t) === key || first(t).startsWith(key)); if (j >= 0) idx = j; }
  if (idx < 0 && opts.fallbacks) {
    for (const f of opts.fallbacks) { const j = texts.findIndex(t => t.toLowerCase().includes(f.toLowerCase())); if (j >= 0) { idx = j; log(`  （按变体 "${f}" 命中）`); break; } }
  }
  if (idx < 0) idx = 0;
  let clickedOk = false;
  try { await cands[idx].click({ timeout: 5000 }); clickedOk = true; } catch {}
  if (!clickedOk) {
    // 中间候选优先，逐个降级
    const order = [Math.floor(texts.length / 2), ...texts.map((_, i) => i)];
    for (const j of order) {
      if (j === idx) continue;
      try { if (await cands[j].isVisible().catch(() => false)) { await cands[j].click({ timeout: 5000 }); clickedOk = true; log(`  （候选[${idx}] 不可见，改点 [${j}]）`); idx = j; break; } } catch {}
    }
  }
  if (!clickedOk) { log('  点击候选失败（均不可见）'); return null; }
  await sleep(1000);
  let confirmed = '';
  try { confirmed = await field.inputValue(); } catch { try { confirmed = await field.textContent(); } catch {} }
  log(`  ✅ 已选: "${texts[idx].slice(0, 70)}" → 输入框回读 "${String(confirmed).slice(0, 50)}"`);
  return texts[idx];
}

// ---- Kendo combobox 键盘选行（点击脆：点完 input 值不生效）----
async function kendoKeyboardPick(page, field, label, matcher, log) {
  // CMA 实测（diag5/6）：港口下拉行=li.place-suggestion，点击后 input 变 "NAME ; COUNTRY ; LOCODE"
  // li.place-suggestion 是真实候选行；组头容器更长（拼了全部子行），取文本短的（<120 字符）
  const items = page.locator('li').filter({ hasText: /\([A-Z]{2}[A-Z0-9]{3}\)/ });
  let n = 0;
  for (let t = 0; t < 24; t++) { n = await items.count().catch(() => 0); if (n > 1) break; await sleep(500); }
  const texts = [];
  for (let i = 0; i < Math.min(n, 30); i++) {
    const t = (await items.nth(i).innerText().catch(() => '')).trim().replace(/\s+/g, ' ');
    texts.push(t);
    if (t.length < 120) log(`  ${label}行[${i}]: ${t.slice(0, 70)}`);
  }
  let target = texts.findIndex((t, i) => t.length < 120 && matcher(t));
  if (target < 0) { log(`  kendoPick: 无匹配行`); return false; }
  // 直接点目标行（diag6 实测：点击后 input value = "NAME ; COUNTRY ; LOCODE"）
  try { await items.nth(target).click({ timeout: 6000 }); } catch (e) { log('  点行失败: ' + String(e).slice(0, 60)); return false; }
  await sleep(1500);
  let conf = '';
  try { conf = await field.inputValue(); } catch { try { conf = await field.innerText(); } catch {} }
  const ok = /[A-Z]{4,5}\s*;\s*[A-Z]{2}\s*;\s*[A-Z]{4,5}/.test(conf || '') || /\([A-Z]{2}[A-Z0-9]{3}\)/.test(conf || '');
  log(`  ${ok ? '✅' : '⚠️'} kendoPick ${label} → 回读 "${String(conf).slice(0, 60)}"`);
  return ok;
}

// ---- XHR 抓取 ----
const xhrHits = [];
function attachXHR(page, tag) {
  page.on('response', async (resp) => {
    try {
      const url = resp.url();
      if (!/schedule|sailing|route|vessel|port|search|voyage|point-to-point|pointToPoint/i.test(url)) return;
      const body = await resp.text().catch(() => '');
      if (body.length > 80) xhrHits.push({ tag, method: resp.request().method(), url, status: resp.status(), len: body.length, body: body.slice(0, 150000) });
    } catch {}
  });
}

fs.mkdirSync(path.join(PROJ_ROOT(), 'evidence'), { recursive: true });
function PROJ_ROOT() { return path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, '$1'), '..'); }
const EVBASE = path.join(PROJ_ROOT(), 'evidence');

const ctx = await launch({}); // 默认无头新档：零窗口，不打扰爸爸
try { await quietWindow(ctx, 'minimized'); } catch (e) { console.error('[warn] 最小化失败:', String(e).slice(0, 80)); }
const page = await ctx.newPage();
attachXHR(page, 'main');

try {
  log(`打开 ${E.name}: ${E.url}`);
  let resp; try { resp = await page.goto(E.url, { waitUntil: 'domcontentloaded', timeout: 45000 }); } catch (e) { resp = null; log(`导航异常: ${String(e).slice(0, 120)}`); }
  log(`HTTP ${resp?.status() ?? 'ERR'}`);
  await sleep(3000);
  if (await isBlockPage(page)) { log('疑似拦截页，等待挑战…'); await waitThroughChallenge(page, 15000); }
  if (await isBlockPage(page)) {
    out.verdict = 'BLOCKED';
    log('❌ 被拦截/空页（isBlockPage=true）');
    // 留证据后退出
  } else {
    const ck = await dismissCookies(page);
    log(`cookie: ${ck ? '已接受' : '无弹窗'}`);
    await sleep(1500);

    // ---- 可选前置 tab（ZIM：主页 Schedules tab）----
    const preTab = getForms()?.[CARRIER]?.preTab;
    if (preTab) {
      try {
        const tb = page.getByRole('tab', { name: new RegExp(`^${preTab}$`, 'i') }).first();
        if (await tb.isVisible({ timeout: 8000 }).catch(() => false)) { await tb.click({ timeout: 8000 }); await sleep(2500); log(`✅ 已点 ${preTab} tab`); }
      } catch (e) { log(`⚠️ preTab 点击失败: ${String(e).slice(0, 80)}`); }
    }

    // ---- 起运港 ----
    // YM react-select 特例：全串 alias 匹配不到（react-select 前缀匹配），打主词首段
    const originWord = (CARRIER === 'yangming' || CARRIER === 'msc') ? (oPort.word || ORIGIN).split(/[ (,]/)[0] : ORIGIN_TYPED;
    const o = await tryFill(page, originWord, 'origin', log);
    if (o) {
      const pref = pickRegexFor('origin');
      const base = t => new RegExp((oPort.word||ORIGIN).split(/[ (,]/)[0].slice(0,4), 'i').test(t) && !/place names including/i.test(t);
      const lo = (oPort.locode||'').toLowerCase(); const oc = (oPort.country||'').toLowerCase(); const rt = (t) => { const m = t.toLowerCase().match(/\(([a-z]{2}[a-z]{3})\)/); return m ? m[1].toUpperCase() : null; };
  const kendo = !!getForms()?.[CARRIER]?.kendoKeyboard;
  if (kendo) await kendoKeyboardPick(page, o.field, '起运港', t => rt(t) === (oPort.locode||'').toUpperCase() && /\bport\b/i.test(t), log);
  else await pickCandidate(page, o.field, ORIGIN_TYPED, '起运港', { pick: t => { const x = t.toLowerCase(); return !!(lo && rt(t) === (oPort.locode||'').toUpperCase() && /\bport\b/i.test(t)) || (base(t) && !/place names including/i.test(t) && (oc ? x.includes(oc) : true) && !/door|ramp/i.test(x)); } });
    }

    // ---- 目的港（含变体轮换，全部记录）----
    const destWord = (CARRIER === 'yangming' || CARRIER === 'msc') ? (dPort.word || DEST).split(/[ (,]/)[0] : DEST_TYPED;
    const d = await tryFill(page, destWord, 'dest', log);
    if (d) {
      const dl = (dPort.locode||'').toLowerCase(); const dc = (dPort.country||'').toLowerCase();
    // YM/MSC 等的候选文本里含 LOCODE，pick 优先 locode 硬匹配
      if (getForms()?.[CARRIER]?.kendoKeyboard) await kendoKeyboardPick(page, d.field, '目的港', t => { const m = t.toLowerCase().match(/\(([a-z]{2}[a-z]{3})\)/); const code = m ? m[1].toUpperCase() : null; return code === 'TRAVC' && /\bport\b/i.test(t) || code === 'TRHAY' && /\bport\b/i.test(t) || code === (dPort.locode||'').toUpperCase() && /\bport\b/i.test(t); }, log);
      else await pickCandidate(page, d.field, DEST_TYPED, '目的港', {
        pick: t => { const x = t.toLowerCase(); return !/place names including/i.test(t) && !!( (dl && x.includes(dl)) || (x.includes('ambarli')||x.includes('haydarpasa')||x.includes('haydarpaşa')||x.includes('gebze')||x.includes('izmit')||x.includes('marda')||x.includes('marmara')||x.includes('trist')||x.includes((dPort.word||DEST).toLowerCase())) && (!dc || x.includes(dc) || x.includes('turkiye') || x.includes('marmara') || x.includes('haydarpasa')||x.includes('haydarpaşa')) ); },
        fallbacks: ['ambarli', 'haydarpasa', 'haydarpaşa', 'gebze', 'izmit', 'marda'],
      });
    }

    // ---- 日期 ----
    await tryDate(page, log);

    // ---- COSCO 位置选择 modal（Online Services → Confirm）----
    try {
      const modal = page.locator('.ivu-modal-wrap, .ivu-modal').first();
      if (await modal.isVisible({ timeout: 800 }).catch(() => false)) {
        const mt = await modal.innerText().catch(() => '');
        log(`检测到 modal: ${mt.replace(/\s+/g, ' ').slice(0, 60)}`);
        if (/please select your expected location/i.test(mt)) {
          await page.getByRole('button', { name: /confirm/i }).first().click({ timeout: 3000 }).catch(() => {});
          await sleep(1500);
          log('已点 Confirm');
        }
      }
    } catch {}

    // ---- 搜索 ----
    await trySearch(page, log);

    // ---- 结果 ----
    let text = '';
    const waitR = getForms()?.[CARRIER]?.waitResult || 0;
    const loops = waitR ? Math.ceil(waitR / 2500) : 12;
    for (let i = 0; i < loops; i++) {
      await sleep(2500);
      text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (text.length > 2000) break;
    }
    out.resultText = text.slice(0, 20000);
    log(`结果页文本 ${text.length} 字符`);
    const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
    const hits = lines.filter(l => /ningbo|istanbul|ambarli|haydarpasa|gebze|izmit|departure|arrival|eta|etd|transit|voyage|vessel|no schedule|no result|not found|no sailing/i.test(l));
    log('---- 结果关键行 ----');
    hits.slice(0, 60).forEach(l => console.log('  ', l.slice(0, 150)));
    // CMA 误判修正（婉宜 9-21 定案）：eco 计算器里的 "NO RESULTS:" 文案≠空结果——
    // 有 "POL Ningbo" 等真实船期行就是 OK
    const hasRealSched = /POL\s+Ningbo|pol\s+ningbo/i.test(text) || /departure|transit time|arrival/i.test(text) && /\d+\s*days?/i.test(text);
    out.verdict = hasRealSched ? 'OK'
      : /no schedule|no result|no sailing|not found|no vessels|no voyage/i.test(text) ? 'EMPTY'
      : (hits.length >= 3 ? 'OK' : 'UNCERTAIN');
    log(`初步判定: ${out.verdict}`);
  }
} catch (e) {
  out.verdict = out.verdict === 'RUNNING' ? 'ERROR' : out.verdict;
  log(`异常: ${String(e).slice(0, 200)}`);
}

// ---- 存证据 ----
try { await page.mouse.wheel(0, 2600); await sleep(2000); } catch {}
try { await page.screenshot({ path: path.join(EVBASE, `m4-${CARRIER}.png`), fullPage: false }); log(`截图 → evidence/m4-${CARRIER}.png`); } catch {}
const xhr = xhrHits.filter(x => x.len > 200);
if (xhr.length) { fs.writeFileSync(path.join(EVBASE, `m4-${CARRIER}-xhr.json`), JSON.stringify(xhr.slice(0, 40), null, 1)); log(`XHR ${xhr.length} 条 → evidence/m4-${CARRIER}-xhr.json`); }
fs.writeFileSync(path.join(EVBASE, `m4-${CARRIER}.txt`), out.steps.join('\n'));
fs.writeFileSync(path.join(OUT, 'state.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(OUT, 'candidates.json'), JSON.stringify(out.candidates, null, 1));
console.log('STATE_FILE=' + path.join(OUT, 'state.json'));
await ctx.close().catch(() => {});
process.exit(0);

// ================= 以下是各家表单辅助（按站点分派）=================
async function tryFill(page, word, kind, log) {
  const conf = getForms()[CARRIER];
  if (!conf) return null;
  const locs = [];
  for (const sel of conf.fields[kind]) {
    if (sel.startsWith('group:')) {
      // group:<groupName>||<role>||<nameRegex> ：在命名 group 内找 role
      const parts = sel.split('||');
      locs.push({ desc: sel, get: () => page.getByRole('group', { name: new RegExp(parts[0].slice(6), 'i') }).getByRole(parts[1], { name: parts[2] ? new RegExp(parts[2], 'i') : /.*/ }).first() });
    } else if (sel.startsWith('role:') || sel.startsWith('role2:')) {
      const parts = sel.split('||'); const role = parts[0].slice(parts[0].indexOf(':') + 1), name = parts[1];
      const nth = sel.startsWith('role2:') ? 1 : 0;
      locs.push({ desc: sel, get: () => page.getByRole(role, { name: new RegExp(name.replace(/[()]/g, '\\$&'), 'i') }).nth(nth) });
    } else {
      locs.push({ desc: sel, get: () => page.locator(sel).first() });
    }
  }
  for (const L of locs) {
    try {
      const f = L.get();
      const waited = await f.waitFor({ state: 'visible', timeout: L.desc.startsWith('role') ? 10000 : 3000 }).then(() => true).catch(() => false);
      if (waited) {
        await f.click({ timeout: 5000 });
        await f.fill('', { timeout: 2000 }).catch(() => {});
        await f.type(word, { delay: 70 });
        await sleep(2500);
        log(`✅ ${kind === 'origin' ? '起运' : '目的'}输入 [${L.desc.slice(0, 60)}] "${word}"`);
        return { field: f, sel: L.desc };
      }
    } catch (e) { log(`  字段 ${L.desc.slice(0, 40)} 失败: ${String(e).slice(0, 60)}`); }
  }
  log(`⚠️ ${kind} 字段未命中（选择器均不可见）`);
  return null;
}

async function tryDate(page, log) {
  const conf = getForms()[CARRIER]; if (!conf) return;
  for (const sel of conf.dateFields) {
    try {
      const f = page.locator(sel).first();
      if (await f.isVisible({ timeout: 2000 }).catch(() => false)) {
        await f.click({ timeout: 2000 }).catch(() => {});
        if ((await f.getAttribute('type').catch(() => '')) === 'date') {
          // 原生 date input：直接 fill ISO 格式（fill+type 对它无效）
          await f.fill(DATE_ISO, { timeout: 2000 }).catch(() => {});
        } else {
          await f.fill('', { timeout: 1500 }).catch(() => {});
          await f.type(dateF(conf.dateFmt), { delay: 50 }).catch(() => {});
        }
        await page.keyboard.press('Escape').catch(() => {});
        await sleep(500);
        const v = await f.inputValue().catch(() => '');
        if (v && /\d/.test(v)) { log(`✅ 日期 → ${v}`); return; }
      }
    } catch {}
  }
  log('⚠️ 日期未填上');
}

async function trySearch(page, log) {
  const conf = getForms()[CARRIER]; if (!conf) return;
  for (const sel of conf.searchBtns) {
    try {
      let all;
      if (sel.startsWith('role:')) { const parts = sel.split('||'); const role = parts[0].slice(5), name = parts[1]; all = page.getByRole(role, { name: new RegExp(name, 'i') }); }
      else all = page.locator(sel);
      const n = await all.count().catch(() => 0);
      // 从后往前点第一个可见的（表单提交键通常在后，页头同名键在前）
      for (let i = n - 1; i >= 0; i--) {
        const b = all.nth(i);
        if (await b.isVisible({ timeout: 1500 }).catch(() => false)) {
          await b.click({ timeout: 4000 });
          log(`✅ 已点搜索 [${sel.slice(0, 40)}#${i}]`);
          await sleep(1500);
          return;
        }
      }
    } catch {}
  }
  log('⚠️ 搜索按钮未命中');
}

// 各家表单选择器（首版来自历史 aria 探查，跑通后修正）
function pickRegexFor(kind) {
  const conf = {
    cma: { origin: /port/i, dest: /port/i },          // CMA 港口候选带 "Port" 后缀
    default: null,
  };
  return (conf[CARRIER] || conf.default)?.[kind] || null;
}
function getForms() { return {
  maersk: {
    fields: {
      origin: ['role:combobox||from \\(city, country/region\\)', 'role:combobox||from', 'input[aria-label*="from" i]', 'input[placeholder*="from" i]'],
      dest: ['role:combobox||to \\(city, country/region\\)', 'role:combobox||^to\\b', 'input[aria-label*="to" i]', 'input[placeholder*="to" i]'],
    },
    dateFields: ['input[placeholder*="DD/MM/YYYY" i]', 'input[placeholder*="dd/mm/yyyy" i]'],
    searchBtns: ['role:button||^\\s*search\\s*$', 'button:has-text("Search")'],
    dateFmt: 'dd_mm_yyyy',
  },
  msc: {
    fields: {
      origin: ['role:textbox||from \\(ports or countries\\)', 'role:textbox||^from', 'input[placeholder*="origin" i]', 'input[name*="from" i]'],
      dest: ['role:textbox||to \\(ports or countries\\)', 'role:textbox||^to', 'input[placeholder*="destination" i]', 'input[name*="to" i]'],
    },
    dateFields: ['role:textbox||^dd/MM/yyyy', 'input[placeholder*="dd/mm" i]', 'input[type="date"]'],
    searchBtns: ['role:button||^\\s*search\\s*$', 'button:has-text("Search")'],
    dateFmt: 'dd_mm_yyyy',
  },
  cma: {
    fields: {
      origin: ['role:combobox||port, city, country name or code'],
      dest: ['group:Destination||combobox', 'role2:combobox||port, city, country name or code'],
    },
    dateFields: ['role:combobox||datepicker'],
    searchBtns: ['role:button||^search$'],
    dateFmt: 'yyyy_mm_dd',
    kendoKeyboard: true,   // Kendo listitem 点击脆（点完不生效），改键盘导航选 Port 行
  },
  cosco: {
    fields: {
      origin: ['role:textbox||origin city', 'input[placeholder*="origin" i]'],
      dest: ['role:textbox||destination city', 'input[placeholder*="destination" i]'],
    },
    dateFields: ['role:textbox||earliest departure', 'input[type="date"]'],
    searchBtns: ['button.btnSearch', '.submit-btn', 'role:button||^\\s*search\\s*$'],
    dateFmt: 'yyyy_mm_dd',
  },
  hapag: {
    fields: {
      origin: ['input[placeholder*="origin" i]', 'input[aria-label*="origin" i]', 'input[placeholder*="from" i]'],
      dest: ['input[placeholder*="destination" i]', 'input[aria-label*="destination" i]', 'input[placeholder*="to" i]'],
    },
    dateFields: ['input[placeholder*="date" i]', 'input[type="date"]'],
    searchBtns: ['button:has-text("Search")', 'button:has-text("Find")'],
    dateFmt: 'yyyy_mm_dd',
  },
  one: {
    fields: {
      origin: ['input[placeholder*="origin" i]', 'input[placeholder*="from" i]', 'input[name*="origin" i]', 'input[name*="fromPol" i]', 'input[id*="origin" i]'],
      dest: ['input[placeholder*="destination" i]', 'input[placeholder*="to" i]', 'input[name*="destination" i]', 'input[name*="toPod" i]', 'input[id*="destination" i]'],
    },
    dateFields: ['input[type="date"]', 'input[placeholder*="date" i]'],
    searchBtns: ['role:button||^\\s*search\\s*$', 'button:has-text("Search")', 'input[type="submit"]'],
    dateFmt: 'yyyy_mm_dd',
  },
  evergreen: {
    fields: {
      origin: ['role:textbox||^origin$'],
      dest: ['role:textbox||^destination$'],
    },
    dateFields: ['input[name*="date" i]', 'input[placeholder*="date" i]'],
    searchBtns: ['role:button||^search$'],
    dateFmt: 'yyyy_mm_dd',
  },
  yangming: {
    fields: {
      // aria 快照（aria8-ym-p2p.txt）：From/To 是 aria-haspopup combobox（aria-label 空，placeholder 提示在旁）
      origin: ['xpath=//label[contains(., "Location From")]//following::input[1]', 'input[placeholder*="input location name" i]', 'input[type="text"][aria-haspopup="true"] >> nth=0'],
      dest: ['xpath=//label[contains(., "Location To")]//following::input[1]', 'input[placeholder*="input location name" i] >> nth=1', 'input[type="text"][aria-haspopup="true"] >> nth=1'],
    },
    dateFields: ['input[type="text"] >> nth=2'],
    searchBtns: ['role:button||^search$'],
    dateFmt: 'slashes',
  },
  hmm: {
    fields: {
      origin: ['role:textbox||input a location name'],
      dest: ['role2:textbox||input a location name'],
    },
    dateFields: ['input[placeholder*="dd/mm/yyyy" i]', 'input[placeholder*="DD/MM/YYYY" i]', 'input[type="date"]'],
    searchBtns: ['role:button||^search$'],
    dateFmt: 'dd_mm_yyyy',
  },
  zim: {
    // 2026-09-22 实测：主页 Schedules tab 内 P2P 表单（combobox "Origin"/"Destination" + button Search）
    preTab: 'schedules',            // 打开主页后先点这个 tab
    fields: {
      origin: ['role:combobox||^origin$'],
      dest: ['role:combobox||^destination$'],
    },
    dateFields: [],                 // 表单无日期框（默认 fromdate=今天, weeksahead=6）
    searchBtns: ['role:button||^search$'],
    dateFmt: 'yyyy_mm_dd',
    waitResult: 35000,              // 结果页是 React 壳，需长等
  },
};}

