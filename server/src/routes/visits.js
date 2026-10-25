const express = require('express');
const crypto = require('crypto');
const { authenticate, requireRole } = require('../middleware/auth');
const { wrap } = require('../middleware/error');
const { Visit, Prescription, LabResult, Patient } = require('../models/records');
const { upsertRecord, toWire } = require('../utils/syncService');
const audit = require('../utils/audit');

const router = express.Router();
router.use(authenticate, requireRole('healthworker', 'doctor'));

function stamp(data, deviceId) {
  const now = Date.now();
  const clock = {};
  const clockBy = {};
  Object.keys(data).forEach((f) => { clock[f] = now; clockBy[f] = deviceId; });
  return { clock, clockBy };
}

// POST /api/visits - create a visit (optionally with prescriptions / lab results)
router.post(
  '/',
  wrap(async (req, res) => {
    const { visit, prescriptions = [], labResults = [] } = req.body;
    if (!visit || !visit.patientId) return res.status(400).json({ message: 'visit.patientId is required' });
    if (!(await Patient.exists({ uid: visit.patientId }))) return res.status(404).json({ message: 'Unknown patient' });
    const visitUid = visit.uid || crypto.randomUUID();
    const vData = { ...visit, deleted: false };
    delete vData.uid;
    const out = {};
    out.visit = (await upsertRecord('visits', { uid: visitUid, data: vData, ...stamp(vData, 'server-api') }, req.user)).record;
    out.prescriptions = [];
    for (const p of prescriptions) {
      const d = { ...p, patientId: visit.patientId, visitId: visitUid, deleted: false };
      out.prescriptions.push((await upsertRecord('prescriptions', { uid: crypto.randomUUID(), data: d, ...stamp(d, 'server-api') }, req.user)).record);
    }
    out.labResults = [];
    for (const l of labResults) {
      const d = { ...l, patientId: visit.patientId, visitId: visitUid, deleted: false };
      out.labResults.push((await upsertRecord('labresults', { uid: crypto.randomUUID(), data: d, ...stamp(d, 'server-api') }, req.user)).record);
    }
    await audit(req, 'visit.create', 'visit', visitUid, { patientId: visit.patientId });
    res.status(201).json(out);
  })
);

// GET /api/visits?patientId=<uid>
router.get(
  '/',
  wrap(async (req, res) => {
    const { patientId } = req.query;
    if (!patientId) return res.status(400).json({ message: 'patientId query required' });
    const [visits, rx, labs] = await Promise.all([
      Visit.find({ patientId, deleted: false }).sort({ updatedAt: -1 }),
      Prescription.find({ patientId, deleted: false }),
      LabResult.find({ patientId, deleted: false }),
    ]);
    await audit(req, 'visit.list', 'patient', patientId);
    res.json({ visits: visits.map(toWire), prescriptions: rx.map(toWire), labResults: labs.map(toWire) });
  })
);

module.exports = router;
