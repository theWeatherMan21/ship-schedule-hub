// ZIM v3：无头下主页快照 + 全部链接 dump
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage } from '../engine/lib/utils.mjs';
import fs from 'node:fs';
function log(s) { console.log(`[${new Date().toISOString().slice(11,19)}] ${s}`); }
const ctx = await launch({});
await quietWindow(ctx, 'minimized').catch(() => {});
const page = await ctx.newPage();
await page.goto('https://www.zim.com/', { waitUntil: 'networkidle', timeout: 45000 }).catch(e => log('ERR ' + String(e).slice(0,80)));
await sleep(6000);
const ck = await dismissCookies(page); log('cookie: ' + (ck ? 'ok' : 'none'));
await sleep(2000);
fs.writeFileSync('qa/aria9-zim-headless.txt', await page.locator('body').ariaSnapshot().catch(() => ''));
log('title: ' + await page.title().catch(() => ''));
const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => ({ t: (a.textContent||'').replace(/\s+/g,' ').trim().slice(0,50), h: a.href })).filter(x => x.h));
log(`全部链接 ${links.length} 个`);
[...new Map(links.map(x=>[x.h,x])).values()].slice(0,60).forEach(x => log(`  ${x.t} → ${x.h.slice(0,80)}`));
const bodyLen = (await page.evaluate(() => document.body.innerText.length).catch(()=>0));
log('body 长度: ' + bodyLen);
await ctx.close().catch(()=>{}); process.exit(0);
