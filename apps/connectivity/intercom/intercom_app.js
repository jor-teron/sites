/* Intercom IC2 — UI: screens (Talk, Settings), dots + 75 px wrap-around swipes, in-app dialogs,
   device list (Everyone + each device; tap to pick who you talk to; 📹 View on devices that trust this one),
   Talk button + Video toggle + camera flip + DND + volume on the right, "who's talking" banner with Reply /
   Two-way / Stop, video stage (callers' doorbell views + your own small preview), red "Camera on" bar + Stop,
   Settings: Video (start with video, front/back) and Auto-answer (off by default, trusted devices list).
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
          if (ask && b === 'Public') { $('dialog').hidden = true; return res('0000'); }   // IC3
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
    started = true; code = c; $('code-lbl').textContent = c === '0000' ? '0000 · Public' : c;
    ICSave.setLastCode(c);
    ICPeer.start(c).catch(function () { setStatus('PeerJS could not load (offline?)'); });
  }
  /* IC2: function askCode() { dialog('Enter the 4-digit Hub Connect Code shown on the Hub.', ['Cancel', 'Join'], true).then(function (c) { if (c) go(c); }); } */
  function askCode() { dialog('Enter the 4-digit Hub Connect Code shown on the Hub, or use Public to meet any device on the open Hub mesh (0000). Strangers there must be accepted before you hear them.', ['Cancel', 'Public', 'Join'], true).then(function (c) { if (c) go(c); }); }
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
      li.append(av, nm);
      if (!d.all && ICTalk.canView(d.id)) {
        var watching = tk[d.id] && tk[d.id].view && tk[d.id].mine;
        var vw = document.createElement('button'); vw.className = 'vw' + (watching ? ' on' : '');
        vw.textContent = watching ? '■ Stop' : ICTalk.asking(d.id) ? 'Asking…' : '📹 View';
        vw.title = watching ? 'Stop watching ' + (d.name || 'Device') : 'Open ' + (d.name || 'Device') + '’s camera (it trusts this device)';
        vw.onclick = function (e) { e.stopPropagation(); viewBtn(d); };
        li.appendChild(vw);
        if (!tk[d.id] && !(s && s.calls[d.id])) sub.textContent = 'online · trusts this device';
      }
      li.appendChild(st);
      li.onclick = function () {
        if (ICTalk.talking()) { toast('Stop talking first, then pick who to talk to'); return; }
        if (d.dnd) toast(d.name + ' has Do Not Disturb on');
        setTarget(d.id);
      };
      ul.appendChild(li);
    });
  }
  function viewBtn(d) {
    var t = ICTalk.talkers().filter(function (x) { return x.id === d.id; })[0];
    if (t && t.view && t.mine) { ICTalk.stopView(d.id); return; }
    if (ICTalk.asking(d.id)) return;
    ICTalk.unlock();
    ICTalk.requestView(d.id).then(function () { toast('Asking ' + (d.name || 'the device') + ' to open its camera…'); paintList(); }, function (e) { dialog(e.message, ['OK']); });
  }
  function targetName() {
    var t = target(); if (t === 'all') return 'Everyone';
    var d = ICPeer.roster().filter(function (x) { return x.id === t; })[0];
    return d ? d.name || 'Device' : 'Everyone';
  }
  ICPeer.on('status', setStatus);
  ICPeer.on('roster', function (l) {
    var t = target(); if (t !== 'all' && !l.some(function (d) { return d.id === t; }) && !ICTalk.talking()) ICSave.set('target', 'all');
    ICTalk.roster(l); paintList(); paintTalk(); paintBanner(); paintTrust();
  });
  ICPeer.on('signal', function (m, from) { ICTalk.signal(m, from); });
  ICPeer.on('call', function (c) { ICTalk.incoming(c); });
  ICPeer.on('online', function () { paintTalk(); });
  ICTalk.on('ask', function (a) {   // IC3: untrusted caller on the public mesh
    dialog((a.name || 'A device') + ' on the public mesh wants to ' + (a.video ? 'talk with video' : 'talk') + '. Accept?', ['Decline', 'Accept']).then(function (i) { ICTalk.unlock(); a.answer(i === 1); });
  });

  /* ---------- talk button (tap = toggle, hold > 0.5 s = push-to-talk) ---------- */
  var downAt = 0, startedByDown = false, timeTxt = '';
  function fmt(ms) { var s = Math.floor(ms / 1000); return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function paintTalk() {
    var s = ICTalk.talking(), b = $('b-talk');
    b.classList.toggle('live', !!(s && !s.starting)); b.classList.toggle('wait', !!(s && s.starting));
    $('talk-lbl').textContent = s ? (s.starting ? 'Starting…' : 'Live ' + (timeTxt || '0:00')) : 'Talk';
    var tn = s ? (s.all ? 'Everyone' : (ICPeer.roster().filter(function (x) { return x.id === s.to; })[0] || {}).name || 'Device') : targetName();
    $('talk-to').textContent = 'to ' + tn;
    $('talk-hint').textContent = s ? (s.view ? 'Camera view · tap to stop' : 'Tap to stop' + (s.all && !s.starting ? ' · ' + Object.keys(s.calls).length + ' hearing' : '')) : 'Tap to talk, tap again to stop · or hold';
    var vOn = s && !s.starting ? !!s.camOn : !!ICSave.get('video');
    $('b-vid').classList.toggle('vid', vOn); $('b-vid').lastChild.textContent = vOn ? 'Video on' : 'Video off';
    $('b-vid').title = s && !s.starting ? (vOn ? 'Turn your camera off' : 'Turn your camera on for this talk') : 'Start talks with video';
    $('chk-video').checked = !!ICSave.get('video');
    $('b-flip').hidden = !vOn;
    $('b-flip').title = 'Switch camera (now ' + (ICSave.get('facing') === 'environment' ? 'back' : 'front') + ')';
    paintCamOn(); paintStage(); paintFacing();
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
  ICTalk.on('note', function (t) { toast(t); paintList(); });
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
      if (t.view) {
        b.nextSibling.textContent = t.mine ? ' · camera view' : ' · camera view (auto-answer)';
        sm.textContent = 'live until stopped';
        if (!(s && !s.all && s.to === t.id)) rp.textContent = '🎙️ Talk back';
      } else if (t.video) sm.textContent += t.cam ? ' · with video' : ' · camera off';
      row.append(w, tx);
      if (t.video && !(s && !s.all && s.to === t.id && s.camOn)) {
        var tw = document.createElement('button'); tw.className = 'mini'; tw.textContent = '📹 Two-way'; tw.title = 'Talk back with your camera on';
        tw.onclick = function () { twoWay(t.id); };
        row.appendChild(tw);
      }
      row.appendChild(rp);
      if (t.view && t.mine) {
        var sv = document.createElement('button'); sv.className = 'mini'; sv.textContent = '■ Stop'; sv.title = 'Stop watching';
        sv.onclick = function () { ICTalk.stopView(t.id); };
        row.appendChild(sv);
      }
      bn.appendChild(row);
    });
    paintTitle();
  }
  function paintTitle() {
    var list = ICTalk.talkers(), s = ICTalk.talking(), cam = s && !s.starting && (s.camOn || s.view);
    document.title = (cam ? '🔴 ' : '') + (list.length ? '🔊 ' + list.map(function (t) { return t.name; }).join(', ') + ' · Intercom IC2' : 'Intercom IC2');
  }
  function twoWay(id) {
    var s = ICTalk.talking();
    ICTalk.unlock();
    if (s && !s.all && s.to === id) { if (!s.camOn) ICTalk.setVideo(true).catch(function (e) { dialog(e.message, ['OK']); }); return; }
    if (s) ICTalk.stop();
    setTarget(id);
    ICTalk.start(id, { video: true }).catch(function (e) { dialog(e.message, ['OK']); });
  }

  /* ---------- IC2: camera-on bar + video stage ---------- */
  function paintCamOn() {
    var s = ICTalk.talking(), bar = $('camon');
    var on = !!(s && !s.starting && (s.camOn || s.view));
    bar.hidden = !on; if (!on) return;
    var who = s.all ? 'everyone' : ((ICPeer.roster().filter(function (x) { return x.id === s.to; })[0] || {}).name || s.viewer || 'Device');
    $('camon-t').textContent = s.view
      ? (s.camOn ? 'Camera on · ' : 'Microphone on · ') + who + ' is watching (auto-answer)'
      : 'Camera on · ' + (s.all ? 'everyone can see you' : who + ' can see you');
  }
  $('b-camstop').onclick = function () { ICTalk.stop(); };
  var tiles = {};
  function mkTile(key) {
    var el = document.createElement('div'); el.className = 'vt'; el.dataset.k = key;
    var lbl = document.createElement('span'); lbl.className = 'lbl';
    var off = document.createElement('div'); off.className = 'off'; off.textContent = '📷 Camera off'; off.hidden = true;
    var acts = document.createElement('div'); acts.className = 'acts';
    el.append(off, lbl, acts); el._lbl = lbl; el._off = off; el._acts = acts;
    return el;
  }
  function paintStage() {
    var st = $('stage'), want = {}, s = ICTalk.talking();
    ICTalk.talkers().forEach(function (t) {
      if (!t.video || !t.el) return;
      var k = 't-' + t.id; want[k] = 1;
      var tile = tiles[k] || (tiles[k] = mkTile(k));
      if (tile.parentNode !== st) st.appendChild(tile);
      if (t.el.parentNode !== tile) { tile.insertBefore(t.el, tile.firstChild); t.el.play().catch(function () {}); }
      tile.classList.toggle('view', !!t.view);
      tile._lbl.textContent = t.name + (t.view ? ' · camera view' : '') + (t.state === 'chime' ? ' · …' : '');
      tile._off.hidden = t.cam !== false;
    });
    if (s && !s.starting && s.camOn && s.stream) {
      want.me = 1;
      var me = tiles.me;
      if (!me) {
        me = tiles.me = mkTile('me'); me.classList.add('me');
        var v = document.createElement('video'); v.muted = true; v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', '');
        me.insertBefore(v, me.firstChild); me._v = v;
        var fb = document.createElement('button'); fb.className = 'mini'; fb.textContent = '🔄'; fb.title = 'Switch camera'; fb.onclick = flip;
        me._acts.appendChild(fb);
      }
      if (me._v.srcObject !== s.stream) { me._v.srcObject = s.stream; }
      if (st.lastChild !== me) st.appendChild(me);   // keep last (it floats over the others)
      if (me._v.paused) me._v.play().catch(function () {});
      me._lbl.textContent = 'You' + (ICSave.get('facing') === 'environment' ? ' · back camera' : '');
      me.classList.toggle('back', ICSave.get('facing') === 'environment');
    }
    var remote = Object.keys(want).filter(function (k) { return k !== 'me'; }).length;
    if (tiles.me) tiles.me.classList.toggle('solo', !remote);
    Object.keys(tiles).forEach(function (k) {
      if (want[k]) return;
      var tl = tiles[k]; if (k === 'me' && tl._v) tl._v.srcObject = null;
      tl.remove(); delete tiles[k];
    });
    st.hidden = !Object.keys(want).length;
  }
  function flip() {
    ICTalk.flip().then(function (back) { toast(back ? 'Back camera' : 'Front camera'); paintTalk(); }, function (e) { toast(e.message); paintTalk(); });
  }
  $('b-flip').onclick = flip;
  $('b-vid').onclick = function () {
    var s = ICTalk.talking(), on = s && !s.starting ? !s.camOn : !ICSave.get('video');
    ICTalk.unlock();
    ICTalk.setVideo(on).then(function () { if (!s) toast(on ? '📹 Your next talk starts with video' : 'Talks are voice only'); paintTalk(); }, function (e) { dialog(e.message, ['OK']); paintTalk(); });
  };
  $('chk-video').onchange = function () { if (!ICTalk.talking()) ICSave.set('video', this.checked); else ICTalk.setVideo(this.checked).catch(function (e) { toast(e.message); }); paintTalk(); };
  function paintFacing() { document.querySelectorAll('.seg[data-key=facing] button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === ICSave.get('facing')); }); }
  document.querySelectorAll('.seg[data-key=facing] button').forEach(function (b) {
    b.onclick = function () { if (b.dataset.v !== ICSave.get('facing')) flip(); };
  });
  ICTalk.on('view', function (s) {
    toast('🔴 Camera on: ' + s.viewer + ' is watching (auto-answer)');
    if (inHub) { try { window.top.HubNotify.notice({ icon: '🔴', title: 'Intercom', text: 'Camera on: ' + s.viewer + ' is watching', timeoutMs: 8000 }); } catch (_) { /* cross-origin / no Hub */ } }
  });
  ICTalk.on('refused', function (r) { if (r.why === 'off' || r.why === 'dnd') toast(r.name + ' tried to open the camera (' + (r.why === 'dnd' ? 'Do Not Disturb is on' : 'auto-answer is off') + ')'); });
  ICTalk.on('viewing', paintList);
  ICTalk.on('keys', function () { paintList(); paintTrust(); });

  /* ---------- IC2: auto-answer settings ---------- */
  function paintTrust() {
    var ul = $('trust-list'), tr = ICSave.get('trusted') || {}, rows = {}, order = [];
    ICPeer.roster().forEach(function (d) { if (d.did && !rows[d.did]) { rows[d.did] = { did: d.did, name: d.name || 'Device', online: true }; order.push(d.did); } });
    Object.keys(tr).forEach(function (did) { if (!rows[did]) { rows[did] = { did: did, name: tr[did].name || 'Device', online: false }; order.push(did); } });
    ul.innerHTML = '';
    order.forEach(function (did) {
      var r = rows[did], li = document.createElement('li');
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = r.name;
      var sm = document.createElement('small'); sm.textContent = (r.online ? 'online' : 'offline') + (tr[did] ? ' · trusted' : ''); nm.appendChild(sm);
      var sw = document.createElement('input'); sw.type = 'checkbox'; sw.className = 'sw'; sw.checked = !!tr[did]; sw.setAttribute('aria-label', 'Trust ' + r.name);
      sw.onchange = function () {
        ICTalk.trust(did, r.name, sw.checked);
        toast(sw.checked ? r.name + ' is trusted' + (ICSave.get('autoAnswer') ? '' : ' (turn on Auto-answer to let it in)') : r.name + ' is no longer trusted');
        paintTrust();
      };
      li.append(nm, sw); ul.appendChild(li);
    });
    $('trust-empty').hidden = order.length > 0;
    var keys = ICSave.get('keys') || {}, kn = Object.keys(keys).map(function (k) { return keys[k].name; });
    $('keys-line').hidden = !kn.length;
    $('keys-line').textContent = kn.length ? 'These devices trust this one: ' + kn.join(', ') + '. Use 📹 View next to them on the Talk screen.' : '';
    $('chk-aa').checked = !!ICSave.get('autoAnswer');
  }
  $('chk-aa').onchange = function () {
    ICTalk.setAutoAnswer(this.checked);
    toast(this.checked ? 'Auto-answer on: trusted devices can open this camera without a tap' : 'Auto-answer off');
    paintTalk();
  };
  ICTalk.on('talkers', function () { paintBanner(); paintList(); paintStage(); });
  ICTalk.on('talk', paintBanner);
  ICTalk.on('trust', paintTrust);
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
  paintSeg(); paintDnd(); paintVol(); paintList(); paintTalk(); paintBanner(); paintTrust();
  boot();
})();
