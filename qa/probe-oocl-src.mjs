
// 读 block-puzzle.js / cs_captcha.js，找 token 的生成逻辑
import { launch } from '../engine/browser.mjs';
const r0 = await launch({});
const ctx = r0.ctx || r0;
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://moc.oocl.com/nj_prs_wss/client/sailing_schedules/views/search.html', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
const srcs = await page.evaluate(async () => {
  const get = async (u) => (await fetch(u).then((r) => r.text()).catch(() => ''));
  const a = await get('https://cs-captcha-public.cargosmart.com/captcha/public/js/cs_captcha.js');
  const b = await get('https://cs-captcha-public.cargosmart.com/captcha/public/js/block-puzzle.js');
  return { a, b };
});
const pick = (src, re, cap = 3) => {
  const out = [];
  const lines = src.split(/[\n;]/);
  for (const l of lines) if (re.test(l)) out.push(l.trim().slice(0, 220));
  return out.slice(0, cap);
};
console.log('══ cs_captcha.js（' + srcs.a.length + ' 字符）token 相关:');
for (const l of pick(srcs.a, /token|verify|aes|encrypt|md5|sha/i)) console.log('   ' + l);
console.log('── 函数定义:');
for (const l of pick(srcs.a, /function\s|=>\s*\{/, 6)) console.log('   ' + l);
console.log('');
console.log('══ block-puzzle.js（' + srcs.b.length + ' 字符）token/得分 相关:');
for (const l of pick(srcs.b, /token|verify|encrypt|CryptoJS|result|valid|success/i, 8)) console.log('   ' + l);
await ctx.close().catch(() => {});
