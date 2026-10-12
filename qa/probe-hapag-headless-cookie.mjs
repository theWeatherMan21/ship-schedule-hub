// Hapag 无头 + cookie 复用实测：同 profile 无头访问 legacy 深链，看能否带 cf_clearance 过盾
import { launch, sleep } from '../engine/browser.mjs';

const BL = process.env.BL || 'HLCUE300F5C71EA7';
const ctx = await launch({ headless: true });
console.log('headless ctx up');
const page = ctx.pages()[0] || (await ctx.newPage());

try {
  const resp = await page.goto('https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution-legacy.html?blno=' + BL, {
    waitUntil: 'domcontentloaded', timeout: 60000,
  }).catch((e) => { console.log('goto err', String(e).slice(0, 100)); return null; });
  console.log('http:', resp ? resp.status() : null);

  for (let i = 0; i < 24; i++) {
    await sleep(2500);
    const st = await page.evaluate(() => {
      const t = document.body ? document.body.innerText || '' : '';
      return {
        title: (document.title || '').slice(0, 70),
        len: t.length,
        hasResult: /Container No\./.test(t),
        challenge: /Just a moment|Security Check|Interactive Challenge/i.test((document.title || '') + t.slice(0, 300)),
      };
    }).catch(() => ({}));
    console.log(`[${i}] len=${st.len} result=${st.hasResult} challenge=${st.challenge} t="${st.title}"`);
    if (st.hasResult || st.challenge) break;
  }

  const cookies = await ctx.cookies('https://www.hapag-lloyd.com').catch(() => []);
  console.log('cookies on hapag-lloyd.com:', cookies.map((c) => `${c.name}(len=${String(c.value || '').length})`).join(', ').slice(0, 400));
  const all = await ctx.cookies().catch(() => []);
  const cf = all.filter((c) => /cf_clearance|cf_bm|__cf/.test(c.name));
  console.log('cf cookies(any domain):', cf.map((c) => `${c.name}@${c.domain}(len=${String(c.value || '').length})`).join(', ').slice(0, 400));
} finally {
  await ctx.close().catch(() => {});
  console.log('closed');
}
