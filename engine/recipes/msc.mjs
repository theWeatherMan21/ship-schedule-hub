// MSC —— 有头实测 200，真实表单（qa/h-msc-sched.txt）
// 字段：input#from / input#to / input[placeholder="dd/MM/yyyy"] / button Search
export default {
  id: 'msc',
  name: 'MSC 地中海航运',
  code: 'MSC',
  kind: 'dom',
  entry: 'https://www.msc.com/en/search-a-schedule',
  urls: ['https://www.msc.com/en/search-a-schedule', 'https://www.msc.com/en/schedules'],
  timeoutMs: 130000, // 部署态 profile 下页面更慢，60s 默认会超时（婉宜 9-23 部署态实测）
  async run(page, q, H) {
    await H.dismissCookies(page);
    if (await H.isBlockPage(page)) await H.waitThroughChallenge(page, 12000);
    if (await H.isBlockPage(page)) throw new Error('Akamai 拦截（Access Denied）');

    const from = page.locator('#from').first();
    await from.waitFor({ state: 'visible', timeout: 20000 });

    const ptp = page.getByRole('button', { name: /point[\s-]*to[\s-]*point/i }).first();
    if (await ptp.isVisible().catch(() => false)) { await ptp.click().catch(() => {}); await H.sleep(800); }

    await H.fillAutocomplete(page, from, q.originText, { pick: t => H.portPick(t, q, 'origin') });
    const to = page.locator('#to').first();
    await H.fillAutocomplete(page, to, q.destText, { pick: t => H.portPick(t, q, 'dest') });

    const date = page.locator('input[placeholder="dd/MM/yyyy"]').first();
    if (!q.skipDate && await date.count()) { await date.click({ timeout: 4000 }).catch(() => {}); await H.setValue(date, q.date.dd_mm_yyyy); await page.keyboard.press('Enter').catch(() => {}); }

    const search = page.getByRole('button', { name: /^\s*search\s*$/i });
    const n = await search.count().catch(() => 0);
    let clicked = false;
    for (let i = n - 1; i >= 0; i--) {
      const el = search.nth(i);
      if (await el.isVisible().catch(() => false)) { await el.click({ timeout: 8000 }).catch(() => {}); clicked = true; break; }
    }
    if (!clicked) {
      // m4-probe 实测兜底：button:has-text("Search")（含大小写混合/带图标的搜索键）
      const alt = page.locator('button:has-text("Search"), button[type="submit"], input[type="submit"]');
      const m = await alt.count().catch(() => 0);
      for (let i = m - 1; i >= 0; i--) {
        const el = alt.nth(i);
        if (await el.isVisible().catch(() => false)) { await el.click({ timeout: 8000 }).catch(() => {}); clicked = true; break; }
      }
    }
    if (!clicked) throw new Error('找不到可见的 Search 按钮');
    await H.sleep(4000);
    return { msg: `已预填 ${q.originText} → ${q.destText}${q.skipDate ? '（日期用网站默认）' : ` @ ${q.date.dd_mm_yyyy}`} 并点搜索` };
  },
};
