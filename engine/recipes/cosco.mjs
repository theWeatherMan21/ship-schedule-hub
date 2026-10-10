// COSCO 中远海运 —— 词典版（evidence/m4-cosco + qa/cosco-diag5/6 + cosco-dom-dump.json 实测）：
//   入口 searchByCity 200；origin/destination city 文本框吃词典短串（"ningbo"/"istanbul"，带 " china" 后缀会匹配不到候选）；
//   候选是 .ivu-select-item（li，文本 "Ningbo,Ningbo,Zhejiang,China"/"Istanbul, ,Istanbul,Turkey"），
//   下拉容器有瞬态 "Loading" 文本、且导航菜单也有 <li>——故选择器必须精确到 .ivu-select-item 并排除瞬态；
//   有「Please select your expected location」modal（.ivu-modal）点 Confirm；搜索按钮 button.btnSearch；
//   结果页 "Shortest Transit Time: 26 Days"。m4 证据：evidence/m4-cosco.{txt,png,-xhr.json}
// V6C 修复：①别名 ningbo china→ningbo（后缀破坏 autocomplete 前缀匹配）②候选选择器收窄到 .ivu-select-item
//         ③轮询重查（旧版 .all() 过早快照 + 裸 li 把导航菜单当候选）④打字用 field.type 定向输入。
export default {
  id: 'cosco',
  name: 'COSCO 中远海运',
  code: 'COSU',
  kind: 'dom',
  entry: 'https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity',
  urls: ['https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', 'https://elines.coscoshipping.com/'],
  fallbackNote: '反爬拦截时仅打开页面；表单链路已验证（searchByCity 词典直填）',
  timeoutMs: 150000, // 候选轮询各 ~40s + 结果等待（COSCO 候选渲染极慢，婉宜 9-22）
  async run(page, q, H) {
    await H.dismissCookies(page);
    if (await H.isBlockPage(page)) await H.waitThroughChallenge(page, 12000);
    if (await H.isBlockPage(page)) throw new Error('反爬拦截，仅开页兜底');

    // 等表单（searchByCity 页较慢）
    const o = page.getByRole('textbox', { name: /origin city/i }).first();
    const waitOk = await o.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch((e) => { console.error('[cosco-debug] waitFor err:', String(e).slice(0, 200)); return false; });
    if (!waitOk) {
      console.error('[cosco-debug] url:', page.url(), 'title:', await page.title().catch(() => ''), 'bodyLen:', await page.evaluate(() => document.body?.innerText?.length || 0).catch(() => -1));
      throw new Error('表单未出现（可能被反爬页替换），仅开页');
    }
    const d = page.getByRole('textbox', { name: /destination city/i }).first();

    // 预热：输入框「可见」≠ 组件初始化完成——实测 goto 后立即输入不触发 autocomplete，
    // 等 ~3.5s 再输入候选才出（婉宜 9-22，qa/cosco-origin-probe.mjs 对照）。
    await H.sleep(3500);

    // 位置 modal（Online Services → Confirm）可能出现在填表前/后
    const confirmModal = async () => {
      try {
        const modal = page.locator('.ivu-modal-wrap, .ivu-modal').first();
        if (await modal.isVisible({ timeout: 600 }).catch(() => false)) {
          const mt = await modal.innerText().catch(() => '');
          if (/please select your expected location/i.test(mt)) {
            await page.getByRole('button', { name: /confirm/i }).first().click({ timeout: 3000 }).catch(() => {});
            await H.sleep(1500);
            return true;
          }
        }
      } catch { /* no-op */ }
      return false;
    };
    await confirmModal();

    // COSCO 候选 = .ivu-select-item（li），不混入导航 <li> / 瞬态 Loading
    // 起运港候选渲染极慢（实测输入后 36s 才可能出，单跑也会 o=false）——轮询各拉到 ~40s（婉宜 9-22）
    // 9-24：pick 硬编码 ningbo/istanbul → 换动态纯词（词典 word 或 fallback text 首段），支持 Gdansk 等任意港
    const keyOf = (r, text) => String(r?.word || String(text).split(/[(\s]/)[0] || text).toLowerCase();
    const oKey = keyOf(q._o, q.originText);
    const dKey = keyOf(q._d, q.destText);
    const okO = await H.typeAndPickCandidate(page, o, (q.originVariants || q.originText), {
      selectors: [() => page.locator('.ivu-select-item').all()],
      pick: (t) => t.toLowerCase().includes(oKey),
      polls: 80, pollMs: 500, settleMs: 2500,
    });
    const okD = await H.typeAndPickCandidate(page, d, (q.destVariants || q.destText), {
      selectors: [() => page.locator('.ivu-select-item').all()],
      pick: (t) => t.toLowerCase().includes(dKey),
      polls: 80, pollMs: 500, settleMs: 2500,
    });
    if (!okO || !okD) throw new Error(`候选点选未完成（o=${!!okO} d=${!!okD}），仅开页`);

    // 日期（Earliest Departure，ISO yyyy-mm-dd 直接 fill，diag6 实测有效）；skipDate 时用网站默认
    const date = page.getByRole('textbox', { name: /earliest departure/i }).first();
    if (await date.isVisible({ timeout: 3000 }).catch(() => false)) {
      const iso = q.raw.date || q.date.yyyy_mm_dd;   // 留空=今天：留空会被部分站内校验拦下
      await date.fill('').catch(() => {});
      await date.fill(String(iso), { timeout: 3000 }).catch(() => {});
      await page.keyboard.press('Escape').catch(() => {});
      await H.sleep(500);
    }
    await confirmModal(); // modal 也可能在填表后弹出

    // 搜索按钮
    const btn = page.locator('button.btnSearch, .submit-btn').first();
    await btn.click({ timeout: 8000 }).catch(() => {});
    await H.sleep(6000);
    // 结果回读：结果页有 "Ningbo,Ningbo,Zhejiang,China Istanbul..." + "Shortest Transit Time: 26 Days"
    let text = '';
    for (let i = 0; i < 10; i++) {
      text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (/shortest transit|ningbo,?.*istanbul|istanbul.*ningbo/is.test(text)) break;
      await H.sleep(2500);
    }
    const m = text.match(/shortest transit time:?\s*(\d+)\s*days?/i);
    // 目的港词（Gdansk 时 routeOk 要按纯词判，不写死 istanbul）
    const destKey = String(q.destText).split(/[(\s]/)[0].toLowerCase();
    const originKey = String(q.originText).split(/[(\s]/)[0].toLowerCase();
    const routeOk = text.toLowerCase().includes(originKey) && text.toLowerCase().includes(destKey);
    if (!routeOk) throw new Error(`结果页未见 ${originKey}/${destKey} 路由（len=${text.length}），可能预填丢失`);

    // ---- 结构化抽取（9-24 Istanbul 10 条实测）----
    // 卡结构： <cutOff>\n<HH:MM>\n<vessel>\n/<svc>/<voyage>\n<ETD>\n<HH:MM(Wd.)>\n<ETA>\n<HH:MM(Fr.)>\nNO\nNO\n Transit <N> Days\n<Direct|Via...>
    const schedules = [];
    try {
      const cardRe = /(\d{4}-\d{2}-\d{2})\n\d{2}:\d{2}\n\s*\n([^\n/]+)\n\/([^/\n]+)\/([^\n]+)\n\s*\n\s*\n(\d{4}-\d{2}-\d{2})\n\s*\n\d{2}:\d{2}\(\w+\.?\)\n\s*\n(\d{4}-\d{2}-\d{2})\n\s*\n\d{2}:\d{2}\(\w+\.?\)\n\s*\nNO\nNO\n Transit (\d+) Days\n(Direct|Via[^\n]*)/gi;
      let cm;
      while ((cm = cardRe.exec(text)) !== null && schedules.length < 12) {
        const direct = /^direct/i.test(cm[8]);
        schedules.push({
          vessel: cm[2].trim(),
          voyage: cm[4].trim(),
          etd: cm[5], eta: cm[6],
          transitDays: Number(cm[7]) || cm[7],
          via: '',
          direct,   // 结果页显示 Direct/Via + 中转明细（Truck/Rail/Feeder），直挂 Istanbul 全 Direct；Via 行已在 cm[8] 但明细港口缺 → 非直达标 T/S
        });
        if (!direct) schedules[schedules.length - 1].via = 'T/S';
      }
    } catch { /* 抽取失败 → 保持 prefilled */ }

    const msg = `Filled ${q.originText} → ${q.destText}, searched` +
      (schedules.length ? `, ${schedules.length} schedules: ` + schedules.slice(0, 3).map((r) => `${r.vessel} ${r.voyage} ETD ${r.etd} → ${r.eta} ${r.transitDays} days ${r.direct ? 'Direct' : 'via ' + r.via}`).join(' | ')
        : (m ? `, Shortest Transit ${m[1]} days` : ', results route confirmed'));
    if (schedules.length) return { msg, schedules };
    // 结果页明确回"无方案/无结果"时如实转达（别显示成"已填表"让人以为是我们的问题）
    const none = /no solution has been found|not able to propose solutions|no schedule[s]? (?:has|have|were|was) (?:been )?found|no data|暂无/i.exec(String(text || ''));
    if (none) return { msg: `Queried: site said \"${none[0]}\" — no service on this route` };
    return { msg };
  },
};
