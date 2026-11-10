/* RL1 core. Keeps the MCP2.2 module API; all routes share origin/auth checks. */
'use strict';
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const CONFIG = require('./relay_config.js');
const WS = require('./relay_ws.js');
const { authorized } = require('./relay_security.js');
function createLimiter(max, windowMs) {
  const hits = new Map();
  return { check(ip) {
    const now = Date.now(), key = ip || 'unknown';
    for (const [address, bucket] of hits) if (now - bucket.start >= windowMs) hits.delete(address);
    if (!hits.has(key)) {
      if (hits.size >= 4096) return false;
      hits.set(key, { start: now, count: 0 });
    }
    return ++hits.get(key).count <= max;
  } };
}
function clientIp(req) { return req.socket.remoteAddress || 'unknown'; }
function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0, failed = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > max) {
        if (!failed) reject(Object.assign(new Error('body too large'), { status: 413 }));
        failed = true; chunks.length = 0;
      } else if (!failed) chunks.push(chunk);
    });
    req.on('end', () => { if (!failed) resolve(Buffer.concat(chunks)); });
    req.on('aborted', () => reject(new Error('request aborted')));
    req.on('error', reject);
  });
}
function pathOf(req) { return new URL(req.url || '/', 'http://relay').pathname; }
function cleanedPath(pathname) { return (pathname || '/').replace(/\/+$/, '') || '/'; }
function createRelay(overrides = {}) {
  const config = CONFIG.validateConfig(overrides);
  const modules = [], httpRoutes = [], upgradeRoutes = [], sockets = new Set();
  const limiter = createLimiter(config.RATE_MAX, config.RATE_WINDOW_MS);
  function originState(req) {
    const origin = req.headers.origin;
    return { ok: origin === undefined || config.CORS_ORIGINS.includes(origin), origin: origin || null };
  }
  function hostAllowed(req) {
    const host = req.headers.host;
    if (!host || !/^(?:\[[a-fA-F0-9:]+\]|[a-zA-Z0-9._-]+)(?::\d+)?$/.test(host)) return false;
    let name;
    try { name = new URL('http://' + host).hostname.toLowerCase(); } catch { return false; }
    return ['localhost', '127.0.0.1', '[::1]', config.HOST.toLowerCase(), ...config.PUBLIC_HOSTS.map(s => s.toLowerCase())].includes(name);
  }
  function send(req, res, status, body, contentType, origin) {
    if (res.destroyed || res.writableEnded) return;
    const payload = body == null ? Buffer.alloc(0) : Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    res.statusCode = status;
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Relay-Token, Mcp-Session-Id, MCP-Protocol-Version');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    if (status >= 400) res.setHeader('Connection', 'close');
    if (payload.length) res.setHeader('Content-Type', contentType || 'application/json; charset=utf-8');
    res.setHeader('Content-Length', payload.length);
    res.end(req.method === 'HEAD' ? undefined : payload);
  }
  function moduleNames() { return modules.map(mod => mod.name); }
  const api = {
    cfg: config, createLimiter, clientIp, readBody, send, originState, pathOf, cleanedPath,
    addHttpRoute(match, handler) { httpRoutes.push({ match, handler }); },
    addUpgrade(match, handler) { upgradeRoutes.push({ match, handler }); },
    upgradeWebSocket(req, socket, head, opts = {}) {
      return WS.upgradeWebSocket(req, socket, head, { maxFrame: config.MAX_FRAME, maxBuffer: config.MAX_BUFFER, ...opts });
    }
  };
  function register(mod) {
    if (!mod || !mod.name || typeof mod.register !== 'function') throw new Error('Invalid relay module');
    if (modules.some(other => other.name === mod.name)) throw new Error('Duplicate module: ' + mod.name);
    mod.register(api); modules.push(mod);
  }
  function matches(route, pathname, method, req) {
    return typeof route.match === 'function' ? route.match(pathname, method, req) : cleanedPath(pathname) === route.match;
  }
  function rejectUpgrade(socket, status) {
    socket.end('HTTP/1.1 ' + status + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); socket.destroySoon();
  }
  async function listen() {
    const handler = async (req, res) => {
      const cors = originState(req), origin = cors.origin;
      try {
        if (!hostAllowed(req) || !cors.ok) { send(req, res, 403, '{"error":"host or origin not allowed"}', null, null); return; }
        if (!limiter.check(clientIp(req))) {
          res.setHeader('Retry-After', config.RETRY_AFTER_SEC);
          send(req, res, 429, '{"error":"too many requests"}', null, origin); return;
        }
        if (req.method === 'OPTIONS') { send(req, res, 204, null, null, origin); return; }
        if (!authorized(req, config)) { send(req, res, 401, '{"error":"relay token required"}', null, origin); return; }
        const pathname = pathOf(req), cleaned = cleanedPath(pathname), method = req.method;
        if (method === 'GET' && (cleaned === '/health' || cleaned === '/')) {
          send(req, res, 200, cleaned === '/health' ? 'ok\nmodules: ' + moduleNames().join(', ') + '\n' : 'Hub shared relay (RL1)\n', 'text/plain; charset=utf-8', origin); return;
        }
        for (const route of httpRoutes) {
          if (matches(route, pathname, method, req)) { await route.handler({ req, res, pathname, cleaned, method, origin, send }); return; }
        }
        send(req, res, 404, '{"error":"not found"}', null, origin);
      } catch (err) {
        // Never expose upstream URLs, headers, PINs, tokens or stack traces.
        send(req, res, err.status || 500, JSON.stringify({ error: err.status === 413 ? 'body too large' : 'relay request failed' }), null, cors.ok ? origin : null);
      }
    };
    const server = config.TLS_CERT ? https.createServer({ cert: fs.readFileSync(config.TLS_CERT), key: fs.readFileSync(config.TLS_KEY) }, handler) : http.createServer(handler);
    server.requestTimeout = config.RPC_TIMEOUT_MS + 5000;
    server.headersTimeout = Math.min(10000, server.requestTimeout);
    server.keepAliveTimeout = 1000; server.maxRequestsPerSocket = 1000;
    server.on('connection', socket => {
      socket.on('error', () => {});
      if (sockets.size >= config.MAX_CONNECTIONS) { socket.destroy(); return; }
      sockets.add(socket); socket.setTimeout(config.IDLE_TIMEOUT_MS, () => socket.destroy());
      socket.on('close', () => sockets.delete(socket));
    });
    server.on('upgrade', (req, socket, head) => {
      try {
        if (!hostAllowed(req) || !originState(req).ok) { rejectUpgrade(socket, '403 Forbidden'); return; }
        if (!limiter.check(clientIp(req))) { rejectUpgrade(socket, '429 Too Many Requests'); return; }
        if (!authorized(req, config, true)) { rejectUpgrade(socket, '401 Unauthorized'); return; }
        const pathname = pathOf(req), cleaned = cleanedPath(pathname);
        for (const route of upgradeRoutes) {
          if (matches(route, pathname, 'GET', req)) { route.handler({ req, socket, head, pathname, cleaned }); return; }
        }
        rejectUpgrade(socket, '404 Not Found');
      } catch { rejectUpgrade(socket, '400 Bad Request'); }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.PORT, config.HOST, resolve); });
    return { server, port: server.address().port, host: server.address().address, modules: moduleNames(),
      async close() {
        for (const mod of modules) if (mod.shutdown) mod.shutdown();
        const done = new Promise(resolve => server.close(resolve));
        for (const socket of sockets) socket.destroy();
        await done;
      }
    };
  }
  return { register, listen, moduleNames, cfg: config };
}
module.exports = { createRelay, createLimiter, clientIp, readBody, pathOf, cleanedPath };
