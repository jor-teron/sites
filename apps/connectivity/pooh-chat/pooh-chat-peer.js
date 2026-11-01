/* Pooh Chat PC1 — own lobby peer (standalone, or a host without the Hub chat relay, e.g. /phone.html).
   Modeled on Intercom's intercom_peer.js. Ids: me = 'jtsites-<code>-pooh-<random>', lobby = 'jtsites-<code>-pooh-0'.
   The first device to claim the lobby id keeps the roster; every device (lobby owner too) connects to it.
   Wire (data channel, JSON):
     → lobby {t:'hi', id, name, did}           lobby → all {t:'roster', list:[{id, name, did}]}
     → lobby {t:'msg', m}                      lobby → every other member {t:'msg', m}
     → lobby {t:'sync', list}                  (on join: my last 50) lobby relays each as {t:'msg'} to the others
     lobby → newcomer {t:'sync', list}         (the lobby device's last 50 history, backfill)
   m = {type:'chat', id, from (device id), name, text, ts}  — same shape as SharedChat. Receivers dedupe by id.
   If the lobby goes away, each device waits 0.3–1.8 s and tries to claim it (failover). */
(function () {
  'use strict';
  var URL0 = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  var P = {}, ev = {}, code = '', me = null, lobby = null, lconn = null, roster = [], clients = {}, dead = false, retryT = 0, getHist = function () { return []; }, info = function () { return {}; };
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
  function lobbyId() { return 'jtsites-' + code + '-pooh-0'; }
  function start(c, opts) {
    code = c; dead = false; opts = opts || {};
    if (opts.history) getHist = opts.history;
    if (opts.info) info = opts.info;
    emit('status', 'Connecting…');
    return loadPeer().then(function () {
      if (dead) return;
      me = new Peer('jtsites-' + code + '-pooh-' + rid());
      me.on('open', function () { emit('status', 'Looking for the room…'); claimLobby(); });
      me.on('disconnected', function () { if (!dead) setTimeout(function () { try { me.reconnect(); } catch (_) { /* */ } }, 2000); });
      me.on('error', function (e) { if (e.type === 'network' || e.type === 'server-error') emit('status', 'Offline — retrying…'); });
    });
  }
  function claimLobby() {
    if (dead) return;
    var p = new Peer(lobbyId()), settled = false;
    p.on('open', function () { settled = true; lobby = p; clients = {}; p.on('connection', hostConn); joinLobby(); });
    p.on('error', function (e) { if (settled) return; settled = true; try { p.destroy(); } catch (_) { /* */ } joinLobby(e.type === 'unavailable-id' ? 0 : 1500); });
  }
  function relay(from, m) { Object.keys(clients).forEach(function (id) { if (id !== from) { try { clients[id].conn.send({ t: 'msg', m: m }); } catch (_) { /* */ } } }); }
  function hostConn(conn) {
    conn.on('data', function (d) {
      if (!d || typeof d !== 'object') return;
      if (d.t === 'hi') {
        var isNew = !clients[d.id];
        clients[d.id] = { conn: conn, name: String(d.name || '').slice(0, 40), did: String(d.did || '').slice(0, 64) }; conn._pid = d.id; broadcast();
        if (isNew && me && d.id !== me.id) { try { conn.send({ t: 'sync', list: PoohCore.backfill(getHist()) }); } catch (_) { /* */ } }
      } else if (d.t === 'msg' && d.m) relay(conn._pid, d.m);
      else if (d.t === 'sync' && Array.isArray(d.list)) d.list.slice(-PoohCore.BACK).forEach(function (m) { relay(conn._pid, m); });
    });
    conn.on('close', function () { if (conn._pid && clients[conn._pid] && clients[conn._pid].conn === conn) { delete clients[conn._pid]; broadcast(); } });
  }
  function broadcast() {
    var list = Object.keys(clients).map(function (id) { return { id: id, name: clients[id].name, did: clients[id].did }; });
    Object.keys(clients).forEach(function (id) { try { clients[id].conn.send({ t: 'roster', list: list }); } catch (_) { /* */ } });
  }
  function joinLobby(delay) {
    clearTimeout(retryT);
    retryT = setTimeout(function () {
      if (dead) return;
      if (!me || me.disconnected) { joinLobby(2000); return; }
      var c = me.connect(lobbyId(), { reliable: true, metadata: { kind: 'pooh-chat' } }), opened = false;
      var to = setTimeout(function () { if (!opened) { try { c.close(); } catch (_) { /* */ } relobby(); } }, 8000);
      c.on('open', function () {
        opened = true; clearTimeout(to); lconn = c; emit('status', 'Online'); emit('online', true); hi();
        if (!lobby) { try { c.send({ t: 'sync', list: PoohCore.backfill(getHist()) }); } catch (_) { /* */ } }
      });
      c.on('data', function (d) {
        if (!d) return;
        if (d.t === 'roster' && Array.isArray(d.list)) { roster = d.list; emit('roster', roster); }
        else if (d.t === 'msg' && d.m) emit('messages', [d.m]);
        else if (d.t === 'sync' && Array.isArray(d.list)) emit('messages', d.list.slice(-PoohCore.BACK));
      });
      c.on('close', function () { if (lconn === c) { lconn = null; roster = []; emit('roster', roster); emit('online', false); relobby(); } });
      c.on('error', function () { /* close follows */ });
    }, delay || 0);
  }
  function relobby() { if (dead) return; emit('status', 'Reconnecting…'); setTimeout(claimLobby, 300 + Math.random() * 1500); }
  function hi() { var i = info(); if (lconn && lconn.open) lconn.send({ t: 'hi', id: me.id, name: i.name || 'Device', did: i.did || '' }); }
  function send(m) { if (lconn && lconn.open) { lconn.send({ t: 'msg', m: m }); return true; } return false; }
  function stop() {
    dead = true; clearTimeout(retryT);
    try { lconn && lconn.close(); } catch (_) { /* */ }
    try { lobby && lobby.destroy(); } catch (_) { /* */ }
    try { me && me.destroy(); } catch (_) { /* */ }
    me = lobby = lconn = null; roster = []; clients = {};
    emit('online', false); emit('roster', roster);
  }
  addEventListener('pagehide', stop);
  P.start = start; P.stop = stop; P.on = on; P.send = send; P.rename = hi;
  P.online = function () { return !!(lconn && lconn.open); };
  P.roster = function () { return roster; };
  P.code = function () { return code; };
  window.PoohPeer = P;
})();
