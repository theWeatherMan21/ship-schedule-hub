// Maersk 马士基 —— 9-29 重写（婉宜）
// 现状：旧的 TRIST→Ambarli 硬映射 + 表单点选 + 卡片正则，9-29 部署态跑 Ningbo→Istanbul 153s 无结果
//       （报「搜索后未见结果回显 len=1291」）。实测根因 = 城市级目的地映射 + 结果页渲染时序不稳。
// 9-29 实测结论（证据 qa/probe-out/maersk-*.json / maersk-deeplink-TRAMB-CY.txt）：
//   ① 官网目的地候选**现在有** 3 条 Istanbul 相关：Ambarli Port Istanbul CY（TRAMB）、Istanbul CY（TRIST）、Istanbul SD
//   ② **TRIST（Istanbul 城市级 CY）对本航线无船期**：官网 "No schedules available"，API 直接 HTTP 422
//      → 马士基卖的是 Ambarli（TRAMB，UN=TRAMR，"Ambarli Port Istanbul, Turkey CY"），与 9-21 结论一致
//   ③ SPA 深链 `/schedules/pointToPoint?from=<GEO>&to=<GEO>&fromRkstCode=..&toRkstCode=..&…`
//      直接 goto **能渲染 5 张卡片**（MOGENS MAERSK 639W 25d22h / Maersk El Bosque 640W / MAREN MAERSK 641W …）
//   ④ 结果 API = POST api.maersk.com/routing-unified/routing/routings-queries（公开 consumer-key，页内 fetch）
// 三级路径（前面的通了就返回）：
//   ① page 内 API 直取（maerskInPage：geography 解析 GEO_ID → routings-queries，结构化船期）
//   ② SPA 深链 goto + 卡片解析（走官网自己的带鉴权请求）
//   ③ 表单点选（老路径兜底，纯地名打字 + CY 候选 + 回读校验）
import { maerskResolve, maerskQuery, maerskRowsFromRoutings } from '../fastpath.mjs';

