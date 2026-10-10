
// OOCL 有头+最小化：widget 会不会渲染出来？渲染了就程序自己解（Canvas 找缺口 + 真鼠标拖）
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
const { ctx, mode } = await launchHeadedQuiet();
console.log('启动模式:', mode);
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(6000);
await page.evaluate(() => {
  window.__cb = null;
  if (typeof window.captchaCallback === 'function') {
    const o = window.captchaCallback;
    window.captchaCallback = (t, ...r) => { try { window.__cb = t; } catch { /* */ } try { return o(t, ...r); } catch { return undefined; } };
  }
}).catch(() => {});
const pick = async (ng, word) => {
  const inp = page.locator(`input[ng-model="${ng}"]`);
  await inp.click({ timeout: 15000 }); await inp.fill('').catch(() => {});
  await page.keyboard.type(word, { delay: 80 });
  for (let i = 0; i < 18; i++) {
    await sleep(400);
    const ok = await page.evaluate((w) => {
      const lists = [...document.querySelectorAll('ul')].filter((l) => l.offsetParent !== null && /th-dropdown-menu/.test(l.className) && l.querySelectorAll('li').length);
      const li = lists.length ? [...lists[0].querySelectorAll('li')].find((x) => new RegExp(w, 'i').test(x.textContent || '')) : null;
      if (!li) return null; (li.querySelector('a, span') || li).click(); return true;
    }, word).catch(() => null);
    if (ok) break;
  }
};
await pick('user.origin', 'Ningbo'); await pick('user.destination', 'Hamburg');
await page.evaluate(() => { const b = [...document.querySelectorAll('button, a')].find((x) => /^search$/i.test((x.textContent || '').trim()) && x.offsetParent !== null); if (b) b.click(); }).catch(() => {});
// 每 1.5s 扫 12 秒，看验证码元素有没有渲染
let found = [];
for (let i = 0; i < 8; i++) {
  await sleep(1500);
  found = await page.evaluate(() => {
    const out = [];
    const scan = (root) => { for (const el of root.querySelectorAll('*')) { const c = (el.className || '').toString(); if (/verify|move-block|bar-area|captcha/i.test(c)) { const r = el.getBoundingClientRect(); if (r.width > 10) out.push({ cls: c.slice(0, 46), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }); } if (el.shadowRoot) scan(el.shadowRoot); } };
    try { scan(document); } catch { /* */ }
    return out.slice(0, 6);
  }).catch(() => []);
  if (found.length) { console.log('第 ' + ((i + 1) * 1.5) + 's 验证码元素出现:'); for (const f of found) console.log('   ' + JSON.stringify(f)); break; }
}
if (!found.length) console.log('12 秒内仍无可见验证码元素');
const cb = await page.evaluate(() => ({ has: !!((window.__cb || {}).token), result: (window.__cb || {}).result }));
console.log('回调:', JSON.stringify(cb));
await ctx.close().catch(() => {});
