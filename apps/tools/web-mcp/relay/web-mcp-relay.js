#!/usr/bin/env node
/* Web MCP — relay/web-mcp-relay.js: zero-dep Node relay (HTTP MCP + WebSocket tab). MCP1
 *
 * The browser tab dials out to /ws and sends {type:'hello', pin}.
 * Grok POSTs JSON-RPC to /mcp/<PIN>. This process forwards the body to the
 * tab, waits for the matching rpc-result, and returns it as application/json.
 * Notifications (JSON-RPC requests with no id) are forwarded and return 202.
 *
 * All constants live in the CONFIG block below and can be overridden with
 * environment variables (WEB_MCP_HOST, WEB_MCP_PORT, ...).
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const { URL } = require('url');

/* -------------------------------------------------------------------------- */
/* Config: every constant and magic value for the relay.                      */
/* -------------------------------------------------------------------------- */
const CONFIG = {
  /* Interface to bind. 127.0.0.1 keeps the port off the public LAN; Funnel/Serve proxies to it. */
  HOST: process.env.WEB_MCP_HOST || '127.0.0.1',
  /* Listen port. Default 8787 matches the Linux MCP server, so use 8788 if that is already running (see README). */
  PORT: parseInt(process.env.WEB_MCP_PORT || '8787', 10),
  /* Max JSON-RPC body size in bytes. */
  MAX_BODY: parseInt(process.env.WEB_MCP_BODY_MAX || String(10 * 1024 * 1024), 10),
  /* How long to wait for the tab to answer one tools/call, in milliseconds. */
  RPC_TIMEOUT_MS: parseInt(process.env.WEB_MCP_RPC_TIMEOUT_MS || '60000', 10),
  /* Max requests per IP per rate-limit window. */
  RATE_MAX: parseInt(process.env.WEB_MCP_RATE_MAX || '120', 10),
  /* Rate-limit window in milliseconds. */
  RATE_WINDOW_MS: parseInt(process.env.WEB_MCP_RATE_WINDOW_MS || '60000', 10),
  /* Honour X-Forwarded-For only when we bind localhost (Tailscale Serve sets it). */
  TRUST_PROXY: (process.env.WEB_MCP_TRUST_PROXY || '1') === '1',
  /* CORS origins: '*' or a comma-separated list. */
  CORS_ORIGINS: (process.env.WEB_MCP_CORS_ORIGINS || '*').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
  /* Minimum PIN length, must match the tab (wm_config.js PIN_MIN_LEN). */
  PIN_MIN_LEN: 6,
  /* Allowed PIN alphabet, must match the tab (wm_config.js PIN_VALID_CHARS). */
  PIN_CHARS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-',
  /* RFC 6455 WebSocket GUID used to compute Sec-WebSocket-Accept. */
  WS_GUID: '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',
  /* Max WebSocket frame size (same cap as the HTTP body). */
  MAX_FRAME: parseInt(process.env.WEB_MCP_BODY_MAX || String(10 * 1024 * 1024), 10),
  /* Interval for server-initiated WebSocket pings, in milliseconds. 0 disables them. */
  WS_PING_MS: parseInt(process.env.WEB_MCP_WS_PING_MS || '30000', 10),
  /* JSON-RPC error message when no tab is connected for that PIN. */
  NOT_CONNECTED: 'Web MCP tab not connected'
};

/* -------------------------------------------------------------------------- */
/* PIN helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Constant-time PIN compare. Length is also compared in a way that does not
 * return early on the first differing byte.
 */
function pinsMatch(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  /* Pad both sides to the same length so timingSafeEqual can run. */
  const n = Math.max(left.length, right.length, 1);
  const x = Buffer.alloc(n);
  const y = Buffer.alloc(n);
  left.copy(x);
  right.copy(y);
  const sameBytes = crypto.timingSafeEqual(x, y);
  const sameLen = left.length === right.length;
  return sameBytes && sameLen;
}

/**
 * Validate a PIN against the same rules the tab uses.
 */
function validPin(pin) {
  const s = String(pin || '');
  if (s.length < CONFIG.PIN_MIN_LEN) return false;
  for (let i = 0; i < s.length; i++) {
    if (CONFIG.PIN_CHARS.indexOf(s.charAt(i)) < 0) return false;
  }
  return true;
}

