import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const page = await ctx.newPage().catch(() => null);
if (!page) process.exit(1);
// 用 CDP 监听请求头
const cdp = await ctx.newCDPSession(page).catch(() => null);
if (cdp) {
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (e) => {
    const u = e.request.url;
    if (/schedule\.api\.hlag\.cloud\/api\/routes/.test(u)) {
      console.log('🎯 routes 请求头:');
      for (const [k, v] of Object.entries(e.request.headers)) {
        if (/auth|key|token|cookie/i.test(k)) console.log(`  ${k}: ${String(v).slice(0, 80)}`);
      }
      console.log('  URL:', u.slice(0, 200));
    }
  });
}
try { await page.goto('https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html', { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch {}
await sleep(18000);
await ctx.close().catch(() => {});
process.exit(0);
