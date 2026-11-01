/* Messages MS1 — UI. Code order (FC5): #code= (5 digits) > Hub private mesh (parent.HubMeshLink) > public lobby;
   every 5 s follow the Hub mesh when idle, else offer an in-bar Switch / Back to Public button.
   My number = this device's Hub number (SharedLinkDevices.code() / SharedLink.deviceCode(), self/parent/top). */
(function () {
  'use strict';
  var S = MSStore, P = MSPeer, NUM = /^[1-9]\d{4}$/;
  function $(id) { return document.getElementById(id); }
  function wins() { var w = [window]; try { if (window.parent !== window) w.push(window.parent); } catch (_) {} try { if (window.top !== window) w.push(window.top); } catch (_) {} return w; }
  function hubNum() {
    var w = wins();
    for (var i = 0; i < w.length; i++) {
      try { var D = w[i].SharedLinkDevices, L = w[i].SharedLink, c = '';
        if (D && typeof D.code === 'function') c = String(D.code() || '');
        if (!NUM.test(c) && L && typeof L.deviceCode === 'function') c = String(L.deviceCode() || '');
        if (NUM.test(c)) return c; } catch (_) { /* */ }
    }
    return '';
  }
  function hubName() { var w = wins(); for (var i = 0; i < w.length; i++) { try { if (w[i].SharedLinkDevices) return String(w[i].SharedLinkDevices.name() || ''); } catch (_) {} } return ''; }
  var PUB = (function () { var w = wins(); for (var i = 0; i < w.length; i++) { try { var L = w[i].SharedLink; if (L && /^\d{5}$/.test(String(L.LOBBY || ''))) return String(L.LOBBY); } catch (_) {} } return '00000'; })();
  function hml() { try { var h = window.parent !== window && window.parent.HubMeshLink; return h && typeof h.isPrivate === 'function' ? h : null; } catch (_) { return null; } }
  var myNum = hubNum(), code = '', fixed = false, manual = false, offer = '', cur = '', started = false, idleAt = Date.now();
  function myName() { return S.get('name') || hubName() || 'Device'; }
  function who() { return { name: myName(), num: myNum }; }
  function rid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function hm(ts) { var d = new Date(ts), n = new Date(); return d.toDateString() === n.toDateString() ? d.toTimeString().slice(0, 5) : d.toLocaleDateString(); }
  function label(num, fallback) { return S.contactName(num) || fallback || (S.conv(num) && S.conv(num).name) || rosterName(num) || num; }
  function rosterName(num) { var r = P.roster(); for (var i = 0; i < r.length; i++) if (r[i].num === num) return r[i].name; return ''; }
  var tt = 0;
  function toast(t) { var el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(tt); tt = setTimeout(function () { el.hidden = true; }, 2600); }
  /* in-app dialog (no alert/confirm/prompt); resolves the button text, or the typed 5 digits for 'ask' */
  function dialog(text, btns, ask) {
    return new Promise(function (res) {
      $('dlg-t').textContent = text; var inp = $('dlg-in'); inp.hidden = !ask; inp.value = '';
      var b = $('dlg-b'); b.innerHTML = '';
      btns.forEach(function (n, i) {
        var x = document.createElement('button'); x.className = i === btns.length - 1 ? 'pri' : 'mini'; x.textContent = n;
        x.onclick = function () {
          if (ask && i === btns.length - 1) { var v = inp.value.trim(); if (!/^\d{5}$/.test(v)) { toast('Enter 5 digits'); return; } $('dlg').hidden = true; res(v); return; }
          $('dlg').hidden = true; res(n);
        };
        b.appendChild(x);
      });
      $('dlg').hidden = false; if (ask) inp.focus();
    });
  }
  function setStatus(st) { var d = S.dot(st), el = $('net'); el.className = 'net ' + d.cls; el.title = d.t + (code ? ' · ' + (code === PUB ? 'Public ' + PUB : 'code ' + code) : ''); el.setAttribute('aria-label', el.title); }
  function go(c) {
    if (started && c === code) return;
    if (started) P.stop();
    started = true; code = c; $('code-lbl').textContent = c === PUB ? PUB + ' · Public' : c; paintSwitch();
    if (!myNum) { setStatus('offline'); toast('No Hub number on this device yet'); return; }
    P.start(c, who()).catch(function () { setStatus('offline'); toast('PeerJS could not load (offline?)'); });
  }
  function paintSwitch() { var el = $('ms-switch'); el.hidden = !offer || offer === code; el.textContent = offer === PUB ? 'Back to Public' : 'Switch to ' + offer; }
  setInterval(function () {
    if (!started || fixed || manual || !hml()) return;
    var d = S.pickCode('', hml(), PUB).code; if (d === code) { offer = ''; paintSwitch(); return; }
    if (Date.now() - idleAt > 5000) { offer = ''; go(d); } else { offer = d; paintSwitch(); }
  }, 5000);
  ['keydown', 'pointerdown'].forEach(function (n) { addEventListener(n, function () { idleAt = Date.now(); }, true); });
  $('ms-switch').onclick = function () { var d = offer; offer = ''; if (d) go(d); };
  $('b-code').onclick = function () { dialog('Enter a 5-digit Hub code, or Public to meet every device on 00000.', ['Cancel', 'Public', 'Join'], true).then(function (v) { if (v === 'Public') v = PUB; if (/^\d{5}$/.test(v)) { manual = true; offer = ''; go(v); } }); };

  /* lists */
  function renderList() {
    var ul = $('convs'), l = S.list(); ul.innerHTML = '';
    l.forEach(function (c) {
      var m = c.msgs[c.msgs.length - 1], li = document.createElement('li'), nm = label(c.num, c.name);
      if (c.num === cur) li.className = 'sel';
      li.innerHTML = '<span class="av">' + esc(nm.charAt(0).toUpperCase()) + '</span><span class="nm"><b>' + esc(nm) + ' <span class="mut">' + c.num + '</span></b><small>' + (m ? (m.dir === 'out' ? 'You: ' : '') + esc(m.text.slice(0, 80)) : '') + '</small></span><span class="tm">' + (m ? hm(m.ts) : '') + (c.unread ? '<br><span class="ur">' + c.unread + '</span>' : '') + '</span>';
      li.onclick = function () { open(c.num); };
      ul.appendChild(li);
    });
    $('conv-empty').hidden = l.length > 0;
    var on = $('online'), r = P.roster(); on.innerHTML = '';
    r.forEach(function (d) { var li = document.createElement('li'), nm = label(d.num, d.name); li.innerHTML = '<span class="av">' + esc(nm.charAt(0).toUpperCase()) + '</span><span class="nm"><b>' + esc(nm) + '</b><small>' + d.num + '</small></span>'; li.onclick = function () { open(d.num, d.name); }; on.appendChild(li); });
    $('online-empty').hidden = r.length > 0;
    var u = S.unread(); document.title = (u ? '(' + u + ') ' : '') + 'Messages MS1';
  }
  function renderChat() {
    if (!cur) return;
    var c = S.conv(cur), ul = $('msgs'); ul.innerHTML = '';
    $('c-name').textContent = label(cur); $('c-num').textContent = cur + (P.peerOf(cur) ? ' · online' : ' · not online');
    (c ? c.msgs : []).forEach(function (m) {
      var li = document.createElement('li'); li.className = m.dir + (m.st === 'unsent' ? ' unsent' : '');
      li.textContent = m.text;
      var s = document.createElement('small'); s.textContent = hm(m.ts) + (m.dir === 'out' ? (m.st === 'delivered' ? ' ✓✓' : m.st === 'sent' ? ' ✓' : m.st === 'unsent' ? ' · Not online — not sent' : '') : '');
      if (m.st === 'unsent') { var b = document.createElement('button'); b.className = 'mini retry'; b.textContent = 'Retry'; b.onclick = function () { deliver(cur, m); }; s.appendChild(b); }
      li.appendChild(s); ul.appendChild(li);
    });
    ul.scrollTop = ul.scrollHeight;
  }
  function open(num, name) {
    cur = num; if (name && !S.conv(num)) S.conv(num); S.read(num);
    if (name) pendingName[num] = name;
    $('chat').hidden = false; $('pick').hidden = true; $('main').classList.add('inchat');
    renderChat(); renderList(); $('in-text').focus();
  }
  var pendingName = {};
  function deliver(num, e) {
    S.setSt(num, e.id, 'sent'); renderChat();
    return P.send(num, { t: 'msg', id: e.id, from: myNum, name: myName(), text: e.text, ts: e.ts }).then(function (ok) {
      if (!ok) { S.setSt(num, e.id, 'unsent'); toast('Not online — not sent'); }
      renderChat(); renderList();
    });
  }
  function sendNow() {
    var t = $('in-text').value; if (!cur || !S.validText(t)) return;
    if (!myNum) { toast('No Hub number on this device yet'); return; }
    var e = S.addOut(cur, pendingName[cur] || rosterName(cur), t, rid(), 'sent'); $('in-text').value = '';
    deliver(cur, e);
  }
  $('compose').onsubmit = function (ev) { ev.preventDefault(); sendNow(); };
  $('in-text').onkeydown = function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); sendNow(); } };
  $('b-back').onclick = function () { cur = ''; $('chat').hidden = true; $('pick').hidden = false; $('main').classList.remove('inchat'); renderList(); };
  $('b-new').onclick = function () {
    dialog('Type a 5-digit Hub number, or tap someone under Online now.', ['Cancel', 'Open'], true).then(function (v) {
      if (!NUM.test(v)) { if (/^\d{5}$/.test(v)) toast('Not a valid number'); return; }
      if (v === myNum) { toast('That is this device'); return; } open(v);
    });
  };
  P.on('status', setStatus);
  P.on('roster', function () { renderList(); renderChat(); });
  P.on('data', function (m, conn) {
    if (m.t === 'msg') {
      var isNew = S.addIn(m, m.from === cur && !document.hidden);
      try { conn.send({ t: 'ack', id: m.id }); } catch (_) { /* */ }   // ack duplicates too, so a lost ack heals
      if (isNew) { renderList(); if (m.from === cur) renderChat(); }
    } else if (m.t === 'ack') {
      var r = P.roster(), num = ''; for (var i = 0; i < r.length; i++) if (r[i].id === conn.peer) num = r[i].num;
      if (num && S.ack(num, String(m.id))) renderChat();
    }
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && cur) { S.read(cur); renderList(); } });
  /* settings */
  $('b-set').onclick = function () { $('in-name').value = myName(); $('num-lbl').textContent = myNum || '—'; $('sheet').hidden = false; };
  $('b-close').onclick = function () { $('sheet').hidden = true; };
  $('in-name').onchange = function () { S.set('name', this.value.trim().slice(0, 40)); $('me-name').textContent = myName(); P.update(who()); };
  addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') { var d = e.newValue ? e.newValue === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; document.documentElement.className = d ? 'dark' : ''; } });
  $('me-name').textContent = myName(); setStatus('connecting'); renderList();
  var pc = S.pickCode(location.hash, hml(), PUB); fixed = pc.fixed;
  if (/[#&?]code=\d{4}(?!\d)/.test(location.hash)) toast('Old 4-digit codes are no longer used');
  go(pc.code);
})();
