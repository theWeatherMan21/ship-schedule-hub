import './styles.css';
import { detectCarrier, describeShape } from '../engine/tracking/detect.mjs';
import { parseManualText } from '../engine/tracking/manual-parse.mjs';   // 手工兜底解析：唯一一份，插件侧走桥调同一个模块
import { isNewer } from './lib/version.js';   // 更新检查的版本比较（可单测）

// ---------- 船司清单（与 engine/recipes/registry 保持一致）----------
const CARRIERS = [
  { id: 'msc',       name: 'MSC',       url: 'https://www.msc.com/en/schedules' },
  { id: 'maersk',    name: 'Maersk',        url: 'https://www.maersk.com/schedules/pointToPoint' },
  { id: 'cma',       name: 'CMA CGM',        url: 'https://www.cma-cgm.com/ebusiness/schedules' },
  { id: 'cosco',     name: 'COSCO',      url: 'https://elines.coscoshipping.com/' },
  { id: 'hapag',     name: 'Hapag-Lloyd', url: 'https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html' },
  { id: 'one',       name: 'ONE',        url: 'https://ecomm.one-line.com/one-ecom/schedule' },
  { id: 'evergreen', name: 'Evergreen', url: 'https://www.shipmentlink.com/' },
  { id: 'yangming',  name: 'Yang Ming',      url: 'https://www.yangming.com/' },
  { id: 'hmm',       name: 'HMM',                 url: 'https://www.hmm21.com/' },
  { id: 'zim',       name: 'ZIM',            url: 'https://www.zim.com/' },
  { id: 'oocl',      name: 'OOCL',       url: 'https://www.oocl.com/' },
];

// ---------- 港口词典：输入智能识别 + 同港区提示（爹地 9-23 需求）----------
// 数据由 tools/export_ports.py 从 db/ports.db 生成（UN/LOCODE 17522 港 + 坐标近邻「港口圈」）
let PORTS = [];
let PORTS_LOADED = false;
// 别名/同名优先/主干港信号（由 tools/build_port_aka.mjs 从 db/ports.db 导出）——
// 识别逻辑必须与引擎 engine/portdb.mjs 一致，否则界面提示和实际查询会对不上（婉宜 10-08）
let AK = { aka: {}, prefer: {}, major: {}, msc: [], signal: {} };
// 构建期内嵌（动态 import，Vite 单独切一个 chunk），不用运行时 fetch ——
// 运行期 fetch('ports.json') 在 Tauri 生产包里能否命中，取决于资源是否被内嵌，
// 而 release 的前端资源是压缩内嵌的、strings 也验不出来（婉宜 9-30 差点又靠 strings 下结论）。
// 直接 import：词典跟其它 UI 代码走同一条打包路径，UI 能显示它就一定在。
import('./port-aka.json').then((m) => { AK = m.default || m; }).catch(() => {});
window.__DISP = {};
import('./display-codes.json').then((m) => { window.__DISP = m.default || m; }).catch(() => {});
import('./ports.json')
  .then((m) => m.default || m)
  .then((d) => {
    PORTS = d;
    PORTS_LOADED = true;
    refreshPortList('');
    console.log('[ports] 词典加载完成:', d.length);
  })
  .catch((e) => console.warn('[ports] 词典加载失败（识别提示不可用）:', e));

// 下拉建议：**按输入实时筛选并按常见度排序**。
// 以前是把「名字 ≤18 字符」的全量塞进 datalist —— 输入 tianjin 会蹦出 Tianjinbaoshuiqu/Tianjin Pt 这类
// 生僻条目，爹地 10-09 反馈"名录看着有问题"。现在：主干港/船司名录里的港优先，最多 12 条。
function refreshPortList(q) {
  const dl = document.getElementById('portsList');
  if (!dl || !PORTS_LOADED) return;
  const s = pNorm(q);
  // 下拉只在"真的在打字"时给最少提示（爹地 10-09：平时靠 autocorrect，不看下拉）
  const akaCode = s.length >= 2 ? (AK.aka || {})[s] : null;
  const akaPort = akaCode ? PORTS.find((p) => p.l === akaCode) : null;
  let list = [];
  if (s.length >= 2) {
    list = PORTS.filter((p) => (p.n || '').length <= 28 && pNorm(p.n).startsWith(s))
      .slice().sort((a, b) => pScore(b, s) - pScore(a, s)).slice(0, 8);
  }
  if (akaPort && !list.some((p) => p.l === akaPort.l)) list = [akaPort, ...list.slice(0, 7)];
  dl.innerHTML = list.map((p) => `<option value="${p.n}">${(window.__DISP && window.__DISP[p.l]) || p.l}${p.c ? ' · ' + p.c : ''}</option>`).join('');
}

// 归一化：大小写/空格/连字符/点号一律忽略（Port-of-Spain = port of spain = portofspain）
const pNorm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// 多源打分（与 engine/portdb.mjs 的 score() 同款：主干港优先，多源交叉，不只看一家船司）
function pScore(p, wn) {
  const sig = (AK.signal || {})[p.l] || [null, 0, 0];
  let v = 0;
  if (pNorm(p.n) === wn) v += 500;
  if (sig[0]) v += 300 - Math.min(280, Number(sig[0]));
  if (sig[1]) v += 120;
  v += Math.min(120, Number(sig[2] || 0) * 40);
  if ((p.n || '').length > 24) v -= 5;
  return v;
}

// 同名港歧义：归一化港名相同的港分布在 ≥2 个国家时，返回每组国家各一个（供爹地一键选）
function sameNameAmbiguity(wn, primary, extra) {
  const pool = extra && extra.length ? extra : PORTS.filter((p) => pNorm(p.n) === wn);
  const byCountry = new Map();
  if (primary && !byCountry.has(primary.c)) byCountry.set(primary.c, primary);
  for (const p of pool) if (!byCountry.has(p.c)) byCountry.set(p.c, p);
  return byCountry.size >= 2 ? [...byCountry.values()].slice(0, 4) : null;
}

