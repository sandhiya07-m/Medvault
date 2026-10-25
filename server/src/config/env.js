try { require('dotenv').config(); } catch (e) { /* dotenv optional: env vars may come from the host */ }

const env = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/medvault',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpires: process.env.JWT_EXPIRES || '7d',
  dataKey: process.env.DATA_KEY || '0'.repeat(64),
  allowSelfRegister: process.env.ALLOW_SELF_REGISTER !== 'false',
  // Optional: create/repair a first admin at startup so a fresh deployment is never locked out.
  adminEmail: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  corsOrigin: (process.env.CORS_ORIGIN || '*').split(',').map((s) => s.trim()),
};

module.exports = env;
