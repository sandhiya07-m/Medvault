const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const { wrap } = require('../middleware/error');
const User = require('../models/User');
const SyncLog = require('../models/SyncLog');
const { Patient, Visit, Prescription, LabResult } = require('../models/records');
const audit = require('../utils/audit');

const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const { validate } = require('../middleware/error');
const { emailChain } = require('../utils/email');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

// GET /api/admin/users
router.get('/users', wrap(async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  res.json(users.map((u) => u.toSafeJSON()));
}));

// POST /api/admin/users - create an account directly (active immediately, any role)
router.post(
  '/users',
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name is required'),
    emailChain(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').isIn(['healthworker', 'doctor', 'admin']).withMessage('Bad role'),
    body('facility').optional().trim(),
  ],
  validate,
  wrap(async (req, res) => {
    const { name, email, password, role, facility } = req.body;
    if (await User.exists({ email })) return res.status(409).json({ message: 'Email already registered' });
    const user = await User.create({
      name, email, role,
      facility: facility || 'Unassigned',
      passwordHash: await bcrypt.hash(password, 12),
      status: 'active',
    });
    await audit(req, 'admin.user_create', 'user', user._id.toString(), { email, role });
    res.status(201).json(user.toSafeJSON());
  })
);

// PATCH /api/admin/users/:id  { status?, role?, facility?, name?, email?, password? } - approve / deactivate / edit / reset password
router.patch('/users/:id', wrap(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ message: 'User not found' });
  const { status, role, facility, name, email, password } = req.body;
  if (status) {
    if (!['pending', 'active', 'deactivated'].includes(status)) return res.status(400).json({ message: 'Bad status' });
    if (user._id.equals(req.user._id) && status !== 'active') return res.status(400).json({ message: 'You cannot deactivate yourself' });
    user.status = status;
  }
  if (role) {
    if (!['healthworker', 'doctor', 'admin'].includes(role)) return res.status(400).json({ message: 'Bad role' });
    if (user._id.equals(req.user._id) && role !== 'admin') return res.status(400).json({ message: 'You cannot change your own role' });
    user.role = role;
  }
  if (typeof name === 'string' && name.trim()) user.name = name.trim();
  if (typeof email === 'string' && email.trim()) {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return res.status(400).json({ message: 'Valid email required' });
    if (e !== user.email && (await User.exists({ email: e }))) return res.status(409).json({ message: 'Email already registered' });
    user.email = e;
  }
  if (password !== undefined) {
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    user.passwordHash = await bcrypt.hash(password, 12);
  }
  if (typeof facility === 'string') user.facility = facility.trim() || 'Unassigned';
  await user.save();
  await audit(req, 'admin.user_update', 'user', user._id.toString(), { status, role, facility, email, name, passwordReset: password !== undefined || undefined });
  res.json(user.toSafeJSON());
}));

// GET /api/admin/reports - aggregate counts only (no clinical content is decrypted)
router.get('/reports', wrap(async (req, res) => {
  const since = Date.now() - 14 * 24 * 3600 * 1000;
  const [patients, visits, prescriptions, labs, users, byFacility, visitsByDay] = await Promise.all([
    Patient.countDocuments({ deleted: false }),
    Visit.countDocuments({ deleted: false }),
    Prescription.countDocuments({ deleted: false }),
    LabResult.countDocuments({ deleted: false }),
    User.countDocuments({ status: 'active' }),
    Patient.aggregate([{ $match: { deleted: false } }, { $group: { _id: '$facility', patients: { $sum: 1 } } }, { $sort: { patients: -1 } }]),
    Visit.aggregate([
      { $match: { deleted: false, updatedAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$updatedAt' } } }, visits: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  const pendingUsers = await User.countDocuments({ status: 'pending' });
  res.json({
    totals: { patients, visits, prescriptions, labResults: labs, activeUsers: users, pendingUsers },
    byFacility: byFacility.map((f) => ({ facility: f._id || 'Unassigned', patients: f.patients })),
    visitsByDay: visitsByDay.map((d) => ({ day: d._id, visits: d.visits })),
  });
}));

module.exports = router;
