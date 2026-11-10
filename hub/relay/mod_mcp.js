/* RL1: MCP2.2 forwarder reused from apps/tools/web-mcp/relay/mod_mcp.js.
 *
 * The browser tab dials out to /ws and sends {type:'hello', pin}.
 * Grok POSTs JSON-RPC to /mcp/<PIN>. This module forwards the body to the
 * tab, waits for the matching rpc-result, and returns it as application/json.
 * Notifications (JSON-RPC requests with no id) are forwarded and return 202.
 *
 * A later TCP-bridge or fetch-proxy module is a sibling of this file and
 * does not belong here.
 */
'use strict';

const crypto = require('crypto');
const CONFIG = require('./relay_config.js');

/**
 * Constant-time PIN compare. Length is also compared in a way that does not
 * return early on the first differing byte.
 */
function pinsMatch(a, b) {
  /* UTF-8 bytes of the first PIN (may be empty). */
  const left = Buffer.from(String(a || ''), 'utf8');
  /* UTF-8 bytes of the second PIN (may be empty). */
  const right = Buffer.from(String(b || ''), 'utf8');
  /* Shared padded length so timingSafeEqual can run. */
  const n = Math.max(left.length, right.length, 1);
  /* Left PIN copied into a fixed-length buffer. */
  const x = Buffer.alloc(n);
  /* Right PIN copied into a fixed-length buffer. */
  const y = Buffer.alloc(n);
  left.copy(x);
  right.copy(y);
  /* True when every padded byte matches. */
  const sameBytes = crypto.timingSafeEqual(x, y);
  /* True when the original lengths also match. */
  const sameLen = left.length === right.length;
  return sameBytes && sameLen;
}

/**
 * Validate a PIN against the same rules the tab uses.
 */
function validPin(pin) {
  /* PIN as a string, empty when missing. */
  const s = String(pin || '');
  if (s.length > 128 || s.length < CONFIG.PIN_MIN_LEN) return false;
  for (let i = 0; i < s.length; i++) {
    if (CONFIG.PIN_CHARS.indexOf(s.charAt(i)) < 0) return false;
  }
  return true;
}

/**
 * Pull the PIN out of a /mcp/<PIN> path. Returns null when the path is not that shape.
 */
