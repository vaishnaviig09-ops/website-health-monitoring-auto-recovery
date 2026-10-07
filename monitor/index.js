// Monitoring service + dashboard server

const express = require('express');
const path = require('path');

const { openDb } = require('./db');
const { makeChecker } = require('./health');
const { Monitor } = require('./monitor');
const { createApp } = require('../backend/server');

const RENDER_PORT = Number(process.env.PORT || 4000);
const BACKEND_PORT = 3000;

// --------------------------------------------------
// Dynamic monitoring state
// --------------------------------------------------

let monitoring = false;
let currentTarget = null;
let monitorTimer = null;
let monitor = null;

// --------------------------------------------------
// Configuration
// --------------------------------------------------

const cfg = {
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
// Start backend application internally
// --------------------------------------------------

const backendApp = createApp();

backendApp.listen(
  BACKEND_PORT,
  '127.0.0.1',
  () => {
    console.log(
      `[INFO] Backend running internally on ${BACKEND_PORT}`
    );
  }
);

// --------------------------------------------------
// Create monitor
// --------------------------------------------------

function createMonitor(target) {
  return new Monitor({
    db: openDb(cfg.dbPath),

    check: makeChecker(target),

    threshold: cfg.threshold,

    recover: async () => {
      const internalTarget =
        `http://127.0.0.1:${BACKEND_PORT}/health`;

      if (target !== internalTarget) {
        throw new Error(
          'Automatic recovery is available only for the internal demo application.'
        );
      }

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
    }
  });
}

// --------------------------------------------------
// Run one monitoring check
// --------------------------------------------------

async function runCheck() {
  if (!monitoring || !monitor) {
    return;
  }

  try {
    await monitor.tick();
  } catch (error) {
    console.log(
      `[ERROR] Monitor check failed: ${error.message}`
    );
  }
}

// --------------------------------------------------
// Start monitoring loop
// --------------------------------------------------

function startMonitorLoop() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
  }

  runCheck();

  monitorTimer = setInterval(
    runCheck,
    cfg.interval
  );
}

// --------------------------------------------------
// Stop monitoring loop
// --------------------------------------------------

function stopMonitorLoop() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}

// --------------------------------------------------
// Dashboard server
// --------------------------------------------------

const app = express();

app.use(express.json());

// Serve frontend
app.use(
  express.static(
    path.join(__dirname, '..', 'frontend')
  )
);

// --------------------------------------------------
// Start monitoring
// --------------------------------------------------

app.post(
  '/api/monitor/start',
  (req, res) => {
    const url =
      String(req.body?.url || '').trim();

    if (!url) {
      return res.status(400).json({
        message: 'Please enter a website URL.'
      });
    }

    if (monitoring) {
      return res.status(400).json({
        message:
          'Monitoring is already running. Stop the current website first.'
      });
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(url);
    } catch (error) {
      return res.status(400).json({
        message: 'Please enter a valid website URL.'
      });
    }

    if (
      parsedUrl.protocol !== 'http:' &&
      parsedUrl.protocol !== 'https:'
    ) {
      return res.status(400).json({
        message:
          'Only HTTP and HTTPS websites are supported.'
      });
    }

    currentTarget = parsedUrl.toString();

    monitor = createMonitor(currentTarget);

    monitoring = true;

    console.log(
      `[INFO] Monitoring started: ${currentTarget}`
    );

    startMonitorLoop();

    return res.json({
      message:
        'Monitoring started successfully.',
      target: currentTarget,
      monitoring: true
    });
  }
);

// --------------------------------------------------
// Stop monitoring
// --------------------------------------------------

app.post(
  '/api/monitor/stop',
  (req, res) => {
    stopMonitorLoop();

    monitoring = false;
    currentTarget = null;
    monitor = null;

    console.log(
      '[INFO] Monitoring stopped'
    );

    return res.json({
      message:
        'Monitoring stopped successfully.',
      target: null,
      monitoring: false
    });
  }
);

// --------------------------------------------------
// Monitor status
// --------------------------------------------------

app.get(
  '/api/monitor/status',
  (req, res) => {
    return res.json({
      monitoring: monitoring,
      target: currentTarget
    });
  }
);

// --------------------------------------------------
// Dashboard API
// --------------------------------------------------

app.get(
  '/api/dashboard',
  (req, res) => {
    if (!monitor) {
      return res.json({
        monitoring: false,
        target: null,

        metrics: {
          status: 'STOPPED',
          lastResponseTime: null,
          avgResponseTime: null,
          uptime: 100,
          totalChecks: 0,
          failedChecks: 0,
          recoveries: 0,
          incidents: 0,
          consecutiveFailures: 0,
          alert: null
        },

        checks: [],
        incidents: []
      });
    }

    return res.json({
      monitoring: monitoring,
      target: currentTarget,
      metrics: monitor.metrics(),
      checks: monitor.recentChecks(),
      incidents: monitor.incidentList()
    });
  }
);

// --------------------------------------------------
// Failure simulation
// --------------------------------------------------

app.post(
  '/api/simulate-failure',
  async (req, res) => {
    const internalTarget =
      `http://127.0.0.1:${BACKEND_PORT}/health`;

    if (!monitoring) {
      return res.status(400).json({
        message:
          'Start monitoring the internal demo application first.'
      });
    }

    if (currentTarget !== internalTarget) {
      return res.status(400).json({
        message:
          'Failure simulation is available only for the internal demo application.'
      });
    }

    try {
      const response = await fetch(
        `http://127.0.0.1:${BACKEND_PORT}/api/simulate-failure`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(3000)
        }
      );

      const data = await response.json();

      return res
        .status(response.status)
        .json(data);

    } catch (error) {
      return res.status(502).json({
        message:
          'Application unreachable.'
      });
    }
  }
);

// --------------------------------------------------
// Expose backend application
// --------------------------------------------------

app.use(backendApp);

// --------------------------------------------------
// Start public server
// --------------------------------------------------

app.listen(
  RENDER_PORT,
  () => {
    console.log(
      `[INFO] Dashboard listening on ${RENDER_PORT}`
    );

    console.log(
      '[INFO] Dynamic website monitoring ready'
    );

    console.log(
      `[INFO] Check interval: ${cfg.interval} ms`
    );

    console.log(
      `[INFO] Failure threshold: ${cfg.threshold}`
    );
  }
);