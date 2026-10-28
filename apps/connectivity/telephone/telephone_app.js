/* Telephone TP1 — UI: screens (Phone, Recent, Settings), dots + 75 px wrap-around swipes, in-app dialogs only.
   Phone: my number (big) + Online now on the left; dial display + keypad + Call on the RIGHT (phone: stacked).
   Call screen (overlay): who + state / timer on the left, Answer · Decline or Mute · Speaker · Hang up on the RIGHT.
   Number clash: when another device (other did) with an older 'since' already has my number, I take a new one.
   Hub code, in order: #code= / ?hub= (QR), the Hub's {sharedLink:'hello'} (inside the Hub, after we post
   {sharedLink:'ready'}), parent.__hubRemote.code (phone Hub), localStorage 'jtsites-hub-ctrl-code' (desktop Hub),
   'shared-link-join-code', our last code, else the code dialog. Keyboard: digits, Backspace, Enter = call / answer, Esc = hang up. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var inHub = window.parent !== window, page = 0, PAGES = 3, SW = 75, started = false, code = '', dial = '', baseTitle = document.title;

  /* ---------- dialogs / toast ---------- */
  function dialog(text, buttons, opt) {
    opt = opt || {};
    return new Promise(function (res) {
      $('d-text').textContent = text;
      var inp = $('d-input'), ask = !!opt.ask; inp.hidden = !ask; inp.value = '';
      var lst = $('d-list'); lst.innerHTML = ''; lst.hidden = !opt.list;
      (opt.list || []).forEach(function (it) {
        var b = document.createElement('button'); b.textContent = it.label; b.className = it.on ? 'on' : '';
        b.onclick = function () { $('dialog').hidden = true; res({ pick: it.id }); };
        lst.appendChild(b);
      });
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
  var ls = TPSave.ls;
  function urlCode() { var m = (location.hash + '&' + location.search).match(/(?:code|hub|join)=(\d{4})/); return m ? m[1] : ''; }
  function localCode() {
    try { if (window.parent.__hubRemote && window.parent.__hubRemote.code) return String(window.parent.__hubRemote.code); } catch (_) { /* */ }
    var c = ls('jtsites-hub-ctrl-code'); if (/^\d{4}$/.test(c) && inHub) return c;
    c = ls('shared-link-join-code'); if (/^\d{4}$/.test(c) && inHub) return c;
    return '';
  }
  function go(c) {
    if (started) { if (c === code) return; TPCall.stop(); TPPeer.stop(); }
    started = true; code = c; $('code-lbl').textContent = c;
    TPSave.setLastCode(c);
    TPPeer.start(c).catch(function () { setStatus('PeerJS could not load (offline?)'); });
  }
  function askCode() { dialog('Enter the 4-digit Hub Connect Code shown on the Hub. Phones with the same code can call each other.', ['Cancel', 'Join'], { ask: true }).then(function (c) { if (c) go(c); }); }
  function boot() {
    var c = urlCode();
    if (c) return go(c);
    if (inHub) {
      var got = false;
      addEventListener('message', function (e) {
        var d = e.data; if (e.source !== window.parent || !d || d.sharedLink !== 'hello' || got) return;
        if (/^\d{4}$/.test(String(d.code || ''))) { got = true; go(String(d.code)); }
      });
      try { window.parent.postMessage({ sharedLink: 'ready', app: 'telephone', types: ['x-none/'] }, '*'); } catch (_) { /* */ }
      setTimeout(function () { if (!got && !started) { var l = localCode() || TPSave.lastCode(); if (l) go(l); else { setStatus('Not connected'); askCode(); } } }, 800);
      return;
    }
    c = TPSave.lastCode() || ls('shared-link-join-code');
    if (/^\d{4}$/.test(c)) go(c); else { setStatus('Not connected'); askCode(); }
  }
  $('btn-code').onclick = askCode; $('btn-code2').onclick = askCode;
  function setStatus(t) { $('status').textContent = t; }

  /* ---------- my number ---------- */
  function paintMe() {
    $('me-name').textContent = TPSave.name();
    $('my-num').textContent = TPSave.get('num'); $('num-lbl').textContent = TPSave.get('num');
    $('my-sub').textContent = TPSave.name();
  }
  function checkClash(list) {
    var mine = TPSave.get('num'), did = TPSave.get('did'), my = TPPeer.since();
    var clash = list.filter(function (d) { return d.num === mine && d.did && d.did !== did && ((d.since || 0) < my || ((d.since || 0) === my && d.did < did)); });
    if (!clash.length || TPCall.busy()) return;
    var n = TPSave.newNum(list.map(function (d) { return d.num; }));
    TPSave.set('num', n); paintMe(); TPPeer.update();
    dialog('“' + (clash[0].name || 'Another device') + '” already has the number ' + mine + ', so this device now has the number ' + n + '.', ['OK']);
  }
  $('b-newnum').onclick = function () {
    if (TPCall.busy()) { toast('Hang up first'); return; }
    dialog('Get a new random number for this device? Other phones will need the new number to call you.', ['Cancel', 'New number']).then(function (i) {
      if (i !== 1) return;
      var n = TPSave.newNum(TPPeer.roster().map(function (d) { return d.num; }).concat(TPSave.get('num')));
      TPSave.set('num', n); paintMe(); TPPeer.update(); toast('Your number is now ' + n);
    });
  };

  /* ---------- online list ---------- */
  function initial(n) { return (n || '?').trim().charAt(0).toUpperCase() || '?'; }
  function paintList() {
    var ul = $('devices'), list = TPPeer.roster().filter(function (d) { return d.num; }).slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || '') || a.num.localeCompare(b.num); });
    ul.innerHTML = '';
    $('empty').hidden = list.length > 0;
    list.forEach(function (d) {
      var li = document.createElement('li'); li.dataset.id = d.id; li.dataset.num = d.num; li.className = d.busy ? 'busy' : '';
      var av = document.createElement('span'); av.className = 'av'; av.textContent = initial(d.name);
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = d.name || 'Device';
      var sub = document.createElement('small'); var nb = document.createElement('span'); nb.className = 'num'; nb.textContent = d.num;
      sub.appendChild(nb); sub.appendChild(document.createTextNode(d.busy ? ' · on a call' : ' · online')); nm.appendChild(sub);
      var cl = document.createElement('button'); cl.className = 'cl'; cl.textContent = '📞'; cl.title = 'Call ' + (d.name || 'Device') + ' (' + d.num + ')'; cl.setAttribute('aria-label', cl.title);
      li.append(av, nm, cl);
      li.onclick = function () { call(d.num); };
      ul.appendChild(li);
    });
    paintDial();
  }
  TPPeer.on('status', setStatus);
  TPPeer.on('roster', function (l) { checkClash(l); TPCall.roster(l); paintList(); paintLog(); });
  TPPeer.on('signal', function (m, from) { TPCall.signal(m, from); });
  TPPeer.on('call', function (c) { TPCall.incoming(c); });
  TPPeer.on('online', function () { paintDial(); });

  /* ---------- keypad ---------- */
  function paintDial() {
    $('dial').textContent = dial; $('b-back').disabled = !dial;
    var w = $('dial-who'); w.className = 'mut';
    if (dial.length === 4) {
      var d = dial === TPSave.get('num') ? null : TPCall.find(dial);
      if (dial === TPSave.get('num')) { w.textContent = 'This is your own number'; w.classList.add('no'); }
      else if (d) { w.textContent = (d.name || 'Device') + (d.busy ? ' · on a call' : ''); w.classList.add('ok'); }
      else { w.textContent = 'Not online right now'; w.classList.add('no'); }
    } else w.innerHTML = dial ? 'Numbers have 4 digits' : '&nbsp;';
    $('b-call').disabled = TPCall.busy();
  }
  function press(k) {
    TPCall.unlock(); TPCall.key(k);
    if (/\d/.test(k) && dial.length < 4) dial += k;
    paintDial();
  }
  document.querySelectorAll('#pad button').forEach(function (b) { b.onclick = function () { press(b.dataset.k); }; });
  $('b-back').onclick = function () { dial = dial.slice(0, -1); paintDial(); };
  $('b-call').onclick = function () {
    if (!dial) { var l = TPSave.log().filter(function (e) { return e.dir === 'out'; })[0]; if (l) { dial = l.num; paintDial(); toast('Last number: tap Call again'); } else toast('Type a number first'); return; }
    call(dial);
  };
  function call(num) {
    TPCall.dial(num).then(function () { dial = ''; paintDial(); }, function (e) { dialog(e.message, ['OK']); });
  }

  /* ---------- call screen ---------- */
  var WHY = { busy: 'Busy', declined: 'Call declined', noanswer: 'No answer', notfound: 'Not online', unreachable: 'Could not reach the phone', failed: 'Call could not connect', lost: 'Call dropped', mic: 'Microphone not available', missed: 'Missed call', cancelled: 'Call cancelled', done: 'Call ended' };
  function fmt(s) { s = Math.floor(s); var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + s % 60).slice(-2); }
  function paintCall() {
    var c = TPCall.current(), box = $('call');
    box.hidden = !c;
    $('b-call').disabled = TPCall.busy();
    if (!c) { document.title = baseTitle; return; }
    box.className = c.state === 'incoming' ? 'ring' : c.state;
    $('c-av').textContent = c.name ? initial(c.name) : '#';
    $('c-name').textContent = c.name || c.num;
    $('c-num').textContent = c.name ? c.num : '';
    var st = '', note = '';
    if (c.state === 'dialing') st = 'Calling…';
    else if (c.state === 'ringing') { st = c.acked ? 'Ringing…' : 'Calling…'; var d = TPCall.find(c.num); if (d && d.busy) note = 'They may be on another call'; }
    else if (c.state === 'incoming') st = 'Incoming call';
    else if (c.state === 'connecting') st = 'Connecting…';
    else if (c.state === 'active') { st = fmt((Date.now() - c.t0) / 1000); if (c.rmuted) note = (c.name || 'They') + ' muted their microphone'; else if (c.muted) note = 'You are muted'; }
    else if (c.state === 'ended') {
      st = WHY[c.why] || 'Call ended';
      if (c.why === 'notfound') note = 'Nobody with the number ' + c.num + ' is online on this Hub code';
      else if (c.why === 'busy') note = (c.name || 'They') + ' is on another call. Try again later.';
      else if (c.why === 'noanswer') note = (c.name || 'They') + ' did not answer';
      else if (c.dur) note = fmt(c.dur);
    }
    $('c-state').textContent = st; $('c-note').textContent = note;
    $('c-in').hidden = c.state !== 'incoming';
    $('c-on').hidden = c.state === 'incoming';
    var live = c.state !== 'ended';
    $('b-mute').disabled = !live || !c.stream; $('b-hang').disabled = !live; $('b-sink').disabled = !live;
    $('b-mute').classList.toggle('on', !!c.muted); $('b-mute').querySelector('.lb').textContent = c.muted ? 'Unmute' : 'Mute';
    $('b-mute').querySelector('.ic').textContent = c.muted ? '🔇' : '🎙️';
    $('b-sink').classList.toggle('on', !!TPSave.get('sink'));
    document.title = (c.state === 'incoming' ? '📞 ' + (c.name || c.num) + ' calling' : c.state === 'active' ? '📞 ' + fmt((Date.now() - c.t0) / 1000) : c.state === 'ended' ? baseTitle : '📞 Calling ' + (c.name || c.num)) + (c.state === 'ended' ? '' : ' · Telephone');
  }
  TPCall.on('state', function () { paintCall(); paintList(); });
  TPCall.on('tick', function () { var c = TPCall.current(); if (c && c.state === 'active') { $('c-state').textContent = fmt((Date.now() - c.t0) / 1000); document.title = '📞 ' + fmt((Date.now() - c.t0) / 1000) + ' · Telephone'; } });
  TPCall.on('ring', function (c) {
    if (inHub && document.hidden) { try { window.top.HubNotify.notice({ icon: '📞', title: 'Telephone', text: (c.name || c.num) + ' is calling', timeoutMs: 15000 }); } catch (_) { /* cross-origin / no Hub */ } }
  });
  TPCall.on('missed', function (c) { toast('Missed call from ' + (c.name || c.num)); });
  TPCall.on('blocked', function (b) { $('sound').hidden = !b; });
  $('sound').onclick = function () { TPCall.unlock(); $('sound').hidden = true; };
  document.addEventListener('pointerdown', function () { if (!TPCall.soundOk()) TPCall.unlock(); }, true);
  $('b-answer').onclick = function () { TPCall.answer().catch(function (e) { dialog(e.message, ['OK']); }); };
  $('b-decline').onclick = function () { TPCall.decline(); };
  $('b-hang').onclick = function () { TPCall.hangup(); };
  $('b-mute').onclick = function () { TPCall.mute(); };
  $('b-sink').onclick = chooseSink; $('b-sink2').onclick = chooseSink;

  /* ---------- speaker (audio output) ---------- */
  function paintSink() {
    var id = TPSave.get('sink');
    if (!TPCall.sinkOk()) { $('sink-lbl').textContent = 'Chosen by the browser'; return; }
    if (!id) { $('sink-lbl').textContent = 'Default'; return; }
    TPCall.outputs().then(function (l) { var o = l.filter(function (x) { return x.id === id; })[0]; $('sink-lbl').textContent = o ? o.label : 'Saved speaker'; });
  }
  function chooseSink() {
    if (!TPCall.sinkOk()) {
      if (navigator.mediaDevices && navigator.mediaDevices.selectAudioOutput) { TPCall.pickOutput().then(function (d) { toast('🔊 ' + (d.label || 'Speaker chosen')); paintSink(); paintCall(); }, function () { /* closed */ }); return; }
      dialog('This browser does not let a web page pick the speaker. Use the phone’s own volume and speaker buttons, or plug in headphones.', ['OK']);
      return;
    }
    TPCall.outputs().then(function (l) {
      var cur = TPSave.get('sink') || '';
      var list = [{ id: '', label: 'Default output', on: !cur }].concat(l.filter(function (o) { return o.id !== 'default' && o.id !== ''; }).map(function (o) { return { id: o.id, label: o.label, on: o.id === cur }; }));
      var txt = list.length > 1 ? 'Play calls on:' : 'Only the default output was found. More speakers show here once the browser can see them (usually during a call).';
      return dialog(txt, ['Close'], { list: list }).then(function (r) {
        if (!r || r.pick === undefined) return;
        TPCall.setSink(r.pick).then(function () { toast('🔊 ' + (list.filter(function (x) { return x.id === r.pick; })[0] || {}).label); paintSink(); paintCall(); }, function (e) { dialog(e.message, ['OK']); paintSink(); });
      });
    });
  }

  /* ---------- recent calls ---------- */
  function when(t) {
    var d = new Date(t), now = new Date(), hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    var day = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    if (day === 0) return 'Today ' + hm; if (day === 1) return 'Yesterday ' + hm;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + hm;
  }
  var LWHY = { busy: 'busy', declined: 'declined', noanswer: 'no answer', notfound: 'not online', unreachable: 'not reached', failed: 'failed', cancelled: 'cancelled', mic: 'no microphone', lost: 'dropped' };
  function paintLog() {
    var ul = $('log'), l = TPSave.log(), online = {};
    TPPeer.roster().forEach(function (d) { if (d.num) online[d.num] = d; });
    ul.innerHTML = ''; $('log-empty').hidden = l.length > 0; $('b-clear').hidden = !l.length;
    var miss = l.filter(function (e) { return e.dir === 'missed'; }).length;
    $('log-sub').textContent = l.length ? l.length + ' call' + (l.length === 1 ? '' : 's') + (miss ? ' · ' + miss + ' missed' : '') : '';
    l.forEach(function (e) {
      var li = document.createElement('li'); li.className = e.dir; li.dataset.num = e.num;
      var ic = document.createElement('span'); ic.className = 'ic'; ic.textContent = e.dir === 'in' ? '↙' : e.dir === 'out' ? '↗' : '✕';
      ic.title = e.dir === 'in' ? 'Incoming' : e.dir === 'out' ? 'Outgoing' : 'Missed';
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = (online[e.num] && online[e.num].name) || e.name || e.num;
      var sub = document.createElement('small'); var nb = document.createElement('span'); nb.className = 'num'; nb.textContent = e.num;
      var what = e.dir === 'missed' ? 'missed' + (e.why === 'busy' ? ' (you were on a call)' : '') : (e.dur || e.why === 'done') ? fmt(e.dur) : (LWHY[e.why] || (e.dir === 'in' ? 'incoming' : 'outgoing'));
      sub.appendChild(nb); sub.appendChild(document.createTextNode(' · ' + (e.dir === 'in' ? 'in' : e.dir === 'out' ? 'out' : '') + (e.dir === 'missed' ? '' : ' · ') + what + (online[e.num] ? ' · online' : '')));
      nm.appendChild(sub);
      var tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = when(e.at);
      li.append(ic, nm, tm);
      li.title = 'Call ' + e.num + ' back';
      li.onclick = function () { call(e.num); };
      ul.appendChild(li);
    });
  }
  TPSave.onlog = paintLog;
  $('b-clear').onclick = function () { dialog('Clear all recent calls on this device?', ['Cancel', 'Clear']).then(function (i) { if (i === 1) { TPSave.clearLog(); toast('Recent calls cleared'); } }); };
  setInterval(function () { if (page === 1) paintLog(); }, 60000);   // keep "Today / Yesterday" right

  /* ---------- keyboard ---------- */
  addEventListener('keydown', function (e) {
    if (!$('dialog').hidden || e.target.closest('input,textarea,select') || e.ctrlKey || e.metaKey || e.altKey) return;
    var c = TPCall.current();
    if (c && c.state !== 'ended') {
      if (e.key === 'Enter' && c.state === 'incoming') { e.preventDefault(); $('b-answer').click(); }
      else if (e.key === 'Escape') { e.preventDefault(); TPCall.hangup(); }
      return;
    }
    if (page !== 0) return;
    if (/^[0-9*#]$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); dial = dial.slice(0, -1); paintDial(); }
    else if (e.key === 'Enter' && dial) { e.preventDefault(); call(dial); }
  });

  /* ---------- screens + swipe (75 px, wrap-around) ---------- */
  function show(i) { page = i; $('viewport').scrollLeft = 0; $('track').style.transform = 'translateX(' + (-100 / PAGES * i) + '%)'; document.querySelectorAll('.dot').forEach(function (d, k) { d.classList.toggle('on', k === i); }); if (i === 1) paintLog(); }
  document.querySelectorAll('.dot').forEach(function (d) { d.onclick = function () { show(+d.dataset.i); }; });
  (function () {
    var x0 = null, y0 = 0, vp = $('viewport');
    vp.addEventListener('pointerdown', function (e) { if (e.target.closest('input,select,button,textarea,a,#pad')) return; x0 = e.clientX; y0 = e.clientY; });
    vp.addEventListener('pointerup', function (e) {
      if (x0 === null) return; var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) < SW || Math.abs(dy) > Math.abs(dx)) return;
      show((page + (dx < 0 ? 1 : -1) + PAGES) % PAGES);
    });
  })();

  /* ---------- settings ---------- */
  var inName = $('in-name');
  inName.value = TPSave.get('name') || TPSave.name();
  inName.addEventListener('change', function () { TPSave.set('name', inName.value.trim().slice(0, 40)); paintMe(); TPPeer.update(); toast('Name saved'); });
  function paintVol() { $('vol').value = Math.round(TPSave.get('volume') * 100); }
  $('vol').addEventListener('input', function () { TPCall.setVolume(this.value / 100); });
  $('chk-keys').checked = !!TPSave.get('keytones'); $('chk-keys').onchange = function () { TPSave.set('keytones', this.checked); };
  function paintSeg() { document.querySelectorAll('.seg[data-key=theme] button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === TPSave.get('theme')); }); }
  document.querySelectorAll('.seg[data-key=theme] button').forEach(function (b) { b.onclick = function () { TPSave.set('theme', b.dataset.v); paintSeg(); }; });

  /* ---------- start ---------- */
  paintMe(); paintSeg(); paintVol(); paintSink(); paintList(); paintLog(); paintCall();
  boot();
  window.TPApp = { show: show, dial: function () { return dial; } };   // test hook
})();
