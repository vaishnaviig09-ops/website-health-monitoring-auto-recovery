// Module 1: Web Application. The app we own and monitor.
const express = require('express');
const path = require('path');

function createApp() {
  // In-memory flag used for SAFE failure simulation.
  // A container restart resets it to healthy, which is exactly what recovery does.
  const state = { healthy: true, startedAt: Date.now() };
  const app = express();
  const MONITOR_URL = process.env.MONITOR_URL || 'http://localhost:4000';

  app.get('/health', (req, res) => {
    res.status(state.healthy ? 200 : 503).json({
      status: state.healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      service: 'web-application'
    });
  });

  app.get('/api/status', (req, res) => res.json({
    status: state.healthy ? 'RUNNING' : 'FAILING',
    server: 'Node.js', container: 'Docker',
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.round((Date.now() - state.startedAt) / 1000)
  }));

  app.get('/api/metrics', (req, res) => res.json({
    memoryMB: Math.round(process.memoryUsage().rss / 1048576),
    uptimeSeconds: Math.round(process.uptime()),
    pid: process.pid
  }));

  // Incidents are owned by the monitor, so we ask it.
  app.get('/api/incidents', async (req, res) => {
    try {
      const r = await fetch(`${MONITOR_URL}/api/dashboard`, { signal: AbortSignal.timeout(3000) });
      res.json((await r.json()).incidents);
    } catch { res.status(502).json({ error: 'Monitor service unreachable' }); }
  });

  app.post('/api/simulate-failure', (req, res) => {
    state.healthy = false;
    res.json({ message: 'Failure simulated: /health now returns 503' });
  });

  app.use(express.static(path.join(__dirname, 'public')));
  return app;
}

module.exports = { createApp };
if (require.main === module) {
  const port = process.env.APP_PORT || 3000;
  createApp().listen(port, () => console.log(`[INFO] Web app listening on ${port}`));
}
