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
  return (
    PORTS.find((p) => p.n.toLowerCase() === s) ||
    PORTS.find((p) => p.n.toLowerCase().startsWith(s)) ||
    PORTS.find((p) => p.n.toLowerCase().includes(s)) ||
    null
  );
}

function renderPortHint(inputId, hintId) {
  const el = document.getElementById(hintId);
  if (!el) return;
  if (!PORTS_LOADED) { el.textContent = ''; return; }
  const p = matchPort(document.getElementById(inputId).value);
  if (!p) { el.textContent = ''; el.className = 'porthint'; return; }
  const near = (p.near || []).map((x) => x.n).slice(0, 6);
  el.innerHTML =
    `✅ 识别为 <b>${p.n}</b> (${p.l}${p.c ? ' · ' + p.c : ''})` +
    (near.length ? `<br><span class="near">同港区：${near.join(' / ')}</span>` : '');
  el.className = 'porthint ok';
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
  </header>

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

// 一条船期 = 时间轴中的一行（左：开船日期；中：航线+船名航次；右：天数+直达/转）
function scheduleRowHTML(r, accent) {
  const q = lastQuery || { origin: '', destination: '' };
  const pill = r.direct
    ? '<span class="pill direct">直达</span>'
    : `<span class="pill trans">转${r.via ? ' ' + r.via : ''}</span>`;
  return `<div class="trow" style="--accent:${accent}">
    <div class="when"><div class="md">${fmtMD(r.etd)}</div><div class="wd">${fmtWD(r.etd)}</div></div>
    <div class="rail"><span class="node"></span></div>
    <div class="body">
      <div class="line1">${q.origin} <span class="arrow">→</span> ${q.destination}</div>
      <div class="vessel">${r.vessel || '?'}${r.voyage ? ` <span class="voy">${r.voyage}</span>` : ''} · ${fmtMD(r.eta)} 到港</div>
    </div>
    <div class="right"><span class="days">${r.transitDays ?? '?'}<span>天</span></span>${pill}</div>
  </div>`;
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

document.getElementById('btnGo').onclick = async () => {
  if (engineRunning) return;
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
    return;
  }
  ['origin', 'destination', 'date'].forEach(id => document.getElementById(id).classList.remove('invalid'));
  const selected = [...listEl.querySelectorAll('input:checked')].map(b => b.dataset.id);
  lastQuery = { origin, destination };  // 修 9-25『点击无反应』：此前误用未定义变量 originInput/destInput（async 里 ReferenceError 被静默吞）
  if (!selected.length) { alert('至少勾选一家船司'); return; }

  renderInitialStatus(selected);
  setEngineDot('busy');
  engineRunning = true;
  stopFlag = false;
  updateGoBtn();
  const startedAt = Date.now();

  try {
    const res = await invoke('run_query', {
      args: {
        origin, destination, date,
        carriers: selected,
        headless: false,
        visible: true,
      },
    });
    if (!hasTauri) {
      setEngineDot('off');
      document.getElementById('summary').textContent = '浏览器环境（非 Tauri）— 请用 npm run tauri:dev 运行';
    }
    if (res && res.ok === false) console.warn('run_query returned', res);
  } catch (e) {
    setEngineDot('off');
    for (const id of selected) setRow(id, { status: 'failed', msg: '启动失败：' + String(e).slice(0, 120) });
  } finally {
    engineRunning = false;
    updateGoBtn();
  }
};

function updateGoBtn() {
  const btn = document.getElementById('btnGo');
  btn.disabled = engineRunning;
  btn.textContent = engineRunning ? '查询中…' : '并发查询';
}
function setEngineDot(state) {
  const dot = document.getElementById('engineDot');
  dot.className = 'engine-dot' + (state === 'on' ? ' on' : state === 'busy' ? ' busy' : '');
  document.getElementById('engineState').textContent =
    state === 'on' ? 'engine 在线' : state === 'busy' ? 'engine 执行中' : 'engine 未启动';
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
    } else if (ev.type === 'engine-log') {
      const box = document.getElementById('summary');
      if (box && !box.textContent.includes('⚠️')) box.textContent = String(ev.msg || '').slice(0, 160);
    } else if (ev.type === 'engine-exit') {
      setEngineDot('off');
      engineRunning = false;
      updateGoBtn();
      refreshSummary(true);
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