function matchPort(q) {
  const raw = (q || '').trim();
  const s = raw.toLowerCase();
  if (s.length < 3) return null;
  const wn = pNorm(s);
  const pref = (AK.prefer || {})[wn];

  // ① 别名（市场名/旧名/常用缩写/常见拼错）
  const akaHit = (AK.aka || {})[wn];
  if (akaHit) {
    const p = PORTS.find((x) => x.l === akaHit);
    if (p) return { p, how: 'alias', short: wn.length <= 4, ambiguous: sameNameAmbiguity(wn, p) };
  }
  // ② 词典：精确 → 前缀 → 包含（≥5 字符）
  const cands = [];
  for (const p of PORTS) {
    const pn = pNorm(p.n);
    if (pn === wn) cands.push(p);
  }
  let how = 'exact';
  if (!cands.length) {
    // 前缀 + 词边界（"Ningbo" → "Ningbo Pt" ✓；"Aal" ✗ "Aalborg"）
    for (const p of PORTS) {
      const pn = pNorm(p.n);
      if (!pn.startsWith(wn)) continue;
      const idx = String(p.n).toLowerCase().replace(/[^a-z0-9]/g, '').length - pn.length + wn.length;
      const rest = String(p.n).slice(idx);
      if (rest === '' || /^[\s,.\-–—/()'’]/.test(rest)) cands.push(p);
    }
    how = 'prefix';
  }
  if (!cands.length && s.length >= 5) {
    // 包含匹配要求词边界（"Ningbo" ⊂ "Ningbo Pt" ✓；"Adams" ⊄ "Adamston" ✗）
    const reWord = new RegExp('(^|[\\s,.\\-–—/()\'’])' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[\\s,.\\-–—/()\'’])', 'i');
    for (const p of PORTS) if (reWord.test(String(p.n))) cands.push(p);
    how = 'contains';
  }
  if (!cands.length) {
    // 后缀容错：PORTLAND, OR / UMM QASR PT / WILMINGTON, NC
    const strip = s.replace(/,\s*[a-z]{2,3}$/i, '').replace(/\s+(pt|port|harbour|harbor|terminal)$/i, '').trim();
    if (strip && strip !== s && strip.length >= 3) {
      const sw = pNorm(strip);
      for (const p of PORTS) {
        const pn = pNorm(p.n);
        if (pn === sw) { cands.push(p); continue; }
        if (!pn.startsWith(sw)) continue;
        const idx = String(p.n).toLowerCase().replace(/[^a-z0-9]/g, '').length - pn.length + sw.length;
        const rest = String(p.n).slice(idx);
        if (rest === '' || /^[\s,.\-–—/()'’]/.test(rest)) cands.push(p);
      }
      how = 'prefix';
    }
  }
  if (!cands.length) return null;
  // ③ 同名港排序：人工优先表 > 公开排名 > MSC 名录 > 多家船司别名
  cands.sort((a, b) => {
    const pa = pref && a.l === pref ? 1 : 0, pb = pref && b.l === pref ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return pScore(b, wn) - pScore(a, wn);
  });
  // ④ 歧义：命中**多个国家**的同名港时才需要用户出手（爹地 10-09：平时要 autocorrect，别让他挑）
  return { p: cands[0], how, short: s.replace(/[^a-z0-9]/g, '').length <= 4, ambiguous: sameNameAmbiguity(wn, cands[0], cands) };
}

function onPortInput(inputId) {
  const el = document.getElementById(inputId);
  if (el) refreshPortList(el.value || '');
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
      el.innerHTML = `⚠️ Not in dictionary: "${raw}" — sent as-is to each carrier (may return nothing; English port names recommended)`;
      el.className = 'porthint warn';
    } else {
      el.textContent = ''; el.className = 'porthint';
    }
    return;
  }
  const near = (m.p.near || []).map((x) => x.n).slice(0, 6);
  const lc = (window.__DISP && window.__DISP[m.p.l]) || m.p.l;   // ★ 10-10：显示行业口径码（青岛→CNTAO），内部仍用联合国码+按船司自动转换
  const loc = `${lc}${m.p.c ? ' · ' + m.p.c : ''}`;
  const shortWarn = m.short
    ? '<br><span class="near">⚠️ Short-code match — if wrong, type the full port name</span>'
    : '';
  // 输入本身就是港名（归一化后相同）时，不要说"按常用名/缩写匹配" —— 完整地名被这么描述会显得名录不靠谱
  const sameAsName = pNorm(m.p.n) === pNorm(raw);
  // 同名港（多国家）：**先给出 autocorrect 的结论**，再附一行"想改就点"的选项
  const chipsHTML = (m.ambiguous && m.ambiguous.length >= 2)
    ? `<div class="ctryrow">` + m.ambiguous.map((p) =>
        `<button type="button" class="ctrypick${p.l === m.p.l ? ' on' : ''}" data-pick="${p.l}" ` +
        `title="Querying as ${p.n} (${(window.__DISP && window.__DISP[p.l]) || p.l})">${p.c || '??'} · ${p.n}</button>`).join('') + `</div>`
    : '';
  const bindChips = () => {
    el.querySelectorAll('.ctrypick').forEach((btn) => {
      btn.addEventListener('click', () => {
        const hit = PORTS.find((x) => x.l === btn.dataset.pick);
        if (hit) { document.getElementById(inputId).value = `${hit.n} (${hit.l})`; renderPortHint(inputId, hintId); }
      });
    });
  };
  const tail = near.length ? `<br><span class="near">Same area: ${near.join(' / ')}</span>` : '';
  const ambNote = chipsHTML ? `<br><span class="near">${m.ambiguous.length - 1} more with the same name (click to change):</span>` : '';
  if (m.how === 'alias' && !sameAsName) {
    el.innerHTML = `✅ Query as <b>${m.p.n}</b> · ${loc}　<span class="near">(matched common name "${raw}")</span>` + tail + shortWarn + ambNote + chipsHTML;
    el.className = 'porthint ok' + (m.short || chipsHTML ? ' warn' : '');
  } else if (m.how === 'alias' || m.how === 'exact') {
    el.innerHTML = `✅ Query as <b>${m.p.n}</b> · ${loc}` + tail + ambNote + chipsHTML;
    el.className = 'porthint ok' + (chipsHTML ? ' warn' : '');
  } else {
    el.innerHTML = `⚠️ No exact name match; query as <b>${m.p.n}</b> · ${loc}　<span class="near">(if not, type the full port name)</span>` + ambNote + chipsHTML;
    el.className = 'porthint warn';
  }
  if (chipsHTML) bindChips();
}

// ---------- 状态文案 ----------
const BADGE = {
  pending:   { text: 'Pending', cls: 'pending' },
  running:   { text: 'Querying…', cls: 'running' },
  prefilled: { text: 'Prefilled · no rows', cls: 'fallback' },
  done:      { text: '✓ Found', cls: 'ok' },
  opened:    { text: '查无此单', cls: 'fallback' },   // ★ 10-28：页面正常但没取到结果
  challenge: { text: '挑战未过', cls: 'fail' },       // ★ 10-28：anti-bot 拦了（不是单号问题）
  timeout:   { text: '超时', cls: 'fallback' },       // ★ 10-28：预算耗尽（不是单号问题）
  failed:    { text: '失败', cls: 'fail' },
};

// ---------- DOM 构建 ----------
const app = document.getElementById('app');
app.innerHTML = `
  <header class="topbar" data-tauri-drag-region>
    <h1 data-tauri-drag-region>⚓ ShipScheduleHub</h1>
    <span class="sub" data-tauri-drag-region>船期聚合驾驶舱 v${__APP_VERSION__}</span>
    <span class="spacer" data-tauri-drag-region></span>
    <div class="themes" id="themes" title="配色主题">
      <button class="sw" data-t="sea" title="海运蓝"></button>
      <button class="sw" data-t="midnight" title="午夜蓝"></button>
      <button class="sw" data-t="graphite" title="石墨灰"></button>
      <button class="sw" data-t="sand" title="暖沙"></button>
      <button class="sw mode" id="modeToggle" title="深色 / 浅色">◐</button>
      <button class="sw mode" id="btnGlass" title="毛玻璃强度：✨轻 / ❖亚克力 / ▢关闭（机器拖动卡就切「关闭」）">✨</button>
    </div>
    <span><span id="engineDot" class="engine-dot"></span><span id="engineState">engine 未启动</span></span>
    <button id="btnDiag" class="btn-ghost" title="查看引擎/node 路径与最近输出（排查「点了没反应」）">诊断</button>
    <button id="btnDiagCopy" class="btn-ghost" title="把诊断信息复制到剪贴板（发给婉宜排障用）">复制诊断</button>
    <button id="btnCheckUpdate" class="btn-ghost" title="立即检查是否有新版本">检查更新</button>
  </header>
  <div id="diagBox" class="diagbox" hidden></div>
  <div id="errBox" class="errbox" hidden></div>

  <nav class="tabs" id="tabs">
    <button class="tab active" data-v="sched">船期</button>
    <button class="tab" data-v="track">提单/箱号</button>
    <button class="tab" data-v="quote">报价</button>
    <button class="tab" data-v="wps">WPS 插件</button>
  </nav>

  <!-- 报价 tab 容器：内容由 React 子应用挂载（Shadow DOM，样式与主界面隔离） -->
  <div id="viewQuote" class="view" hidden></div>

  <!-- WPS 插件 tab = 回填工作台（10-29 架构②）：运算与展示在 App；插件只负责读列/发/收/回填。
       数据全部来自 engine/wps-jobs.mjs（台账 + 插件配置），这一页**只读**，不做导出 CSV。 -->
  <div id="viewWps" class="view" hidden>
    <!-- ① 状态条：插件版本 / 桥 / 当前表 / 上次刷新 -->
    <section class="wpsbar">
      <div class="wpsbar-row">
        <span class="wpspill" id="wpsPlug"><span class="wpsdot"></span>插件 · 检查中…</span>
        <span class="wpspill" id="wpsBridge"><span class="wpsdot"></span>桥 · 检测中…</span>
        <span class="wpspill" id="wpsCur"><span class="wpsdot"></span>当前表 · —</span>
        <span class="wpspill" id="wpsLast"><span class="wpsdot"></span>上次刷新 · —</span>
        <span class="spacer"></span>
        <button id="wpsReload" class="btn-ghost" title="立即重读台账与插件配置">刷新</button>
        <button id="wpsInstall" class="btn">安装 / 更新</button>
        <button id="wpsUninstall" class="btn-ghost">卸载</button>
        <button id="wpsDir" class="btn-ghost">打开目录</button>
      </div>
      <div class="wpshelp">
        在 WPS 表格里选好列 → 点功能区「ShipTrack」批量查询 → 结果是直接回填进你选的那一列。
        这一页只做一件事：把这一轮逐行发生了什么搬出来看 —— 谁失败、为什么、该手工还是等重查。
      </div>
    </section>

    <div id="wpsWarn" class="wpswarn" hidden></div>

    <!-- ② 待办队列：每张点过③的表一行 -->
    <section class="wpsblock">
      <div class="wpshead"><b>待办队列</b><span id="wpsQueueHint" class="porthint"></span></div>
      <div id="wpsQueue" class="wpsqueue">
        <div class="wpsempty">还没有批次记录</div>
      </div>
    </section>

    <!-- ③ 回填预览 -->
    <section class="wpsblock grow">
      <div class="wpshead">
        <b>回填预览</b>
        <div class="wpschips" id="wpsChips">
          <button type="button" class="wpschip active" data-f="all">全部 <i id="wpsNall">0</i></button>
          <button type="button" class="wpschip" data-f="fail">只看失败 <i id="wpsNfail">0</i></button>
          <button type="button" class="wpschip" data-f="manual">只看待手工 <i id="wpsNmanual">0</i></button>
          <button type="button" class="wpschip" data-f="ok">只看成功 <i id="wpsNok">0</i></button>
        </div>
        <select id="wpsCarrier" class="wpsselect"><option value="">全部船司</option></select>
        <input id="wpsSearch" class="wpssearch" placeholder="搜单号 / 失败原因" />
        <span class="spacer"></span>
        <button id="wpsCopyAll" class="btn-ghost" title="按当前筛选顺序复制单号（换行分隔）">复制单号</button>
        <button id="wpsCopyFail" class="btn-ghost" title="只复制失败行的单号">复制失败</button>
      </div>
      <div class="wpsbody">
        <div id="wpsGrid" class="wpsgrid">
          <div class="wpsempty">还没有查询记录 —— 在 WPS 表格里点一次批量查询，这里就有逐行结果</div>
        </div>
        <aside id="wpsDrawer" class="wpsdrawer" hidden></aside>
      </div>
    </section>
    <div id="wpsLog" class="diagbox" hidden></div>
  </div>

  <div id="viewSched" class="view">
  <section class="formbar">
    <div class="field">
      <label>起运港</label>
      <input id="origin" list="portsList" placeholder="e.g. Ningbo / Shanghai / Qingdao" />
      <div id="originHint" class="porthint"></div>
    </div>
    <div class="field">
      <label>目的港</label>
      <input id="destination" list="portsList" placeholder="e.g. Istanbul / Rotterdam" />
      <div id="destinationHint" class="porthint"></div>
    </div>
    <datalist id="portsList"></datalist>
    <div class="field"><label>日期（YYYY-MM-DD，留空 = 当天）</label><input id="date" placeholder="留空 = 用网站默认（通常当天）" /><div id="dateHint" class="porthint"></div></div>
    <button id="btnGo" class="btn-primary">Query</button>
    <button id="btnStop" class="btn-ghost" title="停止当前查询（已打开页面保留）">停止</button>
  </section>

  <section class="main">
    <aside class="carriers">
      <div class="head">Carriers <button id="selAll">全选/清空</button></div>
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
  </div>

  <div id="viewTrack" class="view" hidden>
    <section class="formbar">
      <div class="field">
        <label>提单号 / 订舱号 / 箱号</label>
        <input id="trackNum" placeholder="e.g. HLCU… / COSU… / 276759780" style="width:300px" />
        <div id="trackHint" class="porthint"></div>
      </div>
      <div class="field">
        <label>船司（留「自动识别」即可）</label>
        <select id="trackCarrier">
          <option value="">自动识别</option>
          <option value="maersk">Maersk</option>
          <option value="msc">MSC</option>
          <option value="cosco">COSCO</option>
          <option value="hmm">HMM</option>
          <option value="hapag">Hapag-Lloyd</option>
          <option value="one">ONE</option>
          <option value="zim">ZIM</option>
          <option value="evergreen">Evergreen</option>
          <option value="akkon">Akkon Lines</option>
        </select>
        <div id="trackCarrierHint" class="porthint"></div>
      </div>
      <button id="btnTrackGo" class="btn-primary">查询</button>
      <button id="btnTrackStop" class="btn-ghost">停止</button>
    </section>
    <section class="main">
      <aside class="carriers">
        <div class="head">说明</div>
        <div class="track-tips">
          • 单号按前缀自动识别归属<br>
          • 已接通：<b>Maersk / MSC / COSCO / HMM / ONE / ZIM / Hapag-Lloyd / Evergreen / Yang Ming / CMA CGM</b><br>
          • Hapag 走真浏览器验证，偶发被拦时重试即可<br>
          • 结果一行摘要 → 点击展开时间线<br>
          • 浅色行 = 预计（未发生）
        </div>
      </aside>
      <section class="statuswrap">
        <div class="statushead"><b>追踪结果</b><span id="trackSummary"></span></div>
        <div id="trackResult" class="statuslist">
          <div class="empty"><span class="big">📦</span><span>输入提单号 / 订舱号，点「查询」</span></div>
        </div>
      </section>
    </section>
  </div>
`;

document.getElementById('btnDiag').onclick = async () => {
  const box = document.getElementById('diagBox');
  box.hidden = !box.hidden;
  if (!box.hidden && !diagInfo) await loadDiagnostics();
  else renderDiagnostics();
};

// ---------- 船司列表（10-15：记住上次勾选状态——爹地要求）
// 查询侧 collectQuery() 直读 DOM（第 604 行 selected 收集），本处只管渲染与持久化。
const CARRIER_SEL_KEY = 'ssh.carrierSel';
const savedCarrierSel = (() => {
  try {
    const arr = JSON.parse(localStorage.getItem(CARRIER_SEL_KEY) || 'null');
    // 空集不是合法选择态（查询至少一家）→ 视同首次，回全选
    return Array.isArray(arr) && arr.length ? new Set(arr) : null;
  } catch { return null; }
})();
const listEl = document.getElementById('carrierList');
for (const c of CARRIERS) {
  const row = document.createElement('label');
  row.className = 'carrier-row';
  const on = savedCarrierSel ? savedCarrierSel.has(c.id) : true;
  row.innerHTML = `<input type="checkbox" ${on ? 'checked' : ''} data-id="${c.id}" /><span class="name">${c.name}</span><span class="code">${c.id.toUpperCase().slice(0, 4)}</span>`;
  listEl.appendChild(row);
}
function persistCarrierSel() {
  try {
    const sel = [...listEl.querySelectorAll('input:checked')].map((b) => b.dataset.id);
    localStorage.setItem(CARRIER_SEL_KEY, JSON.stringify(sel));
  } catch { /* 无痕模式忽略 */ }
}
// 事件委托：任何勾选变更即存（含键盘操作触发的 change）
listEl.addEventListener('change', persistCarrierSel);
document.getElementById('selAll').onclick = () => {
  const boxes = [...listEl.querySelectorAll('input')];
  const anyOff = boxes.some(b => !b.checked);
  boxes.forEach(b => (b.checked = anyOff));
  persistCarrierSel();
};

// ---------- Tauri invoke ----------
const hasTauri = typeof window.__TAURI_INTERNALS__ !== 'undefined' || typeof window.__TAURI__ !== 'undefined';
async function invoke(cmd, args) {
  if (!hasTauri) return { ok: false, error: 'not-in-tauri' };
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(cmd, args);
}

let lastQuery = { origin: '', destination: '' };

// 兜底链接：用系统浏览器打开。
// 2026-10-09 更正（爹地截图为准）：维运网**船期查询本身是好的** ✓ 废掉的是我用的 /NewRoute 深链
// （它会跳回首页、且自动化环境下看不到查询框）。改为打开**维运网首页**（正常浏览器里就是船期查询入口）；
// ⚠️ 教训：站点给"自动化浏览器"看的样子常和给你看的不一样 → 这类判断请以爹地的浏览器所见为准，别自己硬猜。
document.addEventListener('click', async (ev) => {
  const a = ev.target.closest('a[data-wy]');
  if (!a) return;
  ev.preventDefault();
  const url = 'https://www.weiyun001.com/';   // 首页即船期查询入口（实测：正常浏览器下可直接查）
  try { const { invoke } = await import('@tauri-apps/api/core'); await invoke('open_external', { url }); }
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

// 一条船期 = 时间轴中的一行；带 detail 时整行可点，展开看「航程 + Cut-off times」（婉宜 9-30）
// 开船日 → 可比较的时间戳（认不出就给 Infinity，排到最后但不报错）
function etdKey(s) {
  const t = String(s || '').trim();
  if (!t) return Infinity;
  const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  let m = t.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);                 // 2026-10-27 / 2026/10/27 / 2026.10.27
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/([A-Za-z]{3})[\s\-.,]*(\d{1,2})[\s\-.,]*(\d{4})/);     // Oct 27 2026 / OCT-27-2026
  if (m) { const mo = MON.indexOf(m[1].toLowerCase()); if (mo >= 0) return Date.UTC(+m[3], mo, +m[2]); }
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})$/);                               // 10.27（无年份）
  if (m) return Date.UTC(new Date().getUTCFullYear(), +m[1] - 1, +m[2]);
  const d = Date.parse(t);
  return Number.isFinite(d) ? d : Infinity;
}

