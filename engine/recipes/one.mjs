// ONE 海洋网联 —— 9-29 重写（婉宜）
// 站侧改版：www.one-line.com/one-ecom/schedule/... 换成 mag-* 组件，**老流程「打字→点候选→点 Search」不可用**：
//   9-29 实测点真 submit（button[type=submit]）报 `Destination is a mandatory field.` —— 候选虽然渲染成 tag，
//   React 表单状态没吃到（点候选后 inputValue 为空），且点完没有任何船期请求发出 → 结果页永不出现。
// 实测可用的两条路（证据 qa/probe-out/one-submit.txt / one-deep-named.txt / one-api-raw.json）：
//   ① 站内端口 suggest API（公开、无需鉴权）：
//      GET /api/v1/schedule/point-to-point/search?pointName=<词>&userCountryCode=HK&sortType=origin|destination
//      → { points:[{code:'CNNGB', name:'NINGBO, ZHEJIANG, CHINA', termCd:'Y'(CY)/'D'(DOOR)}] }
//   ② **带名字的深链直接渲染结果页**（只带 LOCODE 不带名字 = 728B 壳页，什么都没有）：
//      /one-ecom/schedule/point-to-point-schedule?oriLocNmParam=<NAME>&destLocNmParam=<NAME>
//        &oriLocCdParam=CNNGB&destLocCdParam=TRIST&oriTermCdPara=Y&desTermCdPara=Y
//        &frmDtParam=<ISO>&nextWeekValue=14&cargoNature=GP&isEnabledCO2=false&year=&month=&searchType=List&isPolPodOn=false
//      → Total 2 results（YM WELCOME 051W 59 天 / MSC VIVIANA GT637W 26 天，均直达）
//   ③ 结果数据源 = GET /api/v1/schedule/point-to-point?porCode=CNNGB&delCode=TRIST&…（同域，页内 fetch 可用）
// 本配方：suggest 解析 → 带名深链 → 页内 API 抽结构化行 → DOM 正则兜底。
import { oneRowsFromLines } from '../fastpath.mjs';

