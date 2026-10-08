import './styles.css';

// ---------- 船司清单（与 engine/recipes/registry 保持一致）----------
const CARRIERS = [
  { id: 'msc',       name: 'MSC 地中海航运',       url: 'https://www.msc.com/en/schedules' },
  { id: 'maersk',    name: 'Maersk 马士基',        url: 'https://www.maersk.com/schedules/pointToPoint' },
  { id: 'cma',       name: 'CMA CGM 达飞',        url: 'https://www.cma-cgm.com/ebusiness/schedules' },
  { id: 'cosco',     name: 'COSCO 中远海运',      url: 'https://elines.coscoshipping.com/' },
  { id: 'hapag',     name: 'Hapag-Lloyd 赫伯罗特', url: 'https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html' },
  { id: 'one',       name: 'ONE 海洋网联',        url: 'https://ecomm.one-line.com/one-ecom/schedule' },
  { id: 'evergreen', name: 'Evergreen 长荣', url: 'https://www.shipmentlink.com/' },
  { id: 'yangming',  name: 'Yang Ming 阳明',      url: 'https://www.yangming.com/' },
  { id: 'hmm',       name: 'HMM',                 url: 'https://www.hmm21.com/' },
  { id: 'zim',       name: 'ZIM 以星',            url: 'https://www.zim.com/' },
  { id: 'oocl',      name: 'OOCL 东方海外',       url: 'https://www.oocl.com/' },
];

// ---------- 港口词典：输入智能识别 + 同港区提示（爹地 9-23 需求）----------
// 数据由 tools/export_ports.py 从 db/ports.db 生成（UN/LOCODE 17522 港 + 坐标近邻「港口圈」）
let PORTS = [];
let PORTS_LOADED = false;
fetch('ports.json')
  .then((r) => r.json())
  .then((d) => {
    PORTS = d;
    PORTS_LOADED = true;
    const dl = document.getElementById('portsList');
    if (dl) {
      // datalist 只放「名称较短的主港」避免下拉过长；完整匹配仍走 matchPort
      const short = d.filter((p) => p.n && p.n.length <= 18);
      dl.innerHTML = short.map((p) => `<option value="${p.n}">${p.l}${p.c ? ' · ' + p.c : ''}</option>`).join('');
    }
    console.log('[ports] 词典加载完成:', d.length);
  })
  .catch((e) => console.warn('[ports] 词典加载失败（识别提示不可用）:', e));

function matchPort(q) {
  const s = (q || '').trim().toLowerCase();
  if (s.length < 3) return null;
  // 区分「精确 / 前缀 / 包含」——逆着逻辑测出来的隐患：输入 shan 会被前缀匹配到
  // 爱尔兰 Shannon (CANON)，旧版界面照样显示「✅ 识别为 Shannon」，用户会以为查的是上海。
  const exact = PORTS.find((p) => p.n.toLowerCase() === s);
  if (exact) return { p: exact, how: 'exact' };
  const pre = PORTS.find((p) => p.n.toLowerCase().startsWith(s));
  if (pre) return { p: pre, how: 'prefix' };
  const inc = PORTS.find((p) => p.n.toLowerCase().includes(s));
  if (inc) return { p: inc, how: 'contains' };
  return null;
}

function renderPortHint(inputId, hintId) {
  const el = document.getElementById(hintId);
  if (!el) return;
  if (!PORTS_LOADED) { el.textContent = ''; return; }
  const raw = document.getElementById(inputId).value.trim();
  const m = matchPort(raw);
  if (!m) {
    if (raw.length >= 3) {
      // 明确告诉用户词典里没有：避免他以为识别成功了
      el.innerHTML = `⚠️ 词典里没有「${raw}」—— 会按原词交给各船司网站（可能查不到，建议用英文港名）`;
      el.className = 'porthint warn';
    } else {
      el.textContent = ''; el.className = 'porthint';
    }
    return;
  }
  const near = (m.p.near || []).map((x) => x.n).slice(0, 6);
  if (m.how === 'exact') {
    el.innerHTML =
      `✅ 识别为 <b>${m.p.n}</b> (${m.p.l}${m.p.c ? ' · ' + m.p.c : ''})` +
      (near.length ? `<br><span class="near">同港区：${near.join(' / ')}</span>` : '');
    el.className = 'porthint ok';
  } else {
    // 前缀/包含匹配：可能不是用户想要的那个港 —— 必须让人看见并要求确认
    el.innerHTML =
      `⚠️ 近似匹配 <b>${m.p.n}</b> (${m.p.l}${m.p.c ? ' · ' + m.p.c : ''})　` +
      `<span class="near">不是精确名称，请确认是不是这个港（输入越完整越准）</span>`;
    el.className = 'porthint warn';
  }
}

