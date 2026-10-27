/* Video Chat VC1 — UI: screens (Call, Settings), swipe 75 px, dialogs, call screen.
   Hub code, in order: #code= / ?hub= (QR), the Hub's {sharedLink:'hello'} (inside the Hub),
   parent.__hubRemote.code (phone Hub), localStorage 'jtsites-hub-ctrl-code' (desktop Hub),
   'shared-link-join-code', our last code, else the code dialog. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var inHub = window.parent !== window, page = 0, SW = 75, started = false;
  var LAST = 'videochat-last-code';

  /* ---------- dialogs / toast ---------- */
  function dialog(text, buttons, ask) {
    return new Promise(function (res) {
      $('d-text').textContent = text;
      var inp = $('d-input'); inp.hidden = !ask; inp.value = '';
      var row = $('d-row'); row.innerHTML = '';
      (buttons || ['OK']).forEach(function (b, i, a) {
        var el = document.createElement('button'); el.className = i === a.length - 1 ? 'btn sm' : 'mini'; el.textContent = b;
        el.onclick = function () {
          if (ask && i === a.length - 1) { var c = (inp.value.match(/\d{4}/) || [''])[0]; if (!c) { $('d-text').textContent = 'Enter the 4-digit code.'; return; } $('dialog').hidden = true; return res(c); }
          $('dialog').hidden = true; res(ask ? null : i);
        };
        row.appendChild(el);
      });
      $('dialog').hidden = false; if (ask) setTimeout(function () { inp.focus(); }, 50);
    });
  }
  var toastT = 0;
  function toast(t) { var e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('show'); }, 2200); }
  function hubNotify(o) { try { if (window.top !== window && window.top.HubNotify) { window.top.HubNotify(o); return true; } } catch (_) { /* cross-origin */ } return false; }

  /* ---------- code ---------- */
  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function urlCode() { var m = (location.hash + '&' + location.search).match(/(?:code|hub|join)=(\d{4})/); return m ? m[1] : ''; }
  function localCode() {
    try { if (window.parent.__hubRemote && window.parent.__hubRemote.code) return String(window.parent.__hubRemote.code); } catch (_) { /* */ }
    var c = ls('jtsites-hub-ctrl-code'); if (/^\d{4}$/.test(c) && inHub) return c;
    c = ls('shared-link-join-code'); if (/^\d{4}$/.test(c) && inHub) return c;
    return '';
  }
  function go(code) {
    if (started) { if (code === VCPeer.code()) return; VCPeer.stop(); }
    started = true;
    try { localStorage.setItem(LAST, code); } catch (_) { /* */ }
    VCPeer.start(code).catch(function () { $('status').textContent = 'PeerJS could not load (offline?)'; });
  }
  function askCode() { dialog('Enter the 4-digit Hub Connect Code shown on the Hub.', ['Cancel', 'Join'], true).then(function (c) { if (c) go(c); }); }
  function boot() {
    var c = urlCode();
    if (c) return go(c);
    if (inHub) {
      var got = false;
      addEventListener('message', function (e) {
        var d = e.data; if (e.source !== window.parent || !d || d.sharedLink !== 'hello' || got) return;
        if (/^\d{4}$/.test(String(d.code || ''))) { got = true; go(String(d.code)); }
      });
      try { window.parent.postMessage({ sharedLink: 'ready', app: 'video-chat', types: ['x-none/'] }, '*'); } catch (_) { /* */ }
      setTimeout(function () { if (!got && !started) { var l = localCode() || ls(LAST); if (l) go(l); else askCode(); } }, 800);
      return;
    }
    c = ls(LAST) || ls('shared-link-join-code');
    if (/^\d{4}$/.test(c)) go(c); else { $('status').textContent = 'Not connected'; askCode(); }
  }
  $('btn-code').onclick = askCode;

  /* ---------- device list ---------- */
  function paintMe() { $('me-name').textContent = VCStore.name(); }
  function paintList(list) {
    var ul = $('devices'); ul.innerHTML = '';
    $('empty').hidden = list.length > 0;
    list.forEach(function (d) {
      var li = document.createElement('li');
      var av = document.createElement('span'); av.className = 'av'; av.textContent = (d.name || '?').charAt(0).toUpperCase();
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = d.name || 'Device';
      var b = document.createElement('button'); b.className = 'btn sm'; b.textContent = 'Call'; b.dataset.id = d.id;
      b.onclick = function () { VCCall.start(d.id, d.name || 'Device'); };
      li.append(av, nm, b); ul.appendChild(li);
    });
  }
  VCPeer.on('status', function (t) { $('status').textContent = t; });
  VCPeer.on('roster', function (l) { paintList(l); VCCall.roster(l); });
  VCPeer.on('signal', function (m, from) { VCCall.signal(m, from); });
  VCPeer.on('call', function (c) { VCCall.incoming(c); });

  /* ---------- call screen ---------- */
  function showCall(name) { $('ringing').hidden = true; $('incall').hidden = false; $('c-name').textContent = name; $('c-time').textContent = '0:00'; ['b-mute', 'b-cam'].forEach(function (b) { $(b).classList.remove('off'); }); }
  VCCall.on('outgoing', function (n) { showCall(n); $('c-state').textContent = 'Starting camera…'; });
  VCCall.on('incoming', function (n) {
    $('r-name').textContent = n; $('ringing').hidden = false;
    hubNotify({ icon: '📹', title: 'Video Chat', text: n + ' is calling' });
  });
  VCCall.on('accepted', showCall);
  VCCall.on('local', function (s) { $('self').srcObject = s; });
  VCCall.on('remote', function (s) { $('remote').srcObject = s; $('remote').play && $('remote').play().catch(function () {}); });
  VCCall.on('state', function (t) { $('c-state').textContent = t; });
  VCCall.on('timer', function (ms) { var s = Math.floor(ms / 1000); $('c-time').textContent = Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); });
  VCCall.on('ended', function (why, quiet, isErr) {
    $('incall').hidden = true; $('ringing').hidden = true; $('remote').srcObject = null; $('self').srcObject = null;
    if (quiet) toast(why); else dialog(why, ['OK']);
    if (isErr) return;
  });
  $('b-accept').onclick = function () { VCCall.accept(); };
  $('b-decline').onclick = function () { VCCall.decline(); };
  $('b-end').onclick = function () { VCCall.end(); };
  $('b-mute').onclick = function () { $('b-mute').classList.toggle('off', !!VCCall.mute()); };
  $('b-cam').onclick = function () { $('b-cam').classList.toggle('off', !!VCCall.camOff()); };
  $('b-flip').onclick = function () { VCCall.flip().then(function () { $('self').classList.toggle('back'); }).catch(function (e) { toast(e.message); }); };

  /* draggable self-view */
  (function () {
    var v = $('self'), sx, sy, ox, oy, drag = false;
    v.addEventListener('pointerdown', function (e) { drag = true; v.setPointerCapture(e.pointerId); var r = v.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top; });
    v.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var x = Math.max(0, Math.min(innerWidth - v.offsetWidth, ox + e.clientX - sx)), y = Math.max(0, Math.min(innerHeight - v.offsetHeight, oy + e.clientY - sy));
      v.style.left = x + 'px'; v.style.top = y + 'px'; v.style.right = 'auto'; v.style.bottom = 'auto';
    });
    ['pointerup', 'pointercancel'].forEach(function (n) { v.addEventListener(n, function () { drag = false; }); });
  })();

  /* ---------- screens + swipe ---------- */
  function show(i) { page = i; $('track').style.transform = 'translateX(' + (-50 * i) + '%)'; document.querySelectorAll('.dot').forEach(function (d, k) { d.classList.toggle('on', k === i); }); if (i === 1) listMedia(); }
  document.querySelectorAll('.dot').forEach(function (d) { d.onclick = function () { show(+d.dataset.i); }; });
  (function () {
    var x0 = null, y0 = 0, vp = $('viewport');
    vp.addEventListener('pointerdown', function (e) { if (VCCall.active() || e.target.closest('input,select,button')) return; x0 = e.clientX; y0 = e.clientY; });
    vp.addEventListener('pointerup', function (e) {
      if (x0 === null) return; var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (VCCall.active() || Math.abs(dx) < SW || Math.abs(dy) > Math.abs(dx)) return;
      show(dx < 0 ? Math.min(1, page + 1) : Math.max(0, page - 1));
    });
  })();

  /* ---------- settings ---------- */
  var inName = $('in-name');
  inName.value = VCStore.get('name') || VCStore.name();
  inName.addEventListener('change', function () { VCStore.set('name', inName.value.trim().slice(0, 40)); paintMe(); VCPeer.rename(); toast('Name saved'); });
  function listMedia() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(function (ds) {
      [['sel-cam', 'videoinput', 'cam', 'Camera'], ['sel-mic', 'audioinput', 'mic', 'Microphone']].forEach(function (a) {
        var sel = $(a[0]), cur = VCStore.get(a[2]); sel.innerHTML = '<option value="">Default</option>';
        ds.filter(function (d) { return d.kind === a[1]; }).forEach(function (d, i) { var o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || a[3] + ' ' + (i + 1); if (d.deviceId === cur) o.selected = true; sel.appendChild(o); });
      });
    }).catch(function () {});
  }
  $('sel-cam').onchange = function () { VCStore.set('cam', this.value); };
  $('sel-mic').onchange = function () { VCStore.set('mic', this.value); };
  function paintSeg() { document.querySelectorAll('.seg[data-key=theme] button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === VCStore.get('theme')); }); }
  document.querySelectorAll('.seg[data-key=theme] button').forEach(function (b) { b.onclick = function () { VCStore.set('theme', b.dataset.v); paintSeg(); }; });
  paintSeg(); paintMe(); paintList([]);
  boot();
})();
