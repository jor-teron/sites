/* ============================================================
   FILE: tables_hot.js
   ROLE: HOT1 native .hot file. One UTF-8 JSON document:
         format "hot", version 1. Every table (sheet-tab order),
         columns with types, rows with stable ids, Link columns
         (backlinks are calculated from those ids), each tab's
         Grid/Cards view, column widths, and file-owned settings
         (theme). Search, filters and sort stay on this tab only.
         In the Hub, Save, Save As and autosave write Local drive
         Documents (shared/fs, the Files app disk) through
         ../shared/office-native.js. Outside the Hub, Save uses
         the save picker or a download.
         (before HOT1) the native copy was localStorage tables-v1.
         That key is not read and not migrated. saveTo / loadFrom
         stay in tables_model.js for the TB1 / TB2 / TB4 tests.
   ============================================================ */
(function (root) {
  'use strict';

  var Hot = {};
  Hot.FORMAT = 'hot';
  Hot.VERSION = 1;
  Hot.MAX = 48 * 1024 * 1024;
  Hot.WIDTH_MIN = 72;
  Hot.WIDTH_MAX = 480;

  var TYPES = ['text', 'number', 'date', 'yesno', 'choice', 'link'];
  var ModelRef = null;

  function fail(msg) {
    var e = new Error(msg);
    e.userMessage = msg;
    throw e;
  }
  function model() {
    if (root && root.TablesModel) return root.TablesModel;
    if (ModelRef) return ModelRef;
    if (typeof require === 'function') {
      try { ModelRef = require('./tables_model.js'); } catch (e1) { ModelRef = null; }
    }
    return ModelRef;
  }
  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function normalizeType(type) {
    var M = model();
    if (M && M.TYPES) {
      type = String(type || '').toLowerCase();
      return M.TYPES.indexOf(type) === -1 ? 'text' : type;
    }
    type = String(type || '').toLowerCase();
    return TYPES.indexOf(type) === -1 ? 'text' : type;
  }
  function cleanOptions(options) {
    var M = model();
    if (M && M.cleanOptions) return M.cleanOptions(options);
    if (!options || !options.length) return [];
    return options;
  }
  function widthOf(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    if (!isFinite(n)) return null;
    n = Math.round(n);
    if (n < Hot.WIDTH_MIN) n = Hot.WIDTH_MIN;
    if (n > Hot.WIDTH_MAX) n = Hot.WIDTH_MAX;
    return n;
  }
  function viewOf(v) {
    return v === 'cards' ? 'cards' : 'grid';
  }
  /* File-owned options. Unknown keys are dropped. Version 1 keeps the theme. */
  Hot.settingsOf = function settingsOf(s) {
    s = (s && typeof s === 'object' && !Array.isArray(s)) ? s : {};
    var theme = s.theme === 'light' || s.theme === 'dark' ? s.theme : 'auto';
    return { theme: theme };
  };

  Hot.stem = function stem(name) {
    if (root && root.OfficeNative && root.OfficeNative.stem) return root.OfficeNative.stem(name, 'hot', 'Tables');
    var s = String(name || '').replace(/\.hot$/i, '');
    s = s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) s = 'Tables';
    if (s.length > 180) s = s.slice(0, 180).trim();
    return s;
  };
  Hot.fileName = function fileName(name) { return Hot.stem(name) + '.hot'; };
  Hot.isHot = function isHot(f) { return !!f && /\.hot$/i.test(f.name || ''); };

  function packColumn(col) {
    col = col || {};
    var c = {
      id: col.id ? String(col.id) : '',
      name: String(col.name == null ? '' : col.name).trim() || 'Column',
      type: normalizeType(col.type),
      width: widthOf(col.width)
    };
    if (!c.id) c.id = 'c-' + c.name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12);
    if (c.type === 'choice') c.options = cleanOptions(col.options);
    if (c.type === 'link') {
      c.linkTable = col.linkTable ? String(col.linkTable) : '';
      c.multiple = !!col.multiple;
    }
    return c;
  }
  function packCell(col, value) {
    if (value == null || value === '') return null;
    if (col.type === 'link') {
      if (Array.isArray(value)) {
        var ids = [];
        var seen = {};
        var i;
        for (i = 0; i < value.length; i++) {
          if (value[i] == null || value[i] === '') continue;
          var id = String(value[i]);
          if (seen[id]) continue;
          seen[id] = 1;
          ids.push(id);
        }
        return ids.length ? ids : null;
      }
      return String(value);
    }
    return value;
  }
  function packTable(raw, index) {
    raw = raw || {};
    var columns = [];
    var srcCols = Array.isArray(raw.columns) ? raw.columns : [];
    var i;
    for (i = 0; i < srcCols.length; i++) columns.push(packColumn(srcCols[i]));
    var seenCol = {};
    for (i = 0; i < columns.length; i++) {
      if (seenCol[columns[i].id]) columns[i].id = columns[i].id + '-' + i;
      seenCol[columns[i].id] = 1;
    }
    var rows = [];
    var srcRows = Array.isArray(raw.rows) ? raw.rows : [];
    var seenRow = {};
    for (i = 0; i < srcRows.length; i++) {
      var src = srcRows[i];
      if (!src || typeof src !== 'object') continue;
      var rowId = src.id ? String(src.id) : ('r-' + (i + 1));
      if (seenRow[rowId]) rowId = rowId + '-' + i;
      seenRow[rowId] = 1;
      var cells = {};
      var srcCells = src.cells && typeof src.cells === 'object' ? src.cells : {};
      var c;
      for (c = 0; c < columns.length; c++) {
        var col = columns[c];
        cells[col.id] = packCell(col, srcCells[col.id]);
      }
      rows.push({ id: rowId, cells: cells });
    }
    return {
      id: raw.id ? String(raw.id) : ('t-' + (index + 1)),
      name: String(raw.name == null ? '' : raw.name).trim() || 'Table',
      view: viewOf(raw.view),
      columns: columns,
      rows: rows
    };
  }

  /* Build the on-disk object. Extra fields are not kept. Backlinks are not
     stored: they are calculated from Link columns when the file is opened. */
  Hot.pack = function pack(doc) {
    doc = doc || {};
    var now = Date.now();
    var tables = [];
    var src = Array.isArray(doc.tables) ? doc.tables : [];
    var i;
    var seen = {};
    for (i = 0; i < src.length; i++) {
      var table = packTable(src[i], i);
      if (seen[table.id]) table.id = table.id + '-' + i;
      seen[table.id] = 1;
      tables.push(table);
    }
    var activeId = doc.activeId ? String(doc.activeId) : '';
    if (!seen[activeId]) activeId = tables.length ? tables[0].id : null;
    var settings = Hot.settingsOf(doc.settings);
    if (!doc.settings && (doc.theme === 'light' || doc.theme === 'dark' || doc.theme === 'auto')) {
      settings = Hot.settingsOf({ theme: doc.theme });
    }
    return {
      format: Hot.FORMAT,
      version: Hot.VERSION,
      name: Hot.stem(doc.name || 'Tables'),
      created: num(doc.created) || now,
      updated: num(doc.updated) || now,
      activeId: activeId,
      settings: settings,
      tables: tables
    };
  };
  Hot.stringify = function stringify(doc) {
    return JSON.stringify(Hot.pack(doc), null, 2);
  };

  /* A tables-v1 localStorage record has no format and is refused. */
  Hot.parse = function parse(text) {
    if (typeof text !== 'string') fail('This is not a .hot file.');
    if (text.length > Hot.MAX) fail('This .hot file is too large.');
    var data;
    try { data = JSON.parse(text); }
    catch (e) { fail('This .hot file could not be read.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('This is not a .hot file.');
    if (data.format !== Hot.FORMAT) fail('This is not a Hub Office Tables .hot file.');
    if (data.version !== Hot.VERSION) fail('This .hot file is version ' + data.version + '. Tables reads version 1.');
    if (!Array.isArray(data.tables)) fail('This .hot file has no tables.');
    var built = Hot.toDb(data);
    var packed = Hot.pack({
      name: data.name,
      created: num(data.created),
      updated: num(data.updated),
      activeId: built.db.activeId,
      settings: { theme: built.db.theme },
      tables: built.packedTables
    });
    packed.created = num(data.created);
    packed.updated = num(data.updated);
    packed.name = Hot.stem(data.name || 'Tables');
    return packed;
  };

  /* Model db plus the file-only fields Model.load drops (view, width). */
  Hot.toDb = function toDb(doc) {
    var packed = Hot.pack(doc || {});
    var M = model();
    var views = {};
    var i;
    var c;
    if (!M || !M.load) {
      for (i = 0; i < packed.tables.length; i++) views[packed.tables[i].id] = packed.tables[i].view;
      return { db: { version: 1, activeId: packed.activeId, theme: packed.settings.theme, tables: packed.tables }, views: views, packedTables: packed.tables };
    }
    var db = M.load({
      version: 1,
      activeId: packed.activeId,
      theme: packed.settings.theme,
      tables: packed.tables
    });
    for (i = 0; i < db.tables.length; i++) {
      var src = packed.tables[i] || {};
      views[db.tables[i].id] = viewOf(src.view);
      db.tables[i].view = views[db.tables[i].id];
      for (c = 0; c < db.tables[i].columns.length; c++) {
        var sc = (src.columns || [])[c] || {};
        db.tables[i].columns[c].width = widthOf(sc.width);
      }
    }
    var packedTables = [];
    for (i = 0; i < db.tables.length; i++) {
      var t = db.tables[i];
      packedTables.push({
        id: t.id,
        name: t.name,
        view: views[t.id],
        columns: t.columns,
        rows: t.rows
      });
    }
    return { db: db, views: views, packedTables: packedTables };
  };

  Hot.isBlank = function isBlank(doc) {
    var packed;
    try { packed = Hot.pack(doc); }
    catch (e) { return false; }
    if (!packed.settings || packed.settings.theme !== 'auto') return false;
    if (!packed.tables || packed.tables.length !== 1) return false;
    var t = packed.tables[0];
    if (t.name !== 'Table 1' || t.view !== 'grid') return false;
    if (t.rows && t.rows.length) return false;
    if (!t.columns || t.columns.length !== 4) return false;
    var expect = [['Name', 'text'], ['Amount', 'number'], ['Date', 'date'], ['Done', 'yesno']];
    var i;
    for (i = 0; i < 4; i++) {
      if (t.columns[i].name !== expect[i][0] || t.columns[i].type !== expect[i][1]) return false;
      if (t.columns[i].width != null) return false;
    }
    return true;
  };

  function install(hooks) {
    hooks = hooks || {};
    if (!root.OfficeNative) return null;
    var stemName = 'Tables';
    var session = root.OfficeNative.create({
      ext: 'hot',
      label: 'Hub Office Tables',
      fallback: 'Tables',
      max: Hot.MAX,
      capture: function (s) {
        var doc = hooks.capture ? hooks.capture(s) : { tables: [] };
        if (!doc || typeof doc !== 'object') doc = { tables: [] };
        doc.name = stemName;
        if (!doc.created && s && s.created) doc.created = s.created;
        return doc;
      },
      pack: Hot.pack,
      parse: Hot.parse,
      apply: function (doc) { if (hooks.apply) hooks.apply(doc); },
      toast: function (msg) { if (hooks.toast) hooks.toast(msg); },
      currentName: function () { return stemName; },
      setName: function (name) {
        stemName = Hot.stem(name);
        if (hooks.setName) hooks.setName(stemName);
      },
      noteSaved: function (res) { if (hooks.noteSaved) hooks.noteSaved(res); },
      noteFailed: function (err) { if (hooks.noteFailed) hooks.noteFailed(err); },
      clash: function (name, free) { return root.OfficeNative.clashDialog(name, free); },
      promptName: function (cur) {
        if (!root.OfficeDialog || !root.OfficeDialog.prompt) return Promise.resolve(cur);
        return root.OfficeDialog.prompt({ title: 'Save as', label: 'Name', value: cur, okLabel: 'Save' });
      },
      isBlank: function (doc) {
        try { return Hot.isBlank(doc); }
        catch (e2) { return false; }
      }
    });
    session.stemName = function () { return stemName; };
    session.noteStem = function (name) { stemName = Hot.stem(name); };
    root.TABLES_HOT = session;

    if (typeof document === 'undefined') return session;
    function clearPending() { if (hooks.beforeSave) hooks.beforeSave(); }
    var openBtn = document.getElementById('btn-open-hot');
    var inp = document.getElementById('hot-file');
    if (openBtn && inp) {
      openBtn.addEventListener('click', function () { inp.value = ''; inp.click(); });
      inp.addEventListener('change', function () {
        if (inp.files && inp.files[0]) session.openFile(inp.files[0], null);
      });
    }
    var saveBtn = document.getElementById('btn-save');
    var saveAsBtn = document.getElementById('btn-save-as');
    if (saveBtn) saveBtn.addEventListener('click', function () {
      clearPending();
      session.save({ explicit: true });
    });
    if (saveAsBtn) saveAsBtn.addEventListener('click', function () {
      clearPending();
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
      if (document.visibilityState === 'hidden') {
        clearPending();
        session.autosave();
      }
    });
    window.addEventListener('pagehide', function () {
      clearPending();
      session.autosave();
    });
    session.bind();
    session.start();
    return session;
  }
  Hot.install = install;

  if (typeof module === 'object' && module.exports) module.exports = Hot;
  if (root) root.TablesHot = Hot;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
