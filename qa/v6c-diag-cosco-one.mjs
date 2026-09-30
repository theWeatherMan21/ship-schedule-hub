// V6C 诊断：COSCO + ONE 候选 DOM 实况（找「隐藏原生 select」与候选没选中的根因）
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies, isBlockPage } from '../engine/lib/utils.mjs';

const ctx = await launch({});
await quietWindow(ctx, 'minimized').catch(() => {});

function dumpCandidates(page, tag) {
  return page.evaluate((tag) => {
    const out = [];
    // 原生 select 检查（隐藏的也算）
    const selects = [...document.querySelectorAll('select')].map(s => ({
      kind: 'select', id: s.id, name: s.name, visible: s.offsetParent !== null,
      opts: [...s.options].slice(0, 6).map(o => o.text.trim()),
      display: getComputedStyle(s).display,
    }));
    out.push({ kind: 'selects', data: selects });
    // role=option 元素
    const ro = [...document.querySelectorAll('[role="option"]')].filter(e => e.offsetParent !== null);
    out.push({ kind: 'role-option-visible', n: ro.length, texts: ro.slice(0, 8).map(e => e.innerText.trim().replace(/\s+/g, ' ')) });
    const roAll = [...document.querySelectorAll('[role="option"]')];
    out.push({ kind: 'role-option-all', n: roAll.length });
    // listitem
    const li = [...document.querySelectorAll('[role="listitem"]')].filter(e => e.offsetParent !== null);
    out.push({ kind: 'listitem-visible', n: li.length, texts: li.slice(0, 8).map(e => e.innerText.trim().replace(/\s+/g, ' ')) });
    // .ivu-select-item / 可见 li
    const ivu = [...document.querySelectorAll('.ivu-select-item, .ivu-select-dropdown li')].filter(e => e.offsetParent !== null);
    out.push({ kind: 'ivu-visible', n: ivu.length, texts: ivu.slice(0, 8).map(e => e.innerText.trim().replace(/\s+/g, ' ')) });
    return out;
  }, tag);
}

// ---------- COSCO ----------
console.log('========== COSCO ==========');
{
  const page = await ctx.newPage();
  await page.goto('https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => console.log('goto err', String(e).slice(0, 80)));
  await sleep(4000); await dismissCookies(page).catch(() => {}); await sleep(800);
  console.log('url', page.url().slice(0, 70), 'blocked', await isBlockPage(page));
  // modal
  const modal = page.locator('.ivu-modal-wrap, .ivu-modal').first();
  if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
    const mt = (await modal.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 60);
    console.log('modal:', mt);
    if (/please select your expected location/i.test(mt)) { await page.getByRole('button', { name: /confirm/i }).first().click({ timeout: 3000 }).catch(() => {}); await sleep(1200); }
  }
  const o = page.getByRole('textbox', { name: /origin city/i }).first();
  const wok = await o.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(e => false);
  console.log('origin city waitFor:', wok, 'title:', await page.title().catch(() => ''));
  if (wok) {
    await o.click().catch(() => {});
    await o.fill('').catch(() => {});
    await o.type('ningbo china', { delay: 60 });
    await sleep(2500);
    console.log('origin value after type:', JSON.stringify(await o.inputValue().catch(() => 'ERR')));
    console.log('CANDIDATES(ningbo china):', JSON.stringify(await dumpCandidates(page, 'cosco-origin'), null, 1));
    // 再试纯 "ningbo"
    await o.click().catch(() => {});
    await o.fill('').catch(() => {});
    await o.type('ningbo', { delay: 60 });
    await sleep(2500);
    console.log('origin value after type(ningbo):', JSON.stringify(await o.inputValue().catch(() => 'ERR')));
    console.log('CANDIDATES(ningbo):', JSON.stringify(await dumpCandidates(page, 'cosco-origin-ningbo'), null, 1));
  }
  await page.close().catch(() => {});
}

// ---------- ONE ----------
console.log('\n========== ONE ==========');
{
  const page = await ctx.newPage();
  await page.goto('https://ecomm.one-line.com/one-ecom/schedule/point-to-point-schedule', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => console.log('goto err', String(e).slice(0, 80)));
  await sleep(4000);
  // 等重定向
  for (let i = 0; i < 10; i++) { if (!/ecomm\.one-line\.com/.test(page.url())) break; await sleep(1000); }
  console.log('url', page.url().slice(0, 80), 'blocked', await isBlockPage(page));
  await dismissCookies(page).catch(() => {});
  const o = page.locator('input[placeholder*="origin" i], input[placeholder*="from" i], input[name*="fromPol" i], input[id*="origin" i]').first();
  const wok = await o.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(e => false);
  console.log('origin input waitFor:', wok);
  if (wok) {
    await o.click().catch(() => {});
    await o.fill('').catch(() => {});
    await o.type('ningbo', { delay: 70 });
    await sleep(3000);
    console.log('origin value after type:', JSON.stringify(await o.inputValue().catch(() => 'ERR')));
    console.log('CANDIDATES(ningbo):', JSON.stringify(await dumpCandidates(page, 'one-origin'), null, 1));
  }
  await page.close().catch(() => {});
}

await ctx.close().catch(() => {});
process.exit(0);
