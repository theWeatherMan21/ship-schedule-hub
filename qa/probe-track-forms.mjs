// 四家追踪表单结构 dump + YM 深链实测（无头、只读）
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

async function dumpForms(id, url) {
  console.log(`\n════ ${id} ════`);
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  console.log('status:', resp ? resp.status() : 'err');
  await sleep(5000);
  const d = await page.evaluate(() => {
    const pick = (els, n) => [...els].slice(0, n).map((e) => ({
      tag: e.tagName.toLowerCase(), type: e.type || '', id: (e.id || '').slice(0, 40), name: (e.name || '').slice(0, 30),
      ph: (e.placeholder || '').slice(0, 40), text: (e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 40), vis: e.offsetParent !== null,
    }));
    return {
      inputs: pick(document.querySelectorAll('input, select'), 14),
      buttons: pick(document.querySelectorAll('button, input[type="submit"], a[class*="btn"], a[class*="search"]'), 10),
    };
  }).catch(() => ({}));
  console.log('inputs:', JSON.stringify(d.inputs));
  console.log('buttons:', JSON.stringify(d.buttons));
}

await dumpForms('yangming', 'https://www.yangming.com/en/esolution/tracking/cargo_tracking');
await dumpForms('evergreen', 'https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do');
await dumpForms('oocl', 'https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx');
await dumpForms('cma', 'https://www.cma-cgm.com/eBusiness/Tracking');

// YM 深链实测（Exa 拿到的 detail 页样例形态）
console.log('\n════ yangming 深链 ════');
const deep = await page.goto('https://www.yangming.com/en/esolution/tracking/cargo_tracking_detail?position=BL_CT&refNo=N237068499&trackNo=YMLU4794134', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => { console.log('gotoErr', String(e).slice(0, 90)); return null; });
console.log('status:', deep ? deep.status() : 'err');
await sleep(7000);
const ds = await page.evaluate(() => ({
  title: (document.title || '').slice(0, 60),
  text: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 420),
  tables: document.querySelectorAll('table').length,
  rows: document.querySelectorAll('tr').length,
})).catch(() => ({}));
console.log(JSON.stringify(ds));

await ctx.close().catch(() => {});
