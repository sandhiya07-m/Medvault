const env = require('./config/env');
const connectDB = require('./config/db');
const createApp = require('./app');
const { bootstrapAdmin } = require('./utils/bootstrap');

(async () => {
  if (env.jwtSecret === 'dev-secret-change-me' && process.env.NODE_ENV === 'production') {
    throw new Error('Set JWT_SECRET in production');
  }
  await connectDB();
  await bootstrapAdmin();
  createApp().listen(env.port, () => console.log(`MedVault API listening on :${env.port}`));
})().catch((e) => { console.error(e); process.exit(1); });
