
// OOCL 验证码：get 的响应里到底有没有能直接用的 token？
import { launch, sleep } from '../engine/browser.mjs';
const r0 = await launch({});
const ctx = r0.ctx || r0;
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://moc.oocl.com/nj_prs_wss/client/sailing_schedules/views/search.html', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
await sleep(4000);
const out = await page.evaluate(async () => {
  const APPKEY = '1dc597b617744cb49c97e20b523931e1';
  const sess = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
  const r = await fetch(`https://cs-captcha-public.cargosmart.com/captcha/public/get?appKey=${APPKEY}&captchaType=blockPuzzle&sessionKey=${sess}`).then((x) => x.json()).catch((e) => ({ err: String(e) }));
  const rep = r.repData || {};
  const keys = Object.keys(rep);
  const short = {};
  for (const k of keys) { const v = String(rep[k]); short[k] = v.length > 40 ? v.slice(0, 30) + '…(' + v.length + ')' : v; }
  return { repCode: r.repCode, success: r.success, keys, short };
});
console.log('repCode:', out.repCode, ' success:', out.success);
console.log('字段:', JSON.stringify(out.keys));
console.log('预览:', JSON.stringify(out.short, null, 1).slice(0, 700));
await ctx.close().catch(() => {});
