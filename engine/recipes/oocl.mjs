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

    const pickPort = async (ngModel, word) => {
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

    // 词典词（如 "istanbul turkey cy"）→ 取首词让 dropdown 搜，回车补全（OOCL 候选对纯城市名最稳）
    const oWord = (q.originText || '').split(/[,/]/)[0].trim().split(/\s+/)[0];
    const dWord = (q.destText || '').split(/[,/]/)[0].trim().split(/\s+/)[0];
    const oPicked = await pickPort('user.origin', oWord);
    if (!oPicked) throw new Error('起运候选未出');
    const dPicked = await pickPort('user.destination', dWord);
    if (!dPicked) throw new Error('目的候选未出');

    // 点 Search（页面底部主按钮）
    const fired = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button, a')].find((x) => /^search$/i.test((x.textContent || '').trim()) && x.offsetParent !== null);
      if (b) { b.click(); return true; }
      return false;
    });
    if (!fired) throw new Error('没找到 Search 按钮');
    await H.sleep(12000);

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
        if (vessel) rows.push({ from, etdRaw, to, etaRaw, days, vessel, voyage });
        if (rows.length >= 12) break;
      }
      return { n: (document.body.innerText.match(/Search Result: (\d+)/) || [])[1], rows };
    }).catch(() => ({ n: 0, rows: [] }));

    if (!rows.rows || !rows.rows.length) {
      const total = rows.n ? `Search Result: ${rows.n}（解析失败）` : '结果为空';
      return { msg: `已填 ${oPicked.split(',')[0]} → ${dPicked.split(',')[0]} 并点搜索；${total}` };
    }
    const MON = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const fmt = (s) => { const m = /^(\d{1,2}) ([A-Z][a-z]{2}) \((...)\)$/.exec(s); return m ? `${new Date().getFullYear()}-${MON[m[2]]}-${String(m[1]).padStart(2, '0')}` : s; };
    const schedules = rows.rows.map((r) => ({
      vessel: r.vessel, voyage: r.voyage, etd: fmt(r.etdRaw), eta: fmt(r.etaRaw),
      transitDays: r.days, via: '', direct: true,
    }));
    return { status: 'done', schedules, msg: `已查到 ${schedules.length} 条：` + schedules.slice(0, 3).map((r) => `${r.vessel} ${r.voyage} ${r.etd} → ${r.eta} ${r.transitDays}天`).join(' ｜ ') };
  },
};
