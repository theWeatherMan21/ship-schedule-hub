// ZIM v2 探查：无头新档。zim.com 主页(200 已验证) → cookie → 导航菜单里的 Schedules → 找真实船期 URL 与表单
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

function log(s) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`); }
const ctx = await launch({});
await quietWindow(ctx, 'minimized').catch(() => {});
const page = await ctx.newPage();

log('打开 zim.com 主页…');
let resp = await page.goto('https://www.zim.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => { log('ERR ' + String(e).slice(0, 100)); return null; });
log(`主页 HTTP ${resp?.status() ?? 'ERR'}`);
await sleep(4000);
if (await isBlockPage(page)) { log('主页被拦'); await ctx.close(); process.exit(1); }
const ck = await dismissCookies(page);
log(`cookie: ${ck ? '已接受' : '无弹窗'}`);
await sleep(1500);

// 全页收集 schedule 相关链接（含 nav dropdown）
const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => ({
  t: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60), h: a.href || a.getAttribute('href') || '',
})).filter(x => /schedul|sailing|voyage|point.?to.?point/i.test(x.t + ' ' + x.h)));
log(`schedule 相关链接 ${links.length} 个：`);
[...new Map(links.map(x => [x.h, x])).values()].slice(0, 20).forEach(x => log(`  ${x.t} → ${x.h}`));

// 点 Schedules tab（主页 quick action tablist）
let tabOk = false;
try {
  const tab = page.getByRole('tab', { name: /^schedules$/i }).first();
  if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await tab.click(); tabOk = true; log('✅ 已点 Schedules tab');
    await sleep(4000);
    fs.writeFileSync('qa/aria9-zim-schedtab.txt', await page.locator('body').ariaSnapshot().catch(() => ''));
    log('aria 快照 → qa/aria9-zim-schedtab.txt');
  }
} catch (e) { log('tab 点击失败: ' + String(e).slice(0, 80)); }

// 再收集一次链接（tab 切换后可能出新链接）
if (tabOk) {
  const links2 = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => ({
    t: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60), h: a.href || '',
  })).filter(x => /schedul|point|vessel/i.test(x.t + ' ' + x.h)));
  log(`tab 后 schedule 链接 ${links2.length} 个：`);
  [...new Map(links2.map(x => [x.h, x])).values()].slice(0, 15).forEach(x => log(`  ${x.t} → ${x.h}`));
  const urlNow = page.url();
  log(`当前 URL: ${urlNow}`);
  fs.writeFileSync('qa/links-zim-v2.txt', JSON.stringify([...new Map([...links, ...links2].map(x => [x.h, x]))].values(), null, 1));
}
await ctx.close().catch(() => {});
process.exit(0);
