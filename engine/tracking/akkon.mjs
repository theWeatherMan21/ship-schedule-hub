// Akkon Lines 提单追踪 —— 2026-10-23（婉宜，真实单号 AKKNBO######## 实测）
//
// 站点：https://sap.akkonlines.com/index.aspx（ASP.NET WebForms + UpdatePanel 局部回发）
// 实测流程（2026-10-23）：
//   ① 选 Port Of Loading 国家（#ddlCountry，21 项，**必选**，不选报 "Please select a Port Of Loading!"）
//   ② 填 14 位 BL/Booking No（#TextBox1）+ 点 #Button1
//   ③ 结果渲染在 #UpdatePanel1 的表格里；查无此单 → 弹窗 "Not Found / Booking number could not be found."
// 约束（实测）：
//   · 箱号**不能单独查** —— 只填 #TextBox2 点 #btnContainerSearch 会报 "Enter your BL Number.!"，
//     服务器要求先有 BL；所以箱号输入一律明确提示「需要提单号」。
//   · 单号必须 14 位（前端 maxlength=14，服务器按 14 位校验）。
//   · 国家必须选对：单号本身推不出国家 → 按 CHINA 优先的顺序遍历，命中即停。
//
// 实测数据（AKKNBO######## / 国家 CHINA）：
//   BL=AKKNBO######## | 箱号=CAAU######-3 | 船=MV LIANG XIANG 85 | 航次=LIN0125W
//   POL=NINGBO | ETS=21/11/2025 | POD=GEMLIK RODAPORT | ETA=17/12/2025
//
// 输出：统一结构（与 zim.mjs / maersk.mjs 对齐，供 normalize.mjs 归一化）
//   { ok, number, carrier:'akkon', docNum, origin, destination, vessel, voyage,
//     status, lastUpdate, containers:[{ num, size, type, status, events }], events:[...], raw }

import { launch, sleep } from '../browser.mjs';

const URL = 'https://sap.akkonlines.com/index.aspx';
// 21 国遍历的上限：每国 3-6s，留足余量（Hapag 级别的慢站点经验）
export const deadlineMs = 180000;

// 国家优先级：中国出口先试（爹地主要业务），其余按 Akkon 航线覆盖排
const COUNTRIES = [
  'CHINA',
  'TURKIYE',
  'ITALY',
  'IBERIA / SPAIN',
  'BELGIUM',
  'UNITED KINGDOM',
  'UNITED ARAB EMIRATES',
  'SAUDI ARABIA',
  'EGYPT',            // 站点列表若无此项会自动跳过
  'MOROCCO',
  'ALGERIA',
  'TUNISIA',
  'LIBYA',
  'ROMANIA',
  'BULGARIA',
  'UKRAINE',
  'INDIA',
  'PAKISTAN',
  'KENYA',
  'DJIBOUTI',
  'SOMALIA',
  'TANZANIA',
];

const s = (x) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim();

/** DD/MM/YYYY 或 YYYY-MM-DD → ISO（YYYY-MM-DD）；解析不了返回 '' */
export function akkonDate(v) {
  const t = s(v);
  if (!t) return '';
  let m = t.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    return `${m[3]}-${mo}-${d}`;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}

/** 是否箱号形态（4 字母 + 6~7 位数字，允许 -校验位 后缀；Akkon 站上写作 CAAU######-3） */
export function looksLikeContainer(num) {
  return /^[A-Za-z]{4}\d{6,7}(-\d)?$/.test(s(num).replace(/\s+/g, ''));
}

