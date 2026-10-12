// Hapag 追踪：提交后把「文档响应 HTML」落盘，离线找结果区
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { isBlockPage } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const BL = process.env.BL || 'HLCU2B9E986E7C5E';
const BOOKING = 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html';
const OUT = process.env.OUT || '/tmp/hapag-track';

const ctx = await launch({ headless: false });
await quietWindow(ctx, 'minimized');
const page = ctx.pages()[0] || (await ctx.newPage());
let n = 0;
page.on('response', async (r) => {
  if (r.request().resourceType() !== 'document') return;
  try {
    const t = await r.text();
    const f = `${OUT}-doc${++n}.html`;
    fs.writeFileSync(f, t);
    console.log(`DOC#${n} ${r.status()} ${r.url().slice(0, 120)} len=${t.length} -> ${f}`);
  } catch (e) { console.log('DOC 落盘失败 ' + String(e).slice(0, 60)); }
});

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

console.log('打开: ' + await open(BOOKING));
n = 0;
await page.fill('input[id="tracing_by_booking_f:hl16"]', BL).catch((e) => console.log('fill ' + String(e).slice(0, 60)));
console.log('回读 ' + await page.locator('input[id="tracing_by_booking_f:hl16"]').inputValue().catch(() => '?'));
await page.getByRole('button', { name: /^\s*find\s*$/i }).first().click({ timeout: 10000 }).catch((e) => console.log('点 Find 失败 ' + String(e).slice(0, 70)));
for (let i = 1; i <= 8; i++) {
  await sleep(4000);
  const st = await page.evaluate(() => ({
    url: location.href.slice(0, 120),
    len: (document.body.innerText || '').length,
    keys: ['ETA', 'Arrival', 'Departure', 'not found', 'No data', 'Container', 'Vessel', 'last update', 'milestone']
      .filter((k) => (document.body.innerText || '').toLowerCase().includes(k.toLowerCase())),
  })).catch(() => ({}));
  console.log(`${i * 4}s ` + JSON.stringify(st));
  if (st.keys && st.keys.length > 1) break;
}
const full = await page.evaluate(() => (document.body.innerText || '')).catch(() => '');
fs.writeFileSync(OUT + '-text.txt', full);
console.log('正文长度 ' + full.length + ' -> ' + OUT + '-text.txt');
console.log(full.replace(/\n{2,}/g, '\n').slice(0, 4000));
await ctx.close().catch(() => {});
process.exit(0);
