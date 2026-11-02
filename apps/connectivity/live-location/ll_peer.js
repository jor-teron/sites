/* Live Location LL1 — copied from shared-clipboard/clipboard_peer.js (CB pattern). presence + data relay over PeerJS data connections only (no media; the Hub's peer is never touched).
   Ids: me = 'jtsites-<code>-ll-<random>'; lobby = 'jtsites-<code>-ll-0' (same pattern as Video Chat VC1).
   The first device to claim the lobby id keeps the roster; every device (lobby owner too) opens a data
   connection to the lobby and sends {t:'hi', id, name}; the lobby broadcasts {t:'roster', list}.
   Clipboard messages: {t:'all', msg} → lobby relays {t:'sig', from, msg} to every other device;
   {t:'to', to, msg} → one device. When a NEW device says hi, the lobby sends it the 10 most recent shared items
   ({k:'recent'} from the lobby page's own history, via CBPeer.provide). If the lobby goes away, each
   device waits a random 0.3–1.8 s and tries to claim it; its history is what late joiners get.
   CB2: file pieces ({k:'fmeta'|'fchunk'|'fcancel'}) ride the same {t:'all'|'to'} relay unchanged; old lobbies relay them too.
   PeerJS: SharedLink.PEERJS_URL (link_core.js) when present, else the same pinned URL. */
(function () {
  'use strict';
  var URL0 = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  var L = {}, ev = {}, code = '', me = null, lobby = null, lconn = null, roster = [], clients = {}, dead = false, retryT = 0, provider = null;
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
  function lobbyId() { return 'jtsites-' + code + '-ll-0'; }

  function start(c) {
    code = c; dead = false;
    emit('status', 'Connecting…');
    return loadPeer().then(function () {
      if (dead) return;
      me = new Peer('jtsites-' + code + '-ll-' + rid());
      me.on('open', function () { L.id = me.id; emit('me', me.id); emit('status', 'Looking for devices…'); claimLobby(); });
      me.on('disconnected', function () { if (!dead) setTimeout(function () { try { me.reconnect(); } catch (_) { /* */ } }, 2000); });
      me.on('error', function (e) { if (e.type === 'network' || e.type === 'server-error') emit('status', 'Offline — retrying…'); else if (e.type !== 'peer-unavailable') console.warn('ll peer', e.type); });
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
      if (m.t === 'hi') {
        var isNew = !clients[m.id] || clients[m.id].conn !== conn;
        clients[m.id] = { conn: conn, name: String(m.name || '').slice(0, 40) }; conn._cbid = m.id; broadcast();
        if (isNew && me && m.id !== me.id && provider) { try { conn.send({ t: 'sig', from: me.id, msg: provider() }); } catch (_) { /* */ } }
      } else if (m.t === 'all') {
        Object.keys(clients).forEach(function (id) { if (id !== conn._cbid) { try { clients[id].conn.send({ t: 'sig', from: conn._cbid, msg: m.msg }); } catch (_) { /* */ } } });
      } else if (m.t === 'to' && clients[m.to]) clients[m.to].conn.send({ t: 'sig', from: conn._cbid, msg: m.msg });
    });
    conn.on('close', function () { if (conn._cbid && clients[conn._cbid] && clients[conn._cbid].conn === conn) { delete clients[conn._cbid]; broadcast(); } });
  }
  function broadcast() {
    var list = Object.keys(clients).map(function (id) { return { id: id, name: clients[id].name }; });
    Object.keys(clients).forEach(function (id) { try { clients[id].conn.send({ t: 'roster', list: list }); } catch (_) { /* */ } });
  }
  /* every device */
  function joinLobby(delay) {
    clearTimeout(retryT);
    retryT = setTimeout(function () {
      if (dead) return;
      if (!me || me.disconnected) { joinLobby(2000); return; }
      var c = me.connect(lobbyId(), { reliable: true, metadata: { kind: 'll' } });
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
  function hi() { if (lconn && lconn.open) lconn.send({ t: 'hi', id: me.id, name: LLStore.name() }); }
  function send(msg) { if (lconn && lconn.open) { lconn.send({ t: 'all', msg: msg }); return true; } return false; }
  function sendTo(to, msg) { if (lconn && lconn.open) lconn.send({ t: 'to', to: to, msg: msg }); }
  function stop() {
    dead = true; clearTimeout(retryT);
    try { lconn && lconn.close(); } catch (_) { /* */ }
    try { lobby && lobby.destroy(); } catch (_) { /* */ }
    try { me && me.destroy(); } catch (_) { /* */ }
    me = lobby = lconn = null; roster = []; clients = {};
    emit('online', false);
  }
  addEventListener('pagehide', stop);
  L._emit = emit;   // test hooks (quick checks with a simulated peer)
  L._provided = function () { return provider ? provider() : null; };
  L.start = start; L.stop = stop; L.on = on; L.send = send; L.sendTo = sendTo; L.rename = hi;
  L.provide = function (f) { provider = f; };
  /* CB2: bytes still queued on our data channel to the lobby (file sends pace on this) */
  L.buffered = function () { try { return (lconn && lconn.dataChannel && lconn.dataChannel.bufferedAmount) || 0; } catch (_) { return 0; } };
  L.online = function () { return !!(lconn && lconn.open); };
  L.isLobby = function () { return !!lobby; };
  L.roster = function () { return roster; };
  L.code = function () { return code; };
  window.LLPeer = L;
})();