function parseMcpPin(pathname) {
  /* Trailing-slash-stripped pathname. */
  const cleaned = (pathname || '/').replace(/\/+$/, '') || '/';
  /* Capture group 1 is the PIN segment. */
  const m = cleaned.match(/^\/mcp\/([^/]+)$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch (_) {
    return m[1];
  }
}

/**
 * Build the MCP module. Each call gets its own tab map so tests can start
 * more than one relay without sharing sessions.
 */
function createMcpModule() {
  /* PIN -> { ws, pin, pending: Map(id -> {resolve, timer}), pingTimer }. */
  const tabs = new Map();
  /* Monotonic correlation id for messages we send down the WebSocket. */
  let nextId = 1;
  /* Filled in during register() so shutdown() can use the same config. */
  let cfg = CONFIG;

  /**
   * Look up the tab for a PIN with a constant-time compare against every connected PIN.
   */
  function findTab(pin) {
    /* Matching tab, or null when no connected PIN matches. */
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
    /* Session for this PIN, if it is still in the map. */
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
    /* Existing tab for this PIN, if a previous hello already attached one. */
    const existing = findTab(pin);
    if (existing) {
      try { existing.ws.send(JSON.stringify({ type: 'replaced' })); } catch (_) { /* ok */ }
      dropTab(existing.pin, 'replaced');
    }
    /* New session object for this PIN. */
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
      /* Parsed WebSocket message from the tab. */
      let msg;
      try { msg = JSON.parse(text); } catch (_) { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'rpc-result' && msg.id != null) {
        /* In-flight HTTP wait for this correlation id, if any. */
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
   * Forward one JSON-RPC message to the tab and optionally wait for the reply.
   */
  function forward(tab, payload, waitForReply) {
    /* Correlation id sent to the tab and expected back on rpc-result. */
    const id = String(nextId++);
    if (!waitForReply) {
      try { tab.ws.send(JSON.stringify({ type: 'rpc', id: id, payload: payload })); } catch (_) { /* gone */ }
      return Promise.resolve(null);
    }
    return new Promise(function (resolve) {
      /* Timer that turns a late or missing reply into a JSON-RPC error. */
      const timer = setTimeout(function () {
        tab.pending.delete(id);
        resolve({ jsonrpc: '2.0', id: payload && payload.id != null ? payload.id : null, error: { code: -32000, message: 'Web MCP tab timed out' } });
      }, cfg.RPC_TIMEOUT_MS);
      if (tab.pending.size >= cfg.RPC_MAX_PENDING) {
        clearTimeout(timer);
        resolve({ jsonrpc: '2.0', id: payload && payload.id, error: { code: -32000, message: 'too many pending requests' } });
        return;
      }
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

  /**
   * Hook /mcp/<PIN> and /ws into the core.
   */
  function register(api) {
    cfg = api.cfg;
    /* Per-IP limiter used only on POST /mcp/<PIN>. */
    const limiter = api.createLimiter(cfg.RATE_MAX, cfg.RATE_WINDOW_MS);

    api.addHttpRoute(function (pathname) {
      return parseMcpPin(pathname) != null;
    }, async function (ctx) {
      /* PIN taken from the URL, or null if the path is the wrong shape (should not happen). */
      const pin = parseMcpPin(ctx.pathname);
      /* HTTP method already uppercased by the core. */
      const method = ctx.method;
      /* Short aliases used by the existing send() helper. */
      const req = ctx.req;
      const res = ctx.res;
      const origin = ctx.origin;
      const send = ctx.send;

      if (method === 'GET' || method === 'HEAD' || method === 'DELETE' || method === 'PUT') {
        send(req, res, 405, JSON.stringify({ error: 'method not allowed' }), null, origin);
        return;
      }
      if (method !== 'POST') {
        send(req, res, 405, JSON.stringify({ error: 'method not allowed' }), null, origin);
        return;
      }

      /* Client address, honouring X-Forwarded-For when TRUST_PROXY is on. */
      const ip = api.clientIp(req, cfg.TRUST_PROXY);
      if (!limiter.check(ip)) {
        res.setHeader('Retry-After', String(cfg.RETRY_AFTER_SEC));
        send(req, res, 429, JSON.stringify({ error: 'too many requests' }), null, origin);
        return;
      }

      /* Raw POST body, capped at MAX_BODY. */
      let body;
      try {
        body = await api.readBody(req, cfg.MAX_BODY);
      } catch (err) {
        const status = err && err.status ? err.status : 400;
        send(req, res, status, JSON.stringify({ error: err.message || 'bad request' }), null, origin);
        return;
      }

      /* Parsed JSON-RPC payload, or a parse-error response. */
      let payload;
      try {
        payload = JSON.parse(body.length ? body.toString('utf8') : 'null');
      } catch (_) {
        send(req, res, 400, JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }), null, origin);
        return;
      }

      /* Connected tab for this PIN, or null when the PIN is invalid or no tab is attached. */
      const tab = validPin(pin) ? findTab(pin) : null;
      if (!tab) {
        const reqId = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.id : null;
        send(req, res, 200, JSON.stringify({ jsonrpc: '2.0', id: reqId == null ? null : reqId, error: { code: -32000, message: cfg.NOT_CONNECTED } }), null, origin);
        return;
      }

      /* True when this is a JSON-RPC notification (no id), which we ack with 202. */
      const isNotif = payload && typeof payload === 'object' && !Array.isArray(payload) && !Object.prototype.hasOwnProperty.call(payload, 'id');
      if (isNotif) {
        await forward(tab, payload, false);
        send(req, res, 202, null, null, origin);
        return;
      }

      /* Reply from the tab, or a timeout / disconnected error object. */
      const reply = await forward(tab, payload, true);
      send(req, res, 200, JSON.stringify(reply == null ? { jsonrpc: '2.0', id: payload && payload.id, error: { code: -32000, message: cfg.NOT_CONNECTED } } : reply), null, origin);
    });

    api.addUpgrade(function (pathname) {
      return api.cleanedPath(pathname) === '/ws';
    }, function (ctx) {
      /* Upgraded WebSocket, or null when the handshake was rejected. */
      const ws = api.upgradeWebSocket(ctx.req, ctx.socket, ctx.head);
      if (!ws) return;
      /* The first message must be hello; anything else, or a timeout, closes the socket. */
      const helloTimer = setTimeout(function () {
        try { ws.close(1008); } catch (_) { /* ok */ }
      }, cfg.WS_HELLO_MS);
      if (helloTimer.unref) helloTimer.unref();
      ws.onMessage = function (text) {
        clearTimeout(helloTimer);
        /* Parsed hello message from the tab. */
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
  }

  /**
   * Drop every tab. Called by the core on close().
   */
  function shutdown() {
    for (const pin of Array.from(tabs.keys())) dropTab(pin, 'shutdown');
  }

  return {
    name: 'mcp',
    register: register,
    shutdown: shutdown,
    tabs: tabs
  };
}

module.exports = {
  name: 'mcp',
  createMcpModule: createMcpModule,
  pinsMatch: pinsMatch,
  validPin: validPin,
  parseMcpPin: parseMcpPin
};
