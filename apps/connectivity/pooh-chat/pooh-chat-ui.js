/*
  Pooh Chat — rendering (pooh-chat-ui.js, PC2).
  PoohUI.render(list, isMine): bubbles via PoohCore.rows — mine right, others left, sender name only when the
  sender changes, small time, ↗ WhatsApp share per message. Text only (textContent), no HTML injection.
  PoohUI.status(text): the dot before the name (green on / amber wait / grey off; title + aria-label = text).
  PoohUI.room(label, n), PoohUI.sys(text), PoohUI.sheet(title, nodes), PoohUI.notify(...) (H32: Hub card inside
  the Hub via window.top.HubNotify.notice, own toast standalone).
  Legacy (release 4): status(text, ok) wrote "Connected · code" into #status-text; every bubble had name + time
  (who.textContent = mine ? 'You' : name); empty text "No messages yet. Say hello 🐻".
*/
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var log = $('log');
  /* PC2: light / dark follows the Hub theme (sites-hub.theme), else the device setting */
  (function () {
    var t = ''; try { t = localStorage.getItem('sites-hub.theme') || ''; } catch (_) { /* blocked */ }
    var dark = t ? t === 'dark' : !(window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
    document.documentElement.classList.add(dark ? 'dark' : 'light');
  })();

  function time(ts) { var d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

  function render(list, isMine) {
    var atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    log.textContent = '';
    if (!list.length) sys('No messages yet. Say hi!');
    PoohCore.rows(list, isMine).forEach(function (r) {
      var m = r.m;
      var b = document.createElement('div');
      b.className = 'msg ' + r.side + (r.showName ? ' first' : '');
      b.tabIndex = 0;
      if (r.showName) { var who = document.createElement('span'); who.className = 'who'; who.textContent = m.name || 'Device'; b.appendChild(who); }
      var t = document.createElement('span'); t.className = 'txt'; t.textContent = m.text;
      var when = document.createElement('span'); when.className = 'when'; when.textContent = time(m.ts);
      var wa = document.createElement('button'); wa.type = 'button'; wa.className = 'wa-one'; wa.textContent = '↗'; wa.title = 'Share to WhatsApp'; wa.setAttribute('aria-label', 'Share to WhatsApp');
      wa.addEventListener('click', function (e) { e.stopPropagation(); if (window.ShareWA) ShareWA.text(m.text); });
      b.addEventListener('click', function () { b.classList.toggle('sel'); });
      b.append(t, when, wa);
      log.appendChild(b);
    });
    if (atEnd || render.first !== false) { log.scrollTop = log.scrollHeight; render.first = false; }
  }

  function sys(text) { var d = document.createElement('div'); d.className = 'sys'; d.textContent = text; log.appendChild(d); }

  function status(text) {
    var el = $('net'); if (!el) return;
    el.title = text; el.setAttribute('aria-label', text);
    el.className = 'net ' + PoohCore.dot(text);
  }
  function room(label, n) { if ($('room-lbl')) $('room-lbl').textContent = label; if ($('room-n')) $('room-n').textContent = String(n); }
  function name(n) { if ($('me-name')) $('me-name').textContent = n; }

  /* in-app sheet (Settings / Who's here) */
  function sheet(title, nodes) {
    $('sheet-title').textContent = title;
    var body = $('sheet-body'); body.textContent = '';
    (nodes || []).forEach(function (n) { body.appendChild(n); });
    $('sheet').hidden = false;
  }
  function closeSheet() { $('sheet').hidden = true; }
  $('sheet-close').addEventListener('click', closeSheet);
  $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  function hubNotify() {
    try { var t = window.top; if (t && t !== window && t.HubNotify && typeof t.HubNotify.notice === 'function') return t.HubNotify; } catch (_) { /* cross-origin top */ }
    return null;
  }
  var toastEl = null, toastT = 0;
  function notify(o) {
    o = typeof o === 'string' ? { text: o } : (o || {});
    var N = hubNotify();
    if (N) { try { return N.notice({ icon: o.icon || '🐻', title: o.title || 'Pooh Chat', text: o.text || '', timeoutMs: o.timeoutMs }); } catch (_) { /* fall back */ } }
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'pooh-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.textContent = (o.icon || '🐻') + ' ' + (o.text || '');
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); }, o.timeoutMs || 3000);
    return { close: function () { clearTimeout(toastT); toastEl.classList.remove('show'); } };
  }

  window.PoohUI = { render: render, sys: sys, status: status, room: room, name: name, sheet: sheet, closeSheet: closeSheet, notify: notify };
})();

