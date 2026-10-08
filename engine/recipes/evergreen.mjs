// Evergreen 长荣 —— 主页 Sailing Schedules 小部件 + Search by Point 结果页（9-24 实测）
// 主页字段：#txt_schedule_ori_name / #txt_schedule_dest_name（autocomplete，候选点击后回写全称
//   "NINGBO, CHINA (CNNGB) [ZIP:315000]"，隐藏域 txt_schedule_ori=CNNBO/dest=TRIST）→ #schedule_btn 整页跳转
// 结果页：ss.shipmentlink.com TVS2_InteractiveScheduleRouting.jsp，表格每行：
//   NINGBO, CHINA\n<ETD> HH:MM\n<服务 BEX/MD2> ISTANBUL ISTANBUL <transit天数> Details\n---- <cutOff> ----\n<vessel voyage> <ETA> ----
// 9-24 Istanbul 实测 8 条（BEX 34/35/37/38、MD2 38/39/46/47 天）
export default {
  id: 'evergreen',
  name: 'Evergreen 长荣',
  code: 'EGLV',
  kind: 'dom',
  entry: 'https://www.shipmentlink.com/',
  urls: ['https://www.shipmentlink.com/', 'https://www.shipmentlink.com/tvs2/jsp/TVS2_JspIndex.jsp'],
  async run(page, q, H) {
    await H.dismissCookies(page); // Accept All
    if (await H.isBlockPage(page)) throw new Error('被拦截');

    const origin = page.getByRole('textbox', { name: /^Origin$/i }).first();
    await origin.waitFor({ state: 'visible', timeout: 20000 });

    // autocomplete：打词典词 → 点含 LOCODE 的候选（9-24 实测回写 "NINGBO, CHINA (CNNGB) [ZIP:...]"）
    const pickEvg = async (sel, word, locode) => {
      const inp = page.locator(sel);
      await inp.click({ timeout: 8000 }).catch(() => {});
      await inp.fill('').catch(() => {});
      await inp.type(String(word).toLowerCase(), { delay: 80 }).catch(() => { try { inp.pressSequentially(String(word).toLowerCase(), { delay: 80 }); } catch {} });
      let picked = null;
      for (let i = 0; i < 14; i++) {
        await H.sleep(1000);
        const found = await page.evaluate((want) => {
          const wantU = String(want).toUpperCase();
          const els = [...document.querySelectorAll('li, [class*="menu"] li, [class*="autocomplete"] li, [class*="suggest"] li, [class*="ui-menu"] li, [class*="dropdown"] li')]
            .filter((el) => el.offsetParent && (el.innerText || '').toUpperCase().includes(wantU) && (el.innerText || '').trim().length > 3);
          if (els.length) {
            let best = els[0];
            for (const e of els) { if (e.contains(best)) best = e; }   // 最内层
            const t = best.innerText.trim().replace(/\s+/g, ' ').slice(0, 60);
            best.click();
            return t;
          }
          return null;
        }, locode).catch(() => null);
        if (found) { picked = found; break; }
      }
      return picked;
    };

    // Evergreen 特例：打纯词（词典串 "ningbo china cnngb" 无候选，9-22/9-24 双实测）——取第一段地名
    const clean = (t) => {
      const s = String(t);
      if (s.includes('(')) return s.split('(')[0].trim();
      return s.trim().split(/\s+/)[0];
    };
    const oWord = clean(q.originText) || q.originText;
    const dWord = clean(q.destText) || q.destText;
    const pO = await pickEvg('#txt_schedule_ori_name', oWord, q._o?.locode || 'CNNGB');
    if (!pO) throw new Error(`起运港候选未出（${oWord}），仅开页`);
    await H.sleep(600);
    const pD = await pickEvg('#txt_schedule_dest_name', dWord, q._d?.locode || 'TRIST');
    if (!pD) throw new Error(`目的港候选未出（${dWord}），仅开页`);
    // 回读验证隐藏域（txt_schedule_ori=CNNBO 等）
    const hid = await page.evaluate(() => ({
      o: document.getElementById('txt_schedule_ori')?.value || '',
      d: document.getElementById('txt_schedule_dest')?.value || '',
    })).catch(() => ({ o: '', d: '' }));
    if (!hid.o || !hid.d) throw new Error(`候选未生效（o=${hid.o || '空'} d=${hid.d || '空'}），仅开页`);

    await H.clickByText(page, /^\s*search\s*$/i);
    // 整页跳转到 ss.shipmentlink.com 结果页
    let text = '';
    for (let i = 0; i < 14; i++) {
      await H.sleep(2500);
      text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (/are as following|Port of Loading/i.test(text)) break;
    }
    if (!/Port of Loading/i.test(text)) throw new Error(`结果页未出现（len=${text.length}），可能预填丢失`);

    // ---- 结构化抽取（9-24 Istanbul 8 条实测）----
    const schedules = [];
    try {
      const norm = String(text).replace(/[ \t\xa0]+/g, ' ');
      if (process.env.SSH_DUMP_DOM === 'evergreen') {
        try {
          const fsmod = await import('node:fs');
          fsmod.writeFileSync('/tmp/dom-evergreen.txt', norm);
          // 表格结构（列对应关系只有按单元格读才准）
          const tables = await page.evaluate(() => [...document.querySelectorAll('table')].map((t) => [...t.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th,td')].map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim())))).catch(() => []);
          fsmod.writeFileSync('/tmp/dom-evergreen-table.json', JSON.stringify(tables, null, 1));
          console.error('[evergreen] DOM + 表格已写');
        } catch { /* 忽略 */ }
      }
      // 9-30 修：正则原来写死 NINGBO, CHINA / ISTANBUL —— 换起运/目的港就抽不到行（只能停在「已预填」）。
      // 改为按本次查询的港口名动态构造：取解析出的港名首词（大写），缺失则退化为通配。
      const cityPat = (name) => {
        const s = String(name || '').toUpperCase().replace(/[^A-Z ]/g, ' ').trim().split(/\s+/)[0];
        return s && s.length >= 3 ? s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : "[A-Z][A-Z ,.'/-]{2,30}";
      };
      const oPat = cityPat(q._o?.name || q.originText);
      const dPat = cityPat(q._d?.name || q.destText);
      const cardRe = new RegExp(`${oPat}[A-Z ,.']*\\n([A-Z]{3}-\\d{2}-\\d{4}) \\d{2}:\\d{2}\\n ?(\\w+) ?\\n?${dPat}[A-Z ,]*\\n?([A-Z ]+)?\\n?(\\d+) ?\\n?Details ?\\n---- ?\\n?([A-Z]{3}-\\d{2}-\\d{4}) ?\\n?----\\n ?([^\\n]+?) ?\\n`, 'gi');
      let cm;
      while ((cm = cardRe.exec(norm)) !== null && schedules.length < 12) {
        // cm[6] = "CSCL VENUS 090W NOV-05-2026 ----"（vessel voyage + ETA + ----）
        const vm = /^\s*(.+?)\s*((?:\d{3,4}-)?\d{2,4}[W E])\s+([A-Z]{3}-\d{2}-\d{4})/.exec(cm[6]);
        const fmt = (s) => { const m = /^([A-Z]{3})-(\d{2})-(\d{4})$/.exec(s); return m ? `${m[3]}-${{ JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' }[m[1]]}-${m[2]}` : s; };
        // 9-30 修真 bug（婉宜）：cm[1]（如 OCT-10-2026 20:00）**不是开船日，是 Port Cut Off Date**！
        // 证据：官网 Transit Time 列反推 —— OCT-10→NOV-14=35 天但官网写 33；用 cm[5]+日期(OCT-12)→NOV-14=33 ✓
        // （另一行 OCT-08→NOV-12=35 ✓ 也与官网一致）。真正的开船日在 cm[5]。
        const tail = norm.slice(cm.index, cm.index + 420);
        const cutTimes = [...tail.matchAll(/([A-Z]{3}-\d{2}-\d{4} \d{2}:\d{2})/g)].map((x) => x[1]);
        const cutoffs = {};
        if (cutTimes[0]) cutoffs['港口截关（Port Cut Off）'] = cutTimes[0];
        if (cutTimes[1]) cutoffs['VGM（EDI/WEB/APP）'] = cutTimes[1];
        schedules.push({
          vessel: vm ? vm[1].trim() : cm[6].trim(),
          voyage: vm ? vm[2].trim() : '',
          etd: fmt(cm[5]),                        // ← 真开船日（原来错用 cm[1] = 截单日期）
          eta: fmt(vm ? vm[3] : cm[5]),
          transitDays: Number(cm[4]) || cm[4],
          via: '',
          direct: true,   // 结果表未显示中转列（宁波→伊斯坦布尔挂直挂），不编造
          detail: Object.keys(cutoffs).length
            ? { service: (cm[2] || '').trim(), routing: 'Direct', co2: '', legs: [], cutoffs }
            : undefined,
        });
      }
    } catch { /* 抽取失败 → 保持 prefilled */ }

    // 逐段航程：官网每班下面还有一张「航程明细表」（No.|From|To|Departure|Arrival|Service|Vessel Voyage|天数），
    // 按 DOM 顺序与上面的班次一一对应（有中转的班次会出现多段，如 宁波→比雷埃夫斯→伊斯坦布尔）——婉宜 9-30
    if (schedules.length) {
      try {
        const groups = await page.evaluate(() => {
          const out = [];
          for (const t of document.querySelectorAll('table')) {
            const rows = [...t.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('td,th')]
              .map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim()));
            const head = rows.slice(0, 3).map((r) => r.join(' ')).join(' ');
            if (!/Vessel Voyage/.test(head) || !/Location/.test(head)) continue;   // 只认「航程明细表」
            // 主结果表也是 8+ 列且含 From/To —— 必须再区分：航程明细表的数据行**恰好 8 格**
            // （序号|From|To|Departure|Arrival|Service|Vessel Voyage|天数）；主表每行 10+ 格。
            // 不加这条会把主表也收进来，导致与班次的配对整体错位一格（实测踩过）。
            const dataRows = rows.filter((r) => /^\d+$/.test(r[0] || ''));
            if (!dataRows.length || !dataRows.every((r) => r.length === 8)) continue;
            const legs = [];
            for (const r of dataRows) {
              // 数据行：[序号, From, To, Departure, Arrival, Service, Vessel Voyage, 天数]
              if (r.length < 8 || !/^\d+$/.test(r[0])) continue;
              const dep = /([A-Z]{3})-(\d{2})-(\d{4})/.exec(r[3] || '');
              const arr = /([A-Z]{3})-(\d{2})-(\d{4})/.exec(r[4] || '');
              const MON2 = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
              const f = (m) => (m ? `${m[3]}-${MON2[m[1]]}-${m[2]}` : '');
              const vesselRaw = (r[6] || '').trim();
              const vm = /^(.+?)\s+((?:\d{3,4}-)?\d{2,4}[W E])\s*$/.exec(vesselRaw);
              legs.push({
                seq: Number(r[0]) || legs.length + 1,
                from: r[1] || '', fromCode: '', fromTerminal: '',
                etd: f(dep),
                to: r[2] || '', toCode: '', toTerminal: '',
                eta: f(arr),
                vessel: vm ? vm[1].trim() : vesselRaw,
                service: r[5] || '',
                co2: '', calls: [],
              });
            }
            if (legs.length) out.push(legs);
          }
          return out;
        }).catch(() => []);
        // 官网每张航程明细表在 DOM 里存在**两份**（隐藏 + 可见副本，实测 table 14/15、16/17 完全相同）
        // → 先去重；再用「数量必须一一对应」做最后一道保险：对不上就整批不显示，
        // 宁可不给航程，也不给错位的航程（配错一位用户根本看不出来）。
        const uniq = [];
        for (const g of groups) {
          const key = JSON.stringify(g);
          if (!uniq.length || JSON.stringify(uniq[uniq.length - 1]) !== key) uniq.push(g);
        }
        if (uniq.length === schedules.length) {
          uniq.forEach((legs, i) => {
            const s = schedules[i];
            if (!s || !legs.length) return;
            s.detail = s.detail || { service: '', routing: '', co2: '', legs: [], cutoffs: {} };
            s.detail.legs = legs;
            s.detail.routing = legs.length > 1 ? 'Via' : 'Direct';
            if (!s.detail.service) s.detail.service = legs[0].service || '';
            s.direct = legs.length <= 1;
          });
        } else {
          console.error(`[evergreen] 航程明细表数量(${uniq.length})与班次数(${schedules.length})不一致 → 不挂航程（避免错位）`);
        }
      } catch { /* 航程明细拿不到不影响主流程 */ }
    }

    const msg = `已填 ${q.originText} → ${q.destText} 并搜索` +
      (schedules.length ? `，${schedules.length} 条船期：` + schedules.slice(0, 3).map((r) => `${r.vessel} ${r.voyage} ETD ${r.etd} → ${r.eta} ${r.transitDays}天`).join(' ｜ ') : '');
    if (schedules.length) return { msg, schedules };
    return { msg: `已填 ${q.originText} → ${q.destText} 并搜索（结果页无结构化船期行）` };
  },
};
