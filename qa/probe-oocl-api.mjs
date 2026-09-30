// 探针：抓 OOCL 页面自己发的「查询请求 + 响应结构」（目标：做 fastpath 秒查，替掉 62s 填表）
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launch, openPage, sleep, shot } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage, waitThroughChallenge, pickOption, portPick, typeAndPickCandidate, dateFormats } from '../engine/lib/utils.mjs';
import { setValue, setInputByValueShape, clickByText, fillAutocomplete } from '../engine/lib/dom.mjs';
import { resolvePort } from '../engine/lib/portsolve.mjs';
import oocl from '../engine/recipes/oocl.mjs';

const H = { dismissCookies, isBlockPage, waitThroughChallenge, pickOption, portPick, typeAndPickCandidate, setValue, setInputByValueShape, clickByText, fillAutocomplete, sleep, shot };
const [origin = 'Ningbo', destination = 'Istanbul'] = process.argv.slice(2);

const qBase = {
  date: dateFormats(new Date().toISOString().slice(0, 10)), skipDate: true,
  raw: { origin, destination, date: '' },
  _o: await resolvePort('oocl', origin), _d: await resolvePort('oocl', destination),
};
const q = new Proxy(qBase, {
  get(t, k) { if (k === 'originText') return t._o?.text ?? origin; if (k === 'destText') return t._d?.text ?? destination; return t[k]; },
});

const ctx = await launch({});
try {
  const { page } = await openPage(ctx, oocl.entry);
  await sleep(7000);

  await page.evaluate(() => {
    window.__cap = [];
    const of = window.fetch;
    window.fetch = async (...a) => {
      const url = typeof a[0] === 'string' ? a[0] : (a[0] && a[0].url) || '';
      const init = a[1] || {};
      const resp = await of(...a);
      if (/hub|route|search|schedule|supportData/i.test(url)) {
        let body = '';
        try { body = (await resp.clone().text()).slice(0, 6000); } catch {}
        window.__cap.push({ kind: 'fetch', url: String(url).slice(0, 300), method: (init.method || 'GET'), reqBody: String(init.body || '').slice(0, 800), status: resp.status, body });
      }
      return resp;
    };
    const oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.setRequestHeader, se = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = String(u); this.__h = {}; return oo.apply(this, arguments); };
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) { this.__h[k] = v; return os.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (b) {
      if (/hub|route|search|schedule|supportData/i.test(this.__u || '')) {
        const self = this;
        this.addEventListener('load', () => {
          window.__cap.push({ kind: 'xhr', url: String(self.__u).slice(0, 300), method: self.__m, reqBody: String(b || '').slice(0, 800), headers: self.__h, status: self.status, body: String(self.responseText || '').slice(0, 6000) });
        });
      }
      return se.apply(this, arguments);
    };
  });

  const t0 = Date.now();
  const out = await Promise.race([
    Promise.resolve(oocl.run(page, q, H)),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 120s')), 120000)),
  ]).catch((e) => ({ err: String(e).slice(0, 200) }));
  console.log(`配方跑完 ${((Date.now() - t0) / 1000).toFixed(1)}s →`, JSON.stringify(out).slice(0, 300));

  const cap = await page.evaluate(() => window.__cap || []);
  console.log(`\n== 抓到 ${cap.length} 条候选请求 ==`);
  for (const c of cap) {
    const interesting = /hub|route|supportData/i.test(c.url);
    console.log(`\n[${c.kind}] ${c.method} ${c.url}`);
    if (c.headers) console.log('  headers:', JSON.stringify(c.headers).slice(0, 300));
    if (c.reqBody) console.log('  req:', c.reqBody.slice(0, 400));
    console.log('  status:', c.status, '| body 头:', String(c.body || '').slice(0, 300).replace(/\s+/g, ' '));
    if (interesting) console.log('  ★ 重点候选');
  }
} catch (e) {
  console.log('!! 异常:', String(e).slice(0, 300));
} finally {
  await ctx.close().catch(() => {});
}
