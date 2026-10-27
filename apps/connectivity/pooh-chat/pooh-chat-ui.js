/*
  Pooh Chat — rendering (pooh-chat-ui.js, release 4).
  PoohUI.render(list, myIds): draws SharedChat history into #log (mine on the right,
  device name + time on every message, small WhatsApp share per message).
  PoohUI.status(text, ok), PoohUI.sys(text). Text only (textContent), no HTML injection.
  H32: PoohUI.notify({icon, title, text, timeoutMs}) — inside the Hub a Hub notification card
  (window.top.HubNotify.notice); standalone a small toast at the bottom of the app.
*/
(function () {
  'use strict';
  var log = document.getElementById('log');
  var st = document.getElementById('status');
  var stText = document.getElementById('status-text');

  function time(ts) { var d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }

  function render(list, isMine) {
    var atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    log.textContent = '';
    if (!list.length) sys('No messages yet. Say hello 🐻');
    list.forEach(function (m) {
      var mine = isMine(m);
      var b = document.createElement('div');
      b.className = 'msg ' + (mine ? 'me' : 'them');
      b.tabIndex = 0;
      var who = document.createElement('span'); who.className = 'who';
      who.textContent = mine ? 'You' : (m.name || 'Device');
      var when = document.createElement('span'); when.className = 'when'; when.textContent = time(m.ts);
      who.appendChild(when);
      var t = document.createElement('div'); t.textContent = m.text;
      var wa = document.createElement('button'); wa.type = 'button'; wa.className = 'wa-one'; wa.textContent = '↗'; wa.title = 'Share to WhatsApp';
      wa.addEventListener('click', function (e) { e.stopPropagation(); if (window.ShareWA) ShareWA.text(m.text); });
      b.addEventListener('click', function () { b.classList.toggle('sel'); });
      b.append(who, t, wa);
      log.appendChild(b);
    });
    if (atEnd || render.first !== false) { log.scrollTop = log.scrollHeight; render.first = false; }
  }

  function sys(text) {
    var d = document.createElement('div'); d.className = 'sys'; d.textContent = text;
    log.appendChild(d);
  }

  function status(text, ok) { stText.textContent = text; st.classList.toggle('ok', !!ok); }

  /* H32: one notify path — Hub card when the Hub is there, own toast otherwise */
  function hubNotify() {
    try {
      var t = window.top;
      if (t && t !== window && t.HubNotify && typeof t.HubNotify.notice === 'function') return t.HubNotify;
    } catch (_) { /* cross-origin top */ }
    return null;
  }
  var toastEl = null, toastT = 0;
  function notify(o) {
    o = typeof o === 'string' ? { text: o } : (o || {});
    var N = hubNotify();
    if (N) {
      try { return N.notice({ icon: o.icon || '🐻', title: o.title || 'Pooh Chat', text: o.text || '', timeoutMs: o.timeoutMs }); } catch (_) { /* fall back */ }
    }
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'pooh-toast';
      toastEl.setAttribute('role', 'status');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = (o.icon || '🐻') + ' ' + (o.title && o.title !== 'Pooh Chat' ? o.title + ' — ' : '') + (o.text || '');
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove('show'); }, o.timeoutMs || 3000);
    return { close: function () { clearTimeout(toastT); toastEl.classList.remove('show'); } };
  }

  window.PoohUI = { render: render, sys: sys, status: status, notify: notify };
})();
