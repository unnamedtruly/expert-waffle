'use strict';

const http = require('node:http');

/**
 * Two consumers, one server.
 *
 * 1. Railway's healthcheck hits /healthz. It returns 200 in every state the
 *    process can be in — Railway restarts the container on a failed check, and a
 *    Discord hiccup is not a reason to bounce the container.
 * 2. Sam hits /status by hand to see whether the voice socket is actually live.
 */
function start(getStatus) {
  // Railway injects PORT per-service and only forwards to the bound address.
  const port = Number.parseInt(process.env.PORT ?? '', 10) || 8080;

  const server = http.createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];

    if (path === '/status') {
      let body;
      try {
        body = JSON.stringify(getStatus(), null, 2);
      } catch (err) {
        body = JSON.stringify({ error: String(err?.message ?? err) });
      }
      res.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      res.end(body);
      return;
    }

    // /healthz and /: unconditional 200. Liveness only, never readiness.
    res.writeHead(200, {
      'content-type': 'text/plain',
      'cache-control': 'no-store',
    });
    res.end('ok\n');
  });

  // Railway's proxy closes idle upstream sockets; sit just above its keepalive.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  server.listen(port, '0.0.0.0', () => {
    console.log(`[health] listening on 0.0.0.0:${port}`);
  });

  return server;
}

module.exports = { start };