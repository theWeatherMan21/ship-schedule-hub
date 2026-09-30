import { launch, openPage, sleep } from '../engine/browser.mjs';
const ctx = await launch({});
try {
  const { page } = await openPage(ctx, 'https://moc.oocl.com/nj_prs_wss/#/sailing_schedules/search?PREFER_LANGUAGE=en-US');
  await sleep(12000);
  const info = await page.evaluate(() => {
    const out = { selects: [], ngWeek: [], labels: [] };
    document.querySelectorAll('select, mat-select, .mat-select, [role="combobox"]').forEach((s) => {
      const txt = (s.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      const opts = [...s.querySelectorAll('option')].map((o) => o.value + '=' + (o.textContent || '').trim()).slice(0, 8);
      out.selects.push({ tag: s.tagName, cls: (s.className || '').toString().slice(0, 50), txt, opts });
    });
    document.querySelectorAll('*').forEach((el) => {
      const ng = el.getAttribute && (el.getAttribute('ng-model') || '');
      if (ng && /week|date|sail|from|range/i.test(ng)) out.ngWeek.push({ ng, tag: el.tagName, val: el.value || el.textContent?.slice(0, 30) });
    });
    [...document.querySelectorAll('label, .th-label, th, .label')].slice(0, 25).forEach((l) => {
      const t = (l.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (t) out.labels.push(t);
    });
    return out;
  });
  console.log('selects:', JSON.stringify(info.selects, null, 1).slice(0, 1200));
  console.log('ng-week/date:', JSON.stringify(info.ngWeek.filter((x, i, a) => a.findIndex((y) => y.ng === x.ng) === i), null, 1).slice(0, 900));
  console.log('labels:', JSON.stringify([...new Set(info.labels)], null, 0).slice(0, 600));
} finally { await ctx.close().catch(() => {}); }
