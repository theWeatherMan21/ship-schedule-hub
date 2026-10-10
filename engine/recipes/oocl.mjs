// OOCL —— moc.oocl.com Angular SPA（9-24 全链路实测）
// 表单：input[ng-model="user.origin"/"user.destination"]（commonLookupInput 组件）
// 候选：ul.th-dropdown-menu li；选中文本 "Ningbo, Ningbo, Zhejiang, China CY"
// 查询：POST mocss/secured/supportData/nsso/searchHubToHubRoute（页面自己发，结果 ag-grid 渲染）
// 结果 innerText 模式：Ningbo 29 Sep (Tue) CY ... Istanbul 12 Nov (Thu) 44 day(s) ... EM1 TEXAS TRIUMPH 039W
export default {
  id: 'oocl',
  name: 'OOCL 东方海外',
  code: 'OOCL',
  kind: 'dom',
  entry: 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US',
  urls: ['https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US'],
  async run(page, q, H) {
    // 等 angular 表单（渲染偶发慢，最多 36s）
    let ok = false;
    for (let i = 0; i < 12; i++) {
      await H.sleep(3000);
      ok = await page.evaluate(() => document.querySelectorAll('input[ng-model="user.origin"]').length > 0).catch(() => false);
      if (ok) break;
    }
    if (!ok) throw new Error('OOCL 表单未渲染');
    await H.dismissCookies(page).catch(() => {});
    if (await H.isBlockPage(page)) throw new Error('被拦截');

    const pickPortOnce = async (ngModel, word) => {
      const inp = page.locator(`input[ng-model="${ngModel}"]`);
      await inp.click({ timeout: 15000 });
      await inp.fill('').catch(() => {});
      await page.keyboard.type(word, { delay: 90 });
      await H.sleep(7000);
      const picked = await page.evaluate((w) => {
        const lists = [...document.querySelectorAll('ul')].filter((l) => l.offsetParent !== null && /th-dropdown-menu/.test(l.className) && l.querySelectorAll('li').length);
        if (!lists.length) return null;
        const li = [...lists[0].querySelectorAll('li')].find((x) => new RegExp(w.split(/\s+/)[0], 'i').test(x.textContent || ''));
        if (!li) return null;
        const t = (li.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
        (li.querySelector('a, span') || li).click();
        return t;
      }, word).catch(() => null);
      await H.sleep(2000);
      return picked;
    };

    // 词典词（如 "istanbul turkey cy"）→ 取首词让 dropdown 搜（OOCL 候选对纯城市名最稳）
    const firstTok = (x) => String(x || '').split(/[,/]/)[0].trim().split(/\s+/)[0];
    // 多种写法依次试：船司词 → 纯港名 → Name (LOCODE) → 用户原词
    const pickPort = async (ngModel, words) => {
      const list = (Array.isArray(words) ? words : [words]).map(firstTok).filter((x, i, a) => x && a.indexOf(x) === i);
      for (const w of list) { const r = await pickPortOnce(ngModel, w); if (r) return r; }
      return null;
    };
    const oPicked = await pickPort('user.origin', (q.originVariants || [q.originText]));
    if (!oPicked) throw new Error('起运候选未出');
    const dPicked = await pickPort('user.destination', (q.destVariants || [q.destText]));
    if (!dPicked) throw new Error('目的候选未出');

    // 结果窗口：官网默认 user.weeks=2（2 周）→ 这条线只有 3 条（用户报「条数太少」）。
    // 页面 select[ng-model="user.weeks"] 可选 2-12 周。实测（宁波→伊斯坦布尔）：
    //   weeks=2 → 3 条 ｜ weeks=6 → 6 条 ｜ weeks=12 → 11 条   ⇒ 取上限 12。
    const weeks = String(process.env.SSH_OOCL_WEEKS || '12');
    try {
      const sel = page.locator('select[ng-model="user.weeks"]');
      await sel.selectOption(weeks, { timeout: 10000 });
      await H.sleep(1800);
      // 回读校验（Angular 有时不认程序化赋值）
      const got = await page.evaluate(() => document.querySelector('select[ng-model="user.weeks"]')?.value || '');
      if (got !== weeks) console.error(`[oocl] weeks 期望 ${weeks} 实际 ${got}`);
    } catch (e) {
      console.error('[oocl] weeks 设置失败:', e.message);
    }

    // 点 Search（页面底部主按钮）
    const fired = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button, a')].find((x) => /^search$/i.test((x.textContent || '').trim()) && x.offsetParent !== null);
      if (b) { b.click(); return true; }
      return false;
    });
    if (!fired) throw new Error('没找到 Search 按钮');
    await H.sleep(12000);

    if (process.env.SSH_DUMP_DOM === 'oocl') {
      try {
        const full = await page.evaluate(() => document.body.innerText).catch(() => '');
        (await import('node:fs')).writeFileSync('/tmp/dom-oocl.txt', full);
        console.error('[oocl] DOM 已写');
      } catch { /* 忽略 */ }
    }
    // 抓 ag-grid 结果（9-24 实测行结构，行级解析比长正则稳）：
    // Ningbo / 29 Sep (Tue) / CY / Schedule Details / CY / Istanbul / 12 Nov (Thu) / 44 day(s) / Cutoff... / Dry/Reefer / EM1 / (空行) / TEXAS TRIUMPH 039W
    const rows = await page.evaluate(() => {
      const lines = document.body.innerText.split('\n').map((x) => x.trim());
      const dateRe = /^\d{1,2} [A-Z][a-z]{2} \([A-Z][a-z]{2}\)$/;
      const dayRe = /^(\d+) day\(s\)$/;
      const rows = [];
      for (let i = 0; i < lines.length; i++) {
        if (!dateRe.test(lines[i])) continue;
        // lines[i]=ETD 日期；往前找起运港名，往后找目的港+ETA
        const etdRaw = lines[i];
        const from = (lines[i - 1] || '').trim();
        // 往后找 day(s)
        let j = i + 1, etaRaw = '', to = '', days = '';
        for (let k = i + 1; k < Math.min(i + 8, lines.length); k++) {
          if (dateRe.test(lines[k])) { etaRaw = lines[k]; to = (lines[k - 1] || '').trim(); }
          const dm = dayRe.exec(lines[k]);
          if (dm) { days = dm[1]; j = k; break; }
        }
        if (!days || !etaRaw) continue;
        // 往后 12 行内找 "船名 航次"（大写船名+航次码）
        let vessel = '', voyage = '';
        for (let k = j; k < Math.min(j + 14, lines.length); k++) {
          const vm = /^([A-Z][A-Z0-9 .&'-]{3,28}) (\d{1,3}[A-Z]{1,2}\d{0,2})$/.exec(lines[k].trim());
          if (vm) { vessel = vm[1].trim(); voyage = vm[2]; break; }
        }
        if (vessel) {
          // 截单时间就在同一张卡里（innerText: "CY Cutoff: 10 Oct (Sat) 23:00" / "SI Cutoff: ..."）——婉宜 9-30
          const cutoffs = {};
          for (let k = j; k < Math.min(j + 16, lines.length); k++) {
            const ctm = /^([A-Za-z][A-Za-z /]{0,15}?)\s*Cutoff:\s*(.+)$/i.exec(lines[k]);
            if (ctm) cutoffs[`${ctm[1].trim()} 截单`] = ctm[2].trim();
          }
          rows.push({ from, etdRaw, to, etaRaw, days, vessel, voyage, cutoffs });
        }
        if (rows.length >= 12) break;
      }
      const bodyTxt = document.body.innerText || '';
      return {
        n: (bodyTxt.match(/Search Result: (\d+)/) || [])[1],
        // ★ 10-10：OOCL 滑块验证码失败时页面无结果也无计数——之前笼统报"解析失败"，误导。
        captcha: /captcha|verification|slider|drag the|拼图|请完成/i.test(bodyTxt) || !!document.querySelector('[class*="captcha"],[id*="captcha"]'),
        rows,
      };
    }).catch(() => ({ n: '', rows: [], captcha: false }));

    if (!rows.rows || !rows.rows.length) {
      // ★ 10-10 如实分级（爹地："零点几也是失败要诚实"）：验证码拦 ≠ 解析失败 ≠ 无服务
      let total;
      if (rows.captcha) total = 'Blocked by human verification (intermittent — auto-retried; try again later)';
      else if (rows.n === '0') total = 'Search Result: 0 (site reports no service on this route)';
      else if (rows.n) total = `Search Result: ${rows.n} (rows not parsed)`;
      else total = 'Results page did not render';
      return { msg: `Filled ${oPicked.split(',')[0]} → ${dPicked.split(',')[0]}, searched; ${total}` };
    }
    const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    // 年份推断：页面只给「10 Dec (Thu)」没有年份。原来写死「今年」，一旦窗口跨年
    // （12 周窗口必然跨年）就会把 2027-01-16 显示成 2026-01-16（用户能一眼看出的错）。
    // 现在按参照时间往前滚：ETD 参照今天（允许 7 天回溯），ETA 参照 ETD。
    const YEAR = new Date().getFullYear();
    const stamp = (s, refMs) => {
      const m = /^(\d{1,2}) ([A-Z][a-z]{2})/.exec(s || '');
      const mo = m && MON[m[2]];
      if (!mo) return '';
      const dd = String(m[1]).padStart(2, '0');
      for (let y = YEAR; y <= YEAR + 2; y++) {
        const ms = Date.parse(`${y}-${mo}-${dd}T00:00:00Z`);
        if (!Number.isFinite(ms)) break;
        if (ms >= refMs - 7 * 864e5) return `${y}-${mo}-${dd}`;
      }
      return `${YEAR}-${mo}-${dd}`;
    };
    const schedules = rows.rows.map((r) => {
      const etd = stamp(r.etdRaw, Date.now());
      const eta = stamp(r.etaRaw, etd ? Date.parse(etd + 'T00:00:00Z') : Date.now());
      return {
        vessel: r.vessel, voyage: r.voyage, etd, eta, transitDays: r.days, via: '', direct: true,
        detail: Object.keys(r.cutoffs || {}).length
          ? { service: '', routing: 'Direct', co2: '', legs: [], cutoffs: r.cutoffs }
          : undefined,
      };
    }).sort((a, b) => (a.etd > b.etd ? 1 : -1));
    return { status: 'done', schedules, msg: `Found ${schedules.length} schedules: ` + schedules.slice(0, 3).map((r) => `${r.vessel} ${r.voyage} ${r.etd} → ${r.eta} ${r.transitDays} days`).join(' | ') };
  },
};
