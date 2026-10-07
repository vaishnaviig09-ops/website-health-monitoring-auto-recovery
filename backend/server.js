// Web Application + Health API

const express = require('express');
const path = require('path');

function createApp() {
  // Healthy by default.
  const state = {
    healthy: true,
    startedAt: Date.now()
  };

  const app = express();

  // Health endpoint used by the monitoring service.
  app.get('/health', (req, res) => {
    res.status(state.healthy ? 200 : 503).json({
      status: state.healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'web-application'
    });
  });

  // Basic application status.
  app.get('/api/status', (req, res) => {
    res.json({
      status: state.healthy ? 'RUNNING' : 'FAILING',
      server: 'Node.js',
      container: 'Render',
      environment: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.round(
        (Date.now() - state.startedAt) / 1000
      )
    });
  });

  // Application metrics.
  app.get('/api/metrics', (req, res) => {
    res.json({
      memoryMB: Math.round(
        process.memoryUsage().rss / 1048576
      ),
      uptimeSeconds: Math.round(process.uptime()),
      pid: process.pid
    });
  });

  // Simulate an application failure.
  app.post('/api/simulate-failure', (req, res) => {
    state.healthy = false;

    res.json({
      message: 'Failure simulated: /health now returns 503'
    });
  });

  // Application recovery.
  // The monitoring service calls this after detecting
  // consecutive health-check failures.
  app.post('/api/recover', (req, res) => {
    state.healthy = true;

    res.json({
      message: 'Application recovered successfully'
    });
  });

  // Serve backend public files if this server is used directly.
  app.use(
    express.static(path.join(__dirname, 'public'))
  );

  return app;
}

module.exports = {
  createApp
};

// Run backend directly.
if (require.main === module) {
  const port = Number(
    process.env.PORT ||
    process.env.APP_PORT ||
    3000
  );

  createApp().listen(port, () => {
    console.log(`[INFO] Web app listening on ${port}`);
  });
}