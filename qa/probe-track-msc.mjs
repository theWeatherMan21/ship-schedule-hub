// MSC 提单/箱号追踪侦察探针 —— 2026-10-10
// 目标：打开 msc.com/en/track-a-shipment，摸表单结构 + 提交后的 XHR 全貌
// 用法：SSH_PROFILE_DIR=/tmp/msc-probe-$$ bash qa/quiet-probe.sh qa/probe-track-msc.mjs M237055674
import { launch, sleep } from '../engine/browser.mjs';

const num = process.argv[2] || 'M237055674';
const URL0 = process.env.MSC_TRACK_URL || 'https://www.msc.com/en/track-a-shipment';

function j(x, n = 600) { return JSON.stringify(x).slice(0, n); }

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const reqs = [];
const resps = [];
page.on('request', (r) => {
  const u = r.url();
  if (/\.(png|jpe?g|css|woff2?|svg|gif|ico|map|ttf|webp)(\?|$)/.test(u)) return;
  const isMsc = /(^https?:\/\/(www\.)?msc\.com)/.test(u) && !/\.js(\?|$)/.test(u);
  if (!isMsc && !/api|track|shipment|bill|container|cntr/i.test(u)) return;
  reqs.push({ m: r.method(), u: u.slice(0, 220), post: (r.postData() || '').slice(0, 400) });
});
page.on('response', async (r) => {
  const u = r.url();
  if (!/api|track|shipment|bill|container|cntr/i.test(u)) return;
  if (/\.(png|jpe?g|css|woff2?|svg|gif|ico|map|js)(\?|$)/.test(u)) return;
  let body = '';
  try { body = (await r.text()).slice(0, 1500); } catch { body = '<unreadable>'; }
  resps.push({ status: r.status(), u: u.slice(0, 220), ct: r.headers()['content-type'] || '', body });
});

async function clearOverlays() {
  return page.evaluate(() => {
    const txts = /^(accept|accept all|agree|ok|close|got it|i accept|同意|接受|允许)/i;
    let clicked = 0;
    for (const b of document.querySelectorAll('button,a[role=button],[class*=accept],[id*=accept]')) {
      const t = (b.textContent || '').trim();
      if (txts.test(t) && b.offsetParent) { try { b.click(); clicked++; } catch { /* 忽略 */ } }
    }
    let removed = 0;
    for (const el of document.querySelectorAll('div,section,aside')) {
      const s = getComputedStyle(el);
      if ((s.position === 'fixed' || s.position === 'absolute') && +s.zIndex > 1000) {
        const r = el.getBoundingClientRect();
        if (r.width * r.height > innerWidth * innerHeight * 0.35 && !el.querySelector('input,select,textarea,[role=combobox]')) {
          el.remove(); removed++;
        }
      }
    }
    document.body.style.overflow = '';
    return { clicked, removed };
  }).catch((e) => ({ err: String(e).slice(0, 120) }));
}

async function dump(tag) {
  const info = await page.evaluate(() => ({
    url: location.href.slice(0, 150),
    title: document.title.slice(0, 90),
    inputs: [...document.querySelectorAll('input,select,textarea')]
      .filter((el) => !['hidden', 'checkbox', 'radio'].includes(el.type))
      .map((el) => ({ id: el.id || '', nm: el.name || '', ph: (el.placeholder || '').slice(0, 50), type: el.type, vis: !!el.offsetParent })),
    buttons: [...document.querySelectorAll('button,[role=button],input[type=submit]')]
      .filter((el) => el.offsetParent).map((el) => ({ t: (el.textContent || el.value || '').replace(/\s+/g, ' ').trim().slice(0, 40), id: el.id || '', cls: (el.className || '').toString().slice(0, 40) })).slice(0, 14),
    body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 500),
  }));
  console.log(`\n════ ${tag} ════`);
  console.log(j(info, 1600));
}

let phase = 'load';
try {
  await page.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 50000 });
  await sleep(6000);
  await dump('LOAD');
  console.log('overlay:', j(await clearOverlays()));
  await sleep(800);

  // 填号（页面是 Alpine.js；x-model 绑定在 #trackingNumber 上，必须走真实 input 事件）
  phase = 'fill';
  await page.click('#trackingNumber', { timeout: 10000 }).catch((e) => console.log('click err:', String(e).slice(0, 120)));
  await sleep(300);
  await page.fill('#trackingNumber', '', { timeout: 10000 }).catch((e) => console.log('clear err:', String(e).slice(0, 120)));
  await page.type('#trackingNumber', num, { delay: 60, timeout: 15000 }).catch((e) => console.log('type err:', String(e).slice(0, 120)));
  await sleep(700);
  const val = await page.evaluate(() => { const el = document.querySelector('#trackingNumber') || document.querySelector('input[type=text]'); return el ? el.value : null; });
  console.log('填后回读:', j(val));

  reqs.length = 0; resps.length = 0;
  phase = 'submit';
  const btn = page.locator('button[type=submit], form button, button:has-text("Track")');
  const n = await btn.count().catch(() => 0);
  let clicked = 'none';
  for (let i = 0; i < Math.min(n, 6); i++) {
    const t = await btn.nth(i).textContent().catch(() => '');
    if (/track|search|go/i.test(t || '')) { await btn.nth(i).click({ timeout: 6000 }).catch(() => {}); clicked = `#${i}:${(t || '').trim().slice(0, 24)}`; break; }
  }
  if (clicked === 'none') { await page.keyboard.press('Enter'); clicked = 'Enter'; }
  console.log('提交方式:', clicked);
  await sleep(9000);
  await dump('AFTER SUBMIT');
} catch (e) {
  console.log(`ERR(${phase}):`, String(e).slice(0, 200));
}

console.log('\n── 请求（去重后）──');
const uniq = [...new Map(reqs.map((r) => [r.m + r.u, r])).values()];
for (const r of uniq.slice(0, 40)) console.log(`${r.m} ${r.u}${r.post ? '  BODY=' + r.post : ''}`);
console.log('\n── 响应（api 类）──');
for (const r of resps.slice(0, 20)) console.log(`${r.status} ${r.ct} ${r.u}\n    ${r.body.slice(0, 700)}`);

await ctx.close().catch(() => {});
process.exit(0);
