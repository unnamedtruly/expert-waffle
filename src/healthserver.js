'use strict';

const http = require('node:http');

/**
 * Liveness and introspection, in one tiny server.
 *
 * blitz.cloud runs this as a background app: no address, no port, never probed,
 * never asleep. So nothing external depends on this server — it exists so you can
 * run the bot locally and confirm state, and so the process has a stable handle
 * if you later switch the app back to an address.
 *
 * /healthz is unconditional 200. /status reports the voice connection and must
 * never be wired to an automatic restart: a Discord blip would then bounce the
 * container instead of letting the watchdog re-join on its own.
 */
function start(getStatus) {
  // Blitz sets PORT for addressed apps; default-deny keeps us off anything else.
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

  // Idle sockets: cap them so a long-lived process holds no half-open handles.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  server.listen(port, '0.0.0.0', () => {
    console.log(`[health] listening on 0.0.0.0:${port}`);
  });

  return server;
}

module.exports = { start };