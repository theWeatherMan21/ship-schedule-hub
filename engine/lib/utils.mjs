// 共享工具：日期格式化、cookie 处理、autocomplete 填选、防护页检测
// 注意：playwright-core 不导出 expect（那是 @playwright/test 的东西），别 import 它。

// ---- 日期格式化：输入统一 YYYY-MM-DD ----
export function dateFormats(iso) {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const monthShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  const monthLong = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1];
  return {
    iso, y, m, d,
    dd_mm_yyyy: `${dd}/${mm}/${y}`,
    mm_dd_yyyy: `${mm}/${dd}/${y}`,
    yyyy_mm_dd: `${y}-${mm}-${dd}`,
    dots: `${y}. ${mm}. ${dd}`,
    slashes: `${y}/${mm}/${dd}`,
    monthShort, monthLong,
  };
}

// ---- 通用 cookie 弹窗处理：逐个尝试常见按钮（全部静默、短超时）----
// 爸爸指示：cookie 弹窗直接点「接受」，不犹豫不跳过。
// 优先级：#onetrust-accept-btn-handler → button[id*=accept i] → 文本匹配
const COOKIE_SELECTORS = [
  '#onetrust-accept-btn-handler',
  'button#truste-consent-button',
  'button[id*="accept" i]',
  'button[aria-label*="accept" i]',
  'button[data-testid*="accept" i]',
];
const COOKIE_TEXTS = [
  /^\s*accept all cookies\s*$/i, /^\s*accept all\s*$/i, /^\s*allow all\s*$/i,
  /^\s*allow all cookies\s*$/i, /^\s*i agree\s*$/i, /^\s*accept\s*$/i,
  /^\s*agree\s*$/i, /接受全部/, /全部接受/, /^\s*接受\s*$/, /同意/, /^\s*允许全部\s*$/,
];
// ---- 通用遮罩/弹窗清除（2026-10-09 爹地破案：zim 的 cookie 弹窗、阳明的通知弹窗挡住了表单）----
// 思路：① 先按文案点关闭/同意 ② 还挡着就移除"高 z-index + 固定定位 + 覆盖大半个屏幕"的遮罩元素 ③ 解开滚动锁
// 这一层不依赖知道弹窗长什么样，页面改版也照样管用。
const OVERLAY_CLOSE_TEXTS = [
  /^\s*accept( all)?( cookies)?\s*$/i, /^\s*allow( all)?\s*$/i, /^\s*i agree\s*$/i,
  /^\s*agree\s*$/i, /^\s*ok(ay)?\s*$/i, /^\s*got it\s*$/i, /^\s*close\s*$/i,
  /^\s*dismiss\s*$/i, /^\s*no thanks\s*$/i, /^\s*continue\s*$/i, /^\s*×\s*$/,
  /同意/, /接受/, /允许/, /知道了/, /关闭/, /继续/,
];
const OVERLAY_CLOSE_SELECTORS = [
  'button[aria-label*="close" i]', '[aria-label*="dismiss" i]', '[aria-label*="關閉"]', '[aria-label*="关闭"]',
  'button.close', '.modal-close', '.modal__close', '.popup-close', '.close-button', '[class*="close"][role="button"]',
  '[class*="cookie"] button', '[class*="consent"] button', '[class*="notification"] button',
];

