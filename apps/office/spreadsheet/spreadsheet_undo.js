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

function undoCellGrid(grid) {
  return grid.map(function (row) {
    return row.map(function (x) { return [x.formula, x.style]; });
  });
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
        sel: (sh.sel || [0, 0, 0, 0, "cell"]).slice()
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
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        sh.cells[r][c].formula = src.c[r][c][0];
        sh.cells[r][c].style = Object.assign(defaultStyle(), src.c[r][c][1] || {});
      }
    }
    for (c = 0; c < COLS; c++) sh.widths[c] = src.widths && typeof src.widths[c] === "number" ? src.widths[c] : null;
    if (src.hiddenRows) { for (r = 0; r < ROWS; r++) sh.hiddenRows[r] = !!src.hiddenRows[r]; }
    if (src.hiddenCols) { for (c = 0; c < COLS; c++) sh.hiddenCols[c] = !!src.hiddenCols[c]; }
    sh.freeze = { rows: (src.freeze && src.freeze.rows) || 0, cols: (src.freeze && src.freeze.cols) || 0 };
    sh.sel = src.sel || [0, 0, 0, 0, "cell"];
    workbook.sheets.push(sh);
  }
  workbook.active = Math.max(0, Math.min(workbook.sheets.length - 1, d.active | 0));
  bindActiveSheet();
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
