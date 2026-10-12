// Hapag 追踪：维护横幅可见性 + 搜索后结果区取证（有头最小化）
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { isBlockPage } from '../engine/lib/utils.mjs';

const BL = process.env.BL || 'HLCU2B9E986E7C5E';
const BOOKING = 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html';

const ctx = await launch({ headless: false });
await quietWindow(ctx, 'minimized');
const page = ctx.pages()[0] || (await ctx.newPage());
page.setDefaultTimeout(15000);

const MAINT = /maintenance|currently not available|not available/i;

async function open(u) {
  for (let i = 0; i < 4; i++) {
    try { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch (e) { console.log('goto err ' + String(e).slice(0, 70)); }
    for (let j = 0; j < 12; j++) {
      await sleep(2500);
      const len = await page.evaluate(() => (document.body.innerText || '').length).catch(() => 0);
      if (!(await isBlockPage(page).catch(() => true)) && len > 200) { await sleep(3000); return true; }
    }
    console.log('  过盾重试 ' + (i + 1));
  }
  return false;
}

// 找出所有含维护文案的节点及其可见性/来源
async function maintInfo() {
  return page.evaluate(() => {
    const out = [];
    const all = document.querySelectorAll('div,span,p,li,section');
    for (const e of all) {
      const t = (e.childElementCount === 0 ? e.textContent : '').trim();
      if (!t || t.length > 200) continue;
      if (/maintenance|currently not available/i.test(t)) {
        const cs = getComputedStyle(e);
        out.push({ id: e.id || '', cls: (e.className || '').toString().slice(0, 60), text: t.slice(0, 160), disp: cs.display, vis: cs.visibility, op: cs.opacity });
      }
    }
    return out.slice(0, 8);
  }).catch((e) => [{ err: String(e).slice(0, 80) }]);
}

const kw = async () => page.evaluate(() => {
  const t = (document.body.innerText || '');
  return {
    url: location.href.slice(0, 130), len: t.length,
    hits: ['maintenance', 'Currently not available', 'Booking No.', 'Container', 'ETA', 'Arrival', 'Departure', 'Not found', 'no data', 'milestone', 'Vessel', 'Port'].filter((k) => new RegExp(k, 'i').test(t)),
  };
}).catch(() => ({}));

console.log('打开 booking: ' + await open(BOOKING));
console.log('搜索前: ' + JSON.stringify(await kw()));
console.log('搜索前维护节点: ' + JSON.stringify(await maintInfo()));

await page.fill('input[id="tracing_by_booking_f:hl16"]', BL).catch((e) => console.log('fill ' + String(e).slice(0, 60)));
console.log('回读 ' + await page.locator('input[id="tracing_by_booking_f:hl16"]').inputValue().catch(() => '?'));
await page.getByRole('button', { name: /^\s*find\s*$/i }).first().click({ timeout: 10000 }).catch((e) => console.log('点 Find 失败 ' + String(e).slice(0, 70)));
for (let i = 1; i <= 6; i++) { await sleep(4000); console.log(`+${i * 4}s ` + JSON.stringify(await kw())); }
console.log('搜索后维护节点: ' + JSON.stringify(await maintInfo()));
console.log('搜索后正文: ' + (await page.evaluate(() => (document.body.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 1500)).catch(() => '?')));
console.log('screenshot ' + await page.screenshot({ path: '/tmp/hapag-after-find.png', fullPage: false, timeout: 20000 }).then(() => '/tmp/hapag-after-find.png').catch(() => '失败'));

// 备用候选页
for (const u of ['https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution/screen-area-page5082.html',
  'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution/screen-area-page5080.html']) {
  console.log('\n════ ' + u);
  if (!(await open(u))) { console.log('盾未过'); continue; }
  console.log(JSON.stringify(await kw()));
  console.log((await page.evaluate(() => (document.body.innerText || '').replace(/\n{2,}/g, '\n').slice(0, 700)).catch(() => '?')));
}
await ctx.close().catch(() => {});
process.exit(0);
