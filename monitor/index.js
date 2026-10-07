// Monitoring service + dashboard server

const express = require('express');
const path = require('path');

const { openDb } = require('./db');
const { makeChecker } = require('./health');
const { Monitor } = require('./monitor');
const { createApp } = require('../backend/server');

const RENDER_PORT = Number(process.env.PORT || 4000);
const BACKEND_PORT = 3000;

const cfg = {
  target:
    process.env.TARGET_URL ||
    `http://127.0.0.1:${BACKEND_PORT}/health`,

  interval: Number(
    process.env.CHECK_INTERVAL_MS || 10000
  ),

  threshold: Number(
    process.env.FAILURE_THRESHOLD || 3
  ),

  dbPath:
    process.env.DB_PATH ||
    path.join(__dirname, '..', 'data', 'monitor.db')
};

// --------------------------------------------------
// Start backend application internally.
// --------------------------------------------------

const backendApp = createApp();

backendApp.listen(BACKEND_PORT, '127.0.0.1', () => {
  console.log(
    `[INFO] Backend running internally on ${BACKEND_PORT}`
  );
});

// --------------------------------------------------
// Create monitor.
// --------------------------------------------------

const monitor = new Monitor({
  db: openDb(cfg.dbPath),
  check: makeChecker(cfg.target),

  // Render does not provide Docker access.
  // Recovery is therefore performed through the
  // backend's /api/recover endpoint.
  recover: async () => {
    const response = await fetch(
      `http://127.0.0.1:${BACKEND_PORT}/api/recover`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(3000)
      }
    );

    if (!response.ok) {
      throw new Error(
        `Recovery request failed with HTTP ${response.status}`
      );
    }

    return response.json();
  },

  threshold: cfg.threshold
});

// --------------------------------------------------
// Monitoring loop.
// --------------------------------------------------

async function loop() {
  try {
    await monitor.tick();
  } catch (e) {
    console.log(
      `[ERROR] tick failed: ${e.message}`
    );
  }

  setTimeout(loop, cfg.interval);
}

// --------------------------------------------------
// Dashboard server.
// --------------------------------------------------

const app = express();

// Serve the monitor dashboard first.
app.use(
  express.static(
    path.join(__dirname, '..', 'frontend')
  )
);

// Dashboard API.
app.get('/api/dashboard', (req, res) => {
  res.json({
    metrics: monitor.metrics(),
    checks: monitor.recentChecks(),
    incidents: monitor.incidentList()
  });
});

// Failure simulation.
// The dashboard calls this endpoint.
// It forwards the request to the internal backend.
app.post('/api/simulate-failure', async (req, res) => {
  try {
    const response = await fetch(
      `http://127.0.0.1:${BACKEND_PORT}/api/simulate-failure`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(3000)
      }
    );

    const data = await response.json();

    res.status(response.status).json(data);
  } catch (e) {
    res.status(502).json({
      message: 'Application unreachable'
    });
  }
});

// Expose backend API routes through the same public server.
// This allows /health, /api/status, and /api/metrics
// to be accessed from Render as well.
app.use(backendApp);

// Start the public Render server.
app.listen(RENDER_PORT, () => {
  console.log(
    `[INFO] Dashboard listening on ${RENDER_PORT}`
  );

  console.log(
    `[INFO] Monitoring ${cfg.target}`
  );

  console.log(
    `[INFO] Check interval: ${cfg.interval} ms`
  );

  console.log(
    `[INFO] Failure threshold: ${cfg.threshold}`
  );

  loop();
});