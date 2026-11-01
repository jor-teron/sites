/* Screen Share SS1 — UI: screens (Share, Settings), swipe 75 px, dialogs, sharer card, viewer.
   Hub code, in order (same as Video Chat VC1): #code= / ?hub= (QR), the Hub's {sharedLink:'hello'}
   (inside the Hub), parent.__hubRemote.code (phone Hub), localStorage 'jtsites-hub-ctrl-code'
   (desktop Hub), 'shared-link-join-code', our last code, else the code dialog.
   SS2: URL code, else the Hub's active private mesh (parent.HubMeshLink), else Public 0000; the Hub's own Connect
   Code only in an older Hub without HubMeshLink. No dialog at start. On Public, untrusted viewers need Allow. */
(function () {
  'use strict';
  // FC5: Hub codes are 5 digits (H83); public lobby is SharedLink.LOBBY, else '00000'. Saved 4-digit codes are ignored.
  var PUB = (function () { try { var S = window.SharedLink || (window.parent && window.parent.SharedLink) || (window.top && window.top.SharedLink); if (S && /^\d{5}$/.test(String(S.LOBBY || ''))) return String(S.LOBBY); } catch (_) {} return '00000'; })();
  function c5(c) { c = String(c || ''); return /^\d{5}$/.test(c) ? c : ''; }   // FC5: drops saved 4-digit codes
  var $ = function (id) { return document.getElementById(id); };
  var inHub = window.parent !== window, page = 0, SW = 75, started = false;
  var LAST = 'screenshare-last-code';

  /* ---------- dialogs / toast ---------- */
  function dialog(text, buttons, ask) {
    return new Promise(function (res) {
      $('d-text').textContent = text;
      var inp = $('d-input'); inp.hidden = !ask; inp.value = '';
      var row = $('d-row'); row.innerHTML = '';
      (buttons || ['OK']).forEach(function (b, i, a) {
        var el = document.createElement('button'); el.className = i === a.length - 1 ? 'btn sm' : 'mini'; el.textContent = b;
        el.onclick = function () {
          if (ask && b === 'Public') { $('dialog').hidden = true; return res(PUB); }   // SS2
          if (ask && i === a.length - 1) { var c = (inp.value.match(/\d{5}/) || [''])[0]; if (!c) { $('d-text').textContent = 'Enter the 5-digit code.'; return; } $('dialog').hidden = true; return res(c); }
          $('dialog').hidden = true; res(ask ? null : i);
        };
        row.appendChild(el);
      });
      $('dialog').hidden = false; if (ask) setTimeout(function () { inp.focus(); }, 50);
    });
  }
  var toastT = 0;
  function toast(t) { var e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('show'); }, 2400); }
  function hubNotify(o) { try { if (window.top !== window && window.top.HubNotify) { window.top.HubNotify(o); return true; } } catch (_) { /* cross-origin */ } return false; }

  /* ---------- code (identical flow to VC1) ---------- */
  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function urlCode() { var m = (location.hash + '&' + location.search).match(/(?:code|hub|join)=(\d{5})/); return m ? m[1] : ''; }
  // SS1 code choice, kept for reference:
  // function localCode() {
  //   try { if (window.parent.__hubRemote && window.parent.__hubRemote.code) return String(window.parent.__hubRemote.code); } catch (_) { /* */ }
  //   var c = ls('jtsites-hub-ctrl-code'); if (/^\d{4}$/.test(c) && inHub) return c;
  //   c = ls('shared-link-join-code'); if (/^\d{4}$/.test(c) && inHub) return c;
  //   return '';
  // }
  // function go(code) {
  //   if (started) { if (code === SSPeer.code()) return; SSShare.stop(); SSShare.leave(true); SSPeer.stop(); }
  //   started = true;
  //   try { localStorage.setItem(LAST, code); } catch (_) { /* */ }
  //   SSPeer.start(code).catch(function () { $('status').textContent = 'PeerJS could not load (offline?)'; });
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
  //     try { window.parent.postMessage({ sharedLink: 'ready', app: 'screen-share', types: ['x-none/'] }, '*'); } catch (_) { /* */ }
  //     setTimeout(function () { if (!got && !started) { var l = localCode() || ls(LAST); if (l) go(l); else askCode(); } }, 800);
  //     return;
  //   }
  //   c = ls(LAST) || ls('shared-link-join-code');
  //   if (/^\d{4}$/.test(c)) go(c); else { $('status').textContent = 'Not connected'; askCode(); }
  // }
  // SS2: default is Public 0000; private code only from the URL, an active Hub private mesh, or a manual pick.
  function hml() { try { var h = window.parent !== window && window.parent.HubMeshLink; return h && typeof h.isPrivate === 'function' ? h : null; } catch (_) { return null; } }
  function meshCode() { var h = hml(); if (!h) return ''; try { var c = h.isPrivate() ? String(h.privateCode() || '') : ''; return /^\d{5}$/.test(c) ? c : ''; } catch (_) { return ''; } }
  function localCode() {   // SS1 sources, now only a fallback for an older Hub without HubMeshLink
    try { if (window.parent.__hubRemote && window.parent.__hubRemote.code) { var r0 = c5(window.parent.__hubRemote.code); if (r0) return r0; } } catch (_) { /* */ }
    var c = ls('jtsites-hub-ctrl-code'); if (/^\d{5}$/.test(c) && inHub) return c;
    c = ls('shared-link-join-code'); if (/^\d{5}$/.test(c) && inHub) return c;
    return '';
  }
  var manual = false, fixed = false;   // manual = user picked a code this session; fixed = code came from the URL
  function desired() { return meshCode() || PUB; }
  function busyWhy() { return SSShare.sharing() ? 'Stop sharing first' : SSShare.watchingId() ? 'Stop watching first' : ''; }
  function go(code) {
    if (started) { if (code === SSPeer.code()) return; var b = busyWhy(); if (b) { toast(b); return false; } SSShare.stop(); SSShare.leave(true); SSPeer.stop(); }
    started = true;
    try { localStorage.setItem(LAST, code); } catch (_) { /* */ }
    $('code-lbl').textContent = code === PUB ? PUB + ' · Public' : 'Code ' + code; paintSwitch();
    SSPeer.start(code).catch(function () { $('status').textContent = 'PeerJS could not load (offline?)'; });
  }
  function pick(c) { if (c && go(c) !== false) manual = true; }
  function askCode() {
    var b = busyWhy(); if (b && started) { toast(b); return; }
    dialog('Enter the 5-digit Hub Connect Code shown on the Hub, or use Public to meet any device on the open Hub mesh (00000). On Public you allow each new viewer of your screen.', ['Cancel', 'Public', 'Join'], true).then(function (c) { if (!c) return; var w = busyWhy(); if (w && started) { toast(w); return; } pick(c); });
  }
  var offer = '';
  function paintSwitch() {
    var el = $('ss-switch'); if (!el) return;
    el.hidden = !offer || offer === SSPeer.code();
    el.textContent = offer === PUB ? 'Back to Public' : 'Switch to ' + offer;
  }
  function checkMesh() {   // SS2: follow the Hub joining / leaving a private mesh, only when idle
    if (!started || manual || fixed || !hml()) return;
    var d = desired(); if (d === SSPeer.code()) { offer = ''; paintSwitch(); return; }
    if (!busyWhy()) { offer = ''; go(d); toast(d === PUB ? 'Hub left its private mesh — back to Public' : 'Hub joined private mesh ' + d); }
    else { offer = d; paintSwitch(); }
  }
  function boot() {
    var c = urlCode();
    if (c) { fixed = true; return go(c); }
    if (inHub) {
      if (hml()) return go(desired());
      var got = false;   // older Hub without HubMeshLink: SS1 order, ending at 00000
      addEventListener('message', function (e) {
        var d = e.data; if (e.source !== window.parent || !d || d.sharedLink !== 'hello' || got) return;
        if (/^\d{5}$/.test(String(d.code || '')) && !started) { got = true; go(String(d.code)); }
      });
      try { window.parent.postMessage({ sharedLink: 'ready', app: 'screen-share', types: ['x-none/'] }, '*'); } catch (_) { /* */ }
      setTimeout(function () { if (!got && !started) { var l = localCode() || ls(LAST); go(/^\d{5}$/.test(l) ? l : PUB); } }, 800);
      return;
    }
    c = ls(LAST);
    go(/^\d{5}$/.test(c) ? c : PUB);
  }
  setInterval(checkMesh, 5000);
  window.__ssTest = { checkMesh: checkMesh, pick: pick };   // test hook (quick checks)
  if ($('ss-switch')) $('ss-switch').onclick = function () { var b = busyWhy(); if (b) { toast(b); return; } var d = offer; offer = ''; if (d) go(d); };
  $('btn-code').onclick = askCode;

  /* ---------- live shares list ---------- */
  var known = {};
  function paintMe() { $('me-name').textContent = SSStore.name(); }
  function paintList(list) {
    var ul = $('shares'); ul.innerHTML = '';
    var sh = list.filter(function (d) { return d.share && d.share.on; });
    $('empty').hidden = sh.length > 0;
    var others = list.length;
    $('online').textContent = others ? others + ' other device' + (others > 1 ? 's' : '') + ' on this code' : '';
    var wid = SSShare.watchingId();
    sh.forEach(function (d) {
      var li = document.createElement('li');
      var av = document.createElement('span'); av.className = 'av'; av.textContent = '🖥️';
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = d.name || 'Device';
      var sub = document.createElement('span'); sub.className = 'sub'; sub.textContent = (d.share.paused ? 'Paused' : 'Live') + (d.share.audio ? ' · with sound' : '');
      nm.appendChild(sub);
      var b = document.createElement('button'); b.className = 'btn sm'; b.textContent = wid === d.id ? 'Open' : 'Watch'; b.dataset.id = d.id;
      b.onclick = function () { watch(d); };
      li.onclick = function (e) { if (e.target !== b) watch(d); };
      li.append(av, nm, b); ul.appendChild(li);
    });
    // "X started sharing" notices
    var now = {};
    sh.forEach(function (d) { now[d.id] = 1; if (!known[d.id] && started) { toast((d.name || 'Device') + ' started sharing'); hubNotify({ icon: '🖥️', title: 'Screen Share', text: (d.name || 'Device') + ' is sharing a screen' }); } });
    known = now;
  }
  SSPeer.on('status', function (t) { $('status').textContent = t; });
  SSPeer.on('roster', function (l) { paintList(l); SSShare.roster(l); });
  SSPeer.on('signal', function (m, from) { SSShare.signal(m, from); });
  SSPeer.on('call', function (c) { SSShare.incoming(c); });

  /* ---------- sharer ---------- */
  function qNote() { $('q-note').textContent = (SSStore.get('quality') === '720' ? '720p' : '1080p') + ' · ' + SSStore.get('fps') + ' fps · up to ' + SSShare.MAXV + ' viewers'; }
  function paintShare() {
    var on = SSShare.sharing(), p = SSShare.isPaused();
    $('mine').hidden = !on; $('sharing-ctl').hidden = !on;
    $('b-share').hidden = on; $('l-audio').hidden = on || !SSShare.canShare();
    $('b-pause').textContent = p ? 'Resume' : 'Pause';
    $('mine-state').textContent = p ? 'Paused' : 'Live'; $('mine-state').classList.toggle('paused', p);
    $('mine-title').textContent = on ? 'You are sharing' : '';
  }
  function paintViewers(v) {
    $('v-count').textContent = v.length ? v.length + ' watching' + (v.length >= SSShare.MAXV ? ' (full)' : '') : 'No viewers yet';
    var ul = $('v-list'); ul.innerHTML = '';
    v.forEach(function (x) { var li = document.createElement('li'); li.textContent = x.name; ul.appendChild(li); });
  }
  var phoneMsg = 'Phones and tablets can’t share their screen from a browser, but they can watch. Start the share on a computer (Chrome, Edge, Firefox or Safari) with the same Hub code, then tap it under Live shares.';
  if (SSShare.isPhone()) { $('b-share').classList.add('dim'); $('l-audio').hidden = true; }
  $('b-share').onclick = function () {
    if (!SSShare.canShare()) { dialog(SSShare.isPhone() ? phoneMsg : 'This browser can’t share its screen. Use a recent Chrome, Edge, Firefox or Safari on a computer.', ['OK']); return; }
    if (!started) { toast('Join a Hub code first'); askCode(); return; }   // SS2: not hit normally (boot always picks a code)
    SSShare.start().catch(function (e) { if (e.quiet) toast(e.message); else dialog(e.message, ['OK']); });
  };
  $('chk-audio').checked = SSStore.get('audio') === 'on';
  $('chk-audio').onchange = function () { SSStore.set('audio', this.checked ? 'on' : 'off'); paintSeg(); };
  $('b-pause').onclick = function () { var p = SSShare.pause(); toast(p ? 'Paused — viewers see a paused screen' : 'Sharing again'); };
  $('b-stop').onclick = function () { SSShare.stop('Sharing stopped'); };
  SSShare.on('sharing', function (s) { $('preview').srcObject = s; paintShare(); paintViewers([]); toast('Sharing — others on code ' + SSPeer.code() + ' can watch'); });
  SSShare.on('stopped', function (why) { $('preview').srcObject = null; paintShare(); toast(why); });
  SSShare.on('paused', paintShare);
  SSShare.on('viewers', paintViewers);
  SSShare.on('viewerJoined', function (n) { toast(n + ' is watching'); });
  SSShare.on('viewerLeft', function (n, why) { if (why !== 'again') toast(n + ' stopped watching'); });
  /* SS2: Allow / Deny queue for viewers on Public */
  var askQ = [], askOpen = null;
  function nextAsk() {
    if (askOpen || !askQ.length) return;
    askOpen = askQ.shift();
    dialog(askOpen.name + ' wants to watch your screen', ['Deny', 'Allow']).then(function (i) { var a = askOpen; if (!a) return; askOpen = null; SSShare.decide(a.id, i === 1); nextAsk(); });
  }
  SSShare.on('ask', function (a) { askQ.push(a); hubNotify({ icon: '🖥️', title: 'Screen Share', text: a.name + ' wants to watch your screen' }); nextAsk(); });
  SSShare.on('decided', function (id, why) {
    askQ = askQ.filter(function (a) { return a.id !== id; });
    if (askOpen && askOpen.id === id) { askOpen = null; $('dialog').hidden = true; if (why === 'timeout') toast('No answer in 30 s — viewer declined'); nextAsk(); }
  });
  SSShare.on('full', function (n) { toast((n || 'Someone') + ' tried to watch — ' + SSShare.MAXV + ' viewers max'); });

  /* ---------- viewer ---------- */
  var W = $('watch'), stage = $('stage'), zoomer = $('zoomer'), rv = $('remote');
  function watch(d) {
    if (SSShare.watchingId() === d.id && !W.hidden) return;
    if (SSShare.watchingId() === d.id) { W.hidden = false; return; }
    SSShare.watch(d.id, d.name || 'Device');   // leaves any previous share first
    rv.srcObject = null; $('paused-ov').hidden = true; $('p-name').textContent = d.name || 'Device';
    W.hidden = false; applyFit(); resetZoom();
  }
  SSShare.on('watching', function (n) { $('w-name').textContent = n; $('b-sound').hidden = true; });
  SSShare.on('wstate', function (t) { $('w-state').textContent = t; });
  SSShare.on('remote', function (s) {
    rv.srcObject = s; rv.muted = false;
    var p = rv.play && rv.play(); if (p && p.catch) p.catch(function () { rv.muted = true; rv.play().catch(function () {}); paintSound(); });
    $('b-sound').hidden = !s.getAudioTracks().length; paintSound();
  });
  SSShare.on('wpaused', function (p) { $('paused-ov').hidden = !p; });
  SSShare.on('left', function (why, quiet) {
    W.hidden = true; rv.srcObject = null; exitFull();
    if (quiet) toast(why); else dialog(why, ['OK']);
  });
  function paintSound() { $('b-sound').textContent = rv.muted ? '🔇' : '🔊'; }
  $('b-sound').onclick = function () { rv.muted = !rv.muted; if (!rv.muted) rv.play().catch(function () {}); paintSound(); };
  $('b-leave').onclick = function () { SSShare.leave(); };
  function applyFit() { var f = SSStore.get('fit') === 'fill'; W.classList.toggle('fill', f); $('b-fit').classList.toggle('on', f); $('b-fit').title = f ? 'Fill (tap for Fit)' : 'Fit (tap for Fill)'; }
  $('b-fit').onclick = function () { SSStore.set('fit', SSStore.get('fit') === 'fill' ? 'fit' : 'fill'); applyFit(); paintSeg(); resetZoom(); toast(SSStore.get('fit') === 'fill' ? 'Fill screen' : 'Fit whole screen'); };
  function isFull() { return document.fullscreenElement || document.webkitFullscreenElement; }
  function exitFull() { if (isFull()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } }
  $('b-full').onclick = function () {
    if (isFull()) return exitFull();
    var req = W.requestFullscreen || W.webkitRequestFullscreen;
    if (req) { var r = req.call(W); if (r && r.catch) r.catch(function () {}); }
    else if (rv.webkitEnterFullscreen) rv.webkitEnterFullscreen();   // iPhone Safari: video-only full screen
    else toast('Full screen is not available here');
  };
  ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (n) { document.addEventListener(n, function () { $('b-full').classList.toggle('on', !!isFull()); }); });

  /* zoom + pan: wheel (around the cursor), two-finger pinch, drag when zoomed, double-click/tap toggles 2.5x */
  var z = 1, tx = 0, ty = 0, ZMAX = 8;
  function clamp() {
    var w = stage.clientWidth, h = stage.clientHeight, mx = (z - 1) * w / 2, my = (z - 1) * h / 2;
    tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty));
  }
  function apply() {
    clamp(); zoomer.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + z + ')';
    $('w-zoom').textContent = z > 1.01 ? Math.round(z * 100) + '%' : '';
    stage.classList.toggle('zoomed', z > 1.01); $('b-zoom').classList.toggle('on', z > 1.01);
  }
  function zoomAt(nz, cx, cy) {
    nz = Math.max(1, Math.min(ZMAX, nz));
    var r = stage.getBoundingClientRect(), px = cx - r.left - r.width / 2, py = cy - r.top - r.height / 2;
    tx = px - (px - tx) * nz / z; ty = py - (py - ty) * nz / z; z = nz;
    if (z === 1) { tx = 0; ty = 0; }
    apply();
  }
  function resetZoom() { z = 1; tx = 0; ty = 0; apply(); }
  $('b-zoom').onclick = resetZoom;
  stage.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX, e.clientY); }, { passive: false });
  stage.addEventListener('dblclick', function (e) { zoomAt(z > 1.01 ? 1 : 2.5, e.clientX, e.clientY); });
  var pts = {}, pinch = null, drag = null, lastTap = 0;
  function two() { var k = Object.keys(pts); return k.length >= 2 ? [pts[k[0]], pts[k[1]]] : null; }
  stage.addEventListener('pointerdown', function (e) {
    stage.setPointerCapture(e.pointerId); pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var p = two();
    if (p) { drag = null; pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, z: z, mx: (p[0].x + p[1].x) / 2, my: (p[0].y + p[1].y) / 2 }; }
    else {
      drag = { x: e.clientX, y: e.clientY, tx: tx, ty: ty }; stage.classList.add('drag');
      if (e.pointerType === 'touch') { var t = Date.now(); if (t - lastTap < 300) zoomAt(z > 1.01 ? 1 : 2.5, e.clientX, e.clientY); lastTap = t; }
    }
  });
  stage.addEventListener('pointermove', function (e) {
    if (!pts[e.pointerId]) return; pts[e.pointerId] = { x: e.clientX, y: e.clientY };
    var p = two();
    if (p && pinch) {
      var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2;
      tx += mx - pinch.mx; ty += my - pinch.my; pinch.mx = mx; pinch.my = my;
      zoomAt(pinch.z * d / pinch.d, mx, my);
    } else if (drag && z > 1.01) { tx = drag.tx + e.clientX - drag.x; ty = drag.ty + e.clientY - drag.y; apply(); }
  });
  function up(e) { delete pts[e.pointerId]; if (!two()) pinch = null; if (!Object.keys(pts).length) { drag = null; stage.classList.remove('drag'); } else if (!pinch) { var k = Object.keys(pts)[0]; drag = { x: pts[k].x, y: pts[k].y, tx: tx, ty: ty }; } }
  ['pointerup', 'pointercancel'].forEach(function (n) { stage.addEventListener(n, up); });
  addEventListener('resize', function () { if (!W.hidden) apply(); });
  addEventListener('keydown', function (e) {
    if (W.hidden) return;
    if (e.key === 'Escape' && !isFull()) SSShare.leave();
    else if (e.key === '0') resetZoom();
    else if (e.key === 'f') $('b-full').click();
    else if (e.key === '+' || e.key === '=') zoomAt(z * 1.25, innerWidth / 2, innerHeight / 2);
    else if (e.key === '-') zoomAt(z / 1.25, innerWidth / 2, innerHeight / 2);
  });

  /* ---------- screens + swipe ---------- */
  function show(i) { page = i; $('track').style.transform = 'translateX(' + (-50 * i) + '%)'; document.querySelectorAll('.dot').forEach(function (d, k) { d.classList.toggle('on', k === i); }); }
  document.querySelectorAll('.dot').forEach(function (d) { d.onclick = function () { show(+d.dataset.i); }; });
  (function () {
    var x0 = null, y0 = 0, vp = $('viewport');
    vp.addEventListener('pointerdown', function (e) { if (!W.hidden || e.target.closest('input,select,button,video')) return; x0 = e.clientX; y0 = e.clientY; });
    vp.addEventListener('pointerup', function (e) {
      if (x0 === null) return; var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (!W.hidden || Math.abs(dx) < SW || Math.abs(dy) > Math.abs(dx)) return;
      show(dx < 0 ? Math.min(1, page + 1) : Math.max(0, page - 1));
    });
  })();

  /* ---------- settings ---------- */
  var inName = $('in-name');
  inName.value = SSStore.get('name') || SSStore.name();
  inName.addEventListener('change', function () { SSStore.set('name', inName.value.trim().slice(0, 40)); paintMe(); SSPeer.rename(); toast('Name saved'); });
  function paintSeg() {
    document.querySelectorAll('.seg').forEach(function (s) { var k = s.dataset.key; s.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === String(SSStore.get(k))); }); });
    $('chk-audio').checked = SSStore.get('audio') === 'on'; qNote();
  }
  document.querySelectorAll('.seg').forEach(function (s) {
    var k = s.dataset.key;
    s.querySelectorAll('button').forEach(function (b) {
      b.onclick = function () {
        SSStore.set(k, k === 'fps' ? +b.dataset.v : b.dataset.v); paintSeg();
        if (k === 'quality' || k === 'fps') { SSShare.applyQuality(); if (SSShare.sharing()) toast('Applied to the current share'); }
        if (k === 'audio' && SSShare.sharing()) toast('Tab audio applies to the next share');
        if (k === 'fit') applyFit();
      };
    });
  });
  paintSeg(); paintMe(); paintList([]); paintShare(); applyFit();
  boot();
})();
