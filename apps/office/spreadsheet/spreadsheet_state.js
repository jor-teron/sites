/*
 * spreadsheet_state.js
 * Shared state: config shortcuts, grid size, the workbook (SH8) and the active
 * sheet's cells store, the selection, column widths, SHEET_INIT; blank grid,
 * cell styles, status text, selection helpers.
 * Loaded first after the formula engine; every other module reads these globals.
 * Scripts that push to SHEET_INIT must load after this file (SH21: fx.js did not).
 */

/* Configuration shortcut */
var CFG = SPREADSHEET_CONFIG;
var TXT = CFG.text;
var CLS = CFG.classes;
var KEYS = CFG.keys;

/* (before SH24) Number of columns A..Z — fixed 26; SH8 does not change the grid size */
/* Number of columns A..FZ (182). SH24. */
var COLS = CFG.grid.cols;

/* (before SH24) Number of data rows — fixed 100 */
/* Number of data rows — 1000. SH24. */
var ROWS = CFG.grid.rows;

/* LocalStorage key (sheet-v4) */
var STORE_KEY = CFG.storage.key;

/* Column letters A-Z */
var COL_LETTERS = CFG.grid.colLetters;

/* Workbook: { sheets: [Sheet], active }  (SH8) */
var workbook = null;

/* Bound to the active sheet (never reassigned except in bindActiveSheet) */
var cells = [];
var colWidths = [];
var hiddenRows = [];
var hiddenCols = [];
var filterHidden = [];
var freeze = { rows: 0, cols: 0 };

/* Sheet the evaluator is reading (equals workbook.active except during recalc) */
var evalSheetIdx = 0;

/* Active cell (where typing goes) */
var selR = CFG.start.row;
var selC = CFG.start.col;

/* Other corner of the selected block (same as the active cell for one cell) */
var extR = selR;
var extC = selC;

/* How the block was chosen: "cell" | "col" | "row" | "all" (status text only) */
var selMode = CFG.start.mode;

/* Start-up functions added by the modules */
var SHEET_INIT = [];

/* Autofill drag state */
var fillDrag = null;

/* Cached input elements [r][c] */
var inpGrid = [];

/* Default cell style */
function defaultStyle() {
  return Object.assign({}, CFG.defaultStyle);
}

function blankCell() {
  return { formula: "", value: "", style: defaultStyle() };
}

/* (before SH24) makeCells built a dense ROWS×COLS array of blankCell() objects.
function makeCells() {
  var r, c, row, grid = [];
  for (r = 0; r < ROWS; r++) {
    row = [];
    for (c = 0; c < COLS; c++) row.push(blankCell());
    grid.push(row);
  }
  return grid;
}
*/

/* SH24: rows are sparse. Empty slots are holes, not cell objects.
 * Reading cells[r][c].formula on a hole returns "" and does not allocate.
 * Assigning cells[r][c].formula (or .value / .style) allocates that one cell. */
var SPARSE_IDX = /^(?:0|[1-9]\d*)$/;
var STYLE_SHARED = null;

function sharedDefaultStyle() {
  if (!STYLE_SHARED) STYLE_SHARED = Object.freeze(defaultStyle());
  return STYLE_SHARED;
}

function styleDirty(st) {
  if (!st) return false;
  var b = defaultStyle(), k, v;
  for (k in st) {
    if (!Object.prototype.hasOwnProperty.call(st, k)) continue;
    v = st[k];
    if (k === "fmt" && (v == null || v === "" || v === "general")) continue;
    if (v !== b[k]) return true;
  }
  return false;
}

function rowStore(row) {
  if (row && row._store) return row._store;
  return row;
}

