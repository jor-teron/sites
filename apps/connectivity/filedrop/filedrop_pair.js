/*
 * File Drop — filedrop_pair.js
 * Pairing and the persistent link (adapted from OCR's ocr_send.js / ocr_send_phone.js and the
 * hub ↔ controller backoff).
 *
 * Every device registers a random PeerJS id (config.peerPrefix + 14 chars) and has a secret token;
 * its QR is <page>#<id>.<token>. It also registers a short-lived 4-digit "code" id that only
 * answers {t:'invite', id, token} — so a typed code works like the QR. Whoever scans / types dials;
 * the other side checks the token and accepts at once (no approve dialog). One partner at a time:
 * any other device is refused until Disconnect.
 *
 * Once paired both sides remember each other ({client, name, id, token} in sessionStorage), stay
 * registered on the PeerJS server, ping every few seconds and, when the link dies, the side with
 * the smaller client id redials with backoff (also at once on visibilitychange / pageshow / online).
 * Only Disconnect (either side) ends the pairing.
 *
 * Emits: 'state'(st, partner) st = idle | connecting | linked | reconnecting
 *        'link'(conn) 'unlink'() 'msg'(m) 'frame'(ArrayBuffer) 'code'(code, expiresAt) 'qr'(url)
 *        'forget'() pairing ended · 'toast'(text, kind)
 */
