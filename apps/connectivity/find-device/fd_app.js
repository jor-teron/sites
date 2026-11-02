/* Find My Device FD1 — glue. Public mesh 00000 (FDPeer); my number = HubLine.myNumber() / SharedLinkDevices.code(), else a
   saved random 5-digit number ('find-device-settings-v1' = {num}); read fresh, follows 'hub-number-changed' on window.top.
   Wire (direct link): finder → {t:'ring', from, name} → target replies {t:'ringack', ok}; {t:'stop'};
   finder → {t:'locate', from, name} → target replies {t:'loc', lat, lon, acc, at} or {t:'loc', error}.
   FD1: anyone on 00000 may ring / locate (allowFind). The target must have this app open (FD2: the Hub answers). */
(function () {
  'use strict';
  var KEY = 'find-device-settings-v1', NUM = /^[1-9]\d{4}$/, PUB = '00000', state = {};
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; } }
  function wins() { var w = [window]; try { if (window.parent !== window) w.push(window.parent); } catch (_) {} try { if (window.top !== window) w.push(window.top); } catch (_) {} return w; }
  function myNum() {
    var w = wins();
    for (var i = w.length - 1; i >= 0; i--) {
      try { var H = w[i].HubLine; if (H && H.myNumber) { var a = String(H.myNumber() || ''); if (NUM.test(a)) return a; } } catch (_) { /* */ }
      try { var D = w[i].SharedLinkDevices; if (D && D.code) { var b = String(D.code() || ''); if (NUM.test(b)) return b; } } catch (_) { /* */ }
    }
    var o = load(); if (!NUM.test(String(o.num || ''))) { o.num = String(10000 + Math.floor(Math.random() * 90000)); try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (_) { /* */ } }
    return o.num;
  }
  function myName() { var w = wins(); for (var i = 0; i < w.length; i++) { try { if (w[i].SharedLinkDevices) return String(w[i].SharedLinkDevices.name() || 'Device'); } catch (_) {} } return 'Device'; }
  function who() { return { name: myName(), num: myNum() }; }
  function contactName(n) { try { var c = window.HubContacts && HubContacts.byNum(n); if (c) return c.name; } catch (_) {} return ''; }
  function label(n, nm) { return contactName(n) || nm || n; }
  var tt = 0;
  function toast(t) {
    try { if (window.top !== window && window.top.HubNotify) { window.top.HubNotify.notice({ icon: '📍', title: 'Find My Device', text: t, timeoutMs: 6000 }); return; } } catch (_) { /* */ }
    var el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(tt); tt = setTimeout(function () { el.hidden = true; }, 4000);
  }
  /* FD1: everyone on the public mesh may find this device. FD2 adds permissions (trusted devices / contacts only). */
  function allowFind(req) { return true; }   // eslint-disable-line no-unused-vars

  /* ---------- target side + finder replies: one handler, testable with fake messages ---------- */
  function handle(m, reply, fromNum) {
    if (!m || typeof m !== 'object') return;
    var fn = NUM.test(String(m.from)) ? String(m.from) : (fromNum || ''), lb = label(fn, m.name ? String(m.name).slice(0, 40) : '') || 'another device';
    if (m.t === 'ring') {
      if (!allowFind({ num: fn, name: m.name, what: 'ring' })) { reply({ t: 'ringack', ok: false }); return; }
      FDRing.start(lb); reply({ t: 'ringack', ok: true });
    } else if (m.t === 'stop') { FDRing.stop(); }
    else if (m.t === 'locate') {
      if (!allowFind({ num: fn, name: m.name, what: 'locate' })) { reply({ t: 'loc', error: 'Not allowed' }); return; }
      return FDLocate.get().then(function (r) { r.t = 'loc'; reply(r); if (!r.error) toast('Your location was shared with ' + lb); return r; });
    } else if (m.t === 'ringack') { setSt(fn, m.ok ? 'Ringing…' : 'Not reachable', m.ok ? 'ring' : ''); }
    else if (m.t === 'loc') {
      if (m.error) setSt(fn, String(m.error).slice(0, 80), '');
      else if (FDLocate.valid(m)) { setSt(fn, 'Located', ''); FDLocate.show({ lat: +m.lat, lon: +m.lon, acc: +m.acc || 0, at: +m.at || Date.now() }, label(fn, rosterName(fn))); }
    }
  }
  FDPeer.on('data', function (m, conn) { handle(m, function (r) { try { conn.send(r); } catch (_) { /* */ } }, FDPeer.numOf(conn.peer)); });

  /* ---------- finder side ---------- */
  function rosterName(n) { var r = FDPeer.roster(); for (var i = 0; i < r.length; i++) if (r[i].num === n) return r[i].name; return ''; }
  function setSt(n, t, mode) { state[n] = { t: t, mode: mode || '' }; render(); if (!$('devs').querySelector('[data-num="' + n + '"]')) toast(label(n, rosterName(n)) + ': ' + t); }
  var waitT = {};
  function ask(n, kind) {
    if (!NUM.test(n)) { toast('Enter a 5-digit number'); return; }
    if (n === myNum()) { toast('That is this device'); return; }
    if (kind === 'ring' && state[n] && state[n].mode === 'ring') { FDPeer.send(n, { t: 'stop' }); setSt(n, 'Stopped', ''); return; }
    setSt(n, kind === 'ring' ? 'Calling…' : 'Locating…', '');
    FDPeer.send(n, { t: kind, from: myNum(), name: myName() }).then(function (ok) {
      if (!ok) { setSt(n, 'Not reachable', ''); return; }
      clearTimeout(waitT[n]); waitT[n] = setTimeout(function () { if (state[n] && /…$/.test(state[n].t) && state[n].mode !== 'ring') setSt(n, 'Not reachable', ''); }, kind === 'ring' ? 8000 : 20000);
    });
  }
  function render() {
    var r = FDPeer.roster().filter(function (d) { return d.num; }), ul = $('devs'); ul.innerHTML = '';
    r.forEach(function (d) {
      var li = document.createElement('li'), s = state[d.num], ringing = s && s.mode === 'ring'; li.dataset.num = d.num;
      li.innerHTML = '<span class="nm"><b>' + esc(label(d.num, d.name)) + '</b><small class="mut">' + esc(d.num) + (s ? ' · <span class="st">' + esc(s.t) + '</span>' : '') + '</small></span>' +
        '<button class="act jelly" data-k="ring">' + (ringing ? '⏹' : '🔔') + '</button><button class="act jelly" data-k="locate">📍</button>';
      li.querySelectorAll('button').forEach(function (b) { b.onclick = function () { ask(d.num, b.dataset.k); }; });
      ul.appendChild(li);
    });
    $('empty').hidden = r.length > 0;
    $('count').textContent = r.length + ' online';
  }
  FDPeer.on('roster', render);
  FDPeer.on('status', function (s) { $('status').textContent = s === 'online' ? 'Public ' + PUB : s === 'connecting' ? 'Connecting…' : 'Offline'; });
  $('b-ring2').onclick = function () { ask($('in-num').value.trim(), 'ring'); };
  $('b-loc2').onclick = function () { ask($('in-num').value.trim(), 'locate'); };
  $('m-close').onclick = function () { $('mapbox').hidden = true; };
  $('b-pick').onclick = function () {
    var p = $('picker'), ul = $('pick-list'); if (!p.hidden) { p.hidden = true; return; }
    var l = []; try { l = window.HubContacts ? HubContacts.list() : []; } catch (_) { l = []; }
    ul.innerHTML = l.length ? '' : '<li class="mut">No saved contacts yet.</li>';
    l.forEach(function (c) { if (!NUM.test(String(c.num))) return; var li = document.createElement('li'); li.innerHTML = '<b>' + esc(c.name) + '</b> <span class="mut">' + esc(c.num) + '</span>'; li.onclick = function () { $('in-num').value = c.num; p.hidden = true; }; ul.appendChild(li); });
    p.hidden = false;
  };
  function paintMe() { $('my-num').textContent = myNum(); }
  try { window.top.addEventListener('hub-number-changed', function () { paintMe(); FDPeer.update(who()); }); } catch (_) { /* cross-origin */ }
  paintMe(); render();
  FDPeer.start(PUB, who()).catch(function () { $('status').textContent = 'PeerJS could not load (offline?)'; });
  window.FDApp = { handle: handle, allowFind: allowFind, myNum: myNum };   // test hooks
})();
