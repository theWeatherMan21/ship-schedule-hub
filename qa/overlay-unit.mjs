
// 离线自测（零网络）：假 cookie 弹窗 + 无名遮罩 → 验证 clearOverlays 真能让表单可交互
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';
import { clearOverlays } from '../engine/lib/utils.mjs';

const HTML = `<!doctype html><html><body style="margin:0">
  <div id="cookie" style="position:fixed;inset:0;background:#000c;z-index:9999;display:flex;align-items:center;justify-content:center">
    <div><p>We use cookies</p><button id="acc">Accept all</button></div>
  </div>
  <div id="push" style="position:fixed;inset:0;background:#111e;z-index:9998"></div>
  <h1>Schedule form</h1>
  <label>Location From</label><input id="from" />
  <button id="search">Search</button>
</body></html>`;
fs.writeFileSync('/tmp/overlay-fixture.html', HTML);

const chrome = process.env.SSH_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ headless: true, executablePath: chrome, args: ['--headless=new', '--no-first-run', '--disable-blink-features=AutomationControlled'] });
const ctx = await browser.newContext({ permissions: [] });
const page = await ctx.newPage();
await page.goto('file:///tmp/overlay-fixture.html');

let pass = 0, fail = 0;
const t = (d, c) => { if (c) { pass++; console.log('  ✓ ' + d); } else { fail++; console.log('  ✗ ' + d); } };

// 清理前：输入框点不到（被遮罩盖住）
const hitAt = async () => page.evaluate(() => {
  const el = document.querySelector('#from'); const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return hit ? (hit.id || hit.tagName.toLowerCase()) : 'none';
});
const blockedBefore = (await hitAt()) !== 'from';
t('清理前：表单确实被遮罩挡住（复现爹地报的现象）', blockedBefore);

const acted = await clearOverlays(page);
t('clearOverlays 报告已动作', acted === true);

const left = await page.evaluate(() => document.querySelectorAll('#cookie, #push').length);
t('两层遮罩都被清掉（0 个残留）', left === 0);

const reachable = (await hitAt()) === 'from';
t('清理后：表单输入框可直接点到', reachable);

// 真填一次，确认能交互
await page.click('#from');
await page.keyboard.type('Ningbo');
const v = await page.inputValue('#from');
t('清理后：输入框可正常输入（值 = Ningbo）', v === 'Ningbo');

// 弹窗盾正则：命中厂商域名、不误伤普通脚本
const RE = /(onetrust|cookielaw|cookiebot|osano|usercentrics|consentmanager|iubenda|privacy-mgmt|sourcepoint|civiccomputing|onesignal|webpushr|pushwoosh|fcmregistrations|firebaseinstallations|clarity\.ms|hotjar|cookieyes|termly|quantcast|trustarc|truste|ketchcdn)/i;
t('弹窗盾命中 OneTrust', RE.test('https://cdn.cookielaw.org/scripttemplates/otSDKStub.js'));
t('弹窗盾命中 OneSignal', RE.test('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js'));
t('弹窗盾不误伤站点自身脚本', !RE.test('https://www.zim.com/assets/app.abc123.js') && !RE.test('https://www.yangming.com/api/schedule'));

console.log(`\n  ${pass} 过 / ${fail} 败`);
await browser.close();
process.exit(fail ? 1 : 0);
