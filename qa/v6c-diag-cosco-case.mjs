// V6C COSCO 对照：Ningbo / ningbo / ningbo china 哪种输入出候选
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';

const ctx = await launch({});
await quietWindow(ctx, 'minimized').catch(() => {});

async function load() {
  const page = await ctx.newPage();
  await page.goto('https://elines.coscoshipping.com/ebusiness/sailingSchedule/searchByCity', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await sleep(3500); await dismissCookies(page).catch(() => {});
  const modal = page.locator('.ivu-modal-wrap, .ivu-modal').first();
  if (await modal.isVisible({ timeout: 2000 }).catch(() => false)) {
    const mt = (await modal.innerText().catch(() => '')).replace(/\s+/g, ' ');
    if (/please select your expected location/i.test(mt)) { await page.getByRole('button', { name: /confirm/i }).first().click({ timeout: 3000 }).catch(() => {}); await sleep(1200); }
  }
  const o = page.getByRole('textbox', { name: /origin city/i }).first();
  await o.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  return { page, o };
}

async function probe(label, word) {
  const { page, o } = await load();
  await o.click().catch(() => {});
  await o.fill('').catch(() => {});
  await o.type(word, { delay: 70 });
  await sleep(2800);
  const val = await o.inputValue().catch(() => 'ERR');
  const cands = await page.evaluate(() => ({
    ivu: [...document.querySelectorAll('.ivu-select-item')].filter(e => e.offsetParent !== null).map(e => e.innerText.replace(/\s+/g, ' ').trim()),
    ivuAll: document.querySelectorAll('.ivu-select-item').length,
    drop: (document.querySelector('.ivu-select-dropdown')?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
  }));
  console.log(`\n[${label}] word="${word}" value=${JSON.stringify(val)}`);
  console.log('  ivu visible:', JSON.stringify(cands.ivu), '| ivuAll:', cands.ivuAll);
  console.log('  dropdown:', cands.drop);
  await page.close().catch(() => {});
}

await probe('A-cap', 'Ningbo');
await probe('B-low', 'ningbo');
await probe('C-suffix', 'ningbo china');

await ctx.close().catch(() => {});
process.exit(0);