/**
 * Pull the PIN out of a /mcp/<PIN> path. Returns null when the path is not that shape.
 */
function parseMcpPin(pathname) {
  const cleaned = (pathname || '/').replace(/\/+$/, '') || '/';
  const m = cleaned.match(/^\/mcp\/([^/]+)$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch (_) {
    return m[1];
  }
}

/* -------------------------------------------------------------------------- */
/* Rate limiter: a sliding window of timestamps per IP.                       */
/* -------------------------------------------------------------------------- */

/**
 * Create a per-IP sliding-window limiter.
 */
function createLimiter(max, windowMs) {
  /* ip -> array of request timestamps (ms). */
  const hits = new Map();
  return {
    /**
     * Return true when this IP is still under the cap, and record the hit.
     */
    check: function (ip) {
      const now = Date.now();
      const key = ip || 'unknown';
      let list = hits.get(key) || [];
      list = list.filter(function (t) { return now - t < windowMs; });
      if (list.length >= max) {
        hits.set(key, list);
        return false;
      }
      list.push(now);
      hits.set(key, list);
      return true;
    }
  };
}

/* -------------------------------------------------------------------------- */
/* Minimal WebSocket server (RFC 6455, unfragmented text / ping / pong / close) */
/* -------------------------------------------------------------------------- */

/**
 * Encode a WebSocket frame. Server-to-client frames are not masked.
 */
function encodeFrame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    /* 64-bit length; we never send frames near 4GB so the high 4 bytes stay 0. */
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  return Buffer.concat([header, payload]);
}

/**
 * Wrap a raw TCP socket as a WebSocket connection with send / close / events.
 */
function createWsConnection(socket) {
  /* Accumulated leftover bytes that are not yet a full frame. */
  let buf = Buffer.alloc(0);
  /* Set when we have sent or received a close, so we do not write again. */
  let closed = false;
  const conn = {
    /**
     * Send a UTF-8 text frame.
     */
    send: function (text) {
      if (closed) return;
      socket.write(encodeFrame(0x1, Buffer.from(String(text), 'utf8')));
    },
    /**
     * Send a close frame and end the socket.
     */
    close: function (code) {
      if (closed) return;
      closed = true;
      try {
        const payload = Buffer.alloc(2);
        payload.writeUInt16BE(code || 1000, 0);
        socket.write(encodeFrame(0x8, payload));
      } catch (_) { /* already gone */ }
      socket.end();
    },
    /* Set by the caller: function (text). */
    onMessage: null,
    /* Set by the caller: function (). */
    onClose: null
  };

  /**
   * Parse as many complete frames as possible from the buffer.
   */
  function consume() {
    while (buf.length >= 2) {
      const first = buf[0];
      const second = buf[1];
      const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let len = second & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const high = buf.readUInt32BE(2);
        const low = buf.readUInt32BE(6);
        if (high !== 0 || low > CONFIG.MAX_FRAME) {
          conn.close(1009);
          return;
        }
        len = low;
        offset = 10;
      }
      if (len > CONFIG.MAX_FRAME) {
        conn.close(1009);
        return;
      }
      const maskLen = masked ? 4 : 0;
      if (buf.length < offset + maskLen + len) return;
      let payload = buf.slice(offset + maskLen, offset + maskLen + len);
      if (masked) {
        const mask = buf.slice(offset, offset + 4);
        const copy = Buffer.from(payload);
        for (let i = 0; i < copy.length; i++) copy[i] ^= mask[i % 4];
        payload = copy;
      }
      buf = buf.slice(offset + maskLen + len);
      /* We only accept unfragmented frames (FIN set). */
      if (!fin) {
        conn.close(1003);
        return;
      }
      if (opcode === 0x1) {
        /* Text. */
        const text = payload.toString('utf8');
        if (typeof conn.onMessage === 'function') {
          try { conn.onMessage(text); } catch (_) { /* handler bug */ }
        }
      } else if (opcode === 0x8) {
        conn.close(1000);
        return;
      } else if (opcode === 0x9) {
        /* Ping -> pong with the same payload. */
        if (!closed) socket.write(encodeFrame(0xa, payload));
      } else if (opcode === 0xa) {
        /* Pong, ignore. */
      } else if (opcode === 0x2) {
        /* Binary is unused; close. */
        conn.close(1003);
        return;
      }
    }
  }

  socket.on('data', function (chunk) {
    buf = Buffer.concat([buf, chunk]);
    consume();
  });
  socket.on('close', function () {
    closed = true;
    if (typeof conn.onClose === 'function') conn.onClose();
  });
  socket.on('error', function () {
    closed = true;
    if (typeof conn.onClose === 'function') conn.onClose();
  });
  socket.on('end', function () {
    closed = true;
  });
  return conn;
}

