/* Telephone TP2b — UI: screens (Phone, Recent, Contacts, Settings), dots + 75 px wrap-around swipes, in-app dialogs only.
   TP2: contacts (add / edit / delete with an in-app confirm, ⭐ favourites, online state, add from Recent), names from
   contacts everywhere (online list, keypad, Recent, ringing screen), missed-call badge on the Recent dot + "(n)" in the tab
   title (cleared when Recent is seen; Hub notice when hidden inside the Hub), Do Not Disturb (🌙 on Phone + Settings),
   video during a call (Video / Flip, theirs big + mine small).
   Phone: my number (big) + Online now on the left; dial display + keypad + Call on the RIGHT (phone: stacked).
   Call screen (overlay): who + state / timer on the left, Answer · Decline or Mute · Speaker · Hang up on the RIGHT.
   TP2b numbers: 5 digits (10000–99999). A new number (fresh device, or replacing a saved 4-digit one ONCE) is checked
   against the online roster before it is saved (re-picked if taken); no roster within CHECK_MS → it is kept.
   Later clash: when another device (other did) has my number, the one whose number was set more recently (roster 'at')
   takes a new one with an in-app notice; same 'at' → the higher device id moves. Old 4-digit contacts / Recent entries stay
   (shown as "old number") until their device is seen with its new number (by device id, or by its advertised 'old').
   Hub code, in order: #code= / ?hub= (QR), the Hub's {sharedLink:'hello'} (inside the Hub, after we post
   {sharedLink:'ready'}), parent.__hubRemote.code (phone Hub), localStorage 'jtsites-hub-ctrl-code' (desktop Hub),
   'shared-link-join-code', our last code, else the code dialog.
   TP4: URL code, else the Hub's active private mesh (parent.HubMeshLink), else Public 0000; the Hub's own Connect
   Code is only a fallback for older Hubs without HubMeshLink; standalone: last code, else 0000. Keyboard: digits, Backspace, Enter = call / answer, Esc = hang up. */
