// Hapag：找真船名字段（之前取了 locationName=NINGBO 是错的）
import { launchHeadedQuiet, openPage, sleep } from '../engine/browser.mjs';
const { ctx } = await launchHeadedQuiet();
const { page } = await openPage(ctx, 'https://www.hapag-lloyd.com/solutions/vessel-schedule/#/?language=en', { reuse: true });
await sleep(20000);
const r = await page.evaluate(async () => {
  const resp = await fetch('https://schedule.api.hlag.cloud/api/routes?startLocation=CNNGB&endLocation=PLGDN&startDate=2026-09-24&startHaulage=MERCHANT&endHaulage=MERCHANT&containerType=42GP', {
    headers: { accept: 'application/json', 'x-token': 'public' },
  });
  const j = await resp.json();
  if (!j.routes || !j.routes.length) return { err: JSON.stringify(j).slice(0, 200) };
  const legs = j.routes[0].legs || [];
  return { nRoutes: j.routes.length, leg0Keys: Object.keys(legs[0]), leg0: JSON.stringify(legs[0]).slice(0, 900) };
});
console.log(JSON.stringify(r, null, 1).slice(0, 1300));
await ctx.close().catch(() => {});
process.exit(0);
