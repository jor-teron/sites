/*
 * spreadsheet_undo.js
 * Undo / redo. Every change calls undoRecord(tag) BEFORE it edits the cells; a snapshot of
 * the workbook (formulas + styles, sheets, freeze, hidden, widths) and the selection is kept.
 * Colour-picker drags with the same tag inside CFG.undo.mergeMs count as one step.
 * History length: CFG.undo.limit.
 * SH8: sheet add, rename, delete, reorder, freeze and hide are covered.
 */
var UNDO = { past: [], future: [], lastTag: "", lastTime: 0 };
var UNDO_MERGE_TAGS = ["fill-color", "text-color", "cell-fill", "cell-text"];

/* (before SH24) undoCellGrid copied every cell, empty ones included.
function undoCellGrid(grid) {
  return grid.map(function (row) {
    return row.map(function (x) { return [x.formula, x.style]; });
  });
}
*/
function undoCellGrid(grid) {
  var list = [];
  forEachReal(grid, function (r, c, x) {
    if (!x) return;
    if ((x.formula == null || x.formula === "") && (x.value == null || x.value === "") && !styleDirty(x.style)) return;
    list.push([r, c, x.formula, x.style]);
  });
  return list;
}

function undoSnapshot() {
  stashSheetView();
  return JSON.stringify({
    active: workbook.active,
    s: [selR, selC, extR, extC, selMode],
    sheets: workbook.sheets.map(function (sh) {
      return {
        name: sh.name,
        c: undoCellGrid(sh.cells),
        widths: sh.widths.slice(),
        hiddenRows: sh.hiddenRows.slice(),
        hiddenCols: sh.hiddenCols.slice(),
        freeze: { rows: sh.freeze.rows || 0, cols: sh.freeze.cols || 0 },
        sel: (sh.sel || [0, 0, 0, 0, "cell"]).slice(),
        filters: sh.filters ? JSON.parse(JSON.stringify(sh.filters)) : { on: false, r1: 0, r2: 0, c1: 0, c2: 0, cols: {} },
        validations: sh.validations ? JSON.parse(JSON.stringify(sh.validations)) : [],
        merges: sh.merges ? JSON.parse(JSON.stringify(sh.merges)) : [],
        condFormats: sh.condFormats ? JSON.parse(JSON.stringify(sh.condFormats)) : [],
        charts: sh.charts ? JSON.parse(JSON.stringify(sh.charts)) : [],
        heights: sh.heights ? sh.heights.slice() : null
      };
    })
  });
}

function undoRecord(tag) {
  var now = Date.now();
  if (UNDO_MERGE_TAGS.indexOf(tag) !== -1 && tag === UNDO.lastTag && now - UNDO.lastTime < CFG.undo.mergeMs) {
    UNDO.lastTime = now;
    return;
  }
  UNDO.past.push(undoSnapshot());
  if (UNDO.past.length > CFG.undo.limit) UNDO.past.shift();
  UNDO.future = [];
  UNDO.lastTag = tag;
  UNDO.lastTime = now;
  undoButtons();
}

function undoRestore(snap) {
  var d = JSON.parse(snap), i, r, c, sh, src, used = {};
  workbook.sheets = [];
  for (i = 0; i < d.sheets.length; i++) {
    src = d.sheets[i];
    sh = makeSheet(src.name || ("Sheet" + (i + 1)));
    sh.name = src.name || sh.name;
    /* (before SH24) dense snapshot: src.c[r][c] = [formula, style] for every cell.
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        sh.cells[r][c].formula = src.c[r][c][0];
        sh.cells[r][c].style = Object.assign(defaultStyle(), src.c[r][c][1] || {});
      }
    }
    */
    if (src.c && src.c.length && src.c[0] && src.c[0].length === 4 && typeof src.c[0][0] === "number") {
      for (r = 0; r < src.c.length; r++) {
        sh.cells[src.c[r][0]][src.c[r][1]] = {
          formula: src.c[r][2] || "",
          value: "",
          style: Object.assign(defaultStyle(), src.c[r][3] || {})
        };
      }
    } else if (src.c) {
      for (r = 0; r < ROWS && r < src.c.length; r++) {
        for (c = 0; c < COLS && src.c[r] && c < src.c[r].length; c++) {
          if (!src.c[r][c]) continue;
          sh.cells[r][c].formula = src.c[r][c][0];
          sh.cells[r][c].style = Object.assign(defaultStyle(), src.c[r][c][1] || {});
        }
      }
    }
    for (c = 0; c < COLS; c++) sh.widths[c] = src.widths && typeof src.widths[c] === "number" ? src.widths[c] : null;
    if (src.hiddenRows) { for (r = 0; r < ROWS; r++) sh.hiddenRows[r] = !!src.hiddenRows[r]; }
    if (src.hiddenCols) { for (c = 0; c < COLS; c++) sh.hiddenCols[c] = !!src.hiddenCols[c]; }
    sh.freeze = { rows: (src.freeze && src.freeze.rows) || 0, cols: (src.freeze && src.freeze.cols) || 0 };
    sh.sel = src.sel || [0, 0, 0, 0, "cell"];
    sh.filters = src.filters ? JSON.parse(JSON.stringify(src.filters)) : { on: false, r1: 0, r2: 0, c1: 0, c2: 0, cols: {} };
    sh.validations = src.validations ? JSON.parse(JSON.stringify(src.validations)) : [];
    sh.merges = src.merges ? JSON.parse(JSON.stringify(src.merges)) : [];
    sh.condFormats = src.condFormats ? JSON.parse(JSON.stringify(src.condFormats)) : [];
    sh.charts = src.charts ? JSON.parse(JSON.stringify(src.charts)) : [];
    if (src.heights && sh.heights) {
      for (r = 0; r < ROWS; r++) sh.heights[r] = typeof src.heights[r] === "number" ? src.heights[r] : null;
    }
    workbook.sheets.push(sh);
  }
  workbook.active = Math.max(0, Math.min(workbook.sheets.length - 1, d.active | 0));
  bindActiveSheet();
  if (typeof applyFilters === "function") {
    for (i = 0; i < workbook.sheets.length; i++) applyFilters(i);
  }
  selR = d.s[0]; selC = d.s[1]; extR = d.s[2]; extC = d.s[3];
  selMode = d.s[4] || "cell";
  UNDO.lastTag = "";
  blurEditing();
  afterChange();
  if (typeof applyWidths === "function") applyWidths();
  if (typeof renderSheetTabs === "function") renderSheetTabs();
  highlightSel();
  undoButtons();
}

function undo() {
  if (!UNDO.past.length) return;
  UNDO.future.push(undoSnapshot());
  undoRestore(UNDO.past.pop());
  setStatus(TXT.undone);
}

function redo() {
  if (!UNDO.future.length) return;
  UNDO.past.push(undoSnapshot());
  undoRestore(UNDO.future.pop());
  setStatus(TXT.redone);
}

function undoButtons() {
  var u = document.getElementById("btn-undo"), r = document.getElementById("btn-redo");
  if (u) u.disabled = !UNDO.past.length;
  if (r) r.disabled = !UNDO.future.length;
}

SHEET_INIT.push(function () {
  onBtn("btn-undo", undo);
  onBtn("btn-redo", redo);
  undoButtons();
});
