/*
 * Tables TB1 — pure data model (no DOM).
 * Used by tables.js in the browser and by test-tb1.js in Node.
 * Storage key: tables-v1. First release; there is no older key to migrate.
 * Legacy: cell values that fail their column type are dropped, never stored.
 */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'tables-v1';
  var VERSION = 1;
  var TYPES = ['text', 'number', 'date', 'yesno', 'choice'];
  var TYPE_LABELS = {
    text: 'Text',
    number: 'Number',
    date: 'Date',
    yesno: 'Yes/No',
    choice: 'Choice'
  };

  var seq = 0;
  function uid(prefix) {
    seq += 1;
    return prefix + '-' + seq.toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function normalizeType(type) {
    type = String(type || '').toLowerCase();
    return TYPES.indexOf(type) === -1 ? 'text' : type;
  }

  function cleanOptions(options) {
    var list = options;
    if (typeof list === 'string') list = list.split(/\r?\n/);
    if (!list || !list.length) return [];
    var out = [];
    var seen = {};
    for (var i = 0; i < list.length; i++) {
      var s = String(list[i] == null ? '' : list[i]).trim();
      if (!s) continue;
      var key = s.toLowerCase();
      if (seen[key]) continue;
      seen[key] = 1;
      out.push(s);
    }
    return out;
  }

  function parseNumber(raw) {
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;
    if (raw == null) return null;
    var s = String(raw).trim().replace(/^\+/, '').replace(/,/g, '');
    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }

  function parseDate(raw) {
    if (raw == null) return null;
    var s = String(raw).trim();
    var y;
    var mo;
    var d;
    var iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (iso) {
      y = +iso[1];
      mo = +iso[2];
      d = +iso[3];
    } else {
      var dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
      if (!dmy) return null;
      d = +dmy[1];
      mo = +dmy[2];
      y = +dmy[3];
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return y + '-' + pad2(mo) + '-' + pad2(d);
  }

  function parseYesNo(raw) {
    if (typeof raw === 'boolean') return raw;
    if (raw == null) return null;
    var s = String(raw).trim().toLowerCase();
    if (s === 'yes' || s === 'y' || s === 'true') return true;
    if (s === 'no' || s === 'n' || s === 'false') return false;
    return null;
  }

  function isBlank(value) {
    return value == null || value === '';
  }

  function validate(type, raw, options) {
    type = normalizeType(type);
    if (isBlank(raw)) return { ok: true, value: null };
    if (typeof raw === 'string' && raw.trim() === '') return { ok: true, value: null };
    if (type === 'text') return { ok: true, value: String(raw) };
    if (type === 'number') {
      var n = parseNumber(raw);
      if (n == null) return { ok: false, message: 'Enter a number' };
      return { ok: true, value: n };
    }
    if (type === 'date') {
      var d = parseDate(raw);
      if (!d) return { ok: false, message: 'Use a date like 2026-11-11' };
      return { ok: true, value: d };
    }
    if (type === 'yesno') {
      var b = parseYesNo(raw);
      if (b == null) return { ok: false, message: 'Choose yes or no' };
      return { ok: true, value: b };
    }
    var choice = String(raw).trim();
    var opts = options || [];
    var match = null;
    for (var i = 0; i < opts.length; i++) {
      if (opts[i] === choice || opts[i].toLowerCase() === choice.toLowerCase()) {
        match = opts[i];
        break;
      }
    }
    if (match == null) return { ok: false, message: 'Pick one of the choices' };
    return { ok: true, value: match };
  }

  function display(type, value) {
    if (isBlank(value)) return '';
    type = normalizeType(type);
    if (type === 'yesno') return value === true ? 'Yes' : 'No';
    if (type === 'number') {
      if (typeof value === 'number' && isFinite(value)) {
        var s = String(value);
        if (s.indexOf('e') !== -1 || s.indexOf('E') !== -1) return String(Math.round(value * 1e10) / 1e10);
        return s;
      }
    }
    return String(value);
  }

  function column(name, type, options) {
    var c = {
      id: uid('c'),
      name: String(name == null ? '' : name).trim() || 'Column',
      type: normalizeType(type)
    };
    if (c.type === 'choice') c.options = cleanOptions(options);
    return c;
  }

  function makeRow(cells) {
    return { id: uid('r'), cells: cells || {} };
  }

  function createTable(name, columns) {
    var cols = columns && columns.length ? columns : [
      column('Name', 'text'),
      column('Amount', 'number'),
      column('Date', 'date'),
      column('Done', 'yesno')
    ];
    return {
      id: uid('t'),
      name: String(name == null ? '' : name).trim() || 'Table',
      columns: cols,
      rows: []
    };
  }

  function blankDb() {
    var table = createTable('Table 1');
    return { version: VERSION, activeId: table.id, theme: 'auto', tables: [table] };
  }

  function findTable(db, id) {
    if (!db || !db.tables) return null;
    for (var i = 0; i < db.tables.length; i++) {
      if (db.tables[i].id === id) return db.tables[i];
    }
    return null;
  }

  function activeTable(db) {
    return findTable(db, db && db.activeId) || (db && db.tables && db.tables[0]) || null;
  }

  function findColumn(table, id) {
    if (!table) return null;
    for (var i = 0; i < table.columns.length; i++) {
      if (table.columns[i].id === id) return table.columns[i];
    }
    return null;
  }

  function findRow(table, id) {
    if (!table) return null;
    for (var i = 0; i < table.rows.length; i++) {
      if (table.rows[i].id === id) return table.rows[i];
    }
    return null;
  }

  function nextTableName(db) {
    var n = (db.tables ? db.tables.length : 0) + 1;
    var name = 'Table ' + n;
    var guard = 0;
    while (guard < 1000 && db.tables.some(function (t) { return t.name === name; })) {
      n += 1;
      name = 'Table ' + n;
      guard += 1;
    }
    return name;
  }

  function addTable(db, name) {
    var table = createTable(name || nextTableName(db));
    db.tables.push(table);
    db.activeId = table.id;
    return table;
  }

  function renameTable(db, id, name) {
    var table = findTable(db, id);
    if (!table) return { ok: false, message: 'No such table' };
    var next = String(name == null ? '' : name).trim();
    if (!next) return { ok: false, message: 'Please enter a name' };
    table.name = next;
    return { ok: true, table: table };
  }

  function deleteTable(db, id) {
    var next = [];
    var found = false;
    for (var i = 0; i < db.tables.length; i++) {
      if (db.tables[i].id === id) found = true;
      else next.push(db.tables[i]);
    }
    if (!found) return { ok: false, message: 'No such table' };
    db.tables = next;
    if (db.activeId === id) db.activeId = next.length ? next[0].id : null;
    return { ok: true };
  }

  function addColumn(table, name, type, options) {
    var col = column(name, type, options);
    table.columns.push(col);
    return col;
  }

  function renameColumn(table, colId, name) {
    var col = findColumn(table, colId);
    if (!col) return { ok: false, message: 'No such column' };
    var next = String(name == null ? '' : name).trim();
    if (!next) return { ok: false, message: 'Please enter a name' };
    col.name = next;
    return { ok: true, column: col };
  }

  function deleteColumn(table, colId) {
    var next = [];
    var found = false;
    for (var i = 0; i < table.columns.length; i++) {
      if (table.columns[i].id === colId) found = true;
      else next.push(table.columns[i]);
    }
    if (!found) return { ok: false, message: 'No such column' };
    table.columns = next;
    for (var r = 0; r < table.rows.length; r++) delete table.rows[r].cells[colId];
    return { ok: true };
  }

  function countRetypeClears(table, colId, type, options) {
    var col = findColumn(table, colId);
    if (!col) return 0;
    type = normalizeType(type);
    var opts = type === 'choice' ? cleanOptions(options) : [];
    var cleared = 0;
    for (var i = 0; i < table.rows.length; i++) {
      var value = table.rows[i].cells[col.id];
      if (isBlank(value)) continue;
      var res = validate(type, display(col.type, value), opts);
      if (!res.ok) cleared += 1;
    }
    return cleared;
  }

  function setColumnType(table, colId, type, options) {
    var col = findColumn(table, colId);
    if (!col) return { ok: false, message: 'No such column' };
    type = normalizeType(type);
    var opts = type === 'choice' ? cleanOptions(options) : [];
    var cleared = 0;
    for (var i = 0; i < table.rows.length; i++) {
      var row = table.rows[i];
      var value = row.cells[col.id];
      if (isBlank(value)) {
        row.cells[col.id] = null;
        continue;
      }
      var res = validate(type, display(col.type, value), opts);
      if (!res.ok) {
        row.cells[col.id] = null;
        cleared += 1;
      } else {
        row.cells[col.id] = res.value;
      }
    }
    col.type = type;
    if (type === 'choice') col.options = opts;
    else delete col.options;
    return { ok: true, cleared: cleared };
  }

  function addRow(table, rawCells) {
    var cells = {};
    for (var i = 0; i < table.columns.length; i++) {
      var col = table.columns[i];
      cells[col.id] = null;
      if (!rawCells || !Object.prototype.hasOwnProperty.call(rawCells, col.id)) continue;
      var res = validate(col.type, rawCells[col.id], col.options);
      cells[col.id] = res.ok ? res.value : null;
    }
    var row = makeRow(cells);
    table.rows.push(row);
    return row;
  }

  function deleteRows(table, ids) {
    var drop = {};
    for (var i = 0; i < ids.length; i++) drop[ids[i]] = 1;
    var next = [];
    var removed = 0;
    for (var r = 0; r < table.rows.length; r++) {
      if (drop[table.rows[r].id]) removed += 1;
      else next.push(table.rows[r]);
    }
    table.rows = next;
    return removed;
  }

  function setCell(table, rowId, colId, raw) {
    var col = findColumn(table, colId);
    var row = findRow(table, rowId);
    if (!col || !row) return { ok: false, message: 'That cell is not in this table' };
    var before = row.cells[col.id];
    var res = validate(col.type, raw, col.options);
    if (!res.ok) return { ok: false, message: res.message, value: before };
    row.cells[col.id] = res.value;
    return { ok: true, value: res.value };
  }

  function rowMatchesSearch(table, row, query) {
    var q = String(query == null ? '' : query).trim().toLowerCase();
    if (!q) return true;
    for (var i = 0; i < table.columns.length; i++) {
      var col = table.columns[i];
      var text = display(col.type, row.cells[col.id]).toLowerCase();
      if (text.indexOf(q) !== -1) return true;
    }
    return false;
  }

  function cellMatchesFilter(col, value, filter) {
    if (!filter || !filter.op) return true;
    var op = filter.op;
    if (op === 'checked') return value === true;
    if (op === 'unchecked') return value !== true;
    var raw = filter.value;
    if (raw == null || String(raw).trim() === '') return true;
    if (op === 'contains') {
      return display(col.type, value).toLowerCase().indexOf(String(raw).trim().toLowerCase()) !== -1;
    }
    if (op === 'equals') {
      if (col.type === 'number') {
        var n = parseNumber(raw);
        return n != null && value === n;
      }
      if (col.type === 'date') {
        var d = parseDate(raw);
        return d != null && value === d;
      }
      if (col.type === 'yesno') {
        var b = parseYesNo(raw);
        return b != null && value === b;
      }
      return display(col.type, value).toLowerCase() === String(raw).trim().toLowerCase();
    }
    if (op === 'gt' || op === 'lt') {
      if (col.type !== 'number' && col.type !== 'date') return true;
      if (isBlank(value)) return false;
      var bound = col.type === 'number' ? parseNumber(raw) : parseDate(raw);
      if (bound == null) return true;
      if (op === 'gt') return value > bound;
      return value < bound;
    }
    return true;
  }

  function compareValues(type, a, b) {
    if (type === 'number' || type === 'date') {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    }
    if (type === 'yesno') return (a === true ? 1 : 0) - (b === true ? 1 : 0);
    return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
  }

  function sortRows(table, rows, colId, dir) {
    var col = findColumn(table, colId);
    if (!col) return rows.slice();
    var sign = dir === 'desc' ? -1 : 1;
    var indexed = rows.map(function (row, index) { return { row: row, index: index }; });
    indexed.sort(function (A, B) {
      var av = A.row.cells[col.id];
      var bv = B.row.cells[col.id];
      var aEmpty = isBlank(av);
      var bEmpty = isBlank(bv);
      if (aEmpty && bEmpty) return A.index - B.index;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      var cmp = compareValues(col.type, av, bv);
      if (cmp === 0) return A.index - B.index;
      return cmp * sign;
    });
    return indexed.map(function (item) { return item.row; });
  }

  function visibleRows(table, query, filters, sort) {
    if (!table) return [];
    var list = filters || [];
    var rows = table.rows.filter(function (row) {
      if (!rowMatchesSearch(table, row, query)) return false;
      for (var i = 0; i < list.length; i++) {
        var filter = list[i];
        var col = findColumn(table, filter.colId);
        if (!col) continue;
        if (!cellMatchesFilter(col, row.cells[col.id], filter)) return false;
      }
      return true;
    });
    if (sort && sort.colId) rows = sortRows(table, rows, sort.colId, sort.dir);
    return rows;
  }

  function opsFor(type) {
    type = normalizeType(type);
    if (type === 'number' || type === 'date') {
      return [
        { op: 'contains', label: 'contains' },
        { op: 'equals', label: 'equals' },
        { op: 'gt', label: 'greater than' },
        { op: 'lt', label: 'less than' }
      ];
    }
    if (type === 'yesno') {
      return [
        { op: 'checked', label: 'is checked' },
        { op: 'unchecked', label: 'is not checked' }
      ];
    }
    return [
      { op: 'contains', label: 'contains' },
      { op: 'equals', label: 'equals' }
    ];
  }

  function csvField(value) {
    var s = value == null ? '' : String(value);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function parseCsv(text) {
    if (text == null) return [];
    text = String(text);
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (inQuotes) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += c;
        }
        continue;
      }
      if (c === '"') {
        inQuotes = true;
        continue;
      }
      if (c === ',') {
        row.push(field);
        field = '';
        continue;
      }
      if (c === '\n' || c === '\r') {
        if (c === '\r' && text.charAt(i + 1) === '\n') i += 1;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        continue;
      }
      field += c;
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    if (rows.length) {
      var last = rows[rows.length - 1];
      if (last.length === 1 && last[0] === '') rows.pop();
    }
    return rows;
  }

  function toCsv(table) {
    var lines = [];
    lines.push(table.columns.map(function (col) { return csvField(col.name); }).join(','));
    for (var r = 0; r < table.rows.length; r++) {
      var row = table.rows[r];
      lines.push(table.columns.map(function (col) {
        return csvField(display(col.type, row.cells[col.id]));
      }).join(','));
    }
    return lines.join('\n') + (lines.length ? '\n' : '');
  }

  function uniqueHeaders(headers) {
    var seen = {};
    return headers.map(function (header, index) {
      var base = String(header == null ? '' : header).trim() || ('Column ' + (index + 1));
      var name = base;
      var n = 2;
      while (seen[name.toLowerCase()]) {
        name = base + ' ' + n;
        n += 1;
      }
      seen[name.toLowerCase()] = 1;
      return name;
    });
  }

  function guessType(values) {
    var nonempty = [];
    for (var i = 0; i < values.length; i++) {
      var s = values[i] == null ? '' : String(values[i]).trim();
      if (s) nonempty.push(s);
    }
    if (!nonempty.length) return { type: 'text', options: [] };
    function all(fn) {
      for (var j = 0; j < nonempty.length; j++) if (!fn(nonempty[j])) return false;
      return true;
    }
    if (all(function (v) { return /^(yes|no|y|n|true|false)$/i.test(v); })) {
      return { type: 'yesno', options: [] };
    }
    if (all(function (v) { return parseDate(v) != null && (/^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}$/.test(v)); })) {
      return { type: 'date', options: [] };
    }
    if (all(function (v) { return parseNumber(v) != null; })) return { type: 'number', options: [] };
    var uniq = [];
    for (var u = 0; u < nonempty.length; u++) {
      if (uniq.indexOf(nonempty[u]) === -1) uniq.push(nonempty[u]);
    }
    var short = true;
    for (var k = 0; k < uniq.length; k++) if (uniq[k].length > 20) short = false;
    if (nonempty.length >= 4 && uniq.length >= 2 && uniq.length <= 6 && uniq.length * 2 <= nonempty.length && short) {
      return { type: 'choice', options: uniq };
    }
    return { type: 'text', options: [] };
  }

  function previewCsv(text) {
    var grid = parseCsv(text);
    if (!grid.length) return { ok: false, message: 'That file is empty.' };
    var width = 0;
    for (var i = 0; i < grid.length; i++) if (grid[i].length > width) width = grid[i].length;
    if (!width) return { ok: false, message: 'That file has no columns.' };
    var header = grid[0].slice();
    while (header.length < width) header.push('');
    var headers = uniqueHeaders(header);
    var body = [];
    for (var r = 1; r < grid.length; r++) {
      var src = grid[r];
      var blank = true;
      var copy = [];
      for (var c = 0; c < width; c++) {
        var cell = src[c] == null ? '' : String(src[c]);
        if (cell.trim() !== '') blank = false;
        copy.push(cell);
      }
      if (!blank) body.push(copy);
    }
    var columns = headers.map(function (name, index) {
      var sampleValues = body.map(function (row) { return row[index]; });
      var guess = guessType(sampleValues);
      var sample = '';
      for (var s = 0; s < sampleValues.length; s++) {
        if (String(sampleValues[s]).trim()) { sample = String(sampleValues[s]).trim(); break; }
      }
      return { name: name, type: guess.type, options: guess.options, sample: sample };
    });
    return { ok: true, columns: columns, rows: body };
  }

  function tableFromPreview(preview, spec) {
    spec = spec || {};
    var defs = spec.columns || preview.columns;
    var cols = defs.map(function (def, index) {
      var fallback = preview.columns[index] || { name: 'Column', type: 'text', options: [] };
      return column(
        def.name != null ? def.name : fallback.name,
        def.type != null ? def.type : fallback.type,
        def.options != null ? def.options : fallback.options
      );
    });
    var table = createTable(spec.name || 'Imported', cols);
    var skipped = 0;
    var cap = spec.maxRows || 5000;
    var droppedRows = 0;
    for (var r = 0; r < preview.rows.length; r++) {
      if (table.rows.length >= cap) {
        droppedRows = preview.rows.length - r;
        break;
      }
      var src = preview.rows[r];
      var cells = {};
      for (var c = 0; c < cols.length; c++) {
        var raw = src[c] == null ? '' : src[c];
        var res = validate(cols[c].type, raw, cols[c].options);
        if (!res.ok) {
          cells[cols[c].id] = null;
          skipped += 1;
        } else {
          cells[cols[c].id] = res.value;
        }
      }
      table.rows.push(makeRow(cells));
    }
    return { table: table, skipped: skipped, droppedRows: droppedRows };
  }

  function serialize(db) {
    return JSON.stringify({
      version: VERSION,
      activeId: db.activeId || null,
      theme: db.theme === 'light' || db.theme === 'dark' ? db.theme : 'auto',
      tables: db.tables || []
    });
  }

  function normalizeTable(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var columns = [];
    var seenCol = {};
    var srcCols = Array.isArray(raw.columns) ? raw.columns : [];
    for (var i = 0; i < srcCols.length; i++) {
      var src = srcCols[i];
      if (!src || typeof src !== 'object') continue;
      var id = src.id ? String(src.id) : uid('c');
      if (seenCol[id]) id = uid('c');
      seenCol[id] = 1;
      var col = {
        id: id,
        name: String(src.name == null ? '' : src.name).trim() || 'Column',
        type: normalizeType(src.type)
      };
      if (col.type === 'choice') col.options = cleanOptions(src.options);
      columns.push(col);
    }
    var rows = [];
    var seenRow = {};
    var srcRows = Array.isArray(raw.rows) ? raw.rows : [];
    for (var r = 0; r < srcRows.length; r++) {
      var srcRow = srcRows[r];
      if (!srcRow || typeof srcRow !== 'object') continue;
      var rowId = srcRow.id ? String(srcRow.id) : uid('r');
      if (seenRow[rowId]) rowId = uid('r');
      seenRow[rowId] = 1;
      var cells = {};
      var srcCells = srcRow.cells && typeof srcRow.cells === 'object' ? srcRow.cells : {};
      for (var c = 0; c < columns.length; c++) {
        var col = columns[c];
        if (!Object.prototype.hasOwnProperty.call(srcCells, col.id)) {
          cells[col.id] = null;
          continue;
        }
        var res = validate(col.type, srcCells[col.id], col.options);
        cells[col.id] = res.ok ? res.value : null;
      }
      rows.push({ id: rowId, cells: cells });
    }
    return {
      id: raw.id ? String(raw.id) : uid('t'),
      name: String(raw.name == null ? '' : raw.name).trim() || 'Table',
      columns: columns,
      rows: rows
    };
  }

  function load(json) {
    var data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || typeof data !== 'object' || !Array.isArray(data.tables)) {
      throw new Error('Not a Tables save');
    }
    var tables = [];
    var seen = {};
    for (var i = 0; i < data.tables.length; i++) {
      var table = normalizeTable(data.tables[i]);
      if (!table) continue;
      if (seen[table.id]) table.id = uid('t');
      seen[table.id] = 1;
      tables.push(table);
    }
    var activeId = data.activeId ? String(data.activeId) : null;
    if (!seen[activeId]) activeId = tables.length ? tables[0].id : null;
    var theme = data.theme === 'light' || data.theme === 'dark' ? data.theme : 'auto';
    return { version: VERSION, activeId: activeId, theme: theme, tables: tables };
  }

  function saveTo(storage, db) {
    storage.setItem(STORAGE_KEY, serialize(db));
  }

  function loadFrom(storage) {
    var raw;
    try { raw = storage.getItem(STORAGE_KEY); }
    catch (e) { return { db: blankDb(), error: 'blocked' }; }
    if (raw == null || raw === '') return { db: blankDb(), error: null, empty: true };
    try { return { db: load(raw), error: null }; }
    catch (e) { return { db: blankDb(), error: 'damaged' }; }
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    VERSION: VERSION,
    TYPES: TYPES,
    TYPE_LABELS: TYPE_LABELS,
    blankDb: blankDb,
    createTable: createTable,
    column: column,
    activeTable: activeTable,
    findTable: findTable,
    findColumn: findColumn,
    findRow: findRow,
    nextTableName: nextTableName,
    addTable: addTable,
    renameTable: renameTable,
    deleteTable: deleteTable,
    addColumn: addColumn,
    renameColumn: renameColumn,
    deleteColumn: deleteColumn,
    countRetypeClears: countRetypeClears,
    setColumnType: setColumnType,
    addRow: addRow,
    deleteRows: deleteRows,
    setCell: setCell,
    validate: validate,
    parseNumber: parseNumber,
    parseDate: parseDate,
    parseYesNo: parseYesNo,
    display: display,
    cleanOptions: cleanOptions,
    rowMatchesSearch: rowMatchesSearch,
    cellMatchesFilter: cellMatchesFilter,
    sortRows: sortRows,
    visibleRows: visibleRows,
    opsFor: opsFor,
    parseCsv: parseCsv,
    toCsv: toCsv,
    guessType: guessType,
    previewCsv: previewCsv,
    tableFromPreview: tableFromPreview,
    serialize: serialize,
    load: load,
    saveTo: saveTo,
    loadFrom: loadFrom
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TablesModel = api;
})(typeof window !== 'undefined' ? window : this);
