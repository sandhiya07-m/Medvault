const SyncLog = require('../models/SyncLog');

async function audit(req, action, entity, entityId, meta) {
  try {
    const u = req.user;
    await SyncLog.create({
      user: u && u._id,
      userName: u && u.name,
      role: u && u.role,
      facility: u && u.facility,
      action,
      entity,
      entityId,
      meta,
      ip: req.ip,
    });
  } catch (e) {
    console.error('audit failed', e.message);
  }
}
module.exports = audit;
