// hapag + zim 表单结构探测（有头+最小化，过盾后 dump 表单）（婉宜 9-23）
import { launchHeadedQuiet, sleep, windowBounds } from '../engine/browser.mjs';

const { ctx, mode } = await launchHeadedQuiet();
console.log('启动模式:', mode);
const page = ctx.pages()[0] || (await ctx.newPage());
await sleep(1000);
console.log('窗口:', (await windowBounds(ctx)).windowState);

async function waitShield(p, label) {
  for (let i = 1; i <= 8; i++) {
    await sleep(4000);
    const st = await p.evaluate(() => ({
      t: document.title.slice(0, 50), len: document.body.innerText.length,
      ch: /just a moment|security check|checking your browser|access denied/i.test(document.body.innerText),
    })).catch(() => ({ t: '?', len: -1, ch: true }));
    if (!st.ch && st.len > 300) { console.log(`  [${label}] ${i * 4}s 过盾: "${st.t}" len=${st.len}`); return true; }
  }
  console.log(`  [${label}] ❌ 未过盾`);
  return false;
}

// ── hapag：从主页找船期入口
console.log('\n══ hapag');
await page.goto('https://www.hapag-lloyd.com/en/home.html', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
if (await waitShield(page, 'hapag')) {
  const links = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a').forEach((e) => {
      const t = (e.innerText || '').trim();
      if (/schedul|vessel|route|point.to.point/i.test(t + ' ' + e.href) && t.length < 45) out.push({ t: t.slice(0, 40), h: (e.href || '').slice(0, 95) });
    });
    const s = new Set();
    return out.filter((x) => { if (s.has(x.h)) return false; s.add(x.h); return true; }).slice(0, 10);
  });
  console.log('  船期链接:');
  links.forEach((l) => console.log(`    "${l.t}" → ${l.h}`));
  // 进第一个船期页 dump 表单
  const tgt = links.find((l) => /schedule/i.test(l.h)) || links[0];
  if (tgt) {
    console.log('  进入:', tgt.h);
    await page.goto(tgt.h, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
    await sleep(7000);
    const st = await page.evaluate(() => ({ t: document.title.slice(0, 50), len: document.body.innerText.length, ch: /just a moment|security/i.test(document.body.innerText) }));
    console.log('  页面:', JSON.stringify(st));
    const form = await page.evaluate(() => {
      const inp = [];
      document.querySelectorAll('input, select').forEach((e) => {
        if (!e.offsetParent) return;
        inp.push({ tag: e.tagName, type: e.type || '', id: e.id || '', name: e.name || '', ph: (e.placeholder || '').slice(0, 28), aria: (e.getAttribute('aria-label') || '').slice(0, 28) });
      });
      const btn = [];
      document.querySelectorAll('button, [role=button], input[type=submit]').forEach((e) => {
        if (!e.offsetParent) return;
        const t = (e.innerText || e.value || '').trim().slice(0, 25);
        if (t) btn.push(t);
      });
      return { inp: inp.slice(0, 12), btn: btn.slice(0, 10) };
    });
    console.log('  inputs:', JSON.stringify(form.inp));
    console.log('  buttons:', JSON.stringify(form.btn));
  }
}

// ── zim：主页 → Schedules
console.log('\n══ zim');
await page.goto('https://www.zim.com/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
if (await waitShield(page, 'zim')) {
  const links = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a').forEach((e) => {
      const t = (e.innerText || '').trim();
      if (/schedul|point.to.point|tariff/i.test(t + ' ' + e.href) && t.length < 45) out.push({ t: t.slice(0, 40), h: (e.href || '').slice(0, 95) });
    });
    const s = new Set();
    return out.filter((x) => { if (s.has(x.h)) return false; s.add(x.h); return true; }).slice(0, 8);
  });
  console.log('  链接:', JSON.stringify(links));
}
console.log('\n最终窗口:', (await windowBounds(ctx)).windowState);
await ctx.close().catch(() => {});
process.exit(0);
