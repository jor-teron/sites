/* Remote — rm_sftp_client.js: JSON-over-WebSocket client for the Hub SFTP relay.
 *
 * Protocol source (read, not imported): hub/relay/sftp_relay.py (docstring), hub/relay/README.md,
 * and the Files client shared/fs/sftp_fs.js, which this module does not import. Remote has its own
 * small client so the app stays standalone.
 *
 * One WebSocket = one SSH login. First message (no id):
 *   { op:"open", token, host, port, user, pass, root }
 * Reply: { id:0, ok:true, root, max } or { id:0, ok:false, code, error }
 * Later: { id, op, path:["a","b"], ... } answered in order as { id, ok:true, ... } or { id, ok:false, code, error }.
 * list returns entries: [{ name, isDir, size, mtime }] (mtime in ms). stat returns isDir, size, mtime.
 * read  → JSON { id, ok:true, size } then ONE binary frame with the bytes. There is no chunking.
 * write → JSON { id, op:"write", path, size } then ONE binary frame; reply { id, ok }.
 * mkdir, rename (to:[...], fails with exists), delete (recursive:true for a non-empty folder).
 * A file larger than max (from the open reply, default 100 MB) is refused with code toobig.
 * Error codes: token, allow, reach, auth, hostkey, notfound, denied, exists, toobig, bad, failed.
 *
 * No DOM, so node can unit-test message building/parsing and a fake WebSocket. Passwords are held
 * only in memory for the open message and are never written by this module.
 */
