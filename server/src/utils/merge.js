/**
 * CRDT-style merge: every synced record is a map of fields, and every field is a
 * Last-Writer-Wins register. A record carries `clock[field] = timestamp(ms)` and
 * `clockBy[field] = deviceId` (tie breaker). Merging two replicas takes, per field,
 * the value with the greater (timestamp, deviceId). The operation is commutative,
 * associative and idempotent, so replicas converge regardless of sync order and
 * re-sent (retried) pushes never create duplicates or corrupt data.
 *
 * `deleted` is just another LWW field (tombstone), so deletes also converge.
 */
/** JSON.stringify with sorted keys so equal records always compare equal. */
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

function wins(aTs, aDev, bTs, bDev) {
  if (aTs !== bTs) return aTs > bTs;
  return String(aDev || '') >= String(bDev || '');
}

/**
 * @param {{data:object, clock:object, clockBy:object}} a  current (server) replica
 * @param {{data:object, clock:object, clockBy:object}} b  incoming replica
 * @returns merged replica + `conflicts` (fields where both sides differed)
 */
function mergeRecords(a, b) {
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
    let pick;
    if (inA && !inB) pick = 'a';
    else if (!inA && inB) pick = 'b';
    else pick = wins(aTs, aDev, bTs, bDev) ? 'a' : 'b';
    const src = pick === 'a' ? a : b;
    data[f] = src.data[f];
    clock[f] = pick === 'a' ? aTs : bTs;
    clockBy[f] = pick === 'a' ? aDev : bDev;
    if (inA && inB && stable(a.data[f]) !== stable(b.data[f])) conflicts.push(f);
  }
  return { data, clock, clockBy, conflicts };
}

module.exports = { mergeRecords, stable };
