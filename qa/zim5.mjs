import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.zim.com/schedules/point-to-point', { reuse: true });
await sleep(13000);
const r = await page.evaluate(async () => {
  const key = '9d63cf020a4c4708a7b0ebfe39578300';
  const u = `https://apigw.zim.com/digitalSchedules/PointToPoint/v2?subscription-key=${key}&PortCode=CNNGB%3B0&PortDestinationCode=TRIST%3B0&Direction=true&FromDate=23-September-2026&WeeksAhead=6&CountryCode=US&CargoType=true`;
  try {
    const resp = await fetch(u, { headers: { accept: 'application/json' } });
    const t = await resp.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    return { status: resp.status, len: t.length, type: Array.isArray(j) ? `${j.length}条` : typeof j, sample: JSON.stringify(j).slice(0, 900) };
  } catch (e) { return { error: String(e).slice(0, 120) }; }
});
console.log(JSON.stringify(r, null, 1).slice(0, 1200));
await ctx.close().catch(() => {});
process.exit(0);
