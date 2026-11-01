/* Messages MS3 — UI (MS3: files via MSFiles, WhatsApp ticks 🕓 ✓ ✓✓ blue ✓✓ with read receipts {t:'read', ids}; MS2: offline queue → auto-send when the person comes online, alerts + Hub DND via MSNotify). Code order (FC5): #code= (5 digits) > Hub private mesh (parent.HubMeshLink) > public lobby;
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
  function toast(t) { if (window.MSNotify && MSNotify.hubCard({ icon: '💬', title: 'Messages', text: t, timeoutMs: 4000 })) return; var el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(tt); tt = setTimeout(function () { el.hidden = true; }, 2600); }
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
      li.innerHTML = '<span class="av">' + esc(nm.charAt(0).toUpperCase()) + '</span><span class="nm"><b>' + esc(nm) + ' <span class="mut">' + c.num + '</span></b><small>' + (m ? (m.dir === 'out' ? 'You: ' : '') + esc(m.kind === 'file' ? '📎 ' + m.fname : String(m.text || '').slice(0, 80)) : '') + '</small></span><span class="tm">' + (m ? hm(m.ts) : '') + (c.unread ? '<br><span class="ur">' + c.unread + '</span>' : '') + '</span>';
      li.onclick = function () { open(c.num); };
      ul.appendChild(li);
    });
    $('conv-empty').hidden = l.length > 0;
    var on = $('online'), r = P.roster(); on.innerHTML = '';
    r.forEach(function (d) { var li = document.createElement('li'), nm = label(d.num, d.name); li.innerHTML = '<span class="av">' + esc(nm.charAt(0).toUpperCase()) + '</span><span class="nm"><b>' + esc(nm) + '</b><small>' + d.num + '</small></span>'; li.onclick = function () { open(d.num, d.name); }; on.appendChild(li); });
    $('online-empty').hidden = r.length > 0;
    var u = S.unread(); document.title = (u ? '(' + u + ') ' : '') + 'Messages';
  }
  function renderChat() {
    if (!cur) return;
    var c = S.conv(cur), ul = $('msgs'); ul.innerHTML = '';
    $('c-name').textContent = label(cur); $('c-num').textContent = cur + (P.peerOf(cur) ? ' · online' : ' · not online');
    (c ? c.msgs : []).forEach(function (m) {
      var li = document.createElement('li'), wait = m.st === 'queued' || m.st === 'unsent';
      li.className = m.dir + (wait || m.st === 'lost' ? ' unsent' : '');
      if (m.kind === 'file') fileBody(li, m); else li.textContent = m.text;
      var s = document.createElement('small'); s.textContent = hm(m.ts) + ' ';
      if (m.dir === 'out') s.appendChild(tick(m));
      if (wait && m.kind !== 'file') s.appendChild(document.createTextNode(' Waiting — sends when ' + label(cur) + ' is online'));
      if (wait && m.kind === 'file') s.appendChild(document.createTextNode(' Waiting — kept only while Messages is open'));
      if (m.st === 'lost') s.appendChild(document.createTextNode(' Not sent — the app was closed'));
      if (wait && m.kind !== 'file' && P.peerOf(cur)) { var b = document.createElement('button'); b.className = 'mini retry'; b.textContent = 'Send now'; b.onclick = function () { deliver(cur, m); }; s.appendChild(b); }
      li.appendChild(s); ul.appendChild(li);
    });
    ul.scrollTop = ul.scrollHeight;
  }
  /* MS3 ticks: 🕓 not out yet, grey ✓ sent, grey ✓✓ delivered, blue ✓✓ read */
  function tick(m) {
    var t = document.createElement('span'), st = m.st, sending = MSFiles.progress(m.id) >= 0;
    t.className = 'tick' + (st === 'read' ? ' rd' : '');
    t.textContent = st === 'read' || st === 'delivered' ? '✓✓' : st === 'sent' && !sending ? '✓' : st === 'lost' ? '⚠' : '🕓';
    t.title = st === 'read' ? 'Read' : st === 'delivered' ? 'Delivered' : st === 'sent' ? 'Sent' : st === 'lost' ? 'Not sent' : 'Waiting';
    t.setAttribute('aria-label', t.title); return t;
  }
  function fileBody(li, m) {
    li.classList.add('file'); li.dataset.id = m.id;
    var u = MSFiles.url(m.id), p = MSFiles.progress(m.id), img = /^image\//.test(m.mime) && (u || m.thumb);
    if (img) { var im = document.createElement('img'); im.className = 'thumb'; im.alt = m.fname; im.src = u || m.thumb; li.appendChild(im); }
    var row = document.createElement('div'); row.className = 'frow';
    if (!img) { var ic = document.createElement('span'); ic.className = 'fic'; ic.textContent = /^video\//.test(m.mime) ? '🎬' : /pdf/.test(m.mime) ? '📕' : /^audio\//.test(m.mime) ? '🎵' : '📄'; row.appendChild(ic); }
    var nm = document.createElement('span'); nm.className = 'fnm'; nm.innerHTML = '<b></b><small></small>'; nm.firstChild.textContent = m.fname; nm.lastChild.textContent = MSFiles.size(m.size); row.appendChild(nm);
    if (p >= 0) { var r = document.createElement('span'); r.className = 'ring'; r.style.setProperty('--p', p); r.setAttribute('aria-label', Math.round(p * 100) + '%'); row.appendChild(r); }
    else if (u && m.dir === 'in') { var b = document.createElement('button'); b.className = 'mini save'; b.textContent = 'Save'; b.onclick = function () { MSFiles.save(m.id, m.fname); }; row.appendChild(b); }
    else if (!u && m.dir === 'in') { var x = document.createElement('small'); x.className = 'mut'; x.textContent = 'Not on this device any more'; nm.appendChild(x); }
    li.appendChild(row);
  }
  MSFiles.on('progress', function (id, p) { var li = document.querySelector('#msgs li[data-id="' + id + '"] .ring'); if (li) { li.style.setProperty('--p', p); li.setAttribute('aria-label', Math.round(p * 100) + '%'); } });
  MSFiles.on('change', function (num, isNew) {
    renderList(); if (num === cur) { renderChat(); reads(); }
    if (isNew) MSNotify.incoming(label(num, isNew.name), num, '📎 ' + isNew.fname, function () { open(num); });
  });
  /* MS3 read receipts: while this chat is open and visible, tell the sender which of their messages we have seen */
  function reads() {
    if (!cur || document.hidden || !P.peerOf(cur)) return;
    var n = cur, ids = S.toReceipt(n); if (!ids.length) return;
    P.send(n, { t: 'read', ids: ids.slice(-200) }).then(function (ok) { if (ok) S.receipted(n, ids); });
  }
  $('b-att').onclick = function () { if (!cur) return; if (!myNum) { toast('No Hub number on this device yet'); return; } $('in-file').click(); };
  $('in-file').onchange = function () {
    var fs = Array.prototype.slice.call(this.files || []), n = cur; this.value = '';
    fs.forEach(function (f) {
      if (f.size > MSFiles.MAX) { toast(f.name + ' is over 100 MB'); return; }
      MSFiles.send(n, pendingName[n] || rosterName(n), who, f).then(function () { renderChat(); renderList(); });
    });
    if (fs.length && !P.peerOf(n)) toast('Files wait until ' + label(n) + ' is online, only while Messages stays open');
  };
  function open(num, name) {
    cur = num; S.read(num);
    if (name) pendingName[num] = name;
    $('chat').hidden = false; $('pick').hidden = true; $('main').classList.add('inchat');
    renderChat(); renderList(); reads(); $('in-text').focus();
  }
  var pendingName = {};
  var busy = {};   // id -> true while a send is in flight (no double sends from flush + Retry)
  function deliver(num, e) {
    if (busy[e.id]) return Promise.resolve(false);
    if (!P.peerOf(num)) { S.setSt(num, e.id, 'queued'); renderChat(); renderList(); return Promise.resolve(false); }
    busy[e.id] = true;
    return P.send(num, { t: 'msg', id: e.id, from: myNum, name: myName(), text: e.text, ts: e.ts }).then(function (ok) {
      delete busy[e.id];
      S.setSt(num, e.id, ok ? 'sent' : 'queued');   // 'sent' until the ack makes it ✓✓; queued ones go again when they come online
      renderChat(); renderList(); return ok;
    });
  }
  /* MS2 queue: every queued/sent-but-unacked message to someone now online goes again (receiver dedupes by id) */
  function flush() {
    if (!myNum) return;
    S.pending().forEach(function (p) { if (P.peerOf(p.num)) deliver(p.num, p.msg); });
  }
  setInterval(flush, 20000);
  function sendNow() {
    var t = $('in-text').value; if (!cur || !S.validText(t)) return;
    if (!myNum) { toast('No Hub number on this device yet'); return; }
    var e = S.addOut(cur, pendingName[cur] || rosterName(cur), t, rid(), 'queued'); $('in-text').value = '';
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
  P.on('roster', function () { renderList(); renderChat(); flush(); MSFiles.flush(); reads(); });
  P.on('data', function (m, conn) {
    if (m.t === 'msg') {
      var isNew = S.addIn(m, m.from === cur && !document.hidden);
      try { conn.send({ t: 'ack', id: m.id }); } catch (_) { /* */ }   // ack duplicates too, so a lost ack heals
      if (isNew) { renderList(); if (m.from === cur) { renderChat(); reads(); } var f = String(m.from); MSNotify.incoming(label(f, m.name), f, m.text, function () { open(f); }); }
    } else if (m.t === 'ack') {
      var num = P.numOf(conn.peer); MSFiles.acked(String(m.id));
      if (num && S.ack(num, String(m.id))) { renderChat(); renderList(); }
    } else if (m.t === 'read' && Array.isArray(m.ids)) {
      var rn = P.numOf(conn.peer), ch = false;
      if (rn) m.ids.slice(0, 500).forEach(function (id) { if (S.setSt(rn, String(id), 'read')) ch = true; });
      if (ch) renderChat();
    } else if (m.t === 'fmeta' || m.t === 'fchunk' || m.t === 'fend') {
      var fn = m.t === 'fmeta' && NUM.test(String(m.from)) ? String(m.from) : P.numOf(conn.peer);
      if (fn) MSFiles.data(m, conn, fn);
    }
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && cur) { S.read(cur); renderList(); reads(); } });
  /* settings */
  $('b-set').onclick = function () { paintNotify(); $('in-name').value = myName(); $('num-lbl').textContent = myNum || '—'; $('sheet').hidden = false; };
  $('b-close').onclick = function () { $('sheet').hidden = true; };
  $('in-name').onchange = function () { S.set('name', this.value.trim().slice(0, 40)); $('me-name').textContent = myName(); P.update(who()); };
  function paintNotify() {
    var on = S.get('notify') !== false, pm = MSNotify.perm();
    $('chk-notify').checked = on;
    $('notify-note').textContent = MSNotify.dnd() ? '🌙 Hub Do Not Disturb is on — messages arrive silently.' : MSNotify.inHub ? 'Shown as a Hub card when Messages is in the background.' : pm === 'granted' ? 'Browser notifications are allowed.' : pm === 'denied' ? 'Browser notifications are blocked for this site.' : pm === 'unsupported' ? 'This browser has no notifications.' : 'Tap the switch to allow browser notifications.';
    $('dnd-ind').hidden = !MSNotify.dnd();
  }
  $('chk-notify').onchange = function () { var on = this.checked; S.set('notify', on); if (on && !MSNotify.inHub) MSNotify.ask().then(paintNotify); else paintNotify(); };
  MSNotify.onDnd(paintNotify);
  addEventListener('storage', function (e) { if (e.key === 'sites-hub.theme') { var d = e.newValue ? e.newValue === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; document.documentElement.className = d ? 'dark' : ''; } });
  $('me-name').textContent = myName(); setStatus('connecting'); paintNotify(); renderList();
  var pc = S.pickCode(location.hash, hml(), PUB); fixed = pc.fixed;
  if (/[#&?]code=\d{4}(?!\d)/.test(location.hash)) toast('Old 4-digit codes are no longer used');
  go(pc.code);
})();
