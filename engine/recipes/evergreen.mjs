// Evergreen 长荣 —— 2026-10-09 改版重写（旧 tvs2 首页小部件已下线：TVS2_JspIndex.jsp = 404）
// 入口：ss.shipmentlink.com/tvs2/jsp/TVS2_InteractiveSchedule.jsp （Sailing Schedule › Search by Point）
// 字段：起运 #tvs2OriAC / 目的 #tvs2DesAC（自定义 ecType="AutoComplete" 组件，候选渲染在 #tuf1ac_tat_table 表格里）
//   候选必须用**真实鼠标事件**点击（DOM click 不触发它的 afterComplete，隐藏域不写、提交无效 —— 10-09 实测）
// 提交：input[value="Submit"] → 整页跳 TVS2_InteractiveScheduleRouting.jsp
// 结果表结构（两行一条，10-09 实测宁波→阿什杜德）：
//   行A：No.|Place of Receipt|Port of Loading|Port Cut Off Date|Service|Port of Discharge|Place of Delivery|Transit Time(days)|Routing Details|Remark
//   行B：Departure Date|(ETD)|VGM via Hard Copy|(Vessel Voyage)|Arrival Date|(ETA)
export default {
  id: 'evergreen',
  name: 'Evergreen 长荣',
  code: 'EGLV',
  kind: 'dom',
  entry: 'https://ss.shipmentlink.com/tvs2/jsp/TVS2_InteractiveSchedule.jsp',
  urls: ['https://ss.shipmentlink.com/tvs2/jsp/TVS2_InteractiveSchedule.jsp'],
  async run(page, q, H) {
    await H.dismissCookies(page); // Accept All
    if (await H.isBlockPage(page)) throw new Error('被拦截');

    // 直达改版后的查询页（entry 已是它；万一停在首页也强制过去）
    if (!/TVS2_InteractiveSchedule\.jsp/i.test(page.url())) {
      await page.goto('https://ss.shipmentlink.com/tvs2/jsp/TVS2_InteractiveSchedule.jsp', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
    }
    // 等字段出现
    let fieldOk = false;
    for (let i = 0; i < 12; i++) { await H.sleep(1200); fieldOk = (await page.locator('#tvs2OriAC').count()) > 0; if (fieldOk) break; }
    if (!fieldOk) throw new Error('查询页未加载出港口字段，仅开页');

    const clean = (t) => {
      const s = String(t || '');
      if (s.includes('(')) return s.split('(')[0].trim();
      return s.trim().split(/\s+/)[0];
    };
    // 依次试一组写法（船司词 → 纯港名 → Name (LOCODE) → 用户原词）；候选按 LOCODE（含同组港码）认
    const pick = async (inputId, words, codes) => {
      const want = (Array.isArray(codes) ? codes : [codes]).map((x) => String(x).toUpperCase()).filter(Boolean);
      if (!want.length) return null;
      const list = (Array.isArray(words) ? words : [words]).map((x) => clean(x) || x).filter((x, i, a) => x && a.indexOf(x) === i);
      const inp = page.locator('#' + inputId);
      for (const w of list) {
        await inp.click({ timeout: 6000 }).catch(() => {});
        await inp.fill('').catch(() => {});
        await inp.type(String(w).toLowerCase(), { delay: 120 }).catch(() => { try { inp.pressSequentially(String(w).toLowerCase(), { delay: 120 }); } catch { /* no-op */ } });
        for (let i = 0; i < 7; i++) {
          await H.sleep(900);
          const pos = await page.evaluate(({ want, wantAlt }) => {
            const tb = document.querySelector('#tuf1ac_tat_table');
            if (!tb) return null;
            for (const el of tb.querySelectorAll('tr,td,div')) {
              const t = (el.innerText || '').toUpperCase();
              if (!el.offsetParent || t.length > 140) continue;
              if (!want.some((c) => t.includes(c)) && !wantAlt.some((c) => t.includes(c))) continue;
              const b = el.getBoundingClientRect();
              if (b.width < 20 || b.height < 8) continue;
              return { x: b.x + 18, y: b.y + b.height / 2, t: ((el.textContent || el.innerText || '') + '').trim().replace(/\s+/g, ' ').slice(0, 60) };
            }
            return null;
          }, { want, wantAlt: want.map((c) => c.slice(2)) }).catch(() => null);
          if (pos) {
            // 真实鼠标点候选（DOM click 不生效 —— 10-09 实测）
            await page.mouse.move(pos.x, pos.y);
            await page.mouse.click(pos.x, pos.y);
            await H.sleep(1400);
            return pos.t;
          }
        }
      }
      return null;
    };
    const oCodes = (q.originCodes && q.originCodes.length) ? q.originCodes : [q._o?.locode || ''];
    const dCodes = (q.destCodes && q.destCodes.length) ? q.destCodes : [q._d?.locode || ''];
    const pO = await pick('tvs2OriAC', (q.originVariants || [q.originText]), oCodes);
    if (!pO) throw new Error(`起运港候选未出（${clean(q.originText) || q.originText}），仅开页`);
    await H.sleep(600);
    const pD = await pick('tvs2DesAC', (q.destVariants || [q.destText]), dCodes);
    if (!pD) throw new Error(`目的港候选未出（${clean(q.destText) || q.destText}），仅开页`);

    // 提交（新版按钮是 input[value=Submit]；老版按文案兜底）
    const sub = page.locator('input[value="Submit"]').first();
    if (await sub.count()) await sub.click({ timeout: 8000 }).catch(() => {});
    else await H.clickByText(page, /^\s*search\s*$/i);

    let text = '';
    for (let i = 0; i < 14; i++) {
      await H.sleep(2500);
      text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (/are as following|Port of Loading/i.test(text)) break;
    }
    if (/Maintenance/i.test(text) && !/Port of Loading/i.test(text)) {
      throw new Error('长荣官网维护中（官网原文：Due to System Maintenance…），暂无法查询');
    }
    if (!/Port of Loading/i.test(text)) throw new Error(`结果页未出现（len=${text.length}），可能预填丢失`);

    if (process.env.SSH_DUMP_DOM === 'evergreen') {
      try {
        const fsmod = await import('node:fs');
        fsmod.writeFileSync('/tmp/dom-evergreen.txt', String(text).replace(/[ \t\xa0]+/g, ' '));
        const tables = await page.evaluate(() => [...document.querySelectorAll('table')].map((t) => [...t.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th,td')].map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim())))).catch(() => []);
        fsmod.writeFileSync('/tmp/dom-evergreen-table.json', JSON.stringify(tables, null, 1));
        console.error('[evergreen] DOM + 表格已写');
      } catch { /* 忽略 */ }
    }

    // ---- 结构化抽取：按单元格读（两行一条），不再依赖整页文本顺序 ----
    const MON2 = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
    let schedules = [];
    try {
      schedules = await page.evaluate((MON2) => {
        const f = (s) => {
          const m = /([A-Z]{3})[-/ ](\d{1,2})[-/ ](\d{4})/.exec(String(s || '').toUpperCase());
          return m && MON2[m[1]] ? `${m[3]}-${MON2[m[1]]}-${String(m[2]).padStart(2, '0')}` : '';
        };
        const out = [];
        for (const t of document.querySelectorAll('table')) {
          const rows = [...t.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('td,th')].map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim()));
          if (!rows.some((r) => r.join('|').includes('Transit Time (days)'))) continue;   // 只认主结果表
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            if (!/^\d+$/.test(r[0] || '') || r.length < 8) continue;
            const nx = rows[i + 1] || [];
            const vesselVoy = (nx[3] || '').trim();
            const vm = /^(.+?)\s+((?:\d{3,4}-)?\d{2,4}[W E])\s*$/.exec(vesselVoy);
            const etd = f(nx[1]) || f(r[3]);
            const eta = f(nx[4]);
            const cutoff = /([A-Z]{3}-\d{2}-\d{4} \d{2}:\d{2})/.exec(r[3] || '');
            out.push({
              vessel: vm ? vm[1].trim() : vesselVoy,
              voyage: vm ? vm[2].trim() : '',
              etd, eta,
              transitDays: Number(r[7]) || r[7],
              via: '',
              direct: true,
              detail: {
                service: r[4] || '', routing: 'Direct', co2: '', legs: [],
                cutoffs: cutoff ? { '港口截关（Port Cut Off）': cutoff[1] } : {},
              },
            });
          }
          if (out.length) break;
        }
        return out.slice(0, 20);
      }, MON2).catch(() => []);
    } catch { /* 抽取失败 → 保持 prefilled */ }

    // 逐段航程（新版结构可能不同）：数量对不上就整批不挂，宁缺勿错位
    if (schedules.length) {
      try {
        const groups = await page.evaluate(() => {
          const out = [];
          for (const t of document.querySelectorAll('table')) {
            const rows = [...t.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('td,th')].map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim()));
            const head = rows.slice(0, 3).map((r) => r.join(' ')).join(' ');
            if (!/Vessel Voyage/.test(head) || !/Location/.test(head)) continue;
            const dataRows = rows.filter((r) => /^\d+$/.test(r[0] || ''));
            if (!dataRows.length || !dataRows.every((r) => r.length === 8)) continue;
            const MON2 = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
            const legs = [];
            for (const r of dataRows) {
              const dep = /([A-Z]{3})-(\d{2})-(\d{4})/.exec(r[3] || '');
              const arr = /([A-Z]{3})-(\d{2})-(\d{4})/.exec(r[4] || '');
              const f = (m) => (m ? `${m[3]}-${MON2[m[1]]}-${m[2]}` : '');
              const vesselRaw = (r[6] || '').trim();
              const vm = /^(.+?)\s+((?:\d{3,4}-)?\d{2,4}[W E])\s*$/.exec(vesselRaw);
              legs.push({
                seq: Number(r[0]) || legs.length + 1,
                from: r[1] || '', fromCode: '', fromTerminal: '', etd: f(dep),
                to: r[2] || '', toCode: '', toTerminal: '', eta: f(arr),
                vessel: vm ? vm[1].trim() : vesselRaw, service: r[5] || '', co2: '', calls: [],
              });
            }
            if (legs.length) out.push(legs);
          }
          return out;
        }).catch(() => []);
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
        }
      } catch { /* 航程明细拿不到不影响主流程 */ }
    }

    const msg = `已填 ${q.originText} → ${q.destText} 并搜索` +
      (schedules.length ? `，${schedules.length} 条船期：` + schedules.slice(0, 3).map((r) => `${r.vessel} ${r.voyage} ETD ${r.etd} → ${r.eta} ${r.transitDays}天`).join(' ｜ ') : '');
    if (schedules.length) return { msg, schedules };
    return { msg: `已填 ${q.originText} → ${q.destText} 并搜索（结果页无结构化船期行）` };
  },
};