(function () {
  'use strict';
  // FC5: Hub codes are 5 digits (H83); public lobby is SharedLink.LOBBY, else '00000'. Saved 4-digit codes are ignored.
  var PUB = (function () { try { var S = window.SharedLink || (window.parent && window.parent.SharedLink) || (window.top && window.top.SharedLink); if (S && /^\d{5}$/.test(String(S.LOBBY || ''))) return String(S.LOBBY); } catch (_) {} return '00000'; })();
  function c5(c) { c = String(c || ''); return /^\d{5}$/.test(c) ? c : ''; }   // FC5: drops saved 4-digit codes
  var $ = function (id) { return document.getElementById(id); };
  var inHub = window.parent !== window, page = 0, PAGES = 4, SW = 75, started = false, code = '', dial = '', baseTitle = document.title;

  /* ---------- dialogs / toast ---------- */
  function dialog(text, buttons, opt) {
    opt = opt || {};
    return new Promise(function (res) {
      $('d-text').textContent = text;
      var inp = $('d-input'), ask = !!opt.ask; inp.hidden = !ask; inp.value = '';
      var lst = $('d-list'); lst.innerHTML = ''; lst.hidden = !opt.list;
      var frm = $('d-form'); frm.innerHTML = ''; frm.hidden = !opt.form; var fin = {};
      (opt.form || []).forEach(function (f) {
        var lb = document.createElement('label'), inp2 = document.createElement('input');
        inp2.id = 'f-' + f.k; inp2.name = f.k;
        if (f.type === 'check') { lb.className = 'ck'; inp2.type = 'checkbox'; inp2.className = 'sw'; inp2.checked = !!f.value; lb.append(document.createTextNode(f.label), inp2); }
        else { inp2.value = f.value || ''; if (f.max) inp2.maxLength = f.max; if (f.mode) inp2.inputMode = f.mode; if (f.ph) inp2.placeholder = f.ph; lb.append(document.createTextNode(f.label), inp2); }
        fin[f.k] = inp2; frm.appendChild(lb);
      });
      (opt.list || []).forEach(function (it) {
        var b = document.createElement('button'); b.textContent = it.label; b.className = it.on ? 'on' : '';
        b.onclick = function () { $('dialog').hidden = true; res({ pick: it.id }); };
        lst.appendChild(b);
      });
      var row = $('d-row'); row.innerHTML = '';
      (buttons || ['OK']).forEach(function (b, i, a) {
        var el = document.createElement('button'); el.className = (i === a.length - 1 ? 'btn' : 'mini') + (opt.danger === i ? ' danger' : ''); el.textContent = b;
        el.onclick = function () {
          if (opt.form && i === a.length - 1) {
            var v = {}; Object.keys(fin).forEach(function (k) { v[k] = fin[k].type === 'checkbox' ? fin[k].checked : fin[k].value.trim(); fin[k].classList.remove('err'); });
            var bad = opt.check ? opt.check(v) : null;
            if (bad) { $('d-text').textContent = bad.text; if (fin[bad.k]) { fin[bad.k].classList.add('err'); fin[bad.k].focus(); } return; }
            $('dialog').hidden = true; return res(v);
          }
          if (ask && b === 'Public') { $('dialog').hidden = true; return res(PUB); }   // TP4
          if (ask && i === a.length - 1) { var c = (inp.value.match(/\d{5}/) || [''])[0]; if (!c) { $('d-text').textContent = 'Enter the 5-digit code.'; return; } $('dialog').hidden = true; return res(c); }
          $('dialog').hidden = true; res(ask ? null : i);
        };
        row.appendChild(el);
      });
      $('dialog').hidden = false; if (ask) setTimeout(function () { inp.focus(); }, 50);
      if (opt.form) setTimeout(function () { var f0 = $('d-form').querySelector('input'); if (f0) f0.focus(); }, 50);
    });
  }
  $('d-form').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); var b = $('d-row').lastChild; if (b) b.click(); } });
  var toastT = 0;
  function toast(t) { var e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { e.classList.remove('show'); }, 2600); }

  /* ---------- code ---------- */
  var ls = TPSave.ls;
  function urlCode() { var m = (location.hash + '&' + location.search).match(/(?:code|hub|join)=(\d{5})/); return m ? m[1] : ''; }
  /* TP4: old code choice kept for reference (Hub's own Connect Code won; see readme Legacy code notes):
  // function localCode() {
  //   try { if (window.parent.__hubRemote && window.parent.__hubRemote.code) return String(window.parent.__hubRemote.code); } catch (_) { /* * / }
  //   var c = ls('jtsites-hub-ctrl-code'); if (/^\d{4}$/.test(c) && inHub) return c;
  //   c = ls('shared-link-join-code'); if (/^\d{4}$/.test(c) && inHub) return c;
  //   return '';
  // }
  // function go(c) {
  //   if (started) { if (c === code) return; TPCall.stop(); TPPeer.stop(); }
  //   started = true; code = c; $('code-lbl').textContent = c;
  //   TPSave.setLastCode(c);
  //   TPPeer.start(c).catch(function () { setStatus('PeerJS could not load (offline?)'); });
  // }
  // function askCode() { dialog('Enter the 4-digit Hub Connect Code shown on the Hub. Phones with the same code can call each other.', ['Cancel', 'Join'], { ask: true }).then(function (c) { if (c) go(c); }); }
  // function boot() {
  //   var c = urlCode();
  //   if (c) return go(c);
  //   if (inHub) {
  //     var got = false;
  //     addEventListener('message', function (e) {
  //       var d = e.data; if (e.source !== window.parent || !d || d.sharedLink !== 'hello' || got) return;
  //       if (/^\d{4}$/.test(String(d.code || ''))) { got = true; go(String(d.code)); }
  //     });
  //     try { window.parent.postMessage({ sharedLink: 'ready', app: 'telephone', types: ['x-none/'] }, '*'); } catch (_) { /* * / }
  //     setTimeout(function () { if (!got && !started) { var l = localCode() || TPSave.lastCode(); if (l) go(l); else { setStatus('Not connected'); askCode(); } } }, 800);
  //     return;
  //   }
  //   c = TPSave.lastCode() || ls('shared-link-join-code');
  //   if (/^\d{4}$/.test(c)) go(c); else { setStatus('Not connected'); askCode(); }
  // }
  */
  // TP4: default is Public 0000; private code only from the URL, an active Hub private mesh, or a manual pick.
  function hml() { try { var h = window.parent !== window && window.parent.HubMeshLink; return h && typeof h.isPrivate === 'function' ? h : null; } catch (_) { return null; } }
  function meshCode() { var h = hml(); if (!h) return ''; try { var c = h.isPrivate() ? String(h.privateCode() || '') : ''; return /^\d{5}$/.test(c) ? c : ''; } catch (_) { return ''; } }
  function localCode() {   // TP1 sources, now only a fallback for an older Hub without HubMeshLink
    try { if (window.parent.__hubRemote && window.parent.__hubRemote.code) { var r0 = c5(window.parent.__hubRemote.code); if (r0) return r0; } } catch (_) { /* */ }
    var c = ls('jtsites-hub-ctrl-code'); if (/^\d{5}$/.test(c) && inHub) return c;
    c = ls('shared-link-join-code'); if (/^\d{5}$/.test(c) && inHub) return c;
    return '';
  }
  var manual = false, fixed = false, offer = '';   // manual = picked this session; fixed = from the URL
  function desired() { return meshCode() || PUB; }
  function go(c) {
    if (started) { if (c === code) return; if (TPCall.busy()) { toast('Hang up first'); return; } TPCall.stop(); TPPeer.stop(); }
    started = true; code = c; $('code-lbl').textContent = c === PUB ? PUB + ' · Public' : c;
    TPSave.setLastCode(c); paintSwitch();
    TPPeer.start(c).catch(function () { setStatus('PeerJS could not load (offline?)'); toast('PeerJS could not load (offline?)'); });
  }
  function pick(c) { if (c) { manual = true; offer = ''; go(c); } }
  /* TP1: function askCode() { dialog('Enter the 4-digit Hub Connect Code shown on the Hub. Phones with the same code can call each other.', ['Cancel', 'Join'], { ask: true }).then(function (c) { if (c) go(c); }); } */
  function askCode() { dialog('Enter the 5-digit Hub Connect Code shown on the Hub, or use Public to meet every phone on the open Hub mesh (00000). Every call still rings and must be answered.', ['Cancel', 'Public', 'Join'], { ask: true }).then(pick); }
  function paintSwitch() {
    var el = $('tp-switch'); if (!el) return;
    el.hidden = !offer || offer === code;
    el.textContent = offer === PUB ? 'Back to Public' : 'Switch to ' + offer;
  }
  function checkMesh() {   // TP4: follow the Hub joining / leaving a private mesh; never mid-call
    if (!started || manual || fixed || !hml()) return;
    var d = desired(); if (d === code) { offer = ''; paintSwitch(); return; }
    if (!TPCall.busy()) { offer = ''; go(d); toast(d === PUB ? 'Hub left its private mesh — back to Public' : 'Hub joined private mesh ' + d); }
    else { offer = d; paintSwitch(); }
  }
  function boot() {
    var c = urlCode();
    if (c) { fixed = true; return go(c); }
    if (inHub) {
      if (hml()) return go(desired());
      var got = false;   // older Hub without HubMeshLink: TP1 order, ending at 00000
      addEventListener('message', function (e) {
        var d = e.data; if (e.source !== window.parent || !d || d.sharedLink !== 'hello' || got) return;
        if (/^\d{5}$/.test(String(d.code || '')) && !started) { got = true; go(String(d.code)); }
      });
      try { window.parent.postMessage({ sharedLink: 'ready', app: 'telephone', types: ['x-none/'] }, '*'); } catch (_) { /* */ }
      setTimeout(function () { if (!got && !started) go(localCode() || c5(TPSave.lastCode()) || PUB); }, 800);
      return;
    }
    c = TPSave.lastCode();
    go(/^\d{5}$/.test(c) ? c : PUB);
  }
  setInterval(checkMesh, +window.__tpMeshMs || 5000);
  if ($('tp-switch')) $('tp-switch').onclick = function () { if (TPCall.busy()) { toast('Hang up first'); return; } var d = offer; offer = ''; if (d) go(d); };
  // TP4: $('btn-code').onclick = askCode; $('btn-code2').onclick = askCode;
  if ($('btn-code')) $('btn-code').onclick = askCode;   // TP5: Code button removed from the Phone bar; Settings → Change stays
  $('btn-code2').onclick = askCode;
  // TP4: function setStatus(t) { $('status').textContent = t; }
  function setStatus(t) {   // TP5: status text lives on the small dot next to the name (title / aria-label)
    var el = $('net'); if (!el) return;
    el.title = t; el.setAttribute('aria-label', t);
    el.className = 'net ' + (/^Online/.test(t) ? 'on' : /could not|Not connected|Offline/i.test(t) ? 'off' : 'wait');
  }

  /* ---------- my number ---------- */
  function paintMe() {
    var pend = TPSave.pending();
    $('me-name').textContent = TPSave.name();
    $('my-num').textContent = TPSave.get('num'); $('num-lbl').textContent = TPSave.get('num');
    $('mycard').classList.toggle('pend', pend);
    // TP2b: $('my-sub').textContent = pend ? 'Checking that no other phone has this number…' : TPSave.name();
    $('my-sub').textContent = pend ? 'Checking…' : ''; $('my-sub').hidden = !pend;   // TP5: name only in the top bar
  }
  /* TP2b: check a new number before keeping it */
  var CHECK_MS = +window.__tpCheckMs || 5000, checkT = 0;
  function othersNums(list) { var did = TPSave.get('did'); return list.filter(function (d) { return d.num && d.did !== did; }).map(function (d) { return d.num; }); }
  function numChecked(list) {   // list = the roster that answered, or null when nobody answered in time
    clearTimeout(checkT);
    var r = TPSave.checked(list ? othersNums(list) : null); if (!r) return;
    paintMe(); TPPeer.update(); paintDial();
    if (r.old) dialog('Phone numbers now have 5 digits. This device’s old number ' + r.old + ' is now ' + r.num + '. Contacts on other phones follow by themselves once they see this device online.', ['OK']);
    else toast('Your number is ' + r.num);
  }
  if (TPSave.pending()) checkT = setTimeout(function () { numChecked(null); }, CHECK_MS);
  function checkClash(list) {   // a later clash (a device that was offline when my number was picked)
    if (TPSave.pending() || TPSave.fromHub()) return;   // FC5: the Hub number is unique per device, never renumbered
    var mine = TPSave.get('num'), did = TPSave.get('did'), my = +TPSave.get('numAt') || 0;
    var clash = list.filter(function (d) { var at = +d.at || 0; return d.num === mine && d.did && d.did !== did && (at < my || (at === my && d.did < did)); });
    if (!clash.length || TPCall.busy()) return;   // in a call: checked again when it ends
    var n = TPSave.newNum(othersNums(list).concat(mine));
    TPSave.setNum(n); paintMe(); TPPeer.update(); paintDial();
    dialog('Your number changed: “' + (clash[0].name || 'Another device') + '” already had the number ' + mine + ' first, so this device now has the number ' + n + '. Other phones need the new number to call you (your contacts on them follow by themselves).', ['OK']);
  }
  /* FC5: New number button removed (the number is this device's Hub number). TP2b code:
  // $('b-newnum').onclick = function () {
  //   if (TPCall.busy()) { toast('Hang up first'); return; }
  //   if (TPSave.pending()) { toast('Still checking your number…'); return; }
  //   dialog('Get a new random number for this device? Other phones will need the new number to call you.', ['Cancel', 'New number']).then(function (i) {
  //     if (i !== 1) return;
  //     var n = TPSave.newNum(othersNums(TPPeer.roster()).concat(TPSave.get('num')));
  //     TPSave.setNum(n); paintMe(); TPPeer.update(); toast('Your number is now ' + n);
  //   });
  // };
  */
  if ($('b-newnum')) $('b-newnum').hidden = true;

  /* ---------- names: contact first, then the device's own name ---------- */
  function initial(n) { return (n || '?').trim().charAt(0).toUpperCase() || '?'; }
  function nameFor(num, did, fallback) {
    var ct = TPSave.contact(num, did); if (ct) return ct.name;
    var d = num && TPCall.find(num); if (d && d.name) return d.name;
    return fallback || '';
  }
  function devFor(ct) {   // the online device of a contact: same device id first, else the number
    var l = TPPeer.roster();
    return (ct.did && l.filter(function (d) { return d.did === ct.did; }).sort(function (a, b) { return (b.since || 0) - (a.since || 0); })[0]) || TPCall.find(ct.num);
  }
  function stateOf(d) { return !d ? 'offline' : d.busy ? 'on a call' : d.dnd ? 'do not disturb' : 'online'; }

  /* ---------- online list ---------- */
  function paintList() {
    var ul = $('devices'), list = TPPeer.roster().filter(function (d) { return d.num; }).slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || '') || a.num.localeCompare(b.num); });
    ul.innerHTML = '';
    $('empty').hidden = list.length > 0;
    list.forEach(function (d) {
      var li = document.createElement('li'); li.dataset.id = d.id; li.dataset.num = d.num; li.className = d.busy ? 'busy' : '';
      var ct = TPSave.contact(d.num, d.did), who = ct ? ct.name : (d.name || 'Device');
      var av = document.createElement('span'); av.className = 'av'; av.textContent = initial(who);
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = who;
      if (ct && ct.fav) { var st = document.createElement('span'); st.className = 'fav'; st.textContent = '⭐'; nm.appendChild(st); }
      var sub = document.createElement('small'); var nb = document.createElement('span'); nb.className = 'num'; nb.textContent = d.num;
      sub.appendChild(nb); sub.appendChild(document.createTextNode(' · ' + stateOf(d) + (ct && d.name && d.name !== ct.name ? ' · ' + d.name : ''))); nm.appendChild(sub);
      var cl = document.createElement('button'); cl.className = 'cl'; cl.textContent = '📞'; cl.title = 'Call ' + who + ' (' + d.num + ')'; cl.setAttribute('aria-label', cl.title);
      li.append(av, nm, cl);
      li.onclick = function () { call(d.num); };
      ul.appendChild(li);
    });
    paintDial();
  }
  TPPeer.on('status', setStatus);
  TPPeer.on('roster', function (l) {
    if (TPSave.pending() && TPPeer.online()) numChecked(l);   // the lobby answered → check, then keep
    checkClash(l);
    l.forEach(function (d) {
      if (!d.did || !d.num) return;
      TPSave.followNum(d.did, d.num, d.old).forEach(function (n) { toast(n + '’s number is now ' + d.num); });
      TPSave.followLog(d.did, d.num, d.old);
    });
    TPCall.roster(l); paintList(); paintLog(); paintContacts();
  });
  TPPeer.on('signal', function (m, from) { TPCall.signal(m, from); });
  TPPeer.on('call', function (c) { TPCall.incoming(c); });
  TPPeer.on('online', function () { paintDial(); });

  /* ---------- keypad ---------- */
  function paintDial() {
    $('dial').textContent = dial; $('b-back').disabled = !dial;
    var w = $('dial-who'); w.className = 'mut';
    if (dial.length === 5) {
      var d = dial === TPSave.get('num') ? null : TPCall.find(dial);
      if (dial === TPSave.get('num')) { w.textContent = 'This is your own number'; w.classList.add('no'); }
      else if (d) { w.textContent = nameFor(d.num, d.did, d.name || 'Device') + (d.busy ? ' · on a call' : d.dnd ? ' · do not disturb' : ''); w.classList.add('ok'); }
      else { var ct = TPSave.contact(dial); w.textContent = (ct ? ct.name + ' · ' : '') + 'Not online right now'; w.classList.add('no'); }
    } else w.innerHTML = dial ? 'Numbers have 5 digits' : '&nbsp;';
    $('b-call').disabled = TPCall.busy();
  }
  function press(k) {
    TPCall.unlock(); TPCall.key(k);
    if (/\d/.test(k) && dial.length < 5) dial += k;
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
  var WHY = { dnd: 'Do Not Disturb', busy: 'Busy', declined: 'Call declined', noanswer: 'No answer', notfound: 'Not online', unreachable: 'Could not reach the phone', failed: 'Call could not connect', lost: 'Call dropped', mic: 'Microphone not available', missed: 'Missed call', cancelled: 'Call cancelled', done: 'Call ended' };
  function fmt(s) { s = Math.floor(s); var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + s % 60).slice(-2); }
  function paintCall() {
    var c = TPCall.current(), box = $('call');
    box.hidden = !c;
    $('b-call').disabled = TPCall.busy();
    if (!c) { document.title = titleBase(); paintVideo(null); return; }
    var who = nameFor(c.num, c.did, c.name);
    var vid = paintVideo(c);
    box.className = (c.state === 'incoming' ? 'ring' : c.state) + (vid ? ' vid' : '');
    $('c-av').textContent = who ? initial(who) : '#';
    $('c-name').textContent = who || c.num;
    $('c-num').textContent = who ? c.num : '';
    var st = '', note = '';
    if (c.state === 'dialing') st = 'Calling…';
    else if (c.state === 'ringing') { st = c.acked ? 'Ringing…' : 'Calling…'; var d = TPCall.find(c.num); if (d && d.busy) note = 'They may be on another call'; }
    else if (c.state === 'incoming') st = 'Incoming call';
    else if (c.state === 'connecting') st = 'Connecting…';
    else if (c.state === 'active') { st = fmt((Date.now() - c.t0) / 1000); if (c.rmuted) note = (c.name || 'They') + ' muted their microphone'; else if (c.muted) note = 'You are muted'; }
    else if (c.state === 'ended') {
      st = WHY[c.why] || 'Call ended';
      if (c.why === 'notfound') note = 'Nobody with the number ' + c.num + ' is online on this Hub code';
      else if (c.why === 'busy') note = (who || 'They') + ' is on another call. Try again later.';
      else if (c.why === 'dnd') note = (who || 'They') + ' has Do Not Disturb on. Try again later.';
      else if (c.why === 'noanswer') note = (c.name || 'They') + ' did not answer';
      else if (c.dur) note = fmt(c.dur);
    }
    $('c-state').textContent = st; $('c-note').textContent = note;
    $('c-in').hidden = c.state !== 'incoming';
    $('c-on').hidden = c.state === 'incoming';
    var live = c.state !== 'ended';
    $('b-mute').disabled = !live || !c.stream; $('b-hang').disabled = !live; $('b-sink').disabled = !live;
    var vo = !!c.vout;
    $('b-video').disabled = c.state !== 'active' || !!(c.vout && c.vout.starting); $('b-video').classList.toggle('on', vo);
    $('b-video').querySelector('.lb').textContent = vo ? 'Video off' : 'Video';
    $('b-flip').disabled = !(c.vout && c.vout.stream);
    $('b-mute').classList.toggle('on', !!c.muted); $('b-mute').querySelector('.lb').textContent = c.muted ? 'Unmute' : 'Mute';
    $('b-mute').querySelector('.ic').textContent = c.muted ? '🔇' : '🎙️';
    $('b-sink').classList.toggle('on', !!TPSave.get('sink'));
    document.title = (c.state === 'incoming' ? '📞 ' + (who || c.num) + ' calling' : c.state === 'active' ? '📞 ' + fmt((Date.now() - c.t0) / 1000) : c.state === 'ended' ? '' : '📞 Calling ' + (who || c.num)) + (c.state === 'ended' ? '' : ' · Telephone');
    if (c.state === 'ended') document.title = titleBase();
  }
  function setSrc(el, st) { if (el.srcObject !== st) { el.srcObject = st; if (st) el.play().catch(function () { /* muted video: autoplay allowed */ }); } }
  function paintVideo(c) {   // returns true when the video stage is showing
    var vin = c && c.vin && c.vin.stream, vout = c && c.vout && c.vout.stream, on = !!(c && c.state === 'active' && (vin || vout || c.rvid));
    $('c-stage').hidden = !on;
    setSrc($('v-remote'), on && vin ? vin : null); $('v-remote').hidden = !(on && vin);
    setSrc($('v-self'), on && vout ? vout : null); $('v-self').hidden = !(on && vout);
    $('v-self').classList.toggle('solo', !vin); $('v-self').classList.toggle('mir', TPSave.get('facing') === 'user');
    $('v-wait').hidden = !(on && c.rvid && !vin);
    return on;
  }
  TPCall.on('state', function () { try { TPAlert.update(TPCall.current()); } catch (_) { /* TP6 */ } paintCall(); paintList(); if (!TPCall.current()) seen(); if (!TPCall.busy()) checkClash(TPPeer.roster()); });
  TPCall.on('tick', function () { var c = TPCall.current(); if (c && c.state === 'active') { $('c-state').textContent = fmt((Date.now() - c.t0) / 1000); document.title = '📞 ' + fmt((Date.now() - c.t0) / 1000) + ' · Telephone'; } });
  TPCall.on('ring', function (c) {
    if (inHub && document.hidden) { try { window.top.HubNotify.notice({ icon: '📞', title: 'Telephone', text: (c.name || c.num) + ' is calling', timeoutMs: 15000 }); } catch (_) { /* cross-origin / no Hub */ } }
  });
  TPCall.on('missed', function (c) {
    if (c.why === 'dnd') return;   // Do Not Disturb: silent, only the badge
    var who = nameFor(c.num, c.did, c.name) || c.num;
    toast('Missed call from ' + who);
    if (inHub && document.hidden) { try { window.top.HubNotify.notice({ icon: '📞', title: 'Telephone', text: 'Missed call from ' + who, timeoutMs: 15000 }); } catch (_) { /* cross-origin / no Hub */ } }
  });
  TPCall.on('blocked', function (b) { $('sound').hidden = !b; });
  $('sound').onclick = function () { TPCall.unlock(); $('sound').hidden = true; };
  document.addEventListener('pointerdown', function () { if (!TPCall.soundOk()) TPCall.unlock(); }, true);
  $('b-answer').onclick = function () { TPCall.answer().catch(function (e) { dialog(e.message, ['OK']); }); };
  $('b-decline').onclick = function () { TPCall.decline(); };
  $('b-hang').onclick = function () { TPCall.hangup(); };
  $('b-mute').onclick = function () { TPCall.mute(); };
  $('b-video').onclick = function () { TPCall.video().catch(function (e) { dialog(e.message, ['OK']); }); };
  $('b-flip').onclick = function () { TPCall.flip().then(function (f) { toast(f === 'environment' ? 'Back camera' : 'Front camera'); }, function (e) { toast(e.message); }); };
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
  var LWHY = { dnd: 'do not disturb', busy: 'busy', declined: 'declined', noanswer: 'no answer', notfound: 'not online', unreachable: 'not reached', failed: 'failed', cancelled: 'cancelled', mic: 'no microphone', lost: 'dropped' };
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
      var ct = TPSave.contact(e.num, e.did);
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = ct ? ct.name : (online[e.num] && online[e.num].name) || e.name || e.num;
      var sub = document.createElement('small'); var nb = document.createElement('span'); nb.className = 'num' + (TPSave.isOld(e.num) ? ' oldn' : ''); nb.textContent = e.num;
      if (TPSave.isOld(e.num)) { nb.title = 'Old 4-digit number: it changes by itself once that device is seen online'; li.classList.add('old'); }
      var what = e.dir === 'missed' ? 'missed' + (e.why === 'busy' ? ' (you were on a call)' : e.why === 'dnd' ? ' (Do Not Disturb)' : '') : (e.dur || e.why === 'done') ? fmt(e.dur) : (LWHY[e.why] || (e.dir === 'in' ? 'incoming' : 'outgoing'));
      sub.appendChild(nb); sub.appendChild(document.createTextNode(' · ' + (e.dir === 'in' ? 'in' : e.dir === 'out' ? 'out' : '') + (e.dir === 'missed' ? '' : ' · ') + what + (TPSave.isOld(e.num) ? ' · old number' : online[e.num] ? ' · online' : '')));
      nm.appendChild(sub);
      var tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = when(e.at);
      li.append(ic, nm, tm);
      if (!ct && TPSave.numOk(e.num) && e.num !== TPSave.get('num')) {
        var ad = document.createElement('button'); ad.className = 'add'; ad.textContent = '＋'; ad.title = 'Add ' + e.num + ' to contacts'; ad.setAttribute('aria-label', ad.title);
        ad.onclick = function (ev) { ev.stopPropagation(); editContact(null, { name: (online[e.num] && online[e.num].name) || e.name, num: e.num, did: e.did }); };
        li.appendChild(ad);
      }
      li.title = 'Call ' + e.num + ' back';
      li.onclick = function () { var dv = e.did && devFor({ did: e.did, num: e.num }); call(dv ? dv.num : e.num); };
      ul.appendChild(li);
    });
  }
  TPSave.onlog = function () { paintLog(); seen(); paintBadge(); };

  /* ---------- missed-call badge (Recent dot + tab title) ---------- */
  function missedNew() { var t = TPSave.get('missedSeen') || 0; return TPSave.log().filter(function (e) { return e.dir === 'missed' && e.at > t; }).length; }
  function titleBase() { var n = missedNew(); return (n ? '(' + n + ') ' : '') + baseTitle; }
  function paintBadge() {
    var n = missedNew(), b = $('badge');
    b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n);
    $('badge').parentNode.setAttribute('aria-label', 'Recent calls' + (n ? ', ' + n + ' missed' : ''));
    if (!TPCall.current() || TPCall.current().state === 'ended') document.title = titleBase();
  }
  function seen() {   // Recent is on screen (and no call screen over it) → missed calls are seen
    if (page !== 1 || document.hidden || TPCall.current() || !missedNew()) return;
    TPSave.set('missedSeen', Date.now()); paintBadge();
  }
  document.addEventListener('visibilitychange', seen);

  /* ---------- contacts ---------- */
  function paintContacts() {
    var ul = $('contacts'), l = TPSave.contacts(), on = 0;
    ul.innerHTML = ''; $('con-empty').hidden = l.length > 0;
    l.forEach(function (ct) {
      var d = devFor(ct), st = !d && TPSave.isOld(ct.num) ? 'old number · not reachable until seen online' : stateOf(d); if (d) on++;
      var li = document.createElement('li'); li.dataset.id = ct.id; li.dataset.num = ct.num; li.className = d ? 'online' : 'offline';
      var av = document.createElement('span'); av.className = 'av' + (d ? (d.busy ? ' busy' : d.dnd ? ' dnd' : ' on') : ''); av.textContent = initial(ct.name);
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = ct.name;
      if (ct.fav) { var fv = document.createElement('span'); fv.className = 'fav'; fv.textContent = '⭐'; fv.title = 'Favourite'; nm.appendChild(fv); }
      var sub = document.createElement('small'); var nb = document.createElement('span'); nb.className = 'num' + (TPSave.isOld(ct.num) ? ' oldn' : ''); nb.textContent = ct.num;
      var sp = document.createElement('span'); sp.className = d ? (d.busy ? 'st-busy' : d.dnd ? '' : 'st-on') : ''; sp.textContent = st;
      sub.append(nb, document.createTextNode(' · '), sp); nm.appendChild(sub);
      var ed = document.createElement('button'); ed.className = 'ed'; ed.textContent = '✎'; ed.title = 'Edit ' + ct.name; ed.setAttribute('aria-label', ed.title);
      ed.onclick = function (ev) { ev.stopPropagation(); editContact(ct); };
      var cl = document.createElement('button'); cl.className = 'cl'; cl.textContent = '📞'; cl.title = 'Call ' + ct.name + ' (' + ct.num + ')'; cl.setAttribute('aria-label', cl.title);
      li.append(av, nm, ed, cl);
      li.onclick = function () { call(d ? d.num : ct.num); };
      ul.appendChild(li);
    });
    $('con-sub').textContent = l.length ? l.length + ' contact' + (l.length === 1 ? '' : 's') + ' · ' + on + ' online' : '';
  }
  function editContact(ct, pre) {   // ct = edit; pre = new contact prefilled (from Recent)
    var x = ct || Object.assign({ name: '', num: '', did: '', fav: false }, pre || {});
    var form = [{ k: 'name', label: 'Name', value: x.name || '', max: 40, ph: 'Name' }, { k: 'num', label: 'Number (5 digits)', value: x.num || '', max: 5, mode: 'numeric', ph: '12345' }, { k: 'fav', label: '⭐ Favourite', type: 'check', value: x.fav }];
    var btns = ct ? ['Delete', 'Cancel', 'Save'] : ['Cancel', 'Save'];
    function check(v) {
      if (!v.name) return { k: 'name', text: 'Type a name.' };
      if (!(TPSave.numOk(v.num) || (ct && TPSave.isOld(v.num) && v.num === ct.num))) return { k: 'num', text: 'Numbers have 5 digits (10000–99999).' };
      if (v.num === TPSave.get('num')) return { k: 'num', text: 'That is this device’s own number.' };
      var dup = TPSave.contacts().filter(function (o) { return o.num === v.num && (!ct || o.id !== ct.id); })[0];
      if (dup) return { k: 'num', text: '“' + dup.name + '” already has the number ' + v.num + '.' };
      return null;
    }
    return dialog(ct ? 'Edit contact' : 'New contact', btns, { form: form, check: check, danger: ct ? 0 : undefined }).then(function (r) {
      if (r && typeof r === 'object') {
        var did = x.did && v0(x.num) === r.num ? x.did : ((TPCall.find(r.num) || {}).did || '');
        var saved = TPSave.saveContact({ id: ct ? ct.id : '', name: r.name, num: r.num, did: did, fav: r.fav });
        if (!saved) { dialog('The contact could not be saved (the list is full at 200).', ['OK']); return; }
        toast(ct ? 'Contact saved' : saved.name + ' added to contacts');
        return saved;
      }
      if (ct && r === 0) {
        return dialog('Delete “' + ct.name + '” (' + ct.num + ') from contacts? Recent calls stay.', ['Cancel', 'Delete'], { danger: 1 }).then(function (i) {
          if (i === 1 && TPSave.deleteContact(ct.id)) toast(ct.name + ' deleted');
        });
      }
    });
  }
  function v0(n) { return String(n || ''); }
  TPSave.oncontacts = function () { paintContacts(); paintList(); paintLog(); paintCall(); };
  $('b-addcon').onclick = function () { editContact(null); };

  /* ---------- Do Not Disturb ---------- */
  /* TP2–TP6 (Telephone's own DND, removed in TP7):
  function paintDnd() {
    var on = !!TPSave.get('dnd');
    $('b-dnd').classList.toggle('on', on); $('b-dnd').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('chk-dnd').checked = on; $('chk-dndfav').checked = !!TPSave.get('dndFav');
  }
  function setDnd(on) { TPSave.set('dnd', !!on); paintDnd(); TPPeer.update(); toast(on ? '🌙 Do Not Disturb on' + (TPSave.get('dndFav') ? ' (favourites still ring)' : '') : 'Do Not Disturb off'); }
  $('b-dnd').onclick = function () { setDnd(!TPSave.get('dnd')); };
  $('chk-dnd').onchange = function () { setDnd(this.checked); };
  $('chk-dndfav').onchange = function () { TPSave.set('dndFav', this.checked); };
  */
  function paintDnd() {   // TP7: read-only 🌙 next to the name while the Hub's DND is on
    var el = $('dnd-ind'); if (el) el.hidden = !(window.TPDnd && TPDnd.isOn());
  }
  if (window.TPDnd) TPDnd.onChange(function () { paintDnd(); try { TPPeer.update(); } catch (_) { /* */ } });
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
  function show(i) { page = i; $('viewport').scrollLeft = 0; $('track').style.transform = 'translateX(' + (-100 / PAGES * i) + '%)'; document.querySelectorAll('.dot').forEach(function (d, k) { d.classList.toggle('on', k === i); }); if (i === 1) { paintLog(); seen(); } if (i === 2) paintContacts(); }
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

  /* ---------- TP6 call notifications ---------- */
  function paintNotify() {
    var p = TPAlert.perm(), on = TPSave.get('callNotify') !== false && p === 'granted';
    $('chk-notify').checked = on; $('chk-notify').disabled = p === 'unsupported';
    $('notify-sub').textContent = p === 'unsupported' ? 'This browser can\'t show notifications' : p === 'denied' ? 'Blocked in the browser: allow notifications for this site in the browser settings' : 'A system notification when a call comes in and Telephone isn\'t in front';
  }
  function enableNotify() {
    return TPAlert.request().then(function (p) {
      if (p === 'granted') { TPSave.set('callNotify', true); toast('🔔 Call notifications on'); }
      else { TPSave.set('callNotify', false); dialog(p === 'unsupported' ? 'This browser can\'t show notifications.' : 'Notifications are blocked in this browser. To get call notifications, allow notifications for this site in the browser\'s site settings, then turn this on again.', ['OK']); }
      paintNotify();
    });
  }
  $('chk-notify').onchange = function () { if (this.checked) enableNotify(); else { TPSave.set('callNotify', false); paintNotify(); toast('Call notifications off'); } };
  TPAlert.hooks.who = function (c) { return nameFor(c.num, c.did, c.name); };
  TPAlert.hooks.front = function () { show(0); paintCall(); };
  TPAlert.hooks.fav = function (c) { var ct = TPSave.contact(c.num, c.did); return !!(ct && ct.fav); };   // TP7
  TPAlert.hooks.action = function (a) { if (a === 'answer') $('b-answer').click(); else if (a === 'decline') $('b-decline').click(); };
  TPAlert.hooks.hint = function () {   // one time, first call while permission is 'default'
    var b = $('notify-hint'); if (!b) return;
    b.hidden = false; b.onclick = function () { b.hidden = true; enableNotify(); };
    setTimeout(function () { b.hidden = true; }, 20000);
  };

  /* ---------- start ---------- */
  paintMe(); paintSeg(); paintVol(); paintSink(); paintDnd(); paintList(); paintLog(); paintContacts(); paintCall(); paintBadge(); paintNotify();
  boot();
  window.TPApp = { show: show, dial: function () { return dial; }, page: function () { return page; } };   // test hook
})();
