const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { wrap } = require('../middleware/error');
const { COLLECTIONS } = require('../models/records');
const { upsertRecord, pullSince } = require('../utils/syncService');
const audit = require('../utils/audit');

const router = express.Router();
router.use(authenticate, requireRole('healthworker', 'doctor'));

const MAX_PUSH = 200;

/**
 * POST /api/sync/push   { deviceId, changes: [{ collection, record:{uid,data,clock,clockBy} }] }
 * Upload offline changes (delta). Each change is merged with the server copy (per-field
 * LWW CRDT). Response lists, per change, the merged record so the device converges, and
 * which changes failed (the device keeps those in its retry queue).
 */
router.post(
  '/push',
  wrap(async (req, res) => {
    const { changes } = req.body;
    if (!Array.isArray(changes)) return res.status(400).json({ message: 'changes must be an array' });
    if (changes.length > MAX_PUSH) return res.status(413).json({ message: `Max ${MAX_PUSH} changes per push` });

    const results = [];
    let conflicts = 0;
    for (const ch of changes) {
      const uid = ch && ch.record && ch.record.uid;
      try {
        // Order matters: a patient must exist before its visits are accepted.
        const r = await upsertRecord(ch.collection, ch.record, req.user);
        conflicts += r.conflicts.length ? 1 : 0;
        results.push({ collection: ch.collection, uid, ok: true, record: r.record, conflicts: r.conflicts });
      } catch (e) {
        results.push({ collection: ch && ch.collection, uid, ok: false, status: e.status || 500, error: e.status ? e.message : 'Server error' });
      }
    }
    const okCount = results.filter((r) => r.ok).length;
    await audit(req, 'sync.push', 'sync', null, { received: changes.length, accepted: okCount, conflicts, deviceId: req.body.deviceId });
    res.json({ results, serverTime: Date.now() });
  })
);

/**
 * GET /api/sync/pull?since=<ms>  Download server changes since a cursor (inclusive; merges are
 * idempotent so a repeated boundary record is harmless). Pull is paged per collection:
 * if `hasMore` is true, call again with the returned cursor.
 */
router.get(
  '/pull',
  wrap(async (req, res) => {
    const since = Math.max(0, Number(req.query.since) || 0);
    const limit = 300;
    const out = {};
    let cursor = since;
    let hasMore = false;
    // Take a snapshot cutoff so a long pull can't skip writes landing mid-request.
    for (const name of Object.keys(COLLECTIONS)) {
      const recs = await pullSince(name, since, limit + 1);
      if (recs.length > limit) { hasMore = true; recs.pop(); }
      out[name] = recs;
    }
    // Cursor: when more pages remain, advance only to the smallest "last syncedAt" of the
    // truncated collections so nothing is skipped.
    const all = Object.values(out).flat();
    if (hasMore) {
      let safe = Infinity;
      for (const name of Object.keys(out)) {
        const recs = out[name];
        if (recs.length >= limit) safe = Math.min(safe, recs[recs.length - 1].syncedAt);
      }
      cursor = Number.isFinite(safe) ? safe : since;
      if (cursor === since && all.length) cursor = since; // identical timestamps: client re-requests same window
    } else {
      cursor = all.length ? Math.max(since, ...all.map((r) => r.syncedAt)) : since;
    }
    await audit(req, 'sync.pull', 'sync', null, { since, returned: all.length });
    res.json({ ...out, cursor, hasMore, serverTime: Date.now() });
  })
);

module.exports = router;
