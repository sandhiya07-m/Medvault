const bcrypt = require('bcryptjs');
const env = require('../config/env');
const User = require('../models/User');

// If ADMIN_EMAIL + ADMIN_PASSWORD are set, make sure that admin exists and is active.
// Without them, fall back to: when there are no users at all, tell the operator how to create one.
async function bootstrapAdmin() {
  if (env.adminEmail && env.adminPassword) {
    if (env.adminPassword.length < 8) throw new Error('ADMIN_PASSWORD must be at least 8 characters');
    let u = await User.findOne({ email: env.adminEmail });
    if (!u) {
      await User.create({ name: 'Administrator', email: env.adminEmail, role: 'admin', facility: 'Head Office', status: 'active', passwordHash: await bcrypt.hash(env.adminPassword, 12) });
      console.log(`Created admin ${env.adminEmail}`);
    } else if (u.role !== 'admin' || u.status !== 'active') {
      u.role = 'admin'; u.status = 'active'; await u.save();
      console.log(`Re-activated admin ${env.adminEmail}`);
    }
  } else if (!(await User.exists({ role: 'admin', status: 'active' }))) {
    console.warn('No active admin exists. Set ADMIN_EMAIL and ADMIN_PASSWORD (or run npm run seed) and restart.');
  }
}

module.exports = { bootstrapAdmin };
