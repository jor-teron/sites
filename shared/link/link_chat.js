/*
  Project: sites (shared)
  File: shared/link/link_chat.js
  Role: SharedChat (release 4). Group chat over SharedLink, history per device.
  - Message: {type:'chat', id, from (device id), name (device name), text, ts}.
  - History: localStorage 'shared-chat-history' (last 200), survives reload.
    H19: from = SharedLinkDevices.id() (permanent per browser). No mine flag is stored;
    isMine(m) is m.from === this device id. Legacy rows (from not 'd-…') count as mine only
    if an old build stored them here with mine:true, else they show as received.
    H50a: device ids are now 'hub-xxxxxxxx-xxx' (old 'd-…' ids are converted once, link_devices.js).
    isMine(m) uses SharedLinkDevices.isMe(m.from): the current id OR this device's old id, so messages
    sent before the conversion still show as "You". Both id formats count as device ids.
  - init(sendFn): sendFn(msg) puts a message on the wire. Host (Hub) sends to all;
    a joined device sends with bcast:true so the Hub re-broadcasts it.
  - add(msg) stores an incoming message (dedupe by id) and fires on('add').
  - H84: rows may carry room (the mesh code it was sent in). One history for every room (not split).
    send() takes an optional room from window.HubMesh.room(); dedupe by id drops a copy that arrives twice
    (mesh relay + direct, or mesh + old SharedLink).
  - readOnly mode (Pooh Chat inside the Hub): never writes; re-reads on 'storage'.
  - H89 chat catch-up: meshSync(HubMesh) (called once by the page that owns the mesh, hub_chat.js) asks for recent
    chat over HubMesh channel 'chat-sync' when this device joins / rejoins a room: a member asks the lobby, the lobby
    asks each new device; the other side answers with its last 50 rows of that room (<= ~96 KB, signed like every
    H51 envelope). Answers are taken only from a device we asked in the last 30 s, for the current room; merged
    by id (addMany: no duplicates, history kept in ts order, one quiet repaint fire(null), so nothing counts as
    unread or makes a notice). One answer per asking device per 5 s.
*/
(function () {
  'use strict';
  var KEY = 'shared-chat-history';
  var MAX = 200;
  var fns = [];
  var sendFn = null;

  function history() { try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (_) { return []; } }
  function store(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch (_) { /* full */ } }
  function fire(m) { fns.forEach(function (f) { try { f(m); } catch (e) { console.warn('SharedChat', e); } }); }

  function add(m) {
    if (!m || m.type !== 'chat' || !m.text) return false;
    var list = history();
    if (list.some(function (x) { return x.id === m.id; })) return false;
    var row = { type: 'chat', id: String(m.id || Date.now()), from: String(m.from || ''), name: String(m.name || 'Device').slice(0, 40), text: String(m.text).slice(0, 2000), ts: Number(m.ts) || Date.now() };
    if (m.room) row.room = String(m.room).slice(0, 12);   // H84: mesh room tag (00000 / private code), display only
    list.push(row);
    store(list);
    fire(row);
    return true;
  }

  function myDeviceId() { return window.SharedLinkDevices && SharedLinkDevices.id ? SharedLinkDevices.id() : 'd-local'; }
  // function isDev(f) { return /^d-/.test(String(f || '')); }   // (before H50a)
  function isDev(f) { return /^(d|hub)-/.test(String(f || '')); }   // H50a: old 'd-…' and new 'hub-…' ids
  function isMine(m) {
    if (!m) return false;
    // if (isDev(m.from)) return m.from === myDeviceId();   // (before H50a)
    if (isDev(m.from)) {
      var D = window.SharedLinkDevices;
      return D && D.isMe ? D.isMe(m.from) : m.from === myDeviceId();   // H50a: current or old id of this device
    }
    return !!m.mine;   // legacy row (before H19): only what this browser stored as its own
  }

  function send(text) {
    text = String(text || '').trim();
    if (!text || !sendFn) return null;
    var myId = myDeviceId();
    var m = { type: 'chat', id: myId + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), from: myId,
      name: window.SharedLinkDevices ? SharedLinkDevices.name() : 'Device', text: text.slice(0, 2000), ts: Date.now() };
    var room = window.HubMesh && HubMesh.room ? HubMesh.room() : '';   // H84
    if (room) m.room = room;
    add(m);
    try { sendFn(m); } catch (e) { console.warn('SharedChat send', e); }
    return m;
  }

  /* Listen for incoming chat on SharedLink (call once per page that owns a link). */
  function listen() {
    if (!window.SharedLink) return;
    SharedLink.on('message', function (m, from) { if (m && m.type === 'chat') add(Object.assign({}, m, { from: m.from || from })); });
  }

  window.addEventListener('storage', function (e) { if (e.key === KEY) fire(null); });   // other tab / Hub wrote

  /* H89: merge rows from a catch-up answer: dedupe by id, keep ts order, quiet (fire(null) once) */
  function clean(m) {
    var row = { type: 'chat', id: String(m.id).slice(0, 80), from: String(m.from || '').slice(0, 40), name: String(m.name || 'Device').slice(0, 40), text: String(m.text).slice(0, 2000), ts: Number(m.ts) || 0 };
    if (m.room) row.room = String(m.room).slice(0, 12);
    return row;
  }
  function addMany(rows) {
    if (!Array.isArray(rows) || !rows.length) return 0;
    var list = history(), ids = new Set(list.map(function (x) { return x.id; })), n = 0;
    rows.forEach(function (m) { if (m && m.type === 'chat' && m.text && m.id && !ids.has(String(m.id))) { ids.add(String(m.id)); list.push(clean(m)); n++; } });
    if (!n) return 0;
    list.sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    store(list);
    fire(null);
    return n;
  }
  var SYNC_ROWS = 50, SYNC_BYTES = 96 * 1024, ASK_MS = 30000, ANSWER_GAP_MS = 5000;
  function recent(room) {
    var rows = history().filter(function (m) { return m && m.room === room && m.text && m.id; }).slice(-SYNC_ROWS).map(clean);
    while (rows.length && JSON.stringify(rows).length > SYNC_BYTES) rows.shift();   // cap: drop the oldest
    return rows;
  }
  var synced = false;
  function meshSync(M) {
    if (synced || !M || !M.channel || !M.on) return false;
    var ch;
    try { ch = M.channel('chat-sync'); } catch (_) { return false; }
    synced = true;
    var asked = new Map(), answered = new Map(), seenPeers = new Set(), room = '';
    function ask(dev) {
      var r = M.room ? M.room() : '';
      if (!r || !dev) return;
      asked.set(dev, Date.now());
      ch.send(dev, { k: 'req', room: r });
    }
    function check() {
      var me = M.me && M.me();
      var r = M.room ? M.room() : '';
      if (!me || !r) return;
      if (r !== room) { room = r; seenPeers.clear(); asked.clear(); }
      var linked = M.linked ? M.linked() : false;
      if (!linked) return;
      var lobby = M.lobbyId ? M.lobbyId() : '';
      (M.peers() || []).forEach(function (p) {
        if (seenPeers.has(p.deviceId)) return;
        seenPeers.add(p.deviceId);
        // a member asks the lobby; the lobby asks every device that comes in (it may have missed chat itself)
        if (me.lobby || p.deviceId === lobby) ask(p.deviceId);
      });
      (M.peers() || []).length || seenPeers.clear();
    }
    ch.on(function (d, from) {
      if (!d || typeof d !== 'object') return;
      var r = M.room ? M.room() : '';
      if (d.room !== r) return;
      if (d.k === 'req') {
        var last = answered.get(from) || 0;
        if (Date.now() - last < ANSWER_GAP_MS) return;
        answered.set(from, Date.now());
        var rows = recent(r);
        if (rows.length) ch.send(from, { k: 'rows', room: r, rows: rows });
      } else if (d.k === 'rows') {
        var at = asked.get(from) || 0;
        if (!at || Date.now() - at > ASK_MS) return;   // unasked dumps are ignored
        asked.delete(from);
        addMany(d.rows.map(function (m) { return Object.assign({}, m, { room: r }); }));
      }
    });
    ['peers', 'lobby', 'status'].forEach(function (ev) { M.on(ev, function () { setTimeout(check, 0); }); });
    setTimeout(check, 0);
    return true;
  }

  window.SharedChat = {
    KEY: KEY,
    init: function (fn) { sendFn = fn; },
    listen: listen,
    history: history,
    add: add,
    isMine: isMine,
    deviceId: myDeviceId,
    send: send,
    addMany: addMany, meshSync: meshSync,   // H89
    clear: function () { store([]); fire(null); },
    on: function (f) { fns.push(f); return f; }
  };
})();
