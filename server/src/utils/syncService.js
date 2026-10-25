const { COLLECTIONS } = require('../models/records');
const { encryptJSON, decryptJSON } = require('./crypto');
const { mergeRecords, stable } = require('./merge');
const { generateHealthId, HEALTH_ID_RE } = require('./healthId');

const MAX_FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;

function toWire(doc) {
  const data = decryptJSON(doc.payload);
  return {
    uid: doc.uid,
    data,
    clock: doc.clock || {},
    clockBy: doc.clockBy || {},
    updatedAt: doc.updatedAt,
    version: doc.version,
    deleted: !!doc.deleted,
    syncedAt: doc.syncedAt,
  };
}

function sanitizeIncoming(rec) {
  if (!rec || typeof rec.uid !== 'string' || !rec.uid || typeof rec.data !== 'object' || rec.data === null) {
    throw Object.assign(new Error('Malformed record'), { status: 400 });
  }
  const now = Date.now();
  const clock = {};
  const clockBy = {};
  for (const f of Object.keys(rec.data)) {
    let ts = Number(rec.clock && rec.clock[f]);
    if (!Number.isFinite(ts) || ts <= 0) ts = now;
    // Reject clocks far in the future (misconfigured device clocks would win every merge).
    clock[f] = Math.min(ts, now + MAX_FUTURE_SKEW_MS);
    clockBy[f] = String((rec.clockBy && rec.clockBy[f]) || 'unknown');
  }
  return { data: rec.data, clock, clockBy };
}

/** Index fields derived from the merged data. */
function indexFields(collection, data) {
  if (collection === 'patients') return { healthId: data.healthId };
  if (collection === 'visits') return { patientId: data.patientId };
  return { patientId: data.patientId, visitId: data.visitId };
}

function validate(collection, data) {
  if (collection === 'patients') {
    if (!data.healthId || !HEALTH_ID_RE.test(data.healthId)) throw Object.assign(new Error('Invalid healthId'), { status: 400 });
    if (!data.name) throw Object.assign(new Error('Patient name required'), { status: 400 });
  } else if (!data.patientId) {
    throw Object.assign(new Error('patientId required'), { status: 400 });
  }
}

/**
 * Merge one incoming record into the server store. Returns { record, created, conflicts }.
 * Safe to call repeatedly with the same record (idempotent) so retries never duplicate.
 */
async function upsertRecord(collection, incomingRaw, user) {
  const cfg = COLLECTIONS[collection];
  if (!cfg) throw Object.assign(new Error(`Unknown collection ${collection}`), { status: 400 });
  if (!cfg.write.includes(user.role)) {
    throw Object.assign(new Error(`Role ${user.role} cannot write ${collection}`), { status: 403 });
  }
  const incoming = sanitizeIncoming(incomingRaw);
  const Model = cfg.model;
  const existing = await Model.findOne({ uid: incomingRaw.uid });

  let merged;
  let conflicts = [];
  if (existing) {
    const current = { data: decryptJSON(existing.payload), clock: existing.clock, clockBy: existing.clockBy };
    const m = mergeRecords(current, incoming);
    merged = m;
    conflicts = m.conflicts;
  } else {
    merged = { data: incoming.data, clock: incoming.clock, clockBy: incoming.clockBy };
  }

  // Patients: Health IDs must be unique. A (very unlikely) collision on a different uid is
  // resolved by issuing a new Health ID that wins the merge on the next pull.
  if (collection === 'patients') {
    const clash = await Model.findOne({ healthId: merged.data.healthId, uid: { $ne: incomingRaw.uid } });
    if (clash) {
      let id;
      do id = generateHealthId();
      while (await Model.exists({ healthId: id }));
      merged.data.healthId = id;
      merged.clock.healthId = Date.now() + 1;
      merged.clockBy.healthId = 'server';
      conflicts.push('healthId');
    }
  }

  validate(collection, merged.data);
  const updatedAt = Math.max(0, ...Object.values(merged.clock));
  const fields = {
    ...indexFields(collection, merged.data),
    payload: encryptJSON(merged.data),
    clock: merged.clock,
    clockBy: merged.clockBy,
    updatedAt,
    deleted: !!merged.data.deleted,
    facility: user.facility,
    syncedAt: Date.now(),
  };

  let doc;
  if (existing) {
    // Skip a write (and version bump) when nothing changed: keeps retries idempotent.
    const same = stable(decryptJSON(existing.payload)) === stable(merged.data) &&
      stable(existing.clock) === stable(merged.clock) && stable(existing.clockBy) === stable(merged.clockBy);
    if (same) {
      doc = existing;
    } else {
      Object.assign(existing, fields, { version: existing.version + 1 });
      existing.markModified('clock');
      existing.markModified('clockBy');
      doc = await existing.save();
    }
  } else {
    doc = await Model.create({ uid: incomingRaw.uid, ...fields, createdBy: user._id, version: 1 });
  }
  return { record: toWire(doc), created: !existing, conflicts };
}

async function pullSince(collection, since, limit = 500, filter = {}) {
  const Model = COLLECTIONS[collection].model;
  const docs = await Model.find({ syncedAt: { $gte: since }, ...filter }).sort({ syncedAt: 1 }).limit(limit);
  return docs.map(toWire);
}

module.exports = { upsertRecord, pullSince, toWire };