function scheduleRowHTML(r, accent) {
  const q = lastQuery || { origin: '', destination: '' };
  const pill = r.direct === true
    ? '<span class="pill direct">Direct</span>'
    : r.direct === false
      ? `<span class="pill trans">转${r.via ? ' ' + r.via : ''}</span>`
      : '';  // null/undefined = 未知（页面未提供中转信息）→ 不显示徽章，不猜测
  const det = r.detail || null;
  const cuts = det ? Object.entries(det.cutoffs || {}) : [];
  const hasDet = !!(det && ((det.legs || []).length || cuts.length));
  const row = `<div class="trow${hasDet ? ' clickable' : ''}"${hasDet ? ' title="点一下看航程与Cut-off times"' : ''}>
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

// 详情体：上部航程（分段/码头/船信息/挂靠港），下部Cut-off times（官网原值，不做任何推断）
function detailHTML(det) {
  const legs = (det.legs || []).map((l) => {
    const from = `${l.from || '?'}${l.fromTerminal ? ` <span class="term">${l.fromTerminal}</span>` : ''}`;
    const to = `${l.to || '?'}${l.toTerminal ? ` <span class="term">${l.toTerminal}</span>` : ''}`;
    // 船信息：不再带 service / CO₂（标题行已有，避免同一屏重复两次）
    const ship = [l.vessel, l.imo ? `IMO ${l.imo}` : '', l.built ? `${l.built} built` : '', l.flag]
      .filter(Boolean).join(' · ');
    return `<div class="dleg">
      <div class="dline">${from} <span class="arw">→</span> ${to}</div>
      <div class="dtimes">${l.etd || ''} → ${l.eta || ''}${(l.seq || 1) > 1 ? ` · leg ${l.seq}` : ''}</div>
      ${ship ? `<div class="dvessel">${ship}</div>` : ''}
      ${(l.calls || []).length ? `<div class="dcalls">Calls: ${l.calls.join(' · ')}</div>` : ''}
    </div>`;
  }).join('');
  const cutRows = Object.entries(det.cutoffs || {})
    .map(([k, v]) => `<div class="dcut"><span class="dk">${k}</span><span class="dv">${v}</span></div>`).join('');
  const head = ['航程', det.service, det.routing, det.co2 ? `CO₂ ${det.co2}` : ''].filter(Boolean).join(' · ');
  return `
    ${legs ? `<div class="dsec"><div class="dtitle">${head}</div><div class="dlegs">${legs}</div></div>` : ''}
    ${cutRows ? `<div class="dsec"><div class="dtitle">Cut-off times<span class="dnote">(site values)</span></div><div class="dcuts">${cutRows}</div></div>` : ''}`;
}
function badgeFor(patch) {
  if (patch.status === 'done') {
    const n = (patch.schedules || []).length;
    return patch.cached ? { text: `⚡ cached ${n} 条`, cls: 'cache' } : { text: `✓ ${n} 条`, cls: 'ok' };
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
      msgEl.className = 'cmsg' + (patch.status === 'failed' || patch.status === 'challenge' ? ' err' : (patch.status === 'opened' || patch.status === 'prefilled' || patch.status === 'timeout' ? ' warn' : ''));
    }
  } else if (patch.msg !== undefined) {
    const msgEl = g.querySelector('.cmsg');
    if (msgEl) msgEl.innerHTML = patch.msg || '';
  }
  // 船期行
  if (Array.isArray(patch.schedules) && patch.schedules.length) {
    const list = g.querySelector('.clist');
    // 船期一律按**开船日（ETD）升序** —— 各家接口返回的顺序不一致（阳明曾按天数排），
    // 爹地 10-09 报「顺序错误」。兼容多种日期写法：2026-10-27 / 2026/10/27 / 10.27 / OCT-27-2026。
    // 去重（10-09 实测出现"11.21 TBN GA647W 63天"整行重复）：同组港码/多条取数路会带回重叠行
    const _seen = new Set();
    const _rows = [];
    for (const r of (patch.schedules || [])) {
      const k = `${r.vessel || ''}|${r.voyage || ''}|${r.etd || ''}`.toLowerCase().replace(/\s+/g, '');
      if (_seen.has(k)) continue;
      _seen.add(k); _rows.push(r);
    }
    if (list) list.innerHTML = _rows.slice().sort((a, b) => etdKey(a.etd) - etdKey(b.etd) || (a.transitDays || 0) - (b.transitDays || 0))
      .map((r) => scheduleRowHTML(r, accent)).join('');
  }
  // 无船期 → 维运网兜底链接（爹地 9-24）
  const noData = patch.status === 'prefilled' || patch.status === 'opened'
    || patch.status === 'challenge' || patch.status === 'timeout'
    || (patch.status === 'done' && !(Array.isArray(patch.schedules) && patch.schedules.length));
  const existing = g.querySelector('.cnone');
  if (noData) {
    const box = existing || document.createElement('div');
    if (!existing) { box.className = 'cnone'; g.appendChild(box); }
    const q = lastQuery || { origin: '', destination: '' };
    box.innerHTML = `<a href="#" class="wy-link" data-wy="1">🔍 Weiyun: "${q.origin} → ${q.destination}"</a>`;
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
      <div class="chead" role="button" tabindex="0" title="Click to collapse / expand this carrier">
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
  if (el) el.addEventListener('input', () => { onPortInput(id); renderPortHint(id, id + 'Hint'); });
});

// 正在查询时再点：不报错 —— 自动停掉旧的、接着跑新的（爹地 9-30：换港口重查会被「已在运行」拒掉）
let pendingRestart = null;

// 逆逻辑测试发现：旧版只验格式（正则），2026-02-30 能过 → 引擎拿着垃圾日期去查网站，白等十几分钟。
function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function collectQuery() {
  const origin = document.getElementById('origin').value.trim();
  const destination = document.getElementById('destination').value.trim();
  const date = document.getElementById('date').value.trim();
  let bad = null;
  if (!origin) bad = 'origin';
  else if (!destination) bad = 'destination';
  else if (date && !isRealDate(date)) bad = 'date'; // 留空合法：用网站默认日期（爹地 9-23）
  if (bad) {
    document.getElementById(bad).classList.add('invalid');
    const dh = document.getElementById('dateHint');
    if (dh) {
      if (bad === 'date') {
        dh.innerHTML = '⚠️ Use a real date (YYYY-MM-DD), e.g. 2026-10-12; leave empty = site default (today)';
        dh.className = 'porthint warn';
      } else { dh.textContent = ''; dh.className = 'porthint'; }
    }
    document.getElementById(bad).focus();
    return null;
  }
  const dh0 = document.getElementById('dateHint');
  if (dh0) { dh0.textContent = ''; dh0.className = 'porthint'; }
  ['origin', 'destination', 'date'].forEach((id) => document.getElementById(id).classList.remove('invalid'));
  const selected = [...listEl.querySelectorAll('input:checked')].map((b) => b.dataset.id);
  if (!selected.length) { alert('Select at least one carrier'); return null; }
  return { origin, destination, date, selected };
}

async function startQuery(q) {
  runMode = 'sched';
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
    // 连点时只更新条件、不重复发 stop / 不叠计时器（逆逻辑测试：连点 3 次曾发 2 次 stop）
    const alreadyStopping = !!pendingRestart;
    pendingRestart = q;
    const box = document.getElementById('summary');
    if (box) box.textContent = '⏹ Stopping previous query, then starting the new one…';
    updateGoBtn();
    if (alreadyStopping) return;
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
  btn.textContent = running ? 'Re-query (stops current)' : '并发查询';
  btn.classList.toggle('btn-restart', running);
  const stopBtn = document.getElementById('btnStop');
  if (stopBtn) stopBtn.disabled = !engineRunning && !pendingRestart;
}
function setEngineDot(state) {
  const dot = document.getElementById('engineDot');
  dot.className = 'engine-dot' + (state === 'on' ? ' on' : state === 'busy' ? ' busy' : '');
  // 引擎是按次启动的进程：跑完就退出。之前跑完立刻显示"engine 未启动"，爹地以为坏了（10-09）。
  // 现在区分「从没跑过」和「跑完了在休息」。
  if (state === 'on' || state === 'busy') window.__ranOnce = true;
  document.getElementById('engineState').textContent =
    state === 'on' ? 'engine 在线'
      : state === 'busy' ? 'engine 执行中'
        : (window.__ranOnce ? '空闲（上次已完成）' : 'engine 未启动');
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
    line('安装目录', (d.exeDir || '—') + (d.exeDirWritable === false ? '　（不可写 → 运行期数据走数据目录，正常）' : '')),
    line('数据目录', d.dataDir || '—'),
    line('引擎临时目录', (d.engineTmp || '—') + (d.engineTmpWritable === false ? '　（不可写 → 浏览器类查询会全挂，检查 TEMP/安装位置）' : ''), d.engineTmpWritable !== false),
    line('浏览器', (Array.isArray(d.browsers) && d.browsers.length ? d.browsers.join('　|　') : (d.chrome || '（未探测：引擎会自动下载 Chrome for Testing）'))),
    (d.webview2 !== undefined ? line('WebView2', d.webview2, !/未检测|unknown/i.test(String(d.webview2))) : ''),
    (d.elevated !== undefined ? line('管理员权限', d.elevated ? '是' : '否（一般不需要）') : ''),
    ...['TEMP', 'TMP', 'NODE_PATH', 'NODE_OPTIONS', 'HTTPS_PROXY', 'HTTP_PROXY']
      .filter((k) => d[k])
      .map((k) => line(k, d[k], !/裸盘符/.test(String(d[k])))),
    (diagInfo && diagInfo.net ? Object.entries(diagInfo.net).map(([h, v]) => `<div class="drow"><span class="dk">连通 ${h.split('.')[0]}</span><span class="dv${String(v).startsWith('ok') ? '' : ' bad'}">${String(v).replace(/[<>&]/g, '')}</span></div>`).join('') : ''),
    (diagInfo && diagInfo.engineStderr ? `<div class="drow"><span class="dk">引擎自检错误</span><span class="dv bad">${String(diagInfo.engineStderr).replace(/[<>&]/g, '').slice(0, 300)}</span></div>` : ''),
    (diagInfo && diagInfo.engineErr ? `<div class="drow"><span class="dk">启动失败</span><span class="dv bad">${String(diagInfo.engineErr).replace(/[<>&]/g, '').slice(0, 300)}</span></div>` : ''),
    stderrTail.length ? `<div class="drow"><span class="dk">引擎输出</span><span class="dv bad">${stderrTail.slice(-4).map((x) => String(x).replace(/[<>&]/g, '')).join('<br>')}</span></div>` : '',
  ].filter(Boolean).join('');
}

// 「复制诊断」：一键把环境信息抄给我（远程排障闭环用；爹地 10-08 Windows 适配）
document.getElementById('btnDiagCopy')?.addEventListener('click', async () => {
  const payload = {
    时间: new Date().toISOString(),
    平台: navigator.platform,
    引擎状态: document.getElementById('engineState')?.textContent,
    最近查询: lastQuery,
    诊断: diagInfo || null,
    引擎stderr尾部: stderrTail.slice(-6),
  };
  const text = JSON.stringify(payload, null, 1);
  let done = false;
  try { await navigator.clipboard.writeText(text); done = true; } catch { /* 某些 webview 不给权限 */ }
  if (!done) {
    // 兜底：弹一个可全选的文本框，让用户手抄
    const w = window.open('', '_blank', 'width=760,height=560');
    if (w) { w.document.write('<pre style="white-space:pre-wrap;font:12px monospace">' + text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) + '</pre>'); }
  }
  const box = document.getElementById('summary');
  if (box) box.textContent = done
    ? '📋 诊断信息已复制到剪贴板 —— 直接粘给婉宜即可'
    : '诊断信息已在新窗口打开，请全选复制发给婉宜';
});

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
      if (box) box.textContent = '⚠️ Engine error: ' + String(ev.msg || '').slice(0, 200);
      setEngineDot('off');
      engineRunning = false;
      updateGoBtn();
    } else if (ev.type === 'engine-warn') {
      // 10-15 审查 W-1：临时目录降级这类「还能跑但不正常」的事，进诊断留痕，不抢占主提示。
      stderrTail.push('[warn] ' + String(ev.msg || '').trim());
      if (stderrTail.length > 8) stderrTail.shift();
      renderDiagnostics();
    } else if (ev.type === 'engine-stderr') {
      // 引擎的 stderr：node 找不到、脚本路径错、依赖缺失、被系统拦……全都只走这里。
      // 不显示出来，用户看到的就是「点了查询毫无反应」（爹地 9-30 Windows 无 Chrome 环境实测）。
      const m = String(ev.msg || '').trim();
      if (m) {
        stderrTail.push(m);
        if (stderrTail.length > 8) stderrTail.shift();
        // ⚠️ 10-09 修：原判据太松 —— `[fastpath] yangming status=200 isArray=false err= …`
        // 这类**信息行**被判成致命错误，界面弹出黄色横幅把引擎原始输出糊在爹地脸上（他当成"报错了"）。
        // 规则：先排除明显的信息/调试行，只认真正的错误签名。
        // 10-14 P2：各家配方现在会把「结果页解析失败」记到 stderr（诊断面板可见），
        // 那不是致命错误，别弹错误横幅 —— 这里把各家前缀一并列入 benign。
        const benign = /ExperimentalWarning|node --trace-warnings|\[fastpath\]|\[chrome\]|\[query\]|\[hmm\]|\[evergreen\]|\[cma\]|\[cosco\]|\[maersk\]|\[one\]|\[oocl\]|\[msc\]|\[zim\]|\[yangming\]|\[reclaim\]|status=\d{3}|isArray=|^\s*\(node:/i.test(m);
        const fatal = !benign && /(^|\W)(Error|MODULE_NOT_FOUND|ENOENT|EACCES|EPERM)\b|Cannot find module|is not defined|SyntaxError|TypeError|ReferenceError|throw new/i.test(m);
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
      if (runMode === 'track' && pendingTrackRestart) {
        pendingTrackRestart = false;
        setTimeout(() => startTrack(), 200);
        return;
      }
      // 引擎退出但一条结果都没有 → 必须说清原因，别让人对着空卡片猜
      const producedSched = Object.values(statusRows).some((g) => (g.querySelectorAll('.trow').length > 0));
      const produced = runMode === 'track' ? trackDone : producedSched;
      if (!produced) {
        const tail = stderrTail.slice(-2).join(' ⏎ ');
        if (runMode === 'track') {
          trackRenderFail('Query finished with no result' + (tail ? '：' + tail.slice(0, 160) : ''));
        } else {
          showEngineError(tail
            ? `Query finished with no results. Engine output: ${tail.slice(0, 200)}`
            : 'Query finished with no results (open Diagnostics above to check node/engine paths)');
        }
      }
      renderDiagnostics();
    }
    });
    await listen('track://event', (e) => {
      const ev = e.payload || {};
      if (ev.type && ev.type.startsWith('track-')) handleTracking(ev);
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
  if (done) parts.push(`✓ ${done} with schedules`);
  if (rows) parts.push(`${rows} schedules`);
  if (opened) parts.push(`${opened} need manual`);
  if (failed) parts.push(`✕ ${failed} failed`);
  if (running) parts.push(`⏳ ${running} querying`);
  if (pending) parts.push(`· ${pending} pending`);
  const box = document.getElementById('summary');
  if (box) box.textContent = `${groups.length} carriers · ` + parts.join('　');
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

// 平台标记：Windows 与 macOS 的毛玻璃强度/标题栏布局不同，CSS 据此分流（婉宜 10-08）
{
  const ua = navigator.userAgent || '';
  const plat = /Windows/i.test(ua) ? 'win' : (/Mac/i.test(ua) ? 'mac' : 'other');
  document.documentElement.dataset.platform = plat;
  // 10-15：Windows 的系统标题栏已含产品名，应用头部不再重复名称——但版本号要留
  //（爹地实报 Windows 全界面找不到版本号）。顶栏只显示「v1.5.1」。
  if (plat === 'win') {
    const sub = document.querySelector('.topbar .sub');
    if (sub) sub.textContent = 'v' + __APP_VERSION__;
  }
}

// ---------- 外观：配色主题 / 深色浅色 / 点击涟漪（婉宜 10-08，爹地要求）----------
// 毛玻璃本体来自窗口的 windowEffects（系统层，见 tauri.conf.json），这里只管主题与反馈。
(function initAppearance() {
  const root = document.documentElement;
  const THEMES = ['sea', 'midnight', 'graphite', 'sand'];
  const KEY = 'ssh.appearance';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* 读不到就用默认 */ }
    // 默认跟随系统明暗，配色用海运蓝
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return { theme: 'sea', mode: dark ? 'dark' : 'light', glass: 'blur' };
  }
  const state = load();

  function apply() {
    root.dataset.theme = state.theme;
    root.dataset.mode = state.mode;
    // 毛玻璃档位（仅 Windows 显示该按钮；macOS 用系统 vibrancy 不动）
    const gLabel = { blur: '✨', acrylic: '❖', off: '▢' };
    const gBtn = document.getElementById('btnGlass');
    if (gBtn) {
      const cur = state.glass || 'blur';
      gBtn.textContent = gLabel[cur] || '✨';
      gBtn.title = '当前毛玻璃：' + ({ blur: '轻（默认，省）', acrylic: '亚克力（最好看/最费）', off: '已关闭（最省，拖动最顺）' }[cur] || cur) + ' —— 点击切换';
      gBtn.classList.toggle('on', cur !== 'off');
      if (hasTauri) invoke('set_glass', { mode: cur }).catch(() => {});
    }
    const box = document.getElementById('themes');
    if (box) {
      box.querySelectorAll('.sw[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === state.theme));
      const mt = document.getElementById('modeToggle');
      if (mt) mt.textContent = state.mode === 'dark' ? '☾' : '☀';
    }
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 无痕模式忽略 */ }
    // ⚠️ 关键：窗口的毛玻璃材质（NSVisualEffectView）跟「窗口外观」走，不跟 CSS 走。
    // 不同步的话，深色主题下右侧透明区会露出浅色材质 → 白底浅字（爹地 10-08 反馈）。
    const inv = window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke;
    if (inv) {
      inv('plugin:window|set_theme', { label: 'main', theme: state.mode }).catch(() => {
        // 权限缺失/非 Tauri 环境：忽略（CSS 侧已给内容区兜底底色）
      });
    }
  }
  apply();

  const box = document.getElementById('themes');
  if (box) {
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.id === 'modeToggle') state.mode = state.mode === 'dark' ? 'light' : 'dark';
      else if (b.id === 'btnGlass') {
        // 三档循环：轻(blur) → 亚克力(acrylic) → 关闭(off)
        const order = ['blur', 'acrylic', 'off'];
        const cur = order.indexOf(state.glass || 'blur');
        state.glass = order[(cur + 1) % order.length];
      }
      else if (THEMES.includes(b.dataset.t)) state.theme = b.dataset.t;
      apply();
    });
  }

  // 按钮涟漪：任意 .btn-primary / .btn-ghost 点下去都有反馈（配合 CSS 的按压缩放）
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.btn-primary, .btn-ghost');
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.width = s.style.height = size + 'px';
    s.style.left = (e.clientX - r.left - size / 2) + 'px';
    s.style.top = (e.clientY - r.top - size / 2) + 'px';
    btn.appendChild(s);
    setTimeout(() => s.remove(), 600);
  });
})();

// ========== 提单/箱号追踪（婉宜 10-10 · 卡①/②/③）==========
let runMode = 'sched';
let trackDone = false;
let trackRunning = false;
let pendingTrackRestart = false;

const TRACK_NAME = { msc: 'MSC', maersk: 'Maersk', cma: 'CMA CGM', cosco: 'COSCO', hapag: 'Hapag-Lloyd', one: 'ONE', evergreen: 'Evergreen', yangming: 'Yang Ming', hmm: 'HMM', zim: 'ZIM', oocl: 'OOCL', akkon: 'Akkon Lines' };
const esc = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function detectClient(num) {
  const detected = detectCarrier(num);
  return detected.ok ? detected.carrier : null;
}


/* ---------------- WPS 插件 = 回填工作台（10-29 架构②） ----------------
   分工：**运算与展示在 App，插件只负责读列/发/收/回填**。
   这一页的数据全部由 engine/wps-jobs.mjs 从两处磁盘事实缝出来：
     ① 追踪台账 ~/.hermes/wps-shiptrack/jobs/*.ndjson（cli.mjs 每跑完一单追加一行）
     ② 插件配置 <doc>|<sheet>.json（列映射 + retry 待重查清单，带行号）
   这里**只读**：不写表、不改配置、不做导出 CSV（爹地 10-29 明确否掉导出）。 */
let wpsBusy = false;
let wpsData = null;        // 最近一次工作台快照
let wpsBatchId = '';       // 预览中的批次
let wpsFilter = 'all';     // all | fail | manual | ok
let wpsCarrier = '';
let wpsQuery = '';
let wpsOpenKey = '';       // 抽屉里展开的那一条（n + ts）
let wpsPollTimer = null;
let wpsLoading = false;
let wpsErr = '';
let wpsPlug = null;        // wps_addon status 的最近结果

async function wpsAction(action) {
  const { invoke } = await import('@tauri-apps/api/core');
  return JSON.parse(await invoke('wps_addon', { action }));
}

// ---------- 小工具 ----------
const wpsPad = (n) => String(n).padStart(2, '0');
function wpsTime(ts, withDate) {
  if (!ts) return '—';
  const d = new Date(Number(ts));
  const t = `${wpsPad(d.getHours())}:${wpsPad(d.getMinutes())}`;
  return withDate ? `${wpsPad(d.getMonth() + 1)}-${wpsPad(d.getDate())} ${t}` : t;
}
function wpsDur(ms) {
  const n = Number(ms) || 0;
  if (!n) return '—';
  if (n < 1000) return `${n}ms`;
  if (n < 60000) return `${(n / 1000).toFixed(1)}s`;
  return `${Math.floor(n / 60000)}m${wpsPad(Math.round((n % 60000) / 1000))}s`;
}
const wpsCN = (id) => TRACK_NAME[id] || String(id || '?').toUpperCase();
// 失败原因给「人话短句」——爹地看的是这行长什么样，不是英文栈
function wpsShortFail(it) {
  const e = String(it.err || '');
  if (/deadline exceeded|timeout|超时/i.test(e)) return '超时（引擎到点收工）';
  if (/429|too many|rate.?limit|频繁/i.test(e)) return '被限流（429）';
  if (/challenge|captcha|人机|验证/i.test(e)) return '撞到人机验证';
  if (/ERR_CONNECTION|ECONNRESET|ENOTFOUND|EAI_AGAIN|socket hang up/i.test(e)) return '网络没连上';
  if (/no tracking response|no data|没有数据|未返回/i.test(e)) return '官网没给出行程';
  if (/cannot tell|unknown-carrier|too short/i.test(e)) return '认不出这家船司';
  if (/not wired|no-tracker/i.test(e)) return '这家还没接通';
  return e ? e.slice(0, 60) : '没查到';
}
function wpsCopy(text, label) {
  const s = String(text || '');
  if (!s) return;
  const done = () => {
    const el = document.getElementById('wpsQueueHint');
    if (!el) return;
    const old = el.dataset.old || el.textContent;
    el.dataset.old = old;
    el.textContent = `已复制 ${label} · ${s.split('\n').length} 行`;
    setTimeout(() => { if (el.dataset.old) el.textContent = el.dataset.old; }, 2200);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(s).then(done).catch(() => wpsCopyFallback(s, done));
  } else wpsCopyFallback(s, done);
}
function wpsCopyFallback(s, done) {
  try {
    const ta = document.createElement('textarea');
    ta.value = s;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    done();
  } catch { /* 复制不了就静默（不是数据问题） */ }
}

// ---------- 安装状态（原「WPS 插件」tab 的能力，保留）----------
async function wpsRefresh() {
  const el = document.getElementById('wpsPlug');
  if (!el) return;
  try {
    const s = await wpsAction('status');
    wpsPlug = s;
    if (!s.ok) { wpsPill('wpsPlug', '插件 · 检查失败', 'bad', s.error || '未知'); return; }
    if (!s.installed) {
      wpsPill('wpsPlug', s.latest ? `插件 · 未安装（最新 v${s.latest}）` : '插件 · 未安装', 'bad');
    } else if (s.updateAvailable) {
      wpsPill('wpsPlug', `插件 · v${s.installed}（有新 v${s.latest}）`, 'warn');
    } else {
      wpsPill('wpsPlug', `插件 · v${s.installed}`, 'ok');
    }
  } catch (e) {
    wpsPill('wpsPlug', '插件 · 检查失败', 'bad', String(e).slice(0, 120));
  }
}

function wpsPill(id, text, tone, title) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = 'wpspill' + (tone ? ' ' + tone : '');
  el.textContent = '';
  const dot = document.createElement('span');
  dot.className = 'wpsdot';
  el.appendChild(dot);
  el.appendChild(document.createTextNode(text));
  if (title) el.title = String(title);
  else el.removeAttribute('title');
}

// ---------- 取数（走 Rust，不在 WebView 里直连桥：tauri:// 的 origin 会被桥 403）----------
async function wpsLoad() {
  if (wpsLoading) return;
  wpsLoading = true;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const raw = await invoke('wps_jobs');
    const d = JSON.parse(raw);
    if (!d || !d.ok) throw new Error((d && d.error) || '工作台脚本返回 ok:false');
    wpsData = d;
    wpsErr = '';
  } catch (e) {
    wpsErr = String((e && e.message) || e).slice(0, 300);
  } finally {
    wpsLoading = false;
    wpsRender();
  }
}

// 轮询节奏**跟着事实走**：桥在跑 or 3 分钟内有新台账 → 3.5 秒（要看到「进行中」的动）；
// 否则 12 秒（什么都没发生还每 3.5 秒 spawn 一个 node，纯烧电）。用 setTimeout 递归，
// 因为间隔本身要按上一次的结果改。
function wpsActive() {
  const b = (wpsData && wpsData.bridge) || {};
  if (Number(b.busy || 0) > 0) return true;
  const last = (wpsData && wpsData.journal && wpsData.journal.lastTs) || 0;
  return !!last && Date.now() - last < 180000;
}
function wpsStartPolling() {
  wpsStopPolling();
  const tick = async () => {
    if (!document.hidden && wpsPollTimer) await wpsLoad();
    if (!wpsPollTimer) return;          // 期间被 stop 掉就不再排下一次
    wpsPollTimer = setTimeout(tick, wpsActive() ? 3500 : 12000);
  };
  wpsPollTimer = setTimeout(tick, 3500);
}
function wpsStopPolling() {
  if (wpsPollTimer) { clearTimeout(wpsPollTimer); wpsPollTimer = null; }
}
document.addEventListener('visibilitychange', () => {
  const vie = document.getElementById('viewWps');
  if (!document.hidden && vie && !vie.hidden) { wpsLoad(); wpsStartPolling(); }
  if (document.hidden) wpsStopPolling();
});

// ---------- 渲染 ----------
function wpsCurrentBatch() {
  const bs = (wpsData && wpsData.batches) || [];
  if (!bs.length) return null;
  return bs.find((b) => b.id === wpsBatchId) || bs[bs.length - 1];
}

function wpsRender() {
  wpsRenderStatus();
  wpsRenderWarn();
  wpsRenderQueue();
  wpsRenderGrid();
  wpsRenderDrawer();
}

function wpsRenderStatus() {
  if (wpsErr) {
    wpsPill('wpsBridge', '数据读取失败', 'bad', wpsErr);
  } else if (wpsData) {
    const b = wpsData.bridge || {};
    if (b.online) {
      const busy = Number(b.busy || 0);
      wpsPill('wpsBridge', `桥 · 在线${busy ? ` · 在跑 ${busy}/${b.concurrency || '?'}` : ' · 空闲'}`, busy ? 'warn' : 'ok', `127.0.0.1:${b.port}`);
    } else {
      wpsPill('wpsBridge', '桥 · 未启动', 'bad', b.error || 'WPS 面板没打开 / 桥没起');
    }
    const t = wpsData.currentTable;
    if (t) {
      wpsPill('wpsCur', `当前表 · ${t.doc || '(未命名)'}${t.sheet ? ' · ' + t.sheet : ''}`, t.ageMin > 180 ? 'warn' : 'ok',
        `${t.rows || 0} 行 · 配置 ${wpsTime(t.cfgAt, true)}（${t.ageMin} 分钟前）`);
    } else {
      wpsPill('wpsCur', '当前表 · 还没在 WPS 里选过列', 'warn');
    }
    // 上次刷新：优先台账最后一条；台账还没有（刚装/刚清过）就退到「插件最后一次保存配置的时间」——
    // 后者本来就是他上一轮点③的痕迹，比显示「还没有记录」有用得多。
    const last = (wpsData.journal && wpsData.journal.lastTs) || (t && t.cfgAt) || 0;
    const fromCfg = !(wpsData.journal && wpsData.journal.lastTs) && !!last;
    wpsPill('wpsLast', `上次刷新 · ${last ? wpsTime(last, true) : '还没有记录'}`, last ? 'ok' : '',
      fromCfg ? '取自插件配置时间（这轮还没有台账记录）' : '');
    const cur = wpsCurrentBatch();
    if (!wpsBatchId && cur) wpsBatchId = cur.id;
  }
  if (wpsPlug && !wpsErr) { /* 插件 pill 由 wpsRefresh 独立维护 */ }
}

function wpsRenderWarn() {
  const box = document.getElementById('wpsWarn');
  if (!box) return;
  const ws = (wpsData && wpsData.warnings) || [];
  if (!ws.length) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = ws.map((w) =>
    `<div class="wpswarn-row">⏳ ${esc(w.text)}</div>`).join('');
}

function wpsRenderQueue() {
  const box = document.getElementById('wpsQueue');
  const hint = document.getElementById('wpsQueueHint');
  if (!box) return;
  if (wpsErr) {
    box.innerHTML = `<div class="wpsempty bad">读不到工作台数据：${esc(wpsErr)}</div>`;
    if (hint) hint.textContent = '';
    return;
  }
  const d = wpsData || {};
  const batches = (d.batches || []).filter((b) => b.total > 0).slice().reverse();   // 最新的在最上面（空批次不占位）
  const tables = (d.tables || []).filter((t) => t.retryCount > 0 || t.ageMin < 720);
  const cur = wpsCurrentBatch();

  const rows = [];
  for (const b of batches) {
    const planned = b.rowsPlanned || b.total || 1;
    const pct = Math.max(2, Math.min(100, Math.round((b.total / Math.max(planned, 1)) * 100)));
    const tone = b.fail && !b.ok ? 'bad' : (b.fail ? 'warn' : 'ok');
    const on = cur && cur.id === b.id;
    rows.push(`<div class="wpsq${on ? ' on' : ''}" data-batch="${esc(b.id)}">
      <span class="wpsq-dot ${tone}"></span>
      <span class="wpsq-label" title="${esc(b.label)}">${esc(b.label)}</span>
      <span class="wpsq-time">${wpsTime(b.startedAt)}${b.ms > 60000 ? ' → ' + wpsTime(b.endedAt) : ''}</span>
      <span class="wpsq-bar"><i class="${tone}" style="width:${pct}%"></i></span>
      <span class="wpsq-num">${b.total}/${planned}</span>
      <span class="wpsq-stat"><b class="ok">成功 ${b.ok}</b> · <b class="${b.fail ? 'bad' : ''}">失败 ${b.fail}</b>${b.manual ? ` · <b class="warn">待手工 ${b.manual}</b>` : ''}${b.throttled ? ` · <b class="bad">限流 ${b.throttled}</b>` : ''}${b.cached ? ` · <span class="dim">缓存 ${b.cached}</span>` : ''}</span>
      <button type="button" class="wpsq-btn" data-batch="${esc(b.id)}">${on ? '正在看' : '查看'}</button>
    </div>`);
  }

  // 待重查（插件 retry 队列）：这是「下次只补失败」的可视化，直接读插件配置
  const retries = tables.filter((t) => t.retryCount > 0);
  if (retries.length) {
    rows.push(`<div class="wpsq-sep">待重查 ${retries.length} 张表（插件已排好，到点自动只补这些行）</div>`);
    for (const t of retries) {
      const due = t.retryDueAt ? wpsTime(t.retryDueAt, true) : '—';
      const rowsTxt = t.retry.slice(0, 6).map((x) => `R${x.row}`).join('、') + (t.retry.length > 6 ? ' …' : '');
      rows.push(`<div class="wpsq retry">
        <span class="wpsq-dot warn"></span>
        <span class="wpsq-label" title="${esc(t.doc)}">${esc(t.doc || '(未命名)')}${t.sheet ? ' · ' + esc(t.sheet) : ''}</span>
        <span class="wpsq-time">${due} 到点</span>
        <span class="wpsq-bar"><i class="warn" style="width:${Math.min(100, Math.round(t.retryCount / Math.max(t.rows || t.retryCount, 1) * 100))}%"></i></span>
        <span class="wpsq-num">${t.retryCount}/${t.rows || '?'}</span>
        <span class="wpsq-stat">行 ${esc(rowsTxt)}</span>
        <button type="button" class="wpsq-btn copy-retry" data-key="${esc(t.key)}">复制单号</button>
      </div>`);
    }
  }

  if (!rows.length) {
    box.innerHTML = `<div class="wpsempty">还没有批次记录 —— 在 WPS 表格里点一次批量查询，这里就能看到这张表的逐行进度</div>`;
  } else {
    box.innerHTML = rows.join('');
  }
  if (hint) {
    const n = (d.batches || []).length;
    hint.textContent = n ? `最近 ${n} 批 · 每 3.5 秒自动刷新` : '';
  }
}

function wpsFilteredItems() {
  const b = wpsCurrentBatch();
  if (!b) return [];
  const q = wpsQuery.trim().toLowerCase();
  return b.items.filter((it) => {
    if (wpsFilter === 'fail' && it.ok) return false;
    if (wpsFilter === 'ok' && !it.ok) return false;
    if (wpsFilter === 'manual' && (it.ok || !it.url)) return false;
    if (wpsCarrier && it.c !== wpsCarrier) return false;
    if (q) {
      const hay = `${it.n} ${it.c} ${it.err} ${it.cur} ${it.phase}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function wpsStatusBadge(it) {
  if (it.ok) return `<span class="wpsb ok">成功</span>`;
  if (it.throttle) return `<span class="wpsb bad">限流</span>`;
  if (it.url) return `<span class="wpsb warn">待手工</span>`;
  return `<span class="wpsb bad">失败</span>`;
}

function wpsRenderGrid() {
  const box = document.getElementById('wpsGrid');
  if (!box) return;
  const b = wpsCurrentBatch();
  const sel = document.getElementById('wpsCarrier');
  // 船司下拉：按当前批次里出现过的船司重建（不预设，爹地要什么自己筛）
  if (sel) {
    const cur = (b && Object.keys(b.byCarrier || {})) || [];
    const keep = sel.value;
    const opts = ['<option value="">全部船司</option>'].concat(
      cur.sort().map((c) => `<option value="${esc(c)}">${esc(wpsCN(c))}</option>`));
    sel.innerHTML = opts.join('');
    sel.value = cur.includes(keep) ? keep : '';
    wpsCarrier = sel.value;
  }
  const setN = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = String(n); };
  if (!b) {
    setN('wpsNall', 0); setN('wpsNfail', 0); setN('wpsNmanual', 0); setN('wpsNok', 0);
    if (!wpsErr) box.innerHTML = `<div class="wpsempty">还没有查询记录 —— 在 WPS 表格里点一次批量查询，这里就有逐行结果</div>`;
    return;
  }
  setN('wpsNall', b.total);
  setN('wpsNfail', b.fail);
  setN('wpsNmanual', b.manual);
  setN('wpsNok', b.ok);

  const items = wpsFilteredItems();
  if (!items.length) {
    box.innerHTML = `<div class="wpsempty">这个筛选下没有行（共 ${b.total} 条，换一个筛选看看）</div>`;
    return;
  }
  const head = `<div class="wpsrow head">
      <span class="c-row">行</span><span class="c-num">单号</span><span class="c-c">船司</span>
      <span class="c-st">状态</span><span class="c-txt">短结论</span>
      <span class="c-ev">事件</span><span class="c-ms">耗时</span><span class="c-ts">时间</span>
    </div>`;
  const body = items.map((it) => {
    const key = `${it.n}|${it.ts}`;
    const on = key === wpsOpenKey;
    const txt = it.ok
      ? `${it.cur || it.phase || '已查到'}${it.curc ? ' @ ' + it.curc : ''}`
      : wpsShortFail(it);
    return `<div class="wpsrow${on ? ' on' : ''}${it.ok ? '' : ' bad'}${it.throttle ? ' hot' : ''}" data-key="${esc(key)}" role="button" tabindex="0">
      <span class="c-row">${it.row || '—'}</span>
      <span class="c-num">${esc(it.n)}</span>
      <span class="c-c">${esc(wpsCN(it.c))}</span>
      <span class="c-st">${wpsStatusBadge(it)}</span>
      <span class="c-txt" title="${esc(txt)}">${esc(txt)}</span>
      <span class="c-ev">${it.evc || 0}</span>
      <span class="c-ms">${it.cached ? '缓存' : wpsDur(it.ms)}</span>
      <span class="c-ts">${wpsTime(it.ts)}</span>
    </div>`;
  }).join('');
  box.innerHTML = head + body;
}

