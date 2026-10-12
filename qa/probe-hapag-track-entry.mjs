// Hapag 追踪：从 track.html 抓「Track by Booking/Container」真实入口，并 dump 表单结构
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { isBlockPage } from '../engine/lib/utils.mjs';

const BL = process.env.BL || 'HLCU2B9E986E7C5E';
const ctx = await launch({ headless: false });
await quietWindow(ctx, 'minimized');
const page = ctx.pages()[0] || (await ctx.newPage());

async function passShield() {
  for (let i = 0; i < 15; i++) {
    await sleep(3000);
    const st = await page.evaluate(() => ({ t: document.title.slice(0, 50), len: (document.body.innerText || '').length })).catch(() => ({ t: '?', len: -1 }));
    if (!(await isBlockPage(page).catch(() => true)) && st.len > 300) return true;
  }
  return false;
}

await page.goto('https://www.hapag-lloyd.com/en/online-business/track/track.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('过盾: ' + await passShield());

const links = await page.evaluate(() => [...document.querySelectorAll('a')]
  .map((a) => ({ t: (a.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 45), h: a.href }))
  .filter((x) => x.h && /track|booking|container|tracing/i.test(x.t + x.h)));
console.log('候选链接:\n' + JSON.stringify([...new Map(links.map((l) => [l.h, l])).values()], null, 1));

const targets = [...new Set(links.filter((l) => /track by booking|track by container/i.test(l.t)).map((l) => l.h))];
console.log('目标: ' + JSON.stringify(targets));

async function dump(u, label) {
  console.log('\n══════ ' + label + ' ' + u);
  try { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch (e) { console.log('goto err ' + String(e).slice(0, 90)); }
  if (!(await passShield())) { console.log('盾未过'); return; }
  await sleep(6000);
  const info = await page.evaluate(() => {
    const vis = (e) => e.offsetParent !== null;
    return {
      url: location.href.slice(0, 150),
      title: document.title.slice(0, 70),
      inputs: [...document.querySelectorAll('input, select, textarea')].filter(vis).slice(0, 16)
        .map((e) => ({ tag: e.tagName.toLowerCase(), type: e.type || '', id: (e.id || '').slice(0, 50), name: (e.name || '').slice(0, 40), ph: (e.placeholder || '').slice(0, 45), aria: (e.getAttribute('aria-label') || '').slice(0, 45) })),
      radios: [...document.querySelectorAll('input[type=radio]')].filter(vis).map((e) => ({ id: e.id || '', name: e.name || '', v: e.value || '' })).slice(0, 10),
      buttons: [...document.querySelectorAll('button, [role=button], input[type=submit]')].filter(vis)
        .map((e) => ((e.innerText || e.value || e.getAttribute('aria-label') || '') + '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean).slice(0, 20),
      body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 700),
    };
  }).catch((e) => ({ err: String(e).slice(0, 120) }));
  console.log(JSON.stringify(info, null, 1));
}

for (const [i, u] of targets.slice(0, 2).entries()) await dump(u, 'T' + i);
console.log('\nBL=' + BL);
await ctx.close().catch(() => {});
process.exit(0);
