/*
  Pooh Chat — boot (pooh-chat.js, release 4). Group chat over the one Hub link.
  - Inside the Hub (iframe): posts {sharedLink:'ready', app:'pooh-chat'}; sends with
    {sharedLink:'chat', text}; the Hub owns SharedChat history and this page re-reads it
    (storage event). No own peer.
  - Standalone (phone): SharedLink.join('jtsites-' + Hub code). Code from #code= / ?hub=,
    else the saved code if it ever connected, else the Join dialog (code + Scan QR).
    Sends {type:'chat', …, bcast:true}; the Hub re-broadcasts to every device.
  - 🟢: share the typed text (or the last message) to WhatsApp; long-press → share files.
  - H32: short notices (Hub not ready, renamed, nothing to share, files shared, Hub
    disconnected) go through PoohUI.notify → Hub notification card, own toast standalone.
*/
(function () {
  'use strict';
  var inHub = window.parent && window.parent !== window;
  var hubLinked = false;
  var input = document.getElementById('input');
  var form = document.getElementById('composer');
  var btnJoin = document.getElementById('btn-join');
  var btnName = document.getElementById('btn-name');
  var btnWa = document.getElementById('btn-wa');
  var fileShare = document.getElementById('file-share');

  function isMine(m) { return SharedChat.isMine(m); }   // H19: sender device id only
  function paint() { PoohUI.render(SharedChat.history(), isMine); }
  SharedChat.on(paint);

  /* ---------- inside the Hub ---------- */
  function bootHub() {
    window.addEventListener('message', function (e) {
      var d = e.data;
      if (e.source !== window.parent || !d || typeof d !== 'object') return;
      if (d.sharedLink === 'hello' || d.sharedLink === 'devices') {
        hubLinked = true;
        var n = (d.devices || []).filter(function (x) { return x.online; }).length;
        PoohUI.status('Hub · ' + n + ' device' + (n === 1 ? '' : 's'), true);
      } else if (d.sharedLink === 'message') {
        setTimeout(paint, 30);   // the Hub stored it; repaint (storage event may lag)
      }
    });
    window.parent.postMessage({ sharedLink: 'ready', app: 'pooh-chat', types: ['x-none/'] }, '*');
    PoohUI.status('Connecting to Hub…', false);
  }

  /* ---------- standalone ---------- */
  function urlCode() {
    var s = location.hash + '&' + location.search;
    return window.SharedLinkScan ? SharedLinkScan.parse(s) : '';
  }
  function joinCode(code) {
    btnJoin.hidden = true;
    SharedLink.join({ prefix: 'jtsites-', code: code }).catch(function () { PoohUI.status('PeerJS could not load (offline?)', false); });
  }
  function askJoin() {
    SharedLinkScan.ask({ title: 'Join the Hub chat' }).then(function (c) { if (c) joinCode(c); else btnJoin.hidden = false; });
  }
  function bootStandalone() {
    SharedChat.init(function (m) { SharedLink.send(Object.assign({ bcast: true }, m)); });
    SharedChat.listen();
    SharedLink.on('status', function (text, state) {
      if (!SharedLink.connected) PoohUI.status(text, false);
      if (state === 'notfound') btnJoin.hidden = false;
    });
    SharedLink.on('open', function () { PoohUI.status('Connected · ' + SharedLink.code, true); });
    SharedLink.on('close', function () { PoohUI.status('Reconnecting…', false); });
    SharedLink.on('bye', function () { PoohUI.status('Hub disconnected', false); btnJoin.hidden = false; PoohUI.notify({ icon: '🔌', title: 'Pooh Chat', text: 'Hub disconnected' }); });
    btnJoin.addEventListener('click', askJoin);
    var saved = '';
    try { saved = localStorage.getItem('shared-link-join-code') || ''; } catch (_) { /* blocked */ }
    var code = urlCode() || (saved && SharedLink.everConnected(saved) ? saved : '');
    if (code) joinCode(code);
    else { PoohUI.status('Not connected', false); btnJoin.hidden = false; askJoin(); }
  }

  /* ---------- composer ---------- */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var t = input.value.trim();
    if (!t) return;
    if (inHub) {
      if (!hubLinked) { PoohUI.status('Hub not ready', false); PoohUI.notify({ icon: '⚠️', title: 'Pooh Chat', text: 'Hub not ready — message not sent' }); return; }
      window.parent.postMessage({ sharedLink: 'chat', text: t }, '*');
      setTimeout(paint, 30);
    } else {
      SharedChat.send(t);
    }
    input.value = '';
    input.focus();
  });

  btnName.addEventListener('click', function () {
    if (!window.SharedLinkDevices) return;
    var n = window.prompt('Name for this device:', SharedLinkDevices.name());
    if (n) { SharedLinkDevices.setName(n); PoohUI.notify({ icon: '✏️', title: 'Pooh Chat', text: 'This device is now “' + SharedLinkDevices.name() + '”' }); }
  });

  /* 🟢 tap: WhatsApp text. Long press (or Shift+click): pick files and share them. */
  var pressT = 0, longDone = false;
  btnWa.addEventListener('pointerdown', function () { longDone = false; pressT = setTimeout(function () { longDone = true; fileShare.click(); }, 600); });
  ['pointerup', 'pointerleave'].forEach(function (ev) { btnWa.addEventListener(ev, function () { clearTimeout(pressT); }); });
  btnWa.addEventListener('click', function (e) {
    if (longDone) return;
    if (e.shiftKey) { fileShare.click(); return; }
    var t = input.value.trim();
    if (!t) { var h = SharedChat.history(); t = h.length ? h[h.length - 1].text : ''; }
    if (t) ShareWA.text(t);
    else PoohUI.notify({ icon: '🟢', title: 'Pooh Chat', text: 'Nothing to share yet' });
  });
  fileShare.addEventListener('change', function () {
    var n = fileShare.files.length;
    ShareWA.files(fileShare.files).then(function (r) {
      if (r === 'downloaded') PoohUI.notify({ icon: '⬇️', title: 'Pooh Chat', text: n + ' file' + (n === 1 ? '' : 's') + ' downloaded (share sheet not available)' });
      else if (r === 'shared') PoohUI.notify({ icon: '🟢', title: 'Pooh Chat', text: n + ' file' + (n === 1 ? '' : 's') + ' shared' });
    });
    fileShare.value = '';
  });

  paint();
  if (inHub) bootHub(); else bootStandalone();
})();
