/*
  Project: sites (shared)
  File: shared/link/link_core.js
  Role: SharedLink core. One PeerJS connection layer for every app.
  - PEERJS_URL is the ONE place PeerJS is pinned; loadPeer() injects it when
    window.Peer is missing. PeerJS default config only (no iceServers): the
    default list includes the PeerJS TURN relay, needed behind CGNAT.
  - host({prefix, code, codeKey, onLegacy}): registers prefix + code and keeps
    it across reloads (code in localStorage), with unavailable-id / network
    backoff. Connections with metadata.kind 'link' speak the SharedLink
    protocol; anything else (old Gamepad, kind 'files') goes to onLegacy(conn).
  - join({prefix, code, meta}): phone side (meta = extra connection metadata), reconnects with backoff until leave().
  Wire protocol (JSON objects, key t): see README.md. Files: link_files.js.
  Events: status, devices, message, file, progress, open, close, bye,
  raw(msg, from, conn) for any other JSON message (Gamepad keys, rumble).
*/
(function () {
  'use strict';

  var PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  var ID_RETRY_MS = [1000, 2000, 3000, 5000, 5000, 8000, 10000, 10000, 15000, 15000];
  var NET_RETRY_MS = [2000, 4000, 8000, 15000, 30000];

  var listeners = {};
  var loading = null;

  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); return fn; }
  function off(ev, fn) { var l = listeners[ev] || []; var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }
  function emit(ev, a, b) {
    (listeners[ev] || []).slice().forEach(function (fn) {
      try { fn(a, b); } catch (err) { console.warn('SharedLink ' + ev, err); }
    });
  }

  /* Load PeerJS once from the pinned CDN url. Resolves with window.Peer. */
  function loadPeer() {
    if (window.Peer) return Promise.resolve(window.Peer);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PEERJS_URL;
      s.async = true;
      s.onload = function () { window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS missing')); };
      s.onerror = function () { loading = null; reject(new Error('PeerJS load failed')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function load(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* blocked */ } }
  function drop(k) { try { localStorage.removeItem(k); } catch (_) { /* blocked */ } }

  /* Random 4-digit code (avoid = skip this one). */
  function randomCode(avoid) {
    var c = avoid;
    while (c === avoid) c = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    return c;
  }

  function safeSend(conn, msg) {
    try { if (conn && conn.open) { conn.send(msg); return true; } } catch (_) { /* gone */ }
    return false;
  }

  var S = {
    role: '', prefix: '', code: '', peer: null, timer: 0, idRetry: 0, netRetry: 0,
    links: new Map(),      // peer id -> { conn, name, legacy }
    hostConn: null,        // join role: the conn to the host
    devices: [],           // last known list [{id,name,online}]
    opts: {}
  };

  function status(text, state) { S.status = text; emit('status', text, state || ''); }

  function destroy() {
    S.hostConn = null;   // its close event must not schedule a rejoin after pause()
    clearTimeout(S.timer);
    S.timer = 0;
    var p = S.peer;
    S.peer = null;
    try { if (p) p.destroy(); } catch (_) { /* gone */ }
  }

  /* ---------- host ---------- */

  function deviceList() {
    var list = [];
    S.links.forEach(function (l, id) {
      list.push({ id: id, name: l.name || (l.legacy ? 'Gamepad' : 'Device'), online: !!(l.conn && l.conn.open), legacy: !!l.legacy });
    });
    return list;
  }

  function broadcastDevices() {
    S.devices = deviceList();
    var self = { id: 'host', name: window.SharedLinkDevices ? SharedLinkDevices.name() : 'Host', online: true };
    var list = [self].concat(S.devices.filter(function (d) { return !d.legacy || d.online; }));
    S.links.forEach(function (l) { if (!l.legacy) safeSend(l.conn, { t: 'devices', list: list }); });
    emit('devices', S.devices);
  }

  function attachLink(conn) {
    var id = conn.peer;
    var md = conn.metadata || {};
    var old = S.links.get(id);
    if (old && old.conn !== conn) { try { old.conn.close(); } catch (_) { /* gone */ } }
    var rec = { conn: conn, name: String(md.name || '').slice(0, 40), legacy: false };
    S.links.set(id, rec);
    conn.on('open', function () { safeSend(conn, { t: 'ready' }); broadcastDevices(); emit('open', id); });
    conn.on('data', function (data) { onData(conn, rec, data); });
    conn.on('close', function () {
      if (S.links.get(id) !== rec) return;
      S.links.delete(id);
      broadcastDevices();
      emit('close', id);
    });
    conn.on('error', function () { /* close follows */ });
  }

  /* Legacy (old Gamepad) conns are only listed; the app owns them. */
  function trackLegacy(conn, name) {
    var id = conn.peer;
    var rec = { conn: conn, name: name || 'Gamepad', legacy: true };
    S.links.set(id, rec);
    var done = function () { if (S.links.get(id) === rec) { S.links.delete(id); broadcastDevices(); } };
    conn.on('open', broadcastDevices);
    conn.on('close', done);
    if (conn.open) broadcastDevices();
  }

  function onData(conn, rec, data) {
    var msg = data;
    if (typeof data === 'string') { try { msg = JSON.parse(data); } catch (_) { return; } }
    if (!msg || typeof msg !== 'object') return;
    var from = conn.peer;
    if (msg.t === 'hello' || msg.t === 'name') {
      if (msg.name) rec.name = String(msg.name).slice(0, 40);
      if (msg.t === 'hello') safeSend(conn, { t: 'ready' });
      if (S.role === 'host') broadcastDevices();
      return;
    }
    if (msg.t === 'ready') { status('Connected', 'linked'); return; }
    if (msg.t === 'devices') { S.devices = Array.isArray(msg.list) ? msg.list : []; emit('devices', S.devices); return; }
    if (msg.t === 'bye') { emit('bye', from, msg); try { conn.close(); } catch (_) { /* gone */ } return; }
    if (window.SharedLinkFiles && SharedLinkFiles.handle(msg, from)) return;
    if (msg.t === 'msg') {
      // Host relays messages addressed to another device.
      if (S.role === 'host' && msg.to && msg.to !== 'host') { send(Object.assign({}, msg, { from: from }), msg.to); return; }
      emit('message', msg, from);
      return;
    }
    // Anything else (Gamepad {t:'btn'|'stick'|'key'|'ptr'…}, Hub → pad {t:'rumble'}) → 'raw'.
    emit('raw', msg, from, conn);
  }

  function host(opts) {
    S.role = 'host';
    S.opts = opts || {};
    S.prefix = S.opts.prefix || 'jtsites-';
    var key = S.opts.codeKey;
    S.code = S.opts.code || (key && load(key)) || randomCode('');
    if (key) save(key, S.code);
    S.idRetry = 0; S.netRetry = 0;
    return loadPeer().then(function () { startHost(false); return S.code; },
      function (err) { status('PeerJS could not load (offline?)', 'error'); throw err; });
  }

  function startHost(isRetry) {
    destroy();
    if (!isRetry) { S.idRetry = 0; S.netRetry = 0; }
    var code = S.code;
    status(isRetry ? 'Re-registering code…' : 'Starting…', 'starting');
    var p = S.peer = new window.Peer(S.prefix + code, { debug: 0 });
    p.on('open', function () {
      if (S.peer !== p) return;
      S.idRetry = 0; S.netRetry = 0;
      status('Waiting for devices…', 'listening');
    });
    p.on('connection', function (conn) {
      if (S.peer !== p) return;
      var md = conn.metadata || {};
      if (md.kind === 'link') { attachLink(conn); return; }
      if (md.kind !== 'files') trackLegacy(conn, md.name);
      if (S.opts.onLegacy) S.opts.onLegacy(conn);
      else conn.on('open', function () { try { conn.close(); } catch (_) { /* gone */ } });
    });
    p.on('error', function (err) {
      if (S.peer !== p) return;
      var type = err && err.type;
      if (type === 'unavailable-id') {
        if (S.idRetry < ID_RETRY_MS.length) {
          var d = ID_RETRY_MS[S.idRetry++];
          status('Code still in use (previous session) — retrying ' + S.idRetry + '/' + ID_RETRY_MS.length + '…', 'retry');
          retry(d);
        } else {
          destroy();
          status('Code ' + code + ' is still in use — press "New code"', 'error');
        }
      } else if (/^(network|server-error|socket-error|socket-closed)$/.test(type)) {
        status('Network problem — retrying…', 'retry');
        retry(NET_RETRY_MS[Math.min(S.netRetry++, NET_RETRY_MS.length - 1)]);
      } else if (type !== 'peer-unavailable') {
        status('Error: ' + (type || 'unknown'), 'error');
      }
    });
    p.on('disconnected', function () {
      if (S.peer !== p || p.destroyed) return;
      status('Reconnecting to broker…', 'retry');
      clearTimeout(S.timer);
      S.timer = setTimeout(function () {
        if (S.peer !== p || p.destroyed) return;
        try { p.reconnect(); } catch (_) { startHost(true); }
      }, NET_RETRY_MS[Math.min(S.netRetry++, NET_RETRY_MS.length - 1)]);
    });
  }

  function retry(ms) {
    var keep = S.code;
    destroy();
    S.timer = setTimeout(function () {
      if (S.code !== keep) return;
      if (S.role === 'host') startHost(true); else startJoin();
    }, ms);
  }

  /* Host: fresh code (every device must pair again). */
  function newCode() {
    stop(true);
    S.code = randomCode(S.code);
    if (S.opts.codeKey) save(S.opts.codeKey, S.code);
    return loadPeer().then(function () { startHost(false); return S.code; });
  }

  /* ---------- join ---------- */

  var JOIN_KEY = 'shared-link-join-code';

  function join(opts) {
    S.role = 'join';
    S.opts = opts || {};
    S.prefix = S.opts.prefix || 'jtsites-';
    S.code = String(S.opts.code || load(JOIN_KEY) || '').toUpperCase();
    if (!S.code) { status('Enter the code', 'idle'); return Promise.resolve(''); }
    save(JOIN_KEY, S.code);
    S.netRetry = 0;
    return loadPeer().then(function () { startJoin(); return S.code; });
  }

  function startJoin() {
    destroy();
    status('Connecting · ' + S.code + '…', 'starting');
    var p = S.peer = new window.Peer({ debug: 0 });
    p.on('open', function () {
      if (S.peer !== p) return;
      var name = window.SharedLinkDevices ? SharedLinkDevices.name() : '';
      var conn = p.connect(S.prefix + S.code, { reliable: true, serialization: 'json', metadata: Object.assign({ kind: 'link', name: name }, S.opts.meta || {}) });
      S.hostConn = conn;
      var rec = { conn: conn, name: 'Host' };
      S.links = new Map([['host', rec]]);
      conn.on('open', function () { S.netRetry = 0; safeSend(conn, { t: 'hello', name: name }); emit('open', 'host'); });
      conn.on('data', function (d) { onData(conn, rec, d); });
      conn.on('close', function () {
        if (S.hostConn !== conn) return;
        S.hostConn = null;
        emit('close', 'host');
        if (S.role === 'join') { status('Link lost — reconnecting…', 'retry'); retry(NET_RETRY_MS[Math.min(S.netRetry++, NET_RETRY_MS.length - 1)]); }
      });
    });
    p.on('error', function (err) {
      if (S.peer !== p) return;
      if (S.hostConn && S.hostConn.open) return;
      var type = err && err.type;
      status(type === 'peer-unavailable' ? 'Host not found — retrying…' : 'Network problem — retrying…', 'retry');
      retry(NET_RETRY_MS[Math.min(S.netRetry++, NET_RETRY_MS.length - 1)]);
    });
  }

  /* Manual Disconnect: the only thing that ends a link (says bye, forgets join code). */
  function stop(keepCode) {
    var role = S.role;
    S.links.forEach(function (l) { if (!l.legacy) safeSend(l.conn, { t: 'bye', manual: true }); });
    var conns = [];
    S.links.forEach(function (l) { if (!l.legacy) conns.push(l.conn); });
    S.links = new Map();
    S.hostConn = null;
    S.role = role === 'join' ? '' : role;
    if (role === 'join' && !keepCode) drop(JOIN_KEY);
    setTimeout(function () { conns.forEach(function (c) { try { c.close(); } catch (_) { /* gone */ } }); destroy(); }, 150);
    status('Disconnected', 'idle');
    broadcastDevices();
  }

  /* ---------- sending ---------- */

  function targets(to) {
    var out = [];
    S.links.forEach(function (l, id) {
      if (l.legacy) return;
      if (!to || to === id || (S.role === 'join' && id === 'host')) out.push(l.conn);
    });
    return out;
  }

  /* send({type:'chat', text}, to?) — wrapped as {t:'msg', ...}. Join role: host relays `to`. */
  function send(msg, to) {
    var m = Object.assign({ t: 'msg' }, msg);
    if (to) m.to = to;
    return targets(to).map(function (c) { return safeSend(c, m); }).some(Boolean);
  }

  window.SharedLink = {
    PEERJS_URL: PEERJS_URL,
    loadPeer: loadPeer,
    randomCode: randomCode,
    on: on, off: off, emit: emit,
    host: host, join: join, newCode: newCode, stop: stop,
    pause: destroy,   // drop the peer quietly (page hide): no bye, devices reconnect
    restart: function () { if (S.role === 'host') startHost(false); else if (S.code) startJoin(); },
    send: send,
    trackLegacy: trackLegacy,
    broadcastDevices: broadcastDevices,
    _targets: targets, _safeSend: safeSend,
    get code() { return S.code; },
    get role() { return S.role; },
    get id() { return S.peer && S.peer.open ? S.peer.id : ''; },
    get status() { return S.status || ''; },
    get devices() { return S.devices.slice(); },
    get live() { return !!(S.peer && !S.peer.destroyed); },
    get connected() { return targets().some(function (c) { return c.open; }); }
  };
})();
