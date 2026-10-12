// 三家提交机制探针：EGLV 表单提交 / OOCL 网络监听 / CMA 提交 + YM BL 模式（无头、只读）
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

// —— A. YM BL 模式（不带 trackNo，只 refNo）——
try {
  console.log('\n════ A. yangming BL 模式 ════');
  const r = await page.goto('https://www.yangming.com/en/esolution/tracking/cargo_tracking_detail?position=BL_CT&refNo=N237068499', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  console.log('status:', r ? r.status() : 'err');
  await sleep(7000);
  console.log(JSON.stringify(await page.evaluate(() => ({
    title: (document.title || '').slice(0, 60),
    text: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 500),
    rows: document.querySelectorAll('tr').length, links: [...document.querySelectorAll('a')].map((a) => a.textContent.trim()).filter(Boolean).slice(0, 10),
  })).catch(() => ({}))));
} catch (e) { console.log('A err', String(e).slice(0, 120)); }

// —— B. EGLV 表单提交（Quick Tracking → BL 模式）——
try {
  console.log('\n════ B. evergreen 提交 ════');
  await page.goto('https://ct.shipmentlink.com/servlet/TDB1_CargoTracking.do', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(4000);
  // 选 BL radio（可见的那个）→ 填可见 NO → 提交
  const r1 = await page.evaluate(() => {
    const radios = [...document.querySelectorAll('input[type="radio"][name="SEL"]')].filter((x) => x.offsetParent !== null);
    if (radios[0]) { radios[0].click(); return { checked: radios[0].id }; }
    return { checked: null };
  });
  console.log('radio:', JSON.stringify(r1));
  await sleep(1500);
  const fill = await page.evaluate(() => {
    const ins = [...document.querySelectorAll('input[name="NO"]')].filter((x) => x.type === 'text' && x.offsetParent !== null);
    if (ins[0]) { ins[0].focus(); ins[0].value = '012345678900'; ins[0].dispatchEvent(new Event('input', { bubbles: true })); return { n: ins.length }; }
    return { n: 0 };
  });
  console.log('fill:', JSON.stringify(fill));
  await sleep(800);
  // 找可见 Submit
  const clicked = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('input[type="button"], button, input[type="submit"]')].filter((b) => /submit/i.test(b.value || b.innerText || '') && b.offsetParent !== null);
    if (btns[0]) { btns[0].click(); return true; }
    // 实在找不到：找任意可见的"查询"类按钮
    const b2 = [...document.querySelectorAll('input[type="button"]')].filter((b) => b.offsetParent !== null);
    if (b2[0]) { b2[0].click(); return 'alt'; }
    return false;
  });
  console.log('submit clicked:', clicked);
  await sleep(9000);
  console.log(JSON.stringify(await page.evaluate(() => ({
    url: location.href.slice(0, 130),
    title: (document.title || '').slice(0, 60),
    text: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 400),
    challenge: /ocaptcha|captcha|challenge|robot/i.test((document.body ? document.body.innerText : '').slice(0, 800)),
  })).catch(() => ({}))));
} catch (e) { console.log('B err', String(e).slice(0, 120)); }

// —— C. OOCL 网络监听 + 试交互 ——
try {
  console.log('\n════ C. oocl 监听 ════');
  const hits = [];
  page.on('response', (resp) => {
    const u = resp.url();
    if (/track|cargo|blList|shipment/i.test(u) && !/\.(js|css|png|jpg|gif|svg|woff|ico)/.test(u)) {
      const ct = (resp.headers()['content-type'] || '').slice(0, 40);
      hits.push({ u: u.slice(0, 140), s: resp.status(), ct });
    }
  });
  await page.goto('https://www.oocl.com/eng/ourservices/eservices/cargotracking/Pages/cargotracking.aspx', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(4000);
  // 找可见输入框并填
  const ooc = await page.evaluate(() => {
    const ins = [...document.querySelectorAll('input[type="text"], input:not([type])')].filter((x) => x.offsetParent !== null);
    return { visibleInputs: ins.map((x) => ({ id: x.id, ph: x.placeholder })).slice(0, 8) };
  });
  console.log('visible inputs:', JSON.stringify(ooc));
} catch (e) { console.log('C err', String(e).slice(0, 120)); }

// —— D. CMA 提交 ——
try {
  console.log('\n════ D. cma 提交 ════');
  await page.goto('https://www.cma-cgm.com/eBusiness/Tracking', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(5000);
  console.log('has form:', JSON.stringify(await page.evaluate(() => {
    const ref = document.querySelector('#Reference');
    const btn = document.querySelector('#btnTracking');
    return { ref: !!ref, refVis: ref ? ref.offsetParent !== null : null, btn: !!btn, btnVis: btn ? btn.offsetParent !== null : null };
  })));
  await page.fill('#Reference', 'CMDU5138769').catch((e) => console.log('fillErr', String(e).slice(0, 80)));
  await sleep(600);
  await page.click('#btnTracking', { timeout: 10000 }).catch((e) => console.log('clickErr', String(e).slice(0, 80)));
  await sleep(10000);
  console.log(JSON.stringify(await page.evaluate(() => ({
    url: location.href.slice(0, 150),
    title: (document.title || '').slice(0, 70),
    text: (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').slice(0, 420),
  })).catch(() => ({}))));
} catch (e) { console.log('D err', String(e).slice(0, 120)); }

await ctx.close().catch(() => {});