export async function clearOverlays(page, { aggressive = true } = {}) {
  let acted = false;
  for (const sel of OVERLAY_CLOSE_SELECTORS) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 250 }).catch(() => false)) {
        await el.click({ timeout: 1200, force: true }).catch(() => {});
        acted = true; await page.waitForTimeout(250);
      }
    } catch { /* next */ }
  }
  for (const re of OVERLAY_CLOSE_TEXTS) {
    try {
      const btn = page.getByRole('button', { name: re }).first();
      if (await btn.isVisible({ timeout: 200 }).catch(() => false)) {
        await btn.click({ timeout: 1200, force: true }).catch(() => {});
        acted = true; await page.waitForTimeout(250);
      }
    } catch { /* next */ }
  }
  if (!aggressive) return acted;
  // 移除残存遮罩：固定/粘性定位、z-index 高、覆盖视口中心且面积大于 35%
  try {
    const removed = await page.evaluate(() => {
      const vw = window.innerWidth, vh = window.innerHeight;
      const cx = vw / 2, cy = vh / 2;
      let n = 0;
      const all = Array.from(document.querySelectorAll('div, section, aside, dialog, iframe'));
      for (const el of all) {
        try {
          const cs = getComputedStyle(el);
          if (cs.position !== 'fixed' && cs.position !== 'sticky' && cs.position !== 'absolute') continue;
          const z = parseInt(cs.zIndex || '0', 10);
          if (!(z >= 100 || cs.position === 'fixed')) continue;
          const r = el.getBoundingClientRect();
          if (r.width * r.height < vw * vh * 0.35) continue;
          const covers = r.left <= cx && r.right >= cx && r.top <= cy && r.bottom >= cy;
          if (!covers) continue;
          if (cs.pointerEvents === 'none' && parseFloat(cs.opacity) < 0.1) continue;
          // ★ 10-09 修：容器里若有表单控件（输入框/下拉/按钮）绝不删 —— 那可能是站点自己的
          //   快速查询组件（ZIM 的 .quick-parent 就是固定定位全屏），删了等于把功能拆了。
          //   真正的 cookie/通知遮罩里没有输入框，这条判据既准又稳。
          if (el.querySelector('input, select, textarea, [role="combobox"], [contenteditable="true"]')) continue;
          el.remove(); n++;
        } catch { /* 单个元素出错不影响其余 */ }
      }
      // 解开滚动锁
      try {
        if (getComputedStyle(document.body).overflow === 'hidden') document.body.style.overflow = 'auto';
        if (getComputedStyle(document.documentElement).overflow === 'hidden') document.documentElement.style.overflow = 'auto';
      } catch { /* 忽略 */ }
      return n;
    }).catch(() => 0);
    if (removed) acted = true;
  } catch { /* 忽略 */ }
  return acted;
}

export async function dismissCookies(page) {
  // 1) 明确的 banner 按钮
  for (const sel of COOKIE_SELECTORS) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 400 }).catch(() => false)) {
        await btn.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(400);
        return true;
      }
    } catch { /* next */ }
  }
  // 2) 文案匹配（部分站点按钮是 <a>/<div role=button>，getByRole 覆盖 role=button）
  for (const re of COOKIE_TEXTS) {
    try {
      const btn = page.getByRole('button', { name: re }).first();
      if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
        await btn.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(400);
        return true;
      }
    } catch { /* next */ }
  }
  return false;
}

