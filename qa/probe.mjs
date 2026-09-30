// Probe a carrier page headless: dump forms, inputs, selects, buttons, iframes
// Usage: node qa/probe.mjs <url> [out.json]
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const url = process.argv[2];
const outPath = process.argv[3];
if (!url) { console.error('usage: node probe.mjs <url> [out.json]'); process.exit(2); }

const ctx = await chromium.launchPersistentContext('/Users/russospencer/Documents/trae_projects/ShipScheduleHub/browser-profile', {
  channel: 'chrome',
  headless: true,
  viewport: { width: 1366, height: 900 },
});
try {
  const page = await ctx.newPage();
  const resp = await page.goto(url, { timeout: 45000, waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const data = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const attrs = (el) => {
      const o = {};
      for (const a of ['id', 'name', 'type', 'placeholder', 'aria-label', 'aria-labelledby', 'autocomplete', 'role', 'data-testid', 'class', 'title', 'data-role']) {
        const v = el.getAttribute(a); if (v) o[a] = v.length > 90 ? v.slice(0, 90) + '…' : v;
      }
      return o;
    };
    const inputs = [...document.querySelectorAll('input, select, textarea')].map(el => ({
      tag: el.tagName.toLowerCase(), ...attrs(el),
      visible: vis(el),
      label: (el.labels?.[0]?.textContent || el.closest('label')?.textContent || '').trim().slice(0, 70),
      options: el.tagName === 'SELECT' ? [...el.options].slice(0, 8).map(o => o.textContent.trim().slice(0, 50)) : undefined,
    }));
    const buttons = [...document.querySelectorAll('button, [role=button], input[type=submit], input[type=button], a.btn, a.button')].map(el => ({
      tag: el.tagName.toLowerCase(), ...attrs(el),
      visible: vis(el),
      text: (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 70),
    }));
    const iframes = [...document.querySelectorAll('iframe')].map(f => ({ src: (f.src || '').slice(0, 160), title: f.title, id: f.id, visible: vis(f) }));
    const forms = [...document.querySelectorAll('form')].map(f => ({ id: f.id, name: f.name, action: (f.action || '').slice(0, 160), method: f.method, visible: vis(f) }));
    return {
      url: location.href, title: document.title,
      cf: document.title.toLowerCase().includes('moment') || !!document.querySelector('#challenge-form, #cf-wrapper-allowed, #challenge-running'),
      nInputs: inputs.length, inputs, buttons: buttons.filter(b => b.visible || b.tag !== 'a').slice(0, 60), iframes, forms,
      bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 600),
    };
  });
  const summary = { status: resp?.status(), finalUrl: data.url, title: data.title, cfChallenge: data.cf, iframes: data.iframes, nInputs: data.nInputs };
  console.log(JSON.stringify(summary, null, 1));
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(data, null, 1));
  await page.close();
} finally { await ctx.close(); }
