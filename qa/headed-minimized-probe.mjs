// 有头 + 立即最小化：CF/Akamai 是否仍放行？页面操作是否正常？（婉宜 9-23，爹地思路验证）
import { launch, quietWindow, sleep, windowBounds } from '../engine/browser.mjs';

const HAPAG = 'https://www.hapag-lloyd.com/en/home.html';
const ZIM = 'https://www.zim.com/schedules';

async function probe(ctx, name, url, waitMs = 40000) {
  console.log(`\n══════ ${name}`);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log('  goto:', e.message.slice(0, 60)));
  let passed = false;
  for (let i = 1; i <= Math.ceil(waitMs / 5000); i++) {
    await sleep(5000);
    const st = await page.evaluate(() => ({
      t: document.title.slice(0, 55),
      len: document.body.innerText.length,
      ch: /just a moment|security check|checking your browser|verifying you are human|are you a robot/i.test(document.body.innerText),
    })).catch(() => ({ t: '?', len: -1, ch: true }));
    console.log(`  ${i * 5}s: "${st.t}" len=${st.len} 挑战=${st.ch}`);
    // 判定通过：无挑战字样 且 标题不是拦截页 且 有内容
    if (!st.ch && !/just a moment|page not found|access denied|blocked/i.test(st.t) && st.len > 300) { passed = true; break; }
  }
  if (!passed) { console.log(`  ❌ ${name} 未通过`); await page.close().catch(() => {}); return false; }

  console.log(`  ✅ ${name} 通过`);
  // 最小化状态下能否正常操作？测输入框
  const inputs = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('input[type=text], input[type=search], input:not([type])').forEach((e) => {
      if (!e.offsetParent) return;
      out.push({ id: e.id || '', ph: (e.placeholder || '').slice(0, 30), aria: (e.getAttribute('aria-label') || '').slice(0, 30) });
    });
    return out.slice(0, 6);
  });
  console.log(`  可见输入框 ${inputs.length} 个:`, JSON.stringify(inputs));
  if (inputs.length) {
    const sel = inputs[0].id ? `#${inputs[0].id}` : 'input[type=text], input:not([type])';
    const okType = await page.locator(sel).first().fill('ningbo', { timeout: 8000 }).then(() => true).catch((e) => e.message.slice(0, 50));
    console.log(`  最小化下填输入框: ${okType === true ? '✅ 成功' : '❌ ' + okType}`);
    const val = await page.locator(sel).first().inputValue().catch(() => '');
    console.log(`  回读: "${val}"`);
  }
  const shot = await page.screenshot({ path: `/tmp/headed-min-${name}.png`, timeout: 15000 }).then(() => true).catch(() => false);
  console.log(`  截图: ${shot ? '✅' : '❌（最小化下可能无法截图）'}`);
  await page.close().catch(() => {});
  return true;
}

const ctx = await launch({ headless: false });
const before = await windowBounds(ctx);
console.log('启动后窗口:', JSON.stringify(before));
const q = await quietWindow(ctx, 'minimized');
console.log('最小化结果:', JSON.stringify(q));

await probe(ctx, 'hapag', HAPAG);
await probe(ctx, 'zim', ZIM);

console.log('\n最终窗口状态:', JSON.stringify(await windowBounds(ctx)));
await ctx.close().catch(() => {});
process.exit(0);