// 在已经弹出的候选列表里点最匹配的一项；没候选就用键盘选第一项。
export async function pickOption(page, query, { timeout = 8000, pick, keyboardFallback = false } = {}) {
  const candidates = page.locator(
    '[role="option"], [role="listbox"] [role="option"], li[role="option"], ' +
    '[role="listbox"] > li, [role="listbox"] li[aria-selected], ' +   // 语义子项：合法 ARIA option 但无 role 属性
    '.k-list .k-item, ' +
    'ul.autocomplete li, [class*="autocomplete"] li, [class*="suggest"] li, li.ui-menu-item, ' +
    '.pac-item, [class*="dropdown"] li, [class*="options"] [class*="item"]',
  );
  const ariaCands = page.getByRole('option');   // ARIA 兜底（role 属性的组件用上面，不写的用这个）
  const deadline = Date.now() + timeout;
  let texts = [];
  while (Date.now() < deadline) {
    texts = [];
    for (const [loc, which] of [[candidates, 'dom'], [ariaCands, 'aria']]) {
      const n = await loc.count().catch(() => 0);
      for (let i = 0; i < Math.min(n, 15); i++) {
        const el = loc.nth(i);
        if (!(await el.isVisible().catch(() => false))) continue;
        // ⚠️ 别只读 innerText：自定义/Shadow DOM 组件上它是空串 → 候选全被当成不存在
        const t = (((await el.textContent().catch(() => '')) || (await el.innerText().catch(() => '')) || '')).trim().replace(/\s+/g, ' ');
        if (t) texts.push({ loc, i, t, which });
      }
      if (texts.length) break;
    }
    if (texts.length) break;
    await page.waitForTimeout(400);
  }
  const key = String(query || '').toLowerCase().trim();
  let best = null;
  if (pick) best = texts.find((x) => pick(x.t)) || null;
  if (!best) {
    // 绝不盲点第一个：匹配不上就返回 null，交给上层换写法再试（盲点=选错港口，比失败更糟）
    best = texts.find((x) => x.t.toLowerCase().includes(key)) ||
      texts.find((x) => x.t.toLowerCase().split(/[(,]/)[0].trim() === key) ||
      null;
  }
  if (best) {
    await (best.loc || candidates).nth(best.i).click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(600);
    return best.t;
  }
  // ⚠️ 10-09 修（离线单元测试 qa/fill-unit.mjs 抓到的盲点）：ArrowDown+Enter 等于"选第一个" ——
  // 选错港口比失败更糟。默认返回 null 让上层换写法再试；确需键盘兜底的配方显式传 keyboardFallback: true。
  if (keyboardFallback) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(350);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    return '(keyboard)';
  }
  return null;
}

// ---- 防护页检测：Akamai/CF 挑战页或裸 403 ----
export async function isBlockPage(page) {
  const title = (await page.title().catch(() => '')) || '';
  if (/just a moment|access denied|attention required|forbidden/i.test(title)) return true;
  if (/^cma-cgm\.com$/i.test(title.trim())) return true; // CMA 403 时 title 是裸域名
  const sample = async () => (await page.evaluate(() => document.body?.innerText?.length || 0).catch(() => 0));
  let bodyLen = await sample();
  // SPA 壳页（COSCO/ONE 等）在 domcontentloaded 时 body 还是空的：
  // 二次采样确认，避免把「还没渲染完」误判成「被反爬拦截」。
  if (bodyLen < 40) {
    await page.waitForTimeout(1500);
    bodyLen = await sample();
  }
  if (bodyLen < 40 && !/example/i.test(title)) return true; // 几乎空 body
  // 官网的「限流 / 异常访问」页（body 不空，但必须认清是拦截，别显示成「查不到」）——
  // 实测 HMM: Thank you for using HMM e-service. Your access to this site has been limited
  // due to abnormal connection. <Reference Code: ...>  = IP 级限流（多为短时间查太多次招来）
  const bodyText = await page.evaluate(() => (document.body?.innerText || '').slice(0, 800)).catch(() => '');
  if (/access to this site has been limited|abnormal connection|too many requests|rate limit|429 too many|service (is )?unavailable|异常访问/i.test(bodyText)) return true;
  return false;
}

// ---- DataDome 系「挑战 cookie」作废（10-10 达飞收尾实测）----
// 现象（同 IP、同一 profile 副本，第 3 轮对照实测 15:19–15:27）：
//   带 datadome cookie 进新会话  → 必被挑战：HTTP 403 + captcha-delivery 设备检查 iframe（表单拿不到）
//   作废 datadome cookie 后再访  → 3/3 全 200（表单在、无 iframe）
//   同一 context 里第 2 次导航（带着首访下发的 datadome cookie）→ 又 403
// 机制：挑战页会下发一枚「挑战态」datadome cookie，它落盘后每次都把人导回挑战页 ——
//   profile 自己永远不会自愈（这就是达飞「从早到晚 0 条」的根因，不是 IP 声誉、不是时段）。
// 处置：每次查询前先作废该域下的 datadome cookie，等价于「干净首访」。
// 只碰 datadome 系 cookie，别动站点自己的会话 cookie（实测保留 _cs_c/XSRF/Human_Search 不影响放行）。
export async function clearDataDomeCookies(ctx, urls) {
  let killed = 0;
  for (const u of (Array.isArray(urls) ? urls : [urls])) {
    const cks = await ctx.cookies(u).catch(() => []);
    for (const c of cks.filter((x) => /datadome/i.test(x.name))) {
      // expires:0 = 立即过期（Playwright 会把它从 jar 里清掉）
      await ctx.addCookies([{ ...c, expires: 0 }]).catch(() => {});
      killed++;
    }
  }
  return killed;
}

