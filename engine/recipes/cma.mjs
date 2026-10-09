// CMA CGM 达飞 —— 2026-09-22 无头 200 突破：profile 履历养熟后 /ebusiness/schedules 无头可开
// 表单（Kendo AutoComplete，qa/cma-kendo-diag* 实测）：
//   input#AutoCompletePOL（aria: combobox "Port, City, Country name or code"）
//   下拉行 = li.place-suggestion，点击后 input value 变 "NAME ; COUNTRY ; LOCODE"（如 "NINGBO ; CN ; CNNGB"）
//   候选有干扰组头（"Place names including…"）和几十个 Door 小地名，必须 LOCODE+Port 精确点行
//   目的港 Istanbul 系实际集装箱港：istanbul, ambarli port e. side(TRAVC) Port（PORT-ALIASES 主表已记）
// 已知边界：CMA 有 IP 级频率限制（连续高频全链会话后 ERR_CONNECTION_CLOSED/403 冷却），失败=开页兜底。
export default {
  id: 'cma',
  name: 'CMA CGM 达飞',
  code: 'CMDU',
  kind: 'dom',
  needsRealFingerprint: true,   // 10-09：需要真实浏览器指纹（硬拦无头）；仍静默（有头+CDP 最小化）
  timeoutMs: 60000,   // 达飞官网搜索一次常要 50-60s（实测），别用全局 60s 截断真结果
  entry: 'https://www.cma-cgm.com/ebusiness/schedules',
  urls: ['https://www.cma-cgm.com/ebusiness/schedules', 'https://www.cma-cgm.com/'],
  fallbackNote: 'CMA 频率限制/403 时仅打开页面；表单链路已验证（Kendo 行点击法）',
  async run(page, q, H) {
    await H.dismissCookies(page);
    if (await H.isBlockPage(page)) await H.waitThroughChallenge(page, 12000);
    if (await H.isBlockPage(page)) throw new Error('403（profile 冷却或履历失效），仅开页兜底');

    const box = page.getByRole('combobox', { name: /port, city, country name or code/i }).first();
    await box.waitFor({ state: 'visible', timeout: 20000 });

    // Kendo 行点击法：打字 → 等含 (LOCODE) 的 li → 点 LOCODE+Port 匹配行 → 回读验证
    // v6b 实测（qa/cma-v6b-diag2.mjs）：row 点击后 getByRole('combobox').inputValue() 回读为空（role 指向 wrapper），
    // 真实值在 #AutoCompletePOL.value 和隐藏域 RoutingFinderViewModel_{Departure|Arrival}PlaceCode
    const pickRow = async (field, word, locode, label, hiddenId) => {
      await field.click({ timeout: 8000 }).catch(() => {});
      await H.sleep(500);
      await page.keyboard.type(String(word), { delay: 80 });
      await H.sleep(2500);
      const codeRe = (Array.isArray(locode) ? locode : [locode]).filter(Boolean).map((c) => String(c)).join('|');
      const items = page.locator('li.place-suggestion').filter({ hasText: new RegExp(`\\((${codeRe})\\)`, 'i') });
      let n = 0;
      for (let i = 0; i < 20; i++) { n = await items.count().catch(() => 0); if (n > 0) break; await H.sleep(500); }
      if (!n) return false;
      // Port 行优先（排除 Ramp • Door）
      let row = items.filter({ hasText: /port/i }).first();
      if (!(await row.count().catch(() => 0))) row = items.first();
      await row.click({ timeout: 6000 }).catch(() => { });
      await H.sleep(1500);
      await page.keyboard.press('Escape').catch(() => {}); // 关残留下拉，避免挡下一个字段
      // 回读（v6b diag4 定案）：隐藏域 ArrivalPlaceCode 不随 Kendo 选行更新（残留旧值），不可作验证；
      // 真实值在 #AutoCompletePOL / #AutoCompletePOD 本体 input —— 按 POL/POD 专读
      const conf = await page.evaluate(() => document.getElementById('AutoCompletePOD')?.value || '').catch(() => '');
      const confO = await page.evaluate(() => document.getElementById('AutoCompletePOL')?.value || '').catch(() => '');
      const val = label === '目的' ? (conf || confO) : (confO || conf);
      const okCodes = (Array.isArray(locode) ? locode : [locode]).filter(Boolean).map((c) => String(c));
      const ok = okCodes.some((c) => new RegExp(`;\\s*${c}`, 'i').test(val) || new RegExp(`\\(${c}\\)`, 'i').test(val) || new RegExp(`\\b${c}\\b`, 'i').test(val));
      return ok;
    };
    // pickRow 加固：时序抖动（下拉未及时出/点击被挡）重试一次
    const pickRowRetry = async (...a) => { if (await pickRow(...a)) return true; await H.sleep(2500); return pickRow(...a); };

    // CMA 特例：打纯词（fallback 文本 "Gdansk (PLGDN)" 带括号 Kendo 无候选，9-24 实测）——取括号前/首段
    const cleanWord = (t) => {
      const s = String(t);
      if (s.includes('(')) return s.split('(')[0].trim();
      return s.trim().split(/\s+/)[0];
    };
    // 多种写法依次试（船司词 → 纯港名 → Name (LOCODE) → 用户原词）
    const tryVariants = async (field, variants, locode, label, hiddenId) => {
      for (const v of (variants || [])) {
        const w = cleanWord(v) || cleanWord('');
        if (!w) continue;
        if (await pickRowRetry(field, w, locode, label, hiddenId)) return true;
      }
      return false;
    };
    const okO = await tryVariants(box, (q.originVariants || [q.originText]), (q.originCodes && q.originCodes.length) ? q.originCodes : (q._o?.locode || 'CNNGB'), '起运', 'RoutingFinderViewModel_DeparturePlaceCode');
    let dest = page.getByRole('group', { name: /^destination$/i }).getByRole('combobox').first();
    if (!(await dest.count().catch(() => 0))) dest = page.getByRole('combobox', { name: /port, city, country name or code/i }).nth(1);
    // 目的港：Istanbul 系按 CMA 实际候选选 Ambarli Port E. Side(TRAVC) Port；其他目的地用词典 locode
    const destLocode = q._d?.locode === 'TRIST' ? 'TRAVC' : (q._d?.locode || 'TRIST');
    const okD = await tryVariants(dest, (q.destVariants || [q.destText]), (q.destCodes && q.destCodes.length) ? q.destCodes : destLocode, '目的', 'RoutingFinderViewModel_ArrivalPlaceCode');
    if (!okO || !okD) throw new Error(`预填未完成（起运=${okO} 目的=${okD}），已尽力开页`);

    const search = page.getByRole('button', { name: /^search$/i }).first();
    await search.click({ timeout: 8000 }).catch(() => {});
    await H.sleep(8000);
    // 等结果（routing-finder 结果区：Main vessel / Voyage Ref. / N Days）
    let sched = '';
    for (let i = 0; i < 8; i++) {
      sched = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (/Main vessel/i.test(sched) && /\d+\s*Days/i.test(sched)) break;
      await H.sleep(2500);
    }
    if (process.env.SSH_DUMP_DOM === 'cma') {
      try {
        const fsmod = await import('node:fs');
        fsmod.writeFileSync('/tmp/dom-cma.txt', String(sched).replace(/[ \t\xa0]+/g, ' '));
        const tables = await page.evaluate(() => [...document.querySelectorAll('table, [class*=routing], [class*=result], [class*=card]')].slice(0, 60).map((t) => ({ tag: t.tagName, cls: (t.className || '').toString().slice(0, 60), txt: (t.innerText || '').replace(/\s+/g, ' ').slice(0, 300) }))).catch(() => []);
        fsmod.writeFileSync('/tmp/dom-cma-table.json', JSON.stringify(tables, null, 1));
        console.error('[cma] DOM 已写 len=' + String(sched).length);
      } catch { /* 忽略 */ }
    }
    // ---- 结构化抽取（9-24 Istanbul 10 条实测）----
    // 卡结构： <ETD> POL <港>\n[Port Cut-off\n<...>\n]Main vessel\n<vessel>\nService\n<svc>\nVoyage Ref.\n<voyage>\n<ETA> POD <港>\n<N> Days\n<Direct|via X>
    const schedules = [];
    try {
      // 截单时间就在卡里（Port Cut-off 行）——之前用非捕获组丢掉了，现在留下来（婉宜 9-30）
      const cardRe = /(\d{2}-[A-Z]{3}-\d{4}) POL [^\n]+\n(?:Port Cut-off\n([^\n]+)\n)?Main vessel\n([^\n]+)\nService\n[^\n]+\nVoyage Ref\.\n([^\n]+)\n(?:\w+, )?(\d{2}-[A-Z]{3}-\d{4}) POD [^\n]+\n(\d+) Days\n(Direct|via ([^\n]+))/gi;
      let cm;
      const fmt = (s) => { const m = /^(\d{2})-([A-Z]{3})-(\d{4})$/.exec(s); return m ? `${m[3]}-${{ JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' }[m[2]]}-${m[1]}` : s; };
      while ((cm = cardRe.exec(sched)) !== null && schedules.length < 12) {
        const direct = /^direct/i.test(cm[7]);
        const cutoff = (cm[2] || '').trim();
        schedules.push({
          vessel: cm[3].trim(),
          voyage: cm[4].trim(),
          etd: fmt(cm[1]),
          eta: fmt(cm[5]),
          transitDays: Number(cm[6]) || cm[6],
          via: direct ? '' : (cm[8] || '').trim(),
          direct,
          // 详情：达飞这里只有截单时间（官网卡里的 Port Cut-off 原文）
          detail: cutoff ? { service: '', routing: direct ? 'Direct' : 'Via', co2: '', legs: [], cutoffs: { '港口截关': cutoff } } : undefined,
        });
      }
    } catch { /* 抽取失败 → 保持 prefilled */ }

    // 官网有时直接回「没有方案」（10-09 天津→海法 实测：No solution has been found）——
    // 这不是我们填错了，也不该显示成"已填表·无结构化结果"，要如实转达。
    const noneRe = /No solution has been found|not able to propose solutions|no schedule[s]? (?:has|have|were|was) (?:been )?found/i;
    const none = noneRe.exec(sched);
    const m = sched.match(/\d+\s*Days/i);
    const bare = (x) => String(x || '').replace(/\s*\([A-Z]{4,5}\)\s*$/, '').trim();  // 文案里别再重复一次 (ILASH)
    const msg = `已预填 ${bare(q.originText)}(${q._o?.locode}) → ${bare(q.destText)}(${destLocode}) 并点搜索` +
      (schedules.length ? `，${schedules.length} 条船期：` + schedules.slice(0, 3).map((r) => `${r.vessel} ${r.voyage} ETD ${r.etd} → ${r.eta} ${r.transitDays}天${r.direct ? ' 直达' : ' 转' + r.via}`).join(' ｜ ')
        : (m ? `，结果页见 Transit ${m[0]}` : ''));
    if (schedules.length) return { msg, schedules };
    if (none) return { msg: `已查询：官网回「${none[0]}」——这条线达飞暂无方案` };
    return { msg };
  },
};
