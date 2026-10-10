
// OOCL：填好表单再搜 → 接 captchaCallback 的 token
import { launch, sleep } from '../engine/browser.mjs';
const r0 = await launch({});
const ctx = r0.ctx || r0;
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(6000);
await page.evaluate(() => {
  window.__tokens = [];
  if (typeof window.captchaCallback === 'function') {
    const o = window.captchaCallback;
    window.captchaCallback = (t, ...r) => { try { window.__tokens.push({ type: typeof t, keys: t && typeof t === 'object' ? Object.keys(t).slice(0, 15) : null, preview: JSON.stringify(t).slice(0, 300) }); } catch (e) { window.__tokens.push('ERR ' + String(e).slice(0, 60)); } try { return o(t, ...r); } catch { return undefined; } };
  }
}).catch(() => {});
// 填两个港（复刻配方的选法）
const pick = async (ng, word) => {
  const inp = page.locator(`input[ng-model="${ng}"]`);
  await inp.click({ timeout: 15000 });
  await inp.fill('').catch(() => {});
  await page.keyboard.type(word, { delay: 80 });
  for (let i = 0; i < 18; i++) {
    await sleep(400);
    const got = await page.evaluate((w) => {
      const lists = [...document.querySelectorAll('ul')].filter((l) => l.offsetParent !== null && /th-dropdown-menu/.test(l.className) && l.querySelectorAll('li').length);
      if (!lists.length) return null;
      const li = [...lists[0].querySelectorAll('li')].find((x) => new RegExp(w, 'i').test(x.textContent || ''));
      if (!li) return null;
      (li.querySelector('a, span') || li).click();
      return (li.textContent || '').trim().slice(0, 40);
    }, word).catch(() => null);
    if (got) return got;
  }
  return null;
};
console.log('起点:', await pick('user.origin', 'Ningbo'));
console.log('终点:', await pick('user.destination', 'Hamburg'));
// 点 Search
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button, a')].find((x) => /^search$/i.test((x.textContent || '').trim()) && x.offsetParent !== null);
  if (b) b.click();
}).catch(() => {});
await sleep(14000);
const out = await page.evaluate(() => ({ tokens: window.__tokens || [], widget: !!document.querySelector('[class*=verifybox], [class*=verify-img]'), bodyHasCaptcha: /captcha|verify|滑动|验证/i.test(document.body.innerText.slice(0, 3000)) }));
console.log('── 结果:');
console.log('  token 收到:', JSON.stringify(out.tokens));
console.log('  widget 出现:', out.widget, ' 页面含验证码字样:', out.bodyHasCaptcha);
console.log('  当前 URL:', page.url().slice(0, 110));
await ctx.close().catch(() => {});
