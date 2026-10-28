/* Intercom IC1 — UI: screens (Talk, Settings), dots + 75 px wrap-around swipes, in-app dialogs,
   device list (Everyone + each device; tap to pick who you talk to), Talk button + DND + volume on the right,
   "who's talking" banner with Reply.
   Hub code, in order: #code= / ?hub= (QR), the Hub's {sharedLink:'hello'} (inside the Hub, after we post
   {sharedLink:'ready'}), parent.__hubRemote.code (phone Hub), localStorage 'jtsites-hub-ctrl-code' (desktop Hub),
   'shared-link-join-code', our last code, else the code dialog. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var inHub = window.parent !== window, page = 0, PAGES = 2, SW = 75, HOLD = 500, started = false, code = '';

  /* ---------- dialogs / toast ---------- */
  function dialog(text, buttons, ask) {
    return new Promise(function (res) {
      $('d-text').textContent = text;
      var inp = $('d-input'); inp.hidden = !ask; inp.value = '';
      var row = $('d-row'); row.innerHTML = '';
      (buttons || ['OK']).forEach(function (b, i, a) {
        var el = document.createElement('button'); el.className = i === a.length - 1 ? 'btn' : 'mini'; el.textContent = b;
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
  function toast(t) { var e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('show'); }, 2600); }

  /* ---------- code ---------- */
  var ls = ICSave.ls;
  function urlCode() { var m = (location.hash + '&' + location.search).match(/(?:code|hub|join)=(\d{4})/); return m ? m[1] : ''; }
  function localCode() {
    try { if (window.parent.__hubRemote && window.parent.__hubRemote.code) return String(window.parent.__hubRemote.code); } catch (_) { /* */ }
    var c = ls('jtsites-hub-ctrl-code'); if (/^\d{4}$/.test(c) && inHub) return c;
    c = ls('shared-link-join-code'); if (/^\d{4}$/.test(c) && inHub) return c;
    return '';
  }
  function go(c) {
    if (started) { if (c === code) return; ICTalk.stop(); ICPeer.stop(); }
    started = true; code = c; $('code-lbl').textContent = c;
    ICSave.setLastCode(c);
    ICPeer.start(c).catch(function () { setStatus('PeerJS could not load (offline?)'); });
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
      try { window.parent.postMessage({ sharedLink: 'ready', app: 'intercom', types: ['x-none/'] }, '*'); } catch (_) { /* */ }
      setTimeout(function () { if (!got && !started) { var l = localCode() || ICSave.lastCode(); if (l) go(l); else { setStatus('Not connected'); askCode(); } } }, 800);
      return;
    }
    c = ICSave.lastCode() || ls('shared-link-join-code');
    if (/^\d{4}$/.test(c)) go(c); else { setStatus('Not connected'); askCode(); }
  }
  $('btn-code').onclick = askCode; $('btn-code2').onclick = askCode;
  function setStatus(t) { $('status').textContent = t; }

  /* ---------- device list + target ---------- */
  function target() { return ICSave.get('target') || 'all'; }
  function setTarget(t) { ICSave.set('target', t); paintList(); paintTalk(); }
  function paintList() {
    var ul = $('devices'), list = ICPeer.roster(), tk = {}, s = ICTalk.talking(), tgt = target();
    if (tgt !== 'all' && !list.some(function (d) { return d.id === tgt; })) tgt = 'all';
    ICTalk.talkers().forEach(function (t) { tk[t.id] = t; });
    ul.innerHTML = '';
    $('empty').hidden = list.length > 0;
    var rows = [{ id: 'all', name: 'Everyone', all: true }].concat(list);
    rows.forEach(function (d) {
      var li = document.createElement('li'); li.dataset.id = d.id;
      li.className = (d.all ? 'all' : '') + (d.id === tgt ? ' sel' : '') + (tk[d.id] ? ' talking' : '') + (s && s.calls[d.id] ? ' live' : '') + (d.dnd ? ' off' : '');
      var av = document.createElement('span'); av.className = 'av'; av.textContent = d.all ? '👥' : (d.name || '?').charAt(0).toUpperCase();
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = d.all ? 'Everyone' : (d.name || 'Device');
      var sub = document.createElement('small');
      if (d.all) { var n = list.filter(function (x) { return !x.dnd; }).length; sub.textContent = list.length ? n + ' of ' + list.length + ' device' + (list.length === 1 ? '' : 's') + ' can hear' : 'nobody online yet'; }
      else sub.textContent = tk[d.id] ? 'talking now' : (s && s.calls[d.id]) ? 'hearing you' : 'online';
      nm.appendChild(sub);
      var st = document.createElement('span'); st.className = 'st';
      if (d.dnd) { st.textContent = '🌙 DND'; st.classList.add('moon'); } else if (d.id === tgt) st.textContent = '✓';
      li.append(av, nm, st);
      li.onclick = function () {
        if (ICTalk.talking()) { toast('Stop talking first, then pick who to talk to'); return; }
        if (d.dnd) toast(d.name + ' has Do Not Disturb on');
        setTarget(d.id);
      };
      ul.appendChild(li);
    });
  }
  function targetName() {
    var t = target(); if (t === 'all') return 'Everyone';
    var d = ICPeer.roster().filter(function (x) { return x.id === t; })[0];
    return d ? d.name || 'Device' : 'Everyone';
  }
  ICPeer.on('status', setStatus);
  ICPeer.on('roster', function (l) {
    var t = target(); if (t !== 'all' && !l.some(function (d) { return d.id === t; }) && !ICTalk.talking()) ICSave.set('target', 'all');
    ICTalk.roster(l); paintList(); paintTalk(); paintBanner();
  });
  ICPeer.on('signal', function (m, from) { ICTalk.signal(m, from); });
  ICPeer.on('call', function (c) { ICTalk.incoming(c); });
  ICPeer.on('online', function () { paintTalk(); });

  /* ---------- talk button (tap = toggle, hold > 0.5 s = push-to-talk) ---------- */
  var downAt = 0, startedByDown = false, timeTxt = '';
  function fmt(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function paintTalk() {
    var s = ICTalk.talking(), b = $('b-talk');
    b.classList.toggle('live', !!(s && !s.starting)); b.classList.toggle('wait', !!(s && s.starting));
    $('talk-lbl').textContent = s ? (s.starting ? 'Starting…' : 'Live ' + (timeTxt || '0:00')) : 'Talk';
    var tn = s ? (s.all ? 'Everyone' : (ICPeer.roster().filter(function (x) { return x.id === s.to; })[0] || {}).name || 'Device') : targetName();
    $('talk-to').textContent = 'to ' + tn;
    $('talk-hint').textContent = s ? 'Tap to stop' + (s.all && !s.starting ? ' · ' + Object.keys(s.calls).length + ' hearing' : '') : 'Tap to talk, tap again to stop · or hold';
  }
  function startTalk(t) {
    ICTalk.unlock();
    return ICTalk.start(t || target()).catch(function (e) { dialog(e.message, ['OK']); });
  }
  var tb = $('b-talk');
  tb.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;
    downAt = Date.now();
    if (!ICTalk.talking()) { startedByDown = true; startTalk(); } else startedByDown = false;
  });
  tb.addEventListener('pointerup', function () {
    if (!downAt) return;
    var held = Date.now() - downAt; downAt = 0;
    if (startedByDown) { if (held > HOLD) ICTalk.stop(); }   // hold-and-release = push-to-talk
    else ICTalk.stop();                                       // second tap stops
  });
  tb.addEventListener('pointercancel', function () { if (downAt && startedByDown && Date.now() - downAt > HOLD) ICTalk.stop(); downAt = 0; });
  tb.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  tb.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); if (ICTalk.talking()) ICTalk.stop(); else startTalk(); } });
  ICTalk.on('talk', function (s) { if (!s) timeTxt = ''; paintTalk(); paintList(); });
  ICTalk.on('tick', function (ms) { timeTxt = fmt(ms); paintTalk(); });
  ICTalk.on('note', toast);
  ICTalk.on('missed', function (n) { toast('🌙 ' + n + ' tried to talk (Do Not Disturb is on)'); });

  /* ---------- who's talking banner ---------- */
  function paintBanner() {
    var bn = $('banner'), list = ICTalk.talkers();
    bn.innerHTML = ''; bn.hidden = !list.length;
    list.forEach(function (t) {
      var row = document.createElement('div'); row.className = 'tk' + (t.state === 'chime' ? ' chime' : '');
      var w = document.createElement('span'); w.className = 'w'; w.innerHTML = '<i></i><i></i><i></i><i></i>';
      var tx = document.createElement('span'); tx.className = 't';
      var b = document.createElement('b'); b.textContent = t.name;
      tx.append(b, document.createTextNode(t.state === 'chime' ? ' is about to talk…' : ' is talking'));
      var sm = document.createElement('small'); sm.textContent = t.all ? 'to everyone' : 'to you only'; tx.appendChild(sm);
      var rp = document.createElement('button'); rp.className = 'mini'; rp.textContent = 'Reply';
      rp.onclick = function () {
        var s = ICTalk.talking();
        if (s && !s.all && s.to === t.id) { ICTalk.stop(); return; }
        if (s) ICTalk.stop();
        setTarget(t.id); startTalk(t.id);
      };
      var s = ICTalk.talking(); if (s && !s.all && s.to === t.id) rp.textContent = 'Stop';
      row.append(w, tx, rp); bn.appendChild(row);
    });
    document.title = list.length ? '🔊 ' + list.map(function (t) { return t.name; }).join(', ') + ' · Intercom IC1' : 'Intercom IC1';
  }
  ICTalk.on('talkers', function () { paintBanner(); paintList(); });
  ICTalk.on('talk', paintBanner);
  ICTalk.on('heard', function (t) {
    if (inHub && document.hidden) { try { window.top.HubNotify.notice({ icon: '🔊', title: 'Intercom', text: t.name + ' is talking' + (t.all ? ' to everyone' : ' to you'), timeoutMs: 6000 }); } catch (_) { /* cross-origin / no Hub */ } }
  });
  ICTalk.on('blocked', function (b) { $('sound').hidden = !b; });
  $('sound').onclick = function () { ICTalk.unlock(); $('sound').hidden = true; };
  document.addEventListener('pointerdown', function () { if (!ICTalk.soundOk()) ICTalk.unlock(); }, true);

  /* ---------- DND + volume ---------- */
  function paintDnd() {
    var on = !!ICSave.get('dnd');
    $('b-dnd').classList.toggle('on', on); $('b-dnd').lastChild.textContent = on ? 'DND on' : 'DND off';
    $('chk-dnd').checked = on;
  }
  function setDnd(v) { ICTalk.setDnd(v); paintDnd(); toast(v ? '🌙 Do Not Disturb on — nobody will be heard here' : 'Do Not Disturb off'); }
  $('b-dnd').onclick = function () { setDnd(!ICSave.get('dnd')); };
  $('chk-dnd').onchange = function () { setDnd(this.checked); };
  function paintVol() {
    var v = Math.round(ICSave.get('volume') * 100);
    $('vol').value = v; $('vol2').value = v; $('vol-n').textContent = v;
    $('vol-ic').textContent = v === 0 ? '🔇' : v < 50 ? '🔉' : '🔊';
  }
  ['vol', 'vol2'].forEach(function (id) { $(id).addEventListener('input', function () { ICTalk.setVolume(this.value / 100); paintVol(); }); });

  /* ---------- screens + swipe (75 px, wrap-around) ---------- */
  function show(i) { page = i; $('viewport').scrollLeft = 0; $('track').style.transform = 'translateX(' + (-100 / PAGES * i) + '%)'; document.querySelectorAll('.dot').forEach(function (d, k) { d.classList.toggle('on', k === i); }); }
  document.querySelectorAll('.dot').forEach(function (d) { d.onclick = function () { show(+d.dataset.i); }; });
  (function () {
    var x0 = null, y0 = 0, vp = $('viewport');
    vp.addEventListener('pointerdown', function (e) { if (e.target.closest('input,select,button,textarea,a')) return; x0 = e.clientX; y0 = e.clientY; });
    vp.addEventListener('pointerup', function (e) {
      if (x0 === null) return; var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) < SW || Math.abs(dy) > Math.abs(dx)) return;
      show((page + (dx < 0 ? 1 : -1) + PAGES) % PAGES);
    });
  })();

  /* ---------- settings ---------- */
  var inName = $('in-name');
  inName.value = ICSave.get('name') || ICSave.name();
  inName.addEventListener('change', function () { ICSave.set('name', inName.value.trim().slice(0, 40)); $('me-name').textContent = ICSave.name(); ICPeer.rename(); toast('Name saved'); });
  $('chk-chime').checked = !!ICSave.get('chime'); $('chk-chime').onchange = function () { ICSave.set('chime', this.checked); };
  function paintSeg() { document.querySelectorAll('.seg[data-key=theme] button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === ICSave.get('theme')); }); }
  document.querySelectorAll('.seg[data-key=theme] button').forEach(function (b) { b.onclick = function () { ICSave.set('theme', b.dataset.v); paintSeg(); }; });

  /* ---------- start ---------- */
  $('me-name').textContent = ICSave.name();
  paintSeg(); paintDnd(); paintVol(); paintList(); paintTalk(); paintBanner();
  boot();
})();
