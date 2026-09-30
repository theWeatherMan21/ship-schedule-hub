// Deep probe: wait longer, capture custom comboboxes, shadow DOM, angular/react roots
// Usage: node qa/probe2.mjs <url> [out.json]
import { chromium } from '../engine/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const url = process.argv[2];
const outPath = process.argv[3];
if (!url) { console.error('usage: node probe2.mjs <url> [out.json]'); process.exit(2); }

const ctx = await chromium.launchPersistentContext('/Users/russospencer/Documents/trae_projects/ShipScheduleHub/browser-profile', {
  channel: 'chrome',
  headless: true,
  viewport: { width: 1440, height: 1000 },
});
try {
  const page = await ctx.newPage();
  const resp = await page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(6000);
  const data = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const attrs = (el) => {
      const o = {};
      for (const a of ['id', 'name', 'type', 'placeholder', 'aria-label', 'aria-labelledby', 'autocomplete', 'role', 'data-testid', 'class', 'title', 'data-role', 'ng-reflect-name', 'formcontrolname', 'data-ddi-input']) {
        const v = el.getAttribute(a); if (v) o[a] = v.length > 100 ? v.slice(0, 100) + '…' : v;
      }
      return o;
    };
    // all interactive-ish elements, including div/span with combobox/searchbox role or tabindex
    const ctrls = [...document.querySelectorAll('input, select, textarea, [role=combobox], [role=searchbox], [role=listbox], [contenteditable=true]')].map(el => ({
      tag: el.tagName.toLowerCase(), ...attrs(el),
      visible: vis(el),
      label: (el.labels?.[0]?.textContent || el.closest('label')?.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 80),
      options: el.tagName === 'SELECT' ? [...el.options].slice(0, 10).map(o => o.textContent.trim().slice(0, 60)) : undefined,
    }));
    const buttons = [...document.querySelectorAll('button, [role=button], input[type=submit]')].map(el => ({
      tag: el.tagName.toLowerCase(), ...attrs(el),
      visible: vis(el),
      text: (el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 80),
    })).filter(b => b.visible);
    const iframes = [...document.querySelectorAll('iframe')].map(f => ({ src: (f.src || '').slice(0, 180), title: f.title, id: f.id, visible: vis(f) }));
    return {
      url: location.href, title: document.title,
      ctrls, buttons: buttons.slice(0, 50), iframes,
      bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 1200),
    };
  });
  console.log(JSON.stringify({ status: resp?.status(), finalUrl: data.url, title: data.title, nCtrls: data.ctrls.length, nBtns: data.buttons.length, iframes: data.iframes.length }));
  if (outPath) fs.writeFileSync(outPath, JSON.stringify(data, null, 1));
  await page.close();
} finally { await ctx.close(); }
