// MSC 真实参数实测：{FromDate, fromPortId, toPortId, language, dataSourceId}
// PortId 从 GetAllAvailableCountriesAndPorts 里来（我们已存全表）
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';

// 从全量表找 PortId
const msc = JSON.parse(fs.readFileSync('../docs/msc-ports-raw.json', 'utf8'));
const findId = (name) => (msc.Ports.find((p) => p.LocationCode === name) || {}).PortId;
const fromId = findId('CNNGB');
const toId = findId('TRIST');
console.log('PortId: Ningbo(CNNGB)=', fromId, ' Istanbul(TRIST)=', toId);

const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.msc.com/en/search-a-schedule', { reuse: true });
await sleep(8000);

// dataSourceId 从页面上拿（data-setting-id 属性）
const settingId = await page.evaluate(() => {
  const el = document.querySelector('[data-setting-id]');
  return el ? el.dataset.settingId : null;
});
console.log('dataSourceId =', settingId);

const body = {
  FromDate: '2026-09-23', fromPortId: fromId, toPortId: toId,
  language: 'en', dataSourceId: settingId ? Number(settingId) : undefined,
};
console.log('请求体:', JSON.stringify(body));

const r = await page.evaluate(async (b) => {
  try {
    const resp = await fetch('/api/feature/tools/SearchSailingRoutes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(b),
    });
    const t = await resp.text();
    return { status: resp.status, len: t.length, head: t.slice(0, 700) };
  } catch (e) { return { error: String(e).slice(0, 120) }; }
}, body).catch((e) => ({ error: String(e).slice(0, 120) }));
console.log('→', JSON.stringify(r).slice(0, 800));

await ctx.close().catch(() => {});
console.log('DONE');
process.exit(0);
