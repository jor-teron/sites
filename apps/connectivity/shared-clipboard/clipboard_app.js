/* Shared Clipboard CB1 — UI + sync: screens (Clipboard, Devices, Settings), dots + 75 px wrap-around swipes,
   in-app dialogs, Hub code, paste/drop/pick, send, history.
   Hub code, in order: #code= / ?hub= (QR), the Hub's {sharedLink:'hello'} (inside the Hub),
   parent.__hubRemote.code (phone Hub), localStorage 'jtsites-hub-ctrl-code' (desktop Hub),
   'shared-link-join-code', our last code, else the code dialog.
   Messages (through CBPeer's lobby): {k:'clip', it:{id, ts, kind, text?, img?, name}, priv?} to all or to one device;
   a new device gets {k:'recent', its:[…10 newest items shared with everyone]} from the lobby's own history. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var inHub = window.parent !== window, page = 0, PAGES = 3, SW = 75, started = false, code = '', myId = '';
  var LAST = 'clipboard-last-code', MAXPX = 1600;
  var hist = [], roster = [], pendImg = null, noticeIt = null, noticeT = 0;

  /* ---------- dialogs / toast ---------- */
  function dialog(text, buttons, ask, img) {
    return new Promise(function (res) {
      var dt = $('d-text'); dt.textContent = text;
      if (img) { var im = document.createElement('img'); im.src = img; dt.prepend(im); }
      var inp = $('d-input'); inp.hidden = !ask; inp.value = '';
      var row = $('d-row'); row.innerHTML = '';
      (buttons || ['OK']).forEach(function (b, i, a) {
        var el = document.createElement('button'); el.className = i === a.length - 1 ? 'btn sm' + (/Clear/.test(b) ? ' bad' : '') : 'mini'; el.textContent = b;
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

  /* ---------- code ---------- */
  function ls(k) { try { return localStorage.getItem(k) || ''; } catch (_) { return ''; } }
  function urlCode() { var m = (location.hash + '&' + location.search).match(/(?:code|hub|join)=(\d{4})/); return m ? m[1] : ''; }
  function localCode() {
    try { if (window.parent.__hubRemote && window.parent.__hubRemote.code) return String(window.parent.__hubRemote.code); } catch (_) { /* */ }
    var c = ls('jtsites-hub-ctrl-code'); if (/^\d{4}$/.test(c) && inHub) return c;
    c = ls('shared-link-join-code'); if (/^\d{4}$/.test(c) && inHub) return c;
    return '';
  }
  function go(c) {
    if (started) { if (c === code) return; CBPeer.stop(); }
    started = true; code = c; $('code-lbl').textContent = c;
    try { localStorage.setItem(LAST, c); } catch (_) { /* */ }
    CBPeer.start(c).catch(function () { setStatus('PeerJS could not load (offline?)'); });
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
      try { window.parent.postMessage({ sharedLink: 'ready', app: 'shared-clipboard', types: ['x-none/'] }, '*'); } catch (_) { /* */ }
      setTimeout(function () { if (!got && !started) { var l = localCode() || ls(LAST); if (l) go(l); else { setStatus('Not connected'); askCode(); } } }, 800);
      return;
    }
    c = ls(LAST) || ls('shared-link-join-code');
    if (/^\d{4}$/.test(c)) go(c); else { setStatus('Not connected'); askCode(); }
  }
  $('btn-code').onclick = askCode; $('btn-code2').onclick = askCode;
  function setStatus(t) { $('status').textContent = t; $('status2').textContent = t; }

  /* ---------- compose: text, image, paste, drop ---------- */
  function setText(t) { $('box').value = t; clearImg(); paintSend(); }
  function clearImg() { pendImg = null; $('img-wrap').hidden = true; $('img-prev').removeAttribute('src'); paintSend(); }
  function shrink(blob) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(blob), im = new Image();
      im.onload = function () {
        var w = im.naturalWidth, h = im.naturalHeight, s = Math.min(1, MAXPX / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        var d = /png|gif|webp/.test(blob.type) ? c.toDataURL('image/png') : '';
        if (!d || d.length > 1500000) d = c.toDataURL('image/jpeg', 0.85);
        res({ img: d, w: c.width, h: c.height });
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('That image could not be read.')); };
      im.src = url;
    });
  }
  function setImageBlob(blob) {
    return shrink(blob).then(function (r) {
      pendImg = r.img; $('img-prev').src = r.img; $('img-wrap').hidden = false;
      $('img-info').textContent = r.w + '×' + r.h + ' · ' + Math.round(r.img.length * 0.75 / 1024) + ' KB';
      paintSend();
    }).catch(function (e) { dialog(e.message, ['OK']); });
  }
  function pasteHelp() { dialog('This browser didn\'t let the app read the clipboard. Tap the box and paste (Ctrl+V, or long-press → Paste), or drop a file onto it.', ['OK']).then(function () { $('box').focus(); }); }
  async function pasteFromClipboard() {
    var C = navigator.clipboard;
    if (C && C.read) {
      try {
        var items = await C.read();
        for (var i = 0; i < items.length; i++) {
          var t = items[i].types.filter(function (x) { return /^image\//.test(x); })[0];
          if (t) { await setImageBlob(await items[i].getType(t)); toast('Image pasted'); return; }
          if (items[i].types.indexOf('text/plain') >= 0) { var tx = await (await items[i].getType('text/plain')).text(); if (tx) { setText(tx); toast('Pasted'); return; } }
        }
      } catch (_) { /* fall back to readText */ }
    }
    if (C && C.readText) {
      try { var s = await C.readText(); if (s) { setText(s); toast('Pasted'); } else toast('The clipboard is empty'); return; } catch (_) { /* fall through */ }
    }
    pasteHelp();
  }
  $('b-paste').onclick = function () { pasteFromClipboard(); };
  $('b-img').onclick = function () { $('file').click(); };
  $('file').onchange = function () { var f = this.files[0]; if (f) setImageBlob(f); this.value = ''; };
  $('img-x').onclick = clearImg;
  $('box').addEventListener('input', paintSend);
  document.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.items) || [];
    for (var i = 0; i < items.length; i++) if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { e.preventDefault(); setImageBlob(items[i].getAsFile()); if (page !== 0) show(0); return; }
    if (document.activeElement !== $('box') && e.clipboardData) { var t = e.clipboardData.getData('text/plain'); if (t) { e.preventDefault(); setText(t); if (page !== 0) show(0); } }
  });
  (function () {
    var d = $('drop');
    ['dragenter', 'dragover'].forEach(function (n) { d.addEventListener(n, function (e) { e.preventDefault(); d.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (n) { d.addEventListener(n, function () { d.classList.remove('over'); }); });
    d.addEventListener('drop', function (e) {
      e.preventDefault();
      var f = [].slice.call(e.dataTransfer.files || []).filter(function (x) { return /^image\//.test(x.type); })[0];
      if (f) return setImageBlob(f);
      var t = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
      if (t) setText(t); else if (e.dataTransfer.files.length) dialog('Only text and images can be shared. Use File Drop for other files.', ['OK']);
    });
  })();
  function hasDraft() { return !!(pendImg || $('box').value.trim()); }
  function paintSend() { $('b-send').disabled = !hasDraft(); }

  /* ---------- send / receive ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function wire(it) { var o = { id: it.id, ts: it.ts, kind: it.kind, name: it.name }; if (it.kind === 'image') o.img = it.img; else o.text = it.text; return o; }
  function nameOf(id) { var d = roster.filter(function (r) { return r.id === id; })[0]; return d ? d.name || 'Device' : ''; }
  function send(to) {
    if (!hasDraft()) { toast('Paste or type something first'); return; }
    var it = { id: uid(), ts: Date.now(), from: 'me', name: CBStore.name(), pinned: false };
    if (pendImg) { it.kind = 'image'; it.img = pendImg; } else { it.kind = 'text'; it.text = $('box').value.replace(/\s+$/, ''); }
    if (to && to !== 'all') it.to = to;
    var ok = CBPeer.online();
    if (ok) { if (it.to) CBPeer.sendTo(it.to, { k: 'clip', it: wire(it), priv: true }); else CBPeer.send({ k: 'clip', it: wire(it) }); }
    add(it, true);
    $('box').value = ''; clearImg();
    if (!ok) toast('Not connected — kept here only');
    else if (it.to) toast('Sent to ' + (nameOf(it.to) || 'device'));
    else toast(roster.length ? 'Sent to ' + roster.length + (roster.length === 1 ? ' device' : ' devices') : 'Sent (no other devices yet)');
  }
  $('b-send').onclick = function () { send($('sel-to').value); };
  $('box').addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send($('sel-to').value); } });
  $('sel-to').onchange = function () { CBStore.set('target', this.value); };

  function add(it, flash) {
    if (hist.some(function (h) { return h.id === it.id; })) return false;
    var i = 0; while (i < hist.length && hist[i].ts > it.ts) i++;
    hist.splice(i, 0, it); CBSave.put(it);
    var drop = CBSave.trim(hist);
    if (drop.length) hist = hist.filter(function (h) { return drop.indexOf(h.id) < 0; });
    render(flash ? it.id : null); return true;
  }
  CBPeer.provide(function () {
    return { k: 'recent', its: hist.filter(function (h) { return !h.to && !h.priv; }).slice(0, 10).map(function (h) { var w = wire(h); w.from = h.from === 'me' ? myId : h.from; return w; }) };
  });
  CBPeer.on('me', function (id) { myId = id; });
  CBPeer.on('status', setStatus);
  CBPeer.on('roster', function (l) { roster = l; paintDevices(); });
  CBPeer.on('signal', function (m, from) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'recent') {
      var n = 0;
      (m.its || []).forEach(function (w) { if (!w || w.from === myId) return; var x = incoming(w, w.from || from); if (x && add(x, false)) n++; });
      if (n) toast(n + ' recent item' + (n > 1 ? 's' : '') + ' from devices on this code');
      return;
    }
    if (m.k === 'clip' && m.it && m.it.id) {
      var it = incoming(m.it, from); if (!it) return; if (m.priv) it.priv = true;
      if (!add(it, true)) return;
      onIncoming(it);
    }
  });
  function incoming(w, from) {
    if (!w || !w.id) return null;
    var it = { id: String(w.id), ts: +w.ts || Date.now(), kind: w.kind === 'image' ? 'image' : 'text', from: from || '', name: String(w.name || nameOf(from) || 'Device').slice(0, 40), pinned: false };
    if (it.kind === 'image') { if (!/^data:image\/(png|jpeg|gif|webp);base64,/.test(w.img || '')) return null; it.img = w.img; }
    else it.text = String(w.text || '').slice(0, 100000);
    return it;
  }
  function onIncoming(it) {
    var preview = it.kind === 'image' ? '🖼️ Image' : it.text.slice(0, 120);
    if (CBStore.get('notice')) {
      noticeIt = it; $('n-title').textContent = 'From ' + it.name; $('n-text').textContent = preview; $('notice').hidden = false;
      clearTimeout(noticeT); noticeT = setTimeout(function () { $('notice').hidden = true; }, 7000);
      if (inHub && document.hidden) { try { window.top.HubNotify.notice({ icon: '📋', title: 'Shared Clipboard · ' + it.name, text: preview, timeoutMs: 8000 }); } catch (_) { /* cross-origin / no Hub */ } }
    }
    if (CBStore.get('autocopy') && it.kind === 'text') {
      CBSave.copy(it).then(function () { toast('Copied from ' + it.name); }).catch(function () { toast('Auto-copy was blocked — tap Copy'); });
    }
  }
  $('n-copy').onclick = function () { if (noticeIt) doCopy(noticeIt); $('notice').hidden = true; };
  $('n-x').onclick = function () { $('notice').hidden = true; };

  /* ---------- history ---------- */
  var URLRE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;
  function linkify(el, t) {
    var last = 0; t.replace(URLRE, function (u, at) {
      if (at > last) el.appendChild(document.createTextNode(t.slice(last, at)));
      var a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = u; el.appendChild(a);
      last = at + u.length; return u;
    });
    if (last < t.length) el.appendChild(document.createTextNode(t.slice(last)));
  }
  function when(ts) {
    var d = new Date(ts), n = new Date(), hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === n.toDateString() ? hm : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + hm;
  }
  function doCopy(it) {
    CBSave.copy(it).then(function (r) { toast(r === 'downloaded' ? 'Image copy not supported here — downloaded instead' : 'Copied'); })
      .catch(function (e) { dialog(e.message, ['OK']); });
  }
  function ib(txt, title, fn, cls) { var b = document.createElement('button'); b.className = 'ib' + (cls ? ' ' + cls : ''); b.textContent = txt; b.title = title; b.setAttribute('aria-label', title); b.onclick = fn; return b; }
  function render(flashId) {
    var ul = $('hist'); ul.innerHTML = '';
    $('empty').hidden = hist.length > 0;
    hist.forEach(function (it) {
      var li = document.createElement('li'); if (it.id === flashId) li.className = 'new';
      var main = document.createElement('div'); main.className = 'it-main';
      var meta = document.createElement('div'); meta.className = 'it-meta';
      var who = it.from === 'me' ? 'You' + (it.to ? ' → ' + (nameOf(it.to) || 'one device') : '') : it.name + (it.priv ? ' → you' : '');
      meta.textContent = (it.pinned ? '📌 ' : '') + who + ' · ' + when(it.ts);
      main.appendChild(meta);
      var act = document.createElement('div'); act.className = 'it-act';
      act.appendChild(ib('📋', 'Copy', function () { doCopy(it); }, 'cp'));
      if (it.kind === 'image') {
        var im = document.createElement('img'); im.className = 'it-img'; im.src = it.img; im.alt = 'Shared image'; im.loading = 'lazy';
        im.onclick = function () { dialog('', ['Close', 'Download'], false, it.img).then(function (i) { if (i === 1) CBSave.download(it); }); };
        main.appendChild(im);
        act.appendChild(ib('⬇', 'Download', function () { CBSave.download(it); }));
      } else {
        var tx = document.createElement('div'); tx.className = 'it-text'; linkify(tx, it.text || ''); main.appendChild(tx);
        var u = (it.text || '').match(URLRE);
        if (u) { var a = document.createElement('a'); a.className = 'ib'; a.href = u[0]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = '↗'; a.title = 'Open link'; a.setAttribute('aria-label', 'Open link'); act.appendChild(a); }
      }
      act.appendChild(ib('📌', it.pinned ? 'Unpin' : 'Pin', function () { it.pinned = !it.pinned; CBSave.put(it); render(); }, it.pinned ? 'on' : ''));
      act.appendChild(ib('🗑', 'Delete', function () { hist = hist.filter(function (h) { return h !== it; }); CBSave.del(it.id); render(); toast('Deleted'); }));
      li.append(main, act); ul.appendChild(li);
    });
  }
  $('b-clear').onclick = function () {
    if (!hist.some(function (h) { return !h.pinned; })) { toast(hist.length ? 'Only pinned items left' : 'History is empty'); return; }
    dialog('Clear the history on this device? Pinned items are kept. Other devices keep theirs.', ['Cancel', 'Clear']).then(function (i) {
      if (i !== 1) return;
      CBSave.clearUnpinned(hist).then(function () { hist = hist.filter(function (h) { return h.pinned; }); render(); toast('History cleared'); });
    });
  };

  /* ---------- devices ---------- */
  function paintDevices() {
    var ul = $('devices'); ul.innerHTML = ''; $('dev-empty').hidden = roster.length > 0;
    var sel = $('sel-to'), cur = sel.value || CBStore.get('target');
    sel.innerHTML = '<option value="all">All devices</option>';
    roster.forEach(function (d) {
      var o = document.createElement('option'); o.value = d.id; o.textContent = d.name || 'Device'; sel.appendChild(o);
      var li = document.createElement('li');
      var av = document.createElement('span'); av.className = 'av'; av.textContent = (d.name || '?').charAt(0).toUpperCase();
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = d.name || 'Device';
      var b = document.createElement('button'); b.className = 'btn sm'; b.textContent = 'Send here';
      b.onclick = function () { if (!hasDraft()) { show(0); sel.value = d.id; toast('Paste something, then Send'); $('box').focus(); return; } send(d.id); show(0); };
      li.append(av, nm, b); ul.appendChild(li);
    });
    sel.value = roster.some(function (d) { return d.id === cur; }) ? cur : 'all';
  }

  /* ---------- screens + swipe (75 px, wrap-around) ---------- */
  function show(i) { page = i; $('viewport').scrollLeft = 0; $('track').style.transform = 'translateX(' + (-100 / PAGES * i) + '%)'; document.querySelectorAll('.dot').forEach(function (d, k) { d.classList.toggle('on', k === i); }); }
  document.querySelectorAll('.dot').forEach(function (d) { d.onclick = function () { show(+d.dataset.i); }; });
  (function () {
    var x0 = null, y0 = 0, vp = $('viewport');
    vp.addEventListener('pointerdown', function (e) { if (e.target.closest('input,select,button,textarea,a,img,.it-text')) return; x0 = e.clientX; y0 = e.clientY; });
    vp.addEventListener('pointerup', function (e) {
      if (x0 === null) return; var dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
      if (Math.abs(dx) < SW || Math.abs(dy) > Math.abs(dx)) return;
      show((page + (dx < 0 ? 1 : -1) + PAGES) % PAGES);
    });
  })();

  /* ---------- settings ---------- */
  var inName = $('in-name');
  inName.value = CBStore.get('name') || CBStore.name();
  inName.addEventListener('change', function () { CBStore.set('name', inName.value.trim().slice(0, 40)); $('me-name').textContent = CBStore.name(); CBPeer.rename(); toast('Name saved'); });
  $('chk-auto').checked = !!CBStore.get('autocopy'); $('chk-auto').onchange = function () { CBStore.set('autocopy', this.checked); };
  $('chk-notice').checked = !!CBStore.get('notice'); $('chk-notice').onchange = function () { CBStore.set('notice', this.checked); };
  function paintSeg() { document.querySelectorAll('.seg[data-key=theme] button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === CBStore.get('theme')); }); }
  document.querySelectorAll('.seg[data-key=theme] button').forEach(function (b) { b.onclick = function () { CBStore.set('theme', b.dataset.v); paintSeg(); }; });

  /* ---------- start ---------- */
  $('me-name').textContent = CBStore.name();
  paintSeg(); paintDevices(); paintSend(); render();
  CBSave.all().then(function (l) { l.forEach(function (it) { if (!hist.some(function (h) { return h.id === it.id; })) hist.push(it); }); hist.sort(function (a, b) { return b.ts - a.ts; }); render(); boot(); });
})();
