/* ============================================================
   FILE: spreadsheet_hos.js
   ROLE: HOS1 native .hos file. One UTF-8 JSON workbook:
         format "hos", version 1. Every sheet, cell values and
         formulas, styles (including SH17 borders and number
         formats), merges, column widths, row heights, frozen
         panes, conditional formatting, filters, validation,
         charts, the active sheet, page setup, and a settings
         object for options that belong to the file.
         App Settings (theme, ribbon, hover, formula bar, default
         font) stay in localStorage spreadsheet_settings.
         In the Hub, Save, Save As and autosave write Local drive
         Documents (shared/fs, the Files app disk) through
         ../shared/office-native.js. Outside the Hub, Save uses
         the save picker or a download.
         (before HOS1) the native copy was localStorage sheet-v4
         (and sheet-v4-page, spreadsheet-name). Those keys are
         not read and not migrated.
   ============================================================ */
(function (root) {
  'use strict';

  var Hos = {};
  Hos.FORMAT = 'hos';
  Hos.VERSION = 1;
  Hos.MAX = 48 * 1024 * 1024;
  Hos.COLS = 26;
  Hos.ROWS = 100;
  Hos.SHEETS = 20;
  Hos.NAME_MAX = 31;

  var STYLE_KEYS = ['align', 'bold', 'italic', 'underline', 'bg', 'color', 'fontSize', 'wrap', 'bt', 'br', 'bb', 'bl', 'fmt'];
  var PAPERS = { A4: 1, Letter: 1, Legal: 1 };
  var MARGIN_PRESETS = { normal: 1, narrow: 1, wide: 1, custom: 1 };

  function fail(msg) {
    var e = new Error(msg);
    e.userMessage = msg;
    throw e;
  }
  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function limits() {
    var cols = Hos.COLS, rows = Hos.ROWS, max = Hos.SHEETS, nameMax = Hos.NAME_MAX;
    if (typeof CFG !== 'undefined' && CFG) {
      if (CFG.grid) {
        if (CFG.grid.cols) cols = CFG.grid.cols;
        if (CFG.grid.rows) rows = CFG.grid.rows;
      }
      if (CFG.sheets) {
        if (CFG.sheets.max) max = CFG.sheets.max;
        if (CFG.sheets.nameMax) nameMax = CFG.sheets.nameMax;
      }
    }
    return { cols: cols, rows: rows, max: max, nameMax: nameMax };
  }
  function styleBase() {
    var b = {
      align: 'center', bold: false, italic: false, underline: false,
      bg: '', color: '', fontSize: '', wrap: false,
      bt: '', br: '', bb: '', bl: '', fmt: 'general'
    };
    if (typeof defaultStyle === 'function') {
      var d = defaultStyle(), k;
      for (k in d) if (Object.prototype.hasOwnProperty.call(d, k)) b[k] = d[k];
    }
    if (!b.fmt) b.fmt = 'general';
    return b;
  }
  function styleDelta(st) {
    var b = styleBase(), out = {}, i, k, v;
    st = st || {};
    for (i = 0; i < STYLE_KEYS.length; i++) {
      k = STYLE_KEYS[i];
      if (!Object.prototype.hasOwnProperty.call(st, k)) continue;
      v = st[k];
      if (k === 'fmt' && (v == null || v === '' || v === 'general')) continue;
      if (v == null) continue;
      if (v !== b[k]) out[k] = v;
    }
    return out;
  }
  function styleFull(delta) {
    var b = styleBase(), out = {}, k;
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = b[k];
    delta = delta || {};
    for (k in delta) if (Object.prototype.hasOwnProperty.call(delta, k) && STYLE_KEYS.indexOf(k) !== -1) out[k] = delta[k];
    return out;
  }
  function cm(v, d) {
    var n = Number(v);
    if (!isFinite(n)) n = d;
    if (n < 0.5) n = 0.5;
    if (n > 5) n = 5;
    return Math.round(n * 10) / 10;
  }
  Hos.pageOf = function pageOf(p) {
    p = p || {};
    var custom = p.custom || {};
    var margins = MARGIN_PRESETS[p.margins] ? p.margins : 'normal';
    return {
      orientation: p.orientation === 'landscape' ? 'landscape' : 'portrait',
      paper: PAPERS[p.paper] ? p.paper : 'A4',
      margins: margins,
      custom: {
        top: cm(custom.top, 2.5),
        bottom: cm(custom.bottom, 2.5),
        left: cm(custom.left, 2.5),
        right: cm(custom.right, 2.5)
      },
      gridlines: p.gridlines !== false,
      headings: !!p.headings,
      fit: !!p.fit
    };
  };
  /* File-owned options. App Settings are not copied in. Version 1 keeps the object so a later file option has a place; unknown keys are dropped. */
  Hos.settingsOf = function settingsOf(s) {
    s = (s && typeof s === 'object' && !Array.isArray(s)) ? s : {};
    return {};
  };
  function clone(v, fallback) {
    if (v == null) return fallback;
    try { return JSON.parse(JSON.stringify(v)); }
    catch (e) { return fallback; }
  }
  function sizeList(list, n, clamp) {
    var out = [], i, v;
    for (i = 0; i < n; i++) {
      v = list && list[i];
      if (typeof v === 'number' && isFinite(v)) {
        if (clamp) {
          if (v < clamp.min) v = clamp.min;
          if (v > clamp.max) v = clamp.max;
          v = Math.round(v);
        }
        out.push(v);
      } else out.push(null);
    }
    return out;
  }
  function indexes(list, n) {
    var out = [], seen = {}, i, v;
    if (!Array.isArray(list)) return out;
    for (i = 0; i < list.length; i++) {
      v = list[i];
      if (v === true && i < n) v = i;
      if (typeof v === 'number' && v >= 0 && v < n && !seen[v]) { seen[v] = 1; out.push(v); }
    }
    return out;
  }
  function sheetName(name, fallback) {
    var s = String(name || fallback || 'Sheet').replace(/[\\/*?:\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    var max = limits().nameMax;
    if (!s) s = fallback || 'Sheet';
    if (s.length > max) s = s.slice(0, max).trim();
    return s || 'Sheet';
  }
  function cellKept(cell) {
    if (!cell) return false;
    var f = cell.formula == null ? '' : String(cell.formula);
    if (f !== '') return true;
    if (cell.value != null && cell.value !== '') return true;
    var d = styleDelta(cell.style);
    return Object.keys(d).length > 0;
  }
  function packCell(cell, r, c) {
    var f = cell.formula == null ? '' : String(cell.formula);
    var item = { r: r, c: c, formula: f, value: cell.value == null ? '' : cell.value };
    var d = styleDelta(cell.style);
    if (Object.keys(d).length) item.style = d;
    return item;
  }
  function packCells(cells, lim) {
    var out = [], r, c, row, cell;
    if (!cells) return out;
    /* Sparse list {r,c,...} or a grid [r][c]. */
    if (cells.length && cells[0] && typeof cells[0].r === 'number' && typeof cells[0].c === 'number') {
      for (r = 0; r < cells.length; r++) {
        cell = cells[r];
        if (!cell || cell.r < 0 || cell.c < 0 || cell.r >= lim.rows || cell.c >= lim.cols) continue;
        if (!cellKept(cell)) continue;
        out.push(packCell(cell, cell.r | 0, cell.c | 0));
      }
      return out;
    }
    for (r = 0; r < lim.rows; r++) {
      row = cells[r];
      if (!row) continue;
      for (c = 0; c < lim.cols; c++) {
        cell = row[c];
        if (!cellKept(cell)) continue;
        out.push(packCell(cell, r, c));
      }
    }
    return out;
  }
  function selOf(sel) {
    sel = Array.isArray(sel) ? sel : [0, 0, 0, 0, 'cell'];
    var mode = sel[4] === 'col' || sel[4] === 'row' || sel[4] === 'all' ? sel[4] : 'cell';
    return [sel[0] | 0, sel[1] | 0, sel[2] | 0, sel[3] | 0, mode];
  }
  function packSheet(raw, index, lim) {
    raw = raw || {};
    var freeze = raw.freeze || {};
    return {
      name: sheetName(raw.name, 'Sheet' + (index + 1)),
      cells: packCells(raw.cells, lim),
      widths: sizeList(raw.widths, lim.cols, null),
      heights: sizeList(raw.heights, lim.rows, { min: 8, max: 400 }),
      hiddenRows: indexes(raw.hiddenRows, lim.rows),
      hiddenCols: indexes(raw.hiddenCols, lim.cols),
      freeze: {
        rows: Math.max(0, Math.min(lim.rows, freeze.rows | 0)),
        cols: Math.max(0, Math.min(lim.cols, freeze.cols | 0))
      },
      sel: selOf(raw.sel),
      filters: clone(raw.filters, { on: false, r1: 0, r2: 0, c1: 0, c2: 0, cols: {} }),
      validations: clone(raw.validations, []),
      merges: clone(raw.merges, []),
      condFormats: clone(raw.condFormats, []),
      charts: clone(raw.charts, [])
    };
  }

  Hos.stem = function stem(name) {
    if (root && root.OfficeNative && root.OfficeNative.stem) return root.OfficeNative.stem(name, 'hos', 'Sheet');
    var s = String(name || '').replace(/\.hos$/i, '');
    s = s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) s = 'Sheet';
    if (s.length > 180) s = s.slice(0, 180).trim();
    return s;
  };
  Hos.fileName = function fileName(name) { return Hos.stem(name) + '.hos'; };
  Hos.isHos = function isHos(f) { return !!f && /\.hos$/i.test(f.name || ''); };

  /* Build the on-disk object. Extra fields are not kept. */
  Hos.pack = function pack(doc) {
    doc = doc || {};
    var lim = limits();
    var now = Date.now();
    var sheets = [], i, max = lim.max;
    var src = Array.isArray(doc.sheets) ? doc.sheets : [];
    for (i = 0; i < src.length && i < max; i++) sheets.push(packSheet(src[i], i, lim));
    if (!sheets.length) sheets.push(packSheet({ name: 'Sheet1' }, 0, lim));
    var active = doc.active | 0;
    if (active < 0 || active >= sheets.length) active = 0;
    return {
      format: Hos.FORMAT,
      version: Hos.VERSION,
      name: Hos.stem(doc.name || 'Sheet'),
      created: num(doc.created) || now,
      updated: num(doc.updated) || now,
      active: active,
      cols: lim.cols,
      rows: lim.rows,
      page: Hos.pageOf(doc.page),
      settings: Hos.settingsOf(doc.settings),
      sheets: sheets
    };
  };
  Hos.stringify = function stringify(doc) {
    return JSON.stringify(Hos.pack(doc), null, 2);
  };

  /* Read a .hos file. Version 1 only. A sheet-v4 localStorage record is refused. */
  Hos.parse = function parse(text) {
    if (typeof text !== 'string') fail('This is not a .hos file.');
    if (text.length > Hos.MAX) fail('This .hos file is too large.');
    var data;
    try { data = JSON.parse(text); }
    catch (e) { fail('This .hos file could not be read.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('This is not a .hos file.');
    if (data.format !== Hos.FORMAT) fail('This is not a Hub Office Spreadsheet .hos file.');
    if (data.version !== Hos.VERSION) fail('This .hos file is version ' + data.version + '. Spreadsheet reads version 1.');
    if (!Array.isArray(data.sheets) || !data.sheets.length) fail('This .hos file has no sheet.');
    var packed = Hos.pack(data);
    /* pack stamps updated when the caller omitted it; keep the file's times. */
    packed.created = num(data.created);
    packed.updated = num(data.updated);
    packed.name = Hos.stem(data.name || 'Sheet');
    return packed;
  };

  function flagList(indexes, n) {
    var a = [], i;
    for (i = 0; i < n; i++) a.push(false);
    for (i = 0; i < indexes.length; i++) if (indexes[i] >= 0 && indexes[i] < n) a[indexes[i]] = true;
    return a;
  }

  function liveCapture(session) {
    var lim = limits();
    var now = Date.now();
    if (session && !session.created) session.created = now;
    var name = 'Sheet';
    if (typeof SHEET_HOS !== 'undefined' && SHEET_HOS.stemName) name = SHEET_HOS.stemName();
    var sheets = [], i, sh;
    if (typeof stashSheetView === 'function') stashSheetView();
    var src = (typeof workbook !== 'undefined' && workbook && workbook.sheets) ? workbook.sheets : [];
    for (i = 0; i < src.length; i++) {
      sh = src[i];
      sheets.push({
        name: sh.name,
        cells: sh.cells,
        widths: sh.widths,
        heights: sh.heights,
        hiddenRows: flagIndexes(sh.hiddenRows),
        hiddenCols: flagIndexes(sh.hiddenCols),
        freeze: sh.freeze,
        sel: sh.sel,
        filters: sh.filters,
        validations: sh.validations,
        merges: sh.merges,
        condFormats: sh.condFormats,
        charts: sh.charts
      });
    }
    return {
      name: name,
      created: session && session.created ? session.created : now,
      updated: now,
      active: (typeof workbook !== 'undefined' && workbook) ? workbook.active : 0,
      page: (typeof pageSetup !== 'undefined') ? pageSetup : null,
      settings: {},
      sheets: sheets
    };
  }
  function flagIndexes(flags) {
    var out = [], i;
    if (!flags) return out;
    for (i = 0; i < flags.length; i++) if (flags[i]) out.push(i);
    return out;
  }
  function blankDoc(doc) {
    if (!doc || !doc.sheets || doc.sheets.length !== 1) return false;
    var s = doc.sheets[0];
    var page = Hos.pageOf(doc.page);
    var def = Hos.pageOf({});
    if (s.cells && s.cells.length) return false;
    if (s.merges && s.merges.length) return false;
    if (s.charts && s.charts.length) return false;
    if (s.condFormats && s.condFormats.length) return false;
    if (s.validations && s.validations.length) return false;
    if (s.hiddenRows && s.hiddenRows.length) return false;
    if (s.hiddenCols && s.hiddenCols.length) return false;
    if (s.freeze && (s.freeze.rows || s.freeze.cols)) return false;
    if (s.filters && s.filters.on) return false;
    if (hasSize(s.widths) || hasSize(s.heights)) return false;
    if (page.orientation !== def.orientation || page.paper !== def.paper || page.margins !== def.margins) return false;
    if (page.gridlines !== def.gridlines || page.headings !== def.headings || page.fit !== def.fit) return false;
    return true;
  }
  function hasSize(list) {
    var i;
    if (!list) return false;
    for (i = 0; i < list.length; i++) if (list[i] != null) return true;
    return false;
  }

  function applyDoc(doc) {
    var lim = limits();
    var used = {}, sheets = [], i, raw, s, r, c, cell, act, sel;
    for (i = 0; i < doc.sheets.length && i < lim.max; i++) {
      raw = doc.sheets[i];
      s = makeSheet(raw.name || ('Sheet' + (i + 1)));
      s.name = uniqueName(s.name, used);
      for (r = 0; r < raw.cells.length; r++) {
        cell = raw.cells[r];
        if (cell.r < 0 || cell.c < 0 || cell.r >= lim.rows || cell.c >= lim.cols) continue;
        s.cells[cell.r][cell.c].formula = cell.formula || '';
        s.cells[cell.r][cell.c].value = cell.value == null ? '' : cell.value;
        s.cells[cell.r][cell.c].style = styleFull(cell.style);
      }
      for (c = 0; c < lim.cols; c++) s.widths[c] = raw.widths[c];
      if (!s.heights) s.heights = [];
      for (r = 0; r < lim.rows; r++) s.heights[r] = raw.heights[r];
      s.hiddenRows = flagList(raw.hiddenRows, lim.rows);
      s.hiddenCols = flagList(raw.hiddenCols, lim.cols);
      s.freeze = { rows: raw.freeze.rows, cols: raw.freeze.cols };
      s.sel = raw.sel.slice();
      s.filters = raw.filters;
      s.validations = raw.validations;
      s.merges = raw.merges;
      s.condFormats = raw.condFormats;
      s.charts = raw.charts;
      sheets.push(s);
    }
    act = doc.active | 0;
    if (act < 0 || act >= sheets.length) act = 0;
    workbook = { sheets: sheets, active: act };
    bindActiveSheet();
    sel = sheets[act].sel;
    if (sel && sel.length >= 4) {
      selR = sel[0]; selC = sel[1]; extR = sel[2]; extC = sel[3];
      selMode = sel[4] || 'cell';
    }
    if (typeof pageSetup !== 'undefined') pageSetup = Hos.pageOf(doc.page);
    if (typeof applyPageSetup === 'function') applyPageSetup();
    if (typeof UNDO !== 'undefined') {
      UNDO.past = [];
      UNDO.future = [];
      if (typeof undoButtons === 'function') undoButtons();
    }
    if (typeof recalcAll === 'function') recalcAll();
    if (typeof applyFilters === 'function') {
      for (i = 0; i < sheets.length; i++) applyFilters(i);
    }
    if (typeof applyHiddenAndFreeze === 'function') applyHiddenAndFreeze();
    if (typeof paintAll === 'function') paintAll();
    if (typeof applyWidths === 'function') applyWidths();
    if (typeof renderSheetTabs === 'function') renderSheetTabs();
    if (typeof renderCharts === 'function') renderCharts();
    if (typeof dataRenderFilterButtons === 'function') dataRenderFilterButtons();
    if (typeof updateStats === 'function') updateStats();
    if (typeof highlightSel === 'function') highlightSel();
    if (typeof syncStyleUi === 'function') syncStyleUi();
  }

  /* Used by the .hos smoke test to restore a parsed file into the live workbook. */
  Hos.applyToWorkbook = applyDoc;

  function install() {
    if (!root.OfficeNative) return;
    var stemName = 'Sheet';
    var session = root.OfficeNative.create({
      ext: 'hos',
      label: 'Hub Office Spreadsheet',
      fallback: 'Sheet',
      max: Hos.MAX,
      capture: function (s) { return liveCapture(s); },
      pack: Hos.pack,
      parse: Hos.parse,
      apply: function (doc) { applyDoc(doc); },
      toast: function (msg) {
        if (typeof setStatus === 'function') setStatus(msg);
        if (root.OfficeNotify && root.OfficeNotify.show) root.OfficeNotify.show(msg);
      },
      currentName: function () { return stemName; },
      setName: function (name) {
        if (root.SHEET_HUB && root.SHEET_HUB.setTitle) root.SHEET_HUB.setTitle(name);
        else stemName = Hos.stem(name);
      },
      noteSaved: function (res) {
        var verb = res && res.verb ? res.verb : 'Saved';
        if (typeof setStatus === 'function') setStatus(verb === 'Saved' && typeof TXT !== 'undefined' ? TXT.saved : verb);
        if (root.OfficeNotify && root.OfficeNotify.saveOk) root.OfficeNotify.saveOk('spreadsheet');
      },
      noteFailed: function (err) {
        if (typeof setStatus === 'function' && typeof TXT !== 'undefined') setStatus(TXT.saveFailed);
        if (root.OfficeNotify && root.OfficeNotify.saveProblem) root.OfficeNotify.saveProblem('spreadsheet', err);
      },
      clash: function (name, free) { return root.OfficeNative.clashDialog(name, free); },
      promptName: function (cur) {
        if (!root.OfficeDialog || !root.OfficeDialog.prompt) return Promise.resolve(cur);
        return root.OfficeDialog.prompt({ title: 'Save as', label: 'Name', value: cur, okLabel: 'Save' });
      },
      isBlank: function (doc) {
        try { return blankDoc(Hos.pack(doc)); }
        catch (e) { return false; }
      }
    });
    session.stemName = function () { return stemName; };
    session.noteStem = function (name) { stemName = Hos.stem(name); };
    session.prepareNew = function () {
      session.detach();
      if (typeof saveStore === 'function') clearTimeout(saveStore._t);
      return session.list().then(function (rows) {
        var base = 'Sheet', name = base, n = 2, taken = {};
        rows.forEach(function (row) { taken[session.stem(row.name).toLowerCase()] = true; });
        while (taken[name.toLowerCase()]) { name = base + '_' + (n++); }
        if (root.SHEET_HUB && root.SHEET_HUB.setTitle) root.SHEET_HUB.setTitle(name);
        else stemName = name;
        return name;
      });
    };
    root.SHEET_HOS = session;

    function flush() {
      if (typeof saveStore === 'function') clearTimeout(saveStore._t);
      session.autosave();
    }
    if (typeof SHEET_INIT !== 'undefined') {
      SHEET_INIT.push(function () {
        session.bind();
        var openBtn = document.getElementById('btn-open-hos');
        var inp = document.getElementById('hos-file');
        if (openBtn && inp) {
          openBtn.addEventListener('click', function () { inp.value = ''; inp.click(); });
          inp.addEventListener('change', function () {
            if (inp.files && inp.files[0]) session.openFile(inp.files[0], null);
          });
        }
        var saveBtn = document.getElementById('btn-save');
        var saveAsBtn = document.getElementById('btn-save-as');
        if (saveBtn) saveBtn.addEventListener('click', function () {
          if (typeof saveStore === 'function') clearTimeout(saveStore._t);
          session.save({ explicit: true });
        });
        if (saveAsBtn) saveAsBtn.addEventListener('click', function () {
          if (typeof saveStore === 'function') clearTimeout(saveStore._t);
          session.save({ explicit: true, saveAs: true });
        });
        function hasFile(e) {
          return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1;
        }
        document.addEventListener('dragover', function (e) { if (hasFile(e)) e.preventDefault(); });
        document.addEventListener('drop', function (e) {
          if (!hasFile(e)) return;
          var f = e.dataTransfer.files && e.dataTransfer.files[0];
          if (session.isFile(f)) { e.preventDefault(); session.openFile(f, null); }
        });
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'hidden') flush();
        });
        window.addEventListener('pagehide', flush);
        window.addEventListener('beforeunload', flush);
        session.start();
      });
    }
  }

  if (typeof module === 'object' && module.exports) module.exports = Hos;
  if (root) {
    root.SHEET_HOS_FORMAT = Hos;
    if (root.document) install();
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
