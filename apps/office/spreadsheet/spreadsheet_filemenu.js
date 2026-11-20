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
   DEPENDS: SHEET_HOS, SHEET_SAVEFMT, ribbonSetFile, SHEET_INIT. Load last.
   ============================================================ */
(function (root) {
  'use strict';

  var M = {};

  /* Live File menu order (ids). */
  M.ORDER = ['btn-clear', 'btn-open', 'btn-save', 'btn-save-as', 'btn-print', 'btn-export-menu', 'settingsMenuBtn'];
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
  };

  if (typeof module === 'object' && module.exports) module.exports = M;
  if (root) {
    root.SHEET_FILEMENU = M;
    if (root.document && typeof root.SHEET_INIT !== 'undefined') root.SHEET_INIT.push(M.bind);
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
