// Hapag Cloudflare 挑战探测：判断是「点一下复选框」还是「交互式挑战」（婉宜 9-23）
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({});
const page = await ctx.newPage();
const URL = 'https://www.hapag-lloyd.com/en/online-business/schedules/schedules-by-geography.html';

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => console.log('goto:', e.message.slice(0, 60)));
await sleep(5000);
console.log('title:', (await page.title()).slice(0, 70));

// 是否有 Cloudflare 挑战痕迹
const probe = await page.evaluate(() => {
  const html = document.documentElement.innerHTML;
  return {
    cfIframe: [...document.querySelectorAll('iframe')].map((f) => f.src || '').filter((s) => /challenges\.cloudflare|turnstile/i.test(s)),
    iframeCount: document.querySelectorAll('iframe').length,
    justAMoment: /just a moment|checking your browser|verifying you are human/i.test(document.body.innerText),
    turnstileWidget: document.querySelectorAll('[class*=turnstile], [id*=turnstile], [data-sitekey]').length,
    cfScript: /challenges\.cloudflare\.com|cdn-cgi\/challenge/i.test(html),
    bodyLen: document.body.innerText.length,
    bodyHead: document.body.innerText.slice(0, 160).replace(/\n+/g, ' | '),
  };
});
console.log('探测:', JSON.stringify(probe, null, 1));

// 若有 Turnstile checkbox，尝试点击
if (probe.cfIframe.length) {
  console.log('发现 CF iframe，尝试点击复选框…');
  for (const fr of page.frames()) {
    if (/challenges\.cloudflare|turnstile/i.test(fr.url())) {
      console.log('  frame:', fr.url().slice(0, 70));
      const box = fr.locator('input[type=checkbox], .cb-lb, label').first();
      const ok = await box.click({ timeout: 6000 }).then(() => true).catch((e) => e.message.slice(0, 50));
      console.log('  点击结果:', ok);
    }
  }
  await sleep(8000);
  console.log('点击后 title:', (await page.title()).slice(0, 70));
  console.log('点击后 bodyLen:', (await page.evaluate(() => document.body.innerText.length)));
}

// 等 15s 看是否自动放行
await sleep(15000);
const after = await page.evaluate(() => ({
  len: document.body.innerText.length,
  head: document.body.innerText.slice(0, 140).replace(/\n+/g, ' | '),
  stillChallenge: /just a moment|checking your browser|verifying you are human/i.test(document.body.innerText),
}));
console.log('15s 后:', JSON.stringify(after));

await ctx.close().catch(() => {});
process.exit(0);
