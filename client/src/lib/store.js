// Encrypted local data layer. Every record is stored in IndexedDB as
// { uid, <index fields>, dirty, updatedAt, version, blob:{iv,ct} } where blob = AES-GCM({data,clock,clockBy}).
// `dirty = 1` rows are the pending-changes (sync) queue.
import { encryptJSON, decryptJSON, sha256Hex } from './crypto.js';
import { mergeRecords, stable } from './merge.js';
import { uuid, generateHealthId } from './ids.js';

export const TABLES = ['patients', 'visits', 'prescriptions', 'labresults']; // push order matters
let db = null;
let key = null;
let deviceId = 'unknown-device';
const listeners = new Set();

export function bind(database, cryptoKey, device) {
  db = database;
  key = cryptoKey;
  deviceId = device;
}
export function unbind() { db = null; key = null; }
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

async function seal(table, rec, dirty) {
  const { data, clock, clockBy } = rec;
  const row = {
    uid: rec.uid,
    dirty: dirty ? 1 : 0,
    updatedAt: Math.max(0, ...Object.values(clock)),
    version: rec.version || 0,
    blob: await encryptJSON(key, { data, clock, clockBy }),
  };
  if (table === 'patients') row.healthIdHash = await sha256Hex(data.healthId);
  else row.patientId = data.patientId;
  if (data.visitId) row.visitId = data.visitId;
  await db.table(table).put(row);
}

async function open(row) {
  const { data, clock, clockBy } = await decryptJSON(key, row.blob);
  return { uid: row.uid, data, clock, clockBy, dirty: !!row.dirty, updatedAt: row.updatedAt, version: row.version };
}

/** Build a local change: only changed fields get a fresh timestamp (field-level LWW). */
function stamp(existing, changes) {
  const now = Date.now();
  const data = { ...(existing ? existing.data : {}) };
  const clock = { ...(existing ? existing.clock : {}) };
  const clockBy = { ...(existing ? existing.clockBy : {}) };
  for (const [f, v] of Object.entries(changes)) {
    if (existing && stable(existing.data[f]) === stable(v)) continue;
    data[f] = v;
    clock[f] = now;
    clockBy[f] = deviceId;
  }
  return { data, clock, clockBy };
}

export async function getRecord(table, uid) {
  const row = await db.table(table).get(uid);
  return row ? open(row) : null;
}

async function listAll(table) {
  const rows = await db.table(table).toArray();
  const recs = await Promise.all(rows.map(open));
  return recs.filter((r) => !r.data.deleted);
}

export async function saveRecord(table, uid, changes) {
  const existing = uid ? await getRecord(table, uid) : null;
  const next = stamp(existing, changes);
  const rec = { uid: uid || uuid(), ...next, version: existing ? existing.version : 0 };
  await seal(table, rec, true);
  emit();
  return { ...rec, dirty: true };
}

// ---- Patients -------------------------------------------------------------------------
export async function listPatients() {
  const all = await listAll('patients');
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function findPatientByHealthId(healthId) {
  const hash = await sha256Hex(healthId);
  const row = await db.table('patients').where('healthIdHash').equals(hash).first();
  const rec = row ? await open(row) : null;
  return rec && !rec.data.deleted ? rec : null;
}

export async function createPatient(fields) {
  return saveRecord('patients', null, { ...fields, healthId: generateHealthId(), deleted: false });
}
export const updatePatient = (uid, changes) => saveRecord('patients', uid, changes);

// ---- Child records ----------------------------------------------------------------------
export async function listByPatient(table, patientId) {
  const rows = await db.table(table).where('patientId').equals(patientId).toArray();
  const recs = (await Promise.all(rows.map(open))).filter((r) => !r.data.deleted);
  return recs;
}
export const addChild = (table, fields) => saveRecord(table, null, { ...fields, deleted: false });
export const softDelete = (table, uid) => saveRecord(table, uid, { deleted: true });

// ---- Sync support ----------------------------------------------------------------------------
export async function pendingChanges() {
  const out = [];
  for (const table of TABLES) {
    const rows = await db.table(table).where('dirty').equals(1).toArray();
    for (const row of rows) {
      const r = await open(row);
      out.push({ collection: table, record: { uid: r.uid, data: r.data, clock: r.clock, clockBy: r.clockBy } });
    }
  }
  return out;
}

export async function pendingCount() {
  let n = 0;
  for (const table of TABLES) n += await db.table(table).where('dirty').equals(1).count();
  return n;
}

export async function pendingByTable() {
  const out = {};
  for (const table of TABLES) out[table] = await db.table(table).where('dirty').equals(1).count();
  return out;
}

/**
 * Merge a record received from the server into the local copy. If the merged result still
 * differs from what the server holds (we have newer local edits), it stays queued (dirty).
 * Returns { conflicts } listing fields where both sides held different values.
 */
export async function applyRemote(table, remote) {
  const row = await db.table(table).get(remote.uid);
  const rem = { data: remote.data, clock: remote.clock, clockBy: remote.clockBy };
  let merged = rem;
  let conflicts = [];
  if (row) {
    const local = await open(row);
    merged = mergeRecords({ data: local.data, clock: local.clock, clockBy: local.clockBy }, rem);
    conflicts = merged.conflicts;
  }
  const inSyncWithServer = stable(merged.data) === stable(rem.data) && stable(merged.clock) === stable(rem.clock);
  // Skip rewriting when nothing changed locally (avoids useless re-encryption on repeated pulls).
  if (row && inSyncWithServer && !row.dirty && row.version === remote.version) return { conflicts };
  await seal(table, { uid: remote.uid, ...merged, version: remote.version }, !inSyncWithServer);
  emit();
  return { conflicts };
}

export async function clearAll() {
  for (const t of TABLES) await db.table(t).clear();
  emit();
}