function wpsFindOpenItem() {
  const b = wpsCurrentBatch();
  if (!b || !wpsOpenKey) return null;
  return b.items.find((it) => `${it.n}|${it.ts}` === wpsOpenKey) || null;
}

function wpsRenderDrawer() {
  const box = document.getElementById('wpsDrawer');
  if (!box) return;
  const it = wpsFindOpenItem();
  if (!it) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  const evs = (it.events || []).slice().map((e) => {
    const est = Number(e.x) === 1;
    return `<div class="tev${est ? ' est' : ''}${Number(e.m) === 1 ? ' manual' : ''}">
      <span class="d">${fmtDay(e.t)}</span><span class="a">${esc(e.a)}</span>
      <span class="l">${esc(e.c || '')}${e.v ? ' · ' + esc(e.v) + (e.y ? ' ' + esc(e.y) : '') : ''}${e.k ? ' · ' + esc(e.k) : ''}</span></div>`;
  }).join('');
  const head = it.ok
    ? `<div class="wpsd-main">${esc(it.cur || it.phase || '已查到')}</div>
       <div class="wpsd-sub">${it.curc ? esc(it.curc) + ' · ' : ''}${it.curt ? '更新于 ' + esc(it.curt) : ''}${it.etat ? ' · ETA ' + fmtDay(it.etat) + ' ' + esc(it.etac || '') : ''}</div>`
    : `<div class="wpsd-main bad">${esc(wpsShortFail(it))}</div>
       <div class="wpsd-sub">${esc(String(it.err || '').slice(0, 220))}</div>`;
  box.innerHTML = `
    <div class="wpsd-head">
      <span class="wpspill">${esc(wpsCN(it.c))} · ${esc(it.n)}${it.row ? ' · 第 ' + it.row + ' 行' : ''}</span>
      <span class="spacer"></span>
      <button type="button" class="btn-ghost wpsd-copy">复制单号</button>
      <button type="button" class="btn-ghost wpsd-close" title="收起">✕</button>
    </div>
    ${head}
    <div class="wpsd-meta">${it.cached ? '缓存命中 · ' : ''}耗时 ${wpsDur(it.ms)} · 事件 ${it.evc || 0} 条 · 查询 ${wpsTime(it.ts, true)}</div>
    ${it.url ? `<a class="wpsd-link" href="${esc(it.url)}" target="_blank" rel="noreferrer">打开官网手工查 ↗</a>` : ''}
    <div class="wpsd-evs">${evs || `<div class="wpsd-none">这条没有事件可看 —— ${it.ok ? '官网只给了当前状态' : '查询没走到「拿到行程」这一步'}。<br>${it.url ? '要细看就点上面「打开官网手工查」，查到的整段粘回 WPS 面板就行。' : '等插件到点自动重查，或换这家再点一次。'}</div>`}</div>`;
  box.querySelector('.wpsd-close')?.addEventListener('click', () => { wpsOpenKey = ''; wpsRenderDrawer(); wpsRenderGrid(); });
  box.querySelector('.wpsd-copy')?.addEventListener('click', () => wpsCopy(it.n, '单号'));
}

