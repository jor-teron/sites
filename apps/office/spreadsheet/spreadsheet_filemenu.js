/* ============================================================
   FILE: spreadsheet_filemenu.js
   ROLE: SH37 Spreadsheet File menu, standardized on Writer (DW14 / DW14a / DW16).
         - Order: New, Open..., Save, Save As, Print, Export..., then Settings and
           Functions (Rename and Delete slots are filled in SH38).
         - One Open... for .hos, .xlsx, .xlsm, .xls, .ods and .csv. Routed by
           extension to the existing openers: SHEET_HOS.openFile for .hos,
           SHEET_SAVEFMT.openAny (importXlsxFile / openCsvFile) for the rest.
           Outside the Hub the browser's open picker is used, so the file handle
           is kept and Save writes back to the same file (SH32 / Writer DW14a).
           Otherwise, or if the picker fails, the hidden #file-import input
           (its change handler in spreadsheet_toolbar.js does the same routing,
           and spreadsheet_hub.js still sets the Hub title from it).
         - One Export... that opens a small chooser (#sheet-export-menu) with
           CSV, XLSX and ODS; the buttons keep their old ids and wiring.
         - The File menu and the chooser grow to the window bottom (min 160px);
           this file records --file-menu-top when a menu opens.
         Pure helpers (no DOM) are tested by test-sh37-filemenu.js.
         SH38: Rename, Delete, and New in a new window (Writer DW15).
         - Rename asks for a name (SHEET_SAVEFMT.setName, Hub title follows) and
           writes under it like Writer's rename: a Hub file is written under the
           new name in its folder and the old one removed; a picked file keeps
           its handle (renamed on disk only when the browser has handle.move);
           a workbook with no file just takes the name Save will use.
         - Delete asks first. In the Hub it deletes the open file from its folder
           (Documents or where it was opened); elsewhere it closes the workbook
           and leaves any downloaded or picked file as it is (Writer's rule).
           Then a new, empty Untitled workbook.
         - New opens a new Hub window (hub-open-app, newInstance, one-time
           localStorage sheet_open_new) or a new browser tab (#new); on Hub phone
           or when that fails, the old clear-in-place handler runs.
         Tested by test-sh38-filemenu.cjs.
         SH40: Close (Writer DW18), between Print and Delete. It saves first like New
         (SHEET_SAVEFMT flush for an .xlsx / .ods / .csv target, the .hos autosave),
         then shows the empty state (spreadsheet_empty.js) without a new workbook.
         It asks only when the edits have nowhere to go (never in the Hub). Delete
         now ends in the empty state too, and New while empty opens here.
         Tested by test-sh40-close.cjs.
         SH40a: Close asks Save As / Discard / Cancel whenever the edits cannot be saved
         back (also in the Hub, e.g. an .xlsx picked with no save-back target). Save As
         closes only after it wrote. Tested by test-sh40a-close-ask.cjs.
   DEPENDS: SHEET_HOS, SHEET_SAVEFMT, ribbonSetFile, SHEET_INIT. Load last.
   ============================================================ */
