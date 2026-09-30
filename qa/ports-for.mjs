import { resolvePort } from '../engine/lib/portsolve.mjs';
for (const c of ['hmm', 'maersk', 'one', 'msc']) {
  for (const p of ['Ningbo', 'Istanbul']) {
    const r = await resolvePort(c, p);
    console.log(c.padEnd(8), p.padEnd(9), JSON.stringify(r));
  }
}
