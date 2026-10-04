/*
 * spreadsheet_undo.js
 * Undo / redo. Every change calls undoRecord(tag) BEFORE it edits the cells; a snapshot of
 * all formulas + styles (and the selection) is kept. Colour-picker drags with the same tag
 * inside CFG.undo.mergeMs count as one step. History length: CFG.undo.limit.
 * Column widths are not part of undo.
 */
var UNDO = { past: [], future: [], lastTag: "", lastTime: 0 };
var UNDO_MERGE_TAGS = ["fill-color", "text-color"];

function undoSnapshot() {
  return JSON.stringify({
    c: cells.map(function (row) { return row.map(function (x) { return [x.formula, x.style]; }); }),
    s: [selR, selC, extR, extC]
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
  var d = JSON.parse(snap), r, c;
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      cells[r][c].formula = d.c[r][c][0];
      cells[r][c].style = Object.assign(defaultStyle(), d.c[r][c][1] || {});
    }
  }
  selR = d.s[0]; selC = d.s[1]; extR = d.s[2]; extC = d.s[3];
  UNDO.lastTag = "";
  blurEditing();
  afterChange();
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
