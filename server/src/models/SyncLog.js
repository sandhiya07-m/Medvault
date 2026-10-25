const mongoose = require('mongoose');

// Audit + sync log (collection: synclogs)
const syncLogSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  userName: String,
  role: String,
  facility: String,
  action: { type: String, required: true, index: true }, // e.g. auth.login, patient.read, sync.push
  entity: String,
  entityId: String,
  meta: mongoose.Schema.Types.Mixed,
  ip: String,
});

module.exports = mongoose.model('SyncLog', syncLogSchema);
