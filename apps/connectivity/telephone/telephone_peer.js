/* Telephone TP1 — presence + signals over PeerJS (own peers; the Hub's peer is never touched).
   Ids: me = 'jtsites-<code>-telephone-<random>' (voice calls go to this id); lobby = 'jtsites-<code>-telephone-0'.
   The first device to claim the lobby id keeps the roster (same pattern as Intercom); every device (lobby owner too)
   opens a data connection to the lobby and sends {t:'hi', id, name, num, did, busy, since};
   the lobby broadcasts {t:'roster', list:[{id, name, num, did, busy, since}]}.
   Signals go to ONE device only: {t:'to', to, msg} → lobby relays {t:'sig', from, msg}. There is no "ring everyone".
   If the lobby goes away, each device waits a random 0.3–1.8 s and tries to claim it (failover).
   PeerJS: SharedLink.PEERJS_URL (shared/link/link_core.js), else the same pinned URL. */
(function () {
  'use strict';
  var URL0 = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  var L = {}, ev = {}, code = '', me = null, lobby = null, lconn = null, roster = [], clients = {}, dead = false, retryT = 0, since = Date.now();
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
  function lobbyId() { return 'jtsites-' + code + '-telephone-0'; }
  function clean(m) {
    return { name: String(m.name || '').slice(0, 40), num: /^\d{4}$/.test(String(m.num)) ? String(m.num) : '', did: String(m.did || '').slice(0, 32), busy: !!m.busy, since: +m.since || 0 };
  }

  function start(c) {
    code = c; dead = false;
    emit('status', 'Connecting…');
    return loadPeer().then(function () {
      if (dead) return;
      me = new Peer('jtsites-' + code + '-telephone-' + rid());
      me.on('open', function () { L.id = me.id; emit('status', 'Looking for phones…'); claimLobby(); });
      me.on('call', function (call) { emit('call', call); });
      me.on('disconnected', function () { if (!dead) setTimeout(function () { try { me.reconnect(); } catch (_) { /* */ } }, 2000); });
      me.on('error', function (e) { if (e.type === 'network' || e.type === 'server-error') emit('status', 'Offline — retrying…'); else if (e.type !== 'peer-unavailable') console.warn('tp peer', e.type); });
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
  /* lobby owner side */
  function hostConn(conn) {
    conn.on('data', function (m) {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hi' && typeof m.id === 'string') { clients[m.id] = Object.assign({ conn: conn }, clean(m)); conn._tpid = m.id; broadcast(); }
      else if (m.t === 'to' && conn._tpid && clients[m.to]) { try { clients[m.to].conn.send({ t: 'sig', from: conn._tpid, msg: m.msg }); } catch (_) { /* */ } }
    });
    conn.on('close', function () { if (conn._tpid && clients[conn._tpid] && clients[conn._tpid].conn === conn) { delete clients[conn._tpid]; broadcast(); } });
  }
  function broadcast() {
    var list = Object.keys(clients).map(function (id) { var c = clients[id]; return { id: id, name: c.name, num: c.num, did: c.did, busy: c.busy, since: c.since }; });
    Object.keys(clients).forEach(function (id) { try { clients[id].conn.send({ t: 'roster', list: list }); } catch (_) { /* */ } });
  }
  /* every device */
  function joinLobby(delay) {
    clearTimeout(retryT);
    retryT = setTimeout(function () {
      if (dead) return;
      if (!me || me.disconnected) { joinLobby(2000); return; }
      var c = me.connect(lobbyId(), { reliable: true, metadata: { kind: 'telephone' } });
      var opened = false;
      var to = setTimeout(function () { if (!opened) { try { c.close(); } catch (_) { /* */ } relobby(); } }, 8000);
      c.on('open', function () { opened = true; clearTimeout(to); lconn = c; emit('status', 'Online · code ' + code); emit('online', true); hi(); });
      c.on('data', function (m) {
        if (m && m.t === 'roster' && Array.isArray(m.list)) { roster = m.list.filter(function (d) { return d.id !== me.id; }); emit('roster', roster); }
        else if (m && m.t === 'sig') emit('signal', m.msg, m.from);
      });
      c.on('close', function () { if (lconn === c) { lconn = null; roster = []; emit('roster', roster); emit('online', false); relobby(); } });
      c.on('error', function () { /* close follows */ });
    }, delay || 0);
  }
  function relobby() { if (dead) return; emit('status', 'Reconnecting…'); setTimeout(claimLobby, 300 + Math.random() * 1500); }
  function hi() {
    if (lconn && lconn.open) lconn.send({ t: 'hi', id: me.id, name: TPSave.name(), num: TPSave.get('num'), did: TPSave.get('did'), busy: !!(window.TPCall && TPCall.busy()), since: since });
  }
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
  L._emit = emit;   // test hook (checks with a simulated peer)
  L.start = start; L.stop = stop; L.on = on; L.sendTo = sendTo; L.update = hi;
  /* voice call; metadata {kind:'phone', cid, num, name} */
  L.call = function (id, stream, meta) { return me && me.call(id, stream, { metadata: Object.assign({ kind: 'phone', name: TPSave.name(), num: TPSave.get('num') }, meta || {}) }); };
  L.myId = function () { return me ? me.id : ''; };
  L.since = function () { return since; };
  L.online = function () { return !!(lconn && lconn.open); };
  L.roster = function () { return roster; };
  L.code = function () { return code; };
  window.TPPeer = L;
})();
