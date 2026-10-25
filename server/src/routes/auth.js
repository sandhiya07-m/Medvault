const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const env = require('../config/env');
const User = require('../models/User');
const audit = require('../utils/audit');
const { authenticate } = require('../middleware/auth');
const { validate, wrap } = require('../middleware/error');
const { emailChain } = require('../utils/email');

const router = express.Router();

const sign = (user) => jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, { expiresIn: env.jwtExpires });

// POST /api/auth/register - register a staff user (needs admin approval before first login)
router.post(
  '/register',
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name is required'),
    emailChain(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').isIn(['healthworker', 'doctor']).withMessage('Role must be healthworker or doctor'),
    body('facility').optional().trim(),
  ],
  validate,
  wrap(async (req, res) => {
    if (!env.allowSelfRegister) return res.status(403).json({ message: 'Self-registration is disabled. Ask an administrator to create your account.' });
    const { name, email, password, role, facility } = req.body;
    if (await User.exists({ email })) return res.status(409).json({ message: 'Email already registered' });
    const user = await User.create({
      name,
      email,
      role,
      facility: facility || 'Unassigned',
      passwordHash: await bcrypt.hash(password, 12),
      status: 'pending',
    });
    await audit({ user }, 'auth.register', 'user', user._id.toString());
    res.status(201).json({ message: 'Registered. An administrator must approve your account.', user: user.toSafeJSON() });
  })
);

// POST /api/auth/login - authenticate & issue JWT
router.post(
  '/login',
  [emailChain(), body('password').notEmpty()],
  validate,
  wrap(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    const ok = user && (await bcrypt.compare(req.body.password, user.passwordHash));
    if (!ok) {
      await audit({ ip: req.ip, user: null }, 'auth.login_failed', 'user', req.body.email);
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (user.status === 'pending') return res.status(403).json({ message: 'Account awaiting admin approval' });
    if (user.status === 'deactivated') return res.status(403).json({ message: 'Account deactivated' });
    await audit({ user, ip: req.ip }, 'auth.login', 'user', user._id.toString());
    res.json({ token: sign(user), user: user.toSafeJSON() });
  })
);

router.get('/me', authenticate, (req, res) => res.json({ user: req.user.toSafeJSON() }));

module.exports = router;
