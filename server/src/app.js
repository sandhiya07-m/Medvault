const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/error');

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors(env.corsOrigin.includes('*') ? {} : { origin: env.corsOrigin })); // CORS middleware
  app.use(express.json({ limit: '10mb' })); // scans/documents are embedded in records

  app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/patients', require('./routes/patients'));
  app.use('/api/visits', require('./routes/visits'));
  app.use('/api/sync', require('./routes/sync'));
  app.use('/api/audit', require('./routes/audit'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api', notFound);

  // Serve the built PWA when present (single-host deployment).
  const dist = path.join(__dirname, '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}

module.exports = createApp;