function lazyStyle(store, c) {
  /* Target is a blank object. A frozen default cannot be the target: setting
     fontSize (a real key on that default) breaks the proxy invariant. */
  return new Proxy(Object.create(null), {
    get: function (t, p) {
      var real = store[c], d;
      if (real && real.style && (Object.prototype.hasOwnProperty.call(real.style, p) || real.style[p] != null)) return real.style[p];
      d = sharedDefaultStyle();
      return d[p];
    },
    set: function (t, p, v) {
      if (!store[c]) {
        store[c] = blankCell();
        store._n++;
      }
      if (!store[c].style) store[c].style = defaultStyle();
      store[c].style[p] = v;
      return true;
    }
  });
}

function lazyCell(store, c) {
  return new Proxy(Object.create(null), {
    get: function (t, p) {
      var real = store[c];
      if (real) return real[p];
      if (p === "formula" || p === "value") return "";
      if (p === "style") return lazyStyle(store, c);
      if (p === "_empty") return true;
      return undefined;
    },
    set: function (t, p, v) {
      if (!store[c]) {
        store[c] = blankCell();
        store._n++;
      }
      store[c][p] = v;
      return true;
    }
  });
}

function makeSparseRow() {
  var store = new Array(COLS);
  Object.defineProperty(store, "_n", { value: 0, writable: true, enumerable: false });
  Object.defineProperty(store, "_store", { value: store, enumerable: false });
  return new Proxy(store, {
    get: function (t, p) {
      if (typeof p === "string" && SPARSE_IDX.test(p)) {
        var i = +p;
        if (i < 0 || i >= COLS) return undefined;
        if (t[i]) return t[i];
        return lazyCell(t, i);
      }
      var v = t[p];
      if (typeof v === "function") return v.bind(t);
      return v;
    },
    set: function (t, p, v) {
      if (typeof p === "string" && SPARSE_IDX.test(p)) {
        var i = +p, had = !!t[i];
        if (v && v._empty) return true;
        if (v) {
          t[i] = v;
          if (!had) t._n++;
        } else if (had) {
          t[i] = undefined;
          t._n--;
        }
        return true;
      }
      t[p] = v;
      return true;
    }
  });
}

function makeCells() {
  var r, grid = [];
  for (r = 0; r < ROWS; r++) grid.push(makeSparseRow());
  return grid;
}

/* The real cell object, or null when the slot is still empty. */
function realCellAt(grid, r, c) {
  if (!grid) grid = cells;
  var row = grid[r];
  if (!row) return null;
  var store = rowStore(row);
  var cell = store ? store[c] : null;
  if (!cell || cell._empty) return null;
  return cell;
}

function ensureCellAt(grid, r, c) {
  if (!grid) grid = cells;
  var store = rowStore(grid[r]);
  if (!store[c]) {
    store[c] = blankCell();
    store._n++;
  }
  return store[c];
}

function clearSparseRow(row) {
  var t = rowStore(row), c;
  if (!t) return;
  for (c = 0; c < t.length; c++) t[c] = undefined;
  t._n = 0;
}

function shiftSparseCols(row, at, delta) {
  var t = rowStore(row), c, n = 0;
  if (!t || !t._n) return;
  if (delta > 0) {
    for (c = COLS - 1; c > at; c--) t[c] = t[c - 1];
    t[at] = undefined;
  } else {
    for (c = at; c < COLS - 1; c++) t[c] = t[c + 1];
    t[COLS - 1] = undefined;
  }
  for (c = 0; c < COLS; c++) if (t[c]) n++;
  t._n = n;
}

function forEachReal(grid, fn) {
  if (!grid || typeof fn !== "function") return;
  var r, c, store, cell, n;
  for (r = 0; r < grid.length; r++) {
    store = rowStore(grid[r]);
    if (!store || store._n === 0) continue;
    n = store.length || 0;
    for (c = 0; c < n; c++) {
      cell = store[c];
      if (cell && !cell._empty) fn(r, c, cell);
    }
  }
}

function flags(n) {
  var a = [], i;
  for (i = 0; i < n; i++) a.push(false);
  return a;
}