// ---------- 状态文案 ----------
const BADGE = {
  pending:  { text: '待查询', cls: 'pending' },
  running:  { text: '查询中…', cls: 'running' },
  prefilled: { text: '已填表·无结构化结果', cls: 'fallback' },
  done:     { text: '✓ 已查到', cls: 'ok' },
  opened:   { text: '仅打开页面', cls: 'fallback' },
  failed:   { text: '失败', cls: 'fail' },
};

// ---------- DOM 构建 ----------
const app = document.getElementById('app');
app.innerHTML = `
  <header class="topbar">
    <h1>⚓ ShipScheduleHub</h1>
    <span class="sub">船期聚合驾驶舱 v0.1</span>
    <span class="spacer"></span>
    <span><span id="engineDot" class="engine-dot"></span><span id="engineState">engine 未启动</span></span>
    <button id="btnDiag" class="btn-ghost" title="查看引擎/node 路径与最近输出（排查「点了没反应」）">诊断</button>
  </header>
  <div id="diagBox" class="diagbox" hidden></div>
  <div id="errBox" class="errbox" hidden></div>

  <section class="formbar">
    <div class="field">
      <label>起运港</label>
      <input id="origin" list="portsList" placeholder="例如 Ningbo / Shanghai / Qingdao" />
      <div id="originHint" class="porthint"></div>
    </div>
    <div class="field">
      <label>目的港</label>
      <input id="destination" list="portsList" placeholder="例如 Istanbul / Rotterdam" />
      <div id="destinationHint" class="porthint"></div>
    </div>
    <datalist id="portsList"></datalist>
    <div class="field"><label>日期（YYYY-MM-DD，留空 = 当天）</label><input id="date" placeholder="留空 = 用网站默认（通常当天）" /></div>
    <button id="btnGo" class="btn-primary">并发查询</button>
    <button id="btnStop" class="btn-ghost" title="停止当前查询（已打开页面保留）">停止</button>
  </section>

  <section class="main">
    <aside class="carriers">
      <div class="head">船司 <button id="selAll">全选/清空</button></div>
      <div id="carrierList"></div>
    </aside>
    <section class="statuswrap">
      <div class="statushead">
        <b id="statusTitle">查询状态</b>
        <span id="summary"></span>
      </div>
      <div id="statusList" class="statuslist">
        <div class="empty"><span class="big">🚢</span><span>填好条件，勾选船司，点「并发查询」</span></div>
      </div>
    </section>
  </section>
`;

document.getElementById('btnDiag').onclick = async () => {
  const box = document.getElementById('diagBox');
  box.hidden = !box.hidden;
  if (!box.hidden && !diagInfo) await loadDiagnostics();
  else renderDiagnostics();
};

// ---------- 船司列表 ----------
const listEl = document.getElementById('carrierList');
for (const c of CARRIERS) {
  const row = document.createElement('label');
  row.className = 'carrier-row';
  row.innerHTML = `<input type="checkbox" checked data-id="${c.id}" /><span class="name">${c.name}</span><span class="code">${c.id.toUpperCase().slice(0, 4)}</span>`;
  listEl.appendChild(row);
}
document.getElementById('selAll').onclick = () => {
  const boxes = [...listEl.querySelectorAll('input')];
  const anyOff = boxes.some(b => !b.checked);
  boxes.forEach(b => (b.checked = anyOff));
};

// ---------- Tauri invoke ----------
const hasTauri = typeof window.__TAURI_INTERNALS__ !== 'undefined' || typeof window.__TAURI__ !== 'undefined';
async function invoke(cmd, args) {
  if (!hasTauri) return { ok: false, error: 'not-in-tauri' };
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(cmd, args);
}

let lastQuery = { origin: '', destination: '' };

// 维运网兜底链接：用系统浏览器打开（婉宜 9-24）
document.addEventListener('click', async (ev) => {
  const a = ev.target.closest('a[data-wy]');
  if (!a) return;
  ev.preventDefault();
  try { const { invoke } = await import('@tauri-apps/api/core'); await invoke('open_external', { url: 'https://www.weiyun001.com/NewRoute' }); }
  catch (e) { console.warn('open_external', e); }
});

