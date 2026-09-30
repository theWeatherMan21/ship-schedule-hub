// OOCL 窗口探针：抓页面自己发的 searchHubToHubRoute 请求体，然后试更宽日期范围看能不能多拿船期。
// 起因：用户报「船期条数太少」，ONE 已确认是窗口太窄；OOCL 只剩 3 条，怀疑同样是默认窗口问题。
// 用法：node qa/probe-oocl-window.mjs Ningbo Istanbul
import { launch, openPage, quietWindow, sleep } from '../engine/browser.mjs';
import oocl from '../engine/recipes/oocl.mjs';
import { dismissCookies, isBlockPage } from '../engine/lib/utils.mjs';
import { withTimeout } from '../engine/lib/dom.mjs';

const origin = process.argv[2] || 'Ningbo';
const dest = process.argv[3] || 'Istanbul';

const H = { dismissCookies, isBlockPage, sleep, withTimeout, shot: async () => null };

const ctx = await launch({});
try {
  await quietWindow(ctx, 'minimized').catch(() => {});
  const { page } = await openPage(ctx, oocl.entry);
  // 装请求钩子：记录所有 XHR/fetch 的 URL + 请求体 + 响应行数
  await page.evaluate(() => {
    window.__reqs = [];
    const XO = XMLHttpRequest.prototype.open;
    const XS = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u, ...r) { this.__m = m; this.__u = u; return XO.call(this, m, u, ...r); };
    XMLHttpRequest.prototype.send = function (b) {
      const rec = { m: this.__m, u: this.__u, body: typeof b === 'string' ? b : '' };
      window.__reqs.push(rec);
      this.addEventListener('load', () => { try { const j = JSON.parse(this.responseText); rec.keys = Object.keys(j || {}).slice(0, 8); rec.rows = Array.isArray(j?.data) ? j.data.length : (Array.isArray(j?.rows) ? j.rows.length : (j?.data?.length ?? null)); } catch { /* 非 JSON */ } });
      return XS.call(this, b);
    };
    const of = window.fetch;
    window.fetch = async (u, o = {}) => {
      const rec = { m: o.method || 'GET', u: String(u), body: typeof o.body === 'string' ? o.body : '' };
      window.__reqs.push(rec);
      const r = await of(u, o);
      try { const j = await r.clone().json(); rec.keys = Object.keys(j || {}).slice(0, 8); rec.rows = Array.isArray(j?.data) ? j.data.length : null; } catch { /* 忽略 */ }
      return r;
    };
  });

  const q = {
    origin, destination: dest,
    originText: origin.toLowerCase(), destText: dest.toLowerCase(),
    _o: { locode: 'CNNGB', name: origin, text: origin.toLowerCase() },
    _d: { locode: 'TRIST', name: dest, text: dest.toLowerCase() },
  };
  console.log('── 跑一次 OOCL 配方（能看到几次搜索请求）…');
  const rows = await withTimeout(oocl.run(page, q, H), 120000, '配方超时').catch((e) => { console.log('配方异常:', e.message); return []; });
  console.log(`  配方返回 ${rows?.length || 0} 条`);

  const reqs = await page.evaluate(() => window.__reqs.filter((r) => /search|route|schedule/i.test(r.u || '')).slice(-8));
  console.log('\n── 抓到的相关请求:');
  for (const r of reqs) {
    console.log(`  ${r.m} ${String(r.u).slice(0, 120)}`);
    if (r.body) console.log(`      body: ${r.body.slice(0, 600)}`);
    if (r.rows != null) console.log(`      返回条数: ${r.rows}`);
  }

  // 用页面自己的 fetch 重发（带 session），只改 weeks 看条数上限
  const hit = page && reqs.find((r) => r.body && /search/i.test(r.u || ''));
  if (hit) {
    console.log('\n── 只改 body.weeks 重发，看条数上限:');
    const out = await page.evaluate(async (h) => {
      const shape = (j) => {
        if (Array.isArray(j)) return `array(${j.length})`;
        if (!j || typeof j !== 'object') return typeof j;
        return Object.entries(j).map(([k, v]) => {
          if (Array.isArray(v)) return `${k}:array(${v.length})`;
          if (v && typeof v === 'object') {
            const inner = Object.entries(v).map(([k2, v2]) => Array.isArray(v2) ? `${k2}:array(${v2.length})` : `${k2}:${typeof v2}`).join(',');
            return `${k}:{${inner}}`;
          }
          return `${k}:${typeof v}`;
        }).join(' | ');
      };
      const res = [];
      for (const wk of ['2', '4', '6', '8', '12', '26']) {
        const body = JSON.parse(h.body);
        body.weeks = wk;
        try {
          const r = await fetch(h.u, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'include' });
          const j = await r.json().catch(() => null);
          res.push({ weeks: wk, status: r.status, shape: shape(j).slice(0, 300) });
        } catch (e) { res.push({ weeks: wk, err: String(e).slice(0, 100) }); }
      }
      return res;
    }, hit).catch((e) => [{ err: String(e).slice(0, 150) }]);
    for (const r of out) console.log('  ', JSON.stringify(r));
  } else {
    console.log('\n  ⚠️ 没抓到带 body 的搜索请求');
  }
} finally {
  await ctx.close().catch(() => {});
}
