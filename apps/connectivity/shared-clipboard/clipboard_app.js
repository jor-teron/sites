/* Shared Clipboard CB1/CB2 — UI + sync: screens (Clipboard, Devices, Settings), dots + 75 px wrap-around swipes,
   CB2: files by Ctrl+V paste / drag-drop (≤25 MB, 64 KB pieces, progress + Cancel), file cards, Save to folder, 200 MB file cap.
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
  /* CB2: files */
  var FMAX = 25 * 1024 * 1024, CHUNK = 64 * 1024, HIGH = 1024 * 1024, pendFiles = [], xfers = {};

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
    /* CB1: for (var i = 0; i < items.length; i++) if (items[i].kind === 'file' && /^image\//.test(items[i].type)) { e.preventDefault(); setImageBlob(items[i].getAsFile()); if (page !== 0) show(0); return; } */
    var fl = pastedFiles(e.clipboardData);
    if (fl.length) { e.preventDefault(); takeFiles(fl); if (page !== 0) show(0); return; }
    if (document.activeElement !== $('box') && e.clipboardData) { var t = e.clipboardData.getData('text/plain'); if (t) { e.preventDefault(); setText(t); if (page !== 0) show(0); } }
  });
  /* CB2: files from a paste (clipboardData.files, else items of kind 'file') — files copied in a file manager come in here when the browser exposes them */
  function pastedFiles(cd) {
    if (!cd) return [];
    var f = [].slice.call(cd.files || []);
    if (!f.length) [].slice.call(cd.items || []).forEach(function (it) { if (it.kind === 'file') { var x = it.getAsFile(); if (x) f.push(x); } });
    return f;
  }
  /* one image alone stays an image (CB1 behaviour); anything else becomes file items */
  function takeFiles(fl) {
    if (fl.length === 1 && /^image\/(png|jpeg|gif|webp)$/.test(fl[0].type) && !pendFiles.length) return setImageBlob(fl[0]);
    var big = [];
    fl.forEach(function (f) { if (f.size > FMAX) big.push(f.name); else if (!pendFiles.some(function (p) { return p.name === f.name && p.size === f.size; })) pendFiles.push(f); });
    paintFiles();
    if (big.length) dialog(big.join(', ') + (big.length > 1 ? ' are' : ' is') + ' over 25 MB. Use File Drop for big files.', ['OK']);
    else if (fl.length) toast(fl.length === 1 ? 'File ready — press Send' : fl.length + ' files ready — press Send');
  }
  function paintFiles() {
    var ul = $('files-pend'); ul.innerHTML = ''; ul.hidden = !pendFiles.length;
    pendFiles.forEach(function (f, i) {
      var li = document.createElement('li'); li.textContent = icon(f.type, f.name) + ' ' + f.name + ' · ' + size(f.size);
      var x = document.createElement('button'); x.className = 'x'; x.textContent = '✕'; x.title = 'Remove';
      x.onclick = function () { pendFiles.splice(i, 1); paintFiles(); };
      li.appendChild(x); ul.appendChild(li);
    });
    paintSend();
  }
  function size(b) { b = +b || 0; return b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB'; }
  function icon(mime, n) {
    var m = String(mime || ''), e = (String(n || '').match(/\.([a-z0-9]+)$/i) || ['', ''])[1].toLowerCase();
    if (/^image\//.test(m)) return '🖼️'; if (/^video\//.test(m)) return '🎬'; if (/^audio\//.test(m)) return '🎵';
    if (/pdf/.test(m) || e === 'pdf') return '📕';
    if (/zip|rar|7z|tar|gz/.test(m + e)) return '🗜️';
    if (/sheet|excel|csv/.test(m) || /^(xlsx?|csv|ods)$/.test(e)) return '📊';
    if (/presentation|powerpoint/.test(m) || /^(pptx?|odp)$/.test(e)) return '📽️';
    if (/^text\/|json|xml|javascript/.test(m) || /^(txt|md|docx?|odt|rtf)$/.test(e)) return '📝';
    return '📄';
  }
  /* (function () { CB1 drop handler kept below, now on the whole page with an overlay) */
  (function () {
    var ov = $('drop-ov'), depth = 0;
    function hasFiles(e) { return e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') >= 0; }
    document.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth++; ov.hidden = false; });
    document.addEventListener('dragover', function (e) { if (hasFiles(e)) e.preventDefault(); });
    document.addEventListener('dragleave', function (e) { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) ov.hidden = true; });
    document.addEventListener('drop', function (e) {
      depth = 0; ov.hidden = true;
      if (!hasFiles(e) || e.defaultPrevented) return;
      e.preventDefault(); takeFiles([].slice.call(e.dataTransfer.files || [])); if (page !== 0) show(0);
    });
  })();
  (function () {
    var d = $('drop');
    ['dragenter', 'dragover'].forEach(function (n) { d.addEventListener(n, function (e) { e.preventDefault(); d.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (n) { d.addEventListener(n, function () { d.classList.remove('over'); }); });
    d.addEventListener('drop', function (e) {
      e.preventDefault();
      /* CB1: var f = [].slice.call(e.dataTransfer.files || []).filter(function (x) { return /^image\//.test(x.type); })[0];
         if (f) return setImageBlob(f); … else if (e.dataTransfer.files.length) dialog('Only text and images can be shared. Use File Drop for other files.', ['OK']); */
      if (e.dataTransfer.files && e.dataTransfer.files.length) return takeFiles([].slice.call(e.dataTransfer.files));
      var t = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list');
      if (t) setText(t);
    });
  })();
  function hasDraft() { return !!(pendImg || pendFiles.length || $('box').value.trim()); }
  function paintSend() { $('b-send').disabled = !hasDraft(); }

  /* ---------- send / receive ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function wire(it) { var o = { id: it.id, ts: it.ts, kind: it.kind, name: it.name }; if (it.kind === 'image') o.img = it.img; else o.text = it.text; return o; }
  function nameOf(id) { var d = roster.filter(function (r) { return r.id === id; })[0]; return d ? d.name || 'Device' : ''; }
  function send(to) {
    if (!hasDraft()) { toast('Paste or type something first'); return; }
    if (pendFiles.length) {   // CB2: files go first, then any text/image draft as before
      var fs = pendFiles; pendFiles = []; paintFiles();
      fs.forEach(function (f) { sendFile(f, to); });
      if (!pendImg && !$('box').value.trim()) return;
    }
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
    if (it.kind === 'file') {   // CB2: 200 MB file cap
      var fd = CBSave.capFiles(hist);
      if (fd.length) { hist = hist.filter(function (h) { return fd.indexOf(h.id) < 0; }); toast('Storage full (200 MB) — removed ' + fd.length + ' old file' + (fd.length > 1 ? 's' : '')); }
    }
    render(flash ? it.id : null); return true;
  }
  CBPeer.provide(function () {
    return { k: 'recent', its: hist.filter(function (h) { return !h.to && !h.priv && h.kind !== 'file'; }).slice(0, 10).map(function (h) { var w = wire(h); w.from = h.from === 'me' ? myId : h.from; return w; }) };
  });
  CBPeer.on('me', function (id) { myId = id; });
  CBPeer.on('status', setStatus);
  CBPeer.on('roster', function (l) { roster = l; paintDevices(); });
  CBPeer.on('signal', function (m, from) {
    if (!m || typeof m !== 'object') return;
    if (m.k === 'fmeta' || m.k === 'fchunk' || m.k === 'fcancel') return onFileMsg(m, from);   // CB2
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
  /* ---------- CB2: files in pieces ----------
     sender: {k:'fmeta', id, it:{id, ts, kind:'file', name, fname, mime, size}, n, priv?}, then n × {k:'fchunk', id, i, n, data:ArrayBuffer ≤64 KB},
     paced on the data channel's bufferedAmount (≤1 MB queued). Either side may send {k:'fcancel', id}.
     Old (CB1) clients ignore these k values; 'clip' and 'recent' never carry files. */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function sendFile(f, to) {
    var it = { id: uid(), ts: Date.now(), from: 'me', name: CBStore.name(), pinned: false, kind: 'file', fname: String(f.name || 'file').slice(0, 200), mime: f.type || 'application/octet-stream', size: f.size, blob: f };
    if (to && to !== 'all') it.to = to;
    var n = Math.max(1, Math.ceil(f.size / CHUNK));
    var tx = function (msg) { return it.to ? (CBPeer.sendTo(it.to, msg), CBPeer.online()) : CBPeer.send(msg); };
    add(it, true);
    if (!CBPeer.online()) { toast('Not connected — kept here only'); return; }
    var x = xfers[it.id] = { id: it.id, out: true, fname: it.fname, size: f.size, n: n, got: 0, to: it.to, cancelled: false };
    paintXfers();
    var meta = { k: 'fmeta', id: it.id, n: n, it: { id: it.id, ts: it.ts, kind: 'file', name: it.name, fname: it.fname, mime: it.mime, size: it.size } };
    if (it.to) meta.priv = true;
    tx(meta);
    (async function () {
      for (var i = 0; i < n; i++) {
        if (x.cancelled) return;
        while (CBPeer.buffered() > HIGH) { await sleep(25); if (x.cancelled) return; if (!CBPeer.online()) break; }
        if (!CBPeer.online()) { x.fail = 'Connection lost'; break; }
        var buf = await f.slice(i * CHUNK, Math.min(f.size, (i + 1) * CHUNK)).arrayBuffer();
        tx({ k: 'fchunk', id: it.id, i: i, n: n, data: buf });
        x.got = i + 1; if (!(i % 8) || i === n - 1) paintXfers();
      }
      if (x.fail) { toast(it.fname + ': ' + x.fail); delete xfers[it.id]; paintXfers(); return; }
      delete xfers[it.id]; paintXfers();
      toast('Sent ' + it.fname + (it.to ? ' to ' + (nameOf(it.to) || 'device') : ''));
    })().catch(function (e) { delete xfers[it.id]; paintXfers(); dialog('Sending ' + it.fname + ' failed: ' + (e && e.message || e), ['OK']); });
  }
  function cancelXfer(x) {
    x.cancelled = true; delete xfers[x.id]; paintXfers();
    var msg = { k: 'fcancel', id: x.id };
    if (x.out) { if (x.to) CBPeer.sendTo(x.to, msg); else CBPeer.send(msg); }
    else if (x.from) CBPeer.sendTo(x.from, msg);   // tells the sender; for a send to all it only stops for this device
    toast('Cancelled ' + x.fname);
  }
  function onFileMsg(m, from) {
    var id = String(m.id || ''), x = xfers[id];
    if (!id) return;
    if (m.k === 'fcancel') {
      if (!x) return;
      if (x.out) { if (x.to || roster.length <= 1) { x.cancelled = true; delete xfers[id]; paintXfers(); toast((nameOf(from) || 'The other device') + ' cancelled ' + x.fname); } return; }
      if (x.from === from) { delete xfers[id]; paintXfers(); toast(x.fname + ' was cancelled by the sender'); }
      return;
    }
    if (m.k === 'fmeta') {
      var w = m.it || {}, n = +m.n | 0, sz = +w.size || 0;
      if (x || hist.some(function (h) { return h.id === id; })) return;
      if (w.kind !== 'file' || n < 1 || sz > FMAX || n !== Math.max(1, Math.ceil(sz / CHUNK))) return;
      xfers[id] = { id: id, out: false, from: from, n: n, got: 0, bytes: 0, parts: new Array(n), size: sz, priv: !!m.priv,
        meta: { id: id, ts: +w.ts || Date.now(), kind: 'file', from: from || '', name: String(w.name || nameOf(from) || 'Device').slice(0, 40), fname: String(w.fname || 'file').slice(0, 200), mime: String(w.mime || 'application/octet-stream').slice(0, 100), size: sz, pinned: false },
        fname: String(w.fname || 'file').slice(0, 200), last: Date.now() };
      paintXfers(); return;
    }
    /* fchunk */
    if (!x || x.out || x.from !== from) return;
    var i = +m.i | 0, d = m.data;
    if (d && !(d instanceof ArrayBuffer) && d.buffer instanceof ArrayBuffer) d = d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
    if (!(d instanceof ArrayBuffer) || i < 0 || i >= x.n || x.parts[i]) return;
    x.parts[i] = d; x.got++; x.bytes += d.byteLength; x.last = Date.now();
    if (x.bytes > x.size) { delete xfers[id]; paintXfers(); toast(x.fname + ': size mismatch — dropped'); return; }
    if (x.got < x.n) { if (!(x.got % 8)) paintXfers(); return; }
    delete xfers[id]; paintXfers();
    if (x.bytes !== x.size) { toast(x.fname + ': size mismatch — dropped'); return; }
    var it = x.meta; it.blob = new Blob(x.parts, { type: it.mime }); if (x.priv) it.priv = true;
    if (add(it, true)) onIncoming(it);
  }
  setInterval(function () {   // drop incoming transfers idle for 60 s
    var t = Date.now(), ch = false;
    Object.keys(xfers).forEach(function (k) { var x = xfers[k]; if (!x.out && t - x.last > 60000) { delete xfers[k]; ch = true; toast(x.fname + ' stopped arriving'); } });
    if (ch) paintXfers();
  }, 10000);
  function paintXfers() {
    var ul = $('xfers'), ks = Object.keys(xfers); ul.innerHTML = ''; ul.hidden = !ks.length;
    ks.forEach(function (k) {
      var x = xfers[k], li = document.createElement('li');
      var lb = document.createElement('div'); lb.className = 'x-lbl';
      lb.textContent = (x.out ? '⬆ ' : '⬇ ') + x.fname + ' · ' + size(x.size) + ' · ' + Math.floor(100 * x.got / x.n) + '%';
      var bar = document.createElement('div'); bar.className = 'x-bar'; var fill = document.createElement('i'); fill.style.width = (100 * x.got / x.n) + '%'; bar.appendChild(fill);
      var b = document.createElement('button'); b.className = 'mini'; b.textContent = 'Cancel'; b.onclick = function () { cancelXfer(x); };
      var col = document.createElement('div'); col.className = 'x-col'; col.append(lb, bar);
      li.append(col, b); ul.appendChild(li);
    });
  }
  function openFile(it) {
    var u = URL.createObjectURL(it.blob), w = window.open(u, '_blank', 'noopener');
    if (!w) { var a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
    setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
  }
  function saveIt(it) {
    if (!it.blob) { toast('File data is missing'); return; }
    CBSave.saveFile(it).then(function (r) { toast(r.how === 'folder' ? 'Saved ' + r.name + ' in ' + (r.dir || 'your folder') : 'Downloaded ' + r.name); })
      .catch(function (e) { dialog('Save failed: ' + (e && e.message || e), ['OK']); });
  }
  function shareFile(it) {
    return new File([it.blob], it.fname, { type: it.mime });
  }
  function canShare(it) { try { return !!(it.blob && navigator.share && navigator.canShare && navigator.canShare({ files: [shareFile(it)] })); } catch (_) { return false; } }
  function doShare(it) { navigator.share({ files: [shareFile(it)], title: it.fname }).catch(function (e) { if (e && e.name !== 'AbortError') toast('Share failed'); }); }

  function onIncoming(it) {
    /* CB1: var preview = it.kind === 'image' ? '🖼️ Image' : it.text.slice(0, 120); */
    var preview = it.kind === 'image' ? '🖼️ Image' : it.kind === 'file' ? icon(it.mime, it.fname) + ' ' + it.fname + ' · ' + size(it.size) : it.text.slice(0, 120);
    $('n-copy').textContent = it.kind === 'file' ? 'Save' : 'Copy';
    if (CBStore.get('notice')) {
      noticeIt = it; $('n-title').textContent = 'From ' + it.name; $('n-text').textContent = preview; $('notice').hidden = false;
      clearTimeout(noticeT); noticeT = setTimeout(function () { $('notice').hidden = true; }, 7000);
      if (inHub && document.hidden) { try { window.top.HubNotify.notice({ icon: '📋', title: 'Shared Clipboard · ' + it.name, text: preview, timeoutMs: 8000 }); } catch (_) { /* cross-origin / no Hub */ } }
    }
    if (CBStore.get('autocopy') && it.kind === 'text') {
      CBSave.copy(it).then(function () { toast('Copied from ' + it.name); }).catch(function () { toast('Auto-copy was blocked — tap Copy'); });
    }
  }
  $('n-copy').onclick = function () { if (noticeIt) { if (noticeIt.kind === 'file') saveIt(noticeIt); else doCopy(noticeIt); } $('notice').hidden = true; };
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
      if (it.kind !== 'file') act.appendChild(ib('📋', 'Copy', function () { doCopy(it); }, 'cp'));
      if (it.kind === 'file') {   // CB2 file card
        var fc = document.createElement('div'); fc.className = 'it-file';
        var ic = document.createElement('span'); ic.className = 'f-ic'; ic.textContent = icon(it.mime, it.fname);
        var fn = document.createElement('span'); fn.className = 'f-nm'; fn.textContent = it.fname;
        var fz = document.createElement('span'); fz.className = 'f-sz mut'; fz.textContent = size(it.size);
        fc.append(ic, fn, fz); main.appendChild(fc);
        if (it.blob) {
          act.appendChild(ib('↗', 'Open', function () { openFile(it); }));
          act.appendChild(ib('💾', 'Save', function () { saveIt(it); }, 'cp'));
          if (canShare(it)) act.appendChild(ib('📤', 'Share', function () { doShare(it); }));
        }
      } else if (it.kind === 'image') {
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
  /* CB2: save folder */
  function paintFolder() {
    var row = $('row-folder'); if (!CBSave.canFolder) { row.hidden = true; $('folder-note').hidden = false; return; }
    CBSave.getDir().then(function (h) { $('folder-lbl').textContent = h ? h.name : 'Downloads (ask each time)'; $('btn-folder-x').hidden = !h; });
  }
  $('btn-folder').onclick = function () { CBSave.pickFolder().then(function (h) { toast('Files will save to ' + h.name); paintFolder(); }).catch(function (e) { if (e && e.name !== 'AbortError') toast('Could not use that folder'); }); };
  $('btn-folder-x').onclick = function () { CBSave.forgetFolder().then(function () { toast('Save folder removed'); paintFolder(); }); };
  paintFolder();
  function paintSeg() { document.querySelectorAll('.seg[data-key=theme] button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === CBStore.get('theme')); }); }
  document.querySelectorAll('.seg[data-key=theme] button').forEach(function (b) { b.onclick = function () { CBStore.set('theme', b.dataset.v); paintSeg(); }; });

  /* ---------- start ---------- */
  $('me-name').textContent = CBStore.name();
  paintSeg(); paintDevices(); paintSend(); render();
  CBSave.all().then(function (l) { l.forEach(function (it) { if (!hist.some(function (h) { return h.id === it.id; })) hist.push(it); }); hist.sort(function (a, b) { return b.ts - a.ts; }); render(); boot(); });
})();