// ---------- 结果渲染（时间轴行程式 · 婉宜 9-30 按爹地选定的 002 稿）----------
const CARRIER_COLORS = {
  msc: '#b45309', maersk: '#1b4fd8', cma: '#c0264b', cosco: '#0e7490', hapag: '#ea7c1f',
  one: '#be185d', evergreen: '#15803d', yangming: '#6d28d9', hmm: '#0f766e', zim: '#475569', oocl: '#0369a1',
};
const accentOf = (id) => CARRIER_COLORS[id] || '#2f6df6';
const WD = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function splitDate(v) {
  const m = /(\d{4})[-/.]?(\d{2})[-/.]?(\d{2})/.exec(String(v || ''));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
function fmtMD(v) { const t = splitDate(v); return t ? `${t.m}.${String(t.d).padStart(2, '0')}` : String(v || '?').slice(0, 10); }
function fmtWD(v) { const t = splitDate(v); return t ? WD[new Date(t.y, t.m - 1, t.d).getDay()] : ''; }

// 一条船期 = 时间轴中的一行；带 detail 时整行可点，展开看「航程 + 截单时间」（婉宜 9-30）
function scheduleRowHTML(r, accent) {
  const q = lastQuery || { origin: '', destination: '' };
  const pill = r.direct
    ? '<span class="pill direct">直达</span>'
    : `<span class="pill trans">转${r.via ? ' ' + r.via : ''}</span>`;
  const det = r.detail || null;
  const cuts = det ? Object.entries(det.cutoffs || {}) : [];
  const hasDet = !!(det && ((det.legs || []).length || cuts.length));
  const row = `<div class="trow${hasDet ? ' clickable' : ''}"${hasDet ? ' title="点一下看航程与截单时间"' : ''}>
    <div class="when"><div class="md">${fmtMD(r.etd)}</div><div class="wd">${fmtWD(r.etd)}</div></div>
    <div class="rail"><span class="node"></span></div>
    <div class="body">
      <div class="line1">${q.origin} <span class="arrow">→</span> ${q.destination}</div>
      <div class="vessel">${r.vessel || '?'}${r.voyage ? ` <span class="voy">${r.voyage}</span>` : ''} · ${fmtMD(r.eta)} 到港</div>
    </div>
    <div class="right"><span class="days">${r.transitDays ?? '?'}<span>天</span></span>${pill}${hasDet ? '<span class="tmore">详情</span>' : ''}</div>
  </div>`;
  return `<div class="trow-wrap${hasDet ? ' expandable' : ''}">${row}${hasDet ? `<div class="tdetail">${detailHTML(det)}</div>` : ''}</div>`;
}

// 详情体：上部航程（分段/码头/船信息/挂靠港），下部截单时间（官网原值，不做任何推断）
function detailHTML(det) {
  const legs = (det.legs || []).map((l) => {
    const from = `${l.from || '?'}${l.fromTerminal ? ` <span class="term">${l.fromTerminal}</span>` : ''}`;
    const to = `${l.to || '?'}${l.toTerminal ? ` <span class="term">${l.toTerminal}</span>` : ''}`;
    // 船信息：不再带 service / CO₂（标题行已有，避免同一屏重复两次）
    const ship = [l.vessel, l.imo ? `IMO ${l.imo}` : '', l.built ? `${l.built} 年造` : '', l.flag]
      .filter(Boolean).join(' · ');
    return `<div class="dleg">
      <div class="dline">${from} <span class="arw">→</span> ${to}</div>
      <div class="dtimes">${l.etd || ''} → ${l.eta || ''}${(l.seq || 1) > 1 ? ` · 第 ${l.seq} 段` : ''}</div>
      ${ship ? `<div class="dvessel">${ship}</div>` : ''}
      ${(l.calls || []).length ? `<div class="dcalls">挂靠：${l.calls.join(' · ')}</div>` : ''}
    </div>`;
  }).join('');
  const cutRows = Object.entries(det.cutoffs || {})
    .map(([k, v]) => `<div class="dcut"><span class="dk">${k}</span><span class="dv">${v}</span></div>`).join('');
  const head = ['航程', det.service, det.routing, det.co2 ? `CO₂ ${det.co2}` : ''].filter(Boolean).join(' · ');
  return `
    ${legs ? `<div class="dsec"><div class="dtitle">${head}</div><div class="dlegs">${legs}</div></div>` : ''}
    ${cutRows ? `<div class="dsec"><div class="dtitle">截单时间<span class="dnote">（官网原值）</span></div><div class="dcuts">${cutRows}</div></div>` : ''}`;
}
function badgeFor(patch) {
  if (patch.status === 'done') {
    const n = (patch.schedules || []).length;
    return patch.cached ? { text: `⚡ 缓存 ${n} 条`, cls: 'cache' } : { text: `✓ 已查到 ${n} 条`, cls: 'ok' };
  }
  return BADGE[patch.status] || BADGE.pending;
}

function setRow(carrierId, patch) {
  const g = statusRows[carrierId];
  if (!g) return;
  const accent = accentOf(carrierId);
  if (patch.status) {
    const badge = badgeFor(patch);
    const el = g.querySelector('.badge');
    if (el) { el.textContent = badge.text; el.className = 'badge ' + badge.cls; el.dataset.st = patch.status; }
    const msgEl = g.querySelector('.cmsg');
    if (msgEl && patch.msg !== undefined) {
      // 有船期行时摘要只留前导说明（如「API 直查 8 条」/「Ningbo(CNNPO) → Ambarli(TRAMB)」），
      // 后面的样例列表由卡片行本身承担，避免长句把日期折成两截
      const hasRows = Array.isArray(patch.schedules) && patch.schedules.length > 0;
      let msg = String(patch.msg || '');
      if (hasRows) {
        const i = msg.indexOf('：');
        if (i > 0) msg = msg.slice(0, i);
        if (msg.length > 110) msg = msg.slice(0, 108) + '…';
      }
      msgEl.innerHTML = msg;
      msgEl.className = 'cmsg' + (patch.status === 'failed' ? ' err' : (patch.status === 'opened' || patch.status === 'prefilled' ? ' warn' : ''));
    }
  } else if (patch.msg !== undefined) {
    const msgEl = g.querySelector('.cmsg');
    if (msgEl) msgEl.innerHTML = patch.msg || '';
  }
  // 船期行
  if (Array.isArray(patch.schedules) && patch.schedules.length) {
    const list = g.querySelector('.clist');
    if (list) list.innerHTML = patch.schedules.map((r) => scheduleRowHTML(r, accent)).join('');
  }
  // 无船期 → 维运网兜底链接（爹地 9-24）
  const noData = patch.status === 'prefilled' || patch.status === 'opened'
    || (patch.status === 'done' && !(Array.isArray(patch.schedules) && patch.schedules.length));
  const existing = g.querySelector('.cnone');
  if (noData) {
    const box = existing || document.createElement('div');
    if (!existing) { box.className = 'cnone'; g.appendChild(box); }
    const q = lastQuery || { origin: '', destination: '' };
    box.innerHTML = `<a href="#" class="wy-link" data-wy="1">🔍 维运网查「${q.origin} → ${q.destination}」</a>`;
  } else if (existing) {
    existing.remove();
  }
}

// 点卡片头 → 折叠 / 展开（事件委托，重建 DOM 后依然有效）
document.getElementById('statusList').addEventListener('click', (ev) => {
  // ① 船期行：点一下展开「航程 + 截单」（婉宜 9-30）
  const row = ev.target.closest('.trow.clickable');
  if (row) { row.closest('.trow-wrap')?.classList.toggle('open'); return; }
  // ② 卡片头：折叠/展开整家
  const head = ev.target.closest('.chead');
  if (!head) return;
  if (ev.target.closest('a')) return;              // 头部里的链接不触发折叠
  head.closest('.cgroup')?.classList.toggle('collapsed');
});
document.getElementById('statusList').addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const head = ev.target.closest('.chead');
  if (!head) return;
  ev.preventDefault();
  head.closest('.cgroup')?.classList.toggle('collapsed');
});

