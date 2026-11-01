/* Video Chat VC3 — UI: screens (Call, Settings), swipe 75 px, dialogs, call screen (grid of up to
   4 tiles, active speaker, screen-share stage, Add-to-call sheet).
   Hub code, in order: #code= / ?hub= (QR), the Hub's {sharedLink:'hello'} (inside the Hub),
   parent.__hubRemote.code (phone Hub), localStorage 'jtsites-hub-ctrl-code' (desktop Hub),
   'shared-link-join-code', our last code, else the code dialog.
   VC3: URL code, else the Hub's active private mesh (parent.HubMeshLink), else Public 0000; the Hub's own Connect
   Code is only a fallback for older Hubs without HubMeshLink; standalone: last code, else 0000. */
(function () {
  'use strict';
  // FC5: Hub codes are 5 digits (H83); public lobby is SharedLink.LOBBY, else '00000'. Saved 4-digit codes are ignored.
  var PUB = (function () { try { var S = window.SharedLink || (window.parent && window.parent.SharedLink) || (window.top && window.top.SharedLink); if (S && /^\d{5}$/.test(String(S.LOBBY || ''))) return String(S.LOBBY); } catch (_) {} return '00000'; })();
  function c5(c) { c = String(c || ''); return /^\d{5}$/.test(c) ? c : ''; }   // FC5: drops saved 4-digit codes
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
          if (ask && b === 'Public') { $('dialog').hidden = true; return res(PUB); }   // VC3
          if (ask && i === a.length - 1) { var c = (inp.value.match(/\d{5}/) || [''])[0]; if (!c) { $('d-text').textContent = 'Enter the 5-digit code.'; return; } $('dialog').hidden = true; return res(c); }
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
  function urlCode() { var m = (location.hash + '&' + location.search).match(/(?:code|hub|join)=(\d{5})/); return m ? m[1] : ''; }
  /* VC3: old code choice kept for reference (Hub's own Connect Code won; see readme Legacy code notes):
  // function localCode() {
  //   try { if (window.parent.__hubRemote && window.parent.__hubRemote.code) return String(window.parent.__hubRemote.code); } catch (_) { /* * / }
  //   var c = ls('jtsites-hub-ctrl-code'); if (/^\d{4}$/.test(c) && inHub) return c;
  //   c = ls('shared-link-join-code'); if (/^\d{4}$/.test(c) && inHub) return c;
  //   return '';
  // }
  // function go(code) {
  //   if (started) { if (code === VCPeer.code()) return; VCPeer.stop(); }
  //   started = true;
  //   try { localStorage.setItem(LAST, code); } catch (_) { /* * / }
  //   VCPeer.start(code).catch(function () { $('status').textContent = 'PeerJS could not load (offline?)'; });
  // }
  // function askCode() { dialog('Enter the 4-digit Hub Connect Code shown on the Hub.', ['Cancel', 'Join'], true).then(function (c) { if (c) go(c); }); }
  // function boot() {
  //   var c = urlCode();
  //   if (c) return go(c);
  //   if (inHub) {
  //     var got = false;
  //     addEventListener('message', function (e) {
  //       var d = e.data; if (e.source !== window.parent || !d || d.sharedLink !== 'hello' || got) return;
  //       if (/^\d{4}$/.test(String(d.code || ''))) { got = true; go(String(d.code)); }
  //     });
  //     try { window.parent.postMessage({ sharedLink: 'ready', app: 'video-chat', types: ['x-none/'] }, '*'); } catch (_) { /* * / }
  //     setTimeout(function () { if (!got && !started) { var l = localCode() || ls(LAST); if (l) go(l); else askCode(); } }, 800);
  //     return;
  //   }
  //   c = ls(LAST) || ls('shared-link-join-code');
  //   if (/^\d{4}$/.test(c)) go(c); else { $('status').textContent = 'Not connected'; askCode(); }
  // }
  */
  // VC3: default is Public 0000; private code only from the URL, an active Hub private mesh, or a manual pick.
  function hml() { try { var h = window.parent !== window && window.parent.HubMeshLink; return h && typeof h.isPrivate === 'function' ? h : null; } catch (_) { return null; } }
  function meshCode() { var h = hml(); if (!h) return ''; try { var c = h.isPrivate() ? String(h.privateCode() || '') : ''; return /^\d{5}$/.test(c) ? c : ''; } catch (_) { return ''; } }
  function localCode() {   // VC1 sources, now only a fallback for an older Hub without HubMeshLink
    try { if (window.parent.__hubRemote && window.parent.__hubRemote.code) { var r0 = c5(window.parent.__hubRemote.code); if (r0) return r0; } } catch (_) { /* */ }
    var c = ls('jtsites-hub-ctrl-code'); if (/^\d{5}$/.test(c) && inHub) return c;
    c = ls('shared-link-join-code'); if (/^\d{5}$/.test(c) && inHub) return c;
    return '';
  }
  var manual = false, fixed = false, offer = '', code = '';   // manual = picked this session; fixed = from the URL
  function desired() { return meshCode() || PUB; }
  function go(c) {
    if (started) { if (c === code) return; if (VCCall.active()) { toast('Hang up first'); return; } VCPeer.stop(); }
    started = true; code = c;
    // VC4: $('btn-code').textContent = c === PUB ? PUB + ' · Public' : c;
    if ($('code-lbl')) $('code-lbl').textContent = c === PUB ? PUB + ' · Public' : c;   // VC5: code shown in Settings only
    try { localStorage.setItem(LAST, c); } catch (_) { /* */ }
    paintSwitch();
    // VC4: VCPeer.start(c).catch(function () { $('status').textContent = 'PeerJS could not load (offline?)'; });
    VCPeer.start(c).catch(function () { setStatus('PeerJS could not load (offline?)'); toast('PeerJS could not load (offline?)'); });
  }
  function setStatus(t) {   // VC5: status lives on the small dot before the name (title / aria-label)
    var el = $('net'); if (!el) return;
    el.title = t; el.setAttribute('aria-label', t);
    el.className = 'net ' + (/^Online/.test(t) ? 'on' : /could not|Not connected|Offline|fail/i.test(t) ? 'off' : 'wait');
  }
  function pick(c) { if (c) { manual = true; offer = ''; go(c); } }
  /* VC1: function askCode() { dialog('Enter the 4-digit Hub Connect Code shown on the Hub.', ['Cancel', 'Join'], true).then(function (c) { if (c) go(c); }); } */
  function askCode() { dialog('Enter the 5-digit Hub Connect Code shown on the Hub, or use Public to meet every device on the open Hub mesh (00000). Calls still ring and must be accepted.', ['Cancel', 'Public', 'Join'], true).then(pick); }
  function paintSwitch() {
    var el = $('vc-switch'); if (!el) return;
    el.hidden = !offer || offer === code;
    el.textContent = offer === PUB ? 'Back to Public' : 'Switch to ' + offer;
  }
  function checkMesh() {   // VC3: follow the Hub joining / leaving a private mesh; never mid-call
    if (!started || manual || fixed || !hml()) return;
    var d = desired(); if (d === code) { offer = ''; paintSwitch(); return; }
    if (!VCCall.active()) { offer = ''; go(d); toast(d === PUB ? 'Hub left its private mesh — back to Public' : 'Hub joined private mesh ' + d); }
    else { offer = d; paintSwitch(); }
  }
  function boot() {
    var c = urlCode();
    if (c) { fixed = true; return go(c); }
    if (inHub) {
      if (hml()) return go(desired());
      var got = false;   // older Hub without HubMeshLink: VC2 order, ending at 00000
      addEventListener('message', function (e) {
        var d = e.data; if (e.source !== window.parent || !d || d.sharedLink !== 'hello' || got) return;
        if (/^\d{5}$/.test(String(d.code || '')) && !started) { got = true; go(String(d.code)); }
      });
      try { window.parent.postMessage({ sharedLink: 'ready', app: 'video-chat', types: ['x-none/'] }, '*'); } catch (_) { /* */ }
      setTimeout(function () { if (!got && !started) go(localCode() || c5(ls(LAST)) || PUB); }, 800);
      return;
    }
    c = ls(LAST);
    go(/^\d{5}$/.test(c) ? c : PUB);
  }
  setInterval(checkMesh, +window.__vcMeshMs || 5000);
  if ($('vc-switch')) $('vc-switch').onclick = function () { if (VCCall.active()) { toast('Hang up first'); return; } var d = offer; offer = ''; if (d) go(d); };
  // VC4: $('btn-code').onclick = askCode;
  if ($('btn-code')) $('btn-code').onclick = askCode;   // VC5: Code button removed from the bar; Settings → Change stays
  if ($('btn-code2')) $('btn-code2').onclick = askCode;

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
      b.onclick = function () { VCCall.start(d.id, d.name || 'Device'); if (VCCall.active()) $('incall').hidden = false; };
      li.append(av, nm, b); ul.appendChild(li);
    });
  }
  // VC4: VCPeer.on('status', function (t) { $('status').textContent = t; });
  VCPeer.on('status', setStatus);
  VCPeer.on('roster', function (l) { paintList(l); VCCall.roster(l); if (!$('addsheet').hidden) paintAdd(); });
  VCPeer.on('signal', function (m, from) { VCCall.signal(m, from); });
  VCPeer.on('call', function (c) { VCCall.incoming(c); });

  /* ---------- call screen ---------- */
  var grid = $('grid'), tiles = {}, selfBack = false;
  function ini(n) { return (n || '?').trim().charAt(0).toUpperCase() || '?'; }
  function tileFor(id) {
    if (tiles[id]) return tiles[id];
    var el = document.createElement('div'); el.className = 'tile'; el.dataset.id = id;
    var v = document.createElement('video'); v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', ''); if (id === 'me') v.muted = true;
    var av = document.createElement('div'); av.className = 'av'; av.appendChild(document.createElement('span'));
    var lbl = document.createElement('div'); lbl.className = 'lbl';
    var n = document.createElement('span'); n.className = 'n'; var i = document.createElement('span'); i.className = 'i';
    lbl.append(n, i);
    var tag = document.createElement('div'); tag.className = 'tag';
    el.append(v, av, lbl, tag);
    if (id === 'me') dragPip(el);
    return (tiles[id] = { el: el, v: v, av: av, n: n, i: i, tag: tag });
  }
  function setVideo(t, stream) { if (t.v.srcObject !== stream) { t.v.srcObject = stream || null; if (stream && t.v.play) t.v.play().catch(function () {}); } }
  function render() {
    var ppl = VCCall.people(), me = VCCall.me(), spk = VCCall.speaker();
    var live = ppl.filter(function (p) { return p.state === 'live'; });
    var sharer = me.st.share ? 'me' : (live.filter(function (p) { return p.st.share; })[0] || {}).id;
    var items = ppl.concat([me]);
    if (sharer) items.sort(function (a, b) { return (b.id === sharer) - (a.id === sharer); });
    var mode = sharer ? 'stage' : ppl.length <= 1 ? 'one' : 'n' + Math.min(4, items.length);
    grid.className = mode;
    var keep = {};
    items.forEach(function (p) {
      keep[p.id] = 1;
      var t = tileFor(p.id), isMe = p.id === 'me', st = p.st || {};
      var vs = isMe ? (me.screen || me.stream) : p.stream;
      setVideo(t, vs);
      var hasV = !!(vs && vs.getVideoTracks().length), showing = isMe ? (me.screen || st.cam) : (st.share || st.cam);
      t.av.hidden = hasV && showing && (isMe || p.state === 'live');
      t.av.firstChild.textContent = ini(p.name);
      t.n.textContent = isMe ? 'You' : p.name;
      var ic = []; if (st.mute) ic.push('🔇'); if (!st.cam && !st.share) ic.push('📷✕'); if (st.share) ic.push('🖥️');
      t.i.textContent = ic.join(' '); t.i.classList.toggle('bad', !!(st.mute || (!st.cam && !st.share)));
      var tag = p.state === 'ringing' ? 'Ringing…' : p.state === 'connecting' ? 'Connecting…' : p.net === 'disconnected' ? 'Reconnecting…' : (st.share && !isMe ? 'Sharing screen' : isMe && me.screen ? 'You are sharing' : '');
      t.tag.textContent = tag; t.tag.hidden = !tag;
      var pip = mode === 'one' && isMe;
      t.el.className = 'tile' + (isMe ? ' me' : '') + (isMe && !me.screen && !selfBack ? ' mirror' : '') + ((isMe && me.screen) || (!isMe && st.share) ? ' scr' : '') +
        (p.id === sharer ? ' big' : '') + (pip ? ' pip' : '') + (mode !== 'one' && spk && (spk === p.id) ? ' spk' : '') + (p.state === 'ringing' ? ' ringing' : '');
      if (!pip) ['left', 'top', 'right', 'bottom'].forEach(function (k) { t.el.style[k] = ''; });
      grid.appendChild(t.el);
    });
    Object.keys(tiles).forEach(function (id) { if (!keep[id]) { tiles[id].v.srcObject = null; tiles[id].el.remove(); delete tiles[id]; } });
    var names = live.map(function (p) { return p.name; });
    if (ppl.length) $('c-name').textContent = names.length ? names.join(', ') : ppl.map(function (p) { return p.name; }).join(', ');
    $('b-add').disabled = VCCall.count() >= VCCall.MAX;
    $('b-share').hidden = VCCall.isPhone();
    $('b-share').classList.toggle('on', VCCall.sharing());
    $('b-share').title = VCCall.sharing() ? 'Stop sharing' : 'Share screen';
    $('b-mute').classList.toggle('off', !!me.st.mute); $('b-cam').classList.toggle('off', !me.st.cam);
    if (!$('addsheet').hidden) paintAdd();
  }
  function showCall() { $('ringing').hidden = true; $('incall').hidden = false; $('c-time').textContent = '0:00'; render(); }
  VCCall.on('outgoing', function (n) { $('c-name').textContent = n; showCall(); $('c-state').textContent = 'Starting camera…'; });
  VCCall.on('incoming', function (n, members) {
    $('r-name').textContent = n;
    $('r-sub').textContent = members && members.length ? 'invites you to a group call' : 'is calling…';
    $('r-members').textContent = members && members.length ? 'Already in: ' + members.join(', ') : '';
    $('r-members').hidden = !(members && members.length);
    $('ringing').hidden = false;
    hubNotify({ icon: '📹', title: 'Video Chat', text: n + (members && members.length ? ' invites you to a call with ' + members.join(', ') : ' is calling') });
  });
  VCCall.on('accepted', showCall);
  VCCall.on('local', render);
  VCCall.on('people', function () { if (!$('incall').hidden) render(); });
  VCCall.on('speaker', function () { if (!$('incall').hidden) render(); });
  VCCall.on('share', function (s) { render(); toast(s ? 'Sharing your screen with everyone in the call' : 'Screen sharing stopped — camera back on'); });
  VCCall.on('note', function (t) { toast(t); });
  VCCall.on('joined', function (n) { if (VCCall.count() > 2) toast(n + ' joined'); });
  VCCall.on('state', function (t) { $('c-state').textContent = t; });
  VCCall.on('timer', function (ms) { var s = Math.floor(ms / 1000); $('c-time').textContent = Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); });
  VCCall.on('ended', function (why, quiet) {
    $('incall').hidden = true; $('ringing').hidden = true; $('addsheet').hidden = true;
    Object.keys(tiles).forEach(function (id) { tiles[id].v.srcObject = null; tiles[id].el.remove(); delete tiles[id]; });
    selfBack = false;
    if (quiet) toast(why); else dialog(why, ['OK']);
  });
  $('b-accept').onclick = function () { VCCall.accept(); };
  $('b-decline').onclick = function () { VCCall.decline(); };
  $('b-end').onclick = function () { VCCall.end(); };
  $('b-mute').onclick = function () { VCCall.mute(); };
  $('b-cam').onclick = function () { VCCall.camOff(); };
  $('b-flip').onclick = function () { VCCall.flip().then(function (back) { selfBack = !!back; render(); }).catch(function (e) { toast(e.message); }); };
  var phoneMsg = 'Phones and tablets can’t share their screen from a browser, but they see a shared screen big when someone on a computer shares.';
  $('b-share').onclick = function () {
    VCCall.share().catch(function (e) {
      if (e.message === 'phone') dialog(phoneMsg, ['OK']); else if (e.quiet) toast(e.message); else dialog(e.message, ['OK']);
    });
  };

  /* Add-to-call sheet (the device list, inside the call) */
  function paintAdd() {
    var ul = $('addlist'), list = VCPeer.roster(), full = VCCall.count() >= VCCall.MAX, byId = {};
    VCCall.people().forEach(function (p) { byId[p.id] = p; });
    ul.innerHTML = '';
    $('add-empty').hidden = list.length > 0;
    $('add-note').textContent = VCCall.count() + ' of ' + VCCall.MAX + ' in the call';
    list.forEach(function (d) {
      var li = document.createElement('li'), p = byId[d.id];
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = d.name || 'Device';
      li.appendChild(nm);
      if (p && p.state === 'ringing') {
        var st = document.createElement('span'); st.className = 'st'; st.textContent = 'Ringing…';
        var c = document.createElement('button'); c.className = 'mini'; c.textContent = 'Cancel'; c.onclick = function () { VCCall.cancelInvite(d.id); };
        li.append(st, c);
      } else if (p) {
        var s2 = document.createElement('span'); s2.className = 'st'; s2.textContent = p.state === 'live' ? 'In the call' : 'Joining…'; li.appendChild(s2);
      } else {
        var b = document.createElement('button'); b.className = 'btn sm'; b.textContent = 'Invite'; b.disabled = full; if (full) b.style.opacity = .4;
        b.dataset.id = d.id;
        b.onclick = function () { VCCall.start(d.id, d.name || 'Device'); };
        li.appendChild(b);
      }
      ul.appendChild(li);
    });
  }
  $('b-add').onclick = function () { if (VCCall.count() >= VCCall.MAX) { toast('A call holds up to ' + VCCall.MAX + ' people'); return; } paintAdd(); $('addsheet').hidden = false; };
  $('b-addclose').onclick = function () { $('addsheet').hidden = true; };
  $('addsheet').addEventListener('click', function (e) { if (e.target === $('addsheet')) $('addsheet').hidden = true; });

  /* draggable self-view (1:1 picture-in-picture only) */
  function dragPip(v) {
    var sx, sy, ox, oy, drag = false;
    v.addEventListener('pointerdown', function (e) { if (!v.classList.contains('pip')) return; drag = true; v.setPointerCapture(e.pointerId); var r = v.getBoundingClientRect(); sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top; });
    v.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var x = Math.max(0, Math.min(innerWidth - v.offsetWidth, ox + e.clientX - sx)), y = Math.max(0, Math.min(innerHeight - v.offsetHeight, oy + e.clientY - sy));
      v.style.left = x + 'px'; v.style.top = y + 'px'; v.style.right = 'auto'; v.style.bottom = 'auto';
    });
    ['pointerup', 'pointercancel'].forEach(function (n) { v.addEventListener(n, function () { drag = false; }); });
  }

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
