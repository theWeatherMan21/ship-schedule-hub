// HMM + Evergreen + Hapag SPA 深挖（这三家上轮 0 数据请求）
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';

const { ctx } = await launchHeadedQuiet();
const all = {};

function watch() {
  const reqs = [];
  const h = (req) => {
    const u = req.url();
    if (/\.(css|js|png|jpg|webp|svg|woff2?|gif|ico)(\?|$)/i.test(u)) return;
    if (/cls_report|google|doubleclick|analytics|datadome|hotjar|sentry|contentsquare|cookielaw|walkme|cookieyes/i.test(u)) return;
    reqs.push({ method: req.method(), url: u.slice(0, 220), body: (req.postData() || '').slice(0, 400) });
  };
  ctx.on('request', h);
  return () => ctx.removeListener('request', h);
}

// ═══ HMM：表单是 POST 到 ScheduleMainPost.do（整页刷新型）—— 记录提交体 ═══
console.log('═══ HMM ═══');
{
  const stop = watch();
  const { page } = await openPage(ctx, 'https://www.hmm21.com/eng/business/liner/schedule/index.html', { reuse: true }).catch(async () => await openPage(ctx, 'https://www.hmm21.com/', { reuse: true }));
  await sleep(9000);
  // 找船期表单并提交
  const formInfo = await page.evaluate(() => {
    const forms = [...document.querySelectorAll('form')].map((f) => ({ action: f.action, method: f.method, inputs: [...f.querySelectorAll('input,select')].slice(0, 14).map((i) => ({ name: i.name, type: i.type, val: (i.value || '').slice(0, 30) })) }));
    return forms;
  }).catch(() => []);
  console.log('  表单:', JSON.stringify(formInfo).slice(0, 500));
  await sleep(1000);
  stop();
}

// ═══ Evergreen：shipmentlink 结构 ═══
console.log('\n═══ Evergreen ═══');
{
  const stop = watch();
  const { page } = await openPage(ctx, 'https://www.shipmentlink.com/html/schedules/EB俄.html', { reuse: true }).catch(async () => await openPage(ctx, 'https://www.shipmentlink.com/servlet/controller?RequestAction=searchSchedule', { reuse: true }));
  await sleep(9000);
  const forms = await page.evaluate(() => [...document.querySelectorAll('form')].map((f) => ({ action: f.action, method: f.method, n: f.querySelectorAll('input,select').length }))).catch(() => []);
  console.log('  表单:', JSON.stringify(forms).slice(0, 300));
  stop();
}

// ═══ Hapag：直接开 web-schedule SPA，看渲染结果时的 API ═══
console.log('\n═══ Hapag web-schedule ═══');
{
  const stop = watch();
  const { page } = await openPage(ctx, 'https://www.hapag-lloyd.com/en/online-business/schedule/vessel-schedule.html', { reuse: true });
  await sleep(15000);
  const apiCalls = await page.evaluate(() => performance.getEntriesByType('resource')
    .map((e) => e.name)
    .filter((u) => /api|graphql|schedule|vessel|port/i.test(u) && !/\.css|\.js|\.png|\.svg|challenge|cookielaw/i.test(u))
    .slice(0, 15));
  console.log('  渲染相关请求:');
  apiCalls.forEach((u) => console.log('   ', u.slice(0, 150)));
  all.hapag_spa = apiCalls;
  stop();
}

fs.writeFileSync('../docs/api-hunt3.json', JSON.stringify(all, null, 1));
console.log('\n→ docs/api-hunt3.json');
await ctx.close().catch(() => {});
process.exit(0);
