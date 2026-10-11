/*
  Pooh Chat — rendering (pooh-chat-ui.js, release 4).
  PoohUI.render(list, myIds): draws SharedChat history into #log (mine on the right,
  device name + time on every message, small WhatsApp share per message).
  PoohUI.status(text, ok), PoohUI.sys(text). Text only (textContent), no HTML injection.
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

  window.PoohUI = { render: render, sys: sys, status: status };
})();