(function (FD) {
  'use strict';
  const P = FD.proto;
  const C = () => FD.config;
  const PAIR = FD.pair = {};
  const SS = { me: 'fd-me', client: 'fd-client', partner: 'fd-partner' };
  const label = P.deviceLabel(navigator.userAgent);

  let me = null;          // {id, token}
  let client = '';        // this tab's identity (survives reload)
  let partner = null;     // {client, name, id, token}
  let peer = null, peerOpen = false, brokerTry = 0, brokerTimer = 0, idTry = 0;
  let codePeer = null, code = '', codeTimer = 0;
  let link = null, lastSeen = 0, pingTimer = 0;
  let dialing = null, dialTimer = 0, redialTimer = 0, redialTry = 0;
  let state = 'idle';
  let waitOpen = [];

  // ----- storage -----
  function load(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (_) { return null; } }
  function save(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } }

  function setState(s) { state = s; FD.emit('state', s, partner); }
  PAIR.state = () => state;
  PAIR.partner = () => partner;
  PAIR.link = () => (link && link.open ? link : null);
  PAIR.label = label;
  PAIR.me = () => me;
  PAIR.code = () => code;

  function newMe() {
    me = { id: C().peerPrefix + P.rand(C().peerIdRandom), token: P.rand(C().tokenLength) };
    save(SS.me, me);
  }
  function emitQr() { FD.emit('qr', P.makeLink(P.baseFor(location, C()), me.id, me.token)); }

  // ----- main peer (stays registered) -----
  function startPeer() {
    if (peer) { try { peer.destroy(); } catch (_) { /* ignore */ } }
    peerOpen = false;
    const p = peer = new Peer(me.id, Object.assign({}, C().peerOptions));
    p.on('open', () => {
      if (peer !== p) return;
      peerOpen = true; brokerTry = 0; idTry = 0;
      const q = waitOpen; waitOpen = [];
      q.forEach((fn) => fn());
      if (partner && !link && iRedial()) redialSoon(0);
    });
    p.on('connection', (c) => { if (peer === p) incoming(c); else close(c); });
    p.on('disconnected', () => { if (peer === p && !p.destroyed) { peerOpen = false; scheduleBroker(); } });
    p.on('error', (err) => {
      if (peer !== p) return;
      const type = err && err.type;
      if (type === 'peer-unavailable') { dialFailed('unavailable'); return; }
      if (type === 'unavailable-id') {
        // After a reload the server may still hold our old id for a moment: retry, then take a new one.
        if (++idTry <= 4) { setTimeout(() => { if (peer === p) startPeer(); }, 1500 * idTry); return; }
        newMe(); emitQr(); if (partner) partner.forceMe = true; startPeer(); return;
      }
      if (type === 'browser-incompatible') { FD.emit('toast', 'This browser cannot do WebRTC.', 'err'); return; }
      peerOpen = false;
      scheduleBroker();
    });
  }
  function scheduleBroker() {
    clearTimeout(brokerTimer);
    const d = C().brokerRetryMs;
    brokerTimer = setTimeout(() => {
      if (!peer) return;
      if (peer.destroyed) startPeer();
      else if (peer.disconnected) { try { peer.reconnect(); } catch (_) { startPeer(); } }
    }, d[Math.min(brokerTry++, d.length - 1)]);
  }
  function whenOpen(fn) { if (peer && peerOpen && !peer.disconnected) fn(); else { waitOpen.push(fn); if (peer && peer.disconnected) scheduleBroker(); } }

  // ----- 4-digit code id: one-time, refreshes every codeTtlMs -----
  function stopCode() {
    clearTimeout(codeTimer);
    if (codePeer) { try { codePeer.destroy(); } catch (_) { /* ignore */ } }
    codePeer = null; code = '';
    FD.emit('code', '', 0);
  }
  function startCode(attempt) {
    stopCode();
    if (partner) return;
    const c = P.code4();
    const cp = codePeer = new Peer(C().codePrefix + c, Object.assign({}, C().peerOptions));
    let used = false;
    cp.on('open', () => {
      if (codePeer !== cp) return;
      code = c;
      const exp = Date.now() + C().codeTtlMs;
      FD.emit('code', c, exp);
      codeTimer = setTimeout(() => startCode(0), C().codeTtlMs);
    });
    cp.on('connection', (conn) => {
      if (codePeer !== cp || used) { close(conn); return; }
      const t = setTimeout(() => close(conn), C().helloTimeoutMs);
      conn.on('data', (d) => {
        const m = P.decode(d);
        clearTimeout(t);
        if (!m || m.t !== 'hello' || m.code !== c || used) { close(conn, 300); return; }
        if (partner) { send(conn, { t: 'refused' }); close(conn, 400); return; }
        used = true;
        send(conn, { t: 'invite', id: me.id, token: me.token });
        close(conn, 800);
        setTimeout(() => { if (codePeer === cp && !partner) startCode(0); }, 900); // one-time
      });
    });
    cp.on('error', (err) => {
      if (codePeer !== cp) return;
      const type = err && err.type;
      if (type === 'unavailable-id' && (attempt || 0) < 6) { startCode((attempt || 0) + 1); return; }
      if (type === 'peer-unavailable') return;
      clearTimeout(codeTimer);
      codeTimer = setTimeout(() => startCode(0), 4000);   // network trouble: try a fresh code soon
    });
    cp.on('disconnected', () => { if (codePeer === cp && !cp.destroyed) { try { cp.reconnect(); } catch (_) { /* next timer */ } } });
  }

  // ----- helpers -----
  function send(c, m) { try { if (c && c.open) c.send(P.encode(m)); } catch (_) { /* ignore */ } }
  function close(c, ms) { setTimeout(() => { try { c.close(); } catch (_) { /* ignore */ } }, ms || 0); }
  PAIR.send = (m) => { if (link && link.open) { link.send(P.encode(m)); return true; } return false; };
  PAIR.sendRaw = (buf) => { link.send(buf); };
  function iRedial() { return partner && (partner.forceMe || client < partner.client); }

  // ----- incoming link on the main id -----
  function incoming(c) {
    let ok = false;
    const t = setTimeout(() => { if (!ok) close(c); }, C().helloTimeoutMs);
    c.on('data', (d) => {
      if (ok) { onData(c, d); return; }
      clearTimeout(t);
      const m = P.decode(d);
      if (!m || m.t !== 'hello' || m.token !== me.token || typeof m.client !== 'string' || !m.client) {
        send(c, { t: 'bad' }); close(c, 400); return;
      }
      if (partner && m.client !== partner.client) { send(c, { t: 'refused' }); close(c, 400); return; }
      ok = true;
      const was = !!partner;
      partner = { client: m.client.slice(0, 40), name: P.cleanLabel(m.name), id: String(m.id || ''), token: String(m.tok || '') };
      send(c, { t: 'welcome', client: client, name: label, id: me.id, tok: me.token });
      setLink(c, was);
    });
    c.on('close', () => lost(c));
    c.on('error', () => lost(c));
  }

  // ----- dialing (first pairing via QR / code, or redial) -----
  function dial(target, first) {
    clearTimeout(dialTimer); clearTimeout(redialTimer);
    if (dialing && dialing.conn) close(dialing.conn);
    const d = dialing = { target: target, first: first, conn: null };
    if (first) setState('connecting');
    dialTimer = setTimeout(() => { if (dialing === d) dialFailed('timeout'); }, 15000);
    whenOpen(() => {
      if (dialing !== d) return;
      const c = d.conn = peer.connect(target.id, { reliable: true, serialization: 'raw' });
      c.on('open', () => { if (dialing === d) send(c, { t: 'hello', token: target.token, client: client, name: label, id: me.id, tok: me.token }); });
      let ok = false;
      c.on('data', (raw) => {
        if (ok) { onData(c, raw); return; }
        if (dialing !== d) { close(c); return; }
        const m = P.decode(raw);
        if (!m) return;
        if (m.t === 'welcome') {
          ok = true; clearTimeout(dialTimer); dialing = null; redialTry = 0;
          const was = !!partner;
          partner = { client: String(m.client || '').slice(0, 40), name: P.cleanLabel(m.name), id: String(m.id || target.id), token: String(m.tok || '') };
          setLink(c, was);
        } else if (m.t === 'bad' || m.t === 'refused') {
          clearTimeout(dialTimer); dialing = null; close(c);
          if (first) {
            FD.emit('toast', m.t === 'bad' ? 'That QR / link has expired. Scan the current one.' : 'That device is already connected to another device.', 'err');
            setState(partner ? 'reconnecting' : 'idle');
          } else if (m.t === 'bad') forget('The other device was reset. Pair again.');
          else redialSoon();
        }
      });
      c.on('close', () => { if (ok) lost(c); else if (dialing === d) dialFailed('closed'); });
      c.on('error', () => { if (ok) lost(c); else if (dialing === d) dialFailed('error'); });
    });
  }
  function dialFailed(why) {
    const d = dialing;
    if (!d) return;
    dialing = null; clearTimeout(dialTimer);
    if (d.conn) close(d.conn);
    if (d.first) {
      FD.emit('toast', why !== 'unavailable' ? 'Could not connect. Try again.'
        : d.code ? 'Wrong or expired code. Check the code on the other device.' : 'That device is not available (closed or a new QR).', 'err');
      setState(partner ? 'reconnecting' : 'idle');
      if (partner && iRedial()) redialSoon();
    } else redialSoon();
  }
  function redialSoon(ms) {
    clearTimeout(redialTimer);
    if (!partner || link || !iRedial() || !partner.id || !partner.token) return;
    const ds = C().reconnectDelaysMs;
    const wait = ms != null ? ms : ds[Math.min(redialTry++, ds.length - 1)];
    redialTimer = setTimeout(() => { if (partner && !link && !dialing) dial({ id: partner.id, token: partner.token }, false); }, wait);
  }

  PAIR.joinLink = (target) => {
    if (!target || target.id === me.id) return false;
    if (partner && link) { FD.emit('toast', 'Already connected. Disconnect first.', 'err'); return false; }
    if (partner && target.id !== partner.id) { forget(''); }
    dial(target, true);
    return true;
  };

  PAIR.joinCode = (raw) => {
    const c4 = String(raw || '').replace(/\D/g, '');
    if (c4.length !== 4) { FD.emit('toast', 'Enter the 4-digit code.', 'err'); return false; }
    if (c4 === code) { FD.emit('toast', 'That is this device\u2019s own code. Enter it on the other device.', 'err'); return false; }
    if (partner && link) { FD.emit('toast', 'Already connected. Disconnect first.', 'err'); return false; }
    setState('connecting');
    const d = dialing = { target: null, first: true, conn: null, code: true };
    clearTimeout(dialTimer);
    // a live code answers within a second or two; a used / expired one may never answer
    dialTimer = setTimeout(() => { if (dialing === d) dialFailed('unavailable'); }, C().codeAnswerMs);
    whenOpen(() => {
      if (dialing !== d) return;
      const c = d.conn = peer.connect(C().codePrefix + c4, { reliable: true, serialization: 'raw' });
      c.on('open', () => send(c, { t: 'hello', code: c4, client: client }));
      c.on('data', (raw2) => {
        const m = P.decode(raw2);
        if (!m || dialing !== d) return;
        close(c);
        if (m.t === 'invite' && typeof m.id === 'string' && typeof m.token === 'string') {
          clearTimeout(dialTimer); dialing = null;
          PAIR.joinLink({ id: m.id, token: m.token });
        } else if (m.t === 'refused') {
          clearTimeout(dialTimer); dialing = null;
          FD.emit('toast', 'That device is already connected to another device.', 'err');
          setState(partner ? 'reconnecting' : 'idle');
        }
      });
      c.on('close', () => { if (dialing === d) setTimeout(() => { if (dialing === d) dialFailed('unavailable'); }, 300); });
      c.on('error', () => { if (dialing === d) dialFailed('unavailable'); });
      // peer-unavailable for a wrong / expired code arrives on the main peer → dialFailed
    });
    return true;
  };

  // ----- the live link -----
  function setLink(c, wasPaired) {
    const old = link;
    link = c;
    if (old && old !== c) close(old);
    clearTimeout(redialTimer); redialTry = 0;
    if (dialing && dialing.conn !== c) { close(dialing.conn); }
    dialing = null; clearTimeout(dialTimer);
    partner.forceMe = false;
    save(SS.partner, partner);
    stopCode();
    lastSeen = Date.now();
    clearInterval(pingTimer);
    pingTimer = setInterval(heartbeat, C().pingEveryMs);
    setState('linked');
    FD.emit('link', c, wasPaired);
  }
  function heartbeat() {
    if (!link) return;
    if (Date.now() - lastSeen > C().deadAfterMs) { const c = link; close(c); lost(c); return; }
    send(link, { t: 'ping' });
  }
  function onData(c, d) {
    if (c !== link) return;
    lastSeen = Date.now();
    if (typeof d === 'string') {
      const m = P.decode(d);
      if (!m) return;
      if (m.t === 'ping') { send(c, { t: 'pong' }); return; }
      if (m.t === 'pong') return;
      if (m.t === 'bye') { forget('The other device disconnected.'); return; }
      FD.emit('msg', m);
    } else if (d instanceof ArrayBuffer || ArrayBuffer.isView(d)) {
      FD.emit('frame', d);
    }
  }
  function lost(c) {
    if (c !== link) return;
    link = null;
    clearInterval(pingTimer);
    if (!partner) return;
    setState('reconnecting');
    FD.emit('unlink');
    redialSoon();
  }

  // ----- ending a pairing (Disconnect on either side) -----
  function forget(msg) {
    const c = link;
    link = null; partner = null; dialing = null;
    clearInterval(pingTimer); clearTimeout(redialTimer); clearTimeout(dialTimer);
    save(SS.partner, null);
    if (c) close(c, 300);
    newMe();                       // old QR / link stops working
    emitQr();
    startPeer();
    startCode(0);
    setState('idle');
    FD.emit('unlink');
    FD.emit('forget');
    if (msg) FD.emit('toast', msg);
  }
  PAIR.disconnect = () => {
    if (link) send(link, { t: 'bye' });
    forget('Disconnected.');
  };

  // Back from the background (iPhone), from bfcache, or online again: reconnect at once.
  function wake() {
    if (!peer) return;
    if (peer.destroyed) startPeer();
    else if (peer.disconnected) { clearTimeout(brokerTimer); try { peer.reconnect(); } catch (_) { startPeer(); } }
    if (partner && !link) { redialTry = 0; if (iRedial() && !dialing) redialSoon(0); }
    if (link && Date.now() - lastSeen > C().deadAfterMs) heartbeat();
  }

  PAIR.start = () => {
    client = load(SS.client) || P.rand(12);
    save(SS.client, client);
    me = load(SS.me);
    if (!me || !me.id || me.id.indexOf(C().peerPrefix) !== 0) newMe();
    partner = load(SS.partner);
    const target = P.parseLink(location.hash, C());
    if (location.hash) { try { history.replaceState(null, '', location.pathname + location.search); } catch (_) { /* ignore */ } }
    emitQr();
    startPeer();
    if (target && target.id !== me.id && !(partner && partner.id === target.id)) {
      if (partner) { partner = null; save(SS.partner, null); }
      startCode(0);
      dial(target, true);
    } else if (partner) {
      // restored after reload: same id again; the side with the smaller client id redials
      setState('reconnecting');
      redialSoon(0);
    } else {
      startCode(0);
      setState('idle');
    }
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });
    window.addEventListener('pageshow', (e) => { if (e.persisted) wake(); });
    window.addEventListener('online', wake);
    window.addEventListener('hashchange', () => {      // a File Drop link opened in this same tab
      const t = P.parseLink(location.hash, C());
      if (!t) return;
      try { history.replaceState(null, '', location.pathname + location.search); } catch (_) { /* ignore */ }
      PAIR.joinLink(t);
    });
    window.addEventListener('pagehide', (e) => {
      if (e.persisted) return;          // bfcache: keep everything, wake() on return
      try { if (peer) peer.destroy(); } catch (_) { /* ignore */ }
      try { if (codePeer) codePeer.destroy(); } catch (_) { /* ignore */ }
    });
  };
})(window.FD);
