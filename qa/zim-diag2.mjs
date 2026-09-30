// ZIM 诊断 2：/schedules/trades 页面
import { launch, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const ctx = await launch({ headless: false });
const page = await ctx.newPage();
const resp = await page.goto('https://www.zim.com/schedules/trades', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => { console.log('ERR', String(e).slice(0, 100)); return null; });
console.log('HTTP:', resp?.status());
await sleep(5000);
await dismissCookies(page).catch(() => {});
await sleep(1000);
const snap = await page.locator('body').ariaSnapshot().catch(() => '');
fs.writeFileSync('qa/aria-zim-trades.txt', snap);
console.log(snap.split('\n').filter(l => /schedul|textbox|combobox|button|tab/i.test(l)).slice(0, 20).join('\n'));
// 找 P2P 搜索链接
const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => ({ t: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50), h: a.getAttribute('href') })).filter(x => /schedule|search|point/i.test(x.t + ' ' + (x.h || ''))));
console.log('链接:', JSON.stringify(links.slice(0, 12), null, 1));
await ctx.close().catch(() => {});
process.exit(0);
