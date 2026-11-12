/* Hub Office Slides SL1 — app: decks (new / open / rename / delete with confirm / import / export), slide actions
   (add after, duplicate, move ▲▼, delete with confirm), menus, in-app dialogs, settings + About, keys, auto-save status.
   window.Slides = small read-only API for tests and later releases.
   SL2: ▶ Present (top bar, from this slide), deck menu Present from start / from this slide, F5 (start), Shift+F5 or P
   outside the text (this slide). Present itself is slides_show.js (SLShow); Esc returns here on the slide shown last.
   SL3: ▦ Layout (this slide) and ＋ Slide ▾ (a new slide with a layout) open the in-app layout picker; 🎨 Theme picks
   the deck theme and this slide's background; 🖼 Picture / paste / drop inserts a picture (SLPics: downscaled,
   re-encoded, kept in IndexedDB). App Undo / Redo (Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z outside the text, ⋯ menu) covers
   pictures, layouts, themes and backgrounds; text keeps the browser's own undo inside the text boxes.
   SL4: the Office ribbon (../shared/office-ribbon.js: File = the deck menu, Home / Insert / Design / Slide Show; the ⋯ menu
   at the end of the ribbon keeps every slide action for phones), the HO1 Quick Access bar (../shared/office-quick.js:
   Undo / Redo = this app undo, Save = SLSave.flush + ✓ Saved, Print = SLPrint; Ctrl+Z / Y / S / P; in the Hub title bar
   after hubTitleBarHello), the Hub app bar (slides_hub.js) and Print / Export PDF (slides_print.js).
   SL5: Format group on Home + mini toolbar (bold / italic / underline, size, colour, highlight, align, bullet / numbered
   / none, clear), Insert text box, rich-text undo of formatting and of text-box add / move / resize / delete.
   SL6: Insert shape / table, Home Arrange (front / back, align, distribute), Shift multi-select, snap guides;
     undo covers shapes, tables and arrange.
   SL7: speaker notes (pane under the editor), Presenter view (F6; a second window, or one screen if the popup is
     blocked or storage is memory-only), pen / laser / B / W / transitions during Present; undo covers notes,
     transitions and kept ink.
   SL8: more deck themes (colour + font; app chrome stays System / Light / Dark), master footer, hide slide, sections;
     undo covers master, hide and section structure.
   SL9: File export / import .pptx (SLPptx + SLZip; deflated imports lazy-load vendored JSZip) and Export PNG
     (this slide, or all slides in a zip). In-app summary dialogs. No .hslides format bump.
   SL10: do not size the canvas until SLEdit.init has assigned the stage; setNotesOpen(notesWanted()) runs after
     that init so the notes pane is restored and the slide is fitted once the canvas is ready. A guard in doFit
     also returns early if the stage is missing, so a similar call cannot abort the ribbon, File menu, slide list
     or deck boot. */
