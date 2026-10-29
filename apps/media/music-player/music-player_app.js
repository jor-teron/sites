/* Music Player MP1 — UI: library (virtual song list, sort, search), playlists, player column, dialogs,
   swipes (75 px), keys, resume. Saving goes through MPSave only; files through MediaFiles. */
(function () {
  'use strict';
  var VERSION = 'MP1', APP = 'music-player', SWIPE = 75, AXIS = 10, ROW = 52, LONG = 600;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  var P = MPPlayer, A = P.audio, POS = MediaFiles.positions(APP);
  function fmt(s) { s = Math.max(0, Math.floor(+s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }

  /* ---------- icons ---------- */
  var I = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5.1v13.8c0 .8.9 1.3 1.6.8l10.4-6.9c.6-.4.6-1.3 0-1.7L9.6 4.3C8.9 3.8 8 4.3 8 5.1z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><rect x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/></svg>',
    prev: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="2.6" height="14" rx="1"/><path d="M19 6.2v11.6c0 .8-.9 1.3-1.6.8L9.2 13c-.6-.4-.6-1.3 0-1.7l8.2-5.9c.7-.5 1.6 0 1.6.8z"/></svg>',
    next: '<svg viewBox="0 0 24 24"><rect x="16.4" y="5" width="2.6" height="14" rx="1"/><path d="M5 6.2v11.6c0 .8.9 1.3 1.6.8l8.2-5.6c.6-.4.6-1.3 0-1.7L6.6 5.4C5.9 4.9 5 5.4 5 6.2z"/></svg>',
    shuf: '<svg viewBox="0 0 24 24"><path d="M16 4l4 3.5-4 3.5V8.5h-1.6c-1.2 0-2.2.6-2.9 1.6l-4.3 6.3c-1 1.5-2.6 2.4-4.4 2.4H2v-2.4h.8c1 0 1.9-.5 2.4-1.3l4.3-6.3C10.7 7 12.5 6 14.4 6H16V4zM2 6h.8c1.8 0 3.4.9 4.4 2.3l.6.9-1.4 2.1-1.2-1.7C4.7 8.8 3.8 8.4 2.8 8.4H2V6zm12.4 9.6c-.8 0-1.6-.4-2.1-1l-.4-.6 1.4-2.1.8 1.2c.1.1.2.1.3.1H16V11l4 3.5-4 3.5v-2.4h-1.6z"/></svg>',
    rep: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8v8a4.5 4.5 0 002.5-4zM14 3.2v2.1a7 7 0 010 13.4v2.1a9 9 0 000-17.6z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3l2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4-2.7-2.7z"/></svg>'
  };
  $('b-prev').innerHTML = I.prev; $('b-next').innerHTML = I.next; $('b-shuf').innerHTML = I.shuf;

  /* ---------- toast + in-app dialog ---------- */
  var tt; function toast(m, ms) { var t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('show'); }, ms || 1800); }
  var dlg = $('dialog'), dlgDone = null;
  /* ask({title, msg, input, items:[{label, sub, v}], buttons:[{label, v, cls}]}) -> Promise<{v, text}|null> */
  function ask(o) {
    if (dlgDone) dlgDone(null);
    return new Promise(function (res) {
      $('dlg-t').textContent = o.title || ''; $('dlg-m').textContent = o.msg || '';
      var inp = $('dlg-in'); inp.hidden = o.input == null; inp.value = o.input || ''; inp.placeholder = o.placeholder || '';
      var ul = $('dlg-list'); ul.hidden = !o.items; ul.innerHTML = '';
      (o.items || []).forEach(function (it, i) { var li = document.createElement('li'); li.dataset.i = i; li.innerHTML = '<div class="tx"><b>' + esc(it.label) + '</b>' + (it.sub ? '<small>' + esc(it.sub) + '</small>' : '') + '</div>'; ul.appendChild(li); });
      var bb = $('dlg-btns'); bb.innerHTML = '';
      (o.buttons || [{ label: 'OK', v: 'ok', cls: 'acc' }]).forEach(function (b) { var e = document.createElement('button'); e.type = 'button'; e.className = 'mini ' + (b.cls || ''); e.textContent = b.label; e.onclick = function () { fin(b.v == null ? null : { v: b.v, text: inp.value.trim() }); }; bb.appendChild(e); });
      ul.onclick = function (e) { var li = e.target.closest('li'); if (li) fin({ v: (o.items[+li.dataset.i] || {}).v, item: true, text: inp.value.trim() }); };
      function fin(v) { dlg.hidden = true; dlgDone = null; res(v); }
      dlgDone = fin; dlg.hidden = false;
      setTimeout(function () { if (!inp.hidden) { inp.focus(); inp.select(); } else { var bs = bb.querySelectorAll('button'); bs.length && bs[bs.length - 1].focus(); } }, 30);
      inp.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); var ok = (o.buttons || []).filter(function (b) { return b.v && b.v !== 'cancel'; })[0]; fin({ v: ok ? ok.v : 'ok', text: inp.value.trim() }); } };
    });
  }
  dlg.addEventListener('pointerdown', function (e) { if (e.target === dlg && dlgDone) dlgDone(null); });
  function confirm2(title, msg, ok, danger) { return ask({ title: title, msg: msg, buttons: [{ label: 'Cancel', v: null }, { label: ok, v: 'ok', cls: danger ? 'danger' : 'acc' }] }).then(function (r) { return !!r && r.v === 'ok'; }); }
  function prompt2(title, value, ok) { return ask({ title: title, input: value || '', buttons: [{ label: 'Cancel', v: null }, { label: ok || 'Save', v: 'ok', cls: 'acc' }] }).then(function (r) { return r && r.v === 'ok' ? r.text : null; }); }

  /* ---------- library ---------- */
  var L = { name: '', handle: false, songs: [], byPath: new Map(), byNS: new Map(), byName: new Map() };
  var V = [], query = '', pend = [], reading = 0, dirty = false;
  function mk(e) {
    var k = MediaFiles.key(e), c = MPSave.tag(k), g = c || MPTags.guess(e);
    var s = { e: e, k: k, t: g.title, a: g.artist, al: g.album, tr: g.track || 0, dur: (c && c.dur) || 0, tagged: !!(c && c.tagged), read: !!c };
    s.lc = (s.t + '\n' + s.a + '\n' + s.al + '\n' + e.name).toLowerCase();
    return s;
  }
  function loadLibrary(res) {
    var cur = P.current(); if (cur) { P.clear(); }
    L.name = res.name || ''; L.handle = !!res.handle;
    L.songs = res.files.filter(function (e) { return e.kind === 'audio'; }).map(mk);
    L.byPath = new Map(); L.byNS = new Map(); L.byName = new Map();
    L.songs.forEach(function (s) { L.byPath.set(s.e.path, s); L.byNS.set(s.e.name + '|' + s.e.size, s); if (!L.byName.has(s.e.name)) L.byName.set(s.e.name, s); });
    pend = L.songs.filter(function (s) { return !s.read; }); readTags();
    $('reopen-row').hidden = true;
    $('set-folder').textContent = L.name ? L.name + (L.handle ? ' (remembered)' : '') : L.songs.length ? 'Loose files (not remembered)' : 'None';
    $('list').scrollTop = 0; refresh(); renderPls(); if (openPl) renderPl();
    if (!L.songs.length) { toast('No music files found there'); return; }
    toast(L.songs.length + (L.songs.length === 1 ? ' song' : ' songs'));
    restore();
  }
  function find(it) { return L.byPath.get(it.path) || L.byNS.get(it.name + '|' + it.size) || L.byName.get(it.name) || null; }
  /* tags: two files at a time, a few small slices each; the list is re-sorted at most every 700 ms */
  function readTags() {
    while (reading < 2 && pend.length) {
      var s = pend.shift(); reading++;
      MPTags.read(s.e).then(function (s) { return function (t) {
        s.t = t.title; s.a = t.artist; s.al = t.album; s.tr = t.track; s.tagged = t.tagged; s.read = true;
        s.lc = (s.t + '\n' + s.a + '\n' + s.al + '\n' + s.e.name).toLowerCase();
        MPSave.setTag(s.k, { title: s.t, artist: s.a, album: s.al, track: s.tr, dur: s.dur, tagged: s.tagged });
        if (s === P.current()) nowPlaying();
      }; }(s)).catch(function () { /* keep the guess */ }).then(function () { reading--; dirty = true; soon(); readTags(); });
    }
  }
  var soonT = 0; function soon() { if (soonT) return; soonT = setTimeout(function () { soonT = 0; if (dirty) { dirty = false; refresh(true); renderPls(); if (openPl) renderPl(); } }, 700); }
  function sorter(by) {
    var Z = function (x) { return x || '\uffff'; };
    if (by === 'artist') return function (a, b) { return coll.compare(Z(a.a), Z(b.a)) || coll.compare(Z(a.al), Z(b.al)) || (a.tr - b.tr) || coll.compare(a.t, b.t); };
    if (by === 'album') return function (a, b) { return coll.compare(Z(a.al), Z(b.al)) || (a.tr - b.tr) || coll.compare(a.t, b.t); };
    return function (a, b) { return coll.compare(a.t, b.t) || coll.compare(Z(a.a), Z(b.a)); };
  }
  function view(by, q) {
    var v = q ? L.songs.filter(function (s) { return s.lc.indexOf(q) >= 0; }) : L.songs.slice();
    return v.sort(sorter(by));
  }
  function refresh(keep) {
    V = view(MPSave.get('sort'), query);
    $('list-in').style.height = (V.length * ROW) + 'px';
    var n = L.songs.length;
    $('lib-info').textContent = !n ? '' : (query ? V.length + ' of ' + n : n + (n === 1 ? ' song' : ' songs')) + (L.name ? ' · ' + L.name : '');
    $('empty').hidden = n > 0; $('list').style.visibility = n ? '' : 'hidden';
    if (!keep) $('list').scrollTop = 0;
    draw(true);
  }
  var drawn = '';
  function draw(force) {
    var el = $('list'), h = el.clientHeight || 400, top = el.scrollTop;
    var a = Math.max(0, Math.floor(top / ROW) - 8), b = Math.min(V.length, Math.ceil((top + h) / ROW) + 8);
    var c = P.current(), sig = a + ':' + b + ':' + (c ? c.k : '');
    if (!force && sig === drawn) return; drawn = sig;
    var html = '';
    for (var i = a; i < b; i++) {
      var s = V[i], cur = s === c;
      html += '<div class="song' + (cur ? ' cur' : '') + '" data-i="' + i + '" style="top:' + (i * ROW) + 'px"><span class="n">' + (cur ? (A.paused ? '❚❚' : '♪') : i + 1) + '</span>' +
        '<div class="tx"><b>' + esc(s.t) + '</b><small>' + esc([s.a || 'Unknown artist', s.al].filter(Boolean).join(' · ')) + '</small></div>' +
        '<span class="d">' + (s.dur ? fmt(s.dur) : '') + '</span><button type="button" class="more" aria-label="More">⋯</button></div>';
    }
    $('list-in').innerHTML = html;
  }
  $('list').addEventListener('scroll', function () { draw(false); }, { passive: true });
  addEventListener('resize', function () { draw(true); });
  $('list-in').addEventListener('click', function (e) {
    var r = e.target.closest('.song'); if (!r || swallow) return; var s = V[+r.dataset.i]; if (!s) return;
    if (e.target.closest('.more')) { songMenu(s); return; }
    userPlay(); P.setQueue(V, V.indexOf(s), { src: 'all' });
  });
  /* long-press a row = the same menu as ⋯ */
  (function () {
    var lt = 0, sx = 0, sy = 0;
    $('list-in').addEventListener('pointerdown', function (e) { var r = e.target.closest('.song'); if (!r || e.target.closest('.more')) return; sx = e.clientX; sy = e.clientY; clearTimeout(lt); lt = setTimeout(function () { var s = V[+r.dataset.i]; if (s) { swallowNext(); songMenu(s); } }, LONG); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (n) { $('list-in').addEventListener(n, function () { clearTimeout(lt); }); });
    $('list-in').addEventListener('pointermove', function (e) { if (Math.abs(e.clientX - sx) > AXIS || Math.abs(e.clientY - sy) > AXIS) clearTimeout(lt); });
    $('list').addEventListener('scroll', function () { clearTimeout(lt); }, { passive: true });
  })();
  var swallow = false; function swallowNext() { swallow = true; setTimeout(function () { swallow = false; }, 400); }
  var qT = 0;
  $('q').addEventListener('input', function () { clearTimeout(qT); qT = setTimeout(function () { query = $('q').value.trim().toLowerCase(); refresh(); }, 120); });
  $('q').addEventListener('keydown', function (e) { if (e.key === 'Escape') { $('q').value = ''; query = ''; refresh(); $('q').blur(); } else if (e.key === 'Enter' && V.length) { userPlay(); P.setQueue(V, 0, { src: 'all' }); $('q').blur(); } e.stopPropagation(); });

  function songMenu(s) {
    var items = [{ label: 'Play', v: 'play' }, { label: 'Play next', v: 'next' }, { label: 'Add to playlist…', v: 'add' }];
    if (openPl && pane === 1) items.push({ label: 'Remove from “' + openPl.name + '”', v: 'rm' });
    return ask({ title: s.t, msg: [s.a, s.al].filter(Boolean).join(' · '), items: items, buttons: [{ label: 'Close', v: null }] }).then(function (r) {
      if (!r) return;
      if (r.v === 'play') { userPlay(); P.setQueue(V.indexOf(s) >= 0 ? V : [s], Math.max(0, V.indexOf(s)), { src: 'all' }); }
      else if (r.v === 'next') { P.playNext(s); toast('Plays next'); ui(); }
      else if (r.v === 'add') addTo([s]);
    });
  }

  /* ---------- playlists (saved by path + name; songs are found again when the folder is open) ---------- */
  var PLS = MPSave.playlists(), openPl = null;
  function savePls() { MPSave.savePlaylists(PLS); }
  function plStats(p) { var ok = 0; p.items.forEach(function (it) { if (find(it)) ok++; }); return { ok: ok, miss: p.items.length - ok }; }
  function renderPls() {
    var ul = $('pls'); ul.innerHTML = '';
    PLS.forEach(function (p) {
      var st = plStats(p), li = document.createElement('li'); li.dataset.id = p.id;
      li.innerHTML = '<div class="tx"><b>' + esc(p.name) + '</b><small>' + p.items.length + (p.items.length === 1 ? ' song' : ' songs') + (st.miss ? ' · ' + st.miss + ' need' + (st.miss === 1 ? 's' : '') + ' the folder again' : '') + '</small></div><span class="mut">›</span>';
      ul.appendChild(li);
    });
    $('pls-empty').hidden = PLS.length > 0; ul.hidden = !PLS.length;
  }
  $('pls').addEventListener('click', function (e) { if (swallow) return; var li = e.target.closest('li'); if (li) openList(li.dataset.id); });
  function openList(id) { openPl = PLS.filter(function (p) { return p.id === id; })[0] || null; $('pl-home').hidden = !!openPl; $('pl-detail').hidden = !openPl; if (openPl) renderPl(); else renderPls(); }
  function renderPl() {
    var p = openPl; if (!p) return; $('pl-name').textContent = p.name;
    var ul = $('pl-items'), c = P.current(), miss = 0; ul.innerHTML = '';
    p.items.forEach(function (it, i) {
      var s = find(it), li = document.createElement('li'); li.dataset.i = i; if (!s) { li.className = 'miss'; miss++; } else if (s === c) li.className = 'cur';
      li.innerHTML = '<div class="tx"><b>' + esc(s ? s.t : it.name) + '</b><small>' + esc(s ? [s.a || 'Unknown artist', s.al].filter(Boolean).join(' · ') : 'Needs the folder again · ' + it.path) + '</small></div>' +
        '<button type="button" class="mini sq" data-a="up" aria-label="Move up"' + (i ? '' : ' disabled') + '>▲</button><button type="button" class="mini sq" data-a="down" aria-label="Move down"' + (i < p.items.length - 1 ? '' : ' disabled') + '>▼</button><button type="button" class="mini sq" data-a="rm" aria-label="Remove">✕</button>';
      ul.appendChild(li);
    });
    $('pl-empty').hidden = p.items.length > 0;
    $('pl-missing').hidden = !miss;
    $('pl-missing-t').textContent = miss + (miss === 1 ? ' song needs' : ' songs need') + ' the folder again' + (saved ? ' (“' + saved.name + '”)' : '') + '.';
    $('b-plfolder').textContent = saved && !L.songs.length ? 'Open again' : 'Open folder';
    $('b-plplay').disabled = $('b-plshuf').disabled = miss === p.items.length;
  }
  function plSongs(p) { return p.items.map(find).filter(Boolean); }
  $('pl-items').addEventListener('click', function (e) {
    if (swallow) return;
    var li = e.target.closest('li'); if (!li || !openPl) return; var i = +li.dataset.i, b = e.target.closest('button'), it = openPl.items;
    if (b) {
      var a = b.dataset.a;
      if (a === 'up' && i > 0) { it.splice(i - 1, 0, it.splice(i, 1)[0]); }
      else if (a === 'down' && i < it.length - 1) { it.splice(i + 1, 0, it.splice(i, 1)[0]); }
      else if (a === 'rm') { it.splice(i, 1); toast('Removed'); }
      savePls(); renderPl(); return;
    }
    var s = find(it[i]); if (!s) { toast('Open the folder again to play this song'); return; }
    var list = plSongs(openPl); userPlay(); P.setQueue(list, list.indexOf(s), { src: 'pl:' + openPl.id });
  });
  $('b-plback').onclick = function () { openList(null); };
  $('b-plplay').onclick = function () { var l = plSongs(openPl); if (!l.length) return; userPlay(); if (P.shuffle()) setShuffle(false); P.setQueue(l, 0, { src: 'pl:' + openPl.id }); };
  $('b-plshuf').onclick = function () { var l = plSongs(openPl); if (!l.length) return; userPlay(); setShuffle(true, true); P.setQueue(l, Math.floor(Math.random() * l.length), { src: 'pl:' + openPl.id }); };
  $('b-pladd').onclick = function () { var c = P.current(); if (!c) { toast('Nothing is playing'); return; } addItems(openPl, [c]); renderPl(); };
  $('b-plren').onclick = function () { var p = openPl; prompt2('Rename playlist', p.name, 'Rename').then(function (n) { if (n) { p.name = n.slice(0, 80); savePls(); renderPl(); renderPls(); ui(); } }); };
  $('b-pldel').onclick = function () {
    var p = openPl; confirm2('Delete “' + p.name + '”?', 'The playlist is removed. Your music files stay on this device.', 'Delete', true).then(function (ok) {
      if (!ok) return; PLS = PLS.filter(function (x) { return x !== p; }); savePls(); openList(null); toast('Playlist deleted'); ui();
    });
  };
  $('b-plfolder').onclick = function () { if (saved && !L.songs.length) reopen(); else openFolder(); };
  function newPl(name) { var p = { id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name.slice(0, 80), items: [] }; PLS.push(p); savePls(); return p; }
  $('b-newpl').onclick = function () { prompt2('New playlist', 'Playlist ' + (PLS.length + 1), 'Create').then(function (n) { if (!n) return; var p = newPl(n); renderPls(); openList(p.id); }); };
  function addItems(p, songs) {
    var n = 0; songs.forEach(function (s) { if (p.items.some(function (it) { return it.path === s.e.path; })) return; p.items.push({ path: s.e.path, name: s.e.name, size: s.e.size }); n++; });
    savePls(); toast(n ? 'Added to “' + p.name + '”' : 'Already in “' + p.name + '”'); renderPls(); return n;
  }
  function addTo(songs) {
    var items = PLS.map(function (p) { return { label: p.name, sub: p.items.length + ' songs', v: p.id }; }).concat([{ label: '＋ New playlist', v: '_new' }]);
    return ask({ title: 'Add to playlist', items: items, buttons: [{ label: 'Cancel', v: null }] }).then(function (r) {
      if (!r) return;
      if (r.v === '_new') return prompt2('New playlist', 'Playlist ' + (PLS.length + 1), 'Create').then(function (n) { if (n) { addItems(newPl(n), songs); if (openPl) renderPl(); } });
      var p = PLS.filter(function (x) { return x.id === r.v; })[0]; if (p) { addItems(p, songs); if (openPl === p) renderPl(); }
    });
  }

  /* ---------- opening ---------- */
  var saved = null;
  function opening(on) { $('b-folder').disabled = $('b-files').disabled = on; if (on) toast('Reading the folder…', 60000); }
  function openFolder() {
    opening(true);
    return MediaFiles.pickFolder(APP, { kinds: ['audio'] }).then(function (r) { opening(false); if (r) { if (r.handle) saved = { name: r.name }; loadLibrary(r); } else toast('Nothing opened'); })
      .catch(function () { opening(false); toast('Could not open the folder'); });
  }
  function openFiles() {
    return MediaFiles.pickFiles({ kinds: ['audio'] }).then(function (r) { if (r) loadLibrary(r); }).catch(function () { toast('Could not open the files'); });
  }
  function reopen() {
    opening(true);
    return MediaFiles.reopen(APP, { kinds: ['audio'], ask: true }).then(function (r) { opening(false); if (r) loadLibrary(r); else { toast('Not allowed: pick the folder again'); openFolder(); } });
  }
  $('b-folder').onclick = openFolder; $('b-files').onclick = openFiles; $('b-reopen').onclick = function () { if (saved) reopen(); else openFolder(); };
  $('b-forget').onclick = function () {
    if (!saved && !L.songs.length) { toast('No folder is open'); return; }
    confirm2('Forget the folder?', 'The song list closes and the folder is not opened next time. Playlists stay.', 'Forget', true).then(function (ok) {
      if (!ok) return; MediaFiles.forget(APP); saved = null; P.clear(); MPSave.clearState(); loadLibrary({ name: '', files: [] }); $('empty').hidden = false; toast('Folder forgotten');
    });
  };
  /* drag and drop */
  var app = $('app');
  app.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); app.classList.add('dragover'); } });
  app.addEventListener('dragleave', function (e) { if (e.target === app || !app.contains(e.relatedTarget)) app.classList.remove('dragover'); });
  app.addEventListener('drop', function (e) { e.preventDefault(); app.classList.remove('dragover'); MediaFiles.fromDrop(e.dataTransfer, { kinds: ['audio'] }).then(function (r) { if (r.files.length) loadLibrary(r); else toast('No music files in that drop'); }); });

  /* ---------- resume ---------- */
  var lastSave = 0;
  function saveState() {
    var c = P.current(), q = P.queue(); if (!c) return;
    var big = q.length > 5000, pos = A.currentTime || 0;
    MPSave.saveState({ path: c.e.path, name: c.e.name, size: c.e.size, title: c.t, artist: c.a, pos: pos, src: P.src(), idx: big ? 0 : P.at(),
      queue: big ? [] : q.map(function (s) { return s.e.path; }), order: big ? null : P.order(), big: big ? { sort: MPSave.get('sort'), q: query } : null });
    if (isFinite(A.duration) && A.duration >= 600) POS.set(c.k, pos, A.duration);
    lastSave = Date.now();
  }
  function restore() {
    if (P.current()) return; var s = MPSave.state(); if (!s || !s.path) return;
    var q, order = null;
    if (s.queue.length) {
      var miss = false; q = []; var map = [];
      s.queue.forEach(function (p, i) { var x = L.byPath.get(p); if (x) { map[i] = q.length; q.push(x); } else miss = true; });
      if (!miss && s.order) order = s.order;
    } else q = view(s.big && s.big.sort || 'title', s.big && s.big.q || '');
    var cur = L.byPath.get(s.path) || find({ path: s.path, name: s.name, size: s.size });
    if (!cur) return;
    var i = q.indexOf(cur); if (i < 0) { q = [cur].concat(q); i = 0; order = null; }
    P.setQueue(q, i, { src: s.src, order: order, play: false, pos: s.pos });
    toast('Ready to resume “' + cur.t + '” at ' + fmt(s.pos), 2600);
  }
  addEventListener('pagehide', saveState);
  document.addEventListener('visibilitychange', function () { if (document.hidden) saveState(); });

  /* ---------- player column ---------- */
  var seeking = false;
  function nowPlaying() {
    var c = P.current();
    $('np-title').textContent = c ? c.t : 'Nothing playing';
    var st = !L.songs.length && MPSave.state();
    $('np-sub').textContent = c ? [c.a || 'Unknown artist', c.al].filter(Boolean).join(' · ') : st && st.path ? 'Last: ' + (st.title || st.name) + ' · open the folder again to resume' : L.songs.length ? 'Tap a song to play' : 'Open a folder to start';
    $('art').textContent = c && c.t ? c.t.trim().charAt(0).toUpperCase() || '♪' : '♪';
    document.title = c ? c.t + ' · Music Player MP1' : 'Music Player MP1';
  }
  function ui() {
    var c = P.current(), playing = !A.paused;
    $('b-play').innerHTML = playing ? I.pause : I.play; $('b-play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    $('b-play').disabled = !c; $('b-prev').disabled = $('b-next').disabled = !c; $('seek').disabled = !c;
    $('b-shuf').classList.toggle('on', P.shuffle()); $('b-shuf').setAttribute('aria-pressed', P.shuffle());
    var r = P.repeat(); $('b-rep').classList.toggle('on', r !== 'off'); $('b-rep').innerHTML = I.rep + (r === 'one' ? '<span class="one">1</span>' : '');
    $('b-rep').setAttribute('aria-label', 'Repeat ' + r); $('b-rep').title = 'Repeat: ' + (r === 'off' ? 'off' : r === 'all' ? 'all' : 'one song') + ' (R)';
    $('b-mute').innerHTML = A.muted || !A.volume ? I.mute : I.vol;
    var q = P.queue(), at = P.at(), src = P.src(), pl = src.indexOf('pl:') === 0 ? PLS.filter(function (p) { return 'pl:' + p.id === src; })[0] : null;
    $('q-info').textContent = c ? 'Song ' + (at + 1) + ' of ' + q.length + ' · ' + (pl ? pl.name : src.indexOf('pl:') === 0 ? 'Playlist' : 'All songs') : '';
    draw(true); if (openPl && pane === 1) renderPl();
    time();
  }
  function time() {
    var d = isFinite(A.duration) ? A.duration : 0, t = A.currentTime || 0;
    if (!seeking) { $('seek').value = d ? Math.round(t / d * 1000) : 0; $('t-cur').textContent = fmt(t); }
    $('t-dur').textContent = fmt(d || (P.current() ? P.current().dur : 0));
    if (!A.paused && Date.now() - lastSave > 5000) saveState();
  }
  P.init({
    track: function () { nowPlaying(); ui(); saveState(); },
    state: function () { ui(); if (A.paused) saveState(); },
    time: time,
    queue: ui,
    meta: function (s) { if (s && isFinite(A.duration)) { s.dur = A.duration; MPSave.setTag(s.k, { title: s.t, artist: s.a, album: s.al, track: s.tr, dur: s.dur, tagged: s.tagged }); } ui(); },
    error: function (o) { toast(o.missing ? 'Open the folder again to play this song' : 'Can’t play “' + (o.song.e.name) + '”'); },
    blocked: function () { toast('Tap ▶ to play'); ui(); },
    end: function () { ui(); saveState(); },
    visfail: function () { toast('Level bar not available here'); MPSave.set('vis', false); syncSet(); },
    startPos: function (s) { var p = POS.get(s.k); return p && p.dur >= 600 && p.pos > 10 && p.pos < p.dur - 15 ? p.pos : 0; }
  });
  P.setShuffle(MPSave.get('shuffle')); P.setRepeat(MPSave.get('repeat'));
  P.setVolume(MPSave.get('volume')); P.setMuted(MPSave.get('muted'));
  $('vol').value = Math.round(MPSave.get('volume') * 100);
  /* the level bar's AudioContext is only made after a tap (else the browser would start it suspended = silent) */
  var visWanted = MPSave.get('vis');
  function userPlay() { if (visWanted && !P.visOn()) { $('vis').hidden = false; P.setVis(true, $('vis')); } }
  function setVisOn(on) { visWanted = on; MPSave.set('vis', on); $('vis').hidden = !on; if (on || P.visOn()) P.setVis(on, $('vis')); syncSet(); }
  $('vis').hidden = !visWanted;
  function setShuffle(on, quiet) { P.setShuffle(on); MPSave.set('shuffle', on); if (!quiet) toast(on ? 'Shuffle on' : 'Shuffle off'); ui(); }
  function cycleRepeat() { var r = { off: 'all', all: 'one', one: 'off' }[P.repeat()]; P.setRepeat(r); MPSave.set('repeat', r); toast(r === 'off' ? 'Repeat off' : r === 'all' ? 'Repeat all' : 'Repeat one song'); ui(); }
  function setVol(v) { v = Math.max(0, Math.min(1, v)); P.setVolume(v); MPSave.set('volume', v); if (v && A.muted) { P.setMuted(false); MPSave.set('muted', false); } $('vol').value = Math.round(v * 100); ui(); }
  function toggleMute() { P.setMuted(!A.muted); MPSave.set('muted', A.muted); toast(A.muted ? 'Muted' : 'Sound on'); ui(); }
  function playPause() { if (!P.current()) { if (V.length) { userPlay(); P.setQueue(V, 0, { src: 'all' }); } else toast('Open a folder first'); return; } userPlay(); P.toggle(); }
  $('b-play').onclick = playPause;
  $('b-prev').onclick = function () { userPlay(); P.prev(); };
  $('b-next').onclick = function () { userPlay(); P.next(true); };
  $('b-shuf').onclick = function () { setShuffle(!P.shuffle()); };
  $('b-rep').onclick = cycleRepeat;
  $('b-mute').onclick = toggleMute;
  $('vol').addEventListener('input', function () { setVol($('vol').value / 100); });
  $('seek').addEventListener('input', function () { seeking = true; var d = isFinite(A.duration) ? A.duration : 0; $('t-cur').textContent = fmt($('seek').value / 1000 * d); });
  $('seek').addEventListener('change', function () { var d = isFinite(A.duration) ? A.duration : 0; seeking = false; if (d) P.seek($('seek').value / 1000 * d); saveState(); });
  $('np').addEventListener('click', function () { if (matchMedia('(max-width:760px)').matches) $('side').classList.toggle('open'); });

  /* ---------- screens: dots + 75 px swipes ---------- */
  var pane = 0, track = $('track');
  function place(dx) { track.style.transform = 'translateX(calc(' + (-100 / 3 * pane) + '% + ' + (dx || 0) + 'px))'; }
  function setPane(i) { pane = (i + 3) % 3; place(0); document.querySelectorAll('.dot').forEach(function (d) { var on = +d.dataset.i === pane; d.classList.toggle('on', on); d.setAttribute('aria-selected', on); }); if (pane === 1) { if (openPl) renderPl(); else renderPls(); } if (pane === 0) draw(true); }
  document.querySelectorAll('.dot').forEach(function (d) { d.onclick = function () { setPane(+d.dataset.i); }; });
  var g = null, vp = $('viewport');
  vp.addEventListener('pointerdown', function (e) {
    if (!dlg.hidden || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('input') || (e.pointerType === 'mouse' && e.target.closest('.seg'))) return;
    g = { x: e.clientX, y: e.clientY, axis: null, id: e.pointerId };
  });
  vp.addEventListener('pointermove', function (e) {
    if (!g || e.pointerId !== g.id) return; var dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.axis && (Math.abs(dx) > AXIS || Math.abs(dy) > AXIS)) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (g.axis === 'x') { track.classList.add('drag'); var edge = (pane === 0 && dx > 0) || (pane === 2 && dx < 0); place(edge ? dx * 0.3 : dx); }
  });
  function end(e, cancel) {
    if (!g || e.pointerId !== g.id) return; var dx = e.clientX - g.x, dy = e.clientY - g.y, gg = g; g = null; track.classList.remove('drag');
    if (gg.axis === 'x') swallowNext();
    if (!cancel && gg.axis === 'x' && Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy)) { setPane(pane + (dx < 0 ? 1 : -1)); return; }
    place(0);
  }
  vp.addEventListener('pointerup', function (e) { end(e, false); });
  vp.addEventListener('pointercancel', function (e) { end(e, true); });

  /* ---------- settings ---------- */
  function syncSet() {
    document.querySelectorAll('.seg').forEach(function (s) { var k = s.dataset.key, v = MPSave.get(k); if (k === 'vis') v = v ? '1' : '0'; s.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === String(v)); }); });
  }
  document.querySelectorAll('.seg').forEach(function (s) {
    s.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; var k = s.dataset.key;
      if (k === 'vis') setVisOn(b.dataset.v === '1');
      else { MPSave.set(k, b.dataset.v); if (k === 'sort') refresh(); }
      syncSet();
    });
  });
  $('ver').textContent = VERSION;

  /* ---------- keys ---------- */
  addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!dlg.hidden) { if (e.key === 'Escape' && dlgDone) dlgDone(null); return; }
    var tg = e.target, typing = tg && (tg.tagName === 'INPUT' && tg.type !== 'range' || tg.tagName === 'TEXTAREA');
    if (typing) return;
    var k = e.key;
    if (k === ' ' || k === 'k' || k === 'K') { e.preventDefault(); playPause(); }
    else if (k === 'n' || k === 'N') { userPlay(); P.next(true); }
    else if (k === 'p' || k === 'P') { userPlay(); P.prev(); }
    else if (k === 'ArrowRight' && tg.type !== 'range') { e.preventDefault(); P.seekBy(e.shiftKey ? 30 : 5); }
    else if (k === 'ArrowLeft' && tg.type !== 'range') { e.preventDefault(); P.seekBy(e.shiftKey ? -30 : -5); }
    else if (k === 'ArrowUp' && tg.type !== 'range') { e.preventDefault(); setVol(A.volume + 0.05); }
    else if (k === 'ArrowDown' && tg.type !== 'range') { e.preventDefault(); setVol(A.volume - 0.05); }
    else if (k === 's' || k === 'S') setShuffle(!P.shuffle());
    else if (k === 'r' || k === 'R') cycleRepeat();
    else if (k === 'm' || k === 'M') toggleMute();
    else if (k === 'v' || k === 'V') { setVisOn(!visWanted); toast(visWanted ? 'Level bar on' : 'Level bar off'); }
    else if (k === '/') { e.preventDefault(); setPane(0); $('q').focus(); }
    else if (k === 'o' || k === 'O') openFolder();
    else if (k === '1' || k === '2' || k === '3') setPane(+k - 1);
  });

  /* ---------- start ---------- */
  syncSet(); renderPls(); refresh(); nowPlaying(); ui(); place(0);
  var st0 = MPSave.state();
  MediaFiles.savedFolder(APP).then(function (f) {
    saved = f;
    if (f) {
      return MediaFiles.reopen(APP, { kinds: ['audio'], ask: false }).then(function (r) {
        if (r) { loadLibrary(r); return; }
        $('reopen-t').textContent = '“' + f.name + '” was open last time' + (st0 && st0.path ? ' (resume “' + (st0.title || st0.name) + '”)' : '') + '.';
        $('b-reopen').textContent = 'Open again'; $('reopen-row').hidden = false; if (openPl) renderPl();
      });
    }
    if (st0 && st0.path) { $('reopen-t').textContent = 'Open your music folder again to resume “' + (st0.title || st0.name) + '”.'; $('b-reopen').textContent = 'Open folder'; $('reopen-row').hidden = false; }
  });
  window.MusicPlayer = { VERSION: VERSION, lib: function () { return L; }, view: function () { return V; }, playlists: function () { return PLS; },
    pane: function () { return pane; }, setPane: setPane, load: loadLibrary, ask: ask, openList: openList, songMenu: songMenu, addTo: addTo, saveState: saveState };
})();
