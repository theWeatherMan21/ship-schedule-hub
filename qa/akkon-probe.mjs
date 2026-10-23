// Akkon Lines 提单/箱号查询探针 v2（2026-10-23）
// 两条路径分开测：① 箱号（TextBox2 + btnContainerSearch）② 提单（先选 POL 国家 + TextBox1 + Button1）
// 静默：无头
import { launch } from '../engine/browser.mjs';

const URL = 'https://sap.akkonlines.com/index.aspx';
const BOX = process.argv[2] || 'MSKU9813389';
const BL = process.argv[3] || '';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

const dump = async (label) => {
  const panel = page.locator('#UpdatePanel1');
  const n = await panel.count();
  const text = n ? await panel.innerText().catch(() => '') : '';
  console.log(`\n=== ${label} · UpdatePanel1 文本 ===`);
  console.log(String(text).replace(/\n{3,}/g, '\n\n').slice(0, 2200) || '(空)');
  const tables = await page.locator('#UpdatePanel1 table').count();
  const rows = tables ? await page.locator('#UpdatePanel1 table tr').count() : 0;
  console.log(`--- 表格 ${tables} 个 / 行 ${rows} ---`);
  if (tables) {
    const head = await page.locator('#UpdatePanel1 table').first().innerHTML().catch(() => '');
    console.log('首个表格 HTML 前 1200:');
    console.log(head.slice(0, 1200));
  }
  for (const sel of ['#blWarning', '#blWarning2', '#modalBody', '#modalTitle']) {
    const c = await page.locator(sel).count();
    if (c) {
      const t = await page.locator(sel).first().innerText().catch(() => '');
      if (t && t.trim()) console.log(`${sel}: ${t.replace(/\s+/g, ' ').slice(0, 200)}`);
    }
  }
};

try {
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);
  console.log('[probe] 标题:', await page.title());

  console.log(`\n[probe] ① 箱号查询: ${BOX}`);
  await page.fill('#TextBox2', BOX);
  await page.click('#btnContainerSearch');
  await page.waitForTimeout(7000);
  await dump('箱号查询');

  if (BL) {
    console.log(`\n[probe] ② 提单查询: ${BL}（先选国家）`);
    const opts = await page.locator('#ddlCountry option').allTextContents().catch(() => []);
    console.log('[probe] 国家数:', opts.length, '| 前 8:', opts.slice(0, 8).join(' / '));
    await page.selectOption('#ddlCountry', { label: 'CHINA' }).catch(() => {});
    await page.fill('#TextBox1', BL);
    await page.click('#Button1');
    await page.waitForTimeout(9000);
    await dump('提单查询');
  }

  await page.screenshot({ path: '/tmp/akkon-probe2.png', fullPage: true }).catch(() => {});
  console.log('\n[probe] 截图: /tmp/akkon-probe2.png');
} catch (e) {
  console.error('[probe] 失败:', e && e.message ? e.message : e);
  process.exitCode = 1;
} finally {
  await ctx?.close().catch(() => {});
}
