
import { launch, sleep } from '../engine/browser.mjs';
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
for (const url of ['https://www.hmm21.com/e-service/general/schedule/localSchedule.do',
                   'https://www.hmm21.com/e-service/general/schedule/ScheduleMain.do']) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(8000);
    const info = await page.evaluate(() => ({
      url: location.href, title: document.title,
      hasFrom: !!document.querySelector('#srchPointFrom'),
      inputs: [...document.querySelectorAll('input,select')].slice(0, 20).map((e) => (e.id || e.name || '?') + ':' + (e.tagName)),
      frames: [...document.querySelectorAll('iframe')].map((f) => f.src).slice(0, 6),
      text: (document.body.innerText || '').replace(/\n+/g, ' | ').slice(0, 200),
    }));
    console.log('PAGE ' + JSON.stringify(info));
  } catch (e) { console.log('ERR ' + url.slice(-30) + ' ' + String(e).slice(0, 100)); }
}
await ctx.close();