// 日期：深链默认窗口 numberOfWeeks=4（起 明天，止 +29 天），与官网一跳一致
const addDays = (iso, n) => { const t = new Date(`${iso}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

export default {
  id: 'maersk',
  name: 'Maersk 马士基',
  code: 'MAEU',
  kind: 'dom',
  entry: 'https://www.maersk.com/schedules/pointToPoint',
  urls: ['https://www.maersk.com/schedules/pointToPoint', 'https://www.maersk.com/schedules/'],
  timeoutMs: 150000,   // 深链往返 + 卡片轮询 + 表单兜底
  async run(page, q, H) {
    await H.dismissCookies(page);
    if (await H.isBlockPage(page)) await H.waitThroughChallenge(page, 12000);
    if (await H.isBlockPage(page)) throw new Error('反爬拦截');

    const oName = q._o?.name || String(q.originText || '').split(/[,(]/)[0].trim();
    const dName = q._d?.name || String(q.destText || '').split(/[,(]/)[0].trim();
    const iso = String(q.raw?.date || new Date().toISOString().slice(0, 10));
    const earliest = addDays(iso, 1), latest = addDays(iso, 29);

    // ---- 卡片解析（官网结果页 innerText 结构，双线实测）----
    const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
    const fmt = (s) => { const m = /^(\d{1,2}) (\w{3}) (\d{4})$/.exec(String(s).trim()); return m ? `${m[3]}-${MONTHS[m[2]] || m[2]}-${String(m[1]).padStart(2, '0')}` : s; };
    const parseCards = (text) => {
      const out = [];
      try {
        const cardRe = /Departure\n\s*(\d{1,2} \w{3} \d{4})\n[^\n]+\nArrival\n\s*(\d{1,2} \w{3} \d{4})\n[^\n]+\nVessel\/Voyage\n([^\n]+?)((?:\d+[W]?)?)\nTransit Time:(\d+) days? (\d+)? hours?/gi;
        let cm;
        while ((cm = cardRe.exec(text)) !== null && out.length < 12) {
          out.push({
            vessel: cm[3].trim(), voyage: cm[4].trim(),
            etd: fmt(cm[1]), eta: fmt(cm[2]),
            transitDays: Number(cm[5]) || cm[5],
            via: '', direct: true,
          });
        }
      } catch { /* 保持 prefilled */ }
      return out;
    };
    const pollText = async (msTotal = 48000, step = 3000) => {
      let text = '';
      for (let i = 0; i < Math.ceil(msTotal / step); i++) {
        await H.sleep(step);
        text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
        if (/vessel\/voyage|no schedules available/i.test(text)) break;
      }
      return text;
    };
    const mkMsg = (rows, how) => `${how}：${q.originText} → ${q.destText}` +
      (rows.length ? `，${rows.length} 条：` + rows.slice(0, 3).map((r) => `${r.vessel} ${r.voyage} ETD ${r.etd} → ${r.eta} ${r.transitDays}天`).join(' ｜ ') : '');

    // ---- ① 页内 API 直取（最快，无需导航）----
    let resolved = null;
    try { resolved = await maerskResolve(page, oName, dName, q._o?.locode, q._d?.locode); } catch { /* 走下一档 */ }
    if (resolved && !resolved.error) {
      const tried = [...resolved.tried];
      for (const d of resolved.dList) {
        let qr = null;
        try { qr = await maerskQuery(page, resolved.o.geo, d.geo, earliest, latest); } catch { /* 下一候选 */ }
        if (!qr || qr.status !== 200 || !qr.routings || !qr.routings.length) { tried.push(`${d.rkst}:HTTP${qr ? qr.status : '?'}`); continue; }
        const rows = maerskRowsFromRoutings(qr.routings);
        if (rows.length) return { msg: mkMsg(rows, `API 直取（${resolved.o.cityName} → ${d.cityName}）`), schedules: rows };
        tried.push(`${d.rkst}:0条`);
      }

      // ---- ② SPA 深链：走官网自己带鉴权的请求，直接渲染结果页 ----
      for (const d of resolved.dList) {
        const deep = 'https://www.maersk.com/schedules/pointToPoint?' + [
          `from=${resolved.o.geo}`, `to=${d.geo}`,
          `fromRkstCode=${resolved.o.rkst}`, `toRkstCode=${d.rkst}`,
          'containerIsoCode=45G1', 'fromServiceMode=CY', 'toServiceMode=CY',
          'numberOfWeeks=4', 'dateType=D', `date=${earliest}`, `dateTo=${latest}`, 'vesselFlag=',
        ].join('&');
        await page.goto(deep, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
        const text = await pollText();
        const rows = parseCards(text);
        if (rows.length) return { msg: mkMsg(rows, `深链结果页（${resolved.o.cityName} → ${d.cityName}）`), schedules: rows };
      }
    }

    // ---- ③ 表单点选兜底（老路径：纯地名打字 → CY 候选 → 回读校验）----
    // 目的地仍按「能出船期的服务港」优先：词典城市名 + 同城别名（istanbul → ambarli）
    const pureWord = (r) => {
      const t = String(r?.text || '');
      if (/\(/.test(t)) return t.split('(')[0].trim();
      const w = String(r?.word || '');
      return r?.name || (t && t.split(/\s+/).length <= 3 ? t : w) || t;
    };
    const oWord = pureWord(q._o) || oName;
    const dWords = [dName, ...(resolved && resolved.dList ? resolved.dList.map((x) => x.word) : [])].filter(Boolean);
    const pickMaersk = async (field, word, which) => {
      await field.click({ timeout: 8000 }).catch(() => {});
      await field.fill('').catch(() => {});
      await field.type(word, { delay: 80, timeout: 10000 }).catch(() => { try { field.pressSequentially(word, { delay: 80 }); } catch { /* no-op */ } });
      const cands = page.getByRole('option', { name: /.+/ });
      for (let i = 0; i < 20; i++) {
        await H.sleep(1000);
        const n = await cands.count().catch(() => 0);
        if (n <= 0) continue;
        const texts = [];
        for (let k = 0; k < Math.min(n, 12); k++) {
          let s = ''; try { s = await cands.nth(k).ariaSnapshot(); } catch { /* no-op */ }
          texts.push((s || '').replace(/\s+/g, ' ').trim());
        }
        if (texts.every((t) => !t || /loading/i.test(t))) continue;
        let idx = texts.findIndex((t) => H.portPick(t, q, which));
        if (idx < 0) idx = texts.findIndex((t) => /\bCY\b/.test(t));
        if (idx < 0) idx = 0;
        await cands.nth(idx).click({ timeout: 5000 }).catch(() => {});
        await H.sleep(1000);
        return texts[idx];
      }
      return null;
    };
    const from = page.getByRole('combobox', { name: /from \(city, country\/region\)/i }).first();
    const fromOk = await from.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
    if (!fromOk) throw new Error(`深链无结果且表单未出现（${(resolved && resolved.error) || 'geo?'}）`);
    const pO = await pickMaersk(from, oWord, 'origin');
    if (!pO) throw new Error(`起运港候选未出（${oWord}）`);
    await H.sleep(600);
    const to = page.getByRole('combobox', { name: /to \(city, country\/region\)/i }).first();
    let pD = null;
    for (const w of dWords) {
      pD = await pickMaersk(to, w, 'dest');
      if (pD) break;
    }
    if (!pD) throw new Error(`目的港候选未出（${dWords.join('/')}）`);

    const date = page.locator('input[placeholder="DD/MM/YYYY"], input[placeholder="dd/mm/yyyy"]').first();
    if (await date.count().catch(() => 0)) {
      if (!q.skipDate) await H.setValue(date, q.date.dd_mm_yyyy);
      await page.keyboard.press('Escape').catch(() => {});
    }
    const search = page.getByRole('button', { name: /^\s*search\s*$/i }).first();
    if (!(await search.isVisible().catch(() => false))) throw new Error('找不到 Search 按钮');
    await search.click({ timeout: 8000 });
    const text = await pollText();
    const rows = parseCards(text);
    if (rows.length) return { msg: mkMsg(rows, '表单搜索（兜底路径）'), schedules: rows };
    if (/no schedules available/i.test(text)) throw new Error('表单搜索：官网回「No schedules available」');
    throw new Error(`搜索后未见结果回显（len=${text.length}）`);
  },
};
