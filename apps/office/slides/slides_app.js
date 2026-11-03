/* Hub Office Slides SL1 — app: decks (new / open / rename / delete with confirm / import / export), slide actions
   (add after, duplicate, move ▲▼, delete with confirm), menus, in-app dialogs, settings + About, keys, auto-save status.
   window.Slides = small read-only API for tests and later releases.
   SL2: ▶ Present (top bar, from this slide), deck menu Present from start / from this slide, F5 (start), Shift+F5 or P
   outside the text (this slide). Present itself is slides_show.js (SLShow); Esc returns here on the slide shown last.
   SL3: ▦ Layout (this slide) and ＋ Slide ▾ (a new slide with a layout) open the in-app layout picker; 🎨 Theme picks
   the deck theme and this slide's background; 🖼 Picture / paste / drop inserts a picture (SLPics: downscaled,
   re-encoded, kept in IndexedDB). App Undo / Redo (Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z outside the text, ⋯ menu) covers
   pictures, layouts, themes and backgrounds; text keeps the browser's own undo inside the text boxes. */
(function () {
  'use strict';
  var VERSION = 'SL3';   /* legacy: 'SL2' */
  var $ = function (id) { return document.getElementById(id); };
  var deck = null;

  /* ---------- toast + in-app dialog ---------- */
  var tt; function toast(m, ms) { var t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('show'); }, ms || 1800); }
  var dlgDone = null, dlgPrevFocus = null;
  /* o = { title, msg, input:{value, placeholder}, list:[{label, sub, v, cur}], buttons:[{label, v, cls}] } -> Promise(v | {v, text} ) */
  function dialog(o) {
    if (dlgDone) dlgDone(null);
    closeMenus();
    return new Promise(function (res) {
      var d = $('dialog'), inp = $('dlg-in'), ul = $('dlg-list'), bs = $('dlg-btns');
      dlgPrevFocus = document.activeElement;
      $('dlg-t').textContent = o.title || ''; $('dlg-m').textContent = o.msg || '';
      inp.hidden = !o.input; if (o.input) { inp.value = o.input.value || ''; inp.placeholder = o.input.placeholder || ''; }
      ul.hidden = !o.list; ul.textContent = '';
      (o.list || []).forEach(function (it) {
        var li = document.createElement('li'); li.tabIndex = 0; if (it.cur) li.className = 'cur';
        li.innerHTML = '<div class="tx"><b></b><small></small></div>';
        li.querySelector('b').textContent = it.label; li.querySelector('small').textContent = it.sub || '';
        li.onclick = function () { done(it.v); };
        li.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); done(it.v); } };
        ul.appendChild(li);
      });
      bs.textContent = '';
      (o.buttons || [{ label: 'OK', v: true }]).forEach(function (b) {
        var x = document.createElement('button'); x.type = 'button'; x.className = 'mini ' + (b.cls || ''); x.textContent = b.label;
        x.dataset.v = String(b.v);
        x.onclick = function () { done(b.v); }; bs.appendChild(x);
      });
      function done(v) {
        if (!dlgDone) return; dlgDone = null; d.hidden = true;
        if (v !== null && v !== false && o.input) v = { v: v, text: inp.value.trim() };
        try { if (dlgPrevFocus && dlgPrevFocus.focus) dlgPrevFocus.focus({ preventScroll: true }); } catch (_) { /* */ }
        res(v);
      }
      dlgDone = done; d.hidden = false;
      d.onclick = function (e) { if (e.target === d) done(null); };
      d.onkeydown = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); }
        else if (e.key === 'Enter' && e.target === inp) { e.preventDefault(); var ok = (o.buttons || []).filter(function (b) { return b.ok; })[0]; if (ok) done(ok.v); }
        else if (e.key === 'Tab') {   /* keep focus inside */
          var f = [].slice.call(d.querySelectorAll('input:not([hidden]),li[tabindex],button'));
          var i = f.indexOf(document.activeElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
        }
      };
      setTimeout(function () {
        if (o.input) { inp.focus(); inp.select(); return; }
        /* a danger confirm starts on Cancel, so Enter never deletes by accident */
        var first = bs.querySelector(o.danger ? 'button[data-v="false"]' : 'button.acc,button.danger') || bs.querySelector('button');
        if (first) first.focus();
      }, 0);
    });
  }
  function confirmDanger(title, msg, label) {
    return dialog({ title: title, msg: msg, danger: true, buttons: [{ label: 'Cancel', v: false }, { label: label || 'Delete', v: true, cls: 'danger' }] })
      .then(function (v) { return v === true; });
  }
  function askName(title, value, okLabel) {
    return dialog({ title: title, input: { value: value, placeholder: 'Deck name' }, buttons: [{ label: 'Cancel', v: false }, { label: okLabel || 'OK', v: true, cls: 'acc', ok: true }] })
      .then(function (r) { return r && r.v ? (r.text || '').slice(0, 80) : null; });
  }

  /* ---------- menus ---------- */
  function closeMenus() {
    ['menu-deck', 'menu-slide'].forEach(function (id) { $(id).hidden = true; });
    $('b-deck').setAttribute('aria-expanded', 'false'); $('b-more').setAttribute('aria-expanded', 'false');
  }
  function openMenu(id, btn, alignRight) {
    var m = $(id), was = !m.hidden; closeMenus(); if (was) return;
    if (id === 'menu-slide') {
      var n = deck.slides.length, c = deck.cur;
      m.querySelector('[data-a=up]').disabled = c === 0; m.querySelector('[data-a=down]').disabled = c === n - 1;
      var del = m.querySelector('[data-a=del]'); del.disabled = n <= 1; del.title = n <= 1 ? 'A deck keeps at least one slide' : '';
    }
    m.hidden = false; btn.setAttribute('aria-expanded', 'true');
    var r = btn.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    var x = alignRight ? r.right - mw : r.left; x = Math.max(6, Math.min(innerWidth - mw - 6, x));
    var y = Math.min(r.bottom + 4, innerHeight - mh - 6);
    m.style.left = x + 'px'; m.style.top = Math.max(6, y) + 'px';
    var f = m.querySelector('button:not(:disabled)'); if (f) f.focus();
  }
  function menuKeys(m) {
    m.addEventListener('keydown', function (e) {
      var bs = [].slice.call(m.querySelectorAll('button:not(:disabled)')), i = bs.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); var b = m.id === 'menu-deck' ? $('b-deck') : $('b-more'); closeMenus(); b.focus(); }
      else if (e.key === 'Tab') closeMenus();
    });
  }
  document.addEventListener('pointerdown', function (e) {
    if (!e.target.closest('.menu') && !e.target.closest('#b-deck') && !e.target.closest('#b-more')) closeMenus();
  });

  /* ---------- saving ---------- */
  var savedT = 0;
  function status(txt, warn) { var s = $('saved'); s.textContent = txt; s.classList.toggle('warn', !!warn); }
  function dirty() { status('Saving…'); SLSave.saveDeck(deck); }
  SLSave.onSaved = function (ok) {
    clearTimeout(savedT);
    if (SLSave.memOnly) status('Not saved (memory only)', true); else status(ok ? 'Saved' : 'Not saved', !ok);
  };
  SLSave.onWarn(function (m) { $('warn-t').textContent = '⚠ ' + m; $('warn').hidden = false; status('Not saved (memory only)', true); syncSettings(); });
  $('warn-x').onclick = function () { $('warn').hidden = true; };

  /* ---------- deck + slides ---------- */
  function showDeck(d) {
    deck = d; SLSave.setCurrent(d.id);
    $('deck-name').textContent = d.name; document.title = d.name + ' · Slides ' + VERSION;
    undo = []; redo = [];
    renderAll();
    /* pictures come from IndexedDB a moment later; draw again once they are there */
    var need = d.slides.some(function (s) { return (s.pics || []).some(function (p) { return !p.src && p.key; }); });
    if (need) SLPics.hydrate(d).then(function () { if (deck === d) renderAll(); });
  }
  function renderAll() { SLList.render(deck.slides, deck.cur); showSlide(); }
  function showSlide() {
    SLEdit.show(deck.slides[deck.cur], deck.theme || 'light');
    $('pos').textContent = 'Slide ' + (deck.cur + 1) + ' of ' + deck.slides.length;
    $('b-up').disabled = deck.cur === 0; $('b-down').disabled = deck.cur === deck.slides.length - 1;
  }
  function select(i) {
    if (i === deck.cur || i < 0 || i >= deck.slides.length) return;
    SLSave.flush();
    var old = deck.cur; deck.cur = i;
    var kids = $('list-in').children;
    if (kids[old]) { kids[old].classList.remove('cur'); kids[old].setAttribute('aria-current', 'false'); }
    if (kids[i]) { kids[i].classList.add('cur'); kids[i].setAttribute('aria-current', 'true'); }
    SLList.reveal(); showSlide(); dirty();
  }
  /* SL3: a new slide takes the current slide's layout (Title and Section Header are followed by Title + Content) */
  function nextLayout() { var l = deck.slides[deck.cur].layout || 'tc'; return l === 'title' || l === 'sec' ? 'tc' : l; }
  function addSlide(layout) {
    deck.slides.splice(deck.cur + 1, 0, SLSave.cleanSlide({ layout: typeof layout === 'string' ? layout : nextLayout() }));
    if (deck.slides.length > 500) { deck.slides.splice(deck.cur + 1, 1); toast('A deck can have up to 500 slides'); return; }
    deck.cur++; renderAll(); dirty(); SLEdit.focusTitle();
  }
  function dupSlide() {
    var s = deck.slides[deck.cur];
    if (deck.slides.length >= 500) { toast('A deck can have up to 500 slides'); return; }
    /* legacy (SL1 / SL2): SLSave.cleanSlide({ title: s.title, body: s.body }) */
    deck.slides.splice(deck.cur + 1, 0, SLSave.cloneSlide(s, true));
    deck.cur++; renderAll(); dirty(); toast('Slide duplicated');
  }
  function move(from, to) {
    if (to < 0 || to >= deck.slides.length || from === to) return;
    var s = deck.slides.splice(from, 1)[0]; deck.slides.splice(to, 0, s);
    deck.cur = to; renderAll(); dirty();
  }
  function nudge(d) { move(deck.cur, deck.cur + d); }
  function delSlide() {
    if (deck.slides.length <= 1) { toast('A deck keeps at least one slide'); return; }
    var i = deck.cur, s = deck.slides[i];
    confirmDanger('Delete slide ' + (i + 1) + '?', (s.title ? '“' + s.title + '” ' : 'This slide ') + 'and its text will be removed from “' + deck.name + '”.', 'Delete slide').then(function (ok) {
      if (!ok) return;
      deck.slides.splice(i, 1); deck.cur = Math.min(i, deck.slides.length - 1);
      renderAll(); dirty(); toast('Slide deleted');
    });
  }

  function uniqueName(n) {
    var names = SLSave.list().map(function (d) { return d.name.toLowerCase(); });
    if (names.indexOf(n.toLowerCase()) < 0) return n;
    for (var k = 2; k < 1000; k++) { var c = n + ' (' + k + ')'; if (names.indexOf(c.toLowerCase()) < 0) return c; }
    return n;
  }
  function newDeck() {
    askName('New deck', uniqueName('Untitled deck'), 'Create').then(function (n) {
      if (n === null) return;
      SLSave.flush(); showDeck(SLSave.newDeck(n || 'Untitled deck')); status('Saved'); toast('New deck'); SLEdit.focusTitle();
    });
  }
  function fmtDate(ms) { try { return new Date(ms).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } }
  function openDeck() {
    SLSave.flush();
    var list = SLSave.list().map(function (d) { return { label: d.name, sub: d.count + (d.count === 1 ? ' slide' : ' slides') + ' · ' + fmtDate(d.updated), v: d.id, cur: d.id === deck.id }; });
    dialog({ title: 'Open a deck', msg: list.length + (list.length === 1 ? ' deck' : ' decks') + ' on this device', list: list,
      buttons: [{ label: '＋ New deck', v: 'new' }, { label: 'Close', v: false }] }).then(function (v) {
      if (v === 'new') return newDeck();
      if (!v || v === deck.id) return;
      var d = SLSave.load(v);
      if (!d) { toast('That deck could not be opened'); return; }
      showDeck(d); toast('Opened “' + d.name + '”');
    });
  }
  function renameDeck() {
    askName('Rename deck', deck.name, 'Rename').then(function (n) {
      if (!n || n === deck.name) return;
      deck.name = n; $('deck-name').textContent = n; document.title = n + ' · Slides ' + VERSION; dirty(); SLSave.flush(); toast('Renamed');
    });
  }
  function deleteDeck() {
    var n = deck.slides.length;
    confirmDanger('Delete deck “' + deck.name + '”?', 'All ' + n + (n === 1 ? ' slide' : ' slides') + ' in it will be deleted from this device. This can’t be undone (Export first to keep a copy).', 'Delete deck').then(function (ok) {
      if (!ok) return;
      var id = deck.id, name = deck.name; SLSave.deleteDeck(id);
      var next = SLSave.list()[0], d = next && SLSave.load(next.id);
      showDeck(d || SLSave.newDeck('Untitled deck'));
      toast('Deleted “' + name + '”');
    });
  }
  /* ---------- SL2 Present ---------- */
  function present(fromStart) {
    if (SLShow.on()) return;
    if (dlgDone) dlgDone(null);
    closeMenus(); if (!$('settings').hidden) $('settings').hidden = true;
    SLSave.flush();
    SLEdit.select('');
    SLShow.enter(deck.slides, fromStart ? 0 : deck.cur, deck.theme || 'light');
  }
  /* SL3: pictures are written into the file, so wait for them to be loaded from IndexedDB first */
  function exportDeck() { SLSave.flush(); var d = deck; SLPics.hydrate(d).then(function () { var f = SLFile.download(d); toast('Exported ' + f); }); }
  function importParsed(r) {
    SLSave.flush();
    /* pictures go to IndexedDB first, so the deck record stays small */
    return SLPics.storeAll(r.deck.slides).then(function () {
      var d = SLSave.newDeck(uniqueName(r.deck.name), r.deck.slides, r.deck.theme);
      d.slides.forEach(function (s, i) { (s.pics || []).forEach(function (p, j) { var o = r.deck.slides[i] && r.deck.slides[i].pics[j]; if (o && !p.src) p.src = o.src; }); });
      showDeck(d); return d;
    });
  }
  function importFile(file) {
    SLFile.read(file).then(function (r) {
      if (r.error) { dialog({ title: 'Could not import', msg: r.error, buttons: [{ label: 'OK', v: true, cls: 'acc' }] }); return; }
      importParsed(r).then(function (d) { toast('Imported “' + d.name + '” (' + d.slides.length + (d.slides.length === 1 ? ' slide)' : ' slides)') + (r.cut ? ', first 500 kept' : ''), 2600); });
    });
  }

  /* ---------- SL3 undo / redo (pictures, layout, background: per slide; theme: per deck) ---------- */
  var undo = [], redo = [];
  function slideById(id) { return deck.slides.filter(function (s) { return s.id === id; })[0]; }
  function textOf(s) { return { title: s.title, body: s.body, body2: s.body2 }; }
  function sameText(a, b) { return a.title === b.title && a.body === b.body && a.body2 === b.body2; }
  /* e = { label, kind:'slide'|'theme', id, before (slide copy) | theme, after (text right after a layout change) } */
  function pushUndo(e) { undo.push(e); if (undo.length > 50) undo.shift(); redo = []; }
  function recordSlide(slide, before, label) { pushUndo({ label: label, kind: 'slide', id: slide.id, before: before, after: textOf(slide) }); }
  function swap(from, to, verb) {
    var e = from.pop();
    while (e && e.kind === 'slide' && !slideById(e.id)) e = from.pop();   /* that slide was deleted since */
    if (!e) { toast('Nothing to ' + verb.toLowerCase()); return false; }
    if (e.kind === 'theme') {
      to.push({ label: e.label, kind: 'theme', before: deck.theme });
      deck.theme = e.before; renderAll();
    } else {
      var s = slideById(e.id), i = deck.slides.indexOf(s), now = SLSave.cloneSlide(s), b = e.before;
      to.push({ label: e.label, kind: 'slide', id: s.id, before: now, after: textOf(b) });
      s.layout = b.layout; s.bg = b.bg; s.pics = b.pics.map(function (p) { return Object.assign({}, p); });
      /* text comes back only when it was not edited since (a layout change can move text between boxes) */
      if (e.after && sameText(e.after, s)) { s.title = b.title; s.body = b.body; s.body2 = b.body2; }
      if (i !== deck.cur) { SLSave.flush(); deck.cur = i; renderAll(); } else { SLList.update(i); showSlide(); }
    }
    dirty(); toast(verb + ': ' + e.label); return true;
  }

  /* ---------- SL3 layouts ---------- */
  function hasText(t) { return String(t || '').replace(/\s+/g, '') !== ''; }
  /* keeps the text where it fits: the right column joins the left one when the new layout has one text box;
     text with no box in the new layout stays in the slide (hidden) and comes back with a layout that has the box */
  function setLayout(lay) {
    var s = deck.slides[deck.cur], old = s.layout || 'tc';
    if (lay === old) return;
    var b = SLSave.cloneSlide(s), L = SLEdit.slots({ layout: lay });
    s.layout = lay;
    if (!L.b2 && L.b && hasText(s.body2)) { s.body = hasText(s.body) ? s.body.replace(/\n+$/, '') + '\n' + s.body2 : s.body2; s.body2 = ''; }
    var hidden = (!L.t && hasText(s.title)) || (!L.b && hasText(s.body)) || (!L.b2 && hasText(s.body2));
    recordSlide(s, b, 'Layout');
    SLList.update(deck.cur); showSlide(); dirty();
    toast(hidden ? 'Layout: ' + layName(lay) + '. Some text is hidden by this layout (kept; pick another layout to see it)' : 'Layout: ' + layName(lay), hidden ? 3200 : 1600);
  }
  function layName(id) { var x = SLSave.LAYOUTS.filter(function (l) { return l[0] === id; })[0]; return x ? x[1] : id; }
  var SAMPLE = { title: 'Title', body: 'First point\nSecond point\n\tDetail', body2: 'Other side\nMore', pics: [] };
  function tile(label, slide, th, on, v) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'tile' + (on ? ' on' : ''); b.dataset.v = v;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.innerHTML = '<div class="tile-s"><div class="mini-in slide sv"></div></div><span></span>';
    var mi = b.querySelector('.mini-in'); mi.style.transform = 'scale(' + (144 / 960) + ')';
    SLEdit.paint(mi, slide, 0, { max: 6 }, th, 'mini-in slide sv');
    b.querySelector('span').textContent = label;
    return b;
  }
  var pickPrev = null;
  function openPick(kind) {
    closeMenus(); if (dlgDone) dlgDone(null);
    pickPrev = document.activeElement; SLEdit.select('');
    var g = $('pick-grid'), add = kind === 'add', cur = deck.slides[deck.cur];
    g.textContent = ''; $('pick').dataset.kind = kind;
    $('pick-bg').hidden = kind !== 'theme';
    if (kind === 'theme') {
      $('pick-h').textContent = 'Deck theme'; $('pick-m').textContent = 'Colours and fonts for every slide in “' + deck.name + '”.';
      SLSave.THEMES.forEach(function (t) {
        var sample = Object.assign({}, cur, { bg: '', pics: cur.pics || [] });
        if (!hasText(sample.title) && !hasText(sample.body)) sample = Object.assign({}, SAMPLE, { layout: cur.layout });
        g.appendChild(tile(t[1], sample, t[0], (deck.theme || 'light') === t[0], t[0]));
      });
      drawSwatches();
    } else {
      $('pick-h').textContent = add ? 'New slide' : 'Layout';
      $('pick-m').textContent = add ? 'Pick a layout for the new slide (added after this one).' : 'Pick a layout for slide ' + (deck.cur + 1) + '. Text is kept where it fits.';
      SLSave.LAYOUTS.forEach(function (l) {
        var sample = Object.assign({}, SAMPLE, { layout: l[0], title: l[0] === 'blank' ? '' : l[1] });
        g.appendChild(tile(l[1], sample, deck.theme || 'light', !add && (cur.layout || 'tc') === l[0], l[0]));
      });
    }
    $('pick').hidden = false;
    var f = g.querySelector('.tile.on') || g.querySelector('.tile'); if (f) f.focus();
  }
  function closePick() { if ($('pick').hidden) return; $('pick').hidden = true; try { if (pickPrev && pickPrev.focus) pickPrev.focus({ preventScroll: true }); } catch (_) { /* */ } }
  var SWATCHES = ['#ffffff', '#f3f4f6', '#fef3c7', '#dcfce7', '#dbeafe', '#fce7f3', '#1f2937', '#0f2a4a', '#000000'];
  function drawSwatches() {
    var w = $('pick-sw'), s = deck.slides[deck.cur], cur = s.bg || '';
    w.textContent = '';
    var d = document.createElement('button'); d.type = 'button'; d.className = 'sw def' + (cur ? '' : ' on'); d.dataset.bg = ''; d.textContent = 'Theme';
    d.title = 'Use the deck theme background'; w.appendChild(d);
    SWATCHES.forEach(function (c) { var b = document.createElement('button'); b.type = 'button'; b.className = 'sw' + (cur === c ? ' on' : ''); b.dataset.bg = c; b.style.background = c; b.title = c; b.setAttribute('aria-label', 'Background ' + c); w.appendChild(b); });
    var lab = document.createElement('label'); lab.className = 'sw-custom'; lab.innerHTML = '<input type="color" id="pick-color" aria-label="Any colour"> Any colour';
    lab.querySelector('input').value = cur || '#ffffff'; w.appendChild(lab);
  }
  function setTheme(t) {
    if ((deck.theme || 'light') === t) return;
    pushUndo({ label: 'Theme', kind: 'theme', before: deck.theme || 'light' });
    deck.theme = t; renderAll(); dirty(); toast('Theme: ' + (SLSave.THEMES.filter(function (x) { return x[0] === t; })[0] || [0, t])[1]);
  }
  function setBg(c) {
    var s = deck.slides[deck.cur]; c = /^#[0-9a-f]{6}$/i.test(c || '') ? c.toLowerCase() : '';
    if ((s.bg || '') === c) return;
    var b = SLSave.cloneSlide(s); s.bg = c; recordSlide(s, b, 'Background');
    SLList.update(deck.cur); showSlide(); dirty();
  }
  $('pick-x').onclick = closePick;
  $('pick').addEventListener('click', function (e) {
    if (e.target === $('pick')) { closePick(); return; }
    var t = e.target.closest('.tile'), kind = $('pick').dataset.kind;
    if (t) {
      if (kind === 'theme') { setTheme(t.dataset.v); [].forEach.call($('pick-grid').children, function (x) { x.classList.toggle('on', x === t); x.setAttribute('aria-pressed', x === t ? 'true' : 'false'); }); return; }
      closePick();
      if (kind === 'add') { addSlide(t.dataset.v); } else setLayout(t.dataset.v);
      return;
    }
    var sw = e.target.closest('.sw');
    if (sw) { var v = sw.dataset.bg; setBg(v); drawSwatches(); var n = $('pick-sw').querySelector('.sw[data-bg="' + v + '"]'); if (n) n.focus(); }
  });
  $('pick').addEventListener('input', function (e) { if (e.target.id === 'pick-color') { setBg(e.target.value); } });
  $('pick').addEventListener('change', function (e) { if (e.target.id === 'pick-color') drawSwatches(); });
  $('pick').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePick(); return; }
    var ts = [].slice.call($('pick-grid').children), i = ts.indexOf(document.activeElement);
    if (i >= 0 && /^Arrow/.test(e.key)) {
      e.preventDefault();
      var cols = Math.max(1, Math.round($('pick-grid').offsetWidth / (ts[0].offsetWidth + 10)));
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowDown' ? cols : -cols;
      ts[Math.max(0, Math.min(ts.length - 1, i + d))].focus();
    } else if (e.key === 'Tab') {   /* keep focus inside */
      var f = [].slice.call($('pick').querySelectorAll('button,input')).filter(function (x) { return x.offsetParent !== null; }), k = f.indexOf(document.activeElement);
      if (e.shiftKey && k <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && k === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ---------- SL3 pictures: file, paste, drop ---------- */
  var busy = 0;
  function placeRect(w, h, at) {
    var s = deck.slides[deck.cur], ph = !(s.pics || []).length && SLEdit.placeholderRect();
    if (ph && !at) return { x: ph.x, y: ph.y, w: ph.w, h: ph.h };   /* fills the Picture + Caption box (crop to fill) */
    var a = w / h, mw = SLEdit.W * 0.6, mh = SLEdit.H * 0.6, pw = Math.min(mw, mh * a), phh = pw / a;
    var cx = at ? at.x : SLEdit.W / 2, cy = at ? at.y : SLEdit.H / 2;
    return { x: Math.round(cx - pw / 2), y: Math.round(cy - phh / 2), w: Math.round(pw), h: Math.round(phh) };
  }
  function insertPicture(file, at) {
    if (SLShow.on()) return Promise.resolve(false);
    busy++; status('Adding picture…');
    var target = deck, slide = deck.slides[deck.cur];
    return SLPics.fromFile(file).then(function (r) {
      if (r.error) { busy--; dialog({ title: 'Could not add the picture', msg: r.error, buttons: [{ label: 'OK', v: true, cls: 'acc' }] }); status(''); return false; }
      return SLPics.put(r.src).then(function (key) {
        busy--;
        if (deck !== target || deck.slides[deck.cur] !== slide) { toast('Picture not added (the slide changed)'); status(''); return false; }
        var rc = placeRect(r.w, r.h, at);
        var p = SLSave.cleanPic({ key: key || SLPics.keyOf(r.src), src: r.src, inl: !key, x: rc.x, y: rc.y, w: rc.w, h: rc.h, iw: r.w, ih: r.h, fit: 'cover' });
        p.src = r.src;
        SLEdit.addPic(p);
        toast('Picture added' + (r.scaled ? ' (made smaller: ' + r.w + ' × ' + r.h + ')' : ''));
        return true;
      });
    });
  }
  function pickPicture() { SLEdit.select(''); $('pic-in').value = ''; $('pic-in').click(); }
  $('pic-in').addEventListener('change', function () { var f = this.files && this.files[0]; if (f) insertPicture(f); });
  document.addEventListener('paste', function (e) {
    if (SLShow.on() || !$('dialog').hidden || !$('settings').hidden || !$('pick').hidden) return;
    var dt = e.clipboardData; if (!dt) return;
    var f = [].slice.call(dt.files || []).filter(function (x) { return /^image\//.test(x.type); })[0];
    if (!f && dt.items) { var it = [].slice.call(dt.items).filter(function (x) { return x.kind === 'file' && /^image\//.test(x.type); })[0]; f = it && it.getAsFile(); }
    if (!f) return;
    /* while typing, text on the clipboard wins (a copied web page often has both) */
    var tg = e.target, typing = tg && (tg.tagName === 'TEXTAREA' || tg.tagName === 'INPUT');
    if (typing && dt.types && [].indexOf.call(dt.types, 'text/plain') >= 0) return;
    e.preventDefault(); insertPicture(f);
  });

  /* ---------- settings ---------- */
  function syncSettings() {
    [].forEach.call(document.querySelectorAll('.seg[data-key]'), function (sg) {
      var v = String(SLSave.get(sg.dataset.key));
      [].forEach.call(sg.children, function (b) { b.classList.toggle('on', b.dataset.v === v); b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'); });
    });
    $('set-store').textContent = SLSave.memOnly ? 'Memory only: changes are lost when Slides closes. Use Export.' : 'Saved on this device as you type (' + SLSave.list().length + ' decks)';
  }
  function openSettings() { closeMenus(); syncSettings(); $('settings').hidden = false; $('set-x').focus(); }
  function closeSettings() { $('settings').hidden = true; $('b-set').focus(); }
  [].forEach.call(document.querySelectorAll('.seg[data-key]'), function (sg) {
    sg.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; SLSave.set(sg.dataset.key, b.dataset.v); syncSettings(); });
  });
  $('set-x').onclick = closeSettings;
  $('settings').addEventListener('click', function (e) { if (e.target === $('settings')) closeSettings(); });
  $('settings').addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSettings(); } });

  /* ---------- wiring ---------- */
  $('b-deck').onclick = function () { openMenu('menu-deck', $('b-deck'), false); };
  $('b-more').onclick = function () { openMenu('menu-slide', $('b-more'), true); };
  $('b-add').onclick = addSlide;
  $('b-up').onclick = function () { nudge(-1); };
  $('b-down').onclick = function () { nudge(1); };
  $('b-set').onclick = openSettings;
  $('b-show').onclick = function () { present(false); };
  $('menu-deck').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return; closeMenus();
    var a = b.dataset.a;
    if (a === 'new') newDeck(); else if (a === 'open') openDeck(); else if (a === 'rename') renameDeck();
    else if (a === 'import') { $('file-in').value = ''; $('file-in').click(); } else if (a === 'export') exportDeck(); else if (a === 'deldeck') deleteDeck();
    else if (a === 'show0') present(true); else if (a === 'showcur') present(false);
  });
  $('b-addlay').onclick = function () { openPick('add'); };
  $('b-lay').onclick = function () { openPick('layout'); };
  $('b-theme').onclick = function () { openPick('theme'); };
  $('b-pic').onclick = pickPicture;
  $('menu-slide').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || b.disabled) return; closeMenus();
    var a = b.dataset.a;
    if (a === 'add') addSlide(); else if (a === 'dup') dupSlide(); else if (a === 'up') nudge(-1); else if (a === 'down') nudge(1); else if (a === 'del') delSlide();
    else if (a === 'addlay') openPick('add'); else if (a === 'lay') openPick('layout'); else if (a === 'theme') openPick('theme'); else if (a === 'pic') pickPicture();
    else if (a === 'undo') swap(undo, redo, 'Undo'); else if (a === 'redo') swap(redo, undo, 'Redo');
  });
  menuKeys($('menu-deck')); menuKeys($('menu-slide'));
  $('file-in').addEventListener('change', function () { var f = this.files && this.files[0]; if (f) importFile(f); });
  /* drop a .hslides file anywhere to import it; SL3: drop a picture to add it (where it lands on the slide) */
  addEventListener('dragover', function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); });
  addEventListener('drop', function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return;
    e.preventDefault();
    if (/^image\//.test(f.type)) {
      var r = $('slide').getBoundingClientRect(), sc = SLEdit.scale(), at = null;
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) at = { x: (e.clientX - r.left) / sc, y: (e.clientY - r.top) / sc };
      insertPicture(f, at); return;
    }
    importFile(f);
  });
  addEventListener('keydown', function (e) {
    if (SLShow.on()) return;
    /* F5 = present from the start, Shift+F5 = from this slide (never reloads the page); P outside the text = this slide */
    if (e.key === 'F5' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); if ($('dialog').hidden) present(!e.shiftKey); return; }
    if (!$('pick').hidden) { if (e.key === 'Escape') { e.preventDefault(); closePick(); } return; }   /* the picker's own keys are on #pick */
    if (!$('dialog').hidden || !$('settings').hidden) return;
    var tg = e.target, typing = tg && (tg.tagName === 'TEXTAREA' || tg.tagName === 'INPUT' || tg.isContentEditable);
    var menus = !$('menu-deck').hidden || !$('menu-slide').hidden;
    /* SL3: app undo / redo outside the text boxes (inside them the browser's own text undo works) */
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing && (e.key === 'z' || e.key === 'Z' || e.key === 'y' || e.key === 'Y')) {
      e.preventDefault(); if ((e.key === 'y' || e.key === 'Y') || e.shiftKey) swap(redo, undo, 'Redo'); else swap(undo, redo, 'Undo'); return;
    }
    /* SL3: the selected picture: Delete / Backspace removes it (Undo brings it back), arrows nudge it, Esc drops the selection */
    var sp = SLEdit.selected();
    if (sp && !typing && !menus && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); SLEdit.delPic(); toast('Picture deleted (Ctrl+Z brings it back)'); return; }
      var st = e.shiftKey ? 10 : 1, mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
      if (mv) { e.preventDefault(); SLEdit.nudge(mv[0], mv[1]); return; }
      if (e.key === 'Escape') { e.preventDefault(); SLEdit.select(''); return; }
    }
    if ((e.key === 'p' || e.key === 'P') && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && $('menu-deck').hidden && $('menu-slide').hidden) { e.preventDefault(); present(false); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addSlide(); }
    else if (e.key === 'Escape') closeMenus();
  });

  SLEdit.init({ onChange: function (s) { var i = deck.slides.indexOf(s); if (i >= 0) SLList.update(i); dirty(); },
    /* SL3: a picture was added / moved / resized / cropped / deleted */
    onObj: function (s, before, label) { var i = deck.slides.indexOf(s); if (i < 0) return; recordSlide(s, before, label); SLList.update(i); dirty(); },
    onPickPic: pickPicture });
  SLShow.init({ onExit: function (last) {
    /* back in the editor on the slide shown last */
    if (last !== deck.cur) select(last); else { SLList.reveal(); }
    SLEdit.fit();
    try { $('b-show').focus({ preventScroll: true }); } catch (_) { /* */ }
  } });
  SLList.init({ onSelect: select, onMove: move, onNudge: nudge, onEnter: function () { SLEdit.focusTitle(); }, theme: function () { return deck ? deck.theme || 'light' : 'light'; } });

  /* ---------- start: the last deck, else the newest, else a first deck ---------- */
  (function boot() {
    var id = SLSave.currentId(), d = id && SLSave.load(id);
    if (!d) { var f = SLSave.list()[0]; d = f && SLSave.load(f.id); }
    if (!d) d = SLSave.newDeck('My first deck', [{ title: 'Welcome to Slides', body: 'Type a title above and bullets here\nOne bullet per line\n\tPress Tab to indent a line\nAdd slides with ＋ Slide' }]);
    showDeck(d); if (!SLSave.memOnly) status('Saved');
    /* SL3: a few seconds after start, drop stored pictures that no deck uses any more */
    if (!SLSave.memOnly) setTimeout(function () { var keep = SLSave.picKeys(); deck.slides.forEach(function (s) { (s.pics || []).forEach(function (p) { if (p.key) keep[p.key] = 1; }); }); SLPics.gc(keep); }, 4000);
  })();

  window.Slides = {
    version: VERSION,
    deck: function () { return deck; },
    select: select, add: addSlide, present: present, move: move, decks: function () { return SLSave.list(); },
    exportJSON: function () { return SLFile.toJSON(deck); },
    /* legacy (SL1 / SL2): sync import. SL3: r.done = a promise for the new deck (pictures are stored first) */
    importText: function (t) { var r = SLFile.parse(t); if (!r.error) r.done = importParsed(r); return r; },
    setLayout: function (l) { setLayout(l); }, setTheme: function (t) { setTheme(t); }, setBg: function (c) { setBg(c); },
    addSlide: function (l) { addSlide(l); }, insertPicture: insertPicture, undo: function () { return swap(undo, redo, 'Undo'); }, redo: function () { return swap(redo, undo, 'Redo'); },
    busy: function () { return busy; }
  };
})();