async function wpsRun(action, label) {
  if (wpsBusy) return;
  wpsBusy = true;
  const btnI = document.getElementById('wpsInstall');
  const btnU = document.getElementById('wpsUninstall');
  const log = document.getElementById('wpsLog');
  if (btnI) btnI.disabled = true;
  if (btnU) btnU.disabled = true;
  wpsPill('wpsPlug', `插件 · ${label}中…`, 'warn');
  try {
    const r = await wpsAction(action);
    if (log) {
      log.hidden = false;
      log.textContent = JSON.stringify(r, null, 1);
    }
    if (!r.ok) {
      wpsPill('wpsPlug', `插件 · ${label}失败`, 'bad', String(r.error || '').slice(0, 160));
    } else if (r.action === 'noop') {
      wpsPill('wpsPlug', '插件 · ' + (r.message || '已是最新'), 'ok');
    } else if (action === 'install') {
      wpsPill('wpsPlug', `插件 · v${r.to}（重启 WPS 表格生效）`, 'warn');
    } else {
      wpsPill('wpsPlug', '插件 · 已卸载（重启 WPS 生效）', 'warn');
    }
  } catch (e) {
    wpsPill('wpsPlug', `插件 · ${label}失败`, 'bad', String(e).slice(0, 160));
  } finally {
    wpsBusy = false;
    if (btnI) btnI.disabled = false;
    if (btnU) btnU.disabled = false;
    if (action === 'install') wpsRefresh();
  }
}