function widthsArray() {
  var a = [], i;
  for (i = 0; i < COLS; i++) a.push(null);
  return a;
}

/**
 * One blank sheet. Each sheet has its own cells, styles, formats, widths,
 * hidden rows/columns, freeze panes and last selection.
 */
function makeSheet(name) {
  return {
    name: name || "Sheet1",
    cells: makeCells(),
    widths: widthsArray(),
    hiddenRows: flags(ROWS),
    hiddenCols: flags(COLS),
    filterHidden: flags(ROWS),
    filters: { on: false, r1: 0, r2: 0, c1: 0, c2: 0, cols: {} },
    validations: [],
    merges: [],
    condFormats: [],
    charts: [],
    freeze: { rows: 0, cols: 0 },
    /* HOS1: row heights in px, null = automatic. Saved in the .hos file. */
    heights: (function () { var a = [], i; for (i = 0; i < ROWS; i++) a.push(null); return a; })(),
    sel: [CFG.start.row, CFG.start.col, CFG.start.row, CFG.start.col, CFG.start.mode]
  };
}

function emptyWorkbook() {
  workbook = { sheets: [makeSheet("Sheet1")], active: 0 };
  bindActiveSheet();
}

/**
 * Point the global cells / widths / hidden / freeze at the active sheet.
 */
function bindActiveSheet() {
  var s = workbook.sheets[workbook.active];
  cells = s.cells;
  colWidths = s.widths;
  hiddenRows = s.hiddenRows;
  hiddenCols = s.hiddenCols;
  if (!s.filterHidden) s.filterHidden = flags(ROWS);
  if (!s.filters) s.filters = { on: false, r1: 0, r2: 0, c1: 0, c2: 0, cols: {} };
  if (!s.validations) s.validations = [];
  if (!s.merges) s.merges = [];
  if (!s.condFormats) s.condFormats = [];
  if (!s.charts) s.charts = [];
  filterHidden = s.filterHidden;
  freeze = s.freeze;
  evalSheetIdx = workbook.active;
}

function cellsOf(si) {
  if (si == null) si = evalSheetIdx;
  return workbook.sheets[si].cells;
}

/**
 * Clear the active sheet in place (other sheets are left alone).
 */
/* (before SH24) emptyGrid wrote blankCell() into every slot, which filled the grid.
function emptyGrid() {
  var r, c, s;
  if (!workbook) emptyWorkbook();
  s = workbook.sheets[workbook.active];
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) s.cells[r][c] = blankCell();
    s.hiddenRows[r] = false;
    s.filterHidden[r] = false;
  }
  for (c = 0; c < COLS; c++) { s.widths[c] = null; s.hiddenCols[c] = false; }
  if (s.heights) { for (r = 0; r < ROWS; r++) s.heights[r] = null; }
  s.freeze.rows = 0;
  s.freeze.cols = 0;
  s.filters = { on: false, r1: 0, r2: 0, c1: 0, c2: 0, cols: {} };
  s.validations = [];
  s.merges = [];
  s.condFormats = [];
  s.charts = [];
  bindActiveSheet();
}
*/
function emptyGrid() {
  var r, s;
  if (!workbook) emptyWorkbook();
  s = workbook.sheets[workbook.active];
  s.cells = makeCells();
  s.widths = widthsArray();
  s.hiddenRows = flags(ROWS);
  s.hiddenCols = flags(COLS);
  s.filterHidden = flags(ROWS);
  if (s.heights) { for (r = 0; r < ROWS; r++) s.heights[r] = null; }
  else s.heights = (function () { var a = [], i; for (i = 0; i < ROWS; i++) a.push(null); return a; })();
  s.freeze.rows = 0;
  s.freeze.cols = 0;
  s.filters = { on: false, r1: 0, r2: 0, c1: 0, c2: 0, cols: {} };
  s.validations = [];
  s.merges = [];
  s.condFormats = [];
  s.charts = [];
  bindActiveSheet();
}