const statusRows = {};
function renderInitialStatus(selected) {
  const wrap = document.getElementById('statusList');
  wrap.innerHTML = '';
  const q = lastQuery || { origin: '', destination: '' };
  const t = document.getElementById('statusTitle');
  if (t) t.textContent = `${q.origin || '起运'} → ${q.destination || '目的'}`;
  for (const id of selected) {
    const c = CARRIERS.find((x) => x.id === id);
    const accent = accentOf(id);
    const g = document.createElement('div');
    g.className = 'cgroup';
    g.style.setProperty('--accent', accent);
    g.innerHTML = `
      <div class="chead" role="button" tabindex="0" title="点这里折叠 / 展开这一家">
        <span class="cbar" style="background:${accent}"></span>
        <span class="chev" aria-hidden="true"><svg viewBox="0 0 12 12" width="12" height="12"><path d="M2 4.2 L6 8.2 L10 4.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span class="cname">${c.name}</span>
        <span class="ccode">${c.id.toUpperCase().slice(0, 4)}</span>
        <span class="spacer"></span>
        <span class="badge pending">待查询</span>
      </div>
      <div class="cbody">
        <div class="cmsg"></div>
        <div class="clist"></div>
      </div>`;
    statusRows[id] = g;
    wrap.appendChild(g);
  }
}

