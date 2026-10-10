
// OOCL：搜一次（失败）→ 等验证码弹窗 → 全面找它（含 shadow root）
import { launch, sleep } from '../engine/browser.mjs';
const r0 = await launch({});
const ctx = r0.ctx || r0;
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(5000);
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
// 等弹窗（最多 20 秒），每 2 秒扫一次（含 shadow root）
for (let i = 0; i < 10; i++) {
  await sleep(2000);
  const s = await page.evaluate(() => {
    const found = [];
    const scan = (root) => {
      for (const el of root.querySelectorAll('*')) {
        const cls = (el.className || '').toString();
        if (/verify|slide|captcha|puzzle|move-block|bar-area/i.test(cls) && el.offsetParent !== null && el.getBoundingClientRect().width > 20) {
          const r = el.getBoundingClientRect();
          found.push({ cls: cls.slice(0, 50), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
        }
        if (el.shadowRoot) scan(el.shadowRoot);
      }
    };
    try { scan(document); } catch { /* */ }
    return found.slice(0, 8);
  }).catch(() => []);
  if (s.length) { console.log('第 ' + ((i + 1) * 2) + ' 秒发现可见验证码元素:'); for (const f of s) console.log('   ' + JSON.stringify(f)); break; }
  if (i === 9) console.log('20 秒内没有可见的验证码元素（弹窗未出现）');
}
await ctx.close().catch(() => {});
