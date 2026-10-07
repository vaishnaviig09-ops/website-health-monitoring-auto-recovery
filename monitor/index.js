// Entry point of the monitoring service + dashboard server.
const express = require('express');
const path = require('path');
const { openDb } = require('./db');
const { makeChecker } = require('./health');
const { restartContainer } = require('./docker');
const { Monitor } = require('./monitor');

const cfg = {
  target: process.env.TARGET_URL || 'http://localhost:3000/health',
  interval: Number(process.env.CHECK_INTERVAL_MS || 10000),
  threshold: Number(process.env.FAILURE_THRESHOLD || 3),
  container: process.env.CONTAINER_NAME || 'webapp',
  port: process.env.MONITOR_PORT || 4000,
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'monitor.db')
};
const appBase = new URL(cfg.target).origin;

const monitor = new Monitor({
  db: openDb(cfg.dbPath),
  check: makeChecker(cfg.target),
  recover: () => restartContainer(cfg.container),
  threshold: cfg.threshold
});

// setTimeout loop (not setInterval) so checks never overlap with a running recovery.
async function loop() {
  try { await monitor.tick(); } catch (e) { console.log(`[ERROR] tick failed: ${e.message}`); }
  setTimeout(loop, cfg.interval);
}

const app = express();
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.get('/api/dashboard', (req, res) => res.json({
  metrics: monitor.metrics(), checks: monitor.recentChecks(), incidents: monitor.incidentList()
}));
app.post('/api/simulate-failure', async (req, res) => {   // proxied so the dashboard works even if app is down
  try { const r = await fetch(`${appBase}/api/simulate-failure`, { method: 'POST', signal: AbortSignal.timeout(3000) }); res.json(await r.json()); }
  catch { res.status(502).json({ message: 'Application unreachable' }); }
});
app.listen(cfg.port, () => {
  console.log(`[INFO] Monitor on :${cfg.port}, checking ${cfg.target} every ${cfg.interval} ms, threshold ${cfg.threshold}`);
  loop();
});
