// ZIM 诊断 3：schedule-by-port 端口搜索（Turkey/Istanbul），看是否有 P2P 搜索入口
import { launch, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const ctx = await launch({ headless: false });
const page = await ctx.newPage();
// 先访问 trades 页找 Turkey 港口链接（Asia-Europe 视图）
await page.goto('https://www.zim.com/schedules/trades', { waitUntil: 'domcontentloaded', timeout: 45000 });
await sleep(5000);
await dismissCookies(page).catch(() => {});
// 找所有 schedule-by-port 链接里的 TR/土耳其
const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => ({ t: (a.textContent || '').trim().slice(0, 60), h: a.getAttribute('href') || '' })).filter(x => /countrycode=TR&|turkey|istanbul|ambarli/i.test(x.h + ' ' + x.t)));
console.log('TR 链接:', JSON.stringify(links, null, 1));
// 若没有，直接试 schedule-by-port 带 TRIST
await page.goto('https://www.zim.com/schedules/schedule-by-port?countrycode=TR&portcode=TRIST&datefrom=21-09-2026&weeksahead=6&direction=False', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => console.log('ERR', String(e).slice(0, 80)));
await sleep(6000);
const t = await page.evaluate(() => document.body.innerText);
console.log('TRIST 页面长度:', t.length);
fs.writeFileSync('qa/zim-trist.txt', t);
const lines = t.split('\n').map(s => s.trim()).filter(Boolean);
lines.slice(0, 40).forEach(l => console.log('  ', l.slice(0, 140)));
await ctx.close().catch(() => {});
process.exit(0);
