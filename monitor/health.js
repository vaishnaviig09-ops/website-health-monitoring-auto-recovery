// Module 2: Health monitoring. Sends ONE request and classifies the result.
function makeChecker(url, { timeoutMs = 5000, maxResponseMs = 3000 } = {}) {
  return async function check() {
    const timestamp = new Date().toISOString();
    const t0 = Date.now();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      const responseTime = Date.now() - t0;
      if (!res.ok) return { timestamp, statusCode: res.status, responseTime, status: 'unhealthy', error: `HTTP ${res.status}` };
      if (responseTime > maxResponseMs) return { timestamp, statusCode: res.status, responseTime, status: 'unhealthy', error: 'Slow response' };
      return { timestamp, statusCode: res.status, responseTime, status: 'healthy', error: null };
    } catch (e) {
      // Never throw: a down app is a normal result for a monitor.
      const code = e.cause && e.cause.code;
      const error = e.name === 'TimeoutError' ? 'Request timeout'
        : code === 'ECONNREFUSED' ? 'Connection refused'
        : code === 'ENOTFOUND' ? 'DNS failure' : e.message;
      return { timestamp, statusCode: null, responseTime: null, status: 'unhealthy', error };
    }
  };
}
module.exports = { makeChecker };
