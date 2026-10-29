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
  - readOnly mode (Pooh Chat inside the Hub): never writes; re-reads on 'storage'.
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

  window.SharedChat = {
    KEY: KEY,
    init: function (fn) { sendFn = fn; },
    listen: listen,
    history: history,
    add: add,
    isMine: isMine,
    deviceId: myDeviceId,
    send: send,
    clear: function () { store([]); fire(null); },
    on: function (f) { fns.push(f); return f; }
  };
})();
