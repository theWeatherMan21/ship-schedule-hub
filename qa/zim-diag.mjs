// ⚠️ 10-09 爹地红线：探针不得弹窗。需要真指纹破反爬时，请照 qa/headed-minimized-probe.mjs
//   那套做（headless:false + CDP Browser.setWindowBounds 最小化 + 回读 AXMinimized 验证）。
// ZIM 诊断：探真实船期入口
import { launch, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const ctx = await launch({ headless: true });
const page = await ctx.newPage();
const resp = await page.goto('https://www.zim.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => { console.log('ERR', String(e).slice(0, 100)); return null; });
console.log('主页 HTTP:', resp?.status());
await sleep(5000);
await dismissCookies(page).catch(() => {});
await sleep(1000);
// 找 schedule 相关链接
const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => ({ t: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40), h: a.getAttribute('href') })).filter(x => /schedul/i.test(x.t + ' ' + (x.h || ''))));
console.log('schedule 链接:', JSON.stringify(links.slice(0, 10), null, 1));
const snap = await page.locator('body').ariaSnapshot().catch(() => '');
fs.writeFileSync('qa/aria-zim-live.txt', snap);
console.log(snap.split('\n').filter(l => /schedul|textbox|combobox|search/i.test(l)).slice(0, 15).join('\n'));
await ctx.close().catch(() => {});
process.exit(0);