// ---- 通用候选点选（移植自 qa/m4-probe.mjs pickCandidate，V6C 起用）----
// 轮询匹配 + 排除隐藏原生 select（CSS [role="option"] 不匹配原生 <option>，getByRole('option') 会）。
// 打字用 field.type 定向输入（page.keyboard.type 在 React 重渲染后 focus 丢失，输入会进 <body>）。
// 返回选中的候选文本；没候选返回 null（不抛错，由调用方决定兜底）。
// 一次性尝试（内部）；外层 typeAndPickCandidate 负责「多种写法依次试」。
async function pickOnce(page, field, word, opts = {}) {
  const { pick, fallbacks, selectors, typeDelay = 70, settleMs = 2200, polls = 30, pollMs = 500 } = opts;
  const t = String(word || '');
  await field.click({ timeout: 8000 }).catch(() => {});
  await field.fill('', { timeout: 3000 }).catch(() => {});
  if (t) {
    try { await field.type(t, { delay: typeDelay, timeout: 12000 }); }
    catch {
      // 受控组件把 value 重置/吞字：改用 pressSequentially 逐键；再不行用原生 setter 兜底
      try { await field.click({ timeout: 3000 }).catch(() => {}); await field.pressSequentially(t, { delay: typeDelay }); }
      catch { try { await setValue(field, t); } catch {} }
    }
  }
  await new Promise((r) => setTimeout(r, settleMs));
  const tiers = selectors || [
    () => page.locator('[role="option"], [role="listbox"] [role="option"], li[role="option"]').all(),
    () => page.locator('.ivu-select-item, ul.autocomplete li, [class*="autocomplete"] li, [class*="suggest"] li, .k-list .k-item, li.ui-menu-item, .pac-item, [class*="select-item"]').all(),
    () => page.locator('ul:not([class]) li, ul[class=""] li').all(),
    () => page.getByRole('option').all(),   // ARIA（无障碍树）：自定义组件常不写 role 属性，DOM 选择器抓不到
    () => page.locator('li').all(),
  ];
  let pool = [];
  for (let n = 0; n < polls; n++) {
    for (const s of tiers) {
      try {
        const els = await s();
        const vis = [];
        for (const e of els) if (await e.isVisible().catch(() => false)) vis.push(e);
        if (vis.length) { pool = vis; break; }
      } catch { /* next tier */ }
    }
    if (pool.length) {
      const readTxt = async (e) => ((await e.textContent().catch(() => '')) || (await e.innerText().catch(() => '')) || '');
      const joined = (await Promise.all(pool.slice(0, 4).map((e) => readTxt(e)))).join(' ');
      if (/no results/i.test(joined)) { pool = []; await new Promise((r) => setTimeout(r, 800)); continue; }
      let transient = true;
      for (const e of pool) { const x = (await readTxt(e)).trim(); if (x && !/^search(ing)?\.?\.?$|^loading/i.test(x)) { transient = false; break; } }
      if (transient) { pool = []; await new Promise((r) => setTimeout(r, 1500)); continue; }
      // 候选「非空但 pick 不中」时继续轮询：同一容器里常先渲染无关项（COSCO 的 .ivu-select-item
      // 会先给出 BOTH/CY/DOOR 等服务模式项 30 个，港口候选要几秒后才追加进来）——
      // 提前 break 会让 pick 永远看不到目标项（婉宜 9-22，qa/cosco-dom-dump2 实测）。
      if (pick && n < polls - 1) {
        const quick = await Promise.all(pool.map((e) => e.innerText().catch(() => '')));
        if (!quick.some((t) => { try { return pick(t); } catch { return false; } })) {
          await new Promise((r) => setTimeout(r, pollMs));
          continue;
        }
      }
      break;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  if (!pool.length) return null;
  // 收集文本（index 与 pool 一一对应）
  const texts = [];
  for (let i = 0; i < pool.length; i++) {
    let snap = ''; try { snap = await pool[i].ariaSnapshot(); } catch { /* no-op */ }
    let txt = (snap || '').replace(/\s+/g, ' ').trim();
    if (!txt) txt = (await pool[i].textContent().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (txt) texts.push({ i, txt });
  }
  if (!texts.length) return null;
  // 打分：pick 函数 → fallbacks 变体 → 关键词（首词/包含）→ 第一项
  let hit = null;
  if (pick) hit = texts.find((x) => pick(x.txt)) || null;
  if (!hit && fallbacks) {
    for (const f of fallbacks) { const x = texts.find((x) => x.txt.toLowerCase().includes(String(f).toLowerCase())); if (x) { hit = x; break; } }
  }
  if (!hit) {
    const key = t.toLowerCase().trim();
    const first = (s) => s.toLowerCase().replace(/^- option "/, '').split(/[(,]/)[0].trim();
    hit = texts.find((x) => first(x.txt) === key || first(x.txt).startsWith(key) || x.txt.toLowerCase().includes(key)) || null;
  }
  if (!hit) hit = texts[0];
  // 点击（带兜底：目标不可见/不可点就逐个降级）
  let clicked = false;
  try { await pool[hit.i].click({ timeout: 5000 }); clicked = true; } catch { /* no-op */ }
  if (!clicked) {
    for (const x of texts) {
      if (x.i === hit.i) continue;
      try { if (await pool[x.i].isVisible().catch(() => false)) { await pool[x.i].click({ timeout: 5000 }); clicked = true; hit = x; break; } } catch { /* no-op */ }
    }
  }
  if (!clicked) return null;
  await new Promise((r) => setTimeout(r, 800));
  return hit.txt;
}

// 候选点选（对外）：word 可以是**字符串**，也可以是**一组写法**（同一港口的不同叫法）。
// 术语提醒：船司的下拉是时序敏感 + 对写法挑剔的 —— 主写法没出候选时，
// 换「纯港名」「Name (LOCODE)」「用户原词」再试，比反复重开页面有效得多（婉宜 10-08）。
export async function typeAndPickCandidate(page, field, word, opts = {}) {
  const list = (Array.isArray(word) ? word : [word])
    .map((x) => String(x ?? '').trim())
    .filter((x, i, a) => x && a.indexOf(x) === i);
  if (!list.length) return null;
  for (let i = 0; i < list.length; i++) {
    const polls = i === 0 ? (opts.polls ?? 30) : Math.min(opts.polls ?? 30, 14);
    const hit = await pickOnce(page, field, list[i], { ...opts, polls });
    if (hit) return hit;
    // 换写法的前置：把输入框清干净（受控组件要全选删除，直接 fill('') 会被吞）
    try {
      await field.click({ timeout: 3000 });
      // ⚠️ 10-09 修（爹地指出"填表 approach 有问题"）：macOS 全选是 Meta+A，
      // Control+A 只是"移到行首"→ 旧文字没清掉 → 下一种写法被拼接（tianjinXingang Pt）→ 候选永远匹配不上。
      await field.fill('').catch(() => {});
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
      await page.keyboard.press('Backspace').catch(() => {});
    } catch { /* no-op */ }
    await new Promise((r) => setTimeout(r, 600));
  }
  return null;
}

// ---- 词典驱动的候选消歧：portPick(text, q, which) ----
// q 携带 { _o: resolvePort结果(origin), _d: ...(dest) }（engine/query.mjs 注入）。
// 打分制：LOCODE 强命中 =2，国家命中 +1，CY 徽标 +1（Maersk/ONE 系）；负分项排除无关候选。
export function portPick(text, q, which = 'origin') {
  try {
    const r = which === 'origin' ? q._o : q._d;
    if (!r) return false;
    const t = String(text).toLowerCase();
    if (!t) return false;
    let score = 0;
    if (r.locode && t.includes(r.locode.toLowerCase())) score += 2;
    // 很多候选不显示 LOCODE（如 Maersk 的 "Xingang (Tianjin), China CY"）→ 港名/同组港名命中也算强命中
    const toks = String(r.name || '').toLowerCase().split(/\s+/).filter((x) => x.length >= 4);
    const sibToks = [];
    try {
      for (const sib of (r.siblings || [])) toks.push(...String(sib.name || '').toLowerCase().split(/\s+/).filter((x) => x.length >= 4));
    } catch { /* no-op */ }
    if (toks.some((w) => t.includes(w))) score += 2;               // 港名命中（Tianjin / Xingang …）
    if (sibToks.some((w) => t.includes(w))) score += 1;            // 同组港名命中（弱一档）
    if (r.country && t.includes(String(r.country).toLowerCase())) score += 1;
    if (/\b(cy)\b/.test(t) && !/\b(sdi|si)\b/.test(t)) score += 1;
    const word = (r.word || '').toLowerCase();
    if (word && t.includes(word)) score += 1;
    if (score >= 2) return true;
    // 弱命中不算（防止 country 一次命中就选中），让 H.pickOption 走包含匹配兜底
    return false;
  } catch { return false; }
}

// ---- 等待挑战页自动通过（可见模式下 CF 常自动放行）----
export async function waitThroughChallenge(page, ms = 10000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!(await isBlockPage(page))) return true;
    await page.waitForTimeout(1000);
  }
  return !(await isBlockPage(page));
}

// ---- autocomplete 型输入：click → type → 等下拉 → 点匹配项 ----
// pick: 匹配函数 (optionText) => boolean；默认包含 origin/destination 关键词
export async function typeAndPick(page, locator, query, { pick, timeout = 12000, exactHint = '' } = {}) {
  await locator.click({ timeout });
  await locator.fill('', { timeout: 3000 }).catch(() => {}); // 清空（部分站点炸校验，靠 catch + 重type）
  await locator.type(query, { delay: 60, timeout });
  // 等任何形式的选择列表出现
  const listbox = page.locator('[role="listbox"], [role="option"], .k-list-container, ul.autocomplete, .dropdown-menu, .suggestions, [class*="autocomplete"] li, [class*="option"], [class*="suggest"] li')
    .first();
  await listbox.waitFor({ state: 'visible', timeout }).catch(() => {});
  await page.waitForTimeout(900);
  // 在可见的 option 集合里找匹配
  const candidates = page.locator('[role="option"], [role="listbox"] [role="option"], .k-list .k-item, ul.autocomplete li, [class*="autocomplete"] li, [class*="suggest"] li, li.ui-menu-item, .pac-item');
  const n = await candidates.count().catch(() => 0);
  const texts = [];
  for (let i = 0; i < Math.min(n, 12); i++) {
    const t = (await candidates.nth(i).innerText().catch(() => '')).trim();
    if (t) texts.push({ i, t });
  }
  if (!texts.length) throw new Error(`autocomplete 无候选 (${exactHint || query})`);
  // 打分：pick 函数优先，否则包含匹配，否则第一项
  let best = null;
  if (pick) best = texts.find((x) => pick(x.t)) || null;
  if (!best) {
    const key = (exactHint || query).toLowerCase();
    best = texts.find((x) => x.t.toLowerCase().includes(key)) ||
           texts.find((x) => { const first = x.t.toLowerCase().split(/[(,]/)[0].trim(); return first === key; }) ||
           texts[0];
  }
  await candidates.nth(best.i).click({ timeout: 4000 });
  return best.t;
}

// ---- 断言式等待（带上下文的报错）----
export async function must(fn, what, timeout = 12000) {
  try {
    return await fn();
  } catch (e) {
    throw new Error(`${what} 失败: ${String(e).split('\n')[0].slice(0, 160)}`);
  }
}

export { dateFormats as default };