// ---------- 查询主流程 ----------
let engineRunning = false;
let stopFlag = false;

['origin', 'destination'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener('input', () => renderPortHint(id, id + 'Hint'));
});

// 正在查询时再点：不报错 —— 自动停掉旧的、接着跑新的（爹地 9-30：换港口重查会被「已在运行」拒掉）
let pendingRestart = null;

function collectQuery() {
  const origin = document.getElementById('origin').value.trim();
  const destination = document.getElementById('destination').value.trim();
  const date = document.getElementById('date').value.trim();
  let bad = null;
  if (!origin) bad = 'origin';
  else if (!destination) bad = 'destination';
  else if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) bad = 'date'; // 留空合法：用网站默认日期（爹地 9-23）
  if (bad) {
    document.getElementById(bad).classList.add('invalid');
    document.getElementById(bad).focus();
    return null;
  }
  ['origin', 'destination', 'date'].forEach((id) => document.getElementById(id).classList.remove('invalid'));
  const selected = [...listEl.querySelectorAll('input:checked')].map((b) => b.dataset.id);
  if (!selected.length) { alert('至少勾选一家船司'); return null; }
  return { origin, destination, date, selected };
}

async function startQuery(q) {
  clearEngineError();
  lastQuery = { origin: q.origin, destination: q.destination };  // 修 9-25『点击无反应』：此前误用未定义变量
  renderInitialStatus(q.selected);
  setEngineDot('busy');
  engineRunning = true;
  stopFlag = false;
  updateGoBtn();
  try {
    const res = await invoke('run_query', {
      args: { origin: q.origin, destination: q.destination, date: q.date, carriers: q.selected, headless: false, visible: true },
    });
    if (!hasTauri) {
      setEngineDot('off');
      document.getElementById('summary').textContent = '浏览器环境（非 Tauri）— 请用 npm run tauri:dev 运行';
    }
    if (res && res.ok === false) console.warn('run_query returned', res);
    // 注意：这里【不能】把 engineRunning 置回 false —— invoke 只是「启动成功」，
    // 引擎还在跑（真结束看 engine-exit 事件）。原来在 finally 里解锁，导致查询中按钮就解禁、
    // 再点必撞「engine 已在运行」（爹地 9-30 实测报错）。
  } catch (e) {
    setEngineDot('off');
    engineRunning = false;          // 启动就失败 → 立刻解禁，允许重试
    updateGoBtn();
    for (const id of q.selected) setRow(id, { status: 'failed', msg: '启动失败：' + String(e).slice(0, 120) });
  }
}

document.getElementById('btnGo').onclick = async () => {
  const q = collectQuery();
  if (!q) return;
  if (engineRunning) {
    // 查询中再点 = 换条件重查：先停旧的，等 engine-exit 自动开新的（不会报错）
    pendingRestart = q;
    const box = document.getElementById('summary');
    if (box) box.textContent = '⏹ 正在停止上一次查询，随后自动开始新查询…';
    await invoke('stop_query', {}).catch(() => {});
    // 兜底：若 8 秒内没等到 engine-exit（事件丢了/引擎卡住），强制解锁并直接开新查询
    setTimeout(() => {
      if (!pendingRestart) return;
      const p = pendingRestart; pendingRestart = null;
      engineRunning = false;
      startQuery(p);
    }, 8000);
    return;
  }
  startQuery(q);
};

