// Hapag：帮助页枚举（结果表/明细屏结构）+ 维护横幅是否与缓存/会话有关
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import { isBlockPage } from '../engine/lib/utils.mjs';

const r = await launchHeadedQuiet();
console.log('模式 ' + r.mode);
const ctx = r.ctx;
const page = ctx.pages()[0] || (await ctx.newPage());
page.setDefaultTimeout(15000);

async function open(u) {
  for (let i = 0; i < 3; i++) {
    try { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch { /* 忽略 */ }
    for (let j = 0; j < 10; j++) {
      await sleep(2200);
      const len = await page.evaluate(() => (document.body.innerText || '').length).catch(() => 0);
      if (!(await isBlockPage(page).catch(() => true)) && len > 200) { await sleep(2000); return true; }
    }
  }
  return false;
}
const banner = async () => page.evaluate(() => {
  const el = [...document.querySelectorAll('.hal-info-box__title, .hal-info-box')].map((e) => (e.textContent || '').trim()).filter((t) => /maintenance|not available/i.test(t));
  return el.length ? el[0].slice(0, 120) : '';
}).catch(() => '');

// A. 缓存/会话假设检验
const B = 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html';
for (const u of [`${B}?xcb=${Date.now()}`, `${B}?_a=tracing_by_booking&xcb=${Date.now()}`]) {
  console.log('\n== ' + u);
  console.log('过盾 ' + await open(u) + ' | 横幅: ' + JSON.stringify(await banner()));
}

// B. 帮助页枚举：结果表 / 明细屏的真实结构
console.log('\n== 帮助页枚举');
for (let i = 5076; i <= 5090; i++) {
  const u = `https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution/screen-area-page${i}.html`;
  if (!(await open(u))) { console.log(`${i}: 盾未过`); continue; }
  const t = await page.evaluate(() => ({ title: document.title.slice(0, 60), body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(120, 900) })).catch(() => ({}));
  console.log(`\n--- ${i} ${t.title || '?'}\n${t.body || ''}`);
}

await ctx.close().catch(() => {});
process.exit(0);
