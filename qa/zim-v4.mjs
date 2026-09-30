// ZIM v4：点主页 Schedules tab → 读 tabpanel 里的链接（无头）
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import fs from 'node:fs';
function log(s) { console.log(`[${new Date().toISOString().slice(11,19)}] ${s}`); }
const ctx = await launch({});
await quietWindow(ctx, 'minimized').catch(() => {});
const page = await ctx.newPage();
await page.goto('https://www.zim.com/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => log('ERR ' + String(e).slice(0,80)));
await sleep(6000);
await dismissCookies(page); await sleep(1000);
try {
  const tab = page.getByRole('tab', { name: /^schedules$/i }).first();
  log('tab 可见: ' + await tab.isVisible().catch(() => false));
  await tab.click({ timeout: 8000 });
  log('✅ 已点 Schedules tab');
} catch (e) { log('❌ tab 点击: ' + String(e).slice(0,120)); }
await sleep(5000);
fs.writeFileSync('qa/aria9-zim-tab-after.txt', await page.locator('body').ariaSnapshot().catch(() => ''));
const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(a => ({ t: (a.textContent||'').replace(/\s+/g,' ').trim().slice(0,60), h: a.href })).filter(x => /schedul|vessel|voyage|point/i.test(x.t+' '+x.h)));
log(`tab 后 schedule 链接 ${links.length} 个`);
[...new Map(links.map(x=>[x.h,x])).values()].slice(0,20).forEach(x => log(`  ${x.t} → ${x.h}`));
// tabpanel 内容行
const snap = fs.readFileSync('qa/aria9-zim-tab-after.txt','utf8');
const seg = snap.split('\n').filter(l => /tabpanel|textbox|combobox|button|link ".*(Schedule|schedule|search|Search)/i.test(l));
seg.slice(0,25).forEach(l => log('  ' + l.trim().slice(0,110)));
await ctx.close().catch(()=>{}); process.exit(0);
