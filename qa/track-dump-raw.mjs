
import fs from 'node:fs';
import { trackMaersk } from '../engine/tracking/maersk.mjs';
const r = await trackMaersk('276759780');
if (!r.ok) { console.log('ERR', r.error); process.exit(1); }
const j = r.raw;
fs.writeFileSync('/tmp/maersk-full.json', JSON.stringify(j, null, 1));
console.log('TOP:', JSON.stringify(Object.keys(j)));
console.log('origin:', JSON.stringify(j.origin).slice(0, 200));
console.log('dest:', JSON.stringify(j.destination).slice(0, 200));
const c = (j.containers || [])[0] || {};
console.log('CONT keys:', JSON.stringify(Object.keys(c)).slice(0, 300));
const locs = c.locations || [];
console.log('locs:', locs.length);
for (const loc of locs) {
  console.log('— LOC:', (loc.city || '?'), '|', (loc.terminal || '').slice(0, 40), '| events', (loc.events || []).length);
  for (const e of (loc.events || [])) console.log('   EV:', JSON.stringify(e).slice(0, 260));
}
