/*
 * spreadsheet_rows.js
 * Insert / delete rows and columns at the selection (one per selected row / column).
 * The sheet size stays fixed: inserting pushes the last row / column out, so it is refused
 * when that row / column has data. Formula refs are adjusted on every sheet; refs to the
 * changed sheet from other sheets move too; refs to deleted cells → #REF!.
 * Hidden flags and freeze panes on this sheet shift with the rows / columns.
 */
function lineHasData(axis, k) {
  /* (before SH24) walked every cell and read .formula, which required a real object.
  var i, n = axis === "r" ? COLS : ROWS;
  for (i = 0; i < n; i++) {
    var x = axis === "r" ? cells[k][i] : cells[i][k];
    if (x.formula !== "" && x.formula != null) return true;
  }
  return false;
  */
  var i, store, cell;
  if (axis === "r") {
    store = rowStore(cells[k]);
    if (!store || !store._n) return false;
    for (i = 0; i < COLS; i++) {
      cell = store[i];
      if (cell && cell.formula != null && cell.formula !== "") return true;
    }
    return false;
  }
  for (i = 0; i < ROWS; i++) {
    store = rowStore(cells[i]);
    cell = store && store[k];
    if (cell && cell.formula != null && cell.formula !== "") return true;
  }
  return false;
}

/* Adjust formulas on every sheet that point at the active (changed) sheet. */
function adjustAll(axis, at, delta) {
  var si, r, c, sh, target = workbook.active;
  for (si = 0; si < workbook.sheets.length; si++) {
    sh = workbook.sheets[si];
    /* (before SH24) for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      sh.cells[r][c].formula = adjustRefs(sh.cells[r][c].formula, axis, at, delta, target, si);
    } */
    forEachReal(sh.cells, function (rr, cc, cell) {
      if (!isFormula(cell.formula)) return;
      cell.formula = adjustRefs(cell.formula, axis, at, delta, target, si);
    });
  }
}

function shiftFlags(flags, at, delta, fill) {
  if (delta > 0) { flags.splice(at, 0, fill); flags.pop(); }
  else { flags.splice(at, 1); flags.push(fill); }
}

function shiftFreeze(axis, at, delta) {
  var key = axis === "r" ? "rows" : "cols";
  var n = freeze[key] || 0;
  if (!n) return;
  if (delta > 0) { if (at < n) freeze[key] = n + 1; }
  else if (at < n) freeze[key] = n - 1;
}

/* axis "r" | "c", delta 1 = insert, -1 = delete */
function changeLines(axis, delta) {
  var g = selRange(), at = axis === "r" ? g.r1 : g.c1;
  var n = axis === "r" ? g.r2 - g.r1 + 1 : g.c2 - g.c1 + 1, last = (axis === "r" ? ROWS : COLS) - 1, k, r;
  if (selMode === "all") n = 1;
  if (delta > 0) {
    for (k = 0; k < n; k++) if (lineHasData(axis, last - k)) { setStatus(TXT.insertFull); return; }
  }
  undoRecord(axis + delta);
  for (k = 0; k < n; k++) {
    if (axis === "r") {
      /* (before SH24) if (delta > 0) { cells.splice(at, 0, cells.pop()); cells[at] = cells[at].map(blankCell); }
      else { cells.splice(at, 1); cells.push(cells[0].map(blankCell)); } */
      if (delta > 0) {
        var moved = cells.pop();
        clearSparseRow(moved);
        cells.splice(at, 0, moved);
      } else {
        cells.splice(at, 1);
        cells.push(makeSparseRow());
      }
      shiftFlags(hiddenRows, at, delta, false);
      /* SH18: heights[] was not shifted on row insert/delete (colWidths already was). */
      var sh = workbook && workbook.sheets[workbook.active];
      if (sh) {
        if (!sh.heights) { sh.heights = []; var hi; for (hi = 0; hi < ROWS; hi++) sh.heights[hi] = null; }
        if (typeof shiftSizeList === "function") shiftSizeList(sh.heights, at, delta, null, ROWS);
        else if (delta > 0) { sh.heights.splice(at, 0, null); sh.heights.length = ROWS; }
        else { sh.heights.splice(at, 1); sh.heights.push(null); }
      }
    } else {
      /* (before SH24) for (r = 0; r < ROWS; r++) {
        if (delta > 0) { cells[r].pop(); cells[r].splice(at, 0, blankCell()); }
        else { cells[r].splice(at, 1); cells[r].push(blankCell()); }
      } */
      for (r = 0; r < ROWS; r++) shiftSparseCols(cells[r], at, delta);
      if (delta > 0) { colWidths.splice(at, 0, null); colWidths.length = COLS; }
      else { colWidths.splice(at, 1); colWidths.push(null); }
      shiftFlags(hiddenCols, at, delta, false);
    }
    shiftFreeze(axis, at, delta);
    adjustAll(axis, at, delta);
  }
  if (typeof applyWidths === "function") applyWidths();
  afterChange();
  highlightSel();
}

SHEET_INIT.push(function () {
  onBtn("btn-row-ins", function () { changeLines("r", 1); });
  onBtn("btn-row-del", function () { changeLines("r", -1); });
  onBtn("btn-col-ins", function () { changeLines("c", 1); });
  onBtn("btn-col-del", function () { changeLines("c", -1); });
});
