/*
  Pooh Chat — boot (pooh-chat.js, PC1 + PC2). The group lobby chat.
  - Room code (PC1, like FC5 apps): #code= / ?hub= (5 digits only; 4-digit codes are rejected), else the Hub's
    private mesh (parent.HubMeshLink.isPrivate()/privateCode()), else SharedLink.LOBBY (self/parent/top), else '00000'.
  - Relay mode: the parent runs the Hub chat (parent.SharedChat.send exists, same-origin — checked once at boot,
    PoohCore.hasRelay). Protocol unchanged from release 4: post {sharedLink:'ready'}, send {sharedLink:'chat', text},
    repaint from 'shared-chat-history' (the Hub writes it; storage event / 'message'). No own peer (no duplicates).
    After Hub Main Bot's H84 the Hub carries that chat over HubMesh (00000 lobby / private mesh room).
  - Own-peer mode (standalone, or a host without the relay such as /phone.html): PoohPeer lobby
    'jtsites-<code>-pooh-0'; history in localStorage 'pooh-chat-history-<code>' (last 200, dedupe by id); backfill
    of the last 50 on join. In a host, the Hub's private mesh is re-checked every 5 s and followed automatically
    (unless the code came from the URL or was picked in Settings); while typing, a "Switch to / Back to Public"
    button in the top bar offers it instead.
  - 🟢: share typed text (or the last message) to WhatsApp; long-press / Shift+click → share files. ↗ per message.
  Legacy release-4 boot kept as comments at the end of this file (4-digit Join dialog / Scan QR, SharedLink.join).
*/
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var inHost = window.parent && window.parent !== window;
  var relay = PoohCore.hasRelay(window);
  var hubLinked = false, code = '', fixed = false, manual = false, offer = '', members = [];
  var input = $('input'), form = $('composer'), btnWa = $('btn-wa'), fileShare = $('file-share');
  var PUB = PoohCore.lobbyOf([window, safe(function () { return window.parent; }), safe(function () { return window.top; })]);
  function safe(f) { try { return f(); } catch (_) { return null; } }
  function myName() { return window.SharedLinkDevices ? SharedLinkDevices.name() : 'Device'; }
  function myId() { return SharedChat.deviceId(); }
  function isMine(m) { return SharedChat.isMine(m); }

  /* ---------- own history (own-peer mode only; never touches shared-chat-history) ---------- */
  function key() { return 'pooh-chat-history-' + code; }
  function hist() { if (relay) return SharedChat.history(); try { return JSON.parse(localStorage.getItem(key()) || '[]') || []; } catch (_) { return []; } }
  function addMsgs(msgs) {
    var r = PoohCore.merge(hist(), msgs);
    if (r.added.length) { try { localStorage.setItem(key(), JSON.stringify(r.list)); } catch (_) { /* full */ } paint(); }
    return r.added;
  }
  function paint() { PoohUI.render(hist(), isMine); }
  function roomLabel() { return code === PUB ? 'Public' : 'Private room'; }
  function paintRoom() { PoohUI.room(relay ? (PoohCore.meshCode(safe(function () { return window.parent; })) ? 'Private room' : 'Public') : roomLabel(), members.length); }
  PoohUI.name(myName());

  /* ---------- relay mode (inside the Hub) ---------- */
  function bootRelay() {
    SharedChat.on(paint);
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (e.source !== window.parent || !d || typeof d !== 'object') return;
      if (d.sharedLink === 'hello' || d.sharedLink === 'devices') {
        hubLinked = true;
        members = (d.devices || []).filter(function (x) { return x.online; }).map(function (x) { return x.name || 'Device'; });
        PoohUI.status('Hub · online'); paintRoom();
      } else if (d.sharedLink === 'message') setTimeout(paint, 30);
    });
    window.parent.postMessage({ sharedLink: 'ready', app: 'pooh-chat', types: ['x-none/'] }, '*');
    PoohUI.status('Connecting to Hub…'); paintRoom(); paint();
  }

  /* ---------- own-peer mode ---------- */
  function desired() { return PoohCore.pickCode({ hash: location.hash, search: location.search, parent: inHost ? safe(function () { return window.parent; }) : null, wins: [window, safe(function () { return window.parent; }), safe(function () { return window.top; })] }); }
  function go(c) {
    if (c === code && PoohPeer.code() === c) return;
    PoohPeer.stop();
    code = c; offer = ''; members = []; paintSwitch(); paintRoom(); paint();
    PoohPeer.start(c, { history: hist, info: function () { return { name: myName(), did: myId() }; } })
      .catch(function () { PoohUI.status('PeerJS could not load (offline?)'); PoohUI.notify({ icon: '⚠️', text: 'Could not connect (offline?)' }); });
  }
  function paintSwitch() {
    var el = $('pc-switch'); el.hidden = !offer || offer === code;
    el.textContent = offer === PUB ? 'Back to Public' : 'Switch to ' + offer;
  }
  function checkMesh() {
    if (relay || fixed || manual || !inHost) return;
    var d = desired(); if (d === code) { offer = ''; paintSwitch(); return; }
    if (document.activeElement === input && input.value.trim()) { offer = d; paintSwitch(); return; }   // typing: offer, don't yank
    go(d); PoohUI.notify({ icon: '🐻', text: d === PUB ? 'Back to the Public room' : 'Moved to the private room' });
  }
  function bootPeer() {
    PoohPeer.on('status', function (t) { PoohUI.status(t); });
    PoohPeer.on('online', function (on) { if (!on) PoohUI.status('Reconnecting…'); });
    PoohPeer.on('roster', function (list) { members = list.map(function (x) { return x.name || 'Device'; }); paintRoom(); });
    PoohPeer.on('messages', function (msgs) { addMsgs(msgs); });
    fixed = !!PoohCore.urlCode(location.hash, location.search);
    go(desired());
    setInterval(checkMesh, +window.__pcMeshMs || 5000);
  }
  $('pc-switch').addEventListener('click', function () { var d = offer; offer = ''; if (d) { manual = false; go(d); } });

  /* ---------- top bar: who's here / settings ---------- */
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  $('btn-room').addEventListener('click', function () {
    var ul = el('ul', 'members');
    if (!members.length) ul.appendChild(el('li', 'muted', 'Nobody else here yet.'));
    members.forEach(function (n) { ul.appendChild(el('li', '', n)); });
    PoohUI.sheet((relay ? 'Hub devices' : roomLabel()) + ' · ' + members.length, [ul]);
  });
  function setRow(label, value, btn, fn) {
    var r = el('div', 'row'), l = el('div', 'grow'); l.appendChild(el('b', '', label)); l.appendChild(el('div', 'muted', value));
    r.appendChild(l); if (btn) { var b = el('button', 'mini', btn); b.type = 'button'; b.addEventListener('click', fn); r.appendChild(b); }
    return r;
  }
  async function rename() {
    if (!window.SharedLinkDevices || !window.UiDialog) return;
    var n = await UiDialog.ask('Name for this device:', SharedLinkDevices.name(), 'Save');
    if (n) { SharedLinkDevices.setName(n); PoohUI.name(myName()); if (!relay) PoohPeer.rename(); openSettings(); }
  }
  async function changeCode() {
    if (!window.UiDialog) return;
    var v = await UiDialog.ask('5-digit Hub code (' + PUB + ' = Public):', code || PUB, 'Join');
    if (v == null) return;
    var c = PoohCore.c5(String(v).trim());
    if (!c) { PoohUI.notify({ icon: '⚠️', text: 'Enter a 5-digit code' }); return; }
    manual = true; PoohUI.closeSheet(); go(c);
  }
  function openSettings() {
    var rows = [setRow('This device', myName(), 'Rename', rename)];
    if (relay) rows.push(setRow('Hub code', 'Uses the Hub\u2019s chat (' + (PoohCore.meshCode(safe(function () { return window.parent; })) ? 'private room' : 'Public') + ')', null));
    else rows.push(setRow('Hub code', code === PUB ? PUB + ' · Public' : code + ' · Private room', 'Change', changeCode));
    rows.push(el('p', 'muted small', 'Everyone on Public ' + PUB + ' shares one room. Pooh Chat · PC2'));
    PoohUI.sheet('Settings', rows);
  }
  $('btn-set').addEventListener('click', openSettings);

  /* ---------- composer ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = input.value.trim();
    if (!t) return;
    if (relay) {
      if (!hubLinked) { PoohUI.notify({ icon: '⚠️', text: 'Hub not ready — not sent' }); return; }
      window.parent.postMessage({ sharedLink: 'chat', text: t }, '*');
      setTimeout(paint, 30);
    } else {
      var id = myId();
      var m = { type: 'chat', id: id + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), from: id, name: myName(), text: t.slice(0, 2000), ts: Date.now() };
      addMsgs([m]);
      if (!PoohPeer.send(m)) PoohUI.notify({ icon: '⚠️', text: 'Not connected — saved here only' });
    }
    input.value = '';
    input.focus();
  });

  /* 🟢 tap: WhatsApp text. Long press (or Shift+click): pick files and share them. */
  var pressT = 0, longDone = false;
  btnWa.addEventListener('pointerdown', function () { longDone = false; pressT = setTimeout(function () { longDone = true; fileShare.click(); }, 600); });
  ['pointerup', 'pointerleave'].forEach(function (ev) { btnWa.addEventListener(ev, function () { clearTimeout(pressT); }); });
  btnWa.addEventListener('click', function (e) {
    if (longDone) return;
    if (e.shiftKey) { fileShare.click(); return; }
    var t = input.value.trim();
    if (!t) { var h = hist(); t = h.length ? h[h.length - 1].text : ''; }
    if (t) ShareWA.text(t); else PoohUI.notify({ icon: '🟢', text: 'Nothing to share yet' });
  });
  fileShare.addEventListener('change', function () {
    var n = fileShare.files.length;
    ShareWA.files(fileShare.files).then(function (r) {
      if (r === 'downloaded') PoohUI.notify({ icon: '⬇️', text: n + ' file' + (n === 1 ? '' : 's') + ' downloaded' });
      else if (r === 'shared') PoohUI.notify({ icon: '🟢', text: n + ' file' + (n === 1 ? '' : 's') + ' shared' });
    });
    fileShare.value = '';
  });

  if (relay) bootRelay(); else bootPeer();
})();

