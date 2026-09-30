// CMA Kendo combobox 行为诊断：input 的 aria 结构 + 点击后 Kendo 状态
import { launch, quietWindow, sleep } from '../engine/browser.mjs';
import { dismissCookies } from '../engine/lib/utils.mjs';
import fs from 'node:fs';
function log(s){ console.log(s); }
const ctx = await launch({}); await quietWindow(ctx, 'minimized').catch(()=>{});
const page = await ctx.newPage();
await page.goto('https://www.cma-cgm.com/ebusiness/schedules', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{});
await sleep(5000); await dismissCookies(page).catch(()=>{}); await sleep(1500);
const box = page.getByRole('combobox', { name: /port, city, country name or code/i }).first();
await box.click(); await sleep(800);
const info = await page.evaluate(() => {
  const inp = document.activeElement;
  const state = (el) => { const id = el && el.getAttribute && el.getAttribute('id'); return { id, cls: String(el?.className||'').slice(0,80), tag: el?.tagName }; };
  // Kendo 结构：input#... + span[data-role]? aria-owns 指向 list
  const owns = inp?.getAttribute('aria-owns'), ctrl = inp?.getAttribute('aria-controls'), expanded = inp?.getAttribute('aria-expanded');
  return { ...state(inp), owns, ctrl, expanded, role: inp?.getAttribute('role'), parentCls: String(inp?.parentElement?.className||'').slice(0,100) };
}).catch(e => String(e));
log('active input: ' + JSON.stringify(info));
await page.keyboard.type('ningbo', { delay: 80 }); await sleep(2500);
// aria-owns 指到的 list id
const listInfo = await page.evaluate((sel) => {
  const el = document.querySelector(sel);
  return el ? { id: el.id, cls: String(el.className).slice(0,100), items: el.querySelectorAll('li').length, firstHtml: el.querySelector('li')?.outerHTML.slice(0,200) } : null;
}, `#${info.owns || info.ctrl || 'x'}`).catch(e => String(e));
log('list: ' + JSON.stringify(listInfo));
await ctx.close().catch(()=>{}); process.exit(0);
