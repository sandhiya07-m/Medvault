const mongoose = require('mongoose');

/**
 * All clinical collections share one replicated-record shape. Clinical content lives in
 * `payload` (AES-256-GCM encrypted JSON); only routing/index fields are plaintext.
 */
function makeRecordModel(name, collection, extra = {}) {
  const schema = new mongoose.Schema(
    {
      uid: { type: String, required: true, unique: true }, // client generated UUID
      ...extra,
      payload: { type: String, required: true }, // encrypted JSON
      clock: { type: mongoose.Schema.Types.Mixed, default: {} }, // field -> ms timestamp (LWW)
      clockBy: { type: mongoose.Schema.Types.Mixed, default: {} }, // field -> deviceId
      updatedAt: { type: Number, required: true, index: true }, // max(clock) in ms
      version: { type: Number, default: 1 }, // bumped on every server merge
      deleted: { type: Boolean, default: false },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      facility: String,
      syncedAt: { type: Number, required: true, index: true }, // server time cursor for delta pull
    },
    { collection, minimize: false }
  );
  return mongoose.model(name, schema);
}

const Patient = makeRecordModel('Patient', 'patients', {
  healthId: { type: String, required: true, unique: true, index: true },
});
const Visit = makeRecordModel('Visit', 'visits', {
  patientId: { type: String, required: true, index: true },
});
const Prescription = makeRecordModel('Prescription', 'prescriptions', {
  patientId: { type: String, required: true, index: true },
  visitId: { type: String, index: true },
});
const LabResult = makeRecordModel('LabResult', 'labresults', {
  patientId: { type: String, required: true, index: true },
  visitId: { type: String, index: true },
});

// Which roles may write which collections via sync.
const COLLECTIONS = {
  patients: { model: Patient, write: ['healthworker', 'doctor'] },
  visits: { model: Visit, write: ['healthworker', 'doctor'] },
  prescriptions: { model: Prescription, write: ['doctor'] },
  labresults: { model: LabResult, write: ['healthworker', 'doctor'] },
};

module.exports = { Patient, Visit, Prescription, LabResult, COLLECTIONS };