function updateGoBtn() {
  const btn = document.getElementById('btnGo');
  const running = engineRunning || !!pendingRestart;
  // 运行中【不禁用】：再点一次 = 换条件重查（自动停掉旧的）。禁用会让人以为卡住了。
  btn.disabled = false;
  btn.textContent = running ? '重新查询（先停当前）' : '并发查询';
  btn.classList.toggle('btn-restart', running);
  const stopBtn = document.getElementById('btnStop');
  if (stopBtn) stopBtn.disabled = !engineRunning && !pendingRestart;
}
function setEngineDot(state) {
  const dot = document.getElementById('engineDot');
  dot.className = 'engine-dot' + (state === 'on' ? ' on' : state === 'busy' ? ' busy' : '');
  document.getElementById('engineState').textContent =
    state === 'on' ? 'engine 在线' : state === 'busy' ? 'engine 执行中' : 'engine 未启动';
}

// ---------- 错误条（独立显示，永不被摘要覆盖）----------
function showEngineError(msg) {
  const box = document.getElementById('errBox');
  if (!box) return;
  box.hidden = false;
  box.textContent = '⚠️ ' + String(msg).slice(0, 300);
  renderDiagnostics();
}
function clearEngineError() {
  const box = document.getElementById('errBox');
  if (box) { box.hidden = true; box.textContent = ''; }
}

// ---------- 诊断（爹地 9-30：Windows 上「点了没反应」必须能自查）----------
const stderrTail = [];
let diagInfo = null;
async function loadDiagnostics() {
  if (!hasTauri) return null;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    diagInfo = await invoke('diagnose', {});
  } catch (e) { diagInfo = { error: String(e) }; }
  renderDiagnostics();
  return diagInfo;
}
function renderDiagnostics() {
  const box = document.getElementById('diagBox');
  if (!box || box.hidden) return;
  const d = diagInfo || {};
  const line = (k, v, ok) => `<div class="drow"><span class="dk">${k}</span><span class="dv${ok === false ? ' bad' : ''}">${v ?? '—'}</span></div>`;
  box.innerHTML = [
    line('引擎状态', document.getElementById('engineState').textContent),
    line('node 可执行', d.node || '（未解析）', d.nodeExists),
    line('引擎脚本', d.script || '—', d.scriptExists),
    line('数据目录', d.dataDir || '—'),
    line('浏览器', d.chrome || '（未探测）'),
    (diagInfo && diagInfo.net ? Object.entries(diagInfo.net).map(([h, v]) => `<div class="drow"><span class="dk">连通 ${h.split('.')[0]}</span><span class="dv${String(v).startsWith('ok') ? '' : ' bad'}">${String(v).replace(/[<>&]/g, '')}</span></div>`).join('') : ''),
    (diagInfo && diagInfo.engineStderr ? `<div class="drow"><span class="dk">引擎自检错误</span><span class="dv bad">${String(diagInfo.engineStderr).replace(/[<>&]/g, '').slice(0, 300)}</span></div>` : ''),
    (diagInfo && diagInfo.engineErr ? `<div class="drow"><span class="dk">启动失败</span><span class="dv bad">${String(diagInfo.engineErr).replace(/[<>&]/g, '').slice(0, 300)}</span></div>` : ''),
    stderrTail.length ? `<div class="drow"><span class="dk">引擎输出</span><span class="dv bad">${stderrTail.slice(-4).map((x) => String(x).replace(/[<>&]/g, '')).join('<br>')}</span></div>` : '',
  ].filter(Boolean).join('');
}