(function () {
  'use strict';
  /* (before SL10) var VERSION = 'SL9'; */
  var VERSION = 'SL10';   /* legacy: 'SL9' · 'SL8' · 'SL7' · 'SL6' · 'SL5' · 'SL4' · 'SL3' · 'SL2' */
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
      $('dlg-t').textContent = o.title || ''; $('dlg-m').textContent = o.msg || ''; $('dlg-m').style.whiteSpace = /\n/.test(o.msg || '') ? 'pre-wrap' : '';
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
    if (ribbon && !$('menu-deck').hidden) ribbon.setFile(false);
    ['menu-deck', 'menu-slide'].forEach(function (id) { $(id).hidden = true; });
    $('b-deck').setAttribute('aria-expanded', 'false'); $('b-more').setAttribute('aria-expanded', 'false');
    if (typeof closePops === 'function') closePops();
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
    renderAll(); SLHub.title();
    /* pictures come from IndexedDB a moment later; draw again once they are there */
    var need = d.slides.some(function (s) { return (s.pics || []).some(function (p) { return !p.src && p.key; }); });
    if (need) SLPics.hydrate(d).then(function () { if (deck === d) renderAll(); });
  }
  function renderAll() { SLList.render(deck.slides, deck.cur); showSlide(); }
  function showSlide() {
    if (SLEdit.setDeck) SLEdit.setDeck(deck);
    SLEdit.show(deck.slides[deck.cur], deck.theme || 'light', deck);
    var s = deck.slides[deck.cur], hid = !!(s && s.hide);
    $('pos').textContent = 'Slide ' + (deck.cur + 1) + ' of ' + deck.slides.length + (hid ? ' (hidden)' : '');
    $('b-up').disabled = deck.cur === 0; $('b-down').disabled = deck.cur === deck.slides.length - 1;
    var ta = $('notes-in');
    if (ta && document.activeElement !== ta) ta.value = s.notes || '';
    if ($('notes-slide')) $('notes-slide').textContent = 'Slide ' + (deck.cur + 1) + (hid ? ' (hidden)' : '');
    if ($('b-trans')) $('b-trans').value = SLPresent.cleanTrans(s.trans);
    if ($('b-hide')) $('b-hide').setAttribute('aria-pressed', hid ? 'true' : 'false');
    syncRibbon();
  }
  /* SL4: ribbon state (theme buttons, delete, undo / redo) + the Quick Access bar */
  function syncRibbon() {
    if (!deck) return;
    var th = deck.theme || 'light';
    [].forEach.call(document.querySelectorAll('#of-ribbon [data-theme]'), function (b) { b.setAttribute('aria-pressed', b.dataset.theme === th ? 'true' : 'false'); });
    $('r-del').disabled = deck.slides.length <= 1; $('r-del').title = deck.slides.length <= 1 ? 'A deck keeps at least one slide' : 'Delete this slide (asks first)';
    $('r-undo').disabled = !undo.length; $('r-redo').disabled = !redo.length;
    if (window.OfficeQuick) OfficeQuick.refresh();
  }
  function select(i) {
    if (i === deck.cur || i < 0 || i >= deck.slides.length) return;
    flushNotes(true);
    SLSave.flush();
    deck.cur = i;
    unfoldAt(i, false);
    SLList.render(deck.slides, deck.cur);
    showSlide(); dirty();
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
    var neigh = to > 0 ? deck.slides[to - 1] : deck.slides[to + 1];
    if (neigh) s.sec = neigh.sec || '';
    deck.cur = to; renderAll(); dirty();
  }
  function nudge(d) { move(deck.cur, deck.cur + d); }
  function delSlide() {
    if (deck.slides.length <= 1) { toast('A deck keeps at least one slide'); return; }
    var i = deck.cur, s = deck.slides[i];
    confirmDanger('Delete slide ' + (i + 1) + '?', (slideTitle(s) ? '“' + slideTitle(s) + '” ' : 'This slide ') + 'and its text will be removed from “' + deck.name + '”.', 'Delete slide').then(function (ok) {
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
      deck.name = n; $('deck-name').textContent = n; document.title = n + ' · Slides ' + VERSION; dirty(); SLSave.flush(); toast('Renamed'); SLHub.title();
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
  function prepareShow() {
    if (dlgDone) dlgDone(null);
    closeMenus(); if (!$('settings').hidden) $('settings').hidden = true;
    flushNotes(true); SLSave.flush();
    SLEdit.select('');
    if (SLEdit.endEdit) SLEdit.endEdit(false);
  }
  function keepInk(slide, ink, record) {
    var b = record ? SLSave.cloneSlide(slide) : null;
    slide.ink = SLPresent.cloneInk(ink);
    if (record) recordSlide(slide, b, 'Ink');
    dirty();
  }
  function present(fromStart) {
    if (SLShow.on()) return;
    prepareShow();
    SLShow.enter(deck.slides, fromStart ? 0 : deck.cur, deck.theme || 'light', { master: deck.master, onKeep: keepInk });
  }
  function presentView(fromStart) {
    if (SLShow.on()) return;
    prepareShow();
    var start = fromStart ? 0 : deck.cur, th = deck.theme || 'light';
    if (SLSave.memOnly) {
      toast('Presenter view on this screen (storage is memory only, so a second window cannot share the deck)', 2800);
      SLShow.enter(deck.slides, start, th, { presenter: true, master: deck.master, onKeep: keepInk });
      return;
    }
    var key = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    var url = SLPresent.presentUrl(location.href, key, deck.id);
    var w = null;
    try { w = window.open(url, 'hub-slides-pv', 'width=1200,height=800'); } catch (_) { w = null; }
    if (!w) {
      toast('Presenter view on this screen (the browser blocked a second window)', 2600);
      SLShow.enter(deck.slides, start, th, { presenter: true, master: deck.master, onKeep: keepInk });
      return;
    }
    SLShow.enter(deck.slides, start, th, { presenter: false, key: key, popup: w, master: deck.master, onKeep: keepInk });
  }
  /* SL3: pictures are written into the file, so wait for them to be loaded from IndexedDB first */
  function exportDeck() { SLSave.flush(); var d = deck; SLPics.hydrate(d).then(function () { var f = SLFile.download(d); toast('Exported ' + f); }); }
  function importParsed(r) {
    SLSave.flush();
    /* pictures go to IndexedDB first, so the deck record stays small */
    return SLPics.storeAll(r.deck.slides).then(function () {
      var d = SLSave.newDeck(uniqueName(r.deck.name), r.deck.slides, r.deck.theme, { master: r.deck.master, sections: r.deck.sections });
      d.slides.forEach(function (s, i) { (s.pics || []).forEach(function (p, j) { var o = r.deck.slides[i] && r.deck.slides[i].pics[j]; if (o && !p.src) p.src = o.src; }); });
      showDeck(d); return d;
    });
  }
  function importFile(file) {
    if (isPptx(file)) { importPptxFile(file); return; }
    SLFile.read(file).then(function (r) {
      if (r.error) { dialog({ title: 'Could not import', msg: r.error, buttons: [{ label: 'OK', v: true, cls: 'acc' }] }); return; }
      importParsed(r).then(function (d) { toast('Imported “' + d.name + '” (' + d.slides.length + (d.slides.length === 1 ? ' slide)' : ' slides)') + (r.cut ? ', first 500 kept' : ''), 2600); });
    });
  }
  function isPptx(file) {
    var n = ((file && file.name) || '').toLowerCase();
    var t = ((file && file.type) || '').toLowerCase();
    return /\.pptx$/.test(n) || t.indexOf('presentationml') >= 0;
  }
  function readBuf(file) {
    if (file && file.arrayBuffer) return file.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(new Uint8Array(r.result)); };
      r.onerror = function () { rej(new Error('Could not read the file.')); };
      r.readAsArrayBuffer(file);
    });
  }
  function downloadBlob(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 1500);
    return name;
  }
  function warnMsg(title, lead, warnings) {
    var body = lead;
    if (warnings && warnings.length) body += '\n\n' + warnings.join('\n');
    return dialog({ title: title, msg: body, buttons: [{ label: 'OK', v: true, cls: 'acc' }] });
  }
  function exportPptx() {
    SLSave.flush();
    var d = deck;
    return SLPics.hydrate(d).then(function () {
      var built = SLPptx.build(d);
      var bytes = SLZip.pack(built.files);
      var name = (SLFile.safeName(d.name) || 'slides') + '.pptx';
      downloadBlob(name, new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }));
      if (built.warnings && built.warnings.length) {
        return warnMsg('Exported ' + name, 'The PowerPoint file was saved. Some parts were left out:', built.warnings);
      }
      toast('Exported ' + name);
    }).catch(function (e) {
      dialog({ title: 'Could not export PowerPoint', msg: (e && e.message) || String(e), buttons: [{ label: 'OK', v: true, cls: 'acc' }] });
    });
  }
  function importPptxFile(file) {
    return readBuf(file).then(function (buf) {
      return SLZip.unpackSmart(buf);
    }).then(function (un) {
      if (un.error) {
        dialog({ title: 'Could not import PowerPoint', msg: un.error, buttons: [{ label: 'OK', v: true, cls: 'acc' }] });
        return;
      }
      var parsed = SLPptx.parse(un.files);
      if (parsed.error) {
        dialog({ title: 'Could not import PowerPoint', msg: parsed.error, buttons: [{ label: 'OK', v: true, cls: 'acc' }] });
        return;
      }
      var r = { deck: parsed.deck };
      return importParsed(r).then(function (d) {
        var lead = 'Imported “' + d.name + '” (' + d.slides.length + (d.slides.length === 1 ? ' slide)' : ' slides)') + '.';
        if (parsed.warnings && parsed.warnings.length) {
          return warnMsg('Imported with some parts skipped', lead + ' I skipped or simplified:', parsed.warnings);
        }
        toast(lead, 2600);
      });
    }).catch(function (e) {
      dialog({ title: 'Could not import PowerPoint', msg: (e && e.message) || String(e), buttons: [{ label: 'OK', v: true, cls: 'acc' }] });
    });
  }
  function exportPng() {
    closeMenus();
    var n = deck.slides.length;
    return dialog({
      title: 'Export PNG',
      msg: 'This slide as one PNG, or every slide (including hidden ones) in a zip. The picture is drawn from the slide — not a screenshot of the editor — at 1920 × 1080.',
      buttons: [
        { label: 'Cancel', v: false },
        { label: 'This slide', v: 'one', cls: 'acc' },
        { label: 'All slides (ZIP)', v: 'all' }
      ]
    }).then(function (v) {
      if (v === 'one') return exportPngRange(deck.cur, deck.cur);
      if (v === 'all') return exportPngRange(0, n - 1);
    });
  }
  function exportPngRange(from, to) {
    SLSave.flush();
    var d = deck;
    return SLPics.hydrate(d).then(function () {
      var i = from, files = {}, one = from === to;
      function next() {
        if (i > to) {
          if (one) {
            var only = files[Object.keys(files)[0]];
            downloadBlob(Object.keys(files)[0], new Blob([only], { type: 'image/png' }));
            toast('Exported PNG');
            return;
          }
          var zip = SLZip.pack(files);
          var name = (SLFile.safeName(d.name) || 'slides') + '-png.zip';
          downloadBlob(name, new Blob([zip], { type: 'application/zip' }));
          toast('Exported ' + (to - from + 1) + ' PNGs');
          return;
        }
        var n = i;
        if (!one) status('Exporting slide ' + (n + 1) + ' / ' + d.slides.length + '…');
        return SLPng.toPngBlob(SLPng.svgFor(d, n), 2).then(function (blob) { return blob.arrayBuffer(); }).then(function (buf) {
          files[SLPng.fileName(d, n)] = new Uint8Array(buf);
          i++;
          return next();
        });
      }
      return next();
    }).then(function () {
      /* leave the usual saved label; a toast already reported the export */
    }).catch(function (e) {
      dialog({ title: 'Could not export PNG', msg: (e && e.message) || String(e), buttons: [{ label: 'OK', v: true, cls: 'acc' }] });
    });
  }

  /* ---------- SL3 undo / redo (pictures, layout, background: per slide; theme: per deck) ---------- */
  var undo = [], redo = [];
  function slideById(id) { return deck.slides.filter(function (s) { return s.id === id; })[0]; }
  function textOf(s) { return { title: SLText.clone(s.title), body: SLText.clone(s.body), body2: SLText.clone(s.body2) }; }
  function sameText(a, b) { return SLText.equal(a.title, b.title) && SLText.equal(a.body, b.body) && SLText.equal(a.body2, b.body2); }
  /* e = { label, kind:'slide'|'theme', id, before (slide copy) | theme, after (text right after a layout change) } */
  function pushUndo(e) { undo.push(e); if (undo.length > 50) undo.shift(); redo = []; syncRibbon(); }
  function recordSlide(slide, before, label) { pushUndo({ label: label, kind: 'slide', id: slide.id, before: before, after: textOf(slide) }); }
  function swap(from, to, verb) {
    var e = from.pop();
    while (e && e.kind === 'slide' && !slideById(e.id)) e = from.pop();   /* that slide was deleted since */
    if (!e) { toast('Nothing to ' + verb.toLowerCase()); syncRibbon(); return false; }
    if (e.kind === 'theme') {
      to.push({ label: e.label, kind: 'theme', before: deck.theme });
      deck.theme = e.before; renderAll();
    } else if (e.kind === 'master') {
      to.push({ label: e.label, kind: 'master', before: snapMaster() });
      applyMaster(e.before); renderAll();
    } else if (e.kind === 'sections') {
      to.push({ label: e.label, kind: 'sections', before: snapSecs() });
      applySecs(e.before); renderAll();
    } else if (e.kind === 'trans-all') {
      var now = deck.slides.map(function (s) { return { id: s.id, trans: s.trans }; });
      to.push({ label: e.label, kind: 'trans-all', before: now, after: e.after });
      (e.before || []).forEach(function (it) {
        var sl = slideById(it.id); if (sl) sl.trans = SLPresent.cleanTrans(it.trans);
      });
      showSlide();
    } else {
      var s = slideById(e.id), i = deck.slides.indexOf(s), now = SLSave.cloneSlide(s), b = e.before;
      to.push({ label: e.label, kind: 'slide', id: s.id, before: now, after: textOf(b) });
      s.layout = b.layout; s.bg = b.bg;
      s.pics = (b.pics || []).map(function (p) { return Object.assign({}, p); });
      s.texts = (b.texts || b.tboxes || []).map(function (t) { return Object.assign({}, t, { doc: SLText.clone(t.doc) }); });
      s.tboxes = s.texts;
      s.shapes = (b.shapes || []).map(function (sh) { return SLDraw.cloneShape(sh); });
      s.tables = (b.tables || []).map(function (tb) { return SLDraw.cloneTable(tb); });
      s.notes = SLPresent.cleanNotes(b.notes);
      s.trans = SLPresent.cleanTrans(b.trans);
      s.ink = SLPresent.cloneInk(b.ink);
      s.hide = !!b.hide;
      s.foot = SLMaster.cleanFoot(b.foot);
      s.footer = SLMaster.cleanFooterText(b.footer);
      s.sec = b.sec || '';
      /* text comes back only when it was not edited since (a layout change can move text between boxes) */
      if (e.after && sameText(e.after, s)) { s.title = SLText.clone(b.title); s.body = SLText.clone(b.body); s.body2 = SLText.clone(b.body2); }
      if (i !== deck.cur) { SLSave.flush(); deck.cur = i; renderAll(); } else { SLList.update(i); showSlide(); }
    }
    dirty(); toast(verb + ': ' + e.label); syncRibbon(); return true;
  }

  /* ---------- SL3 layouts ---------- */
  function hasText(t) { return window.SLText ? SLText.has(t) : String(t || '').replace(/\s+/g, '') !== ''; }
  function slideTitle(s) { return SLText.plain(s && s.title, { single: true }); }
  /* keeps the text where it fits: the right column joins the left one when the new layout has one text box;
     text with no box in the new layout stays in the slide (hidden) and comes back with a layout that has the box */
  function setLayout(lay) {
    var s = deck.slides[deck.cur], old = s.layout || 'tc';
    if (lay === old) return;
    var b = SLSave.cloneSlide(s), L = SLEdit.slots({ layout: lay });
    s.layout = lay;
    if (!L.b2 && L.b && hasText(s.body2)) { s.body = SLText.concat(s.body, s.body2); s.body2 = SLText.empty('bullet'); }
    var hidden = (!L.t && hasText(s.title)) || (!L.b && hasText(s.body)) || (!L.b2 && hasText(s.body2));
    recordSlide(s, b, 'Layout');
    SLList.update(deck.cur); showSlide(); dirty();
    toast(hidden ? 'Layout: ' + layName(lay) + '. Some text is hidden by this layout (kept; pick another layout to see it)' : 'Layout: ' + layName(lay), hidden ? 3200 : 1600);
  }
  function layName(id) { var x = SLSave.LAYOUTS.filter(function (l) { return l[0] === id; })[0]; return x ? x[1] : id; }
  var SAMPLE = { title: SLText.fromPlain('Title', { list: 'none', single: true }), body: SLText.fromPlain('First point\nSecond point\n\tDetail', { list: 'bullet' }), body2: SLText.fromPlain('Other side\nMore', { list: 'bullet' }), pics: [], texts: [], tboxes: [], shapes: [], tables: [] };
  function tile(label, slide, th, on, v) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'tile' + (on ? ' on' : ''); b.dataset.v = v;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.innerHTML = '<div class="tile-s"><div class="mini-in slide sv"></div></div><span></span>';
    var mi = b.querySelector('.mini-in'); mi.style.transform = 'scale(' + (144 / 960) + ')';
    SLEdit.paint(mi, slide, 0, { max: 6, noFoot: true }, th, 'mini-in slide sv');
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
      $('pick-h').textContent = 'Deck theme'; $('pick-m').textContent = 'Colours and fonts for every slide in “' + deck.name + '”. The app’s own Light / Dark look is unchanged.';
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
    var tg = e.target, typing = tg && (tg.tagName === 'TEXTAREA' || tg.tagName === 'INPUT' || tg.isContentEditable);
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
  function closeSettings() { $('settings').hidden = true; try { $('b-set').focus({ preventScroll: true }); } catch (_) { /* */ } }
  [].forEach.call(document.querySelectorAll('.seg[data-key]'), function (sg) {
    sg.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; SLSave.set(sg.dataset.key, b.dataset.v); syncSettings(); });
  });
  $('set-x').onclick = closeSettings;
  $('settings').addEventListener('click', function (e) { if (e.target === $('settings')) closeSettings(); });
  $('settings').addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSettings(); } });


  /* ---------- SL5 text format + text boxes ---------- */
  function addTextBox() {
    if (SLShow.on()) return;
    var box = SLEdit.addBox();
    if (!box) { toast('A slide can have up to ' + SLText.MAX_BOX + ' text boxes'); return; }
    toast('Text box added');
  }
  function shapeSvgBtn(kind) {
    var s = SLDraw.defaultShape(kind);
    s.w = 36; s.h = 24; s.sw = kind === 'line' || kind === 'arrow' ? 2 : 1.5;
    return SLDraw.shapeSvg(s);
  }
  function fillShapePop() {
    var el = $('pop-shape'); if (!el || el.dataset.ready) return el;
    el.innerHTML = SLDraw.KINDS.map(function (k) {
      return '<button type="button" data-kind="' + k + '" title="' + SLDraw.LABELS[k] + '">' + shapeSvgBtn(k) + '<span>' + SLDraw.LABELS[k] + '</span></button>';
    }).join('');
    el.dataset.ready = '1'; return el;
  }
  function fillTablePop() {
    var el = $('pop-table'); if (!el || el.dataset.ready) return el;
    var r, c, h = '<div class="tg">';
    for (r = 1; r <= 8; r++) for (c = 1; c <= 8; c++) h += '<button type="button" data-r="' + r + '" data-c="' + c + '" aria-label="' + r + ' by ' + c + '"></button>';
    el.innerHTML = h + '</div><div class="tg-lab" id="tbl-size-lab">3 × 3</div>';
    el.dataset.ready = '1';
    el.addEventListener('mousemove', function (e) {
      var b = e.target.closest('button[data-r]'); if (!b) return;
      var R = +b.dataset.r, C = +b.dataset.c;
      [].forEach.call(el.querySelectorAll('button[data-r]'), function (x) { x.classList.toggle('on', +x.dataset.r <= R && +x.dataset.c <= C); });
      var lab = $('tbl-size-lab'); if (lab) lab.textContent = R + ' × ' + C;
    });
    return el;
  }
  function openShapePop(btn) {
    var p = fillShapePop(), was = p && !p.hidden;
    closePops(); closeMenus();
    if (was) return;
    placePop(p, btn);
  }
  function openTablePop(btn) {
    var p = fillTablePop(), was = p && !p.hidden;
    closePops(); closeMenus();
    if (was) return;
    placePop(p, btn);
  }
  function addShape(kind) {
    if (SLShow.on()) return;
    var s = SLEdit.addShape(kind);
    if (!s) { toast('A slide can have up to ' + SLDraw.MAX_SHAPES + ' shapes'); return; }
    toast(SLDraw.LABELS[kind] + ' added');
  }
  function addTable(rows, cols) {
    if (SLShow.on()) return;
    var t = SLEdit.addTable(rows, cols);
    if (!t) { toast('A slide can have up to ' + SLDraw.MAX_TABLES + ' tables'); return; }
    toast('Table added (' + rows + ' × ' + cols + ')');
  }
  function bumpSize(dir) {
    var m = SLEdit.marks(), base = 28;
    if (m.slot === 'title') base = 44;
    else if (m.slot && m.slot.indexOf('tb:') === 0) base = 24;
    else if (m.slot && m.slot.indexOf('sh:') === 0) base = 20;
    else if (m.slot && m.slot.indexOf('tc:') === 0) base = 16;
    SLEdit.format({ size: SLText.nextSize(m.size || base, dir) }, 'Font size');
  }
  var TCOLS = ['#111827', '#ffffff', '#6b7280', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed', '#db2777', '#0891b2', '#000000'];
  var HCOLS = ['#fef08a', '#bbf7d0', '#bae6fd', '#fbcfe8', '#e5e7eb', '#fed7aa', '#fca5a5'];
  function fillPop(id, colors, autoLabel, anyId) {
    var el = $(id); if (!el || el.dataset.ready) return el;
    var h = '<button type="button" class="auto" data-c="" title="' + autoLabel + '">' + autoLabel + '</button>';
    colors.forEach(function (c) { h += '<button type="button" data-c="' + c + '" style="background:' + c + '" title="' + c + '" aria-label="' + c + '"></button>'; });
    h += '<label>Any <input type="color" id="' + anyId + '" aria-label="Any colour"></label>';
    el.innerHTML = h; el.dataset.ready = '1'; return el;
  }
  function placePop(pop, btn) {
    var r = btn.getBoundingClientRect();
    pop.hidden = false;
    var x = Math.max(6, Math.min(innerWidth - pop.offsetWidth - 6, r.left));
    var y = r.bottom + 6; if (y + pop.offsetHeight > innerHeight - 6) y = Math.max(6, r.top - pop.offsetHeight - 6);
    pop.style.left = x + 'px'; pop.style.top = y + 'px';
  }
  function closePops() { ['pop-color', 'pop-hl', 'pop-shape', 'pop-table'].forEach(function (id) { var el = $(id); if (el) el.hidden = true; }); }
  function syncFmt() {
    var m = SLEdit.marks();
    function press(id, on) { var b = $(id); if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    press('f-b', !!m.b); press('f-i', !!m.i); press('f-u', !!m.u); press('f-s', !!m.s);
    var lay = deck && deck.slides[deck.cur] ? (deck.slides[deck.cur].layout || 'tc') : 'tc';
    var al = m.align || ((lay === 'title' && (m.slot === 'title' || m.slot === 'body')) ? 'center' : 'left');
    press('f-left', al === 'left'); press('f-center', al === 'center'); press('f-right', al === 'right');
    press('f-bullet', m.list === 'bullet'); press('f-number', m.list === 'number'); press('f-nolist', m.list === 'none' || !m.list);
    var isTitle = m.slot === 'title';
    ['f-bullet', 'f-number', 'f-nolist'].forEach(function (id) { if ($(id)) $(id).disabled = !m.on || isTitle; });
    var sz = $('f-size'); if (sz && document.activeElement !== sz) sz.value = m.size ? String(m.size) : '';
    var mini = $('mini-fmt'); if (!mini) return;
    [].forEach.call(mini.querySelectorAll('[data-a]'), function (b) {
      if (b.dataset.a === 'b' || b.dataset.a === 'i' || b.dataset.a === 'u' || b.dataset.a === 's') b.setAttribute('aria-pressed', m[b.dataset.a] ? 'true' : 'false');
    });
    var sel = window.getSelection && window.getSelection();
    var show = m.on && sel && !sel.isCollapsed && sel.rangeCount && $('dialog').hidden && $('settings').hidden && $('pick').hidden;
    if (!show || SLShow.on()) { mini.hidden = true; return; }
    var r = sel.getRangeAt(0).getBoundingClientRect();
    if (!r || (!r.width && !r.height)) { mini.hidden = true; return; }
    mini.hidden = false;
    var mw = mini.offsetWidth || 180;
    mini.style.left = Math.max(6, Math.min(innerWidth - mw - 6, r.left + r.width / 2 - mw / 2)) + 'px';
    mini.style.top = Math.max(6, r.top - 40) + 'px';
  }
  function wireFmt() {
    fillPop('pop-color', TCOLS, 'Automatic', 'f-color-any');
    fillPop('pop-hl', HCOLS, 'None', 'f-hl-any');
    function keepSel(e) {
      var t = e.target;
      if (t.closest && t.closest('#fmt-group button, #mini-fmt button, .fmt-pop button')) e.preventDefault();
    }
    document.addEventListener('mousedown', keepSel);
    function applyColor(which, c) {
      var fmt = {}; fmt[which] = c; SLEdit.format(fmt, which === 'hl' ? 'Highlight' : 'Text colour'); closePops();
    }
    $('f-b').onclick = function () { SLEdit.format({ b: 'toggle' }, 'Bold'); };
    $('f-i').onclick = function () { SLEdit.format({ i: 'toggle' }, 'Italic'); };
    $('f-u').onclick = function () { SLEdit.format({ u: 'toggle' }, 'Underline'); };
    if ($('f-s')) $('f-s').onclick = function () { SLEdit.format({ s: 'toggle' }, 'Strikethrough'); };
    $('f-smaller').onclick = function () { bumpSize(-1); };
    $('f-larger').onclick = function () { bumpSize(1); };
    $('f-size').addEventListener('change', function () { if (this.value) SLEdit.format({ size: +this.value }, 'Font size'); });
    $('f-color').onclick = function () { var p = $('pop-color'); if (!p.hidden) { closePops(); return; } closePops(); placePop(p, this); };
    $('f-hl').onclick = function () { var p = $('pop-hl'); if (!p.hidden) { closePops(); return; } closePops(); placePop(p, this); };
    $('pop-color').addEventListener('click', function (e) { var b = e.target.closest('button[data-c]'); if (b) applyColor('color', b.dataset.c); });
    $('pop-hl').addEventListener('click', function (e) { var b = e.target.closest('button[data-c]'); if (b) applyColor('hl', b.dataset.c); });
    $('pop-color').addEventListener('input', function (e) { if (e.target.id === 'f-color-any') applyColor('color', e.target.value); });
    $('pop-hl').addEventListener('input', function (e) { if (e.target.id === 'f-hl-any') applyColor('hl', e.target.value); });
    $('f-left').onclick = function () { SLEdit.para({ align: 'left' }, 'Align left'); };
    $('f-center').onclick = function () { SLEdit.para({ align: 'center' }, 'Align centre'); };
    $('f-right').onclick = function () { SLEdit.para({ align: 'right' }, 'Align right'); };
    $('f-bullet').onclick = function () { SLEdit.para({ list: 'bullet' }, 'Bullets'); };
    $('f-number').onclick = function () { SLEdit.para({ list: 'number' }, 'Numbered list'); };
    $('f-nolist').onclick = function () { SLEdit.para({ list: 'none' }, 'No list'); };
    if ($('f-ind')) $('f-ind').onclick = function () { SLEdit.para({ indent: 1 }, 'Indent'); };
    if ($('f-outd')) $('f-outd').onclick = function () { SLEdit.para({ indent: -1 }, 'Outdent'); };
    $('f-clear').onclick = function () { SLEdit.format({ clear: true }, 'Clear formatting'); };
    $('mini-fmt').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var a = b.dataset.a;
      if (a === 'b' || a === 'i' || a === 'u' || a === 's') { var o = {}; o[a] = 'toggle'; SLEdit.format(o, a === 'b' ? 'Bold' : a === 'i' ? 'Italic' : a === 'u' ? 'Underline' : 'Strikethrough'); }
      else if (a === 'color') { closePops(); placePop($('pop-color'), b); }
      else if (a === 'hl') { closePops(); placePop($('pop-hl'), b); }
      else if (a === 'clear') SLEdit.format({ clear: true }, 'Clear formatting');
    });
    document.addEventListener('pointerdown', function (e) {
      if (!e.target.closest('.fmt-pop') && !e.target.closest('#f-color') && !e.target.closest('#f-hl') && !e.target.closest('#mini-fmt [data-a=color]') && !e.target.closest('#mini-fmt [data-a=hl]') && !e.target.closest('#b-shape') && !e.target.closest('#b-table')) closePops();
    });
    document.addEventListener('selectionchange', function () { if (!SLShow.on()) syncFmt(); });
  }

  /* ---------- wiring ---------- */
  /* SL4: File (#b-deck) opens #menu-deck through the shared ribbon (legacy: openMenu('menu-deck', $('b-deck'), false)) */
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
    else if (a === 'import') { $('file-in').value = ''; $('file-in').click(); }
    else if (a === 'importpptx') { $('pptx-in').value = ''; $('pptx-in').click(); }
    else if (a === 'export') exportDeck(); else if (a === 'pptx') exportPptx(); else if (a === 'png') exportPng();
    else if (a === 'deldeck') deleteDeck();
    else if (a === 'show0') present(true); else if (a === 'showcur') present(false);
    else if (a === 'print') printWithHidden(false, false); else if (a === 'printnotes') printNotes(); else if (a === 'pdf') exportPdf(); else if (a === 'settings') openSettings();
  });
  $('b-addlay').onclick = function () { openPick('add'); };
  $('b-lay').onclick = function () { openPick('layout'); };
  $('b-theme').onclick = function () { openPick('theme'); };
  $('b-pic').onclick = pickPicture;
  $('b-tbox').onclick = addTextBox;
  $('b-shape').onclick = function () { openShapePop(this); };
  $('b-table').onclick = function () { openTablePop(this); };
  $('pop-shape').addEventListener('click', function (e) { var b = e.target.closest('button[data-kind]'); if (!b) return; closePops(); addShape(b.dataset.kind); });
  $('pop-table').addEventListener('click', function (e) { var b = e.target.closest('button[data-r]'); if (!b) return; closePops(); addTable(+b.dataset.r, +b.dataset.c); });
  $('menu-slide').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || b.disabled) return; closeMenus();
    var a = b.dataset.a;
    if (a === 'add') addSlide(); else if (a === 'dup') dupSlide(); else if (a === 'up') nudge(-1); else if (a === 'down') nudge(1); else if (a === 'del') delSlide();
    else if (a === 'addlay') openPick('add'); else if (a === 'lay') openPick('layout'); else if (a === 'theme') openPick('theme'); else if (a === 'pic') pickPicture(); else if (a === 'tbox') addTextBox();
    else if (a === 'shape') openShapePop($('b-shape') || $('b-more')); else if (a === 'table') openTablePop($('b-table') || $('b-more'));
    else if (a === 'undo') swap(undo, redo, 'Undo'); else if (a === 'redo') swap(redo, undo, 'Redo');
    else if (a === 'show0') present(true); else if (a === 'showcur') present(false); else if (a === 'pv') presentView(false); else if (a === 'notes') toggleNotes(); else if (a === 'master') openMaster(); else if (a === 'hide') toggleHide(); else if (a === 'sec') addSectionAt(); else if (a === 'pptx') exportPptx(); else if (a === 'png') exportPng(); else if (a === 'pdf') exportPdf(); else if (a === 'printnotes') printNotes();
  });
  /* SL4 ribbon buttons (the rest keep their SL1 - SL3 ids and handlers above) */
  $('b-name').onclick = renameDeck;
  $('r-dup').onclick = dupSlide; $('r-del').onclick = delSlide;
  $('r-undo').onclick = function () { swap(undo, redo, 'Undo'); };
  $('r-redo').onclick = function () { swap(redo, undo, 'Redo'); };
  $('r-addlay').onclick = function () { openPick('add'); };
  $('r-show0').onclick = function () { present(true); };
  [].forEach.call(document.querySelectorAll('#of-ribbon [data-theme]'), function (b) { b.onclick = function () { setTheme(b.dataset.theme); syncRibbon(); }; });
  function wireArrange(id, fn) { var b = $(id); if (b) b.onclick = fn; }
  wireArrange('a-front', function () { SLEdit.arrangeLayer('front'); });
  wireArrange('a-fwd', function () { SLEdit.arrangeLayer('forward'); });
  wireArrange('a-back', function () { SLEdit.arrangeLayer('backward'); });
  wireArrange('a-toback', function () { SLEdit.arrangeLayer('back'); });
  wireArrange('a-left', function () { SLEdit.arrangeAlign('left'); });
  wireArrange('a-center', function () { SLEdit.arrangeAlign('center'); });
  wireArrange('a-right', function () { SLEdit.arrangeAlign('right'); });
  wireArrange('a-top', function () { SLEdit.arrangeAlign('top'); });
  wireArrange('a-middle', function () { SLEdit.arrangeAlign('middle'); });
  wireArrange('a-bottom-al', function () { SLEdit.arrangeAlign('bottom'); });
  wireArrange('a-disth', function () { if (!SLEdit.arrangeDist('h')) toast('Select at least three objects to distribute'); });
  wireArrange('a-distv', function () { if (!SLEdit.arrangeDist('v')) toast('Select at least three objects to distribute'); });

  /* ---------- SL7 notes + transitions + presenter ---------- */
  var notesTimer = 0, notesBefore = null;
  function notesWanted() {
    try { return localStorage.getItem('slides-notes') !== '0'; } catch (_) { return true; }
  }
  function setNotesOpen(v) {
    $('notes').hidden = !v;
    if ($('b-notes')) $('b-notes').setAttribute('aria-pressed', v ? 'true' : 'false');
    try { localStorage.setItem('slides-notes', v ? '1' : '0'); } catch (_) { /* */ }
    if (SLEdit.fit) SLEdit.fit();
  }
  function toggleNotes() { setNotesOpen($('notes').hidden); if (!$('notes').hidden) try { $('notes-in').focus(); } catch (_) { /* */ } }
  function flushNotes(record) {
    clearTimeout(notesTimer);
    if (!deck || !$('notes-in')) return;
    var s = deck.slides[deck.cur], v = SLPresent.cleanNotes($('notes-in').value);
    if (v === SLPresent.cleanNotes(s.notes)) { notesBefore = null; return; }
    if (!notesBefore) notesBefore = SLSave.cloneSlide(s);
    s.notes = v;
    if (record && notesBefore) { recordSlide(s, notesBefore, 'Notes'); notesBefore = null; }
    dirty();
  }
  $('notes-in').addEventListener('input', function () {
    if (!deck) return;
    var s = deck.slides[deck.cur];
    if (!notesBefore) notesBefore = SLSave.cloneSlide(s);
    s.notes = SLPresent.cleanNotes(this.value);
    dirty();
    clearTimeout(notesTimer);
    notesTimer = setTimeout(function () { flushNotes(true); }, 800);
  });
  $('notes-in').addEventListener('blur', function () { flushNotes(true); });
  $('b-notes').onclick = function () { toggleNotes(); };
  $('b-pv').onclick = function () { presentView(false); };
  $('b-trans').addEventListener('change', function () {
    if (!deck) return;
    var s = deck.slides[deck.cur], b = SLSave.cloneSlide(s);
    s.trans = SLPresent.cleanTrans(this.value);
    recordSlide(s, b, 'Transition'); dirty();
  });
  $('b-trans-all').onclick = function () {
    if (!deck) return;
    var tr = SLPresent.cleanTrans($('b-trans').value);
    dialog({ title: 'Apply transition to all slides', msg: 'Use “' + (SLPresent.LABELS[tr] || tr) + '” on every slide in this deck?',
      buttons: [{ label: 'Cancel', v: false }, { label: 'Apply to all', v: true, cls: 'acc' }] })
      .then(function (v) {
        if (v !== true) return;
        var before = deck.slides.map(function (s) { return { id: s.id, trans: s.trans }; });
        deck.slides.forEach(function (s) { s.trans = tr; });
        pushUndo({ label: 'Transition (all slides)', kind: 'trans-all', before: before, after: tr });
        dirty(); toast('Transition applied to all slides');
      });
  };
  /* (before SL10) setNotesOpen(notesWanted()); */

  /* ---------- SL8 themes, master, hide, sections ---------- */
  var TH_SW = { light: '#ffffff', dark: '#16181d', ocean: '#0369a1', forest: '#3f6b3a', sunset: '#c2410c', slate: '#334155', paper: '#faf6ee', midnight: '#0b1220' };
  function fillSwatches() {
    var box = $('th-swatches'); if (!box || box.childNodes.length) return;
    SLSave.THEMES.forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button'; b.dataset.theme = t[0];
      b.title = t[1] + ' theme for every slide'; b.setAttribute('aria-label', t[1] + ' theme');
      b.style.background = TH_SW[t[0]] || '#ccc';
      if (t[0] === 'light' || t[0] === 'paper') b.style.borderColor = '#cbd5e1';
      b.onclick = function () { setTheme(t[0]); syncRibbon(); };
      box.appendChild(b);
    });
  }
  function snapMaster() {
    return { master: SLMaster.cloneMaster(deck.master), slides: deck.slides.map(function (s) { return { id: s.id, foot: s.foot, footer: s.footer }; }) };
  }
  function applyMaster(x) {
    deck.master = SLMaster.cloneMaster(x.master);
    (x.slides || []).forEach(function (it) {
      var s = slideById(it.id); if (!s) return;
      s.foot = SLMaster.cleanFoot(it.foot);
      s.footer = SLMaster.cleanFooterText(it.footer);
    });
  }
  function snapSecs() {
    return {
      sections: JSON.parse(JSON.stringify(deck.sections || [])),
      secs: deck.slides.map(function (s) { return { id: s.id, sec: s.sec || '' }; }),
      order: deck.slides.map(function (s) { return s.id; }),
      cur: deck.cur
    };
  }
  function applySecs(x) {
    if (x.order && x.order.length === deck.slides.length) {
      var map = {}; deck.slides.forEach(function (s) { map[s.id] = s; });
      var next = x.order.map(function (id) { return map[id]; }).filter(Boolean);
      if (next.length === deck.slides.length) deck.slides = next;
    }
    deck.sections = SLMaster.cleanSections(x.sections);
    (x.secs || []).forEach(function (it) { var s = slideById(it.id); if (s) s.sec = it.sec || ''; });
    if (typeof x.cur === 'number') deck.cur = Math.max(0, Math.min(deck.slides.length - 1, x.cur));
    deck.sections = SLMaster.normalize(deck);
  }
  function unfoldAt(i, save) {
    if (!deck || !window.SLMaster) return;
    var r = SLMaster.runs(deck.slides, deck.sections), changed = false;
    r.forEach(function (run) {
      if (run.id && run.fold && i >= run.start && i <= run.end) {
        deck.sections = SLMaster.setFold(deck.sections, run.id, false);
        changed = true;
      }
    });
    if (changed && save !== false) dirty();
  }
  function closeMaster() { if ($('master')) $('master').hidden = true; }
  function openMaster() {
    closeMenus(); if (!$('settings').hidden) $('settings').hidden = true;
    var m = SLMaster.cleanMaster(deck.master), s = deck.slides[deck.cur];
    $('m-footer').value = m.footer || '';
    $('m-number').checked = !!m.number;
    $('m-date').checked = !!m.date;
    $('m-when').value = m.when || '';
    $('m-skip').checked = m.skipTitle !== false;
    $('m-foot').value = SLMaster.cleanFoot(s.foot);
    $('m-footer-this').value = s.footer || '';
    $('master').hidden = false;
    try { $('m-footer').focus(); } catch (_) { /* */ }
  }
  function applyMasterDlg() {
    var before = snapMaster();
    deck.master = SLMaster.cleanMaster({
      footer: $('m-footer').value,
      number: $('m-number').checked,
      date: $('m-date').checked,
      when: $('m-when').value,
      skipTitle: $('m-skip').checked
    });
    var s = deck.slides[deck.cur];
    s.foot = SLMaster.cleanFoot($('m-foot').value);
    s.footer = SLMaster.cleanFooterText($('m-footer-this').value);
    pushUndo({ label: 'Master and footer', kind: 'master', before: before });
    closeMaster(); renderAll(); dirty(); toast('Master updated');
  }
  function toggleHide() {
    var s = deck.slides[deck.cur], b = SLSave.cloneSlide(s);
    s.hide = !s.hide;
    recordSlide(s, b, s.hide ? 'Hide slide' : 'Unhide slide');
    renderAll(); dirty(); toast(s.hide ? 'Slide hidden from the show' : 'Slide will be shown');
  }
  function addSectionAt() {
    dialog({ title: 'Add section', msg: 'Name a section starting at slide ' + (deck.cur + 1) + '. Later slides in the same group join it.',
      input: { value: 'Section', placeholder: 'Section name' },
      buttons: [{ label: 'Cancel', v: false }, { label: 'Add', v: true, cls: 'acc', ok: true }] })
      .then(function (r) {
        if (!r || r.v !== true) return;
        var before = snapSecs();
        var res = SLMaster.addSection(deck.slides, deck.sections, deck.cur, r.text);
        if (res.error === 'max') { toast('A deck can have up to ' + SLMaster.MAX_SECTIONS + ' sections'); return; }
        deck.sections = res.sections;
        pushUndo({ label: 'Add section', kind: 'sections', before: before });
        renderAll(); dirty(); toast('Section added');
      });
  }
  function renameSection(id) {
    var sec = (deck.sections || []).filter(function (s) { return s.id === id; })[0];
    if (!sec) return;
    dialog({ title: 'Rename section', msg: '', input: { value: sec.name, placeholder: 'Section name' },
      buttons: [{ label: 'Cancel', v: false }, { label: 'Remove section', v: 'rm' }, { label: 'Rename', v: true, cls: 'acc', ok: true }] })
      .then(function (r) {
        if (!r) return;
        var before = snapSecs();
        if (r.v === 'rm') {
          var out = SLMaster.removeSection(deck.slides, deck.sections, id);
          deck.sections = out.sections;
          pushUndo({ label: 'Remove section', kind: 'sections', before: before });
          renderAll(); dirty(); toast('Section removed'); return;
        }
        if (r.v !== true) return;
        deck.sections = SLMaster.renameSection(deck.sections, id, r.text);
        pushUndo({ label: 'Rename section', kind: 'sections', before: before });
        renderAll(); dirty();
      });
  }
  function shiftSection(id, dir) {
    var before = snapSecs();
    if (!SLMaster.moveSection(deck.slides, deck.sections, id, dir)) return;
    var r = SLMaster.runs(deck.slides, deck.sections).filter(function (x) { return x.id === id; })[0];
    if (r) deck.cur = r.start;
    pushUndo({ label: 'Move section', kind: 'sections', before: before });
    renderAll(); dirty();
  }
  function moveSectionTo(id, to) {
    var before = snapSecs();
    if (!SLMaster.moveSectionTo(deck.slides, deck.sections, id, to)) return;
    var r = SLMaster.runs(deck.slides, deck.sections).filter(function (x) { return x.id === id; })[0];
    if (r) deck.cur = r.start;
    pushUndo({ label: 'Move section', kind: 'sections', before: before });
    renderAll(); dirty();
  }
  function foldSection(id) {
    var sec = (deck.sections || []).filter(function (s) { return s.id === id; })[0];
    if (!sec) return;
    deck.sections = SLMaster.setFold(deck.sections, id, !sec.fold);
    renderAll(); dirty();
  }
  $('b-themes').onclick = function () { openPick('theme'); };
  $('b-master').onclick = openMaster;
  $('b-hide').onclick = toggleHide;
  $('b-sec').onclick = addSectionAt;
  $('master-x').onclick = closeMaster;
  $('master-cancel').onclick = closeMaster;
  $('master-ok').onclick = applyMasterDlg;
  $('master').addEventListener('click', function (e) { if (e.target.id === 'master') closeMaster(); });
  $('master').addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMaster(); }
  });
  fillSwatches();

  /* ---------- SL4 Print / Export PDF (slides_print.js) ---------- */
  var printing = false;
  function printDeck(pdf, notes, hidden) {
    if (printing || SLShow.on() || !deck) return Promise.resolve(false);
    closeMenus(); flushNotes(true); SLSave.flush(); SLEdit.select('');
    var n = (deck.slides || []).filter(function (s) { return hidden || !s.hide; }).length;
    if (!n) n = deck.slides.length;
    printing = true; status('Preparing ' + n + (n === 1 ? ' page…' : ' pages…'));
    return SLPrint.run(deck, { pdf: !!pdf, notes: !!notes, hidden: !!hidden }).then(function () { printing = false; SLSave.onSaved(true); return true; }, function () { printing = false; SLSave.onSaved(true); toast('Could not print'); return false; });
  }
  function printWithHidden(pdf, notes) {
    var nHide = deck.slides.filter(function (s) { return s.hide; }).length;
    if (!nHide) return printDeck(pdf, notes, false);
    return dialog({
      title: 'Hidden slides',
      msg: 'This deck has ' + nHide + ' hidden slide' + (nHide === 1 ? '' : 's') + '. Include them in the print, or leave them out (the default)?',
      buttons: [{ label: 'Cancel', v: false }, { label: 'Leave out', v: 'out' }, { label: 'Include', v: 'in', cls: 'acc' }]
    }).then(function (v) {
      if (v === 'in') return printDeck(pdf, notes, true);
      if (v === 'out') return printDeck(pdf, notes, false);
      return false;
    });
  }
  function printNotes() {
    closeMenus();
    return dialog({ title: 'Print notes pages', msg: 'Each page shows a smaller copy of the slide and its speaker notes (A4). Empty notes still print the slide. Ordinary Print stays one 16:9 page per slide.',
      buttons: [{ label: 'Cancel', v: false }, { label: 'Print', v: true, cls: 'acc' }] })
      .then(function (v) { return v === true ? printWithHidden(false, true) : false; });
  }
  function exportPdf() {
    closeMenus();
    return dialog({ title: 'Export PDF', msg: 'The print window opens with one 16:9 page per slide (' + deck.slides.length + (deck.slides.length === 1 ? ' page' : ' pages') +
      ', pictures, shapes, tables and theme included). Choose “Save as PDF” as the destination (Printer), then Save.', buttons: [{ label: 'Cancel', v: false }, { label: 'Continue', v: true, cls: 'acc' }] })
      .then(function (v) { return v === true ? printWithHidden(true, false) : false; });
  }
  SLPrint.source(function () { return deck; });
  menuKeys($('menu-deck')); menuKeys($('menu-slide'));
  $('file-in').addEventListener('change', function () { var f = this.files && this.files[0]; if (f) importFile(f); });
  $('pptx-in').addEventListener('change', function () { var f = this.files && this.files[0]; if (f) importPptxFile(f); });
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
    if (e.key === 'F6' && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); if ($('dialog').hidden) presentView(!!e.shiftKey); return; }
    if (e.key === 'F5' && e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if ($('dialog').hidden) presentView(!e.shiftKey); return; }
    if (!$('pick').hidden) { if (e.key === 'Escape') { e.preventDefault(); closePick(); } return; }   /* the picker's own keys are on #pick */
    if (!$('dialog').hidden || !$('settings').hidden || ($('master') && !$('master').hidden)) return;
    var tg = e.target, typing = tg && (tg.tagName === 'TEXTAREA' || tg.tagName === 'INPUT' || tg.isContentEditable);
    var menus = !$('menu-deck').hidden || !$('menu-slide').hidden;
    /* SL3: app undo / redo outside the text boxes (inside them the browser's own text undo works).
       SL4: routed by OfficeQuick (undoKey below); legacy SL3 handler here:
       if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing && (z | y)) { e.preventDefault(); swap(redo | undo) } */
    /* SL5 format shortcuts while typing in a box */
    if (typing && (e.ctrlKey || e.metaKey) && !e.altKey) {
      var k = e.key, low = k.length === 1 ? k.toLowerCase() : k;
      if (low === 'b') { e.preventDefault(); SLEdit.format({ b: 'toggle' }, 'Bold'); return; }
      if (low === 'i') { e.preventDefault(); SLEdit.format({ i: 'toggle' }, 'Italic'); return; }
      if (low === 'u') { e.preventDefault(); SLEdit.format({ u: 'toggle' }, 'Underline'); return; }
      if ((low === 'l' || low === 'L') && !e.shiftKey) { e.preventDefault(); SLEdit.para({ align: 'left' }, 'Align left'); return; }
      if ((low === 'e' || low === 'E') && !e.shiftKey) { e.preventDefault(); SLEdit.para({ align: 'center' }, 'Align centre'); return; }
      if ((low === 'r' || low === 'R') && !e.shiftKey) { e.preventDefault(); SLEdit.para({ align: 'right' }, 'Align right'); return; }
      if (e.shiftKey && (k === '>' || k === '.' || e.code === 'Period' || e.key === 'Period')) { e.preventDefault(); bumpSize(1); return; }
      if (e.shiftKey && (k === '<' || k === ',' || e.code === 'Comma' || e.key === 'Comma')) { e.preventDefault(); bumpSize(-1); return; }
    }
    /* SL3 / SL5 / SL6: the selected picture, text box, shape or table: Delete removes it, arrows nudge, Enter edits, Esc drops the selection */
    var sp = SLEdit.selected();
    if (sp && !sp.editing && !typing && !menus && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        var n = (sp.items && sp.items.length) || 1;
        SLEdit.delObj(); toast((n > 1 ? n + ' objects' : (sp.kind === 'tbox' ? 'Text box' : sp.kind === 'shape' ? 'Shape' : sp.kind === 'table' ? 'Table' : 'Picture')) + ' deleted (Ctrl+Z brings ' + (n > 1 ? 'them' : 'it') + ' back)'); return;
      }
      if (e.key === 'Enter' && sp.kind === 'tbox') { e.preventDefault(); SLEdit.startEdit('tbox', sp.obj.id); return; }
      if (e.key === 'Enter' && sp.kind === 'shape') { e.preventDefault(); SLEdit.startEdit('shape', sp.obj.id); return; }
      if (e.key === 'Enter' && sp.kind === 'table') { e.preventDefault(); var c = sp.cell || { r: 0, c: 0 }; SLEdit.startEdit('table', sp.obj.id, c.r, c.c); return; }
      var st = e.shiftKey ? 10 : 1, mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
      if (mv) { e.preventDefault(); SLEdit.nudge(mv[0], mv[1]); return; }
      if (e.key === 'Escape') { e.preventDefault(); SLEdit.select(''); return; }
    }
    if ((e.key === 'p' || e.key === 'P') && !typing && !e.ctrlKey && !e.metaKey && !e.altKey && $('menu-deck').hidden && $('menu-slide').hidden) { e.preventDefault(); present(false); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addSlide(); }
    else if (e.key === 'Escape') closeMenus();
  });

  SLEdit.init({ onChange: function (s) { var i = deck.slides.indexOf(s); if (i >= 0) SLList.update(i); dirty(); },
    /* SL3 / SL5: a picture or text box was added / moved / resized / cropped / deleted, or text was formatted */
    onObj: function (s, before, label) { var i = deck.slides.indexOf(s); if (i < 0) return; recordSlide(s, before, label); SLList.update(i); dirty(); },
    onPickPic: pickPicture, onFmt: syncFmt });
  setNotesOpen(notesWanted());
  SLShow.init({ onExit: function (last) {
    if (SLPresent.isPresenterSearch(location.search)) {
      try { window.close(); } catch (_) { /* */ }
    }
    /* back in the editor on the slide shown last */
    if (deck && last !== deck.cur) select(last); else if (deck) { SLList.reveal(); }
    SLEdit.fit();
    try { $('b-show').focus({ preventScroll: true }); } catch (_) { /* */ }
  }, onKeep: keepInk });
  SLList.init({
    onSelect: select, onMove: move, onNudge: nudge, onEnter: function () { SLEdit.focusTitle(); },
    theme: function () { return deck ? deck.theme || 'light' : 'light'; },
    context: function () { return deck || { slides: [], master: {}, sections: [] }; },
    onFold: foldSection, onShiftSection: shiftSection, onRenameSection: renameSection, onMoveSection: moveSectionTo
  });

  /* ---------- SL4 ribbon + Quick Access + Hub bar ---------- */
  var TABS = [{ id: 'home', label: 'Home' }, { id: 'insert', label: 'Insert' }, { id: 'design', label: 'Design' }, { id: 'show', label: 'Slide Show' }];
  var ribbon = OfficeRibbon.create({ tabs: TABS, prefix: 'sl-', storageKey: 'slides-ribbon-tab', tabsEl: $('of-tabs'), fileBtn: $('b-deck'), fileMenu: $('menu-deck'),
    panelSelector: '#of-ribbon .of-panel', onTab: function () { if (window.OfficeQuick) OfficeQuick.refresh(); SLHub.tab(); } });
  function activeTab() { return ribbon.current || 'home'; }
  function selectTab(id) { if (!$('menu-deck').hidden) ribbon.setFile(false); ribbon.select(id); }
  /* the File menu: under File standalone; in the Hub (own top row hidden) at the frame's top-left */
  function openFile() {
    var m = $('menu-deck'), open = !m.hidden;
    closeMenus(); if (open) return;
    ribbon.setFile(true);
    if (document.body.classList.contains('in-hub')) { m.style.top = '8px'; m.style.left = '8px'; }
    var f = m.querySelector('button'); if (f) f.focus();
  }
  $('b-deck').addEventListener('click', function () { if (!$('menu-deck').hidden) { $('menu-slide').hidden = true; var f = $('menu-deck').querySelector('button'); if (f) f.focus(); } });
  function blocked() { return SLShow.on() || !$('dialog').hidden || !$('settings').hidden || !$('pick').hidden || ($('master') && !$('master').hidden); }
  OfficeQuick.register({
    app: 'Slides',
    undo: function () { if (!blocked()) swap(undo, redo, 'Undo'); }, redo: function () { if (!blocked()) swap(redo, undo, 'Redo'); },
    canUndo: function () { return !!deck && undo.length > 0; }, canRedo: function () { return !!deck && redo.length > 0; },
    save: function () { if (!deck) return false; SLSave.saveDeck(deck); return SLSave.flush() !== false && !SLSave.memOnly; },
    canSave: function () { return !!deck; },
    print: function () { if (!blocked()) printWithHidden(false, false); },
    /* Ctrl+Z / Y: the app undo outside the text boxes; inside them (and in dialogs) the browser's own text undo */
    undoKey: function (ev) { var t = ev.target; return !blocked() && !(t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)); },
    tabs: function () { return [{ id: 'file', label: 'File' }].concat(TABS); },
    activeTab: activeTab,
    onTab: function (id) { if (id === 'file') openFile(); else selectTab(id); },
    mount: $('top'), before: $('b-deck'), fallback: $('of-ribbon')
  });
  SLHub.init({ tabs: TABS, activeTab: activeTab, selectTab: selectTab, openFile: openFile, openSettings: openSettings,
    title: function () { return deck ? deck.name : 'Slides'; } });
  wireFmt();

  /* ---------- start: the last deck, else the newest, else a first deck ---------- */
  (function boot() {
    if (SLPresent.isPresenterSearch(location.search)) {
      var key = SLPresent.param(location.search, 'k');
      var did = SLPresent.param(location.search, 'd');
      var d = (did && SLSave.load(did)) || (SLSave.currentId() && SLSave.load(SLSave.currentId()));
      if (!d) {
        document.documentElement.classList.add('presenting');
        $('show').hidden = false; $('show-end').hidden = false;
        $('show-end').querySelector('p').textContent = 'Could not load this deck for Presenter view.';
        return;
      }
      deck = d;
      function startPv() {
        SLShow.enter(deck.slides, 0, deck.theme || 'light', { presenter: true, satellite: true, key: key, master: deck.master, onKeep: keepInk });
      }
      if (window.SLPics && SLPics.hydrate) SLPics.hydrate(d).then(startPv, startPv); else startPv();
      return;
    }
    var id = SLSave.currentId(), d = id && SLSave.load(id);
    if (!d) { var f = SLSave.list()[0]; d = f && SLSave.load(f.id); }
    if (!d) d = SLSave.newDeck('My first deck', [{ title: 'Welcome to Slides', body: 'Type a title above and bullets here\nOne bullet per line\n\tPress Tab to indent a line\nAdd slides with ＋ New slide' }]);   /* legacy (SL1 – SL3): …Add slides with ＋ Slide */
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
    addSlide: function (l) { addSlide(l); }, insertPicture: insertPicture, addTextBox: addTextBox, addShape: addShape, addTable: addTable, presentView: presentView, printNotes: printNotes,
    undo: function () { return swap(undo, redo, 'Undo'); }, redo: function () { return swap(redo, undo, 'Redo'); },
    busy: function () { return busy; },
    /* SL4 */
    tab: activeTab, selectTab: selectTab, print: printDeck, exportPdf: exportPdf, canUndo: function () { return undo.length > 0; }, canRedo: function () { return redo.length > 0; }
  };
})();
