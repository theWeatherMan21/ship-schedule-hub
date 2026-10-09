
// ZIM 真实一把：填 Origin/Destination → 选候选 → Search → 抓结果页
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import * as H from '../engine/lib/utils.mjs';
import fs from 'node:fs';
const { ctx } = await launchHeadedQuiet();
const page = ctx.pages()[0] || (await ctx.newPage());
ctx.on('page', (np) => console.log('[新标签] ' + np.url()));
await page.goto('https://www.zim.com/schedules/point-to-point', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(6000);
await H.dismissCookies(page); await sleep(1200);

const fill = async (ph, word) => {
  const box = page.getByPlaceholder(ph).first();
  if (!(await box.isVisible({ timeout: 6000 }).catch(() => false))) return '框不可见';
  await box.click({ timeout: 8000 }).catch(() => {});
  await sleep(500);
  await page.keyboard.type(word, { delay: 90 });
  await sleep(3000);
  const opts = page.getByRole('option');
  const n = await opts.count().catch(() => 0);
  const texts = [];
  for (let j = 0; j < Math.min(n, 12); j++) texts.push(((await opts.nth(j).textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim().slice(0, 60));
  console.log(`[${ph}] 候选 ${n}: ` + JSON.stringify(texts.slice(0, 6)));
  const idx = texts.findIndex((t) => new RegExp(word, 'i').test(t));
  if (idx >= 0) { await opts.nth(idx).click({ timeout: 6000 }).catch(() => {}); await sleep(1200); return '选中: ' + texts[idx]; }
  return '未匹配';
};
console.log('[Origin] ' + await fill('Origin', 'Shanghai'));
console.log('[Dest]   ' + await fill('Destination', 'Izmir'));
const btn = page.getByRole('button', { name: /^search$/i }).first();
console.log('Search disabled=' + await btn.isDisabled().catch(() => true));
await btn.click({ timeout: 8000 }).catch((e) => console.log('点失败: ' + e.message.slice(0, 60)));
await sleep(12000);
console.log('');
console.log('══ 结果 ══');
console.log('URL: ' + page.url());
console.log('所有页面: ' + JSON.stringify(ctx.pages().map((p) => p.url())));
const html = await page.content().catch(() => '');
fs.writeFileSync('/tmp/dom-zim-results.txt', `URL: ${page.url()}\n\n` + html);
console.log('DOM 已存 /tmp/dom-zim-results.txt (' + html.length + ' 字节)');
const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
console.log('文本长度 ' + txt.length);
console.log('含 no results: ' + /no (results|schedules)/i.test(txt));
console.log('前 600 字: ' + txt.replace(/\s+/g, ' ').slice(0, 600));
await ctx.close().catch(() => {});
