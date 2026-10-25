const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { wrap } = require('../middleware/error');
const SyncLog = require('../models/SyncLog');

const router = express.Router();

// GET /api/audit?action=&user=&limit= - view audit logs (admin)
router.get('/', authenticate, requireRole('admin'), wrap(async (req, res) => {
  const q = {};
  if (req.query.action) q.action = { $regex: `^${String(req.query.action).replace(/[^a-zA-Z0-9._]/g, '')}` };
  if (req.query.user) q.userName = { $regex: String(req.query.user).replace(/[^a-zA-Z0-9 ._@-]/g, ''), $options: 'i' };
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const logs = await SyncLog.find(q).sort({ at: -1 }).limit(limit);
  res.json(logs);
}));

module.exports = router;
