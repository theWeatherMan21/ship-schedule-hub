// Hapag：对比维护状态（船期页 vs OLB 追踪页）+ 挖 OLB 后端接口线索
import { launchHeadedQuiet, quietWindow, sleep } from '../engine/browser.mjs';
import { isBlockPage } from '../engine/lib/utils.mjs';

const ctx = await launchHeadedQuiet().then((r) => { console.log('启动模式 ' + r.mode + ' ' + JSON.stringify(r.window)); return r.ctx; });
const page = ctx.pages()[0] || (await ctx.newPage());
page.setDefaultTimeout(15000);

async function open(u) {
  for (let i = 0; i < 4; i++) {
    try { await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch (e) { console.log('goto err ' + String(e).slice(0, 70)); }
    for (let j = 0; j < 12; j++) {
      await sleep(2500);
      const len = await page.evaluate(() => (document.body.innerText || '').length).catch(() => 0);
      if (!(await isBlockPage(page).catch(() => true)) && len > 200) { await sleep(2500); return true; }
    }
    console.log('  过盾重试 ' + (i + 1));
  }
  return false;
}

async function banner() {
  return page.evaluate(() => {
    const hits = [];
    for (const e of document.querySelectorAll('.hal-info-box, .hal-info-box__title, [class*=info-box], #HlMessages *')) {
      const t = (e.textContent || '').trim();
      if (t && /maintenance|not available/i.test(t)) {
        const cs = getComputedStyle(e);
        hits.push({ cls: (e.className || '').toString().slice(0, 50), text: t.slice(0, 150), disp: cs.display, vis: cs.visibility });
      }
    }
    return [...new Map(hits.map((h) => [h.text, h])).values()].slice(0, 5);
  }).catch(() => []);
}

for (const [label, u] of [
  ['船期页', 'https://www.hapag-lloyd.com/solutions/vessel-schedule/#/?language=en'],
  ['OLB-追踪booking', 'https://www.hapag-lloyd.com/en/online-business/track/track-by-booking-solution.html'],
  ['OLB-追踪container', 'https://www.hapag-lloyd.com/en/online-business/track/track-by-container-solution.html'],
]) {
  console.log('\n════ ' + label + ' ' + u);
  console.log('过盾: ' + await open(u));
  console.log('title: ' + await page.title().catch(() => '?'));
  console.log('维护/不可用提示: ' + JSON.stringify(await banner()));
}

// OLB 脚本与接口线索
console.log('\n== 脚本/接口线索 ==');
console.log(await page.evaluate(() => ({
  scripts: [...document.querySelectorAll('script[src]')].map((s) => s.src).filter((u) => /olb|tracing|api|hlag|track/i.test(u)).slice(0, 20),
  metas: [...document.querySelectorAll('meta')].map((m) => `${m.name || m.getAttribute('property') || ''}=${(m.content || '').slice(0, 90)}`).filter((x) => /api|url|endpoint/i.test(x)).slice(0, 15),
  links: [...document.querySelectorAll('link[href]')].map((l) => l.href).filter((u) => /api|olb/i.test(u)).slice(0, 10),
})).catch((e) => String(e).slice(0, 100)));

await ctx.close().catch(() => {});
process.exit(0);