/** 表格行 → 统一结构（纯函数，便于离线单测） */
export function parseAkkonRows(rows, number) {
  const today = new Date().toISOString().slice(0, 10);
  const out = {
    ok: false,
    number,
    carrier: 'akkon',
    docNum: '',
    origin: '',
    destination: '',
    vessel: '',
    voyage: '',
    status: '',
    lastUpdate: null,
    containers: [],
    events: [],
    raw: { rows: [] },
    error: null,
    errorKind: null,
  };
  const list = (rows || []).filter((r) => r && (r.bl || r.container));
  if (!list.length) {
    out.error = 'Akkon 官网无此号记录（该站按起运港国家分区检索，工具已逐区试过）';
    out.errorKind = 'not-found';
    return out;
  }

  out.ok = true;
  out.docNum = s(list[0].bl) || number;
  out.origin = s(list[0].pol);
  out.destination = s(list[0].pod);
  out.vessel = s(list[0].vessel);
  out.voyage = s(list[0].voyage);
  out.raw = { rows: list };

  const events = [];
  const seen = new Set();
  for (const r of list) {
    const ct = s(r.container) || '';
    const ets = akkonDate(r.ets);
    const eta = akkonDate(r.eta);
    const finalEta = akkonDate(r.finalEta);
    for (const [iso, activity, city] of [
      [ets, 'Departure (ETS)', s(r.pol)],
      [eta, 'Arrival (ETA)', s(r.pod)],
      [finalEta, 'Final Delivery (ETA)', s(r.finalDestination)],
    ]) {
      if (!iso) continue;
      const key = `${ct}|${iso}|${activity}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({
        time: iso,
        activity,
        city,
        terminal: '',
        vessel: s(r.vessel),
        voyage: s(r.voyage),
        timeType: iso > today ? 'EXPECTED' : 'ACTUAL',
        container: ct,
      });
    }
    if (ct) {
      const exists = out.containers.find((c) => c.num === ct);
      if (!exists) {
        out.containers.push({
          num: ct,
          size: '',
          type: '',
          status: '',
          lastUpdate: null,
          events: events.filter((e) => e.container === ct),
        });
      }
    }
  }
  events.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  out.events = events;
  out.lastUpdate = events.length ? events[events.length - 1].time : null;
  return out;
}

/** 关掉站点弹窗（#customModal 会挡住后续点击） */
async function closeModal(page) {
  try {
    const shown = await page.locator('#customModal.show').count();
    if (!shown) return;
    // 优先点弹窗里的按钮，其次调用站点自带的 closeModal()
    const btn = page.locator('#customModal button').first();
    if (await btn.count()) await btn.click({ timeout: 3000 }).catch(() => {});
    await page.evaluate(() => { try { window.closeModal && window.closeModal(); } catch { /* ignore */ } }).catch(() => {});
    await sleep(300);
  } catch { /* 关不掉不影响主流程 */ }
}

/** 读结果：有表格 = 命中；有 "Not Found" 弹窗 = 未命中 */
async function readResult(page) {
  const rows = [];
  const table = page.locator('#UpdatePanel1 table');
  const hasTable = (await table.count()) > 0;
  if (hasTable) {
    const data = await page.evaluate(() => {
      const t = document.querySelector('#UpdatePanel1 table');
      if (!t) return [];
      const heads = [...t.querySelectorAll('thead th, tr:first-child th')].map((x) => x.textContent.trim());
      const trs = [...t.querySelectorAll('tbody tr, tr')].filter((tr) => tr.querySelector('td'));
      const pick = (cells, name) => {
        const i = heads.findIndex((h) => h.toLowerCase() === name.toLowerCase());
        return i >= 0 && cells[i] ? cells[i].textContent.trim() : '';
      };
      return trs.map((tr) => {
        const cells = [...tr.querySelectorAll('td')];
        const obj = {
          bl: pick(cells, 'Akkon BL No'),
          container: pick(cells, 'Container No'),
          vessel: pick(cells, 'Vessel Name'),
          voyage: pick(cells, 'Voyage'),
          pol: pick(cells, 'Port Of Loading'),
          ets: pick(cells, 'ETS'),
          pod: pick(cells, 'Port Of Discharge'),
          eta: pick(cells, 'ETA'),
          finalDestination: pick(cells, 'Final Destination'),
          finalEta: pick(cells, 'Final ETA'),
        };
        // 表头名对不上时（站点改列名）退回按位置取
        if (!obj.bl && cells[0]) {
          obj.bl = cells[0].textContent.trim();
          obj.container = (cells[1] || {}).textContent?.trim() || '';
          obj.vessel = (cells[2] || {}).textContent?.trim() || '';
          obj.voyage = (cells[3] || {}).textContent?.trim() || '';
          obj.pol = (cells[4] || {}).textContent?.trim() || '';
          obj.ets = (cells[5] || {}).textContent?.trim() || '';
          obj.pod = (cells[6] || {}).textContent?.trim() || '';
          obj.eta = (cells[7] || {}).textContent?.trim() || '';
          obj.finalDestination = (cells[10] || {}).textContent?.trim() || '';
          obj.finalEta = (cells[11] || {}).textContent?.trim() || '';
        }
        return obj;
      });
    }).catch(() => []);
    if (Array.isArray(data)) rows.push(...data);
    return { hit: rows.length > 0, rows, modal: '' };
  }
  const modal = await page.locator('#modalBody').innerText().catch(() => '');
  const title = await page.locator('#modalTitle').innerText().catch(() => '');
  return { hit: false, rows: [], modal: `${s(title)} ${s(modal)}`.trim() };
}

/**
 * 主入口：BL/Booking → 遍历国家查；箱号 → 明确报「需要提单号」
 * @param {string} number BL/Booking（14 位）或箱号
 * @param {{timeoutMs?: number, ctx?: any, country?: string}} opts
 */
export async function trackAkkon(number, { timeoutMs = 60000, ctx: sharedCtx, country } = {}) {
  const raw = s(number).toUpperCase();
  if (!raw) throw new Error('缺少单号');
  if (looksLikeContainer(raw)) {
    // 网站实测：不填 BL 只填箱号会被服务器拒绝（"Enter your BL Number.!"）
    const e = new Error('Akkon 不支持仅凭箱号查询：请提供 14 位提单/订舱号（BL/Booking No）');
    e.code = 'need-bl';
    throw e;
  }
  if (raw.length !== 14) {
    const e = new Error(`Akkon 单号必须 14 位（当前 ${raw.length} 位）：${raw}`);
    e.code = 'bad-format';
    throw e;
  }

  const ctx = sharedCtx || (await launch({ headless: true }));
  const page = ctx.pages()[0] || (await ctx.newPage());
  const ownCtx = !sharedCtx;

  const deadline = Date.now() + Math.min(deadlineMs, Math.max(timeoutMs * 4, 60000));
  const countries = country ? [country, ...COUNTRIES.filter((c) => c !== country)] : COUNTRIES;

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);

    // 站点真实存在的国家选项（避免 selectOption 失败）
    const available = (await page.locator('#ddlCountry option').allTextContents().catch(() => []))
      .map((t) => t.trim())
      .filter((t) => t && !/^--/.test(t));
    const tryList = countries.filter((c) => available.includes(c));
    if (!tryList.length) throw new Error(`Akkon 起运国列表为空（页面改版？）: ${available.slice(0, 5).join('/')}`);

    let lastModal = '';
    let lastErr = '';
    // 每一步的错误都记下来：页面改版导致元素消失时，不能只报「未找到」而掩盖真实原因
    const step = async (label, fn) => {
      try {
        await fn();
        return true;
      } catch (e) {
        lastErr = `${label}: ${String((e && e.message) || e).slice(0, 120)}`;
        return false;
      }
    };

    for (const c of tryList) {
      if (Date.now() > deadline) throw new Error(`Akkon 查询超时（已试 ${tryList.indexOf(c)} 个国家）`);
      await closeModal(page);
      await step('selectCountry', () => page.selectOption('#ddlCountry', { label: c }));
      await step('fillBL', () => page.fill('#TextBox1', raw));
      await step('clickSearch', () => page.click('#Button1', { timeout: 15000 }));
      // 等结果表格或"未找到"弹窗
      const ok = await page
        .waitForFunction(
          () => document.querySelector('#UpdatePanel1 table') || document.querySelector('#customModal.show'),
          { timeout: 20000 },
        )
        .then(() => true)
        .catch(() => false);
      if (!ok && !lastErr) lastErr = `waitResult: 20s 内既无表格也无弹窗（起运国 ${c}）`;
      await sleep(ok ? 400 : 800);
      const r = await readResult(page);
      if (r.hit) {
        const parsed = parseAkkonRows(r.rows, raw);
        parsed.country = c;
        parsed.searchedCountries = tryList.slice(0, tryList.indexOf(c) + 1);
        return parsed;
      }
      lastModal = r.modal || lastModal;
      await closeModal(page);
    }

    // 所有国家都没命中
    const out = parseAkkonRows([], raw);
    out.country = null;
    out.searchedCountries = tryList;
    out.error =
      `Akkon 未找到（已试 ${tryList.length} 个起运国）` +
      (lastModal ? `：${lastModal}` : '') +
      (lastErr ? `（最后错误：${lastErr}）` : '');
    return out;
  } finally {
    if (ownCtx) await ctx.close().catch(() => {});
  }
}

export default trackAkkon;
