// 探针：抓 Maersk 页面「自己」发的 geography 请求 —— 看它是否带有效凭据（我们裸 fetch 会 401）
// 目标：拿到 Istanbul/Ambarli 的 maerskGeoLocationId，用于 GEO 缓存
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launch, openPage, sleep } from '../engine/browser.mjs';

const ctx = await launch({});
try {
  const { page } = await openPage(ctx, 'https://www.maersk.com/schedules/pointToPoint');
  await sleep(8000);

  // 装拦截器：记录所有 geography / routing 请求与响应摘要
  await page.evaluate(() => {
    window.__cap = [];
    const of = window.fetch;
    window.fetch = async (...a) => {
      const url = typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url) || '';
      const resp = await of(...a);
      if (/geography|routing|locations/i.test(url)) {
        let body = '';
        try { body = (await resp.clone().text()).slice(0, 4000); } catch {}
        window.__cap.push({ url: String(url).slice(0, 250), status: resp.status, body });
      }
      return resp;
    };
  });

  // 在页面上正常操作：From = Ningbo，To = istanbul（触发它自己的 autocomplete 请求）
  const from = page.getByRole('combobox', { name: /from \(city, country\/region\)/i }).first();
  await from.click({ timeout: 8000 }).catch(() => {});
  await from.type('ningbo', { delay: 90 }).catch(() => {});
  await sleep(4000);
  const opts1 = await page.locator('[role="option"]').allInnerTexts().catch(() => []);
  console.log('From 候选:', JSON.stringify(opts1.slice(0, 5)));
  await page.locator('[role="option"]').first().click({ timeout: 5000 }).catch(() => {});
  await sleep(1500);

  const to = page.getByRole('combobox', { name: /to \(city, country\/region\)/i }).first();
  await to.click({ timeout: 8000 }).catch(() => {});
  await to.type('istanbul', { delay: 90 }).catch(() => {});
  await sleep(5000);
  const opts2 = await page.locator('[role="option"]').allInnerTexts().catch(() => []);
  console.log('To 候选(istanbul):', JSON.stringify(opts2.slice(0, 6)));

  // 候选元素本身是否带 GEO_ID（data-* / id / aria）
  const attrs = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[role="option"]')) {
      const a = {};
      for (const at of el.attributes) a[at.name] = String(at.value).slice(0, 80);
      out.push({ text: (el.innerText || '').trim().slice(0, 60), attrs: a });
    }
    return out.slice(0, 8);
  });
  console.log('候选元素属性:', JSON.stringify(attrs, null, 1).slice(0, 1200));

  const cap = await page.evaluate(() => window.__cap || []);
  console.log(`\n== 页面自己发的 geography/routing 请求 ${cap.length} 条 ==`);
  for (const c of cap) {
    const hit = /geoLocationId|maerskGeoLocationId|rkst|unLocCode/i.test(c.body);
    console.log(`  [${c.status}] ${c.url}`);
    if (hit) console.log('     含 ID 片段:', c.body.slice(0, 300).replace(/\\s+/g, ' '));
  }
} catch (e) {
  console.log('!! 异常:', String(e).slice(0, 300));
} finally {
  await ctx.close().catch(() => {});
}
