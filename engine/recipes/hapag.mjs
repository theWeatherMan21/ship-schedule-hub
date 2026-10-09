// Hapag-Lloyd 赫伯罗特 —— Cloudflare「Managed Challenge」
// 实测结论（婉宜 9-23）：无头永远被拦（连验证界面都不给）；有头真指纹 4-15s 自动放行。
// 引擎已默认 headed-minimized（有头 + CDP 最小化 + 单页复用）→ 屏幕不可见但指纹真实。
// 表单路径（有头实测）：主页 → 点 "Find Schedule" → 船期页
//   input[type=search] aria="Start Location" / "End Location" + Start Date + Search
export default {
  id: 'hapag',
  name: 'Hapag-Lloyd 赫伯罗特',
  code: 'HLCU',
  kind: 'dom',
  entry: 'https://www.hapag-lloyd.com/solutions/vessel-schedule/#/?language=en',
  urls: ['https://www.hapag-lloyd.com/solutions/vessel-schedule/#/?language=en',
    'https://www.hapag-lloyd.com/en/home.html'],
  fallbackNote: 'Cloudflare 挑战未通过时仅打开页面（可手动过盾后操作）',
  timeoutMs: 230000, // 过盾 + SPA 渲染 + 两轮候选 + 搜索（部署态实测更慢，婉宜 9-23）
  async run(page, q, H) {
    await H.dismissCookies(page);

    // ① 过盾（有头下通常几秒自动放行）
    for (let i = 0; i < 8; i++) {
      if (!(await H.isBlockPage(page))) break;
      await H.waitThroughChallenge(page, 10000);
    }
    if (await H.isBlockPage(page)) throw new Error('Cloudflare 挑战未通过，仅开页兜底');

    // ② SPA（hash 路由）需要时间渲染 —— 探测实测 sleep 7s 后表单才在 DOM 里
    await H.sleep(7000);

    // ③ 表单：页面上正好 2 个 input[type=search]（Start / End Location），按序取最稳
    //    （getByRole('searchbox', {name}) 在本站定位不到，婉宜 9-23 实测）
    const o = page.locator('input[type=search]').nth(0);
    const d = page.locator('input[type=search]').nth(1);
    let ready = false;
    for (let i = 0; i < 16; i++) {
      if (await o.isVisible({ timeout: 1500 }).catch(() => false)) { ready = true; break; }
      await H.sleep(1500);
    }
    if (!ready) throw new Error('船期表单未出现（可能仍在挑战页），仅开页');

    // ④ 填起运/目的港
    // 9-30：候选匹配不再写死宁波/伊斯坦布尔 —— 追加词典解析出的该船司词（q._o/_d.word）动态匹配；
    //       旧词保留作并集兜底（宁波/伊斯坦布尔链路零回归）。
    const hitWord = (t, r) => !!r && (String(t).toLowerCase().includes(String(r.word || '').toLowerCase())
      || (r.locode && String(t).toLowerCase().includes(String(r.locode).toLowerCase())));
    const okO = await H.typeAndPickCandidate(page, o, (q.originVariants || q.originText), {
      pick: (t) => /ningbo/i.test(t) || hitWord(t, q._o),
      polls: 70, pollMs: 500, settleMs: 2500,
    });
    const okD = await H.typeAndPickCandidate(page, d, (q.destVariants || q.destText), {
      pick: (t) => /istanbul|ambarli/i.test(t) || hitWord(t, q._d),
      polls: 70, pollMs: 500, settleMs: 2500,
    });
    if (!okO || !okD) throw new Error(`候选点选未完成（o=${!!okO} d=${!!okD}），仅开页`);

    // ⑤ 日期（Start Date）——留空时显式填「今天」：有些站（真机实测 HMM）留空会被
    //    站内校验拦下、表单根本不提交（Windows/中文区域尤其明显），故一律给有效日期。
    {
      const date = page.getByRole('textbox', { name: /start date/i }).first();
      if (await date.isVisible({ timeout: 3000 }).catch(() => false)) {
        await date.fill(String(q.raw.date || q.date.yyyy_mm_dd)).catch(() => {});
        await page.keyboard.press('Enter').catch(() => {});
        await H.sleep(600);
      }
    }

    const btn = page.getByRole('button', { name: /^\s*search\s*$/i }).first();
    await btn.click({ timeout: 8000 }).catch(() => {});
    await H.sleep(4000);
    return { msg: `已填 ${q.originText} → ${q.destText}${q.skipDate ? '（日期用网站默认）' : ''} 并点搜索` };
  },
};
