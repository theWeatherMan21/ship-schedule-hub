
// 轻量页测速：不打开完整 SPA，只打开同域的一个小页面，能不能照样发站内接口？
import { launch, sleep } from '../engine/browser.mjs';
const r0 = await launch({});
const ctx = r0.ctx || r0;
const page = ctx.pages()[0] || (await ctx.newPage());
const t0 = Date.now();
// ① 轻量页：随意的 404 路径（同源即可）
const r = await page.goto('https://www.hapag-lloyd.com/__probe__', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => null);
console.log('轻量页加载: HTTP ' + (r ? r.status() : 'ERR') + '  ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
const t1 = Date.now();
// ② 在轻量页里发 hapag 的站内接口
const out = await page.evaluate(async () => {
  try {
    const resp = await fetch('https://schedule.api.hlag.cloud/api/routes?startLocation=CNNGB&endLocation=DEHAM&startDate=2026-10-10&startHaulage=MERCHANT&endHaulage=MERCHANT&containerType=42GP', { headers: { accept: 'application/json', 'x-token': 'public' } });
    const t = await resp.text();
    let j = null; try { j = JSON.parse(t); } catch { /* 非 JSON */ }
    return { status: resp.status, routes: Array.isArray(j && j.routes) ? j.routes.length : -1, head: t.slice(0, 80) };
  } catch (e) { return { status: -1, err: String(e).slice(0, 90) }; }
});
console.log('轻量页里发接口: HTTP ' + out.status + ' routes=' + out.routes + '  ' + ((Date.now() - t1) / 1000).toFixed(1) + 's  ' + (out.head || out.err || ''));
await ctx.close().catch(() => {});
