// Yang Ming 阳明 —— P2P 表单结构见 qa/aria8-ym-p2p.txt（From/To location + Period Start/End + Search）
//   表单是 react-select：From/To 是 aria-haspopup combobox（aria-label 空，placeholder "--input location name--" 是
//   旁边独立的 text 节点，不在 input 的 placeholder 属性里）——所以要用 XPATH 从 label 定位。
// V6C 修复：①定位器 input[placeholder*="input location name" i] → xpath=//label[contains(.,"Location From/To")]//following::input[1]
//         ②react-select 前缀匹配，打主词首段（全串 "ningbo zj cnngb" 匹配不到，见 m4-probe 注释）
//         ③候选点选走共享 typeAndPickCandidate（轮询 + [role="option"] 排除隐藏原生 select + field.type 定向输入）。
export default {
  id: 'yangming',
  name: 'Yang Ming 阳明',
  code: 'YML',
  kind: 'dom',
  needsRealFingerprint: true,   // 10-09：需要真实浏览器指纹（硬拦无头）；仍静默（有头+CDP 最小化）
  entry: 'https://www.yangming.com/esolution/schedule/point_to_point_search?lang=en-us',
  urls: ['https://www.yangming.com/esolution/schedule/point_to_point_search?lang=en-us',
    'https://www.yangming.com/en/esolution/schedule/point_to_point_search'],
  async run(page, q, H) {
    await H.dismissCookies(page); // button "Agree"
    // 10-09 爹地破案：阳明有通知弹窗挡表单 → 通用清遮罩（点关闭 + 移除残存高 z-index 遮罩）
    try { await H.clearOverlays(page); } catch { /* 没有弹窗就没 */ }
    if (await H.isBlockPage(page)) throw new Error('被拦截');

    const from = page.locator('xpath=//label[contains(., "Location From")]//following::input[1]').first();
    const to = page.locator('xpath=//label[contains(., "Location To")]//following::input[1]').first();
    let formOk = false;
    for (let i = 0; i < 10; i++) {
      formOk = await from.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
      if (formOk) break;
      // 延迟弹出的通知弹窗：每轮都清一次遮罩（前 3 轮）
      if (i < 3) { try { await H.clearOverlays(page); } catch { /* 忽略 */ } }
      await H.sleep(1500); // react-select 渲染/挂载期元素会 detach，分轮重试
    }
    if (!formOk) { if (process.env.SSH_DUMP_DOM === 'yangming') { try { (await import('node:fs')).writeFileSync('/tmp/dom-yangming.txt', `URL: ${page.url()}\n\n` + (await page.content())); console.error('[yangming] DOM 已写 /tmp/dom-yangming.txt'); } catch {} } throw new Error('表单未出现，仅开页'); }

    // 打主词首段（大写，匹配 m4-probe 实测 "Ningbo"/"Istanbul"）
    const cap = (s) => { const w = String(s).split(/[ (,]/)[0].trim(); return w ? w[0].toUpperCase() + w.slice(1) : ''; };
    const sel = [() => page.locator('[role="option"], [role="listbox"] [role="option"], li[role="option"]').all()];
    // 9-30：候选匹配不再写死宁波/伊斯坦布尔 —— 追加词典解析出的该船司词/码动态匹配；旧词保留兜底（零回归）。
    const hitWord = (t, r) => !!r && (String(t).toLowerCase().includes(String(r.word || '').toLowerCase())
      || (r.locode && String(t).toLowerCase().includes(String(r.locode).toLowerCase())));
    const okO = await H.typeAndPickCandidate(page, from, (q.originVariants || [cap(q.originText)]).map((x) => cap(x)), {
      selectors: sel, pick: (x) => /ningbo/i.test(x) || /cnngb/i.test(x) || hitWord(x, q._o),
    });
    const okD = await H.typeAndPickCandidate(page, to, (q.destVariants || [cap(q.destText)]).map((x) => cap(x)), {
      selectors: sel, pick: (x) => /istanbul/i.test(x) || /trist/i.test(x) || hitWord(x, q._d),
    });
    if (!okO || !okD) throw new Error(`候选点选未完成（o=${!!okO} d=${!!okD}），仅开页`);

    // 起运日（Period Start Date，YYYY/MM/DD 形状）—— 尽力填，失败不致命（表单有默认日期）
    await H.setInputByValueShape(page, /^\d{4}\/\d{2}\/\d{2}$/, q.date.slashes).catch(() => false);   // 留空=今天
    await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
    await H.clickByText(page, /^\s*search\s*$/i);
    await H.sleep(4000);
    return { msg: `已填 ${(q.originVariants || cap(q.originText))} → ${(q.destVariants || cap(q.destText))}${q.skipDate ? '（日期用网站默认）' : `（起运 ${q.date.slashes}）`}并点搜索` };
  },
};
