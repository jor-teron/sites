/* Remote — rm_ssh_client.js: one SSH session over a websockify TCP relay, using
 * vendor/ssh-lib.min.js (window.SSHLib). The SSH encryption runs in the browser, so the
 * relay only ever sees encrypted bytes. This is Remote's own client: it does not import
 * the SSH app.
 *
 * The relay is the existing Python websockify helper (apps/connectivity/ssh/relay, port 8022).
 * The app connects to ws(s)://relay:8022/?token=HOST:PORT; the allowlist plugin maps that
 * token to a TCP target only when the host is listed.
 *
 * RMSshClient.open(o) -> Promise<{ write(str), resize(cols, rows), close() }>
 *   o = { relay, host, port, user, password, cols, rows, signal,
 *         onData(Uint8Array), onHostKey(info) -> Promise<bool>, onClose(msg, kind) }
 *   onClose kind: 'exit' (the remote shell ended) or 'lost' (network, relay, server or keepalive).
 *   Not called after close() or when open() rejects.
 * Rejects with Error whose .code is: bad-relay, relay-down, relay-target, auth, hostkey,
 * timeout, ssh, cancelled, insecure, ed25519.
 * The login timeout is paused while the host key prompt is open. Keepalive starts after login.
 * buildRelayUrl / targetToken / explainHandshake are also exported so node can test them.
 */
