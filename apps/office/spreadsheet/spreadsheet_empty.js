/* ============================================================
   FILE: spreadsheet_empty.js
   ROLE: SH40 "no workbook open" state (Writer DW18, writer-empty.js).
         File > Close and Delete end here, and a fresh window starts here
         unless a #drive=&file= link, #new / the SH38 sheet_open_new flag or
         a Hub Office ?new=1 launch asks for a workbook. No grid is shown;
         a centred panel offers New, Open... and recent workbooks (the Hub
         Documents .hos list, SHEET_HOS.list). The ribbon, formula bar and
         sheet tabs are off, the Hub title is just "Spreadsheet" and nothing
         is saved, so no stray Untitled file appears.
         Pure rules (next, canEdit, canWrite, bootMode, hashHasFile,
         keyAction, closeNeedsConfirm, closeDecision (SH40a), flushWrites, recentRows,
         workbookBlank) are tested in test-sh40-close.cjs; enter / leave
         touch the page.
   DEPENDS: (at run time) SHEET_HOS, SHEET_SAVEFMT, SHEET_FILEMENU, SHEET_HUB,
            renderViewport, emptyWorkbook, UNDO. Load after spreadsheet_filemenu.js.
   ============================================================ */
(function (root) {
  'use strict';

  var E = {};

  /* The one flag. empty === true means no workbook is open. */
  E.state = { empty: false };

  /* File menu items that need a workbook. New, Open..., Settings and Functions stay on. */
  E.MENU_OFF = ['btn-rename', 'btn-save', 'btn-save-as', 'btn-print', 'btn-close', 'btn-delete', 'btn-export-menu'];
  /* Parts of the window that are switched off (inert) while empty. */
  E.PARTS_OFF = ['of-tabs', 'of-ribbon', 'sheet-formula-row', 'sheet-wrap', 'sheet-footer'];
  E.RECENT_MAX = 8;
  E.EXT = /\.(hos|xlsx|xlsm|xls|ods|csv)$/i;

  /* Transitions. close / delete / boot-empty -> empty; new / open / boot-* -> a workbook. */
  E.next = function next(state, action) {
    var cur = !!(state && state.empty);
    switch (action) {
      case 'close':
      case 'delete':
      case 'boot-empty':
        return { empty: true };
      case 'new':
      case 'open':
      case 'boot-file':
      case 'boot-blank':
        return { empty: false };
      default:
        return { empty: cur };
    }
  };
  E.canEdit = function canEdit(state) { return !(state && state.empty); };
  /* Autosave, Save, Save As and the page-leave flush write only when a workbook is open. */
  E.canWrite = function canWrite(state) { return !(state && state.empty); };

  /* What a fresh window shows.
     o.fresh: SH38 New window / tab (sheet_open_new or #new) -> blank.
     o.hashFile: a #drive=&file= / Hub open-with link names a workbook -> open it.
     o.officeNew: Hub Office ?new=1 tab -> blank.
     Otherwise -> empty. */
  E.bootMode = function bootMode(o) {
    o = o || {};
    if (o.fresh) return 'blank';
    if (o.hashFile) return 'file';
    if (o.officeNew) return 'blank';
    return 'empty';
  };

  /* True when the hash names a file Spreadsheet can open. parse = FsRef.parse. */
  E.hashHasFile = function hashHasFile(hash, parse) {
    if (!hash || typeof parse !== 'function') return false;
    var ref = null;
    try { ref = parse(String(hash)); } catch (e) { ref = null; }
    return !!(ref && ref.name && E.EXT.test(String(ref.name)));
  };

  function editableTarget(t) {
    if (!t) return false;
    var tag = String(t.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || !!t.isContentEditable;
  }
  /* Keys while empty. null = let it through.
     'new' / 'open' run those; 'toast' = Save / Print with nothing open; 'block' = an edit key. */
  E.keyAction = function keyAction(state, ev) {
    if (!(state && state.empty) || !ev) return null;
    var k = String(ev.key || '').toLowerCase();
    if (!(ev.ctrlKey || ev.metaKey) || ev.altKey) {
      /* Delete / Backspace outside a text field would clear the (hidden) selection. */
      if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && (k === 'delete' || k === 'backspace') && !editableTarget(ev.target)) return 'block';
      return null;
    }
    if (k === 'n' && !ev.shiftKey) return 'new';
    if (k === 'o' && !ev.shiftKey) return 'open';
    if (k === 's' || k === 'p') return 'toast';
    if (k.length === 1 && 'zyxvdrbiuaf'.indexOf(k) !== -1) return 'block';
    if (k === 'enter' || k === 'backspace' || k === 'delete') return 'block';
    return null;
  };

  /* SH40a: Close asks (Save As / Discard / Cancel) whenever the workbook has edits and the
     save before Close cannot write them back (no file target), in the Hub too.
     o.dirty: edits in the undo history and not blank. o.canSaveBack: flushWrites(...). */
  E.closeDecision = function closeDecision(o) {
    o = o || {};
    if (!o.dirty) return 'close';
    return o.canSaveBack ? 'close' : 'confirm';
  };

  /* (before SH40a) Close used closeNeedsConfirm (kept for older callers and tests).
     Close asks first only when the flush cannot keep the edits, and never in the Hub:
     o.inHub true -> no; o.willWrite true -> no; o.blank -> no; else o.changed. */
  E.closeNeedsConfirm = function closeNeedsConfirm(o) {
    o = o || {};
    if (o.inHub) return false;
    if (o.willWrite) return false;
    if (o.blank) return false;
    return !!o.changed;
  };

  /* Does the save before Close write the workbook?
     .hos: OfficeNative saveNow (non-explicit) writes in the Hub with the Local drive, or to a picked file.
     .xlsx / .xlsm / .ods / .csv: SHEET_SAVEFMT.flush writes to a picked file, or a Hub file in the Hub. */
  E.flushWrites = function flushWrites(o) {
    o = o || {};
    var hub = !!(o.inHub && o.canLocal);
    var kind = o.destKind || '';
    if ((o.format || 'hos') === 'hos') return hub || kind === 'handle';
    return kind === 'handle' || (kind === 'hub' && hub);
  };

  /* Recent rows for the panel: newest first (SHEET_HOS.list order), at most RECENT_MAX. */
  E.recentRows = function recentRows(rows, stem) {
    var s = typeof stem === 'function' ? stem : function (n) { return String(n || '').replace(/\.hos$/i, ''); };
    return (rows || []).filter(function (r) { return r && r.name; }).slice(0, E.RECENT_MAX)
      .map(function (r) { return { name: r.name, label: s(r.name) }; });
  };

  /* True when no sheet has a formula or value (sparse rows; rowStoreFn = rowStore). */
  E.workbookBlank = function workbookBlank(sheets, rowStoreFn) {
    var i, r, c, rows, row, store, cell;
    if (!sheets || !sheets.length) return true;
    for (i = 0; i < sheets.length; i++) {
      if (sheets[i] && sheets[i].lazy != null) return false;   /* SH49: an xlsx sheet not loaded yet has content */
      rows = sheets[i] && sheets[i].cells;
      if (!rows) continue;
      for (r = 0; r < rows.length; r++) {
        row = rows[r];
        if (!row) continue;
        store = typeof rowStoreFn === 'function' ? rowStoreFn(row) : row;
        if (!store || store._n === 0) continue;
        for (c in store) {
          if (!/^\d+$/.test(c)) continue;
          cell = store[c];
          if (!cell || cell._empty) continue;
          if (cell.formula != null && String(cell.formula) !== '') return false;
          if (cell.value != null && String(cell.value) !== '') return false;
        }
      }
    }
    return true;
  };

  E.isEmpty = function isEmpty() { return !!E.state.empty; };

  /* ----- Page side (not run under node) ----- */
  function el(id) { return root.document ? root.document.getElementById(id) : null; }
  function S() { return root.SHEET_HOS || null; }
  function F() { return root.SHEET_SAVEFMT || null; }
  function M() { return root.SHEET_FILEMENU || null; }
  function toast(msg) {
    if (typeof root.setStatus === 'function') root.setStatus(msg);
    if (root.OfficeNotify && root.OfficeNotify.show) root.OfficeNotify.show(msg);
  }

  function setParts(off) {
    E.PARTS_OFF.forEach(function (id) {
      var n = el(id);
      if (!n) return;
      if (off) { n.setAttribute('inert', ''); n.setAttribute('aria-hidden', 'true'); }
      else { n.removeAttribute('inert'); n.removeAttribute('aria-hidden'); }
    });
    E.MENU_OFF.forEach(function (id) {
      var b = el(id);
      if (!b) return;
      if (off) { b.disabled = true; b.setAttribute('aria-disabled', 'true'); }
      else { b.disabled = false; b.removeAttribute('aria-disabled'); }
    });
    var panel = el('sheet-empty-panel');
    if (panel) panel.hidden = !off;
    if (root.document && root.document.body) root.document.body.classList.toggle('sheet-empty', !!off);
  }
  /* Drop a #drive=&file= link so a restored Hub window does not reopen the closed file. */
  function clearFileHash() {
    var loc = root.location, hist = root.history;
    if (!loc || !hist || typeof hist.replaceState !== 'function' || !loc.hash) return;
    if (!E.hashHasFile(loc.hash, root.FsRef && root.FsRef.parse)) return;
    try { hist.replaceState(null, '', String(loc.href).split('#')[0]); } catch (e) {}
  }
  /* Hub title: just "Spreadsheet" (empty title) while empty. */
  function wrapHubTitle() {
    var H = root.SHEET_HUB;
    if (!H || typeof H.title !== 'function' || H._sh40Title) return;
    H._sh40Title = true;
    var title = H.title;
    H.title = function () { return E.state.empty ? '' : title.apply(H, arguments); };
  }
  function sendTitle() {
    var H = root.SHEET_HUB, s = S();
    wrapHubTitle();
    if (H && H.setTitle && s && s.stemName) H.setTitle(s.stemName());   /* same stem; re-sends H.title() */
  }

  /* Show the empty state. The caller has already flushed the save. */
  E.enter = function enter(action) {
    var s = S(), f = F();
    E.state = E.next(E.state, action || 'close');
    if (typeof root.saveStore === 'function') clearTimeout(root.saveStore._t);
    if (f && f.reset) f.reset();
    if (s) {
      if (s.detach) s.detach();
      s.skipWrite = true;      /* belt and braces: the save wrappers below also refuse */
      s.autoName = '';
      s.lastHash = '';
    }
    if (typeof root.xlsxHashKey === 'string') root.xlsxHashKey = '';
    if (typeof root.ribbonSetFile === 'function') { try { root.ribbonSetFile(false); } catch (e) {} }
    var m = M();
    if (m && m.closeChooser) { try { m.closeChooser(); } catch (e) {} }
    if (typeof root.closeGridContextMenu === 'function') { try { root.closeGridContextMenu(); } catch (e) {} }
    /* Let go of the workbook's data (renderViewport is held while empty, so nothing redraws). */
    if (typeof root.emptyWorkbook === 'function') { try { root.emptyWorkbook(); } catch (e) {} }
    root.selR = root.selC = root.extR = root.extC = 0; root.selMode = 'cell';
    if (root.UNDO) { root.UNDO.past = []; root.UNDO.future = []; root.UNDO.lastTag = ''; }
    if (typeof root.undoButtons === 'function') { try { root.undoButtons(); } catch (e) {} }
    if (root.document && root.document.activeElement && root.document.activeElement.blur) {
      try { root.document.activeElement.blur(); } catch (e) {}
    }
    clearFileHash();
    setParts(true);
    sendTitle();
    E.renderRecent();
    var nb = el('sheet-empty-new');
    if (nb && nb.focus) { try { nb.focus({ preventScroll: true }); } catch (e) { nb.focus(); } }
    if (root.OfficeQuick && root.OfficeQuick.refresh) { try { root.OfficeQuick.refresh(); } catch (e) {} }
    return true;
  };

  /* Leave the empty state before a workbook is drawn (New, Open..., a recent file, a link). */
  E.leave = function leave(action) {
    if (!E.state.empty) return false;
    var s = S();
    E.state = E.next(E.state, action || 'open');
    if (s) s.skipWrite = false;   /* an opened .xlsx / .ods / .csv sets it again (SHEET_SAVEFMT.opened) */
    setParts(false);
    /* The grid was display:none; measure and draw it again (cheap: the workbook is blank). */
    if (typeof root.applyWidths === 'function') { try { root.applyWidths(); } catch (e) {} }
    if (typeof root.renderSheetTabs === 'function') { try { root.renderSheetTabs(); } catch (e) {} }
    if (root.OfficeQuick && root.OfficeQuick.refresh) { try { root.OfficeQuick.refresh(); } catch (e) {} }
    return true;
  };

  /* Fill the panel's recent list (Hub Documents .hos files, newest first). */
  E.renderRecent = function renderRecent() {
    var box = el('sheet-empty-recent');
    var s = S();
    if (!box || !root.document) return Promise.resolve();
    var pending = (s && s.list) ? Promise.resolve(s.list()) : Promise.resolve([]);
    return pending.then(function (rows) {
      var list = E.recentRows(rows, s && s.stem);
      box.innerHTML = '';
      if (!list.length) {
        var hub = !!(s && s.inHub && s.inHub() && s.canLocal && s.canLocal());
        var p = root.document.createElement('div');
        p.className = 'sheet-empty-none';
        p.textContent = hub ? 'No .hos workbooks in Documents' : 'No recent workbooks here. Use Open... to pick a file.';
        box.appendChild(p);
        return;
      }
      list.forEach(function (r) {
        var b = root.document.createElement('button');
        b.type = 'button';
        b.className = 'sheet-empty-item';
        b.title = 'Open ' + r.label;
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16"/></svg>';
        var span = root.document.createElement('span');
        span.textContent = r.label;
        b.appendChild(span);
        b.addEventListener('click', function () { if (s && s.openName) s.openName(r.name); });
        box.appendChild(b);
      });
    }).catch(function () { box.innerHTML = ''; });
  };

  /* ----- Wrappers (installed at load, before SHEET_INIT runs SHEET_HOS.start) ----- */
  function opening(fn, self, args) {
    var was = E.state.empty;
    if (was) E.leave('open');
    var out;
    try { out = fn.apply(self, args); }
    catch (e) { if (was) E.enter('boot-empty'); throw e; }
    /* A cancelled or failed open goes back to the empty state. */
    if (was && out && typeof out.then === 'function') {
      out.then(function (ok) { if (ok === false && !E.state.empty) E.enter('boot-empty'); }, function () { if (!E.state.empty) E.enter('boot-empty'); });
    }
    return out;
  }
  E.install = function install(win) {
    win = win || root;
    var s = S(), f = F();
    if (s && !s._sh40) {
      s._sh40 = true;
      var save = s.save, autosave = s.autosave, openFile = s.openFile, start = s.start;
      var none = function () { return Promise.resolve({ ok: true, wrote: false, name: '' }); };
      s.save = function () { return E.canWrite(E.state) ? save.apply(s, arguments) : none(); };
      s.autosave = function () { return E.canWrite(E.state) ? autosave.apply(s, arguments) : none(); };
      s.openFile = function () { return opening(openFile, s, arguments); };
      /* Boot: a fresh window starts empty unless a link, #new / sheet_open_new or ?new=1 asks for a workbook.
         Wraps the SH38 start (which takes the New flag); spreadsheet_xlsx.js wraps this in boot,
         so an .xlsx / .ods / .csv link still opens first. */
      s.start = function () {
        var mode = E.bootDecision(win);
        if (mode !== 'empty') return start.apply(s, arguments);
        var m = M();
        try { if (m && m.takeOpenNew) m.takeOpenNew(Date.now(), win.localStorage); } catch (e) {}   /* drop a stale flag */
        E.enter('boot-empty');
        return Promise.resolve(false);
      };
    }
    if (f && !f._sh40 && typeof f.openCsvFile === 'function') {
      f._sh40 = true;
      var csv = f.openCsvFile;
      f.openCsvFile = function () { return opening(csv, f, arguments); };
    }
    if (typeof root.importXlsxFile === 'function' && !root.importXlsxFile._sh40) {
      var imp = root.importXlsxFile;
      /* (before SH40a) importXlsxFile returned nothing, so a failed open stayed on a blank grid. */
      root.importXlsxFile = function () { return opening(imp, root, arguments); };   /* SH40a: Promise<boolean>; false goes back to empty */
      root.importXlsxFile._sh40 = true;
    }
    /* No grid while empty: resize / scroll / timers do not redraw a hidden table. */
    if (typeof root.renderViewport === 'function' && !root.renderViewport._sh40) {
      var rv = root.renderViewport;
      root.renderViewport = function () { if (E.state.empty) return; return rv.apply(this, arguments); };
      root.renderViewport._sh40 = true;
    }
  };
  E.bootDecision = function bootDecision(win) {
    var loc = (win && win.location) || {};
    var m = M();
    var fresh = false, officeNew = false;
    try { fresh = !!(m && ((m.peekOpenNew && m.peekOpenNew(Date.now(), win.localStorage)) || (m.launchIsNew && m.launchIsNew(loc)))); } catch (e) {}
    try { officeNew = !!(root.OfficeNewDoc && root.OfficeNewDoc.isNewDocLaunch && root.OfficeNewDoc.isNewDocLaunch(loc.search || '')); } catch (e) {}
    return E.bootMode({ fresh: fresh, hashFile: E.hashHasFile(loc.hash || '', win && win.FsRef && win.FsRef.parse), officeNew: officeNew });
  };

  /* Panel buttons and the empty-state keys (SHEET_INIT). */
  E.bind = function bind() {
    var doc = root.document;
    if (!doc) return;
    wrapHubTitle();
    var nb = el('sheet-empty-new'), ob = el('sheet-empty-open');
    if (nb) nb.addEventListener('click', function () { var m = M(); if (m && m.newHere) m.newHere(); });
    if (ob) ob.addEventListener('click', function () { var m = M(); if (m && m.openFromMenu) m.openFromMenu(); });
    /* Window capture, before OfficeQuick and the grid see the key. */
    root.addEventListener('keydown', function (ev) {
      var a = E.keyAction(E.state, ev);
      if (!a) return;
      ev.preventDefault();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      if (ev.repeat) return;
      var m = M();
      if (a === 'new' && m && m.newHere) m.newHere();
      else if (a === 'open' && m && m.openFromMenu) m.openFromMenu();
      /* Ctrl+P already reached Quick Access print (it toasts); Ctrl+S is just switched off there. */
      else if (a === 'toast' && String(ev.key || '').toLowerCase() !== 'p') toast('No workbook open');
    }, true);
    if (E.state.empty) { setParts(true); sendTitle(); E.renderRecent(); }
  };

  if (typeof module === 'object' && module.exports) module.exports = E;
  if (root) {
    root.SHEET_EMPTY = E;
    if (root.document) {
      E.install(root);
      if (typeof root.SHEET_INIT !== 'undefined') root.SHEET_INIT.push(E.bind);
    }
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
