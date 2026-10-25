// Client copy of the server's per-field Last-Writer-Wins merge (see server/src/utils/merge.js).
export function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

const wins = (aTs, aDev, bTs, bDev) => (aTs !== bTs ? aTs > bTs : String(aDev || '') >= String(bDev || ''));

export function mergeRecords(a, b) {
  const data = {};
  const clock = {};
  const clockBy = {};
  const conflicts = [];
  const fields = [...new Set([...Object.keys(a.data || {}), ...Object.keys(b.data || {})])].sort();
  for (const f of fields) {
    const inA = a.data && f in a.data;
    const inB = b.data && f in b.data;
    const aTs = (a.clock && a.clock[f]) || 0;
    const bTs = (b.clock && b.clock[f]) || 0;
    const aDev = a.clockBy && a.clockBy[f];
    const bDev = b.clockBy && b.clockBy[f];
    let pickA;
    if (inA && !inB) pickA = true;
    else if (!inA && inB) pickA = false;
    else pickA = wins(aTs, aDev, bTs, bDev);
    data[f] = pickA ? a.data[f] : b.data[f];
    clock[f] = pickA ? aTs : bTs;
    clockBy[f] = pickA ? aDev : bDev;
    if (inA && inB && stable(a.data[f]) !== stable(b.data[f])) conflicts.push(f);
  }
  return { data, clock, clockBy, conflicts };
}