function switchView(v) {
  const vs = document.getElementById('viewSched');
  const vt = document.getElementById('viewTrack');
  const vq = document.getElementById('viewQuote');
  const vw = document.getElementById('viewWps');
  if (vs) vs.hidden = v !== 'sched';
  if (vt) vt.hidden = v !== 'track';
  if (vq) vq.hidden = v !== 'quote';
  if (vw) vw.hidden = v !== 'wps';
  if (v === 'wps') { wpsRefresh(); wpsLoad(); wpsStartPolling(); } else { wpsStopPolling(); }
  document.querySelectorAll('#tabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.v === v));
  // 报价 tab：首次点开才加载 React 子应用（单独 chunk，不拖慢主界面启动）
  if (v === 'quote') mountQuoteTabLazy();
}

// 报价 tab 懒加载（React + QuoteAssist 移植代码打独立 chunk）
async function mountQuoteTabLazy() {
  const el = document.getElementById('viewQuote');
  const mark = (msg, color) => {
    if (el) {
      el.innerHTML = '';
      const box = document.createElement('div');
      box.style.cssText = 'padding:20px;font:13px -apple-system,sans-serif;color:' + color;
      box.textContent = msg;
      el.appendChild(box);
    }
  };
  try {
    mark('报价模块加载中…', '#666');
    const m = await import('./quote/mount.jsx');
    m.mountQuoteTab();
    console.log('[quote] chunk 加载完成，mount 已调用');
  } catch (e) {
    console.error('[quote] 加载失败', e);
    mark('报价模块加载失败：' + (e && e.message ? e.message : String(e)), '#c00');
  }
}
document.querySelectorAll('#tabs .tab').forEach((b) => { b.onclick = () => switchView(b.dataset.v); });

document.getElementById('trackNum')?.addEventListener('input', () => {
  const el = document.getElementById('trackHint');
  if (!el) return;
  const v = document.getElementById('trackNum').value.trim();
  const c = detectClient(v);
  const isBox = /^[A-Z]{4}\d{7}$/.test(v.toUpperCase().replace(/[^A-Z0-9]/g, ''));
  const detected = detectCarrier(v);
  const loose = c && detected.how === 'scac-loose';
  el.textContent = !v ? '' : (c ? `${describeShape(v) || '单号'} → ${TRACK_NAME[c]}（auto）${loose ? ' · 前缀命中，校验位不符（输错请核对）' : (isBox ? ' · 箱主不一定是承运人，可手选' : '')}` : (detected.note || 'carrier not recognized — 可在右侧手动选'));
  el.className = 'porthint' + (v && !c ? ' warn' : '');
});

function fmtDay(t) { const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(t || '')); return m ? `${m[2]}-${m[3]}` : ''; }

function trackRenderRunning(num) {
  const box = document.getElementById('trackResult');
  if (box) box.innerHTML = `<div class="trackcard"><div class="thead"><span class="tcarrier">查询中…</span><span class="tnum">${esc(num)}</span></div><div class="tmeta">talking to the carrier…</div></div>`;
  const sm = document.getElementById('trackSummary');
  if (sm) sm.textContent = 'Querying…';
}
/* ★ 10-28（爹地拍板 ②）：任何一行查不出结果，都给「链接 + 收粘贴」。
   做成通用能力——OOCL 只是其中一个特例，以后多一家掉队不用再改 UI，也不写第二套粘贴逻辑。 */