/* ===== Legacy: release-4 pooh-chat.js (removed in PC1), kept for reference ===== */
// /*
//   Pooh Chat — boot (pooh-chat.js, release 4). Group chat over the one Hub link.
//   - Inside the Hub (iframe): posts {sharedLink:'ready', app:'pooh-chat'}; sends with
//     {sharedLink:'chat', text}; the Hub owns SharedChat history and this page re-reads it
//     (storage event). No own peer.
//   - Standalone (phone): SharedLink.join('jtsites-' + Hub code). Code from #code= / ?hub=,
//     else the saved code if it ever connected, else the Join dialog (code + Scan QR).
//     Sends {type:'chat', …, bcast:true}; the Hub re-broadcasts to every device.
//   - 🟢: share the typed text (or the last message) to WhatsApp; long-press → share files.
//   - H32: short notices (Hub not ready, renamed, nothing to share, files shared, Hub
//     disconnected) go through PoohUI.notify → Hub notification card, own toast standalone.
// */
// (function () {
//   'use strict';
//   var inHub = window.parent && window.parent !== window;
//   var hubLinked = false;
//   var input = document.getElementById('input');
//   var form = document.getElementById('composer');
//   var btnJoin = document.getElementById('btn-join');
//   var btnName = document.getElementById('btn-name');
//   var btnWa = document.getElementById('btn-wa');
//   var fileShare = document.getElementById('file-share');
// 
//   function isMine(m) { return SharedChat.isMine(m); }   // H19: sender device id only
//   function paint() { PoohUI.render(SharedChat.history(), isMine); }
//   SharedChat.on(paint);
// 
//   /* ---------- inside the Hub ---------- */
//   function bootHub() {
//     window.addEventListener('message', function (e) {
//       var d = e.data;
//       if (e.source !== window.parent || !d || typeof d !== 'object') return;
//       if (d.sharedLink === 'hello' || d.sharedLink === 'devices') {
//         hubLinked = true;
//         var n = (d.devices || []).filter(function (x) { return x.online; }).length;
//         PoohUI.status('Hub · ' + n + ' device' + (n === 1 ? '' : 's'), true);
//       } else if (d.sharedLink === 'message') {
//         setTimeout(paint, 30);   // the Hub stored it; repaint (storage event may lag)
//       }
//     });
//     window.parent.postMessage({ sharedLink: 'ready', app: 'pooh-chat', types: ['x-none/'] }, '*');
//     PoohUI.status('Connecting to Hub…', false);
//   }
// 
//   /* ---------- standalone ---------- */
//   function urlCode() {
//     var s = location.hash + '&' + location.search;
//     return window.SharedLinkScan ? SharedLinkScan.parse(s) : '';
//   }
//   function joinCode(code) {
//     btnJoin.hidden = true;
//     SharedLink.join({ prefix: 'jtsites-', code: code }).catch(function () { PoohUI.status('PeerJS could not load (offline?)', false); });
//   }
//   function askJoin() {
//     SharedLinkScan.ask({ title: 'Join the Hub chat' }).then(function (c) { if (c) joinCode(c); else btnJoin.hidden = false; });
//   }
//   function bootStandalone() {
//     SharedChat.init(function (m) { SharedLink.send(Object.assign({ bcast: true }, m)); });
//     SharedChat.listen();
//     SharedLink.on('status', function (text, state) {
//       if (!SharedLink.connected) PoohUI.status(text, false);
//       if (state === 'notfound') btnJoin.hidden = false;
//     });
//     SharedLink.on('open', function () { PoohUI.status('Connected · ' + SharedLink.code, true); });
//     SharedLink.on('close', function () { PoohUI.status('Reconnecting…', false); });
//     SharedLink.on('bye', function () { PoohUI.status('Hub disconnected', false); btnJoin.hidden = false; PoohUI.notify({ icon: '🔌', title: 'Pooh Chat', text: 'Hub disconnected' }); });
//     btnJoin.addEventListener('click', askJoin);
//     var saved = '';
//     try { saved = localStorage.getItem('shared-link-join-code') || ''; } catch (_) { /* blocked */ }
//     var code = urlCode() || (saved && SharedLink.everConnected(saved) ? saved : '');
//     if (code) joinCode(code);
//     else { PoohUI.status('Not connected', false); btnJoin.hidden = false; askJoin(); }
//   }
// 
//   /* ---------- composer ---------- */
//   form.addEventListener('submit', function (e) {
//     e.preventDefault();
//     var t = input.value.trim();
//     if (!t) return;
//     if (inHub) {
//       if (!hubLinked) { PoohUI.status('Hub not ready', false); PoohUI.notify({ icon: '⚠️', title: 'Pooh Chat', text: 'Hub not ready — message not sent' }); return; }
//       window.parent.postMessage({ sharedLink: 'chat', text: t }, '*');
//       setTimeout(paint, 30);
//     } else {
//       SharedChat.send(t);
//     }
//     input.value = '';
//     input.focus();
//   });
// 
//   btnName.addEventListener('click', async function () {
//     if (!window.SharedLinkDevices) return;
//     /* UD1: Hub dialog instead of native prompt
//     var n = window.prompt('Name for this device:', SharedLinkDevices.name()); */
//     var n = window.UiDialog ? await UiDialog.ask('Name for this device:', SharedLinkDevices.name(), 'Save')
//                             : window.prompt('Name for this device:', SharedLinkDevices.name());
//     if (n) { SharedLinkDevices.setName(n); PoohUI.notify({ icon: '✏️', title: 'Pooh Chat', text: 'This device is now “' + SharedLinkDevices.name() + '”' }); }
//   });
// 
//   /* 🟢 tap: WhatsApp text. Long press (or Shift+click): pick files and share them. */
//   var pressT = 0, longDone = false;
//   btnWa.addEventListener('pointerdown', function () { longDone = false; pressT = setTimeout(function () { longDone = true; fileShare.click(); }, 600); });
//   ['pointerup', 'pointerleave'].forEach(function (ev) { btnWa.addEventListener(ev, function () { clearTimeout(pressT); }); });
//   btnWa.addEventListener('click', function (e) {
//     if (longDone) return;
//     if (e.shiftKey) { fileShare.click(); return; }
//     var t = input.value.trim();
//     if (!t) { var h = SharedChat.history(); t = h.length ? h[h.length - 1].text : ''; }
//     if (t) ShareWA.text(t);
//     else PoohUI.notify({ icon: '🟢', title: 'Pooh Chat', text: 'Nothing to share yet' });
//   });
//   fileShare.addEventListener('change', function () {
//     var n = fileShare.files.length;
//     ShareWA.files(fileShare.files).then(function (r) {
//       if (r === 'downloaded') PoohUI.notify({ icon: '⬇️', title: 'Pooh Chat', text: n + ' file' + (n === 1 ? '' : 's') + ' downloaded (share sheet not available)' });
//       else if (r === 'shared') PoohUI.notify({ icon: '🟢', title: 'Pooh Chat', text: n + ' file' + (n === 1 ? '' : 's') + ' shared' });
//     });
//     fileShare.value = '';
//   });
// 
//   paint();
//   if (inHub) bootHub(); else bootStandalone();
// })();