/**
 * Complete a WebSocket upgrade handshake and return the wrapped connection, or null.
 */
function upgradeWebSocket(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  const upgrade = String(req.headers.upgrade || '').toLowerCase();
  if (!key || upgrade !== 'websocket') {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return null;
  }
  const accept = crypto.createHash('sha1').update(key + CONFIG.WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n' +
    '\r\n'
  );
  if (head && head.length) socket.unshift(head);
  return createWsConnection(socket);
}

/* -------------------------------------------------------------------------- */
/* HTTP helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Client IP, optionally from X-Forwarded-For when TRUST_PROXY is on.
 */
function clientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim() || req.socket.remoteAddress;
  }
  return req.socket.remoteAddress || 'unknown';
}

/**
 * Read the request body up to max bytes, or reject with a 413-tagged error.
 */
function readBody(req, max) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let n = 0;
    req.on('data', function (c) {
      n += c.length;
      if (n > max) {
        const err = new Error('body too large');
        err.status = 413;
        req.destroy();
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on('end', function () { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

/* -------------------------------------------------------------------------- */
/* Server                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Start the relay. overrides may replace any CONFIG field (PORT: 0 picks a random port).
 * Resolves with { server, port, host, close, tabs }.
 */
function startServer(overrides) {
  const cfg = Object.assign({}, CONFIG, overrides || {});
  /* PIN -> { ws, pin, pending: Map(id -> {resolve, timer}), pingTimer }. */
  const tabs = new Map();
  /* Monotonic correlation id for messages we send down the WebSocket. */
  let nextId = 1;
  const limiter = createLimiter(cfg.RATE_MAX, cfg.RATE_WINDOW_MS);

  /**
   * Look up the tab for a PIN with a constant-time compare against every connected PIN.
   */
  function findTab(pin) {
    let found = null;
    for (const [stored, tab] of tabs) {
      if (pinsMatch(pin, stored)) found = tab;
    }
    /* Dummy compare so an empty map is not a faster "no" than a miss. */
    if (!found) pinsMatch(pin, '\0'.repeat(Math.max(cfg.PIN_MIN_LEN, String(pin || '').length)));
    return found;
  }

  /**
   * Drop a tab, reject any in-flight HTTP waits, and stop its ping timer.
   */
  function dropTab(pin, reason) {
    const tab = tabs.get(pin);
    if (!tab) return;
    if (tab.pingTimer) clearInterval(tab.pingTimer);
    for (const [, wait] of tab.pending) {
      clearTimeout(wait.timer);
      wait.resolve(null);
    }
    tab.pending.clear();
    tabs.delete(pin);
    try { tab.ws.close(1000); } catch (_) { /* ok */ }
    void reason;
  }

  /**
   * Attach a newly hello'd WebSocket as the tab for this PIN (replacing any older one).
   */
  function attachTab(pin, ws) {
    const existing = findTab(pin);
    if (existing) {
      try { existing.ws.send(JSON.stringify({ type: 'replaced' })); } catch (_) { /* ok */ }
      dropTab(existing.pin, 'replaced');
    }
    const tab = { ws: ws, pin: pin, pending: new Map(), pingTimer: null };
    tabs.set(pin, tab);
    if (cfg.WS_PING_MS > 0) {
      tab.pingTimer = setInterval(function () {
        try {
          /* Ping frames are written by encodeFrame through a tiny hook: send a text keepalive if needed.
             The connection wrapper does not expose ping(), so we send a JSON ping the tab can ignore. */
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch (_) { /* will close */ }
      }, cfg.WS_PING_MS);
      if (tab.pingTimer.unref) tab.pingTimer.unref();
    }
    ws.onMessage = function (text) {
      let msg;
      try { msg = JSON.parse(text); } catch (_) { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'rpc-result' && msg.id != null) {
        const wait = tab.pending.get(String(msg.id));
        if (!wait) return;
        tab.pending.delete(String(msg.id));
        clearTimeout(wait.timer);
        wait.resolve(msg.payload);
      }
    };
    ws.onClose = function () {
      if (tabs.get(pin) === tab) dropTab(pin, 'closed');
    };
    try { ws.send(JSON.stringify({ type: 'hello-ok' })); } catch (_) { /* ok */ }
  }

  /**
   * Decide CORS: returns { ok, originToEcho }.
   */
  function originState(req) {
    const origin = req.headers.origin;
    if (!origin) return { ok: true, origin: null };
    const allowed = cfg.CORS_ORIGINS;
    if (allowed.indexOf('*') >= 0 || allowed.indexOf(origin) >= 0) {
      return { ok: true, origin: origin };
    }
    return { ok: false, origin: origin };
  }

  /**
   * Write an HTTP response with optional CORS and Connection: close on errors.
   */
  function send(req, res, status, body, contentType, origin) {
    const payload = body == null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8'));
    res.statusCode = status;
    if (origin) {
      if (cfg.CORS_ORIGINS.indexOf('*') >= 0) {
        res.setHeader('Access-Control-Allow-Origin', '*');
      } else {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Session-Id, MCP-Protocol-Version');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (status >= 400) {
      res.setHeader('Connection', 'close');
    }
    if (payload) {
      res.setHeader('Content-Type', contentType || 'application/json; charset=utf-8');
      res.setHeader('Content-Length', String(payload.length));
      res.end(payload);
    } else {
      res.setHeader('Content-Length', '0');
      res.end();
    }
    void req;
  }

  /**
   * Forward one JSON-RPC message to the tab and optionally wait for the reply.
   */
  function forward(tab, payload, waitForReply) {
    const id = String(nextId++);
    if (!waitForReply) {
      try { tab.ws.send(JSON.stringify({ type: 'rpc', id: id, payload: payload })); } catch (_) { /* gone */ }
      return Promise.resolve(null);
    }
    return new Promise(function (resolve) {
      const timer = setTimeout(function () {
        tab.pending.delete(id);
        resolve({ jsonrpc: '2.0', id: payload && payload.id != null ? payload.id : null, error: { code: -32000, message: 'Web MCP tab timed out' } });
      }, cfg.RPC_TIMEOUT_MS);
      tab.pending.set(id, { resolve: resolve, timer: timer });
      try {
        tab.ws.send(JSON.stringify({ type: 'rpc', id: id, payload: payload }));
      } catch (_) {
        clearTimeout(timer);
        tab.pending.delete(id);
        resolve({ jsonrpc: '2.0', id: payload && payload.id != null ? payload.id : null, error: { code: -32000, message: cfg.NOT_CONNECTED } });
      }
    });
  }

  const server = http.createServer(async function (req, res) {
    const cors = originState(req);
    if (!cors.ok) {
      send(req, res, 403, JSON.stringify({ error: 'origin not allowed' }), null, null);
      return;
    }
    const origin = cors.origin || (cfg.CORS_ORIGINS.indexOf('*') >= 0 ? '*' : null);
    let pathname = '/';
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname;
    } catch (_) {
      pathname = (req.url || '/').split('?')[0];
    }
    const method = (req.method || 'GET').toUpperCase();

    if (method === 'OPTIONS') {
      send(req, res, 204, null, null, origin);
      return;
    }

    /* Health check: used by systemd / a quick Funnel smoke test. */
    const cleaned = pathname.replace(/\/+$/, '') || '/';
    if ((cleaned === '/health' || cleaned.endsWith('/health')) && method === 'GET') {
      send(req, res, 200, 'ok\n', 'text/plain; charset=utf-8', origin);
      return;
    }
    if (cleaned === '/' && method === 'GET') {
      send(req, res, 200, 'Web MCP relay\n', 'text/plain; charset=utf-8', origin);
      return;
    }

    const pin = parseMcpPin(pathname);
    if (pin == null) {
      send(req, res, 404, JSON.stringify({ error: 'not found' }), null, origin);
      return;
    }

    if (method === 'GET' || method === 'HEAD' || method === 'DELETE' || method === 'PUT') {
      send(req, res, 405, JSON.stringify({ error: 'method not allowed' }), null, origin);
      return;
    }
    if (method !== 'POST') {
      send(req, res, 405, JSON.stringify({ error: 'method not allowed' }), null, origin);
      return;
    }

    const ip = clientIp(req, cfg.TRUST_PROXY);
    if (!limiter.check(ip)) {
      res.setHeader('Retry-After', '30');
      send(req, res, 429, JSON.stringify({ error: 'too many requests' }), null, origin);
      return;
    }

    let body;
    try {
      body = await readBody(req, cfg.MAX_BODY);
    } catch (err) {
      const status = err && err.status ? err.status : 400;
      send(req, res, status, JSON.stringify({ error: err.message || 'bad request' }), null, origin);
      return;
    }

    let payload;
    try {
      payload = JSON.parse(body.length ? body.toString('utf8') : 'null');
    } catch (_) {
      send(req, res, 400, JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }), null, origin);
      return;
    }

    const tab = validPin(pin) ? findTab(pin) : null;
    if (!tab) {
      const reqId = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.id : null;
      send(req, res, 200, JSON.stringify({ jsonrpc: '2.0', id: reqId == null ? null : reqId, error: { code: -32000, message: cfg.NOT_CONNECTED } }), null, origin);
      return;
    }

    const isNotif = payload && typeof payload === 'object' && !Array.isArray(payload) && !Object.prototype.hasOwnProperty.call(payload, 'id');
    if (isNotif) {
      await forward(tab, payload, false);
      send(req, res, 202, null, null, origin);
      return;
    }

    const reply = await forward(tab, payload, true);
    send(req, res, 200, JSON.stringify(reply == null ? { jsonrpc: '2.0', id: payload && payload.id, error: { code: -32000, message: cfg.NOT_CONNECTED } } : reply), null, origin);
  });

  server.on('upgrade', function (req, socket, head) {
    let pathname = '/';
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname;
    } catch (_) {
      pathname = (req.url || '/').split('?')[0];
    }
    const cleaned = pathname.replace(/\/+$/, '') || '/';
    if (cleaned !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    const ws = upgradeWebSocket(req, socket, head);
    if (!ws) return;
    /* The first message must be hello; anything else, or a timeout, closes the socket. */
    const helloTimer = setTimeout(function () {
      try { ws.close(1008); } catch (_) { /* ok */ }
    }, 8000);
    if (helloTimer.unref) helloTimer.unref();
    ws.onMessage = function (text) {
      clearTimeout(helloTimer);
      let msg;
      try { msg = JSON.parse(text); } catch (_) {
        try { ws.send(JSON.stringify({ type: 'hello-error', error: 'hello must be JSON' })); } catch (_) { /* ok */ }
        ws.close(1008);
        return;
      }
      if (!msg || msg.type !== 'hello' || !validPin(msg.pin)) {
        try { ws.send(JSON.stringify({ type: 'hello-error', error: 'invalid PIN' })); } catch (_) { /* ok */ }
        ws.close(1008);
        return;
      }
      attachTab(msg.pin, ws);
    };
    ws.onClose = function () {
      clearTimeout(helloTimer);
    };
  });

  return new Promise(function (resolve, reject) {
    server.once('error', reject);
    server.listen(cfg.PORT, cfg.HOST, function () {
      const addr = server.address();
      /**
       * Close every tab and then the HTTP server.
       */
      function close() {
        for (const pin of Array.from(tabs.keys())) dropTab(pin, 'shutdown');
        return new Promise(function (ok) {
          server.close(function () { ok(); });
        });
      }
      resolve({
        server: server,
        port: addr.port,
        host: addr.address,
        close: close,
        tabs: tabs
      });
    });
  });
}

/**
 * Print a short listen banner and start with the file-level CONFIG.
 */
async function main() {
  const started = await startServer();
  process.stdout.write(
    'Web MCP relay listening on http://' + started.host + ':' + started.port +
    '  (POST /mcp/<PIN>,  WS /ws,  GET /health)\n'
  );
  const stop = async function () {
    await started.close();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (require.main === module) {
  main().catch(function (err) {
    process.stderr.write((err && err.stack) || String(err));
    process.stderr.write('\n');
    process.exit(1);
  });
}

module.exports = {
  CONFIG: CONFIG,
  startServer: startServer,
  pinsMatch: pinsMatch,
  validPin: validPin,
  parseMcpPin: parseMcpPin
};
