// 用 query.mjs 的 runCarrier + init script 拦 window.fetch
import { launchHeadedQuiet, sleep } from '../engine/browser.mjs';
import { runCarrier } from '../engine/query.mjs';
import fs from 'node:fs';

const { ctx } = await launchHeadedQuiet();
// 注入 fetch 记录器（在所有页面生效）
await ctx.addInitScript(() => {
  window.__xhrLog = [];
  const of = window.fetch;
  window.fetch = function (...args) {
    try {
      const u = typeof args[0] === 'string' ? args[0] : args[0].url;
      if (/api/i.test(u) && !/analytics|doubleclick|google|audience|active-vessels|vessel-flags/i.test(u)) {
        window.__xhrLog.push({ u: String(u).slice(0, 250), m: (args[1] && args[1].method) || 'GET', b: String((args[1] && args[1].body) || '').slice(0, 700) });
      }
    } catch {}
    return of.apply(this, args);
  };
});
// runCarrier 不是导出的……看 query.mjs 有没有 export
console.log('检查 query.mjs 导出');
process.exit(0);