/* ===== Legacy: release-4 pooh-chat-ui.js (replaced in PC2) ===== */
// /*
//   Pooh Chat — rendering (pooh-chat-ui.js, release 4).
//   PoohUI.render(list, myIds): draws SharedChat history into #log (mine on the right,
//   device name + time on every message, small WhatsApp share per message).
//   PoohUI.status(text, ok), PoohUI.sys(text). Text only (textContent), no HTML injection.
//   H32: PoohUI.notify({icon, title, text, timeoutMs}) — inside the Hub a Hub notification card
//   (window.top.HubNotify.notice); standalone a small toast at the bottom of the app.
// */
// (function () {
//   'use strict';
//   var log = document.getElementById('log');
//   var st = document.getElementById('status');
//   var stText = document.getElementById('status-text');
// 
//   function time(ts) { var d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
// 
//   function render(list, isMine) {
//     var atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
//     log.textContent = '';
//     if (!list.length) sys('No messages yet. Say hello 🐻');
//     list.forEach(function (m) {
//       var mine = isMine(m);
//       var b = document.createElement('div');
//       b.className = 'msg ' + (mine ? 'me' : 'them');
//       b.tabIndex = 0;
//       var who = document.createElement('span'); who.className = 'who';
//       who.textContent = mine ? 'You' : (m.name || 'Device');
//       var when = document.createElement('span'); when.className = 'when'; when.textContent = time(m.ts);
//       who.appendChild(when);
//       var t = document.createElement('div'); t.textContent = m.text;
//       var wa = document.createElement('button'); wa.type = 'button'; wa.className = 'wa-one'; wa.textContent = '↗'; wa.title = 'Share to WhatsApp';
//       wa.addEventListener('click', function (e) { e.stopPropagation(); if (window.ShareWA) ShareWA.text(m.text); });
//       b.addEventListener('click', function () { b.classList.toggle('sel'); });
//       b.append(who, t, wa);
//       log.appendChild(b);
//     });
//     if (atEnd || render.first !== false) { log.scrollTop = log.scrollHeight; render.first = false; }
//   }
// 
//   function sys(text) {
//     var d = document.createElement('div'); d.className = 'sys'; d.textContent = text;
//     log.appendChild(d);
//   }
// 
//   function status(text, ok) { stText.textContent = text; st.classList.toggle('ok', !!ok); }
// 
//   /* H32: one notify path — Hub card when the Hub is there, own toast otherwise */
//   function hubNotify() {
//     try {
//       var t = window.top;
//       if (t && t !== window && t.HubNotify && typeof t.HubNotify.notice === 'function') return t.HubNotify;
//     } catch (_) { /* cross-origin top */ }
//     return null;
//   }
//   var toastEl = null, toastT = 0;
//   function notify(o) {
//     o = typeof o === 'string' ? { text: o } : (o || {});
//     var N = hubNotify();
//     if (N) {
//       try { return N.notice({ icon: o.icon || '🐻', title: o.title || 'Pooh Chat', text: o.text || '', timeoutMs: o.timeoutMs }); } catch (_) { /* fall back */ }
//     }
//     if (!toastEl) {
//       toastEl = document.createElement('div');
//       toastEl.className = 'pooh-toast';
//       toastEl.setAttribute('role', 'status');
//       document.body.appendChild(toastEl);
//     }
//     toastEl.textContent = (o.icon || '🐻') + ' ' + (o.title && o.title !== 'Pooh Chat' ? o.title + ' — ' : '') + (o.text || '');
//     toastEl.classList.add('show');
//     clearTimeout(toastT);
//     toastT = setTimeout(function () { toastEl.classList.remove('show'); }, o.timeoutMs || 3000);
//     return { close: function () { clearTimeout(toastT); toastEl.classList.remove('show'); } };
//   }
// 
//   window.PoohUI = { render: render, sys: sys, status: status, notify: notify };
// })();
