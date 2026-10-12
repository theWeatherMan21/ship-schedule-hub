// Hapag 提单追踪 —— 侦察探针（有头 + CDP 最小化，过 CF Managed Challenge）
// 目标：拿到追踪页 URL / 表单结构 / 站内追踪接口（XHR）
import { launch, quietWindow, windowBounds, sleep } from '../engine/browser.mjs';
import { isBlockPage } from '../engine/lib/utils.mjs';

const URLS = [
  'https://www.hapag-lloyd.com/en/online-business/track/track.html',
];
const BL = process.env.BL || 'HLCU2B9E986E7C5E';

const ctx = await launch({ headless: false });
const w = await quietWindow(ctx, 'minimized');
console.log('窗口:', JSON.stringify(w));

const page = ctx.pages()[0] || (await ctx.newPage());
const seen = [];
page.on('request', (r) => {
  const rt = r.resourceType();
  if (rt !== 'xhr' && rt !== 'fetch') return;
  seen.push({ m: r.method(), u: r.url().slice(0, 220), b: String(r.postData() || '').slice(0, 400) });
});
page.on('response', async (r) => {
  const rt = r.request().resourceType();
  if (rt !== 'xhr' && rt !== 'fetch') return;
  const ct = r.headers()['content-type'] || '';
  if (!/json/i.test(ct)) return;
  let body = '';
  try { body = (await r.text()).replace(/\s+/g, ' ').slice(0, 900); } catch { /* 忽略 */ }
  console.log('RESP ' + r.status() + ' ' + r.url().slice(0, 180));
  console.log('     ' + body);
});

for (const u of URLS) {
  seen.length = 0;
  console.log('\n══════ goto ' + u);
  try { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch (e) { console.log('goto err ' + String(e).slice(0, 100)); }
  for (let i = 1; i <= 12; i++) {
    await sleep(4000);
    const st = await page.evaluate(() => ({
      t: document.title.slice(0, 60),
      len: (document.body.innerText || '').length,
      ch: /just a moment|security check|checking your browser|verifying you are human|are you a robot/i.test(document.body.innerText || ''),
      url: location.href.slice(0, 140),
    })).catch(() => ({ t: '?', len: -1, ch: true, url: '?' }));
    console.log(`  ${i * 4}s "${st.t}" len=${st.len} 挑战=${st.ch} ${st.url}`);
    if (!st.ch && st.len > 300) break;
  }
  const blocked = await isBlockPage(page).catch(() => true);
  console.log('isBlockPage=' + blocked);
  if (blocked) continue;
  const info = await page.evaluate(() => {
    const vis = (e) => e.offsetParent !== null;
    return {
      title: document.title.slice(0, 80),
      inputs: [...document.querySelectorAll('input, select, textarea')].filter(vis).slice(0, 14)
        .map((e) => ({ tag: e.tagName, type: e.type || '', id: (e.id || '').slice(0, 40), name: (e.name || '').slice(0, 30), ph: (e.placeholder || '').slice(0, 40), aria: (e.getAttribute('aria-label') || '').slice(0, 40) })),
      buttons: [...document.querySelectorAll('button, [role=button], input[type=submit], a')].filter(vis)
        .map((e) => ((e.innerText || e.value || e.getAttribute('aria-label') || '') + '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean).slice(0, 30),
      radios: [...document.querySelectorAll('input[type=radio], input[type=checkbox]')].filter(vis).map((e) => ({ id: e.id || '', name: e.name || '', v: e.value || '' })).slice(0, 12),
      body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 500),
    };
  }).catch((e) => ({ err: String(e).slice(0, 120) }));
  console.log('PAGE ' + JSON.stringify(info, null, 1));
  console.log('XHR(' + seen.length + '): ' + JSON.stringify(seen.slice(0, 25), null, 1));

  // 试填提单号
  const inp = page.locator('input[type=text], input[type=search], input:not([type])').first();
  const ok = await inp.fill(BL, { timeout: 8000 }).then(() => true).catch((e) => String(e).slice(0, 60));
  console.log('填 ' + BL + ' => ' + ok);
  seen.length = 0;
  await page.keyboard.press('Enter');
  await sleep(9000);
  console.log('提交后 URL ' + page.url().slice(0, 140));
  const after = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 700)).catch(() => '');
  console.log('提交后正文: ' + after);
  console.log('提交后 XHR: ' + JSON.stringify(seen.slice(0, 25), null, 1));
}

console.log('\n最终窗口:', JSON.stringify(await windowBounds(ctx)));
await ctx.close().catch(() => {});
process.exit(0);
