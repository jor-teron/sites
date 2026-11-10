/* Web MCP — relay/relay_core.js: HTTP server, routing, CORS, health. MCP2.2
 *
 * The core binds the port, applies CORS, answers / and /health, and
 * dispatches the rest to registered modules. A module calls
 * api.addHttpRoute and api.addUpgrade during register(). Later modules
 * (TCP bridge, fetch proxy) hook in the same way. The core itself
 * writes nothing to disk.
 */
'use strict';

const http = require('http');
const { URL } = require('url');
const CONFIG = require('./relay_config.js');
const WS = require('./relay_ws.js');

/**
 * Create a per-IP sliding-window limiter.
 * max is the number of allowed hits; windowMs is the window length.
 */
function createLimiter(max, windowMs) {
  /* ip -> array of request timestamps (ms). */
  const hits = new Map();
  return {
    /**
     * Return true when this IP is still under the cap, and record the hit.
     */
    check: function (ip) {
      /* Current time in milliseconds, used to drop stale hits. */
      const now = Date.now();
      /* Rate-limit bucket key; unknown when the socket has no address. */
      const key = ip || 'unknown';
      /* Remaining hits inside the current window. */
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

/**
 * Client IP, optionally from X-Forwarded-For when trustProxy is on.
 */
function clientIp(req, trustProxy) {
  if (trustProxy) {
    /* Comma-separated forwarded chain; the first hop is the client. */
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
    /* Collected chunks, concatenated on end. */
    const chunks = [];
    /* Running byte count, compared against max. */
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

/**
 * Pathname of an HTTP request, query string stripped.
 */
function pathOf(req) {
  try {
    return new URL(req.url || '/', 'http://localhost').pathname;
  } catch (_) {
    return (req.url || '/').split('?')[0];
  }
}

/**
 * Pathname with a trailing slash removed, or '/' for the root.
 */
function cleanedPath(pathname) {
  return (pathname || '/').replace(/\/+$/, '') || '/';
}

/**
 * Build a relay that modules can register routes on. cfg overrides CONFIG.
 * Returns { register, listen, modules, cfg }.
 */
function createRelay(cfg) {
  /* Effective config: file defaults plus startServer overrides. */
  const config = Object.assign({}, CONFIG, cfg || {});
  /* Registered module objects, in registration order. */
  const modules = [];
  /* HTTP routes: { match, handler }. First match wins. */
  const httpRoutes = [];
  /* WebSocket upgrade routes: { match, handler }. First match wins. */
  const upgradeRoutes = [];

  /**
   * Decide CORS: returns { ok, origin }.
   */
  function originState(req) {
    /* Value of the Origin header, or undefined when the request has none. */
    const origin = req.headers.origin;
    if (!origin) return { ok: true, origin: null };
    /* Allowed origin list from config ('*' means any). */
    const allowed = config.CORS_ORIGINS;
    if (allowed.indexOf('*') >= 0 || allowed.indexOf(origin) >= 0) {
      return { ok: true, origin: origin };
    }
    return { ok: false, origin: origin };
  }

  /**
   * Write an HTTP response with optional CORS and Connection: close on errors.
   */
  function send(req, res, status, body, contentType, origin) {
    /* Body as a Buffer, or null for an empty response. */
    const payload = body == null ? null : (Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8'));
    res.statusCode = status;
    if (origin) {
      if (config.CORS_ORIGINS.indexOf('*') >= 0) {
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
   * Names of loaded modules, in registration order.
   */
  function moduleNames() {
    return modules.map(function (mod) { return mod.name; });
  }

  /**
   * Plain-text /health body: "ok" plus a modules line.
   */
  function healthBody() {
    return 'ok\nmodules: ' + moduleNames().join(', ') + '\n';
  }

  /**
   * Helpers handed to a module's register() hook.
   */
  function moduleApi() {
    return {
      cfg: config,
      addHttpRoute: function (match, handler) {
        httpRoutes.push({ match: match, handler: handler });
      },
      addUpgrade: function (match, handler) {
        upgradeRoutes.push({ match: match, handler: handler });
      },
      createLimiter: createLimiter,
      clientIp: clientIp,
      readBody: readBody,
      send: send,
      originState: originState,
      pathOf: pathOf,
      cleanedPath: cleanedPath,
      upgradeWebSocket: function (req, socket, head) {
        return WS.upgradeWebSocket(req, socket, head, {
          maxFrame: config.MAX_FRAME,
          wsGuid: config.WS_GUID
        });
      }
    };
  }

  /**
   * Register one module. The module must have a name and a register(api) function.
   */
  function register(mod) {
    if (!mod || !mod.name) {
      throw new Error('relay module must have a name');
    }
    modules.push(mod);
    if (typeof mod.register === 'function') {
      mod.register(moduleApi());
    }
  }

  /**
   * True when this route's matcher accepts the pathname (and method, for HTTP).
   */
  function matches(route, pathname, method, req) {
    /* Matcher provided by the module: a function or a string path. */
    const match = route.match;
    if (typeof match === 'function') return match(pathname, method, req);
    if (typeof match === 'string') return cleanedPath(pathname) === cleanedPath(match);
    return false;
  }

  /**
   * Bind the HTTP server and resolve with { server, port, host, close, modules }.
   */
  function listen() {
    const server = http.createServer(async function (req, res) {
      /* CORS decision for this request. */
      const cors = originState(req);
      if (!cors.ok) {
        send(req, res, 403, JSON.stringify({ error: 'origin not allowed' }), null, null);
        return;
      }
      /* Origin to echo, or '*' when the config allows any origin. */
      const origin = cors.origin || (config.CORS_ORIGINS.indexOf('*') >= 0 ? '*' : null);
      /* Pathname with the query string stripped. */
      const pathname = pathOf(req);
      /* HTTP method, uppercased. */
      const method = (req.method || 'GET').toUpperCase();

      if (method === 'OPTIONS') {
        send(req, res, 204, null, null, origin);
        return;
      }

      /* Health check: used by systemd / a quick Funnel smoke test. Lists loaded modules. */
      const cleaned = cleanedPath(pathname);
      if ((cleaned === '/health' || cleaned.endsWith('/health')) && method === 'GET') {
        send(req, res, 200, healthBody(), 'text/plain; charset=utf-8', origin);
        return;
      }
      if (cleaned === '/' && method === 'GET') {
        send(req, res, 200, 'Web MCP relay\n', 'text/plain; charset=utf-8', origin);
        return;
      }

      /* First matching module route wins. */
      for (let i = 0; i < httpRoutes.length; i++) {
        const route = httpRoutes[i];
        if (!matches(route, pathname, method, req)) continue;
        await route.handler({
          req: req,
          res: res,
          pathname: pathname,
          cleaned: cleaned,
          method: method,
          origin: origin,
          send: send
        });
        return;
      }

      send(req, res, 404, JSON.stringify({ error: 'not found' }), null, origin);
    });

    server.on('upgrade', function (req, socket, head) {
      /* Pathname of the upgrade request, query stripped. */
      const pathname = pathOf(req);
      /* Trailing-slash-stripped form used to match /ws exactly. */
      const cleaned = cleanedPath(pathname);
      for (let i = 0; i < upgradeRoutes.length; i++) {
        const route = upgradeRoutes[i];
        if (!matches(route, pathname, 'GET', req)) continue;
        route.handler({
          req: req,
          socket: socket,
          head: head,
          pathname: pathname,
          cleaned: cleaned
        });
        return;
      }
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      socket.destroy();
    });

    return new Promise(function (resolve, reject) {
      server.once('error', reject);
      server.listen(config.PORT, config.HOST, function () {
        /* Bound address reported by Node (port may be ephemeral when PORT is 0). */
        const addr = server.address();
        /**
         * Ask every module to shut down, then close the HTTP server.
         */
        function close() {
          modules.forEach(function (mod) {
            if (typeof mod.shutdown === 'function') {
              try { mod.shutdown(); } catch (_) { /* module bug */ }
            }
          });
          return new Promise(function (ok) {
            server.close(function () { ok(); });
          });
        }
        resolve({
          server: server,
          port: addr.port,
          host: addr.address,
          close: close,
          modules: moduleNames()
        });
      });
    });
  }

  return {
    register: register,
    listen: listen,
    moduleNames: moduleNames,
    cfg: config
  };
}

module.exports = {
  createRelay: createRelay,
  createLimiter: createLimiter,
  clientIp: clientIp,
  readBody: readBody,
  pathOf: pathOf,
  cleanedPath: cleanedPath
};
