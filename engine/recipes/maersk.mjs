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

    let resolved = null;   // 先声明（dWords 会用到）
    // ---- 港名写法序列（同一城市在马士基库里可能是不同条目：Tianjin vs Xingang(Tianjin)）----
    // 爹地 10-09 实证：Xingang (Tianjin) → Haifa 官网有 2 条；我们只递 Tianjin 就回 No schedules available。
    // 「同一实体的等价写法必须应用到每条取数路径」（API 直达 / 深链 / 表单）—— 只改一条 = 用户回"依旧有问题"。
    const pureWord = (r) => {
      const t = String(r?.text || '');
      if (/\(/.test(t)) return t.split('(')[0].trim();
      const w = String(r?.word || '');
      return r?.name || (t && t.split(/\s+/).length <= 3 ? t : w) || t;
    };
    const uniqWords = (arr) => arr.map((x) => String(x || '').trim()).filter((x, i, a) => x && a.indexOf(x) === i);
    const oWords = uniqWords([
      pureWord(q._o) || oName,                                        // 纯地名（天津 = Tianjin）
      ...(q.originVariants || []).filter((x) => !/[()]/.test(x)),      // 马士基不认 "Tianjin (CNTNJ)" 这类写法，去掉
    ]).slice(0, 4);
    const dWords = uniqWords([dName, ...(q.destVariants || []), ...((resolved && resolved.dList) ? resolved.dList.map((x) => x.word) : [])]).slice(0, 5);
    // ---- ① 页内 API 直取 + ② 深链（最快，无需导航）：按起运港写法逐个试 ----
    for (const oWordTry of oWords) {
      let rv = null;
      try { rv = await maerskResolve(page, oWordTry, dName, q._o?.locode, q._d?.locode); } catch { /* 下一种写法 */ }
      if (rv && !rv.error && rv.dList && rv.dList.length) { resolved = rv; break; }
    }
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

    // ⚠️ 10-09 修：原来用 getByRole('option') 抓**全页面**的候选 —— 马士基页面上别的下拉
    //   （Containers / Boxes & Pallets / Departing…）也挂在同一 role 上，且列表里排在最前；
    //   老代码「匹配不中就点第 0 个」= 点到了集装箱类型 → 起运港没填对 → 官网回 No schedules available。
    //   现在：① 只在**该字段自己展开的下拉**里找；② 过滤掉非港口项；③ 必须与所打词相关；
    //   ④ 命中不了就返回 null（换下一种写法），**绝不盲点**；⑤ 用真实鼠标点（DOM click 不触发它的选择回调）。
    const pickMaersk = async (field, word, which) => {
      await field.click({ timeout: 8000 }).catch(() => {});
      await field.fill('').catch(() => {});
      await field.type(word, { delay: 80, timeout: 10000 }).catch(() => { try { field.pressSequentially(word, { delay: 80 }); } catch { /* no-op */ } });
      const key = String(word).toLowerCase().replace(/[^a-z]/g, '').slice(0, 5);
      // ⚠️ 关键：马士基的候选**没有显式 role 属性**（DOM 里 querySelectorAll('[role=option]') 抓不到），
      //   必须用 Playwright 的 ARIA 查找 getByRole('option')（读的是无障碍树）。10-09 实测踩过。
      //   另：页面上别的下拉（Containers / Boxes & Pallets / Departing…）也在这个 role 里且排最前 ——
      //   老代码"匹配不中就点第 0 个"正是点到了集装箱类型 → 起运港没填对 → 官网回 No schedules available。
      const cands = page.getByRole('option');
      for (let i = 0; i < 7; i++) {
        await H.sleep(1000);
        const n = await cands.count().catch(() => 0);
        if (!n) continue;
        const items = [];
        for (let k = 0; k < Math.min(n, 22); k++) {
          const c = cands.nth(k);
          // ⚠️ 别用 innerText：马士基的自定义组件（Shadow DOM）上 innerText 返回空串 ——
          //   技能里记过这条，10-09 又踩一次。用 textContent 读，空了再退 ariaSnapshot。
          let t = ((await c.textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
          if (!t) t = ((await c.ariaSnapshot().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
          if (!t || t.length > 90) continue;
          if (/^(containers|boxes & pallets|boxes|departing( by)?|arriving( by)?|20'|40'|45'|dry|reefer|export|import|english|notifications)$/i.test(t)) continue;
          if (!/\b(CY|SD)\b/i.test(t) && !/\(.+\)/.test(t)) continue;          // 港口候选必带 (城市) 或 CY/SD
          if (key && !t.toLowerCase().replace(/[^a-z]/g, '').includes(key)) continue;
          const bb = await c.boundingBox().catch(() => null);
          if (!bb || bb.width < 40 || bb.height < 6) continue;
          items.push({ t, cy: /\bCY\b/i.test(t), sd: /\bSD\b/i.test(t), idx: k, x: bb.x + Math.min(60, bb.width / 2), y: bb.y + bb.height / 2 });
        }
        if (process.env.SSH_DEBUG_PICK) console.error('[maersk][pick] word=' + word + ' 总选项=' + n + ' 过滤后=' + items.length + ' ' + JSON.stringify(items.map((o) => o.t).slice(0, 6)));
        if (!items.length) continue;
        let best = null, bestScore = -1;
        for (const o of items) {
          let sc = 0;
          try { if (H.portPick(o.t, q, which)) sc += 10; } catch { /* no-op */ }
          if (o.cy) sc += 3;
          if (!o.sd) sc += 1;
          if (sc > bestScore) { bestScore = sc; best = o; }
        }
        if (!best || bestScore <= 0) continue;
        await page.mouse.move(best.x, best.y);
        await page.mouse.click(best.x, best.y);      // 真实鼠标（DOM click 不触发选择回调）
        await H.sleep(1200);
        return best.t;
      }
      return null;
    };
    const from = page.getByRole('combobox', { name: /from \(city, country\/region\)/i }).first();
    const fromOk = await from.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false);
    if (!fromOk) throw new Error(`深链无结果且表单未出现（${(resolved && resolved.error) || 'geo?'}）`);
    let pO = null, usedWord = '';
    for (const w of oWords) {                       // 起运港也逐个试写法（原来只试一种就放弃）
      pO = await pickMaersk(from, w, 'origin');
      if (pO) { usedWord = w; break; }
    }
    if (!pO) throw new Error(`起运港候选未出（${oWords.join('/')}）`);
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
      await H.setValue(date, q.date.dd_mm_yyyy);   // 留空=今天：别留空，部分站会校验失败
      await page.keyboard.press('Escape').catch(() => {});
    }
    const search = page.getByRole('button', { name: /^\s*search\s*$/i }).first();
    if (!(await search.isVisible().catch(() => false))) throw new Error('找不到 Search 按钮');
    await search.click({ timeout: 8000 });
    let text = await pollText();
    let rows = parseCards(text);
    // 官网回「No schedules available」时**先怀疑自己递的港名**（爹地 10-09 实证：Xingang(Tianjin) 明明有 2 条），
    // 换下一种写法重填重查一次，别直接把锅甩给官网。
    if (!rows.length && /no schedules available/i.test(text)) {
      for (const w of oWords.filter((x) => x !== usedWord)) {
        const p2 = await pickMaersk(from, w, 'origin').catch(() => null);
        if (!p2) continue;
        await search.click({ timeout: 8000 }).catch(() => {});
        text = await pollText();
        rows = parseCards(text);
        if (rows.length) { usedWord = w; break; }
        if (!/no schedules available/i.test(text)) break;
      }
    }
    if (rows.length) return { msg: mkMsg(rows, `表单搜索（兜底路径·${usedWord}）`), schedules: rows };
    if (/no schedules available/i.test(text)) throw new Error(`表单搜索：官网回「No schedules available」（已试写法 ${oWords.join('/')}）`);
    throw new Error(`搜索后未见结果回显（len=${text.length}）`);
  },
};