(function (root) {
  'use strict';

  /* Config is loaded first in the page; tests pass it in via the same global or require. */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});

  /* Build an Error that also carries a short code the UI can switch on. */
  function fail(code, msg) {
    var err = new Error(msg);
    err.code = code;
    return err;
  }

  /**
   * Token query value the websockify allowlist plugin expects: host:port,
   * with IPv6 hosts wrapped in brackets.
   */
  function targetToken(host, port) {
    var h = String(host || '').replace(/^\[|\]$/g, '');
    var p = parseInt(port, 10) || 22;
    return (h.indexOf(':') >= 0 ? '[' + h + ']' : h) + ':' + p;
  }

  /**
   * Turn a typed relay URL plus a target into the WebSocket URL the relay expects.
   * http:// becomes ws:// and https:// becomes wss://. The token query is always
   * set to the target (any previous token is replaced — that query is the TCP target,
   * not a secret). Returns { ok, url, reason, code }.
   */
  function buildRelayUrl(relay, host, port) {
    var raw = relay == null ? '' : String(relay).trim();
    if (!raw) {
      return { ok: false, url: '', code: 'bad-relay', reason: C.SSH_ERR_RELAY_URL || 'Enter a relay URL.' };
    }
    var u;
    try {
      u = new URL(raw);
    } catch (e) {
      return { ok: false, url: '', code: 'bad-relay', reason: C.SSH_ERR_RELAY_URL || 'The relay URL is not valid.' };
    }
    if (u.protocol === 'http:') u.protocol = 'ws:';
    if (u.protocol === 'https:') u.protocol = 'wss:';
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') {
      return { ok: false, url: '', code: 'bad-relay', reason: C.SSH_ERR_RELAY_URL || 'The relay URL must use ws:// or wss://.' };
    }
    u.searchParams.set('token', targetToken(host, port));
    return { ok: true, url: u.href, code: '', reason: '' };
  }

  /**
   * Turn a library negotiation failure into a clear Ed25519 / curve25519 message,
   * or null when the text is some other error.
   */
  function explainHandshake(msg) {
    var m = /Failed (PublicKey|KeyExchange) negotiation: Server \(([^)]*)\)/.exec(msg || '');
    if (!m) return null;
    if (m[1] === 'PublicKey') {
      return fail('ed25519', C.SSH_ERR_ED25519_HOST || (
        'This server offers only host key types this app cannot check (' + m[2] + '). '
        + (/ed25519/i.test(m[2]) ? 'Ed25519 host keys are not supported yet. ' : '')
        + 'Enable an ECDSA or RSA host key on the server.'
      ));
    }
    return fail('ed25519', C.SSH_ERR_ED25519_KEX || (
      'No common key exchange with this server (it offers: ' + m[2] + '). '
      + 'This app supports ecdh-sha2-nistp256/384 and diffie-hellman-group14/16; curve25519 only is not supported yet.'
    ));
  }

  /* SHA-256 fingerprint of a library public key, in the OpenSSH "SHA256:…" form. */
  function fingerprint(key) {
    return key.getPublicKeyBytes().then(function (bytes) {
      return crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
        var h = new Uint8Array(buf);
        var s = '';
        h.forEach(function (b) { s += String.fromCharCode(b); });
        return { alg: key.keyAlgorithmName, fp: 'SHA256:' + btoa(s).replace(/=+$/, '') };
      });
    });
  }

  /* A running relay answers a plain HTTP(S) request; a missing one does not. Used to tell
   * "relay down" apart from "target not in the allowlist" (both look like a failed WebSocket). */
  function relayAnswers(wsUrl) {
    var u;
    try { u = new URL(wsUrl); } catch (e) { return Promise.resolve(false); }
    u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
    u.search = '';
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, 4000);
    return fetch(u.href, { mode: 'no-cors', cache: 'no-store', signal: ctl.signal })
      .then(function () { return true; }, function () { return false; })
      .then(function (ok) { clearTimeout(t); return ok; });
  }

  /* The SSH library, loaded as a script tag. Missing in node tests. */
  function lib() {
    return root.SSHLib || (typeof window !== 'undefined' ? window.SSHLib : null);
  }

  /**
   * Open an SSH session over the relay. See the file header for the options and the result.
   */
  async function open(o) {
    o = o || {};
    var L = lib();
    if (!L) throw fail('ssh', C.SSH_ERR_LIB || 'The SSH library failed to load.');
    if (typeof isSecureContext !== 'undefined' && (!isSecureContext || !crypto || !crypto.subtle)) {
      throw fail('insecure', C.SSH_ERR_INSECURE || 'SSH needs a secure page (https or localhost) so the browser can use Web Crypto.');
    }
    var built = buildRelayUrl(o.relay, o.host, o.port);
    if (!built.ok) throw fail(built.code, built.reason);
    var url = built.url;
    var pageIsHttps = typeof location !== 'undefined' && location.protocol === 'https:';
    if (pageIsHttps && /^ws:/i.test(url)) {
      throw fail('bad-relay', C.SSH_ERR_WS_ON_HTTPS || 'This https page cannot use a ws:// relay. Use wss://, or open the Hub over http on your LAN.');
    }
    if (o.signal && o.signal.aborted) throw fail('cancelled', 'Connection cancelled.');

    var who = (o.user || '') + '@' + (o.host || '');
    var targetLabel = (o.host || '') + ':' + (parseInt(o.port, 10) || 22);
    function targetErr() {
      return fail('relay-target', (C.SSH_ERR_ALLOW || 'The relay is running but could not open the target.') + ' Target: ' + targetLabel + '.' + (C.SSH_README_HINT || ''));
    }

    var gotBytes = false;
    var closed = false;
    var session = null;
    var channel = null;
    var done = false;
    var live = false;
    var ws = null;

    /* Drop the session and the socket. Safe to call more than once. */
    function cleanup() {
      try { if (session) session.dispose(); } catch (e) { /* already gone */ }
      try { if (ws) ws.close(); } catch (e) { /* already gone */ }
    }

    /* Report a drop once, only after login succeeded. */
    function closeOnce(msg, kind) {
      if (done) return;
      done = true;
      cleanup();
      if (live && o.onClose) o.onClose(msg, kind);
    }

    /* stop rejects on cancel, login timeout or a dropped socket; every setup step races against it. */
    var rejectStop;
    var stop = new Promise(function (_, rej) { rejectStop = rej; });
    stop.catch(function () { /* avoid an unhandled rejection */ });
    function guard(p) {
      p.catch(function () { /* no unhandled "disposed" rejections */ });
      return Promise.race([p, stop]);
    }

    var left = C.SSH_OPEN_MS || 30000;
    var since = 0;
    var tid = null;
    function tStart() {
      if (tid || done || left <= 0) return;
      since = Date.now();
      tid = setTimeout(function () {
        tid = null;
        left = 0;
        rejectStop(fail('timeout', C.SSH_ERR_TIMEOUT || 'The SSH server did not respond in time.'));
      }, left);
    }
    function tPause() {
      if (!tid) return;
      clearTimeout(tid);
      tid = null;
      left -= Date.now() - since;
    }
    function tStop() {
      clearTimeout(tid);
      tid = null;
    }
    function onAbort() { rejectStop(fail('cancelled', 'Connection cancelled.')); }
    if (o.signal) o.signal.addEventListener('abort', onAbort, { once: true });
    function failed(err) {
      tStop();
      done = true;
      cleanup();
      if (o.signal) o.signal.removeEventListener('abort', onAbort);
      return err;
    }

    ws = new WebSocket(url, ['binary']);
    ws.binaryType = 'arraybuffer';
    try {
      await guard(new Promise(function (res, rej) {
        var t = setTimeout(function () {
          rej(fail('relay-down', (C.SSH_ERR_REACH_RELAY || 'The relay did not answer.') + (C.SSH_README_HINT || '')));
        }, 10000);
        ws.onopen = function () { clearTimeout(t); res(); };
        ws.onerror = function () {
          clearTimeout(t);
          relayAnswers(url).then(function (up) {
            rej(up ? targetErr() : fail('relay-down', (C.SSH_ERR_REACH_RELAY || 'Could not reach the relay.') + (C.SSH_README_HINT || '')));
          });
        };
      }));
    } catch (err) {
      throw failed(err);
    }
    ws.addEventListener('message', function () { gotBytes = true; }, { once: true });
    ws.addEventListener('close', function () {
      closed = true;
      if (!live) {
        rejectStop(gotBytes
          ? fail('ssh', 'Connection lost during login: the relay or the network closed it.')
          : targetErr());
      }
      closeOnce('Connection lost: the relay or the network closed it.', 'lost');
    });

    var cfg = new L.SshSessionConfiguration();
    var kaSec = o.keepAliveSec == null ? (C.SSH_KEEPALIVE_SEC || 30) : o.keepAliveSec;
    var kaMiss = o.keepAliveMiss || (C.SSH_KEEPALIVE_MISS || 2);
    session = new L.SshClientSession(cfg);
    var hostKeyOk = false;
    session.onAuthenticating(function (e) {
      if (e.authenticationType !== L.SshAuthenticationType.serverPublicKey) return;
      tPause();
      e.authenticationPromise = fingerprint(e.publicKey).then(function (info) {
        return o.onHostKey ? o.onHostKey(info) : true;
      }).then(function (ok) {
        hostKeyOk = !!ok && !done;
        tStart();
        return hostKeyOk ? {} : null;
      });
    });
    session.onClosed(function (e) {
      if (!live) {
        rejectStop(explainHandshake(e && e.message) || fail('ssh', 'The server closed the connection' + (e && e.message ? ': ' + e.message : '.')));
        return;
      }
      var m = e && e.message && !/disposed/i.test(e.message) ? e.message : '';
      closeOnce('Connection lost: the server closed the session' + (m ? ' (' + m + ').' : '.'), 'lost');
    });
    session.onKeepAliveFailed(function (n) {
      if (live && n >= kaMiss) {
        closeOnce('Connection lost: the server stopped answering (no reply for ' + (n * kaSec) + ' s).', 'lost');
      }
    });

    tStart();
    try {
      await guard(session.connect(new L.WebSocketStream(ws)));
    } catch (err) {
      failed(err);
      if (err && (err.code === 'cancelled' || err.code === 'ed25519')) throw err;
      var ex = explainHandshake(err && err.message);
      if (ex) throw ex;
      if (!gotBytes || closed) throw targetErr();
      throw fail(err && err.code === 'timeout' ? 'timeout' : 'ssh', 'SSH handshake failed: ' + (err && err.message || err));
    }

    var cred = { username: o.user };
    if (o.password) {
      cred.passwordProvider = async function () { return [o.user, o.password]; };
    }
    if (!cred.passwordProvider) {
      failed(null);
      throw fail('auth', C.SSH_ERR_AUTH || 'Enter a password.');
    }
    var ok;
    try {
      ok = await guard(session.authenticate(cred));
    } catch (err) {
      failed(err);
      if (err && (err.code === 'timeout' || err.code === 'cancelled')) throw err;
      if (!hostKeyOk) throw fail('hostkey', 'Connection cancelled: host key not trusted.');
      throw fail('ssh', 'Login failed: ' + (err && err.message || err));
    }
    if (!ok) {
      failed(null);
      if (!hostKeyOk) throw fail('hostkey', 'Connection cancelled: host key not trusted.');
      throw fail('auth', (C.SSH_ERR_AUTH || 'Login failed. Check the user and password.') + ' (' + who + ').');
    }
    if (kaSec > 0) cfg.keepAliveTimeoutInSeconds = kaSec;

    try {
      channel = await guard(session.openChannel());
      channel.onDataReceived(function (d) {
        if (o.onData) o.onData(Uint8Array.prototype.slice.call(d));
        channel.adjustWindow(d.length);
      });
      channel.onClosed(function (e) {
        if (done) return;
        if ((e && e.error) || session.isClosed) {
          closeOnce('Connection lost: the SSH session closed.', 'lost');
          return;
        }
        var st = e && e.exitStatus != null ? Number(e.exitStatus) : 0;
        var sig = e && e.exitSignal ? ' (signal ' + e.exitSignal + ')' : '';
        closeOnce('The remote shell ended' + (st ? ' (exit ' + st + ')' : sig) + '.', 'exit');
      });
      var cols = o.cols || (C.SSH_DEFAULT_COLS || 80);
      var rows = o.rows || (C.SSH_DEFAULT_ROWS || 24);
      if (!(await guard(channel.request(new L.PtyReq(cols, rows))))) {
        throw new Error('the server refused a terminal (pty)');
      }
      if (!(await guard(channel.request(new L.ChannelRequestMessage('shell', true))))) {
        throw new Error('the server refused a shell');
      }
    } catch (err) {
      failed(err);
      if (err && (err.code === 'timeout' || err.code === 'cancelled')) throw err;
      throw fail('ssh', 'Logged in, but ' + (err && err.message || err) + '.');
    }
    tStop();
    if (o.signal) o.signal.removeEventListener('abort', onAbort);
    if (done) throw fail('ssh', 'Connection lost during login.');
    live = true;

    return {
      write: function (s) {
        if (!done) channel.send(L.Buffer.from(s, 'utf8')).catch(function () {});
      },
      resize: function (c, r) {
        if (!done) channel.request(new L.WinCh(c, r)).catch(function () {});
      },
      close: function () {
        if (done) return;
        done = true;
        try { channel.close().catch(function () {}); } catch (e) { /* already closed */ }
        cleanup();
      }
    };
  }

  /* Public API, also exported for Node tests (open itself needs a browser and SSHLib). */
  var api = {
    open: open,
    buildRelayUrl: buildRelayUrl,
    targetToken: targetToken,
    explainHandshake: explainHandshake
  };
  root.RMSshClient = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