// ---------- 引擎事件（Tauri event）----------
async function listenEngineEvents() {
  if (!hasTauri) return;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    await listen('engine://event', (e) => {
    const ev = e.payload;
    if (ev.type === 'engine-started') setEngineDot('on');
    else if (ev.type === 'carrier-status') {
      setRow(ev.carrier, { status: ev.status, msg: ev.msg, level: ev.level, schedules: ev.schedules });
      refreshSummary();
    } else if (ev.type === 'engine-error') {
      // 引擎崩了必须让爹地看见原因，而不是停在「未查询」（婉宜 9-23）
      const box = document.getElementById('summary');
      if (box) box.textContent = '⚠️ 引擎出错：' + String(ev.msg || '').slice(0, 200);
      setEngineDot('off');
      engineRunning = false;
      updateGoBtn();
    } else if (ev.type === 'engine-stderr') {
      // 引擎的 stderr：node 找不到、脚本路径错、依赖缺失、被系统拦……全都只走这里。
      // 不显示出来，用户看到的就是「点了查询毫无反应」（爹地 9-30 Windows 无 Chrome 环境实测）。
      const m = String(ev.msg || '').trim();
      if (m) {
        stderrTail.push(m);
        if (stderrTail.length > 8) stderrTail.shift();
        const fatal = /Error|error:|Cannot find|MODULE_NOT_FOUND|not found|EACCES|EPERM|ENOENT|throw/i.test(m);
        if (fatal) showEngineError(m);
        renderDiagnostics();
      }
    } else if (ev.type === 'engine-log') {
      const box = document.getElementById('summary');
      if (box && !box.textContent.includes('⚠️')) box.textContent = String(ev.msg || '').slice(0, 160);
    } else if (ev.type === 'engine-exit') {
      setEngineDot('off');
      engineRunning = false;
      updateGoBtn();
      refreshSummary(true);
      // 查询中被点了「并发查询」→ 这一轮结束后自动开新的（换港口重查不报错）
      if (pendingRestart) {
        const q = pendingRestart;
        pendingRestart = null;
        setTimeout(() => startQuery(q), 200);
        return;
      }
      // 引擎退出但一条结果都没有 → 必须说清原因，别让人对着空卡片猜
      const produced = Object.values(statusRows).some((g) => (g.querySelectorAll('.trow').length > 0));
      if (!produced) {
        const tail = stderrTail.slice(-2).join(' ⏎ ');
        showEngineError(tail
          ? `查询结束但没有任何结果　引擎输出：${tail.slice(0, 200)}`
          : '查询结束但没有任何结果（点上方「诊断」查看 node / 引擎路径）');
      }
      renderDiagnostics();
    }
    });
  } catch (err) {
    const box = document.getElementById('summary');
    if (box) box.textContent = '⚠️ 事件通道注册失败：' + String(err).slice(0, 160);
    console.error('listen engine://event failed', err);
  }
}

function refreshSummary() {
  const groups = Object.values(statusRows);
  if (!groups.length) return;
  let done = 0, rows = 0, running = 0, pending = 0, opened = 0, failed = 0;
  for (const g of groups) {
    const st = g.querySelector('.badge')?.dataset.st || 'pending';
    rows += g.querySelectorAll('.trow').length;
    if (st === 'done') done++;
    else if (st === 'running') running++;
    else if (st === 'pending') pending++;
    else if (st === 'failed') failed++;
    else opened++;   // prefilled / opened 都算「没拿到结构化船期」
  }
  const parts = [];
  if (done) parts.push(`✓ ${done} 家有船期`);
  if (rows) parts.push(`${rows} 条船期`);
  if (opened) parts.push(`${opened} 家待人工`);
  if (failed) parts.push(`✕ ${failed} 家失败`);
  if (running) parts.push(`⏳ ${running} 家查询中`);
  if (pending) parts.push(`· ${pending} 家待查`);
  const box = document.getElementById('summary');
  if (box) box.textContent = `${groups.length} 家 · ` + parts.join('　');
}

document.getElementById('btnStop').onclick = async () => {
  stopFlag = true;
  pendingRestart = null;   // 显式停止 = 取消排队中的重查
  await invoke('stop_query', {}).catch(() => {});
  setEngineDot('off');
  engineRunning = false;   // 关键：不解锁的话「停止」之后再点查询毫无反应（婉宜 9-23）
  updateGoBtn();
  document.getElementById('summary').textContent += '　已请求停止';
};

// ---------- 防御：任何未捕获错误都不许静默（婉宜 9-25『点击无反应』教训）----------
function showFatal(tag, msg) {
  const box = document.getElementById('summary');
  if (box) box.textContent = '\u26a0\ufe0f ' + tag + '\uff1a' + String(msg).slice(0, 200);
}
window.addEventListener('error', (e) => showFatal('脚本错误', (e && (e.message || e.error)) || 'unknown'));
window.addEventListener('unhandledrejection', (e) => {
  showFatal('未处理的异步错误', (e && e.reason && (e.reason.message || e.reason)) || 'unknown');
});

// ---------- 自检模式（SSH_SELFTEST=1 时自动走一遍查询，婉宜 9-25 取证用）----------
(async function selfTest() {
  if (!hasTauri) return;
  try {
    const on = await invoke('selftest_enabled', {});
    if (!on) return;
    setTimeout(() => {
      document.getElementById('origin').value = 'Ningbo';
      document.getElementById('destination').value = 'Istanbul';
      document.getElementById('btnGo').click();
    }, 2500);
  } catch (e) { showFatal('自检失败', e); }
})();

listenEngineEvents();
