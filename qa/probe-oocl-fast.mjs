
// OOCL 快路验证：页面里拿 token → 直接发搜索接口
import { launch, sleep } from '../engine/browser.mjs';
const r0 = await launch({});
const ctx = r0.ctx || r0;
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(5000);
// ① 挂钩收集回调对象（含 token）
await page.evaluate(() => {
  window.__cb = null;
  if (typeof window.captchaCallback === 'function') {
    const o = window.captchaCallback;
    window.captchaCallback = (t, ...r) => { try { window.__cb = t; } catch { /* */ } try { return o(t, ...r); } catch { return undefined; } };
  }
}).catch(() => {});
// ② 填表触发验证码
const pick = async (ng, word) => {
  const inp = page.locator(`input[ng-model="${ng}"]`);
  await inp.click({ timeout: 15000 });
  await inp.fill('').catch(() => {});
  await page.keyboard.type(word, { delay: 80 });
  for (let i = 0; i < 18; i++) {
    await sleep(400);
    const got = await page.evaluate((w) => {
      const lists = [...document.querySelectorAll('ul')].filter((l) => l.offsetParent !== null && /th-dropdown-menu/.test(l.className) && l.querySelectorAll('li').length);
      const li = lists.length ? [...lists[0].querySelectorAll('li')].find((x) => new RegExp(w, 'i').test(x.textContent || '')) : null;
      if (!li) return null;
      (li.querySelector('a, span') || li).click();
      return true;
    }, word).catch(() => null);
    if (got) break;
  }
};
await pick('user.origin', 'Ningbo');
await pick('user.destination', 'Hamburg');
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button, a')].find((x) => /^search$/i.test((x.textContent || '').trim()) && x.offsetParent !== null);
  if (b) b.click();
}).catch(() => {});
await sleep(6000);
// ③ 取 token
const cb = await page.evaluate(() => {
  const o = window.__cb || {};
  return { hasToken: !!o.token, token: String(o.token || '').slice(0, 70), result: o.result, a: String(o.a || '').slice(0, 20) };
});
console.log('回调对象: token 长度=' + cb.token.length + ' result=' + cb.result);
console.log('token 预览:', cb.token.slice(0, 45) + '…');
if (!cb.token) { console.log('✗ 没拿到 token'); await ctx.close(); process.exit(0); }
// ④ 在页面里直接发搜索（同源）
const t0 = Date.now();
const out = await page.evaluate(async ({ token }) => {
  const city = async (q, b) => {
    const r = await fetch(`https://moc.oocl.com/nj_prs_wss/mocss/secured/supportData/gsp/cityAutoComplete?userQuery=${encodeURIComponent(q)}&bound=${b}`).then((x) => x.json()).catch(() => null);
    const h = r && r.data && r.data.results && r.data.results[0];
    return h ? h._id : null;
  };
  const o = await city('Ningbo', 'OB'); const d = await city('Hamburg', 'IB');
  const body = { date: '2026-10-10', displayDate: '2026-10-10', transhipment_Port: null, port_of_Load: null, port_of_Discharge: null, sailing: 'sailing.from', weeks: '12', transhipment_PortId: null, service: null, port_of_LoadId: null, port_of_DischargeId: null, origin_Haulage: 'cy', destination_Haulage: 'cy', cargo_Nature: 'dry', originId: o, destinationId: d, origin: 'Ningbo, Zhejiang, China', destination: 'Hamburg, Germany', captchaToken: token, captchaAppKey: '1dc597b617744cb49c97e20b523931e1', weeksSymbol: '+' };
  const r = await fetch('https://moc.oocl.com/nj_prs_wss/mocss/secured/supportData/nsso/searchHubToHubRoute', { method: 'POST', headers: { 'Content-Type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) }).then(async (x) => ({ s: x.status, t: await x.text() })).catch((e) => ({ s: -1, t: String(e) }));
  let j = null; try { j = JSON.parse(r.t); } catch {}
  return { s: r.s, ok: j && j.success, err: j && j.errorInfo, routes: j && j.data && j.data.standardRoutes ? j.data.standardRoutes.length : -1, head: r.t.slice(0, 120) };
}, { token: cb.token });
console.log('搜索接口: HTTP ' + out.s + ' success=' + out.ok + ' routes=' + out.routes + ' ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
console.log('  err/head:', out.err || out.head);
await ctx.close().catch(() => {});
