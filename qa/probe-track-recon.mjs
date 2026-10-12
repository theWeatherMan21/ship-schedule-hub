
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
const reqs = [];
page.on('request', (r) => {
  const u = r.url();
  if (/track|trace|bill|cargo|shipment|api|json|cntr|container/i.test(u) && !/\.(png|jpg|jpeg|css|woff2?|svg|gif|ico|js\?)/.test(u)) reqs.push(u.slice(0, 150));
});
const sites = [
  { id: 'maersk', url: 'https://www.maersk.com/tracking', num: null },
  { id: 'hapag', url: 'https://www.hapag-lloyd.com/en/online-business/track/track.html', num: 'HLCU2743528' },
  { id: 'one', url: 'https://ecomm.one-line.com/one-ecom/manage-shipment/cargo-tracking', num: 'ONEU8636192' },
  { id: 'msc', url: 'https://www.msc.com/en/track-a-shipment', num: null },
];
for (const s of sites) {
  reqs.length = 0;
  try {
    await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await sleep(5500);
    const info = await page.evaluate(() => ({
      title: document.title.slice(0, 70),
      inputs: [...document.querySelectorAll('input')]
        .filter((el) => el.offsetParent && !['hidden', 'checkbox', 'radio'].includes(el.type))
        .map((el) => ({ ph: (el.placeholder || '').slice(0, 45), nm: (el.name || '').slice(0, 28), id: (el.id || '').slice(0, 28) })).slice(0, 5),
      body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 110),
    }));
    console.log(`== ${s.id}: ${JSON.stringify(info).slice(0, 450)}`);
    console.log(`   ${s.id} 请求: ${JSON.stringify([...new Set(reqs)].slice(0, 8))}`);
    if (s.num) {
      const inp = page.locator('input[placeholder], input[type="text"], input:not([type])').first();
      await inp.fill(s.num, { timeout: 8000 }).catch(() => {});
      reqs.length = 0;
      await page.keyboard.press('Enter');
      await sleep(6500);
      console.log(`   ${s.id} 提交后: ${JSON.stringify([...new Set(reqs)].slice(0, 10))}`);
      console.log(`   ${s.id} URL: ${page.url().slice(0, 130)}`);
    }
  } catch (e) { console.log(`== ${s.id} ERR ${String(e).slice(0, 110)}`); }
  await sleep(1000);
}
await ctx.close();
