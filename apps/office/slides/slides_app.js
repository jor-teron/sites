/* Hub Office Slides SL1 — app: decks (new / open / rename / delete with confirm / import / export), slide actions
   (add after, duplicate, move ▲▼, delete with confirm), menus, in-app dialogs, settings + About, keys, auto-save status.
   window.Slides = small read-only API for tests and later releases (SL2 Present reads Slides.deck()). */
(function () {
  'use strict';
  var VERSION = 'SL1';
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
    $('deck-name').textContent = d.name; document.title = d.name + ' · Slides SL1';
    renderAll();
  }
  function renderAll() { SLList.render(deck.slides, deck.cur); showSlide(); }
  function showSlide() {
    SLEdit.show(deck.slides[deck.cur]);
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
  function addSlide() {
    deck.slides.splice(deck.cur + 1, 0, SLSave.cleanSlide({}));
    if (deck.slides.length > 500) { deck.slides.splice(deck.cur + 1, 1); toast('A deck can have up to 500 slides'); return; }
    deck.cur++; renderAll(); dirty(); SLEdit.focusTitle();
  }
  function dupSlide() {
    var s = deck.slides[deck.cur];
    if (deck.slides.length >= 500) { toast('A deck can have up to 500 slides'); return; }
    deck.slides.splice(deck.cur + 1, 0, SLSave.cleanSlide({ title: s.title, body: s.body }));
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
      deck.name = n; $('deck-name').textContent = n; document.title = n + ' · Slides SL1'; dirty(); SLSave.flush(); toast('Renamed');
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
  function exportDeck() { SLSave.flush(); var f = SLFile.download(deck); toast('Exported ' + f); }
  function importFile(file) {
    SLFile.read(file).then(function (r) {
      if (r.error) { dialog({ title: 'Could not import', msg: r.error, buttons: [{ label: 'OK', v: true, cls: 'acc' }] }); return; }
      SLSave.flush();
      var d = SLSave.newDeck(uniqueName(r.deck.name), r.deck.slides);
      showDeck(d); toast('Imported “' + d.name + '” (' + d.slides.length + (d.slides.length === 1 ? ' slide)' : ' slides)') + (r.cut ? ', first 500 kept' : ''), 2600);
    });
  }

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
  $('menu-deck').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return; closeMenus();
    var a = b.dataset.a;
    if (a === 'new') newDeck(); else if (a === 'open') openDeck(); else if (a === 'rename') renameDeck();
    else if (a === 'import') { $('file-in').value = ''; $('file-in').click(); } else if (a === 'export') exportDeck(); else if (a === 'deldeck') deleteDeck();
  });
  $('menu-slide').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || b.disabled) return; closeMenus();
    var a = b.dataset.a;
    if (a === 'add') addSlide(); else if (a === 'dup') dupSlide(); else if (a === 'up') nudge(-1); else if (a === 'down') nudge(1); else if (a === 'del') delSlide();
  });
  menuKeys($('menu-deck')); menuKeys($('menu-slide'));
  $('file-in').addEventListener('change', function () { var f = this.files && this.files[0]; if (f) importFile(f); });
  /* drop a .hslides file anywhere to import it */
  addEventListener('dragover', function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); });
  addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { e.preventDefault(); importFile(f); } });
  addEventListener('keydown', function (e) {
    if (!$('dialog').hidden || !$('settings').hidden) return;
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); addSlide(); }
    else if (e.key === 'Escape') closeMenus();
  });

  SLEdit.init({ onChange: function (s) { var i = deck.slides.indexOf(s); if (i >= 0) SLList.update(i); dirty(); } });
  SLList.init({ onSelect: select, onMove: move, onNudge: nudge, onEnter: function () { SLEdit.focusTitle(); } });

  /* ---------- start: the last deck, else the newest, else a first deck ---------- */
  (function boot() {
    var id = SLSave.currentId(), d = id && SLSave.load(id);
    if (!d) { var f = SLSave.list()[0]; d = f && SLSave.load(f.id); }
    if (!d) d = SLSave.newDeck('My first deck', [{ title: 'Welcome to Slides', body: 'Type a title above and bullets here\nOne bullet per line\n\tPress Tab to indent a line\nAdd slides with ＋ Slide' }]);
    showDeck(d); if (!SLSave.memOnly) status('Saved');
  })();

  window.Slides = {
    version: VERSION,
    deck: function () { return deck; },
    select: select, add: addSlide, move: move, decks: function () { return SLSave.list(); },
    exportJSON: function () { return SLFile.toJSON(deck); }, importText: function (t) { var r = SLFile.parse(t); if (!r.error) { SLSave.flush(); showDeck(SLSave.newDeck(uniqueName(r.deck.name), r.deck.slides)); } return r; }
  };
})();
