// 复刻 query.mjs runCarrier 的 COSCO 时序，找出 20s waitFor 被秒吞的原因
import { launch, quietWindow, sleep, openPage } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage } from '../engine/lib/utils.mjs';

const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const t0 = Date.now();
const opened = await openPage(ctx, 'https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity');
console.log('t+' + (Date.now()-t0), 'goto done, status', opened.status);
await sleep(2500);
const page = opened.page;
console.log('t+' + (Date.now()-t0), 'after sleep, url:', page.url().slice(0, 70));
console.log('t+' + (Date.now()-t0), 'blocked:', await isBlockPage(page));
const ck = await dismissCookies(page).catch(e => 'ERR ' + String(e).slice(0, 50));
console.log('t+' + (Date.now()-t0), 'dismissCookies:', ck);
console.log('t+' + (Date.now()-t0), 'blocked2:', await isBlockPage(page));
const o = page.getByRole('textbox', { name: /origin city/i }).first();
const ok = await o.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch((e) => 'ERR ' + String(e).slice(0, 80));
console.log('t+' + (Date.now()-t0), 'waitFor origin city:', ok);
console.log('t+' + (Date.now()-t0), 'title:', await page.title().catch(() => ''));
console.log('t+' + (Date.now()-t0), 'body len:', await page.evaluate(() => document.body?.innerText?.length || 0).catch(() => -1));
await ctx.close().catch(()=>{}); process.exit(0);
