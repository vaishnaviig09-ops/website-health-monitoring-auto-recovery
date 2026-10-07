// Tests 2-6: failure detection, recovery, recovery failure, metrics.
const test = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../monitor/db');
const { Monitor } = require('../monitor/monitor');
const { makeChecker } = require('../monitor/health');

const good = () => ({ timestamp: new Date().toISOString(), statusCode: 200, responseTime: 100, status: 'healthy', error: null });
const bad = () => ({ timestamp: new Date().toISOString(), statusCode: 503, responseTime: 5, status: 'unhealthy', error: 'HTTP 503' });

function make(results, recoverImpl) {
  const calls = { recover: 0 };
  const m = new Monitor({
    db: openDb(':memory:'), threshold: 3, verifyAttempts: 2, verifyDelayMs: 0,
    sleep: async () => {}, log: () => {},
    check: async () => (typeof results === 'function' ? results() : results.shift() || good()),
    recover: async () => { calls.recover++; if (recoverImpl) await recoverImpl(); }
  });
  return { m, calls };
}

test('unreachable app is detected as a failure, monitor does not crash', async () => {
  const check = makeChecker('http://localhost:1/health', { timeoutMs: 1000 });
  const r = await check();
  assert.strictEqual(r.status, 'unhealthy');
  assert.ok(r.error);
});

test('one failure then success: no recovery, counter reset', async () => {
  const { m, calls } = make([bad(), good()]);
  await m.tick(); assert.strictEqual(m.failures, 1);
  await m.tick(); assert.strictEqual(m.failures, 0);
  assert.strictEqual(calls.recover, 0);
});

test('three consecutive failures trigger recovery; recovery succeeds', async () => {
  const { m, calls } = make([bad(), bad(), bad(), good()]); // 4th result = verification check
  await m.tick(); await m.tick();
  assert.strictEqual(calls.recover, 0);
  await m.tick();
  assert.strictEqual(calls.recover, 1);
  const inc = m.incidentList()[0];
  assert.strictEqual(inc.recovery_status, 'Recovered');
  assert.ok(inc.end_time);
  assert.strictEqual(m.metrics().recoveries, 1);
  assert.strictEqual(m.metrics().alert, 'recovered');
});

test('recovery failure: FAILED and incident stays active', async () => {
  const { m } = make(() => bad());
  for (let i = 0; i < 3; i++) await m.tick();
  const inc = m.incidentList()[0];
  assert.strictEqual(inc.recovery_status, 'FAILED');
  assert.strictEqual(inc.end_time, null);
  assert.strictEqual(m.metrics().alert, 'failed');
});

test('docker restart error does not crash the monitor', async () => {
  const { m } = make(() => bad(), async () => { throw new Error('docker down'); });
  for (let i = 0; i < 3; i++) await m.tick();
  assert.strictEqual(m.incidentList()[0].recovery_status, 'FAILED');
});

test('dashboard metrics are correct', async () => {
  const { m } = make([good(), good(), bad(), bad(), bad(), good()]);
  for (let i = 0; i < 5; i++) await m.tick();
  const x = m.metrics();
  assert.strictEqual(x.totalChecks, 6);   // 5 ticks + 1 verification check
  assert.strictEqual(x.failedChecks, 3);
  assert.strictEqual(x.incidents, 1);
  assert.strictEqual(x.recoveries, 1);
  assert.strictEqual(x.status, 'healthy');
});
