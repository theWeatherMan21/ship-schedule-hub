// HMM —— 表单结构见 qa/aria-hmm.txt / probe-hmm4/5（9-24 实测）
// 入口用 e-service 移动版 ScheduleMain.do（homepage 小部件 gotoPortToPort 只做 JS 校验无反应，9-24 实测放弃）
// 字段：#srchPointFrom / #srchPointTo（autocomplete，候选 li，精确匹配 [LOCODE] 后缀）+ #btnRetrieve
// 结果：XHR selectPointToPointList.do 渲染卡片流（无表格）——innerText 卡片正则抽取：
//   Origin\n<etd>\n<港名>\n<N> days\n<Direct|Transshipment>\nDestination\n<eta>\n<港名>\nMain Vessel\n<vessel (voyage)>\nRoute\n<route>
// via 信息：卡片 1st Vessel/Next Port(T/S) 段；Transshipment 卡的 via 从「Next Port」行取（见 extract）
export default {
  id: 'hmm',
  name: 'HMM 现代商船',
  code: 'HMM',
  kind: 'dom',
  entry: 'https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do',
  urls: ['https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do', 'https://www.hmm21.com/'],
  fallbackNote: 'HMM e-service 被拦/候选未出时仅打开页面',
  timeoutMs: 100000,
  async run(page, q, H) {
    await H.dismissCookies(page);
    if (await H.isBlockPage(page)) await H.waitThroughChallenge(page, 12000);
    if (await H.isBlockPage(page)) throw new Error('被拦截，仅开页兜底');

    const o = page.locator('#srchPointFrom');
    await o.waitFor({ state: 'visible', timeout: 20000 });

    // HMM 候选：可见 li 中含 [LOCODE] 的行（精确 locode 匹配，防 Nowy Dwor Gdanski 误中 Gdansk——9-24 实测）
    const pickPort = async (sel, word, locode) => {
      const inp = page.locator(sel);
      await inp.click({ timeout: 8000 }).catch(() => {});
      await inp.fill('').catch(() => {});
      await inp.type(String(word).toLowerCase(), { delay: 80 }).catch(() => { try { inp.pressSequentially(String(word).toLowerCase(), { delay: 80 }); } catch {} });
      // 9-29 修正：HMM 候选是 ac_results 组件，**必须真实鼠标点击**（Playwright locator）。
      // 用 JS 程序化 el.click() 时它不认，隐藏 code 会被写成默认第一项（Istanbul 场景写成 TRHAY→0 条）。
      const codeId = sel === '#srchPointFrom' ? 'srchPointFrom_code' : 'srchPointTo_code';
      const wantU = String(locode).toUpperCase();
      const readCode = () => page.evaluate((id) => document.getElementById(id)?.value || '', codeId).catch(() => '');
      let picked = null;
      for (let attempt = 0; attempt < 3 && !picked; attempt++) {
        for (let i = 0; i < 18; i++) {
          await H.sleep(900);
          const loc = page.locator(`li:has-text("[${wantU}]")`).first();
          const vis = await loc.isVisible({ timeout: 400 }).catch(() => false);
          if (!vis) continue;
          const t = (await loc.innerText().catch(() => '')).trim().replace(/\s+/g, ' ').slice(0, 70);
          await loc.click({ timeout: 3000 }).catch(() => {});
          await H.sleep(700);
          const code = await readCode();
          if (String(code).toUpperCase() === wantU) { picked = t; break; }  // 回读校验：code 必须是我们要的
        }
        if (!picked && attempt < 2) { await inp.click({ timeout: 4000 }).catch(() => {}); await H.sleep(600); }
      }
      return picked;
    };

    const oLocode = q._o?.locode || '';
    // 9-29 修正（爹地反馈）：Istanbul 曾硬映射 TRHAY(Haydarpaşa TMNL) → 实测 0 条。
    // 实探 HMM「istanbul」候选 = TRHAY / TRIST / TRTRA；官网结果页用的是
    // 「ISTANBUL, TURKIYE」= TRIST（Ningbo→Istanbul 6 条）。所以按 TRIST 精确点选，别再硬映射。
    const dLocode = q._d?.locode || '';
    // HMM 特例：Gdansk fallback 文本 "Gdansk (PLGDN)" 候选不出（9-24 实测）——HMM 候选框吃纯地名词
    const oWord = /\(/.test(q.originText) ? (String(q.originText).split('(')[0].trim() || q.originText) : q.originText;
    const dWord = /\(/.test(q.destText) ? (String(q.destText).split('(')[0].trim() || q.destText) : q.destText;
    const pO = await pickPort('#srchPointFrom', oWord, oLocode);
    if (!pO) throw new Error(`起运港候选未出（${q.originText}/${oLocode}），仅开页`);
    await H.sleep(800);
    // HMM 特例：Istanbul 用 TRHAY（Haydarpaşa），词典 fallback text 是 "istanbul"；dest locode 从 q._d 来
    const pD = await pickPort('#srchPointTo', dWord, dLocode);
    if (!pD) throw new Error(`目的港候选未出（${q.destText}/${dLocode}），仅开页`);

    // 回读 code 域确认（_code 隐藏域由 HMM JS 在点选后填）
    const codes = await page.evaluate(() => ({ f: document.getElementById('srchPointFrom_code')?.value || '', t: document.getElementById('srchPointTo_code')?.value || '' })).catch(() => ({ f: '', t: '' }));
    if (!codes.f || !codes.t) throw new Error(`候选点选未生效（f=${codes.f || '空'} t=${codes.t || '空'}），仅开页`);

    // 日期：srchSailDate 是 <input type=date>；skipDate 用网站默认
    if (!q.skipDate) {
      const date = page.locator('#srchSailDate');
      if (await date.isVisible({ timeout: 3000 }).catch(() => false)) {
        await date.fill(String(q.raw.date || ''), { timeout: 3000 }).catch(() => {});
      }
    }

    await page.evaluate(() => { const b = document.getElementById('btnRetrieve'); if (b) b.click(); }).catch(() => {});
    // 等结果：Search Results (N) 出现（XHR 渲染，无整页跳转——9-24 实测）
    let text = '';
    for (let i = 0; i < 16; i++) {
      await H.sleep(2500);
      text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (/search results \(\d+\)/i.test(text)) break;
    }
    const m = text.match(/search results \((\d+)\)/i);
    if (!m) throw new Error('检索后未见 Search Results (N)');

    // ---- 结构化抽取（卡片正则，9-24 Rotterdam 33 行表 + 16 卡实测）----
    const schedules = [];
    try {
      const cardRe = /Origin\n\s*(\d{4}-\d{2}-\d{2})\n([^\n]+)\n(\d+)\s*days?\n(Direct|Transshipment)\nDestination\n\s*(\d{4}-\d{2}-\d{2})\n([^\n]+)\nMain Vessel\n([^\n]+)\nRoute\n([^\n]+)/g;
      let cm;
      while ((cm = cardRe.exec(text)) !== null && schedules.length < 12) {
        const vm = /^([^(]+?)(?:\s*\(([^)]+)\))?\s*$/.exec(cm[7].trim());
        schedules.push({
          vessel: vm ? vm[1].trim() : cm[7].trim(),
          voyage: vm && vm[2] ? vm[2].trim() : '',
          etd: cm[1], eta: cm[5],
          transitDays: Number(cm[3]) || cm[3],
          via: '',   // 卡片版 innerText 不含中转港名（cm[2] 是 Origin 港名，误用会显示「转NINGBO」）——非直达下方统一标 T/S
          direct: cm[4].startsWith('Direct'),
        });
      }
      // Transshipment 卡的 via 港名：innerText 卡片段落后有「Next Port(T/S)」明细（表格版），卡片版无 → 用 1st Vessel 兜底标 T/S
      // 简化：via 空且非直达 → 标 'T/S'（页面没给中转港名时不编造）
      for (const s of schedules) { if (!s.direct && !s.via) s.via = 'T/S'; }
    } catch { /* 抽取失败 → 保持 prefilled */ }

    const msg = `已填 ${q.originText} → ${q.destText}，Search Results (${m[1]})` +
      (schedules.length ? `：` + schedules.slice(0, 3).map((r) => `${r.vessel} ${r.voyage} ETD ${r.etd} → ${r.eta} ${r.transitDays}天${r.direct ? ' 直达' : ' 转' + r.via}`).join(' ｜ ') : '');
    if (schedules.length) return { msg, schedules };
    return { msg: `已填 ${q.originText} → ${q.destText}，Search Results (${m[1]})（结果页无结构化船期行）` };
  },
};
