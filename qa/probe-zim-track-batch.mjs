// ZIM 追踪 —— 批量直测（页面内 fetch，绕 Akamai；单页多号，快）
import { launch, sleep } from '../engine/browser.mjs';
import fs from 'node:fs';

const NUMS = (process.argv[2] || 'ZIMUSHH31595183,ZIMUBCN10212938,ZIMUMEX964578,ZIMUVAN962802,ZIMUHFX925436,ZIMUBCN10198564,TGBU4028006').split(',').map((s) => s.trim()).filter(Boolean);
const KEY = '9d63cf020a4c4708a7b0ebfe39578300';

const ctx = await launch({ headless: true });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://www.zim.com/tools/track-a-shipment', { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(6000);

const out = [];
for (const n of NUMS) {
  const r = await page.evaluate(async ({ num, key }) => {
    try {
      const u = `https://apigw.zim.com/digital/TrackShipment/v2/complete-result?reference=${encodeURIComponent(num)}&subscription-key=${key}`;
      const resp = await fetch(u, { headers: { accept: 'application/json' } });
      const t = await resp.text();
      return { status: resp.status, body: t, len: t.length };
    } catch (e) { return { error: String(e).slice(0, 160) }; }
  }, { num: n, key: KEY }).catch((e) => ({ error: String(e).slice(0, 160) }));

  let summary = {};
  try {
    const j = JSON.parse(r.body);
    summary = {
      isSuccess: j.isSuccess,
      units: (j.unitListItem || []).length,
      consg: (j.consgListItem || []).length,
      unit0: (j.unitListItem && j.unitListItem[0]) ? { prefix: j.unitListItem[0].unitPrefix, no: j.unitListItem[0].unitNo, acts: (j.unitListItem[0].unitActivities && j.unitListItem[0].unitActivities.unitActivitiesItem || []).length } : null,
      consg0: (j.consgListItem && j.consgListItem[0]) ? Object.keys(j.consgListItem[0]) : null,
      msg: j.message || null,
    };
  } catch { summary = { parseErr: r.body ? r.body.slice(0, 200) : null }; }
  console.log(`### ${n} status=${r.status} len=${r.len} ${r.error || ''} :: ${JSON.stringify(summary)}`);
  out.push({ n, status: r.status, len: r.len, body: r.body });
  await sleep(1200);
}
fs.writeFileSync('/tmp/zim-track-batch.json', JSON.stringify(out, null, 1));
console.log('### saved /tmp/zim-track-batch.json');
await ctx.close().catch(() => {});
process.exit(0);
