// HMM：假单号时站点到底给什么页面（用来把「查无此单」的判据钉死，别把它误报成通路故障）
import { launch, sleep } from '../engine/browser.mjs';

const NUM = process.argv[2] || 'HDMUSHAF00000000';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
page.on('dialog', async (d) => { console.log('⚠️ 浏览器弹窗:', d.type(), JSON.stringify(d.message())); await d.dismiss().catch(() => {}); });
try {
  await page.goto('https://www.hmm21.com/', { waitUntil: 'domcontentloaded', timeout: 40000 });
  await sleep(2500);
  await page.goto(`https://www.hmm21.com/e-service/search/index.do?query=${encodeURIComponent(NUM)}`, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await sleep(9000);
  const r = await page.evaluate(() => ({ url: location.href, title: document.title, text: (document.body?.innerText || ''), hasTable: !!document.getElementById('trackingInfomationDateResultTable') }));
  console.log('URL:', r.url, '| TITLE:', r.title, '| 有结果容器:', r.hasTable);
  console.log('--- BODY（前 1500 字）---');
  console.log(r.text.slice(0, 1500));
} catch (e) { console.log('ERR', String(e).slice(0, 300)); }
await ctx.close().catch(() => {});
process.exit(0);
