// Hapag legacy 页诊断：按钮结构 + 真实键盘输入 + 网络监听（点击/回车哪个能触发提交）
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';

const BL = process.env.BL || 'HLCUTS12609DETN4';
const r = await launchHeadedQuiet();
console.log('mode:', r.mode);
const ctx = r.ctx;
const page = ctx.pages().find((p) => !p.isClosed()) || (await ctx.newPage());

const reqs = [];
page.on('request', (q) => {
  const u = q.url();
  if (q.method() !== 'GET' || /_a=|tracing|search|submit/i.test(u)) reqs.push(`${q.method()} ${u.slice(0, 170)}`);
});
page.on('framenavigated', (f) => { if (f === page.mainFrame()) reqs.push('NAV ' + f.url().slice(0, 150)); });

try {
  await page.goto('https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution-legacy.html', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto err', String(e).slice(0, 100)));

  let ok = false;
  for (let i = 0; i < 70; i++) {
    await sleep(2500);
    const n = await page.locator('input[id="tracing_by_booking_f:hl16"]').count().catch(() => 0);
    if (n) { ok = true; console.log(`form ready @${i * 2.5}s`); break; }
    if (i % 8 === 0) console.log(`[w.${i}] waiting form…`);
  }
  if (!ok) { console.log('NO FORM'); } else {
    const info = await page.evaluate(() => {
      const b = document.getElementById('tracing_by_booking_f:hl18');
      const cand = [...document.querySelectorAll('button, input[type="submit"], input[type="button"], a')]
        .map((x) => ({ tag: x.tagName, id: x.id || '', t: (x.innerText || x.value || '').trim().slice(0, 22) }))
        .filter((x) => /find|clear|search/i.test(x.t + ' ' + x.id)).slice(0, 12);
      const form = document.querySelector('form');
      return {
        hl18: b ? { tag: b.tagName, type: b.type, html: (b.outerHTML || '').slice(0, 260) } : null,
        cand,
        form: form ? { action: String(form.getAttribute('action') || '').slice(0, 140), method: form.method } : null,
      };
    });
    console.log('BTN/DOM:', JSON.stringify(info, null, 1).slice(0, 2200));

    // 真实键盘输入（focus → 逐字）
    const SEL = 'input[id="tracing_by_booking_f:hl16"]';
    await page.click(SEL).catch(() => {});
    await page.locator(SEL).pressSequentially(BL, { delay: 60 }).catch((e) => console.log('type err', String(e).slice(0, 80)));
    console.log('typed:', await page.locator(SEL).inputValue().catch(() => ''));
    await sleep(1000);
    await page.click('#tracing_by_booking_f\\:hl18').catch((e) => console.log('click err', String(e).slice(0, 80)));
    await sleep(6000);
    console.log('after-click reqs:', JSON.stringify(reqs.slice(-12), null, 1));
    if (!reqs.some((x) => /POST|_a=|NAV/.test(x))) {
      console.log('→ 无提交迹象，试 Enter');
      await page.focus(SEL).catch(() => {});
      await page.keyboard.press('Enter');
      await sleep(7000);
      console.log('after-Enter reqs:', JSON.stringify(reqs.slice(-12), null, 1));
    }
    const st = await page.evaluate(() => ({ url: location.href, len: (document.body.innerText || '').length, head: (document.body.innerText || '').slice(0, 500) })).catch(() => ({}));
    console.log('FINAL:', JSON.stringify(st).slice(0, 900));
  }
} finally {
  await ctx.close().catch(() => {});
  console.log('closed');
}
