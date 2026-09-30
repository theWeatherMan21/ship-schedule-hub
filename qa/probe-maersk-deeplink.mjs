// 探针：Maersk SPA 深链 URL 是否直接渲染结果（TRIST vs TRAMB）+ 抓 routing 请求头（9-29 婉宜）
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const d1 = iso(new Date(today.getTime() + 864e5));
const d29 = iso(new Date(today.getTime() + 29 * 864e5));

const COMBOS = [
  { label: 'TRIST-CY', to: '38MAX31QZK15T', rkst: 'TRIST' },
  { label: 'TRAMB-CY', to: '0FC4MM5Y0O0Z2', rkst: 'TRAMB' },
];
const url = (c) => `https://www.maersk.com/schedules/pointToPoint?from=104T898SJZ6GU&to=${c.to}&fromRkstCode=CNNPO&toRkstCode=${c.rkst}&containerIsoCode=45G1&fromServiceMode=CY&toServiceMode=CY&numberOfWeeks=4&dateType=D&date=${d1}&dateTo=${d29}&vesselFlag=`;

const lq = await launchHeadedQuiet();
const ctx = lq.ctx;
let hdrs = [];
ctx.on('request', (r) => {
  if (/routing-unified|deadlines/.test(r.url())) {
    hdrs.push({ m: r.method(), u: r.url().slice(0, 160), h: Object.fromEntries(Object.entries(r.headers()).filter(([k]) => /content-type|accept|authoriz|x-|api|cookie|consumer|token/i.test(k))) });
  }
});
const out = [];
try {
  for (const c of COMBOS) {
    hdrs = [];
    const { page } = await openPage(ctx, url(c), { reuse: true });
    await sleep(6000);
    await dismissCookies(page).catch(() => {});
    let text = '';
    for (let i = 0; i < 16; i++) {
      await sleep(3000);
      text = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      if (/vessel\/voyage|no schedules available/i.test(text)) break;
    }
    const cards = [...text.matchAll(/Vessel\/Voyage\n([^\n]+)\nTransit Time:([^\n]+)/g)].length;
    const rec = {
      label: c.label, url: page.url().slice(0, 200), len: text.length,
      echo: /search results/i.test(text),
      noSched: /no schedules available/i.test(text),
      cards, head: text.replace(/\s+/g, ' ').slice(0, 1600),
      hdrs: hdrs.slice(0, 4),
    };
    out.push(rec);
    console.log(`\n#### ${c.label} cards=${cards} echo=${rec.echo} noSched=${rec.noSched}`);
    console.log(rec.head);
    fs.mkdirSync('qa/probe-out', { recursive: true });
    fs.writeFileSync(`qa/probe-out/maersk-deeplink-${c.label}.txt`, `URL:${page.url()}\n\n${text}`);
    await Promise.race([page.close(), sleep(3000)]).catch(() => {});
  }
} catch (e) {
  console.log('!! 异常:', String(e).slice(0, 300));
} finally {
  fs.writeFileSync('qa/probe-out/maersk-deeplink.json', JSON.stringify(out, null, 1));
  console.log('\n== routing 请求头 ==');
  out.forEach((o) => o.hdrs.forEach((h) => console.log(' ', o.label, h.m, h.u.slice(0, 70), JSON.stringify(h.h).slice(0, 400))));
  await ctx.close().catch(() => {});
  process.exit(0);
}