export default {
  id: 'one',
  name: 'ONE 海洋网联',
  code: 'ONEY',
  kind: 'dom',
  entry: 'https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule',
  urls: ['https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule', 'https://ecomm.one-line.com/'],
  fallbackNote: '船期入口未确认时仅打开页面（suggest API + 带名深链已验证：Total 2 results）',
  timeoutMs: 60000,  // 10-14 拍板：应用层统一 60s 上限（本值须与之一致）
  async run(page, q, H) {
    await H.dismissCookies(page);
    if (await H.isBlockPage(page)) await H.waitThroughChallenge(page, 12000);
    if (await H.isBlockPage(page)) throw new Error('被拦截，仅开页兜底');

    // ecomm.one-line.com 会重定向到 www.one-line.com——等重定向稳定（页内 fetch 要在 one-line.com 域下）
    for (let i = 0; i < 10; i++) {
      if (!/ecomm\.one-line\.com/.test(page.url())) break;
      await H.sleep(1000);
    }
    // SPA 渲染就绪（表单出现即可，之后走深链）
    for (let i = 0; i < 8; i++) {
      const ok = await page.getByRole('button', { name: /point to point/i }).first().isVisible({ timeout: 3000 }).catch(() => false);
      if (ok) break;
      await H.sleep(1500);
    }

    const cleanWord = (t) => {
      const s = String(t || '').trim();
      if (s.includes('(')) return s.split('(')[0].trim();
      return s.split(/\s+/)[0] || '';
    };
    const oWord = cleanWord(q._o?.name || q.originText) || 'ningbo';
    const dWord = cleanWord(q._d?.name || q.destText) || 'istanbul';
    const oLoc = String(q._o?.locode || '').toUpperCase();
    const dLoc = String(q._d?.locode || '').toUpperCase();
    const iso = String(q.raw?.date || new Date().toISOString().slice(0, 10));
    const toIso = (s) => new Date(new Date(`${s}T00:00:00Z`).getTime() + 14 * 864e5).toISOString().slice(0, 10);
    const mkMsg = (rows, how) => `${how}: ${q.originText} → ${q.destText}` +
      (rows.length ? `, ${rows.length} schedules: ` + rows.slice(0, 3).map((r2) => `${r2.vessel} ${r2.voyage} ETD ${r2.etd} → ${r2.eta} ${r2.transitDays} days ${r2.direct ? 'Direct' : 'via ' + r2.via}`).join(' | ') : '(no structured schedule rows)');

    // 站内船期 API（同域，页内 fetch；公开无鉴权）
    const fetchApi = (oc, dc) => page.evaluate(async ({ o, d, from, to }) => {
      try {
        const r = await fetch(`https://ecomm.one-line.com/api/v1/schedule/point-to-point?porCode=${o}&delCode=${d}&rcvTermCode=Y&deTermCode=Y&tsFlag=&fromDate=${from}&toDate=${to}&cargoNature=GP&searchType=List&sourcePage=schedule`, { headers: { accept: 'application/json' } });
        return await r.json();
      } catch { return null; }
    }, { o: oc, d: dc, from: iso, to: toIso(iso) }).catch(() => null);

    // ---- ① 页内 API 直取（不依赖 suggest/深链；用词典 LOCODE）----
    if (oLoc && dLoc) {
      const a0 = await fetchApi(oLoc, dLoc);
      const r0 = a0 && Array.isArray(a0.scheduleLines) ? oneRowsFromLines(a0.scheduleLines) : [];
      if (r0.length) return { msg: mkMsg(r0, '站内 API 直取'), schedules: r0 };
    }

    // ---- ② 站内 suggest API：拿官方 code + name + 服务条款（termCd Y = CY）----
    const sug = await page.evaluate(async ({ o, d }) => {
      const g = async (w, kind) => {
        try {
          const r = await fetch(`https://ecomm.one-line.com/api/v1/schedule/point-to-point/search?pointName=${encodeURIComponent(w)}&userCountryCode=HK&sortType=${kind}`, { headers: { accept: 'application/json' } });
          const j = await r.json();
          return (j && j.points) || [];
        } catch { return []; }
      };
      return { o: await g(o, 'origin'), d: await g(d, 'destination') };
    }, { o: oWord, d: dWord }).catch(() => ({ o: [], d: [] }));
    const pickPt = (list, locode, word) => {
      const l = list || [];
      return l.find((p) => p.termCd === 'Y' && locode && String(p.code || '').toUpperCase() === String(locode).toUpperCase())
        || l.find((p) => p.termCd === 'Y' && word && String(p.name || '').toLowerCase().includes(word.toLowerCase()))
        || l.find((p) => p.termCd === 'Y') || null;
    };
    // suggest 挂了也别停：退回词典 code/name
    const oP = pickPt(sug.o, oLoc, oWord) || (oLoc ? { code: oLoc, name: String(q._o?.name || oWord).toUpperCase() } : null);
    const dP = pickPt(sug.d, dLoc, dWord) || (dLoc ? { code: dLoc, name: String(q._d?.name || dWord).toUpperCase() } : null);
    if (!oP || !dP) return { msg: `ONE schedule page opened (suggest miss: o=${JSON.stringify(sug.o).slice(0, 60)} d=${JSON.stringify(sug.d).slice(0, 60)})` };

    // ---- ③ 带名深链（只带 LOCODE 会停在壳页，必须带 oriLocNmParam/destLocNmParam）----
    const deep = 'https://www.one-line.com/one-ecom/schedule/point-to-point-schedule?' + new URLSearchParams({
      oriLocNmParam: oP.name, destLocNmParam: dP.name,
      oriLocCdParam: oP.code, destLocCdParam: dP.code,
      oriTermCdPara: 'Y', desTermCdPara: 'Y',
      frmDtParam: iso, nextWeekValue: '14', cargoNature: 'GP', isEnabledCO2: 'false',
      year: iso.slice(0, 4), month: String(+iso.slice(5, 7)), searchType: 'List', isPolPodOn: 'false',
    }).toString();
    await page.goto(deep, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});

    let text = '';
    for (let i = 0; i < 16; i++) {
      await H.sleep(3000);
      text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (/day\(s\)|Total \d+ results|No results? found/i.test(text)) break;
    }

    // ---- ④ 抽结构化行：优先页内 API（深链解析后的 code），再退 DOM 正则 ----
    const api = await fetchApi(oP.code, dP.code);
    let rows = api && Array.isArray(api.scheduleLines) ? oneRowsFromLines(api.scheduleLines) : [];
    if (!rows.length) {
      try {
        const tmp = [];
        const re = /(\d{4}-\d{2}-\d{2}) ([A-Z ,()'\-]+?) (\d+) day\(s\) (Direct|Via [^\n]+?) ([A-Z ,()'\-]+?) Destination/g;
        let cm;
        while ((cm = re.exec(text)) !== null && tmp.length < 8) {
          tmp.push({ etd: cm[1], days: cm[3], direct: cm[4].startsWith('Direct'), via: cm[4] === 'Direct' ? '' : cm[4].slice(4).trim() });
        }
        const vm = [...text.matchAll(/Vessel\s+Voyage\s*\/\s*Service Lane\s+([^\n]+?)\s+([A-Z0-9]{2,}W?)\s*\//g)];
        tmp.forEach((r2, ix) => { if (vm[ix]) { r2.vessel = vm[ix][1].trim(); r2.voyage = vm[ix][2]; } });
        tmp.forEach((r2) => {
          const at = text.indexOf(r2.etd);
          if (at >= 0) {
            const dts = [...text.slice(at, at + 400).matchAll(/\d{4}-\d{2}-\d{2}/g)].map((x) => x[0]);
            if (dts.length > 1) r2.eta = dts[dts.length - 1];
          }
        });
        rows = tmp.filter((r2) => r2.vessel && r2.eta).map((r2) => ({
          vessel: r2.vessel, voyage: r2.voyage || '', etd: r2.etd, eta: r2.eta,
          transitDays: r2.days, via: r2.via || '', direct: !!r2.direct,
        }));
      } catch { rows = []; }
    }

    const mT = text.match(/total (\d+) results?/i);
    if (rows.length) return { msg: mkMsg(rows, `deep link${mT ? ` (Total ${mT[1]} results)` : ''}`), schedules: rows };
    // 抽不到结果 = 保持兜底 prefilled（不抛未捕获异常；官网确实无结果时注明）
    return { msg: `${mkMsg([], `deep link${mT ? ` (Total ${mT[1]} results)` : ''}`)}${/no results? found/i.test(text) ? ' | no results per site' : ''}` };
  },
};
