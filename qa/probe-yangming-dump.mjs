// YM 结果页结构 dump + fixture 保存（无头、只读）
import fs from 'node:fs';
import { launch, sleep } from '../engine/browser.mjs';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());

async function probe(url, tag) {
  console.log(`\n════ ${tag} ════`);
  const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => null);
  console.log('status:', r ? r.status() : 'err');
  await sleep(7000);
  const d = await page.evaluate(() => {
    const head = (document.body ? document.body.innerText : '').replace(/\s+/g, ' ');
    const tables = [...document.querySelectorAll('table')].map((t) =>
      [...t.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('td,th')].map((c) => (c.innerText || '').replace(/\s+/g, ' ').trim())).filter((r2) => r2.filter(Boolean).length)
    );
    return { head: head.slice(0, 300), tables };
  }).catch(() => ({}));
  console.log('head:', d.head);
  console.log('tables:', JSON.stringify(d.tables, null, 1).slice(0, 3500));
  return d;
}

// a) 原样（已证出数据）——保存 fixture
const d1 = await probe('https://www.yangming.com/en/esolution/tracking/cargo_tracking_detail?position=BL_CT&refNo=N237068499&trackNo=YMLU3560471', 'a: BL_CT+refNo+trackNo');
if (d1 && d1.tables && d1.tables.length) {
  const html = await page.content().catch(() => '');
  fs.mkdirSync('qa/fixtures', { recursive: true });
  fs.writeFileSync('qa/fixtures/yangming-container-YMLU3560471.html', html);
  console.log('fixture saved:', html.length, 'bytes');
}

// b) 柜 position 变体（不带 refNo）
await probe('https://www.yangming.com/en/esolution/tracking/cargo_tracking_detail?position=CNTR_CT&trackNo=YMLU3560471', 'b: CNTR_CT+trackNo');

// c) 只 refNo（BL 猜测）
await probe('https://www.yangming.com/en/esolution/tracking/cargo_tracking_detail?position=BL_CT&refNo=YMLU3560471', 'c: BL_CT+refNo=柜号');

await ctx.close().catch(() => {});
