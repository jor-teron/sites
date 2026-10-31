/* Screen Share SS1 — presence over PeerJS (own peers; the Hub's peer is never touched).
   Ids: me = 'jtsites-<code>-ss-<random>' (calls go to this id); lobby = 'jtsites-<code>-ss-0'.
   The first device to claim the lobby id keeps the roster; every device (lobby owner too)
   opens a data connection to the lobby and sends {t:'hi', id, name, share}; the lobby broadcasts
   {t:'roster', list:[{id, name, share}]} where share = null | {on:true, paused, audio}.
   (Same lobby/roster pattern as Video Chat VC1, with '-ss-' ids so the two apps never mix.) Signals between devices go {t:'to', to, msg} through the lobby.
   If the lobby goes away, each device waits a random 0.3–1.8 s and tries to claim it.
   SS2: hi/roster also carry did (the device's lasting id).
   PeerJS: SharedLink.PEERJS_URL (link_core.js) when present, else the same pinned URL. */
(function () {
  'use strict';
  var URL0 = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  var L = {}, ev = {}, code = '', me = null, lobby = null, lconn = null, roster = [], clients = {}, dead = false, retryT = 0;
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
  function lobbyId() { return 'jtsites-' + code + '-ss-0'; }

  function start(c) {
    code = c; dead = false;
    emit('status', 'Connecting…');
    return loadPeer().then(function () {
      me = new Peer('jtsites-' + code + '-ss-' + rid());
      me.on('open', function () { emit('status', 'Looking for devices…'); claimLobby(); });
      me.on('call', function (call) { emit('call', call); });
      me.on('disconnected', function () { if (!dead) setTimeout(function () { try { me.reconnect(); } catch (_) { /* */ } }, 2000); });
      me.on('error', function (e) { if (e.type === 'network' || e.type === 'server-error') emit('status', 'Offline — retrying…'); else if (e.type !== 'peer-unavailable') console.warn('ss peer', e.type); });
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
      if (m.t === 'hi') { clients[m.id] = { conn: conn, name: String(m.name || '').slice(0, 40), share: cleanShare(m.share), did: String(m.did || '').slice(0, 32) }; conn._ssid = m.id; broadcast(); }
      else if (m.t === 'to' && clients[m.to]) clients[m.to].conn.send({ t: 'sig', from: conn._ssid, msg: m.msg });
    });
    conn.on('close', function () { if (conn._ssid && clients[conn._ssid] && clients[conn._ssid].conn === conn) { delete clients[conn._ssid]; broadcast(); } });
  }
  function cleanShare(x) { return x && x.on ? { on: true, paused: !!x.paused, audio: !!x.audio } : null; }
  function broadcast() {
    var list = Object.keys(clients).map(function (id) { return { id: id, name: clients[id].name, share: clients[id].share, did: clients[id].did }; });
    Object.keys(clients).forEach(function (id) { try { clients[id].conn.send({ t: 'roster', list: list }); } catch (_) { /* */ } });
  }
  /* every device */
  function joinLobby(delay) {
    clearTimeout(retryT);
    retryT = setTimeout(function () {
      if (dead) return;
      if (!me || me.disconnected) { joinLobby(2000); return; }
      var c = me.connect(lobbyId(), { reliable: true, metadata: { kind: 'ss' } });
      var opened = false;
      var to = setTimeout(function () { if (!opened) { try { c.close(); } catch (_) { /* */ } relobby(); } }, 8000);
      c.on('open', function () { opened = true; clearTimeout(to); lconn = c; emit('status', 'Online · code ' + code); hi(); });
      c.on('data', function (m) {
        if (m && m.t === 'roster') { roster = m.list.filter(function (d) { return d.id !== me.id; }); emit('roster', roster); }
        else if (m && m.t === 'sig') emit('signal', m.msg, m.from);
      });
      c.on('close', function () { if (lconn === c) { lconn = null; roster = []; emit('roster', roster); relobby(); } });
      c.on('error', function () { /* close follows */ });
    }, delay || 0);
  }
  function relobby() { if (dead) return; emit('status', 'Reconnecting…'); setTimeout(claimLobby, 300 + Math.random() * 1500); }
  var myShare = null;
  function hi() { if (lconn && lconn.open) lconn.send({ t: 'hi', id: me.id, name: SSStore.name(), share: myShare, did: SSStore.get('did') }); }   // SS2: + did
  L.setShare = function (x) { myShare = x ? { on: true, paused: !!x.paused, audio: !!x.audio } : null; hi(); };
  function signal(to, msg) { if (lconn && lconn.open) lconn.send({ t: 'to', to: to, msg: msg }); }
  function stop() {
    dead = true; clearTimeout(retryT);
    try { lconn && lconn.close(); } catch (_) { /* */ }
    try { lobby && lobby.destroy(); } catch (_) { /* */ }
    try { me && me.destroy(); } catch (_) { /* */ }
    me = lobby = lconn = null; roster = [];
  }
  addEventListener('pagehide', stop);
  L._emit = emit;   // test hook (quick checks)
  L.start = start; L.stop = stop; L.on = on; L.signal = signal; L.rename = hi;
  L.call = function (id, stream) { return me && me.call(id, stream, { metadata: { name: SSStore.name(), kind: 'ss' } }); };
  L.id = function () { return me && me.id; };
  L.roster = function () { return roster; };
  L.code = function () { return code; };
  L.open = function () { return code === '0000'; };   // SS2: public Hub mesh (strangers share the namespace)
  window.SSPeer = L;
})();