(function (root) {
  'use strict';

  /* Config is loaded first in the page; tests pass it in via the same global or require. */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});

  /* Build the first message the relay requires. pass is included only in this in-memory object. */
  function buildOpen(a) {
    a = a || {};
    return {
      op: 'open',
      token: a.token || '',
      host: a.host || '',
      port: parseInt(a.port, 10) || 22,
      user: a.user || '',
      pass: a.pass || '',
      root: a.root || a.folder || ''
    };
  }

  /* Build a later request. path must be an array of names under the account folder. */
  function buildRequest(id, op, path, extra) {
    var m = { id: id, op: op, path: Array.isArray(path) ? path : [] };
    if (extra && typeof extra === 'object') {
      Object.keys(extra).forEach(function (k) { m[k] = extra[k]; });
    }
    return m;
  }

  /* Parse a relay frame. Text is JSON; anything else is treated as a binary payload (for reads). */
  function parseReply(raw) {
    if (typeof raw !== 'string') return { binary: true, data: raw };
    try { return JSON.parse(raw); } catch (e) {
      return { ok: false, code: 'bad', error: 'the relay sent invalid JSON' };
    }
  }

  /* Byte length of an ArrayBuffer, TypedArray, or similar payload. */
  function byteLength(data) {
    if (!data) return 0;
    if (typeof data.byteLength === 'number') return data.byteLength;
    if (typeof data.size === 'number') return data.size;
    if (typeof data.length === 'number') return data.length;
    return 0;
  }

  /* Human label for the relay max, e.g. "100 MB". */
  function maxLabel(max) {
    var n = Number(max) || 0;
    var mb = Math.max(1, Math.round(n / 1048576));
    return mb + ' MB';
  }

  /* Clear message when a file is over the relay max. */
  function tooBigMessage(name, size, max) {
    var who = name || 'This file';
    return who + ' is larger than the relay limit (' + maxLabel(max) + ').';
  }

  /* Turn a relay error code (and optional message) into a clear sentence plus a README hint. */
  function explainError(code, error) {
    /* Code from the relay, or 'reach' when the socket itself failed. */
    var c = code || 'failed';
    /* Hint appended to setup-related errors. */
    var hint = C.SFTP_README_HINT || ' See the README for how to run the SFTP relay.';
    if (c === 'token') return (C.SFTP_ERR_TOKEN || 'Wrong relay token.') + hint;
    if (c === 'allow') {
      var allow = error || C.SFTP_ERR_ALLOW || 'This host is not in the relay allowlist.';
      return /README/.test(allow) ? allow : allow + hint;
    }
    if (c === 'auth') return C.SFTP_ERR_AUTH || 'Login failed. Check the user and password.';
    if (c === 'hostkey') {
      var hk = error || C.SFTP_ERR_HOSTKEY || 'The server host key changed.';
      return /README/.test(hk) ? hk : hk + hint;
    }
    if (c === 'reach') {
      var r = error || C.SFTP_ERR_REACH_RELAY || "Can't reach the relay.";
      return /README/.test(r) ? r : r + hint;
    }
    if (c === 'toobig') return error || ('This file is larger than the relay limit.' + hint);
    if (c === 'notfound' || c === 'denied' || c === 'exists' || c === 'bad' || c === 'failed') {
      return error || (c + hint);
    }
    return (error || ('SFTP error: ' + c)) + hint;
  }

  /* Wrap a code + message as an Error with .sftp and .explain set. */
  function fail(code, error) {
    var msg = explainError(code, error);
    var e = new Error(msg);
    e.sftp = code || 'failed';
    e.explain = msg;
    return e;
  }

  /**
   * Open a session to the relay and log in.
   * opts: { relay, token, host, port, user, pass, root, WebSocket, openMs }.
   * Returns a Promise of a client: { root, max, list, stat, read, write, mkdir, rename, remove, ping, close, isOpen, isBusy }.
   */
  function connect(opts) {
    opts = opts || {};
    /* WebSocket constructor: the real one in the browser, or a fake in tests. */
    var WS = opts.WebSocket || (typeof WebSocket !== 'undefined' ? WebSocket : null);
    if (!WS) {
      return Promise.reject(fail('reach', C.SFTP_ERR_REACH_RELAY));
    }
    /* Relay URL, already normalized by the caller when possible. */
    var url = String(opts.relay || '').trim();
    if (!url) {
      return Promise.reject(fail('reach', C.SFTP_ERR_REACH_RELAY));
    }

    return new Promise(function (resolve, reject) {
      /* Socket, request queue and open-timeout handle live in this closure. */
      var ws;
      var ready = false;
      var closed = false;
      var seq = 0;
      var timer;
      var pending = 0;
      /* In-flight requests (id -> {resolve, reject, op, reply}). */
      var waitMap = {};
      /* Reads whose JSON reply arrived and which are waiting for the following binary frame, in order. */
      var binWait = [];

      function rejectAll(err) {
        var q = waitMap;
        waitMap = {};
        binWait = [];
        Object.keys(q).forEach(function (id) {
          try { q[id].reject(err); } catch (e) { /* handler threw */ }
        });
        pending = 0;
      }

      function finishOpen(err, client) {
        if (ready) return;
        clearTimeout(timer);
        if (err) {
          if (closed) return;
          closed = true;
          try { if (ws) ws.close(); } catch (e) { /* already closed */ }
          reject(err);
          return;
        }
        ready = true;
        resolve(client);
      }

      try {
        ws = new WS(url);
      } catch (e) {
        reject(fail('reach', C.SFTP_ERR_REACH_RELAY));
        return;
      }
      /* Reads arrive as a JSON frame followed by one ArrayBuffer frame. */
      if (ws) ws.binaryType = 'arraybuffer';

      var openMs = opts.openMs != null ? opts.openMs : (C.SFTP_OPEN_MS || 25000);
      timer = setTimeout(function () {
        if (ready || closed) return;
        closed = true;
        try { if (ws) ws.close(); } catch (e) { /* already closed */ }
        reject(fail('reach', 'the relay or the server did not answer'));
      }, openMs);

      /* Send the open message as soon as the socket is up. */
      ws.onopen = function () {
        try { ws.send(JSON.stringify(buildOpen(opts))); } catch (e) {
          finishOpen(fail('reach', C.SFTP_ERR_REACH_RELAY));
        }
      };
      /* onerror is followed by onclose in every browser; we handle failure there. */
      ws.onerror = function () { /* onclose follows */ };
      ws.onclose = function () {
        if (!ready) {
          if (closed) return;
          closed = true;
          clearTimeout(timer);
          reject(fail('reach', C.SFTP_ERR_REACH_RELAY));
          return;
        }
        closed = true;
        rejectAll(fail('reach', 'the relay closed the connection'));
      };
      ws.onmessage = function (ev) {
        var raw = ev && ev.data !== undefined ? ev.data : ev;
        var m = parseReply(raw);
        if (!ready) {
          /* The open reply must be JSON with id 0. */
          if (m.binary || m.id !== 0) return;
          if (!m.ok) {
            closed = true;
            clearTimeout(timer);
            try { ws.close(); } catch (e) { /* already closed */ }
            reject(fail(m.code, m.error));
            return;
          }
          /* Largest file the relay will read or write, in bytes. */
          var max = +m.max || (C.SFTP_DEFAULT_MAX || 0);
          /* Build the live client once login succeeds. */
          var client = {
            root: m.root || '',
            max: max,
            list: function (path) { return req('list', path).then(function (r) { return r.entries || []; }); },
            stat: function (path) { return req('stat', path); },
            ping: function () { return req('ping', []); },
            /* Read a file. Resolves to an ArrayBuffer. The whole file is one frame; there is no chunking. */
            read: function (path) {
              return req('read', path).then(function (r) { return r.data; });
            },
            /* Write a file. data is an ArrayBuffer or TypedArray sent as one binary frame after the JSON. */
            write: function (path, data, name) {
              var size = byteLength(data);
              if (max && size > max) {
                return Promise.reject(fail('toobig', tooBigMessage(name || (path && path[path.length - 1]), size, max)));
              }
              return req('write', path, { size: size }, data || new ArrayBuffer(0));
            },
            mkdir: function (path) { return req('mkdir', path); },
            rename: function (path, to) { return req('rename', path, { to: to }); },
            /* Delete a file, or a folder. recursive true is required for a folder with contents. */
            remove: function (path, recursive) { return req('delete', path, { recursive: !!recursive }); },
            close: function () {
              if (closed) return;
              closed = true;
              ready = false;
              try { ws.onclose = ws.onmessage = null; ws.close(); } catch (e) { /* already closed */ }
              rejectAll(fail('reach', 'disconnected'));
            },
            isOpen: function () { return ready && !closed && ws && ws.readyState === 1; },
            isBusy: function () { return pending > 0; }
          };
          finishOpen(null, client);
          return;
        }
        /* Binary frame: the body of the oldest outstanding read. */
        if (m.binary) {
          var br = binWait.shift();
          if (!br) return;
          delete waitMap[br.id];
          pending = Math.max(0, pending - 1);
          br.resolve(Object.assign({}, br.reply, { data: m.data }));
          return;
        }
        var w = waitMap[m.id];
        if (!w) return;
        if (!m.ok) {
          delete waitMap[m.id];
          pending = Math.max(0, pending - 1);
          w.reject(fail(m.code, m.error));
          return;
        }
        /* A successful read is followed by one binary frame; keep the waiter on the bin queue. */
        if (w.op === 'read') {
          w.reply = m;
          binWait.push(w);
          return;
        }
        delete waitMap[m.id];
        pending = Math.max(0, pending - 1);
        w.resolve(m);
      };

      /* Send an op after the session is open. body, if given, is the write payload (one binary frame). */
      function req(op, path, extra, body) {
        if (closed || !ws || ws.readyState !== 1) {
          return Promise.reject(fail('reach', 'the relay closed the connection'));
        }
        seq += 1;
        var id = seq;
        pending += 1;
        var p = new Promise(function (res, rej) {
          waitMap[id] = { resolve: res, reject: rej, op: op };
        });
        try {
          ws.send(JSON.stringify(buildRequest(id, op, path, extra)));
          if (op === 'write') ws.send(body || new ArrayBuffer(0));
        } catch (e) {
          delete waitMap[id];
          pending = Math.max(0, pending - 1);
          return Promise.reject(fail('reach', 'the relay closed the connection'));
        }
        return p;
      }
    });
  }

  /* Public API, also exported for Node tests. */
  var api = {
    buildOpen: buildOpen,
    buildRequest: buildRequest,
    parseReply: parseReply,
    explainError: explainError,
    tooBigMessage: tooBigMessage,
    maxLabel: maxLabel,
    byteLength: byteLength,
    connect: connect
  };
  root.RMSftpClient = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
