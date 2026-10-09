
// ZIM 深探：点 Search 之后，是开新标签页？还是没反应？还是被弹窗吞？（2026-10-09 爹地报"zim 无结果"）
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';

const { ctx, mode } = await launchHeadedQuiet();
console.log('启动模式:', mode);
const page = ctx.pages()[0] || (await ctx.newPage());
const seen = [];
ctx.on('page', (np) => { seen.push(np.url()); console.log('[新页面] ' + np.url()); });

await page.goto('https://www.zim.com/', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('goto 失败: ' + e.message.slice(0, 80)));
await sleep(4000);
await H.dismissCookies(page);
await H.clearOverlays(page);
await sleep(1500);
console.log('清弹窗后剩余遮罩: ' + await page.evaluate(() => document.querySelectorAll('div[style*="position: fixed"], [class*="cookie"], [class*="consent"]').length));

const tab = page.getByRole('tab', { name: /^schedules$/i }).first();
for (let i = 0; i < 10; i++) { if (await tab.isVisible({ timeout: 1500 }).catch(() => false)) { await tab.click({ timeout: 5000 }).catch(() => {}); break; } await sleep(2000); }
await sleep(2500);
await H.clearOverlays(page);
console.log('点 tab 后 URL: ' + page.url());

// 填 Origin / Destination
const fill = async (label, word) => {
  const box = page.getByRole('combobox', { name: new RegExp(`^${label}$`, 'i') }).first();
  const vis = await box.isVisible({ timeout: 5000 }).catch(() => false);
  if (!vis) return 'combobox 不可见';
  await box.click({ timeout: 8000 }).catch(() => {});
  await sleep(500);
  await page.keyboard.type(word, { delay: 70 });
  await sleep(2500);
  const opts = page.getByRole('option');
  const n = await opts.count().catch(() => 0);
  const texts = [];
  for (let j = 0; j < Math.min(n, 10); j++) texts.push(((await opts.nth(j).textContent().catch(() => '')) || '').trim().slice(0, 50));
  console.log(`[${label}] 候选 ${n} 个: ` + JSON.stringify(texts.slice(0, 5)));
  const idx = texts.findIndex((t) => new RegExp(word, 'i').test(t));
  if (idx >= 0) { await opts.nth(idx).click({ timeout: 5000 }).catch(() => {}); await sleep(1000); return '选中: ' + texts[idx]; }
  return '未匹配到 ' + word;
};
console.log('[Origin] ' + await fill('Origin', 'Shanghai'));
console.log('[Destination] ' + await fill('Destination', 'Izmir'));

const search = page.getByRole('button', { name: /^search$/i }).first();
const dis = await search.isDisabled().catch(() => true);
console.log('Search 按钮 disabled=' + dis);
await search.click({ timeout: 8000 }).catch((e) => console.log('点 Search 失败: ' + e.message.slice(0, 60)));
await sleep(9000);

console.log('');
console.log('══ 点 Search 之后 ══');
console.log('当前页 URL: ' + page.url());
console.log('上下文里的所有页面:');
for (const p2 of ctx.pages()) console.log('   ' + p2.url());
if (seen.length) console.log('期间新开的页面: ' + JSON.stringify(seen));
const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
console.log('当前页文本长度: ' + txt.length);
console.log('含"no results"/"no schedule": ' + /no (results|schedules)/i.test(txt));
console.log('前 400 字: ' + txt.replace(/\s+/g, ' ').slice(0, 400));
await ctx.close().catch(() => {});
