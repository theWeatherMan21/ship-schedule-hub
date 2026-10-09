const MK = null;
const q = async (o, d) => {
  const u = `https://www.msc.com/api/feature/tools/PortScheduleSearch?departurePortCode=${o}&arrivalPortCode=${d}&startDate=2026-10-10&endDate=2026-11-20&directOnly=false`;
  try {
    const r = await fetch(u, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    let n = 0; try { const j = JSON.parse(t); n = Array.isArray(j) ? j.length : (j && (j.schedules || j.results || j.data || [])).length || (typeof j === 'object' ? Object.keys(j).length : 0); } catch {}
    return { status: r.status, n, head: t.slice(0, 90).replace(/\s+/g, ' ') };
  } catch (e) { return { status: 'ERR', n: 0, head: String(e.message).slice(0, 70) }; }
};
