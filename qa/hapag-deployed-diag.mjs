// hapag 部署态诊断：用部署态 profile，dump 表单与候选状态（婉宜 9-23）
import { launchHeadedQuiet, sleep, windowBounds } from '../engine/browser.mjs';

const { ctx, mode } = await launchHeadedQuiet();
console.log('模式:', mode, '| 窗口:', (await windowBounds(ctx)).windowState);
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://www.hapag-lloyd.com/solutions/vessel-schedule/#/?language=en', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});

for (let i = 1; i <= 10; i++) {
  await sleep(4000);
  const st = await page.evaluate(() => ({
    t: document.title.slice(0, 45), len: document.body.innerText.length,
    ch: /just a moment|security check|checking your browser/i.test(document.body.innerText),
  })).catch(() => ({ t: '?', len: -1, ch: true }));
  console.log(`  ${i * 4}s: "${st.t}" len=${st.len} 挑战=${st.ch}`);
  if (!st.ch && st.len > 800) break;
}

const inputs = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('input').forEach((e) => {
    out.push({ type: e.type || '', aria: e.getAttribute('aria-label') || '', ph: (e.placeholder || '').slice(0, 26), vis: !!e.offsetParent, id: (e.id || '').slice(0, 20) });
  });
  return out.slice(0, 10);
});
console.log('全部 input:', JSON.stringify(inputs, null, 1));

const searches = await page.locator('input[type=search]').count().catch(() => -1);
console.log('input[type=search] 数量:', searches);

if (searches > 0) {
  const o = page.locator('input[type=search]').nth(0);
  console.log('第0个可见:', await o.isVisible().catch(() => false));
  await o.click({ timeout: 8000 }).catch((e) => console.log('点击失败:', e.message.slice(0, 50)));
  await sleep(500);
  await page.keyboard.type('ningbo', { delay: 80 });
  for (let i = 0; i < 8; i++) {
    await sleep(2500);
    const cand = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('li, [role=option], [role=listbox] div, [class*=option], [class*=suggest]').forEach((e) => {
        const t = (e.innerText || '').trim();
        if (t && t.length < 70 && /ningbo|china|zhejiang/i.test(t) && e.offsetParent) out.push({ tag: e.tagName, cls: (e.className || '').toString().slice(0, 40), t: t.slice(0, 45) });
      });
      const s = new Set();
      return out.filter((x) => { const k = x.t; if (s.has(k)) return false; s.add(k); return true; }).slice(0, 6);
    });
    console.log(`  ${(i + 1) * 2.5}s 候选(含ningbo): ${JSON.stringify(cand)}`);
    if (cand.length) break;
  }
  const allOpts = await page.evaluate(() => document.querySelectorAll('[role=option]').length);
  console.log('页面上 role=option 总数:', allOpts);
}
console.log('最终窗口:', (await windowBounds(ctx)).windowState);
await ctx.close().catch(() => {});
process.exit(0);
