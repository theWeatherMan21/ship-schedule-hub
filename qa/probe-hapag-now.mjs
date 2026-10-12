// Hapag 追踪页拦截现状复核 — 2026-10-12（无头静默，用完即弃）
import { launch } from '../engine/browser.mjs';
import { isBlockPage } from '../engine/lib/utils.mjs';

const ctx = await launch({ headless: true });
try {
  const page = ctx.pages()[0] || (await ctx.newPage());
  let status = null; let err = null;
  try {
    const resp = await page.goto('https://www.hapag-lloyd.com/en/online-business/track/track.html', {
      waitUntil: 'domcontentloaded', timeout: 45000,
    });
    status = resp ? resp.status() : null;
  } catch (e) { err = String(e).slice(0, 120); }

  await new Promise((r) => setTimeout(r, 8000));

  const info = await page.evaluate(() => ({
    title: (document.title || '').slice(0, 90),
    len: (document.body ? document.body.innerText || '' : '').length,
    head: (document.documentElement.outerHTML || '').slice(0, 300).replace(/\s+/g, ' '),
  })).catch((e) => ({ err: String(e).slice(0, 90) }));

  let blocked = null;
  try { blocked = await isBlockPage(page); } catch { /* ignore */ }

  console.log(JSON.stringify({ status, err, blocked, info }, null, 1));
} finally {
  await ctx.close();
}
