// ZIM —— 2026-09-22 定案：真实船期入口 = zim.com 主页 Schedules tab 内嵌 P2P 表单
// 实测（qa/zim-final.mjs，evidence/m4-zim-*）：
//   主页 200 稳定；tab "Schedules" → combobox "Origin"/"Destination"（Shadow DOM 组件）+ button "Search" [disabled→enabled]
//   候选 API：apigw.zim.com/digitalMasterData/Locations/v1/p2p-route?searchTerm=（返回 code 含 LOCODE，但候选行文本只有 "Name, Country"）
//   Origin 候选 "Ningbo (ZJ), China. People's Republic"（CNNGB;10）；干扰项 Dronningborg, Denmark 排首位
//   Destination 候选 Istanbul 系：Besiktas(TRBTS)/Istanbul(TRIST)/Haydarpasa(TRHYY)/Ambarli(TRKPX)/City Limits×2/Kadikoy
//   Search 后站内跳 /schedules/point-to-point?portcode=CNNGB;10&portdestinationcode=TRIST;0… → **Akamai Challenge Validation 拦（60s 不放行）**
// 判定：降级档。表单填写全链验证通过，结果深链被 Akamai 卡 → 保底「打开主页 + 点 Schedules tab + 尽力预填」。
export default {
  id: 'zim',
  name: 'ZIM 以星',
  code: 'ZIM',
  kind: 'dom',
  entry: 'https://www.zim.com/',
  urls: ['https://www.zim.com/'],
  fallbackNote: '船期结果深链被 Akamai Challenge Validation 拦截（表单链路已验证：主页→Schedules tab→P2P 填选→Search→深链被拦），已尽力预填供手动继续',
  async run(page, q, H) {
    await H.dismissCookies(page); // button "I Agree"
    // 10-09：cookie 弹窗挡表单 → 装弹窗盾之外再做一次通用清理（点关闭 + 移除残存遮罩）
    try { await H.clearOverlays(page); } catch { /* 没有就没 */ }
    if (await H.isBlockPage(page)) await H.waitThroughChallenge(page, 12000);
    if (await H.isBlockPage(page)) throw new Error('Akamai 拦截主页');
    // 点 Schedules tab（渲染有波动：轮询等出现）
    const tab = page.getByRole('tab', { name: /^schedules$/i }).first();
    let tabOk = false;
    for (let i = 0; i < 10; i++) {
      if (await tab.isVisible({ timeout: 1500 }).catch(() => false)) {
        try { await tab.click({ timeout: 5000 }); tabOk = true; break; } catch { }
      } else await H.sleep(2500);
    }
    if (!tabOk) throw new Error('Schedules tab 未出现（ZIM 主页渲染失败）');
    await H.sleep(2000);
    // 尽力预填（词来自 portdb 词典；失败不炸——降级档价值在打开 tab）
    const typed = async (label, word, nameMatcher) => {
      try {
        const box = page.getByRole('combobox', { name: new RegExp(`^${label}$`, 'i') }).first();
        await box.click({ timeout: 8000 });
        await H.sleep(600);
        await page.keyboard.type(String(word), { delay: 80 });
        await H.sleep(2500);
        const opts = page.getByRole('option');
        const texts = [];   // 10-14 审阅 B2：存 {t, idx}——idx 是 opts 原始下标（过滤 Search 占位后仍能对齐）
        for (let i = 0; i < 20; i++) {
          const n = await opts.count().catch(() => 0);
          for (let j = 0; j < Math.min(n, 10); j++) { const t = (((await opts.nth(j).textContent().catch(() => '')) || (await opts.nth(j).innerText().catch(() => '')) || '')).trim(); if (t && !/^search(ing)?\./i.test(t)) texts.push({ t: t.replace(/\s+/g, ' '), idx: j }); }
          if (texts.length) break;
          await H.sleep(500);
        }
        if (!texts.length) return false;
        const hit = texts.find((x) => nameMatcher(x.t));
        if (!hit) return false;   // 10-14 审阅 B2：未命中不再盲点第一项（静默选错港口）——交上层换写法/报错
        await opts.nth(hit.idx).click({ timeout: 5000 }).catch(() => {});
        await H.sleep(1000);
        return true;
      } catch { return false; }
    };
    const okO = await typed('Origin', q.originText, t => new RegExp((q._o?.word || 'ningbo').split(/[ (,]/)[0], 'i').test(t));
    const okD = await typed('Destination', q.destText, t => /istanbul/i.test(t) && (q._d?.locode ? /ambarli|haydarpasa|istanbul, turkiye/i.test(t) : true));
    // Search（点击后深链被 Akamai 卡，但点击完成 = 表单链路全通证据）
    const search = page.getByRole('button', { name: /^search$/i }).first();
    for (let i = 0; i < 10; i++) { if (!(await search.isDisabled().catch(() => true))) break; await H.sleep(1000); }
    const clickable = !(await search.isDisabled().catch(() => true));
    if (clickable) await search.click({ timeout: 8000 }).catch(() => {});
    await H.sleep(5000);
    const landed = page.url().includes('point-to-point');
    if (landed) await H.waitThroughChallenge(page, 20000).catch(() => {});
    await H.sleep(3000);
    const detail = okO && okD ? `（已填 ${q.originText}→${q.destText}${clickable ? '，Search 已点' : ''}${landed ? '，结果深链被 Akamai 拦' : ''}）` : '（预填未完成，tab 已打开）';

    // 2026-09-23：引擎改为「有头 + CDP 最小化」后，Akamai 会放行（它只看指纹，不看窗口可见性）。
    // 旧版在这里无条件 throw，导致表单全通也永远显示 opened —— 改成真被拦才降级。
    const blocked = await H.isBlockPage(page);
    if (process.env.SSH_DUMP_DOM === 'zim') { try { (await import('node:fs')).writeFileSync('/tmp/dom-zim.txt', `URL: ${page.url()}\n\n` + (await page.content())); console.error('[zim] DOM 已写 /tmp/dom-zim.txt'); } catch {} }
    const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
    const hasResult = /vessel|voyage|transit|sailing|schedule detail|departure/i.test(txt);
    if (okO && okD && !blocked && (landed || hasResult)) {
      return { msg: `Filled ${q.originText} → ${q.destText}, searched${landed ? ', results page opened' : ''}` };
    }
    throw new Error(this.fallbackNote + detail);
  },
};
