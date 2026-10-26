// MSC 追踪响应全量 dump（设计解析器用）+ 深链 ?params= 验证
// 用法：SSH_PROFILE_DIR=/tmp/msc-dump-$$ bash qa/quiet-probe.sh qa/probe-msc-track-dump.mjs <outdir>
import { launch, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';
import path from 'node:path';

const outdir = process.argv[2] || '/tmp';
const nums = ['MEDUW7272208', 'MSCU0756488'];
const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://www.msc.com/en/track-a-shipment', { waitUntil: 'domcontentloaded', timeout: 50000 });
await sleep(5000);

for (const n of nums) {
  const r = await page.evaluate(async (body) => {
    const resp = await fetch('/api/feature/tools/TrackingInfo', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/plain, */*', 'x-requested-with': 'XMLHttpRequest' },
      body: JSON.stringify(body),
    });
    return { status: resp.status, text: await resp.text() };
  }, { trackingNumber: n, trackingMode: '0' });
  let j = null; try { j = JSON.parse(r.text); } catch { /* 忽略 */ }
  fs.writeFileSync(path.join(outdir, `msc-${n}.json`), r.text);
  const d = j && j.Data && typeof j.Data === 'object' ? j.Data : null;
  console.log(`\n### ${n} status=${r.status} len=${r.text.length} IsSuccess=${j && j.IsSuccess}`);
  if (d) {
    console.log('Data keys:', Object.keys(d).join(', '));
    console.log('Type/Title:', d.TrackingType, '|', d.TrackingTitle, '| CurrentDate:', d.CurrentDate, '|', d.TrackingResultsLabel);
    const b = (d.BillOfLadings || [])[0] || {};
    console.log('BOL keys:', Object.keys(b).join(', '));
    console.log('BOL#:', b.BillOfLadingNumber, 'nContainers:', b.NumberOfContainers);
    console.log('GeneralTrackingInfo:', JSON.stringify(b.GeneralTrackingInfo));
    const ci = (b.ContainersInfo || [])[0] || {};
    console.log('ContainerInfo keys:', Object.keys(ci).join(', '));
    console.log('ContainerInfo (无 Events):', JSON.stringify(Object.fromEntries(Object.entries(ci).filter(([k]) => k !== 'Events'))).slice(0, 900));
    const ev = (ci.Events || [])[0] || {};
    console.log('Event keys:', Object.keys(ev).join(', '));
    console.log('Event[0]:', JSON.stringify(ev).slice(0, 600));
    console.log('事件数:', (ci.Events || []).length, '事件 Description 列表:', (ci.Events || []).map((e) => `${e.Order}:${e.Date}:${e.Description}`).join(' | '));
  } else {
    console.log('Data:', typeof (j && j.Data) === 'string' ? j.Data : r.text.slice(0, 300));
  }
  await sleep(1200);
}

// ── 深链验证：?params = base64(trackingNumber=X&trackingMode=0) ──
console.log('\n──── 深链 ?params= 验证 ────');
const qs = Buffer.from('trackingNumber=MEDUW7272208&trackingMode=0').toString('base64');
const hits = [];
page.on('response', (r) => { if (/TrackingInfo/.test(r.url())) hits.push({ status: r.status(), m: r.request().method() }); });
try {
  await page.goto(`https://www.msc.com/en/track-a-shipment?params=${qs}`, { waitUntil: 'domcontentloaded', timeout: 50000 });
  await sleep(9000);
  const info = await page.evaluate(() => ({
    url: location.href.slice(0, 160),
    input: (document.querySelector('#trackingNumber') || {}).value || '',
    hasResultText: /BILL OF LADING|Tracking results|HO CHI MINH|SHANGHAI/i.test(document.body.innerText || ''),
    body: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 220),
  }));
  console.log('深链结果:', JSON.stringify(info));
  console.log('深链期间 TrackingInfo 调用:', JSON.stringify(hits));
} catch (e) { console.log('深链 ERR', String(e).slice(0, 160)); }

await ctx.close().catch(() => {});
process.exit(0);
