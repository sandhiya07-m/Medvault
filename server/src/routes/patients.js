const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { wrap } = require('../middleware/error');
const { Patient } = require('../models/records');
const { upsertRecord, toWire } = require('../utils/syncService');
const { generateHealthId, HEALTH_ID_RE } = require('../utils/healthId');
const audit = require('../utils/audit');
const crypto = require('crypto');

const router = express.Router();
router.use(authenticate, requireRole('healthworker', 'doctor'));

// POST /api/patients - register patient & create Health ID (online path; offline uses /sync/push)
router.post(
  '/',
  wrap(async (req, res) => {
    const data = { ...req.body };
    if (!data.name) return res.status(400).json({ message: 'name is required' });
    let healthId = data.healthId;
    if (!healthId || !HEALTH_ID_RE.test(healthId)) {
      do healthId = generateHealthId();
      while (await Patient.exists({ healthId }));
    }
    const now = Date.now();
    const uid = data.uid || crypto.randomUUID();
    delete data.uid;
    const fullData = { ...data, healthId, deleted: false };
    const clock = {};
    const clockBy = {};
    Object.keys(fullData).forEach((f) => { clock[f] = now; clockBy[f] = 'server-api'; });
    const { record } = await upsertRecord('patients', { uid, data: fullData, clock, clockBy }, req.user);
    await audit(req, 'patient.create', 'patient', record.data.healthId);
    res.status(201).json(record);
  })
);

// GET /api/patients - list (decrypted) for this facility's staff
router.get(
  '/',
  wrap(async (req, res) => {
    const docs = await Patient.find({ deleted: false }).sort({ updatedAt: -1 }).limit(500);
    await audit(req, 'patient.list', 'patient', null, { count: docs.length });
    res.json(docs.map(toWire));
  })
);

// GET /api/patients/:healthId - fetch patient by Health ID / QR
router.get(
  '/:healthId',
  wrap(async (req, res) => {
    const healthId = req.params.healthId.toUpperCase();
    const doc = await Patient.findOne({ healthId });
    if (!doc || doc.deleted) return res.status(404).json({ message: 'Patient not found' });
    await audit(req, 'patient.read', 'patient', healthId);
    res.json(toWire(doc));
  })
);

module.exports = router;
