// Module 4 (part): talk to the Docker Engine API through its Unix socket.
// Equivalent to running: docker restart <name>
const http = require('http');

function restartContainer(name, socketPath = process.env.DOCKER_SOCKET || '/var/run/docker.sock') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { socketPath, path: `/containers/${encodeURIComponent(name)}/restart?t=5`, method: 'POST' },
      res => {
        res.resume();
        res.on('end', () => (res.statusCode === 204 ? resolve()
          : reject(new Error(`Docker API returned HTTP ${res.statusCode}`))));
      });
    req.on('error', reject);                       // e.g. socket missing
    req.setTimeout(30000, () => req.destroy(new Error('Docker restart timed out')));
    req.end();
  });
}
module.exports = { restartContainer };
