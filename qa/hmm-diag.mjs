// HMM 诊断：首页有 From/To 表单（aria3 是某个页面抓的）。找当前能用的入口
import { launch, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import fs from 'node:fs';

const ctx = await launch({ headless: false });
const page = await ctx.newPage();

for (const url of [
  'https://www.hmm21.com/cms/business/ebiz/schedule/index/index.jsp',
  'https://www.hmm21.com/e-service/general/schedule/serviceNetwork/serviceNetworkCustomizedMain.do?siteTp=C',
  'https://www.hmm21.com/',
]) {
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => null);
  await sleep(4000);
  const t = await page.evaluate(() => document.body.innerText).catch(() => '');
  const hasFrom = await page.getByRole('textbox', { name: /input a location name/i }).first().isVisible().catch(() => false);
  console.log(url.slice(0, 70), '→ HTTP', resp?.status(), 'bodyLen', t.length, '有 From/To 表单:', hasFrom);
  if (hasFrom) {
    const snap = await page.locator('body').ariaSnapshot().catch(() => '');
    fs.writeFileSync('qa/aria-hmm-live.txt', snap);
    console.log('URL:', page.url());
    console.log(snap.split('\n').filter(l => /textbox|combobox|button|radio/i.test(l)).slice(0, 15).join('\n'));
    break;
  }
}
await ctx.close().catch(() => {});
process.exit(0);
