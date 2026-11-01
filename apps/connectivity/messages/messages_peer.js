/* Messages MS3 — presence + direct messages over PeerJS (own peers; the Hub's peer and HubMesh are never touched;
   HubMesh public 00000 only carries the group 'chat' channel).
   Ids: me = 'jtsites-<code>-msg-<random>', lobby = 'jtsites-<code>-msg-0' (first device to claim it keeps the roster,
   Telephone TP2b pattern with failover). Each device sends {t:'hi', id, name, num}; lobby broadcasts {t:'roster', list}.
   Messages never pass the lobby: a direct DataConnection to the recipient's own peer carries {t:'msg'}, {t:'ack', id}, MS3 {t:'read', ids} and files {t:'fmeta'|'fchunk'|'fend'} (messages_files.js). */
(function () {
  'use strict';
  var URL0 = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  var L = {}, ev = {}, code = '', me = null, lobby = null, lconn = null, roster = [], clients = {}, direct = {}, dead = false, retryT = 0, info = { name: '', num: '' };
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
  function lobbyId() { return 'jtsites-' + code + '-msg-0'; }
  function start(c, who) {
    code = c; dead = false; info = who;
    emit('status', 'connecting');
    return loadPeer().then(function () {
      if (dead) return;
      me = new Peer('jtsites-' + code + '-msg-' + rid());
      me.on('open', function () { claimLobby(); });
      me.on('connection', wire);
      me.on('disconnected', function () { if (!dead) setTimeout(function () { try { me.reconnect(); } catch (_) { /* */ } }, 2000); });
      me.on('error', function (e) { if (e.type === 'network' || e.type === 'server-error') emit('status', 'connecting'); });
    });
  }
  function wire(conn) {   // a direct conversation link (either side)
    if (conn.metadata && conn.metadata.kind === 'msg-lobby') return;
    conn.on('data', function (m) { if (m && KINDS[m.t]) emit('data', m, conn); });
    conn.on('close', function () { if (direct[conn.peer] === conn) delete direct[conn.peer]; });
    conn.on('error', function () { /* close follows */ });
    direct[conn.peer] = conn;
  }
  var KINDS = { msg: 1, ack: 1, read: 1, fmeta: 1, fchunk: 1, fend: 1 };
  function claimLobby() {
    if (dead) return;
    var p = new Peer(lobbyId()), settled = false;
    p.on('open', function () { settled = true; lobby = p; clients = {}; p.on('connection', hostConn); joinLobby(); });
    p.on('error', function (e) { if (settled) return; settled = true; try { p.destroy(); } catch (_) { /* */ } joinLobby(e.type === 'unavailable-id' ? 0 : 1500); });
  }
  function hostConn(conn) {
    conn.on('data', function (m) {
      if (m && m.t === 'hi' && typeof m.id === 'string') { clients[m.id] = { conn: conn, name: String(m.name || '').slice(0, 40), num: /^[1-9]\d{4}$/.test(String(m.num)) ? String(m.num) : '' }; conn._id = m.id; bcast(); }
    });
    conn.on('close', function () { if (conn._id && clients[conn._id] && clients[conn._id].conn === conn) { delete clients[conn._id]; bcast(); } });
  }
  function bcast() {
    var list = Object.keys(clients).map(function (id) { return { id: id, name: clients[id].name, num: clients[id].num }; });
    Object.keys(clients).forEach(function (id) { try { clients[id].conn.send({ t: 'roster', list: list }); } catch (_) { /* */ } });
  }
  function joinLobby(delay) {
    clearTimeout(retryT);
    retryT = setTimeout(function () {
      if (dead) return;
      if (!me || me.disconnected) { joinLobby(2000); return; }
      var c = me.connect(lobbyId(), { reliable: true, metadata: { kind: 'msg-lobby' } }), opened = false;
      var to = setTimeout(function () { if (!opened) { try { c.close(); } catch (_) { /* */ } relobby(); } }, 8000);
      c.on('open', function () { opened = true; clearTimeout(to); lconn = c; emit('status', 'online'); hi(); });
      c.on('data', function (m) { if (m && m.t === 'roster' && Array.isArray(m.list)) { roster = m.list.filter(function (d) { return d.id !== me.id && d.num; }); emit('roster', roster); } });
      c.on('close', function () { if (lconn === c) { lconn = null; roster = []; emit('roster', roster); emit('status', 'connecting'); relobby(); } });
      c.on('error', function () { /* close follows */ });
    }, delay || 0);
  }
  function relobby() { if (!dead) setTimeout(claimLobby, 300 + Math.random() * 1500); }
  function hi() { if (lconn && lconn.open) lconn.send({ t: 'hi', id: me.id, name: info.name, num: info.num }); }
  function peerOf(num) { for (var i = 0; i < roster.length; i++) if (roster[i].num === num) return roster[i].id; return ''; }
  /* resolves true when handed to an open direct link, false when the number isn't online / link fails */
  /* MS3: resolves an open direct DataConnection to that number, or null */
  function link(num) {
    var id = peerOf(num);
    if (!id || !me) return Promise.resolve(null);
    var c = direct[id];
    if (c && c.open) return Promise.resolve(c);
    return new Promise(function (res) {
      var k = me.connect(id, { reliable: true, metadata: { kind: 'msg' } }), t = setTimeout(function () { try { k.close(); } catch (_) { /* */ } res(null); }, 8000);
      wire(k);
      k.on('open', function () { clearTimeout(t); res(k); });
      k.on('error', function () { clearTimeout(t); res(null); });
    });
  }
  function send(num, m) { return link(num).then(function (c) { if (!c) return false; try { c.send(m); return true; } catch (_) { return false; } }); }
  function numOf(peer) { for (var i = 0; i < roster.length; i++) if (roster[i].id === peer) return roster[i].num; return ''; }
  function stop() {
    dead = true; clearTimeout(retryT);
    Object.keys(direct).forEach(function (k) { try { direct[k].close(); } catch (_) { /* */ } });
    try { lconn && lconn.close(); } catch (_) { /* */ }
    try { lobby && lobby.destroy(); } catch (_) { /* */ }
    try { me && me.destroy(); } catch (_) { /* */ }
    me = lobby = lconn = null; roster = []; clients = {}; direct = {};
    emit('status', 'offline');
  }
  addEventListener('pagehide', stop);
  L.start = start; L.stop = stop; L.on = on; L.send = send; L.update = function (w) { info = w; hi(); };
  L.roster = function () { return roster; }; L.peerOf = peerOf; L.link = link; L.numOf = numOf; L.code = function () { return code; };
  L.online = function () { return !!(lconn && lconn.open); };
  L._emit = emit; L._setRoster = function (r) { roster = r; };   // test hooks
  window.MSPeer = L;
})();
