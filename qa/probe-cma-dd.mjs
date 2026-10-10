
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  await page.goto('https://www.cma-cgm.com/ebusiness/schedules', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await sleep(6000);
  const info = await page.evaluate(() => {
    const html = document.documentElement.innerHTML;
    const i1 = html.search(/captcha-delivery/i);
    const i2 = html.search(/datadome/i);
    const around = (i) => (i < 0 ? null : html.slice(Math.max(0, i - 120), i + 160).replace(/\s+/g, ' '));
    return {
      url: location.href,
      title: document.title,
      formVisible: !!document.querySelector('#AutoCompletePOL'),
      i1, i2,
      around1: around(i1),
      around2: around(i2),
      iframes: [...document.querySelectorAll('iframe')].map((f) => f.src || '(empty)').slice(0, 6),
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 300),
    };
  });
  console.log(JSON.stringify(info, null, 1).slice(0, 2400));
} catch (e) { console.log('ERR ' + String(e).slice(0, 160)); }
await ctx.close();
