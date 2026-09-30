// 探针：抓 OOCL 查询接口的完整 body + 响应结构，并当场回放验证可复用性
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
const qBase = { date: dateFormats(new Date().toISOString().slice(0, 10)), skipDate: true, raw: { origin, destination, date: '' }, _o: await resolvePort('oocl', origin), _d: await resolvePort('oocl', destination) };
const q = new Proxy(qBase, { get(t, k) { if (k === 'originText') return t._o?.text ?? origin; if (k === 'destText') return t._d?.text ?? destination; return t[k]; } });

const ctx = await launch({});
try {
  const { page } = await openPage(ctx, oocl.entry);
  await sleep(7000);
  await page.evaluate(() => {
    window.__cap = { post: null };
    const oo = XMLHttpRequest.prototype.open, os = XMLHttpRequest.prototype.setRequestHeader, se = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__m = m; this.__u = String(u); this.__h = {}; return oo.apply(this, arguments); };
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) { this.__h[k] = v; return os.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (b) {
      if (/searchHubToHubRoute/.test(this.__u || '')) {
        const self = this;
        this.addEventListener('load', () => {
          window.__cap.post = { url: self.__u, method: self.__m, headers: self.__h, req: String(b || ''), status: self.status, body: String(self.responseText || '').slice(0, 30000) };
        });
      }
      return se.apply(this, arguments);
    };
  });

  const out = await Promise.race([
    Promise.resolve(oocl.run(page, q, H)),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 120s')), 120000)),
  ]).catch((e) => ({ err: String(e).slice(0, 200) }));
  console.log('配方结果:', JSON.stringify(out).slice(0, 200));

  const cap = await page.evaluate(() => window.__cap.post);
  if (!cap) { console.log('!! 没拦到 POST'); }
  else {
    console.log('\n=== 请求 ===');
    console.log('URL:', cap.url, '| method:', cap.method, '| headers:', JSON.stringify(cap.headers));
    console.log('BODY:', cap.req);
    const j = JSON.parse(cap.body);
    const routes = j?.data?.standardRoutes || [];
    console.log(`\n=== 响应: standardRoutes ${routes.length} 条；第 1 条字段结构 ===`);
    console.log(JSON.stringify(routes[0], null, 1).slice(0, 2500));

    // 回放验证：用同样的 body 再打一次
    const replay = await page.evaluate(async ({ url, body }) => {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/plain, */*' }, body });
      const t = await r.text();
      let n = -1; try { n = (JSON.parse(t)?.data?.standardRoutes || []).length; } catch {}
      return { status: r.status, routes: n, head: t.slice(0, 120) };
    }, { url: cap.url, body: cap.req });
    console.log('\n=== 回放结果 ===', JSON.stringify(replay));
  }
} catch (e) {
  console.log('!! 异常:', String(e).slice(0, 300));
} finally {
  await ctx.close().catch(() => {});
}