function manualFallbackHTML(ev) {
  const url = (ev && ev.manualUrl) || '';
  if (!url) return '';
  const label = (ev && (ev.manualLabel || ev.label)) || '官网';
  const num = (ev && (ev.docNum || ev.number)) || '';
  return `<div class="mfallback">
    <div class="mftitle">这条路自动查不通 —— 可以手工查一次，结果粘回来会记进这里</div>
    <a class="mflink" href="${esc(url)}" data-num="${esc(num)}" target="_blank" rel="noreferrer">① 打开 ${esc(label)} 官网查（单号自动复制）</a>
    <textarea class="mfpaste" rows="3" placeholder="② 把官网查到的整段文本粘进来（日期 / 事件 / 港口，贴多少解析多少，认不出也原文留着）"></textarea>
    <div class="mfrow"><button type="button" class="mfparse">解析并填入</button><span class="mfnote"></span></div>
  </div>`;
}

function bindManualFallback(ev) {
  const box = document.getElementById('trackResult');
  if (!box) return;
  const link = box.querySelector('.mflink');
  if (link) link.addEventListener('click', () => {
    const n = link.dataset.num || '';
    if (n && navigator.clipboard) navigator.clipboard.writeText(n).catch(() => {});
  });
  const btn = box.querySelector('.mfparse');
  const ta = box.querySelector('.mfpaste');
  const note = box.querySelector('.mfnote');
  if (btn && ta) btn.addEventListener('click', () => {
    const txt = String(ta.value || '').trim();
    if (!txt) { if (note) note.textContent = '先粘点东西进来'; return; }
    const evs = parseManualText(txt);
    if (note) note.textContent = evs.length ? `认出 ${evs.length} 条` : '没认出日期，原文会原样保留';
    trackRenderManual(txt, ev, evs);
  });
}

function trackRenderManual(text, ev, evs) {
  const box = document.getElementById('trackResult');
  if (!box) return;
  const num = (ev && (ev.docNum || ev.number)) || '';
  const label = (ev && (ev.manualLabel || ev.label)) || '手工录入';
  const events = evs || parseManualText(text);
  if (!events.length) {
    box.innerHTML = `<div class="trackcard manual"><div class="thead"><span class="tcarrier">${esc(label)}</span><span class="tnum">${esc(num)}</span><span class="spacer"></span><span class="tmanual">手工 · 未解析</span></div>
      <div class="tmeta">没认出日期/事件格式 —— 原文已原样保存，没有丢</div>
      <pre class="mraw">${esc(String(text).slice(0, 2000))}</pre></div>`;
    const sm0 = document.getElementById('trackSummary');
    if (sm0) sm0.textContent = '手工录入 · 未解析';
    return;
  }
  trackRenderDone({ ...(ev || {}), ok: true, carrierLabel: label, docNum: num, number: num,
    origin: '', destination: '', events, containers: [], manual: true, phase: '手工录入' });
}

function trackRenderFail(msg, ev) {
  const box = document.getElementById('trackResult');
  if (box) box.innerHTML = `<div class="trackcard"><div class="thead"><span class="tcarrier">${esc((ev && ev.label) || '')}</span><span class="tnum">${esc((ev && (ev.docNum || ev.number)) || '')}</span></div><div class="tfail">⚠️ ${esc(msg)}</div>${manualFallbackHTML(ev)}</div>`;
  const sm = document.getElementById('trackSummary');
  if (sm) sm.textContent = '—';
  bindManualFallback(ev);
}
function trackRenderDone(ev) {
  const c = ev.current || {};
  const eta = ev.eta || {};
  const route = `${ev.origin || '?'} → ${ev.destination || '?'}`;
  const curTxt = `${c.activity || ev.phase || 'Status unavailable'}${c.time ? ' · ' + fmtDay(c.time) : ''}${c.city ? ' @ ' + c.city : ''}${c.vessel ? ' · ' + c.vessel + (c.voyage ? ' ' + c.voyage : '') : ''}`;
  const etaTxt = eta.time ? `${fmtDay(eta.time)} ${eta.city || ''}`.trim() : '—';
  const events = (ev.events || []).map((e) => {
    const estimated = e.timeType === 'EXPECTED' || e.isEta;
    return `<div class="tev${estimated ? ' est' : ''}${e.manual ? ' manual' : ''}"><span class="d">${fmtDay(e.time)}</span><span class="a">${esc(e.activity)}</span><span class="l">${esc(e.city || '')}${e.vessel ? ' · ' + esc(e.vessel) + (e.voyage ? ' ' + esc(e.voyage) : '') : ''}${e.container ? ' · ' + esc(e.container) : ''}</span></div>`;
  }).join('');
  // 10-14 P2：箱型/尺寸显示统一走归一层算好的 label（跨家口径一致，如 40'HC）；
  // label 为空（认不出来）时回退原样拼接 —— 但只有 size 确实是「两位长度」才补 `'`，
  // 否则会把 MSC 那种整段描述（"40' HIGH CUBE REEFER"）拼成 "...REEFER'"。
  const conts = (ev.containers || []).map((ct) => {
    const raw = /^\d{2}$/.test(String(ct.size || '')) ? `${esc(ct.size)}'${ct.type ? ' ' + esc(ct.type) : ''}`
      : [ct.size, ct.type].filter(Boolean).map(esc).join(' ');
    const st = ct.label || raw;
    return `<div class="cblock"><div class="chead">📦 ${esc(ct.num || '')}${st ? ` · ${st}` : ''}<span class="cst">${esc(ct.status || '')}</span></div></div>`;
  }).join('');
  const box = document.getElementById('trackResult');
  if (box) box.innerHTML = `<div class="trackcard clickable${ev.manual ? ' manual' : ''}" id="trackCard" role="button" tabindex="0" aria-expanded="false" aria-controls="trackBody">
    <div class="thead"><span class="tcarrier">${esc(ev.carrierLabel || TRACK_NAME[ev.carrier] || '')}</span><span class="tnum">${esc(ev.docNum || ev.number)}</span><span class="spacer"></span>${ev.manual ? '<span class="tmanual">手工</span>' : ''}<span class="tmore" id="trackMore">Details ▾</span></div>
    <div class="troute">${esc(route)}</div><div class="tmain">${esc(curTxt)}</div><div class="tmeta">ETA ${esc(etaTxt)} · ${esc(ev.phase || '')}</div>
    <div class="tbody" id="trackBody">${conts}${events}</div></div>`;
  const sm = document.getElementById('trackSummary');
  if (sm) sm.textContent = `${ev.containerCount || (ev.containers || []).length} container(s) · ${(ev.events || []).length} events${ev.cached ? ' · cached (' + (ev.cachedAgoMin || 1) + ' min ago)' : ''}`;
  const card = document.getElementById('trackCard');
  if (card) {
    card.onclick = () => {
      const open = card.classList.toggle('open');
      card.setAttribute('aria-expanded', String(open));
      const m = document.getElementById('trackMore');
      if (m) m.textContent = open ? 'Hide ▴' : 'Details ▾';
    };
    card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } };
  }
  trackDone = true;
}
function handleTracking(ev) {
  if (ev.type === 'track-started') { trackDone = false; trackRunning = true; setEngineDot('busy'); trackRenderRunning(ev.number); return; }
  if (ev.type === 'track-warn') {
    // 临时目录降级等「还能跑但不正常」的情况：留痕到诊断，不打断这一票的展示
    stderrTail.push('[warn] ' + String(ev.msg || '').trim());
    if (stderrTail.length > 8) stderrTail.shift();
    renderDiagnostics();
    return;
  }
  if (ev.type === 'track-result') {
    if (!ev.ok) { trackRenderFail(ev.error || 'No result', ev); trackDone = true; return; }
    trackRenderDone(ev); trackDone = true; return;
  }
  if (ev.type === 'track-error') {
    trackRenderFail(ev.msg || 'Tracking error', ev); trackDone = true; trackRunning = false;
    setEngineDot(engineRunning ? 'on' : 'off'); updateGoBtn(); return;
  }
  if (ev.type === 'track-exit') {
    trackRunning = false; setEngineDot(engineRunning ? 'on' : 'off'); updateGoBtn();
    if (pendingTrackRestart) { pendingTrackRestart = false; setTimeout(() => startTrack(), 150); return; }
    if (!trackDone) trackRenderFail('Tracking process exited without a result');
    return;
  }
  if (ev.type === 'track-process-exit' && !trackDone) {
    trackRenderFail(`Tracking process failed (code ${ev.code})`);
    trackRunning = false; setEngineDot(engineRunning ? 'on' : 'off'); updateGoBtn();
  }
}

async function startTrack() {
  const inp = document.getElementById('trackNum');
  const num = (inp.value || '').trim();
  if (!num) { inp.classList.add('invalid'); inp.focus(); return; }
  inp.classList.remove('invalid');
  const selected = document.getElementById('trackCarrier').value || null;
  const carrier = selected || detectClient(num);
  if (!carrier) { trackRenderFail('Cannot identify carrier. Choose one from the carrier menu.'); return; }
  clearEngineError(); runMode = 'track'; trackDone = false; trackRunning = true;
  setEngineDot(engineRunning ? 'on' : 'busy'); updateGoBtn(); trackRenderRunning(num);
  try {
    const res = await invoke('run_track', { args: { number: num, carrier: selected } });
    if (res && res.ok === false) throw new Error(res.error || 'Tracking engine did not start');
  } catch (e) {
    trackRunning = false; setEngineDot(engineRunning ? 'on' : 'off'); updateGoBtn();
    trackRenderFail('Unable to start tracking: ' + String(e).slice(0, 150));
  }
}
document.getElementById('btnTrackGo')?.addEventListener('click', async () => {
  if (trackRunning) {
    pendingTrackRestart = true;
    const sm = document.getElementById('trackSummary');
    if (sm) sm.textContent = '⏹ Stopping previous query, then starting the new one…';
    await invoke('stop_track', {}).catch(() => {});
    setTimeout(() => { if (!pendingTrackRestart) return; pendingTrackRestart = false; trackRunning = false; startTrack(); }, 8000);
    return;
  }
  startTrack();
});
document.getElementById('btnTrackStop')?.addEventListener('click', async () => {
  pendingTrackRestart = false;
  await invoke('stop_track', {}).catch(() => {});
  trackRunning = false;
  setEngineDot(engineRunning ? 'on' : 'off');
  updateGoBtn();
  const sm = document.getElementById('trackSummary');
  if (sm) sm.textContent += '　Stop requested';
});

// ---- 回车即查询（爹地 2026-10-26 要求）----
// 船期页：起运港 / 目的港 / 日期 任一输入框回车 = 点 Query
// 提单页：提单号输入框 / 船司下拉回车 = 点「查询」
// 细节：
//  · e.isComposing 时忽略 —— 中文输入法选词按回车不能误触发查询（「宁波」选词会撞）
//  · 按钮自身已有并发守卫（查询中再触发 = 换条件重查），这里不用重复判断
(function bindEnterToQuery() {
  const bind = (inputIds, btnId) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    for (const id of inputIds) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        btn.click();
      });
    }
  };
  bind(['origin', 'destination', 'date'], 'btnGo');
  bind(['trackNum', 'trackCarrier'], 'btnTrackGo');
})();

// 追踪自检（SSH_TRACK_SELFTEST=<单号> 启动时自动跑一单，婉宜取证用）
(async function trackSelfTest() {
  if (!hasTauri) return;
  try {
    const num = await invoke('track_selftest', {});
    if (!num) return;
    switchView('track');
    setTimeout(() => {
      const el = document.getElementById('trackNum');
      if (el) {
        el.value = num;
        el.dispatchEvent(new Event('input', { bubbles: true }));   // 触发动态识别提示行（自检截图可见，2026-10-12 修）
      }
      document.getElementById('btnTrackGo').click();
    }, 2500);
  } catch (e) { /* 无自检即忽略 */ }
})();

