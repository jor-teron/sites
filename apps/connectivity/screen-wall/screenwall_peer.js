/* Multi-Screen Wall MW1 — presence + messages over PeerJS (own peers; the Hub's peer is never touched).
   Ids: me = 'jtsites-<code>-screenwall-<random>'; lobby = 'jtsites-<code>-screenwall-0'.
   The first device to claim the lobby id keeps the roster; every device (lobby owner too) opens a data
   connection to the lobby and sends {t:'hi', id, info:{name, dev, role, w, h, dpr}}; the lobby broadcasts
   {t:'roster', list:[{id, name, dev, role, w, h, dpr}]}.
   Messages: {t:'all', msg} → lobby relays {t:'sig', from, msg} to every other device; {t:'to', to, msg} → one device.
   If the lobby goes away, each device waits a random 0.3–1.8 s and tries to claim it (failover).
   PeerJS: SharedLink.PEERJS_URL / SharedLink.loadPeer (shared/link/link_core.js) when present, else the same pinned URL. */
(function () {
  'use strict';
  var URL0 = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  var L = {}, ev = {}, code = '', me = null, lobby = null, lconn = null, roster = [], clients = {}, dead = false, retryT = 0, info = {};
  function on(n, f) { (ev[n] = ev[n] || []).push(f); }
  function emit(n, a, b) { (ev[n] || []).forEach(function (f) { try { f(a, b); } catch (e) { console.warn(e); } }); }
  function loadPeer() {
    if (window.Peer) return Promise.resolve(window.Peer);
    var url = (window.SharedLink && SharedLink.PEERJS_URL) || URL0;
    return new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = url; s.async = true;
      s.onload = function () { window.Peer ? res(window.Peer) : rej(new Error('no Peer')); };
      s.onerror = function () { rej(new Error('PeerJS could not load')); };
      document.head.appendChild(s);
    });
  }
  function rid() { return Math.random().toString(36).slice(2, 10); }
  function lobbyId() { return 'jtsites-' + code + '-screenwall-0'; }

  function start(c, inf) {
    code = c; dead = false; info = inf || info;
    emit('status', 'Connecting…');
    return loadPeer().then(function () {
      if (dead) return;
      me = new Peer('jtsites-' + code + '-screenwall-' + rid());
      me.on('open', function () { L.id = me.id; emit('status', 'Looking for devices…'); claimLobby(); });
      me.on('disconnected', function () { if (!dead) setTimeout(function () { try { me.reconnect(); } catch (_) { /* */ } }, 2000); });
      me.on('error', function (e) { if (e.type === 'network' || e.type === 'server-error') emit('status', 'Offline — retrying…'); else if (e.type !== 'peer-unavailable') console.warn('sw peer', e.type); });
    });
  }
  function claimLobby() {
    if (dead) return;
    var p = new Peer(lobbyId());
    var settled = false;
    p.on('open', function () { settled = true; lobby = p; clients = {}; p.on('connection', hostConn); joinLobby(); });
    p.on('error', function (e) {
      if (settled) return; settled = true;
      try { p.destroy(); } catch (_) { /* */ }
      joinLobby(e.type === 'unavailable-id' ? 0 : 1500);
    });
  }
  function clean(i) {
    i = i || {};
    return { name: String(i.name || '').slice(0, 40), dev: String(i.dev || '').slice(0, 40), role: i.role === 'host' ? 'host' : 'display',
      w: Math.max(0, Math.min(20000, +i.w || 0)), h: Math.max(0, Math.min(20000, +i.h || 0)), dpr: Math.max(0.5, Math.min(8, +i.dpr || 1)), since: +i.since || 0 };
  }
  /* lobby owner side */
  function hostConn(conn) {
    conn.on('data', function (m) {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hi') { clients[m.id] = { conn: conn, info: clean(m.info) }; conn._swid = m.id; broadcast(); }
      else if (m.t === 'all') Object.keys(clients).forEach(function (id) { if (id !== conn._swid) { try { clients[id].conn.send({ t: 'sig', from: conn._swid, msg: m.msg }); } catch (_) { /* */ } } });
      else if (m.t === 'to' && clients[m.to]) { try { clients[m.to].conn.send({ t: 'sig', from: conn._swid, msg: m.msg }); } catch (_) { /* */ } }
    });
    conn.on('close', function () { if (conn._swid && clients[conn._swid] && clients[conn._swid].conn === conn) { delete clients[conn._swid]; broadcast(); } });
  }
  function broadcast() {
    var list = Object.keys(clients).map(function (id) { return Object.assign({ id: id }, clients[id].info); });
    Object.keys(clients).forEach(function (id) { try { clients[id].conn.send({ t: 'roster', list: list }); } catch (_) { /* */ } });
  }
  /* every device */
  function joinLobby(delay) {
    clearTimeout(retryT);
    retryT = setTimeout(function () {
      if (dead) return;
      if (!me || me.disconnected) { joinLobby(2000); return; }
      var c = me.connect(lobbyId(), { reliable: true, metadata: { kind: 'screenwall' } });
      var opened = false;
      var to = setTimeout(function () { if (!opened) { try { c.close(); } catch (_) { /* */ } relobby(); } }, 8000);
      c.on('open', function () { opened = true; clearTimeout(to); lconn = c; emit('status', 'Online · code ' + code); emit('online', true); hi(); });
      c.on('data', function (m) {
        if (m && m.t === 'roster') { roster = (m.list || []).filter(function (d) { return d.id !== me.id; }); emit('roster', roster); }
        else if (m && m.t === 'sig') emit('signal', m.msg, m.from);
      });
      c.on('close', function () { if (lconn === c) { lconn = null; roster = []; emit('roster', roster); emit('online', false); relobby(); } });
      c.on('error', function () { /* close follows */ });
    }, delay || 0);
  }
  function relobby() { if (dead) return; emit('status', 'Reconnecting…'); setTimeout(claimLobby, 300 + Math.random() * 1500); }
  function hi() { if (lconn && lconn.open && me) lconn.send({ t: 'hi', id: me.id, info: info }); }
  function update(inf) { info = Object.assign({}, info, inf || {}); hi(); }
  function send(msg) { if (lconn && lconn.open) { lconn.send({ t: 'all', msg: msg }); return true; } return false; }
  function sendTo(to, msg) { if (lconn && lconn.open) { lconn.send({ t: 'to', to: to, msg: msg }); return true; } return false; }
  function stop() {
    dead = true; clearTimeout(retryT);
    try { lconn && lconn.close(); } catch (_) { /* */ }
    try { lobby && lobby.destroy(); } catch (_) { /* */ }
    try { me && me.destroy(); } catch (_) { /* */ }
    me = lobby = lconn = null; roster = []; clients = {};
    emit('online', false);
  }
  addEventListener('pagehide', stop);
  L._emit = emit;   // test hook (quick checks with a simulated peer)
  L.start = start; L.stop = stop; L.on = on; L.send = send; L.sendTo = sendTo; L.update = update;
  L.myId = function () { return me ? me.id : ''; };
  L.online = function () { return !!(lconn && lconn.open); };
  L.roster = function () { return roster; };
  L.code = function () { return code; };
  window.SWPeer = L;
})();