function findSheetIndex(name) {
  var n = String(name || "").toLowerCase(), i;
  for (i = 0; i < workbook.sheets.length; i++) {
    if (workbook.sheets[i].name.toLowerCase() === n) return i;
  }
  return -1;
}

function nextSheetName(base) {
  var i, name;
  if (base) {
    if (findSheetIndex(base) < 0) return base.slice(0, CFG.sheets.nameMax);
    i = 2;
    while (findSheetIndex(base + " (" + i + ")") >= 0) i++;
    name = base + " (" + i + ")";
    return name.slice(0, CFG.sheets.nameMax);
  }
  i = 1;
  while (findSheetIndex("Sheet" + i) >= 0) i++;
  return "Sheet" + i;
}

/**
 * Ensure style object exists
 */
/* Read a style. An empty slot stays empty and shares the frozen default. */
function cellStyle(r, c) {
  var cell = realCellAt(cells, r, c);
  if (!cell || !cell.style) return sharedDefaultStyle();
  return cell.style;
}

/* Write path: make sure this cell has its own style object. */
function ensureStyle(r, c) {
  var cell = ensureCellAt(cells, r, c);
  if (!cell.style || cell.style === sharedDefaultStyle()) cell.style = defaultStyle();
  return cell.style;
}

/**
 * Status text
 */
function setStatus(msg) {
  var el = document.getElementById("status");
  if (el) el.textContent = msg;
}

/* Set while focus moves inside a block selection (keeps the block) */
var keepExtent = false;

/* Selected block, normalised */
function selRange() {
  return {
    r1: Math.min(selR, extR), r2: Math.max(selR, extR),
    c1: Math.min(selC, extC), c2: Math.max(selC, extC)
  };
}

/* A1 or A1:B3 text for the block */
function rangeLabel() {
  var g = selRange();
  var a = colLetter(g.c1) + (g.r1 + 1);
  return g.r1 === g.r2 && g.c1 === g.c2 ? a : a + ":" + colLetter(g.c2) + (g.r2 + 1);
}

/**
 * Run fn(r, c) on every cell of the selected block
 */
function forSelection(fn) {
  var g = selRange(), r, c;
  for (r = g.r1; r <= g.r2; r++) {
    for (c = g.c1; c <= g.c2; c++) fn(r, c);
  }
}


function stashSheetView() {
  if (!workbook || !workbook.sheets[workbook.active]) return;
  workbook.sheets[workbook.active].sel = [selR, selC, extR, extC, selMode];
}

function restoreSheetView() {
  var sel = workbook.sheets[workbook.active].sel;
  if (sel && sel.length >= 4) {
    selR = sel[0]; selC = sel[1]; extR = sel[2]; extC = sel[3];
    selMode = sel[4] || "cell";
  } else {
    selR = selC = extR = extC = 0; selMode = "cell";
  }
}

/**
 * Next visible cell from (r,c) in direction dr,dc; stays put if none.
 */
function nextVisible(r, c, dr, dc) {
  var nr = r, nc = c, guard = 0;
  while (guard++ < ROWS + COLS) {
    nr += dr; nc += dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return { r: r, c: c };
    if ((dr === 0 || !rowHidden(nr)) && (dc === 0 || !hiddenCols[nc]) && !rowHidden(nr) && !hiddenCols[nc]) {
      return { r: nr, c: nc };
    }
  }
  return { r: r, c: c };
}


/* SH10: a row is hidden if the user hid it or a filter hid it. */
function rowHidden(r, si) {
  var s = workbook && workbook.sheets[si == null ? workbook.active : si];
  if (!s) return !!(hiddenRows[r]);
  if (s.hiddenRows && s.hiddenRows[r]) return true;
  if (s.filterHidden && s.filterHidden[r]) return true;
  return false;
}
