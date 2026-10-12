// ZIM 提单追踪 —— 运行时侦察（无头，静默）
// 目标：① 找到 ZIM 追踪页面 URL ② 抓到页面发出的 apigw.zim.com 请求 ③ 从页面配置对象里提路径
import { launch, sleep } from '../engine/browser.mjs';

const candidates = [
  'https://www.zim.com/tools/track-a-shipment',
  'https://www.zim.com/track-a-shipment',
  'https://www.zim.com/tracking',
  'https://www.zim.com/',
];

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const hits = [];
page.on('response', (r) => {
  const u = r.url();
  if (/apigw\.zim\.com|sitracker|tracking/i.test(u)) hits.push({ status: r.status(), u });
});
page.on('request', (r) => {
  const u = r.url();
  if (/apigw\.zim\.com|sitracker/i.test(u)) hits.push({ req: true, u });
});

for (const u of candidates) {
  try {
    const resp = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(6000);
    const info = await page.evaluate(() => {
      const s = document.documentElement.innerHTML;
      const grab = (needle) => {
        const i = s.indexOf(needle);
        return i >= 0 ? s.slice(Math.max(0, i - 120), i + 300) : null;
      };
      return {
        url: location.href, title: document.title,
        status: null,
        inputs: [...document.querySelectorAll('input')].map((x) => ({ type: x.type, ph: x.placeholder, name: x.name, id: x.id })).slice(0, 12),
        buttons: [...document.querySelectorAll('button')].map((x) => (x.innerText || '').trim()).filter(Boolean).slice(0, 20),
        sitracker: grab('SiTracker'),
        trackshipment: grab('trackShipment'),
        apiGateway: grab('apigw.zim.com'),
      };
    }).catch((e) => ({ evalErr: String(e).slice(0, 160) }));
    console.log('### PAGE', u, '->', JSON.stringify({ http: resp && resp.status(), ...info }));
  } catch (e) {
    console.log('### ERR', u, String(e).slice(0, 160));
  }
}
console.log('### NET HITS');
for (const h of hits.slice(0, 60)) console.log(JSON.stringify(h));
await ctx.close().catch(() => {});
process.exit(0);