(function (root) {
  'use strict';

  var M = {};

  /* Live File menu order (ids). */
  /* (before SH38) M.ORDER = ['btn-clear', 'btn-open', 'btn-save', 'btn-save-as', 'btn-print', 'btn-export-menu', 'settingsMenuBtn']; */
  /* (before SH40) M.ORDER = ['btn-clear', 'btn-open', 'btn-rename', 'btn-save', 'btn-save-as', 'btn-print', 'btn-delete', 'btn-export-menu', 'settingsMenuBtn']; */
  M.ORDER = ['btn-clear', 'btn-open', 'btn-rename', 'btn-save', 'btn-save-as', 'btn-print', 'btn-close', 'btn-delete', 'btn-export-menu', 'settingsMenuBtn'];
  M.ACCEPT = ['.hos', '.xlsx', '.xlsm', '.xls', '.ods', '.csv'];
  M.EXPORTS = ['btn-export', 'btn-export-xlsx', 'btn-export-ods'];

  /* Which opener a picked file uses, from its name only:
     'hos' | 'workbook' (xlsx, xlsm, xls, ods) | 'csv' | null. */
  M.openKind = function openKind(fileName) {
    var name = String(fileName || '').trim();
    var dot = name.lastIndexOf('.');
    if (dot < 0 || dot === name.length - 1) return null;
    var ext = name.slice(dot + 1).toLowerCase();
    if (ext === 'hos') return 'hos';
    if (ext === 'xlsx' || ext === 'xlsm' || ext === 'xls' || ext === 'ods') return 'workbook';
    if (ext === 'csv') return 'csv';
    return null;
  };

  /* True when the handle should travel with the file so Save writes back to it.
     .hos (OfficeNative handle dest), .xlsx / .xlsm / .ods / .csv (SH32 direct formats);
     .xls is read only and saves as .hos. */
  M.keepsHandle = function keepsHandle(fileName) {
    var k = M.openKind(fileName);
    if (k === 'hos' || k === 'csv') return true;
    if (k === 'workbook') return !/\.xls$/i.test(String(fileName || '').trim());
    return false;
  };

  /* Same as Writer.ui.menuMaxHeight (DW16): space from the menu top to the window
     bottom minus an 8px gap, never shorter than 160px. */
  M.menuMaxHeight = function menuMaxHeight(top, viewH) {
    var t = Number(top);
    var h = Number(viewH);
    if (!isFinite(t)) t = 0;
    if (!isFinite(h) || h <= 0) h = 0;
    var px = h - t - 8;
    return px < 160 ? 160 : px;
  };

  /* 'picker' when the window has showOpenFilePicker and is not in the Hub, else 'input'. */
  M.openMode = function openMode(win, inHub) {
    if (inHub) return 'input';
    return (win && typeof win.showOpenFilePicker === 'function') ? 'picker' : 'input';
  };
  /* A user cancel is silent; any other picker failure falls back to the input. */
  M.openPickerFail = function openPickerFail(err) {
    return (err && err.name === 'AbortError') ? 'silent' : 'input';
  };
  M.pickTypes = function pickTypes() {
    return [{
      description: 'Spreadsheets (.hos, .xlsx, .xlsm, .ods, .csv, .xls)',
      accept: {
        'application/json': ['.hos'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
        'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
        'text/csv': ['.csv'],
        'application/vnd.ms-excel': ['.xls']
      }
    }];
  };

  /* ---------- DOM ---------- */
  function el(id) { return root.document ? root.document.getElementById(id) : null; }
  function F() { return root.SHEET_SAVEFMT || null; }
  function H() { return root.SHEET_HOS || null; }
  function EM() { return root.SHEET_EMPTY || null; }   /* SH40 */
  function isEmptyNow() { var e = EM(); return !!(e && e.isEmpty && e.isEmpty()); }
  function inHub() { var f = F(); return !!(f && f.inHub && f.inHub()); }
  function toast(msg) {
    if (typeof root.setStatus === 'function') root.setStatus(msg);
    if (root.OfficeNotify && root.OfficeNotify.show) root.OfficeNotify.show(msg);
  }

  /* Send a file (and optional handle) to the opener for its kind. */
  M.openPicked = function openPicked(file, handle) {
    if (!file) return Promise.resolve(false);
    var kind = M.openKind(file.name);
    var h = handle && M.keepsHandle(file.name) ? handle : null;
    if (kind === 'hos') {
      var s = H();
      if (!s || !s.openFile) return Promise.resolve(false);
      return s.openFile(file, h ? { kind: 'handle', handle: h, name: h.name || file.name } : null);
    }
    if (kind === 'workbook' || kind === 'csv') {
      var f = F();
      if (f && f.openAny) return Promise.resolve(f.openAny(file, h ? { handle: h } : {}));
      return Promise.resolve(false);
    }
    toast('Choose a .hos, .xlsx, .xlsm, .xls, .ods or .csv file to open it');
    return Promise.resolve(false);
  };
  M.openPickedHandle = function openPickedHandle(handle) {
    if (!handle || !handle.getFile) return Promise.resolve(false);
    return handle.getFile().then(function (file) { return M.openPicked(file, handle); });
  };
  M.openWithInput = function openWithInput() {
    var inp = el('file-import');
    if (!inp) return;
    inp.value = '';
    inp.click();
  };
  /* File > Open.... */
  M.openFromMenu = function openFromMenu(win) {
    if (win === undefined) win = root;
    if (typeof root.ribbonSetFile === 'function') root.ribbonSetFile(false);
    if (M.openMode(win, inHub()) !== 'picker') { M.openWithInput(); return Promise.resolve(); }
    return win.showOpenFilePicker({ types: M.pickTypes(), multiple: false }).then(function (hs) {
      var h = hs && hs[0];
      if (!h) return;
      return M.openPickedHandle(h);
    }).catch(function (e) {
      if (M.openPickerFail(e) === 'silent') return;
      M.openWithInput();
    });
  };

  /* Record a menu's top edge so CSS can grow it to the window bottom. */
  M.setFileMenuTop = function setFileMenuTop(menu) {
    if (!menu || !menu.getBoundingClientRect) return;
    var top = Math.round(menu.getBoundingClientRect().top);
    menu.style.setProperty('--file-menu-top', top + 'px');
  };

  /* ---------- Export... chooser ---------- */
  M.isChooserOpen = function isChooserOpen() {
    var m = el('sheet-export-menu');
    return !!(m && !m.hidden);
  };
  M.closeChooser = function closeChooser() {
    var m = el('sheet-export-menu');
    var b = el('btn-export-menu');
    if (m) m.hidden = true;
    if (b) b.setAttribute('aria-expanded', 'false');
  };
  M.openChooser = function openChooser() {
    var m = el('sheet-export-menu');
    var fm = el('of-file-menu');
    var b = el('btn-export-menu');
    if (!m) return;
    /* Opens where the File menu was. */
    var top = fm && fm.style.top ? fm.style.top : '';
    var left = fm && fm.style.left ? fm.style.left : '';
    if (typeof root.ribbonSetFile === 'function') root.ribbonSetFile(false);
    if (top) m.style.top = top;
    if (left) m.style.left = left;
    m.hidden = false;
    if (b) b.setAttribute('aria-expanded', 'true');
    M.setFileMenuTop(m);
    var first = m.querySelector('.file-item');
    if (first && first.focus) { try { first.focus(); } catch (e) {} }
  };

  M.bind = function bind() {
    var doc = root.document;
    if (!doc) return;
    var open = el('btn-open');
    if (open) open.addEventListener('click', function () { M.openFromMenu(); });
    var ex = el('btn-export-menu');
    if (ex) ex.addEventListener('click', function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
      M.openChooser();
    });
    var chooser = el('sheet-export-menu');
    if (chooser) {
      /* The export buttons keep their own handlers; the chooser just closes. */
      chooser.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('button')) M.closeChooser();
      });
      doc.addEventListener('mousedown', function (e) {
        if (!M.isChooserOpen() || chooser.contains(e.target)) return;
        M.closeChooser();
      });
      doc.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && M.isChooserOpen()) M.closeChooser();
      });
      root.addEventListener('resize', function () { M.closeChooser(); });
    }
    /* DW16-style height: record the top each time the File menu opens (after any
       repositioning by the ribbon or the Hub bridge, which run synchronously first). */
    var fm = el('of-file-menu');
    if (fm && typeof root.MutationObserver === 'function') {
      new root.MutationObserver(function () { if (!fm.hidden) M.setFileMenuTop(fm); })
        .observe(fm, { attributes: true, attributeFilter: ['hidden'] });
    }
    /* SH38 */
    var rn = el('btn-rename');
    if (rn) rn.addEventListener('click', function () { M.rename(); });
    var del = el('btn-delete');
    if (del) del.addEventListener('click', function () { M.deleteCurrent(); });
    /* SH40 */
    var cl = el('btn-close');
    if (cl) cl.addEventListener('click', function () {
      if (typeof root.ribbonSetFile === 'function') root.ribbonSetFile(false);
      M.closeWorkbook();
    });
    /* New: decide before the old clear handlers (spreadsheet_toolbar.js, spreadsheet_hub.js)
       see the click. When a new window or tab opened, they never run. */
    doc.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('#btn-clear') : null;
      if (!t) return;
      /* SH40: nothing open, nothing to keep: the new workbook opens in this window, no question. */
      if (isEmptyNow()) {
        e.stopPropagation();
        if (e.stopImmediatePropagation) e.stopImmediatePropagation();
        if (typeof root.ribbonSetFile === 'function') root.ribbonSetFile(false);
        M.newHere();
        return;
      }
      if (M.requestNew(root) === 'same') return;   /* old clear-in-place handler runs */
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      if (typeof root.ribbonSetFile === 'function') root.ribbonSetFile(false);
    }, true);
  };


  /* ================= SH38 ================= */

  /* ---------- Rename ---------- */
  /* What Rename can do with the current target.
     'hub'         a file in a Hub folder: write the new name, remove the old one
     'handle-move' a picked file and the browser can rename it on disk
     'handle-keep' a picked file, no move: keep writing to the same file, new title
     'name-only'   no file yet (or a download): the name Save will use */
  M.renamePlan = function renamePlan(o) {
    o = o || {};
    if (o.destKind === 'hub' && o.inHub) return 'hub';
    if (o.destKind === 'handle') return o.canMove ? 'handle-move' : 'handle-keep';
    if (o.inHub && o.format === 'hos') return 'hub';   /* autosave writes Documents/<name>.hos */
    return 'name-only';
  };
  /* The trimmed new name, or null when nothing should change. */
  M.renameValue = function renameValue(v, cur) {
    if (v === null || v === undefined) return null;
    var t = String(v).trim();
    if (!t || t === String(cur || '').trim()) return null;
    return t;
  };
  function target() {
    var f = F(), s = H();
    if (f && f.format && f.format !== 'hos') return { format: f.format, dest: f.dest || null, owner: 'fmt' };
    return { format: 'hos', dest: (s && s.dest) || null, owner: 'hos' };
  }
  function hubLocal() {
    var f = F();
    return !!(f && f.inHub && f.inHub() && f.canLocal && f.canLocal());
  }
  function fileFor(fmt, stem) {
    var f = F();
    if (f && f.fileName) return f.fileName(stem, fmt);
    return stem + '.' + fmt;
  }
  function moveHandle(dest, name) {
    try { return Promise.resolve(dest.handle.move(name)).then(function () { dest.name = name; return true; }, function () { return false; }); }
    catch (e) { return Promise.resolve(false); }
  }
  M.rename = function rename() {
    var f = F(), s = H();
    var cur = f && f.currentName ? f.currentName() : (s && s.stemName ? s.stemName() : '');
    var D = root.OfficeDialog;
    var ask = (D && D.prompt)
      ? D.prompt({ title: 'Rename workbook', label: 'Name', value: cur, okLabel: 'Rename' })
      : Promise.resolve(root.prompt ? root.prompt('Rename workbook', cur) : null);
    return ask.then(function (v) {
      var want = M.renameValue(v, cur);
      if (want === null) return false;
      var t = target();
      var plan = M.renamePlan({
        destKind: t.dest && t.dest.kind, inHub: hubLocal(), format: t.format,
        canMove: !!(t.dest && t.dest.handle && typeof t.dest.handle.move === 'function')
      });
      var stem = f && f.setName ? f.setName(want) : want;
      if (!(f && f.setName) && root.SHEET_HUB && root.SHEET_HUB.setTitle) root.SHEET_HUB.setTitle(want);
      if (typeof root.saveStore === 'function') clearTimeout(root.saveStore._t);
      var p;
      if (plan === 'handle-move') p = moveHandle(t.dest, fileFor(t.format, stem)).then(function () { return write(t); });
      else if (plan === 'hub' || plan === 'handle-keep') p = write(t);
      else p = Promise.resolve(null);
      return p.then(function () {
        toast('Renamed to ' + stem);
        return true;
      }, function () {
        toast('Could not rename');
        return false;
      });
    });
  };
  /* Write the workbook under its (new) name: like Writer's rename, which saves at once. */
  function write(t) {
    var s = H();
    if (!s) return Promise.resolve(null);
    if (t.owner === 'fmt') return s.save({ explicit: true });   /* SHEET_SAVEFMT.writeDirect */
    return s.autosave ? s.autosave() : s.save({});
  }

  /* ---------- Delete ---------- */
  /* Writer's rule: in the Hub with the Local drive, delete from disk; elsewhere close only.
     hasFile: the workbook has a Hub file (a never-saved workbook only closes). */
  M.deletePlan = function deletePlan(o) {
    o = o || {};
    var label = String(o.name || 'Untitled');
    if (o.inHub && o.canLocal && o.hasFile) {
      return {
        onDisk: true,
        title: 'Delete workbook?',
        message: '"' + label + '" will be deleted from ' + (o.folder || 'Documents') + '. This cannot be undone.',
        okLabel: 'Delete',
        danger: true
      };
    }
    return {
      onDisk: false,
      title: 'Close workbook?',
      message: 'Close "' + label + '"? A downloaded or opened file is left as it is.',
      okLabel: 'Close',
      danger: false
    };
  };
  function dirOf(dest) {
    return root.FsDrives.handle(dest.drive).then(function (dir) {
      var parts = String(dest.path || '').split('/').filter(Boolean);
      function next() {
        if (!parts.length) return dir;
        return dir.getDirectoryHandle(parts.shift()).then(function (child) { dir = child; return next(); });
      }
      return next();
    });
  }
  function notFound(e) { return !!(e && (e.name === 'NotFoundError' || e.code === 8)); }
  /* The Hub file to remove for the current workbook, or null. Only the file this
     workbook was opened from or saved to, never a file that merely has the same name. */
  function diskTarget(t) {
    return (t.dest && t.dest.kind === 'hub') ? t.dest : null;
  }
  M.deleteCurrent = function deleteCurrent() {
    var f = F(), s = H();
    var name = f && f.currentName ? f.currentName() : (s && s.stemName ? s.stemName() : '');
    var t = target();
    var plan = M.deletePlan({ name: name, inHub: f && f.inHub && f.inHub(), canLocal: f && f.canLocal && f.canLocal(),
      hasFile: !!diskTarget(t),
      folder: t.dest && t.dest.kind === 'hub' && t.dest.path ? t.dest.path : '' });
    var D = root.OfficeDialog;
    var ask = (D && D.confirm)
      ? D.confirm({ title: plan.title, message: plan.message, okLabel: plan.okLabel, danger: plan.danger })
      : Promise.resolve(root.confirm ? root.confirm(plan.message) : true);
    return ask.then(function (yes) { return yes ? M.deleteNow(plan, t, name) : false; });
  };
  M.deleteNow = function deleteNow(plan, t, name) {
    var f = F(), s = H();
    if (typeof root.saveStore === 'function') clearTimeout(root.saveStore._t);
    /* Let go of the file first, so no flush or autosave writes it back. */
    var disk = plan.onDisk ? diskTarget(t) : null;
    if (f) { f.dest = null; f.savedSig = ''; }
    if (s) { if (s.detach) s.detach(); s.skipWrite = true; }
    var gone = (disk && root.FsDrives) ? dirOf(disk).then(function (dir) { return dir.removeEntry(disk.name); })
      .catch(function (e) { if (!notFound(e)) throw e; }) : Promise.resolve();
    return gone.then(function () {
      /* (before SH40) M.blankWorkbook(); */
      var em = EM();
      if (em && em.enter) em.enter('delete');   /* SH40: no new Untitled; the empty state */
      else M.blankWorkbook();
      toast((plan.onDisk ? 'Deleted ' : 'Closed ') + name);
      return true;
    }).catch(function () {
      if (s) s.skipWrite = false;
      toast('Could not delete workbook');
      return false;
    });
  };
  /* A new, empty Untitled workbook in this window (the old New / Clear steps, no flush). */
  M.blankWorkbook = function blankWorkbook() {
    var s = H();
    if (typeof root.undoRecord === 'function') root.undoRecord('clear-all');
    if (typeof root.emptyWorkbook === 'function') root.emptyWorkbook();
    root.selR = root.selC = root.extR = root.extC = 0; root.selMode = 'cell';
    var named = (s && s.prepareNew) ? Promise.resolve(s.prepareNew()) : Promise.resolve();
    if (s) s.skipWrite = false;   /* after prepareNew detached the old file */
    if (typeof root.afterChange === 'function') root.afterChange();
    if (typeof root.applyWidths === 'function') root.applyWidths();
    if (typeof root.renderSheetTabs === 'function') root.renderSheetTabs();
    if (typeof root.highlightSel === 'function') root.highlightSel();
    return named;
  };

  /* ================= SH40 ================= */

  /* ---------- Close (Writer DW18) ---------- */
  /* Facts for the Close question (SHEET_EMPTY.closeNeedsConfirm). */
  M.closeInfo = function closeInfo() {
    var f = F(), s = H(), em = EM();
    var t = target();
    var hub = !!(f && f.inHub && f.inHub());
    var info = {
      inHub: hub,
      willWrite: em && em.flushWrites ? em.flushWrites({
        inHub: hub,
        canLocal: !!(f && f.canLocal && f.canLocal()),
        destKind: t.dest ? t.dest.kind : '',
        format: t.format
      }) : true,
      blank: em && em.workbookBlank && root.workbook ? em.workbookBlank(root.workbook.sheets, root.rowStore) : false,
      changed: !!(root.UNDO && root.UNDO.past && root.UNDO.past.length)
    };
    if (s && s.applying) info.changed = false;
    return info;
  };
  /* (before SH40a)
  /* File > Close: save first (the New / SH38 flush), then the empty state. No new workbook. *\/
  M.closeWorkbook = function closeWorkbook() {
    var em = EM(), f = F(), s = H();
    if (!em || em.isEmpty()) return Promise.resolve(false);
    var name = f && f.currentName ? f.currentName() : (s && s.stemName ? s.stemName() : 'workbook');
    var D = root.OfficeDialog;
    var ask = em.closeNeedsConfirm(M.closeInfo()) && D && D.confirm
      ? D.confirm({ title: 'Close workbook?', message: '"' + name + '" has changes that are not saved to a file. Close it anyway? Use Save first to keep them.', okLabel: 'Close', danger: true })
      : Promise.resolve(true);
    return ask.then(function (yes) {
      if (!yes) return false;
      if (typeof root.saveStore === 'function') clearTimeout(root.saveStore._t);
      if (typeof root.blurEditing === 'function') { try { root.blurEditing(); } catch (e) {} }
      /* .hos: the autosave (Hub file or a picked file); .xlsx / .ods / .csv: SHEET_SAVEFMT.flush. *\/
      var flushed = (s && s.autosave) ? Promise.resolve(s.autosave({ flush: true })) : Promise.resolve();
      return flushed.catch(function () {}).then(function () {
        em.enter('close');
        toast('Closed ' + name);
        return true;
      });
    }).catch(function () {
      toast('Could not close workbook');
      return false;
    });
  };
  */
  /* SH40a: the three choices when Close would drop edits that cannot be saved back. */
  M.CLOSE_CHOICES = [
    { id: 'cancel', label: 'Cancel' },
    { id: 'discard', label: 'Discard', danger: true },
    { id: 'saveas', label: 'Save As...', primary: true }
  ];
  /* 'close' or 'confirm' from closeInfo() (SHEET_EMPTY.closeDecision). */
  M.closeDecisionFor = function closeDecisionFor(info, em) {
    info = info || {};
    var dirty = !!info.changed && !info.blank;
    if (em && em.closeDecision) return em.closeDecision({ dirty: dirty, canSaveBack: !!info.willWrite });
    if (em && em.closeNeedsConfirm) return em.closeNeedsConfirm(info) ? 'confirm' : 'close';
    return 'close';
  };
  M.closeMessage = function closeMessage(name) {
    return '"' + (name || 'Untitled') + '" has changes that cannot be saved back to its file. Save a copy with Save As, or discard the changes?';
  };
  /* Save As / Discard / Cancel box (OfficeDialog has OK / Cancel only). Same look: office-dialog.css.
     Resolves 'saveas' | 'discard' | 'cancel'. Esc, a backdrop click or Cancel = 'cancel'. */
  M.askCloseChoice = function askCloseChoice(name) {
    var doc = root.document, D = root.OfficeDialog;
    if (!doc || !doc.body || typeof doc.createElement !== 'function') {
      return Promise.resolve(root.confirm ? (root.confirm(M.closeMessage(name) + ' (OK discards)') ? 'discard' : 'cancel') : 'cancel');
    }
    if (D && D.isOpen && D.isOpen()) return Promise.resolve('cancel');
    return new Promise(function (resolve) {
      var host = doc.createElement('dialog');
      host.className = 'dlg-modal';
      var box = doc.createElement('div');
      box.className = 'dlg';
      box.setAttribute('role', 'alertdialog');
      box.setAttribute('aria-modal', 'true');
      var title = doc.createElement('div');
      title.className = 'dlg-title';
      title.id = 'sheetCloseTitle';
      title.textContent = 'Close workbook?';
      var msg = doc.createElement('div');
      msg.className = 'dlg-message';
      msg.id = 'sheetCloseMsg';
      msg.textContent = M.closeMessage(name);
      box.setAttribute('aria-labelledby', 'sheetCloseTitle');
      box.setAttribute('aria-describedby', 'sheetCloseMsg');
      box.appendChild(title);
      box.appendChild(msg);
      var row = doc.createElement('div');
      row.className = 'dlg-actions sheet-close-actions';
      var btns = [], primary = null;
      M.CLOSE_CHOICES.forEach(function (c) {
        var b = doc.createElement('button');
        b.type = 'button';
        b.className = 'dlg-btn ' + (c.id === 'cancel' ? 'dlg-cancel' : 'dlg-ok') + (c.danger ? ' dlg-danger' : '');
        b.textContent = c.label;
        b.setAttribute('data-choice', c.id);
        b.addEventListener('click', function () { finish(c.id); });
        row.appendChild(b);
        btns.push(b);
        if (c.primary) primary = b;
      });
      box.appendChild(row);
      host.appendChild(box);
      var before = doc.activeElement, done = false;
      function finish(id) {
        if (done) return;
        done = true;
        doc.removeEventListener('keydown', onKey, true);
        try { if (host.close) host.close(); } catch (e) {}
        if (host.remove) host.remove();
        try { if (before && before.focus && doc.contains(before)) before.focus({ preventScroll: true }); } catch (e) {}
        resolve(id);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish('cancel'); return; }
        if (e.key === 'Enter' && !e.isComposing) {
          e.preventDefault(); e.stopPropagation();
          var a = doc.activeElement;
          finish(a && a.getAttribute && a.getAttribute('data-choice') ? a.getAttribute('data-choice') : 'saveas');
          return;
        }
        if (e.key === 'Tab') {
          var i = btns.indexOf(doc.activeElement);
          e.preventDefault();
          btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
          return;
        }
        e.stopPropagation();   /* keep app shortcuts out while open */
      }
      doc.addEventListener('keydown', onKey, true);
      host.addEventListener('cancel', function (e) { e.preventDefault(); finish('cancel'); });
      host.addEventListener('mousedown', function (e) { if (e.target === host) { e.preventDefault(); finish('cancel'); } });
      doc.body.appendChild(host);
      if (typeof host.showModal === 'function') {
        try { host.showModal(); } catch (e) { host.setAttribute('open', ''); }
      } else host.setAttribute('open', '');
      if (primary && primary.focus) primary.focus();
    });
  };
  /* File > Close: save first (the New / SH38 flush), then the empty state. No new workbook.
     SH40a: edits that cannot be saved back ask Save As / Discard / Cancel, in the Hub too. */
  M.closeWorkbook = function closeWorkbook() {
    var em = EM(), f = F(), s = H();
    if (!em || em.isEmpty()) return Promise.resolve(false);
    function nameNow() { return f && f.currentName ? f.currentName() : (s && s.stemName ? s.stemName() : 'workbook'); }
    var name = nameNow();
    function finish(discard) {
      if (typeof root.saveStore === 'function') clearTimeout(root.saveStore._t);
      if (typeof root.blurEditing === 'function') { try { root.blurEditing(); } catch (e) {} }
      /* .hos: the autosave (Hub file or a picked file); .xlsx / .ods / .csv: SHEET_SAVEFMT.flush.
         Discard writes nothing (there is no file to write back to anyway). */
      var flushed = (!discard && s && s.autosave) ? Promise.resolve(s.autosave({ flush: true })) : Promise.resolve();
      return flushed.catch(function () {}).then(function () {
        var label = nameNow();
        em.enter('close');
        toast((discard ? 'Closed without saving ' : 'Closed ') + label);
        return true;
      });
    }
    var decision = M.closeDecisionFor(M.closeInfo(), em);
    var ask = decision === 'confirm' ? M.askCloseChoice(name) : Promise.resolve('close');
    return ask.then(function (choice) {
      if (choice === 'cancel') return false;
      if (choice === 'saveas') {
        if (!s || !s.save) return false;
        if (typeof root.saveStore === 'function') clearTimeout(root.saveStore._t);
        /* The existing Save As flow (name + format box); close only after it wrote. */
        return Promise.resolve(s.save({ explicit: true, saveAs: true })).then(function (res) {
          if (!(res && res.wrote)) return false;
          return finish(false);
        }, function () { return false; });
      }
      return finish(choice === 'discard');
    }).catch(function () {
      toast('Could not close workbook');
      return false;
    });
  };
  /* New while empty: a blank Untitled workbook in this window (no Hub window, no tab, no question). */
  M.newHere = function newHere() {
    var em = EM();
    if (em && em.leave) em.leave('new');
    var p = M.blankWorkbook();
    if (root.UNDO) { root.UNDO.past = []; root.UNDO.future = []; }
    if (typeof root.undoButtons === 'function') root.undoButtons();
    return p;
  };
  /* The one-time New flag is there and fresh, without taking it (SHEET_HOS.start takes it). */
  M.peekOpenNew = function peekOpenNew(now, store) {
    if (!store || typeof store.getItem !== 'function') return false;
    var raw = null;
    try { raw = store.getItem(M.OPEN_NEW_KEY); } catch (e) { return false; }
    if (raw == null || raw === '') return false;
    var t = Number(raw);
    if (!isFinite(t)) return false;
    var age = now - t;
    return age >= 0 && age < M.OPEN_NEW_MS;
  };

  /* ---------- New (Writer DW15) ---------- */
  M.OPEN_NEW_KEY = 'sheet_open_new';
  M.OPEN_NEW_MS = 30000;
  /* inFrame + inHub + phone === true -> 'same' (Hub phone); inFrame + inHub -> 'hub-window';
     inFrame === false -> 'tab'; anything else -> 'same'. */
  M.newMode = function newMode(opts) {
    opts = opts || {};
    if (opts.inFrame && opts.inHub) return opts.phone === true ? 'same' : 'hub-window';
    if (opts.inFrame === false) return 'tab';
    return 'same';
  };
  /* Hub phone mode from a same-origin parent: true / false, null when unknown. */
  M.hubPhone = function hubPhone(win) {
    if (!win) return null;
    try {
      var p = win.parent;
      if (!p || p === win) return null;
      if (p.HubMode && typeof p.HubMode.isDesktop === 'function') return !(p.HubMode.isDesktop() && p.HubWM);
    } catch (e) { /* cross-origin or file:// */ }
    return null;
  };
  M.inHubFrame = function inHubFrame() {
    if (root.SHEET_HUB && root.SHEET_HUB.linked) return true;
    try { if (root.document && root.document.body && root.document.body.classList.contains('in-hub')) return true; } catch (e) {}
    return false;
  };
  M.markOpenNew = function markOpenNew(now, store) {
    if (!store || typeof store.setItem !== 'function') return false;
    try { store.setItem(M.OPEN_NEW_KEY, String(now)); return true; } catch (e) { return false; }
  };
  /* True when the one-shot flag is there and under 30 s old. Always removes it. */
  M.takeOpenNew = function takeOpenNew(now, store) {
    if (!store || typeof store.getItem !== 'function') return false;
    var raw = null;
    try { raw = store.getItem(M.OPEN_NEW_KEY); } catch (e) { return false; }
    try { if (store.removeItem) store.removeItem(M.OPEN_NEW_KEY); } catch (e) {}
    if (raw == null || raw === '') return false;
    var t = Number(raw);
    if (!isFinite(t)) return false;
    var age = now - t;
    return age >= 0 && age < M.OPEN_NEW_MS;
  };
  /* Standalone New uses #new (?new=1 is the Hub Office tab flag). */
  M.launchIsNew = function launchIsNew(loc) { return !!loc && String(loc.hash || '') === '#new'; };
  M.newTabUrl = function newTabUrl(href) {
    var s = String(href || '');
    var i = s.indexOf('#');
    return (i >= 0 ? s.slice(0, i) : s) + '#new';
  };
  M.cleanNewUrl = function cleanNewUrl(loc, hist) {
    if (!loc || !M.launchIsNew(loc) || !hist || typeof hist.replaceState !== 'function') return;
    try { hist.replaceState(null, '', String(loc.href).replace(/#new$/, '')); } catch (e) {}
  };
  M.consumeNewLaunch = function consumeNewLaunch(now, store, loc, hist) {
    var fromFlag = M.takeOpenNew(now, store);
    var fromUrl = M.launchIsNew(loc);
    if (fromUrl) M.cleanNewUrl(loc, hist);
    return !!(fromFlag || fromUrl);
  };
  M.hubOpenTarget = function hubOpenTarget(loc) {
    if (!loc) return '*';
    return loc.protocol === 'file:' || loc.origin === 'null' ? '*' : loc.origin;
  };
  /* The app's folder URL (the Hub matches on the path and ignores query and hash). */
  M.hubSheetUrl = function hubSheetUrl(href) {
    var s = String(href || '');
    var i = s.indexOf('#');
    if (i >= 0) s = s.slice(0, i);
    i = s.indexOf('?');
    if (i >= 0) s = s.slice(0, i);
    if (/\/[^/]+\.[^/]+$/.test(s)) s = s.replace(/\/[^/]+$/, '/');
    else if (s && s.slice(-1) !== '/') s += '/';
    return s;
  };
  M.hubOpenMessage = function hubOpenMessage(href) {
    return { type: 'hub-open-app', url: M.hubSheetUrl(href), name: 'Spreadsheet', newInstance: true };
  };
  M.postHubNew = function postHubNew(win) {
    if (!win || !win.parent || typeof win.parent.postMessage !== 'function') return false;
    var loc = win.location || {};
    win.parent.postMessage(M.hubOpenMessage(loc.href), M.hubOpenTarget(loc));
    return true;
  };
  M.openNewTab = function openNewTab(win) {
    if (!win || typeof win.open !== 'function') return false;
    return !!win.open(M.newTabUrl(win.location ? win.location.href : ''), '_blank');
  };
  /* File > New. Returns 'hub-window' or 'tab' when a new instance opened, else 'same'
     (the caller then lets the old clear-in-place handler run). Synchronous. */
  M.requestNew = function requestNew(win) {
    var inFrame = false;
    try { inFrame = !!(win && win.parent && win.parent !== win); } catch (e) { inFrame = true; }
    var mode = M.newMode({ inFrame: inFrame, inHub: M.inHubFrame(), phone: M.hubPhone(win) });
    if (mode === 'hub-window') {
      M.markOpenNew(Date.now(), win && win.localStorage);
      try { if (M.postHubNew(win)) return mode; } catch (e) { /* fall through */ }
      try { win.localStorage.removeItem(M.OPEN_NEW_KEY); } catch (e2) {}
      return 'same';
    }
    if (mode === 'tab') {
      var ok = false;
      try { ok = M.openNewTab(win); } catch (e) { ok = false; }
      return ok ? mode : 'same';
    }
    return 'same';
  };

  /* A New window or tab starts empty instead of reopening the last workbook.
     Wraps SHEET_HOS.start now (before boot); spreadsheet_xlsx.js wraps it again in boot,
     so a #drive=&file= link still opens first. */
  M.wrapStart = function wrapStart(session, win) {
    if (!session || typeof session.start !== 'function' || session._sh38Start) return;
    session._sh38Start = true;
    var start = session.start;
    session.start = function () {
      var fresh = false;
      try { fresh = M.consumeNewLaunch(Date.now(), win && win.localStorage, win && win.location, win && win.history); } catch (e) {}
      if (!fresh) return start.apply(session, arguments);
      if (!session.newName) return Promise.resolve(false);
      return session.newName().then(function () { return false; }, function () { return false; });
    };
  };

  if (typeof module === 'object' && module.exports) module.exports = M;
  if (root) {
    root.SHEET_FILEMENU = M;
    if (root.document && typeof root.SHEET_INIT !== 'undefined') root.SHEET_INIT.push(M.bind);
    if (root.document && root.SHEET_HOS) M.wrapStart(root.SHEET_HOS, root);   /* SH38 */
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
