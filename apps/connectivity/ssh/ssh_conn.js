/*
 * SSH — one SSH session over the relay WebSocket, using vendor/ssh-lib.min.js (window.SSHLib).
 * SSH.Conn.open(o) -> Promise<{ write(str), resize(cols, rows), close() }>
 *   o = { relay, host, port, user, password, cols, rows, signal (AbortSignal, optional),
 *         keepAliveSec (default 30), keepAliveMiss (default 2),
 *         onData(Uint8Array), onHostKey(info) -> Promise<bool>, onClose(msg, kind) }
 *   onClose kind: 'exit' (the remote shell ended) or 'lost' (network, relay, server or keepalive failure).
 *   Not called after close() or when open() rejects.
 * Rejects with Error whose .code is: bad-relay, relay-down, relay-target, auth, hostkey, timeout, ssh, cancelled.
 * The 30 s login timeout is paused while the host key prompt is open (S3-F2).
 * Keepalive (S3): the library sends keepalive@openssh.com every keepAliveSec; after keepAliveMiss intervals with
 * nothing received from the server the link is treated as dead ('lost').
 * The relay gets ?token=host:port and connects only to targets in its allowlist (see relay/README.md).
 */
SSH.Conn = (() => {
  const L = window.SSHLib;
  const fail = (code, msg) => Object.assign(new Error(msg), { code });

  function relayUrl(relay, host, port) {
    let u;
    try { u = new URL(relay.trim()); } catch (_) { throw fail('bad-relay', 'The relay URL is not valid. Example: ws://192.168.1.10:8022'); }
    if (u.protocol === 'http:') u.protocol = 'ws:';
    if (u.protocol === 'https:') u.protocol = 'wss:';
    if (u.protocol !== 'ws:' && u.protocol !== 'wss:') throw fail('bad-relay', 'The relay URL must start with ws:// or wss://');
    u.searchParams.set('token', (host.includes(':') ? '[' + host + ']' : host) + ':' + port);
    return u.href;
  }

  function relayAnswers(wsUrl) {
    const u = new URL(wsUrl); u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:'; u.search = '';
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
    return fetch(u.href, { mode: 'no-cors', cache: 'no-store', signal: ctl.signal }).then(() => true, () => false).finally(() => clearTimeout(t));
  }

  async function fingerprint(key) {
    const bytes = await key.getPublicKeyBytes();
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    let s = ''; h.forEach((b) => { s += String.fromCharCode(b); });
    return { alg: key.keyAlgorithmName, fp: 'SHA256:' + btoa(s).replace(/=+$/, '') };
  }

  const stats = { keepAliveOk: 0, keepAliveMiss: 0 }; /* diagnostics (all sessions this visit) */

  async function open(o) {
    if (!window.isSecureContext || !crypto.subtle) throw fail('ssh', 'This page needs a secure context (https or localhost) for Web Crypto.');
    const url = relayUrl(o.relay, o.host, o.port);
    if (location.protocol === 'https:' && url.startsWith('ws:')) throw fail('bad-relay', 'This page is on https, so the browser only allows a wss:// relay. Use wss:// (see Relay help).');
    if (o.signal && o.signal.aborted) throw fail('cancelled', 'Connection cancelled.');

    function targetErr() { return fail('relay-target', 'The relay is running but could not open ' + o.host + ':' + o.port + '.\nCheck the host is on, the port is right, and it is listed in relay/allowlist.txt.'); }
    let gotBytes = false, closed = false, session = null, channel = null, done = false, live = false, ws = null;
    const cleanup = () => { try { if (session) session.dispose(); } catch (_) {} try { if (ws) ws.close(); } catch (_) {} };
    const closeOnce = (msg, kind) => { if (done) return; done = true; cleanup(); if (live && o.onClose) o.onClose(msg, kind); };

    /* stop rejects on cancel, login timeout or a dropped socket; every setup step races against it. */
    let rejectStop;
    const stop = new Promise((_, rej) => { rejectStop = rej; });
    stop.catch(() => {});
    const guard = (p) => { p.catch(() => {}); /* no unhandled "disposed" rejections */ return Promise.race([p, stop]); };
    let left = 30000, since = 0, tid = null; /* pausable login timeout */
    const tStart = () => { if (tid || done || left <= 0) return; since = Date.now(); tid = setTimeout(() => { tid = null; left = 0; rejectStop(fail('timeout', 'The SSH server did not respond in time.')); }, left); };
    const tPause = () => { if (!tid) return; clearTimeout(tid); tid = null; left -= Date.now() - since; };
    const tStop = () => { clearTimeout(tid); tid = null; };
    const onAbort = () => rejectStop(fail('cancelled', 'Connection cancelled.'));
    if (o.signal) o.signal.addEventListener('abort', onAbort, { once: true });
    const failed = (err) => { tStop(); done = true; cleanup(); if (o.signal) o.signal.removeEventListener('abort', onAbort); return err; };

    ws = new WebSocket(url, ['binary']);
    ws.binaryType = 'arraybuffer';
    try {
      await guard(new Promise((res, rej) => {
        const t = setTimeout(() => rej(fail('relay-down', 'The relay did not answer at ' + o.relay + '.\nIs start-relay running on that PC, and is the address right?')), 10000);
        ws.onopen = () => { clearTimeout(t); res(); };
        ws.onerror = () => {
          clearTimeout(t);
          /* The relay refuses a target outside its allowlist before the WebSocket opens, which looks the
             same as "relay down". A plain request tells the two apart: a running relay answers it. */
          relayAnswers(url).then((up) => rej(up ? targetErr()
            : fail('relay-down', 'Could not reach the relay at ' + o.relay + '.\nIs start-relay running on that PC, and is the address right?')));
        };
      }));
    } catch (err) { throw failed(err); }
    ws.addEventListener('message', () => { gotBytes = true; }, { once: true });
    ws.addEventListener('close', () => {
      closed = true;
      if (!live) rejectStop(gotBytes ? fail('ssh', 'Connection lost during login: the relay or the network closed it.') : targetErr());
      closeOnce('Connection lost: the relay or the network closed it.', 'lost');
    });

    const cfg = new L.SshSessionConfiguration();
    const kaSec = o.keepAliveSec == null ? 30 : o.keepAliveSec, kaMiss = o.keepAliveMiss || 2;
    if (kaSec > 0) cfg.keepAliveTimeoutInSeconds = kaSec;
    session = new L.SshClientSession(cfg);
    let hostKeyOk = false;
    session.onAuthenticating((e) => {
      if (e.authenticationType !== L.SshAuthenticationType.serverPublicKey) return;
      tPause(); /* S3-F2: no login timeout while the user reads the fingerprint */
      e.authenticationPromise = fingerprint(e.publicKey).then((info) => o.onHostKey(info))
        .then((ok) => { hostKeyOk = !!ok && !done; tStart(); return hostKeyOk ? {} : null; });
    });
    session.onClosed((e) => {
      if (!live) { rejectStop(fail('ssh', 'The server closed the connection' + (e && e.message ? ': ' + e.message : '.'))); return; }
      const m = e && e.message && !/disposed/i.test(e.message) ? e.message : '';
      closeOnce('Connection lost: the server closed the session' + (m ? ' (' + m + ').' : '.'), 'lost');
    });
    session.onKeepAliveSucceeded(() => { stats.keepAliveOk++; });
    session.onKeepAliveFailed((n) => {
      stats.keepAliveMiss++;
      if (live && n >= kaMiss) closeOnce('Connection lost: the server stopped answering (no reply for ' + n * kaSec + ' s).', 'lost');
    });

    tStart();
    try {
      await guard(session.connect(new L.WebSocketStream(ws)));
    } catch (err) {
      failed(err);
      if (err && (err.code === 'cancelled')) throw err;
      if (!gotBytes || closed) throw targetErr();
      throw fail(err && err.code === 'timeout' ? 'timeout' : 'ssh', 'SSH handshake failed: ' + (err && err.message || err));
    }
    let ok;
    try {
      ok = await guard(session.authenticate({ username: o.user, password: o.password }));
    } catch (err) {
      failed(err);
      if (err && (err.code === 'timeout' || err.code === 'cancelled')) throw err;
      if (!hostKeyOk) throw fail('hostkey', 'Connection cancelled: host key not trusted.');
      throw fail('ssh', 'Login failed: ' + (err && err.message || err));
    }
    if (!ok) {
      failed(null);
      if (!hostKeyOk) throw fail('hostkey', 'Connection cancelled: host key not trusted.');
      throw fail('auth', 'Wrong user name or password for ' + o.user + '@' + o.host + '.');
    }

    try {
      channel = await guard(session.openChannel());
      channel.onDataReceived((d) => { o.onData(Uint8Array.prototype.slice.call(d)); /* copy: the library reuses its buffer */ channel.adjustWindow(d.length); });
      channel.onClosed((e) => {
        /* S3-F1: report first, then dispose (disposing first gave "…disposed." as the message).
           A channel closed by a dying session carries an error or the session is already closed: that is a lost link. */
        if (done) return;
        if ((e && e.error) || session.isClosed) { closeOnce('Connection lost: the SSH session closed.', 'lost'); return; }
        const st = e && e.exitStatus != null ? Number(e.exitStatus) : 0;
        const sig = e && e.exitSignal ? ' (signal ' + e.exitSignal + ')' : '';
        closeOnce('The remote shell ended' + (st ? ' (exit ' + st + ')' : sig) + '.', 'exit');
      });
      if (!(await guard(channel.request(new L.PtyReq(o.cols, o.rows))))) throw new Error('the server refused a terminal (pty)');
      if (!(await guard(channel.request(new L.ChannelRequestMessage('shell', true))))) throw new Error('the server refused a shell');
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
      write: (s) => { if (!done) channel.send(L.Buffer.from(s, 'utf8')).catch(() => {}); },
      resize: (c, r) => { if (!done) channel.request(new L.WinCh(c, r)).catch(() => {}); },
      close: () => { if (done) return; done = true; try { channel.close().catch(() => {}); } catch (_) {} cleanup(); },
    };
  }

  return { open, stats };
})();
