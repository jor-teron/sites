/*
 * SSH — one SSH session over the relay WebSocket, using vendor/ssh-lib.min.js (window.SSHLib).
 * SSH.Conn.open(o) -> Promise<{ write(str), resize(cols, rows), close() }>
 *   o = { relay, host, port, user, password, cols, rows, onData(Uint8Array), onHostKey(info) -> Promise<bool>, onClose(msg) }
 * Rejects with Error whose .code is: bad-relay, relay-down, relay-target, auth, hostkey, timeout, ssh.
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

  async function open(o) {
    if (!window.isSecureContext || !crypto.subtle) throw fail('ssh', 'This page needs a secure context (https or localhost) for Web Crypto.');
    const url = relayUrl(o.relay, o.host, o.port);
    if (location.protocol === 'https:' && url.startsWith('ws:')) throw fail('bad-relay', 'This page is on https, so the browser only allows a wss:// relay. Use wss:// (see Relay help).');

    function targetErr() { return fail('relay-target', 'The relay is running but could not open ' + o.host + ':' + o.port + '.\nCheck the host is on, the port is right, and it is listed in relay/allowlist.txt.'); }
    const ws = new WebSocket(url, ['binary']);
    ws.binaryType = 'arraybuffer';
    let gotBytes = false, closed = false, session = null, channel = null, done = false;
    const closeOnce = (msg) => { if (done) return; done = true; o.onClose && o.onClose(msg); };

    await new Promise((res, rej) => {
      const t = setTimeout(() => { try { ws.close(); } catch (_) {} rej(fail('relay-down', 'The relay did not answer at ' + o.relay + '.\nIs start-relay running on that PC, and is the address right?')); }, 10000);
      ws.onopen = () => { clearTimeout(t); res(); };
      ws.onerror = () => {
        clearTimeout(t);
        /* The relay refuses a target outside its allowlist before the WebSocket opens, which looks the
           same as "relay down". A plain request tells the two apart: a running relay answers it. */
        relayAnswers(url).then((up) => rej(up ? targetErr()
          : fail('relay-down', 'Could not reach the relay at ' + o.relay + '.\nIs start-relay running on that PC, and is the address right?')));
      };
    });
    ws.addEventListener('message', () => { gotBytes = true; }, { once: true });
    ws.addEventListener('close', () => { closed = true; closeOnce(gotBytes ? 'Connection lost: the relay or the network closed it.' : null); });

    session = new L.SshClientSession(new L.SshSessionConfiguration());
    let hostKeyOk = false;
    session.onAuthenticating((e) => {
      if (e.authenticationType !== L.SshAuthenticationType.serverPublicKey) return;
      e.authenticationPromise = fingerprint(e.publicKey).then((info) => o.onHostKey(info)).then((ok) => { hostKeyOk = ok; return ok ? {} : null; });
    });
    session.onClosed((e) => closeOnce((e && e.message) || 'The SSH session ended.'));

    const timer = new Promise((_, rej) => setTimeout(() => rej(fail('timeout', 'The SSH server did not respond in time.')), 30000));
    try {
      await Promise.race([session.connect(new L.WebSocketStream(ws)), timer]);
    } catch (err) {
      try { ws.close(); } catch (_) {}
      if (!gotBytes || closed) throw targetErr();
      throw fail('ssh', 'SSH handshake failed: ' + (err && err.message || err));
    }
    let ok;
    try {
      ok = await Promise.race([session.authenticate({ username: o.user, password: o.password }), timer]);
    } catch (err) {
      done = true; try { session.dispose(); ws.close(); } catch (_) {}
      if (err && err.code === 'timeout') throw err;
      if (!hostKeyOk) throw fail('hostkey', 'Connection cancelled: host key not trusted.');
      throw fail('ssh', 'Login failed: ' + (err && err.message || err));
    }
    if (!ok) {
      done = true; try { session.dispose(); ws.close(); } catch (_) {}
      if (!hostKeyOk) throw fail('hostkey', 'Connection cancelled: host key not trusted.');
      throw fail('auth', 'Wrong user name or password for ' + o.user + '@' + o.host + '.');
    }

    try {
      channel = await session.openChannel();
      channel.onDataReceived((d) => { o.onData(Uint8Array.prototype.slice.call(d)); /* copy: the library reuses its buffer */ channel.adjustWindow(d.length); });
      channel.onClosed(() => { try { session.dispose(); ws.close(); } catch (_) {} closeOnce('The remote shell ended.'); });
      if (!(await channel.request(new L.PtyReq(o.cols, o.rows)))) throw new Error('the server refused a terminal (pty)');
      if (!(await channel.request(new L.ChannelRequestMessage('shell', true)))) throw new Error('the server refused a shell');
    } catch (err) {
      done = true; try { session.dispose(); ws.close(); } catch (_) {}
      throw fail('ssh', 'Logged in, but ' + (err && err.message || err) + '.');
    }

    return {
      write: (s) => { if (!done) channel.send(L.Buffer.from(s, 'utf8')).catch(() => {}); },
      resize: (c, r) => { if (!done) channel.request(new L.WinCh(c, r)).catch(() => {}); },
      close: () => { done = true; try { channel.close().catch(() => {}); session.dispose(); ws.close(); } catch (_) {} },
    };
  }

  return { open };
})();
