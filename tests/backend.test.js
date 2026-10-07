// Test 1: healthy app. Also checks that simulated failure gives 503.
const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../backend/server');

async function withServer(fn) {
  const server = createApp().listen(0);
  const base = `http://localhost:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}

test('healthy application returns 200 and healthy', () => withServer(async base => {
  const res = await fetch(base + '/health');
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).status, 'healthy');
}));

test('simulate failure makes /health return 503', () => withServer(async base => {
  await fetch(base + '/api/simulate-failure', { method: 'POST' });
  const res = await fetch(base + '/health');
  assert.strictEqual(res.status, 503);
  assert.strictEqual((await res.json()).status, 'unhealthy');
}));
