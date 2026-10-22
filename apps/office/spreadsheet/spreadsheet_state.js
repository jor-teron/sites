/*
 * spreadsheet_state.js
 * Shared state: config shortcuts, grid size, the cells store, the selection,
 * column widths, SHEET_INIT; blank grid, cell styles, status text, selection helpers.
 * Loaded first after the formula engine; every other module reads these globals.
 */

/* Configuration shortcut */
var CFG = SPREADSHEET_CONFIG;
var TXT = CFG.text;
var CLS = CFG.classes;
var KEYS = CFG.keys;

/* Number of columns A..Z */
var COLS = CFG.grid.cols;

/* Number of data rows */
var ROWS = CFG.grid.rows;

/* LocalStorage key */
var STORE_KEY = CFG.storage.key;

/* Column letters A-Z */
var COL_LETTERS = CFG.grid.colLetters;

/* cells[r][c] store */
var cells = [];

/* Active cell (where typing goes) */
var selR = CFG.start.row;
var selC = CFG.start.col;

/* Other corner of the selected block (same as the active cell for one cell) */
var extR = selR;
var extC = selC;

/* How the block was chosen: "cell" | "col" | "row" | "all" (status text only) */
var selMode = CFG.start.mode;

/* Column widths in px (null = automatic), saved with the sheet */
var colWidths = [];

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

/**
 * Create blank grid
 */
function emptyGrid() {
  var r, c, row;
  cells = [];
  for (r = 0; r < ROWS; r++) {
    row = [];
    for (c = 0; c < COLS; c++) {
      row.push({ formula: "", value: "", style: defaultStyle() });
    }
    cells.push(row);
  }
}

/**
 * Ensure style object exists
 */
function cellStyle(r, c) {
  if (!cells[r][c].style) cells[r][c].style = defaultStyle();
  return cells[r][c].style;
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
