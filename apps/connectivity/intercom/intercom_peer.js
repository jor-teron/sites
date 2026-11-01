/* Intercom IC2 — presence + signals over PeerJS (own peers; the Hub's peer is never touched).
   Ids: me = 'jtsites-<code>-intercom-<random>' (talk calls go to this id); lobby = 'jtsites-<code>-intercom-0'.
   The first device to claim the lobby id keeps the roster; every device (lobby owner too) opens a data
   connection to the lobby and sends {t:'hi', id, name, dnd, did}; the lobby broadcasts {t:'roster', list:[{id,name,dnd,did}]}.
   (did = the device's lasting id, IC2; an IC1 device sends none.)
   Signals: {t:'all', msg} → lobby relays {t:'sig', from, msg} to every other device; {t:'to', to, msg} → one device.
   If the lobby goes away, each device waits a random 0.3–1.8 s and tries to claim it (failover).
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
  function lobbyId() { return 'jtsites-' + code + '-intercom-0'; }

  function start(c) {
    code = c; dead = false;
    emit('status', 'Connecting…');
    return loadPeer().then(function () {
      if (dead) return;
      me = new Peer('jtsites-' + code + '-intercom-' + rid());
      me.on('open', function () { L.id = me.id; emit('status', 'Looking for devices…'); claimLobby(); });
      me.on('call', function (call) { emit('call', call); });
      me.on('disconnected', function () { if (!dead) setTimeout(function () { try { me.reconnect(); } catch (_) { /* */ } }, 2000); });
      me.on('error', function (e) { if (e.type === 'network' || e.type === 'server-error') emit('status', 'Offline — retrying…'); else if (e.type !== 'peer-unavailable') console.warn('ic peer', e.type); });
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
      if (m.t === 'hi') { clients[m.id] = { conn: conn, name: String(m.name || '').slice(0, 40), dnd: !!m.dnd, did: String(m.did || '').slice(0, 32) }; conn._icid = m.id; broadcast(); }
      else if (m.t === 'all') Object.keys(clients).forEach(function (id) { if (id !== conn._icid) { try { clients[id].conn.send({ t: 'sig', from: conn._icid, msg: m.msg }); } catch (_) { /* */ } } });
      else if (m.t === 'to' && clients[m.to]) { try { clients[m.to].conn.send({ t: 'sig', from: conn._icid, msg: m.msg }); } catch (_) { /* */ } }
    });
    conn.on('close', function () { if (conn._icid && clients[conn._icid] && clients[conn._icid].conn === conn) { delete clients[conn._icid]; broadcast(); } });
  }
  function broadcast() {
    var list = Object.keys(clients).map(function (id) { return { id: id, name: clients[id].name, dnd: clients[id].dnd, did: clients[id].did }; });
    Object.keys(clients).forEach(function (id) { try { clients[id].conn.send({ t: 'roster', list: list }); } catch (_) { /* */ } });
  }
  /* every device */
  function joinLobby(delay) {
    clearTimeout(retryT);
    retryT = setTimeout(function () {
      if (dead) return;
      if (!me || me.disconnected) { joinLobby(2000); return; }
      var c = me.connect(lobbyId(), { reliable: true, metadata: { kind: 'intercom' } });
      var opened = false;
      var to = setTimeout(function () { if (!opened) { try { c.close(); } catch (_) { /* */ } relobby(); } }, 8000);
      c.on('open', function () { opened = true; clearTimeout(to); lconn = c; emit('status', 'Online · code ' + code); emit('online', true); hi(); });
      c.on('data', function (m) {
        if (m && m.t === 'roster') { roster = m.list.filter(function (d) { return d.id !== me.id; }); emit('roster', roster); }
        else if (m && m.t === 'sig') emit('signal', m.msg, m.from);
      });
      c.on('close', function () { if (lconn === c) { lconn = null; roster = []; emit('roster', roster); emit('online', false); relobby(); } });
      c.on('error', function () { /* close follows */ });
    }, delay || 0);
  }
  function relobby() { if (dead) return; emit('status', 'Reconnecting…'); setTimeout(claimLobby, 300 + Math.random() * 1500); }
  function hi() { if (lconn && lconn.open) lconn.send({ t: 'hi', id: me.id, name: ICSave.name(), dnd: !!(window.ICDnd && ICDnd.isOn()) /* IC4: !!ICSave.get('dnd') */, did: ICSave.get('did') }); }
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
  L.start = start; L.stop = stop; L.on = on; L.send = send; L.sendTo = sendTo; L.rename = hi; L.update = hi;
  /* talk call; metadata {kind:'talk', sid, name, all, did, video?, view?, cont?} (IC2 adds video/view/cont) */
  L.call = function (id, stream, meta) {
    // IC3: on the public mesh, prove trust with the token the callee gave us (callee checks it before auto-playing)
    var d = roster.filter(function (x) { return x.id === id; })[0], k = d && d.did && (ICSave.get('keys') || {})[d.did];
    var base = { name: ICSave.name(), kind: 'talk', did: ICSave.get('did') }; if (k && k.token) base.tok = k.token;
    return me && me.call(id, stream, { metadata: Object.assign(base, meta || {}) });
  };
  /* IC2: L.call = function (id, stream, meta) { return me && me.call(id, stream, { metadata: Object.assign({ name: ICSave.name(), kind: 'talk', did: ICSave.get('did') }, meta || {}) }); }; */
  L.myId = function () { return me ? me.id : ''; };
  L.online = function () { return !!(lconn && lconn.open); };
  L.roster = function () { return roster; };
  L.code = function () { return code; };
  L.open = function () { return code === ((window.SharedLink && SharedLink.LOBBY) || '00000'); };   // FC5 (was '0000'); IC3: public Hub mesh (strangers share the namespace)
  window.ICPeer = L;
})();