// ---- 更新检查 / App 内自动更新（10-14）----
// 检查：Tauri updater 插件（读 tauri.conf.json 的 endpoints）优先；失败退回匿名 API / 本机 gh。
// 安装：App 内下载 + 进度条 + 自动重启（不再跳浏览器）。
(function updateChecker() {
  if (!hasTauri) return;
  const API = 'https://api.github.com/repos/theWeatherMan21/ship-schedule-hub/releases/latest';
  const REPO_URL = 'https://github.com/theWeatherMan21/ship-schedule-hub/releases';
  const STATE_KEY = 'ssh-update-state';
  const SKIP_KEY = 'ssh-skip-version';
  const DAY = 24 * 3600 * 1000;

  const plainNotes = (s) => String(s || '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '· ')
    .replace(/\|/g, ' ')
    .replace(/^\s*---+\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const toast = (msg) => {
    const old = document.getElementById('uc-toast');
    if (old) old.remove();
    const d = document.createElement('div');
    d.id = 'uc-toast';
    d.className = 'utoast';
    d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(() => { if (d.parentNode) d.remove(); }, 3000);
    return d;
  };

  /** 更新弹窗：发现新版 → 立即更新（App 内下载+进度）/ 稍后 / 跳过此版本 */
  const showUpdateDialog = (info) => {
    if (document.getElementById('update-modal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'update-modal';
    wrap.className = 'umask';
    const card = document.createElement('div');
    card.className = 'ucard';

    const h = document.createElement('div');
    h.className = 'uhead';
    h.textContent = `发现新版本 v${String(info.latest)}`;
    card.appendChild(h);

    const sub = document.createElement('div');
    sub.className = 'usub';
    sub.textContent = `当前版本 v${__APP_VERSION__}`;
    card.appendChild(sub);

    const notes = plainNotes(info.notes);
    if (notes) {
      const body = document.createElement('div');
      body.className = 'ubody';
      const pre = document.createElement('pre');
      pre.textContent = notes.slice(0, 2000);
      body.appendChild(pre);
      card.appendChild(body);
    }

    // 进度区（下载时才显示）
    const prog = document.createElement('div');
    prog.className = 'uprog';
    prog.style.display = 'none';
    const bar = document.createElement('div');
    bar.className = 'ubar';
    const fill = document.createElement('div');
    fill.className = 'ufill';
    bar.appendChild(fill);
    const ptxt = document.createElement('div');
    ptxt.className = 'uptxt';
    prog.appendChild(bar);
    prog.appendChild(ptxt);
    card.appendChild(prog);

    const btns = document.createElement('div');
    btns.className = 'ubtns';

    const go = document.createElement('button');
    go.className = 'uprimary';
    go.textContent = '立即更新';
    go.addEventListener('click', async () => {
      // 优先：Tauri updater 的 App 内下载安装
      if (info._upd) {
        go.disabled = true;
        go.textContent = '更新中…';
        later.style.display = 'none';
        skip.style.display = 'none';
        prog.style.display = 'block';
        ptxt.textContent = '正在下载…';
        let total = 0, got = 0;
        try {
          await info._upd.downloadAndInstall((ev) => {
            if (ev.event === 'Started') {
              total = (ev.data && ev.data.contentLength) || 0;
              ptxt.textContent = total ? `正在下载… 0%（${Math.round(total / 1048576)} MB）` : '正在下载…';
            } else if (ev.event === 'Progress') {
              got += (ev.data && ev.data.chunkLength) || 0;
              const pct = total ? Math.min(100, Math.round((got / total) * 100)) : 0;
              fill.style.width = pct + '%';
              ptxt.textContent = `正在下载… ${pct}%（${(got / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB）`;
            } else if (ev.event === 'Finished') {
              fill.style.width = '100%';
              ptxt.textContent = '下载完成，正在安装…';
            }
          });
          ptxt.textContent = '安装完成，正在重启…';
          // 更新成功 → 清掉检查状态（重启后不会再提示同一个版本）
          try { localStorage.removeItem(STATE_KEY); localStorage.removeItem(SKIP_KEY); } catch { /* 忽略 */ }
          // 优先自实现（无 ACL 依赖）；失败再退插件版
          try { await invoke('restart_app'); }
          catch { const { relaunch } = await import('@tauri-apps/plugin-process'); await relaunch(); }
        } catch (e) {
          go.disabled = false;
          go.textContent = '重试';
          later.style.display = '';
          skip.style.display = '';
          ptxt.textContent = '更新失败：' + String((e && (e.message || e)) || 'unknown').slice(0, 80);
        }
        return;
      }
      // 兜底：打开 Release 页（拿不到 updater 对象时）
      const url = String(info.url || REPO_URL);
      try {
        if (hasTauri) await invoke('open_external', { url });
        else window.open(url, '_blank');
        wrap.remove();
      } catch (e) {
        toast('打开更新页失败：' + String((e && (e.message || e)) || 'unknown').slice(0, 80));
      }
    });
    btns.appendChild(go);

    const later = document.createElement('button');
    later.textContent = '稍后';
    later.title = '下次启动再提示';
    later.addEventListener('click', () => wrap.remove());
    btns.appendChild(later);

    const skip = document.createElement('button');
    skip.className = 'uskip';
    skip.textContent = '跳过此版本';
    skip.title = '此版本不再提示';
    skip.addEventListener('click', () => {
      try { localStorage.setItem(SKIP_KEY, String(info.latest)); } catch { /* 忽略 */ }
      wrap.remove();
    });
    btns.appendChild(skip);

    card.appendChild(btns);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
  };

  async function runUpdateCheck({ manual = false } = {}) {
    try {
      if (!manual) {
        let st = null;
        try { st = JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch { /* 忽略 */ }
        if (st && st.ts && Date.now() - st.ts < DAY) {
          if (st.hasUpdate && st.latest) {
            // 关键：缓存是「上次检查时」的判断；App 可能已经更新过了
            // → 用当前实际版本重新判定一次，避免「更新完还提示同一个版本」
            if (!isNewer(st.latest, __APP_VERSION__)) {
              try { localStorage.removeItem(STATE_KEY); } catch { /* 忽略 */ }
              return;
            }
            try { if (localStorage.getItem(SKIP_KEY) === st.latest) return; } catch { /* 忽略 */ }
            // 缓存命中：仍要拿到 updater 对象才能 App 内更新
            const upd = await tauriCheck();
            // upd 可能是 null（网络抖动）；此时退回用缓存展示，但 current 用实时版本
            showUpdateDialog({ ...st, current: __APP_VERSION__, _upd: upd });
          }
          return;
        }
      }

      // ① 首选 Tauri updater（能拿到可安装对象；走配置的 endpoint）
      let latest = '', notes = '', url = '', upd = null;
      upd = await tauriCheck();
      if (upd) {
        latest = String(upd.version || '').replace(/^v/, '');
        notes = upd.body || '';
        url = upd.html_url || REPO_URL;
      } else {
        // ② 退回匿名 API；③ 再退本机 gh 凭据
        let r = null;
        try { r = await fetch(API, { headers: { accept: 'application/vnd.github+json' } }); } catch { /* 走兜底 */ }
        if (r && r.ok) {
          const j = await r.json();
          latest = String(j.tag_name || '').replace(/^v/, '');
          notes = j.body || j.name || '';
          url = j.html_url || REPO_URL;
        } else {
          const g = await invoke('gh_check_update', {}).catch(() => null);
          if (g && g.ok && g.tag) {
            latest = String(g.tag).replace(/^v/, '');
            notes = g.body || '';
            url = g.url || REPO_URL;
          } else {
            if (manual) toast(r ? `检查更新失败：HTTP ${r.status}` : '检查更新失败：网络不可达');
            return;
          }
        }
      }
      if (!latest) { if (manual) toast('检查更新失败：响应里没有版本号'); return; }

      const hasUpdate = isNewer(latest, __APP_VERSION__);
      const info = { latest, hasUpdate, url: url || REPO_URL, notes: notes || '' };
      try { localStorage.setItem(STATE_KEY, JSON.stringify({ ts: Date.now(), ...info })); } catch { /* 忽略 */ }
      if (!hasUpdate) {
        if (manual) toast(`已是最新版本（v${__APP_VERSION__}）`);
        return;
      }
      try { if (localStorage.getItem(SKIP_KEY) === latest) return; } catch { /* 忽略 */ }
      showUpdateDialog({ ...info, _upd: upd });
    } catch (e) {
      if (manual) toast('检查更新失败：' + String((e && (e.message || e)) || 'unknown').slice(0, 90));
    }
  }

  /** 调 Tauri updater 插件；不可用/无更新/报错 → null */
  async function tauriCheck() {
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      return await check();
    } catch (e) {
      return null;
    }
  }

  setTimeout(() => runUpdateCheck({ manual: false }), 5000);
  document.getElementById('btnCheckUpdate')?.addEventListener('click', () => runUpdateCheck({ manual: true }));
  // ---------- WPS 回填工作台：筛选 / 批次切换 / 时间线 / 复制（10-29 架构②）----------
  document.getElementById('wpsReload')?.addEventListener('click', () => { wpsRefresh(); wpsLoad(); });

  document.getElementById('wpsChips')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    wpsFilter = b.dataset.f;
    document.querySelectorAll('#wpsChips .wpschip').forEach((x) => x.classList.toggle('active', x === b));
    wpsRenderGrid();
  });

  document.getElementById('wpsCarrier')?.addEventListener('change', (e) => {
    wpsCarrier = e.target.value || '';
    wpsRenderGrid();
  });

  let wpsSearchTimer = null;
  document.getElementById('wpsSearch')?.addEventListener('input', (e) => {
    const v = e.target.value || '';
    clearTimeout(wpsSearchTimer);
    wpsSearchTimer = setTimeout(() => { wpsQuery = v; wpsRenderGrid(); }, 180);
  });

  document.getElementById('wpsQueue')?.addEventListener('click', (e) => {
    const copyRetry = e.target.closest('.copy-retry');
    if (copyRetry) {
      const key = copyRetry.dataset.key;
      const t = ((wpsData && wpsData.tables) || []).find((x) => x.key === key);
      if (t) wpsCopy(t.retry.map((x) => x.n).join('\n'), '待重查单号');
      return;
    }
    const hit = e.target.closest('[data-batch]');
    if (!hit) return;
    wpsBatchId = hit.dataset.batch;
    wpsOpenKey = '';
    wpsRenderQueue();
    wpsRenderGrid();
    wpsRenderDrawer();
  });
  document.getElementById('wpsQueue')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const hit = e.target.closest('[data-batch]');
    if (!hit) return;
    e.preventDefault();
    wpsBatchId = hit.dataset.batch;
    wpsOpenKey = '';
    wpsRenderQueue(); wpsRenderGrid(); wpsRenderDrawer();
  });

  document.getElementById('wpsGrid')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-key]');
    if (!row) return;
    wpsOpenKey = row.dataset.key === wpsOpenKey ? '' : row.dataset.key;
    wpsRenderGrid();
    wpsRenderDrawer();
  });
  document.getElementById('wpsGrid')?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = e.target.closest('[data-key]');
    if (!row) return;
    e.preventDefault();
    wpsOpenKey = row.dataset.key === wpsOpenKey ? '' : row.dataset.key;
    wpsRenderGrid();
    wpsRenderDrawer();
  });

  document.getElementById('wpsCopyAll')?.addEventListener('click', () => {
    wpsCopy(wpsFilteredItems().map((it) => it.n).join('\n'), '单号');
  });
  document.getElementById('wpsCopyFail')?.addEventListener('click', () => {
    const b = wpsCurrentBatch();
    const fails = ((b && b.items) || []).filter((it) => !it.ok).map((it) => it.n);
    if (!fails.length) { wpsCopy('', ''); toast('这一批没有失败行'); return; }
    wpsCopy(fails.join('\n'), '失败单号');
  });

  document.getElementById('wpsInstall')?.addEventListener('click', () => wpsRun('install', '安装'));
  document.getElementById('wpsUninstall')?.addEventListener('click', () => {
    if (!window.confirm('确定卸载 WPS 里的「船期追踪」加载项？卸载后要重新安装才能用。')) return;
    wpsRun('uninstall', '卸载');
  });
  document.getElementById('wpsDir')?.addEventListener('click', async () => {
    try {
      const s = await wpsAction('status');
      if (s.dir) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('open_external', { url: 'file://' + s.dir }).catch(() => {});
      }
    } catch (e) { /* 打不开就算了 */ }
  });
})();
