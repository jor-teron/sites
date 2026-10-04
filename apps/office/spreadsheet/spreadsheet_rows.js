/*
 * spreadsheet_rows.js
 * Insert / delete rows and columns at the selection (one per selected row / column).
 * The sheet size stays fixed: inserting pushes the last row / column out, so it is refused
 * when that row / column has data. Formula refs are adjusted; refs to deleted cells → #REF!.
 */
function blankCell() { return { formula: "", value: "", style: defaultStyle() }; }

function lineHasData(axis, k) {
  var i, n = axis === "r" ? COLS : ROWS;
  for (i = 0; i < n; i++) {
    var x = axis === "r" ? cells[k][i] : cells[i][k];
    if (x.formula !== "" && x.formula != null) return true;
  }
  return false;
}

function adjustAll(axis, at, delta) {
  var r, c;
  for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
    cells[r][c].formula = adjustRefs(cells[r][c].formula, axis, at, delta);
  }
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
      if (delta > 0) { cells.splice(at, 0, cells.pop()); cells[at] = cells[at].map(blankCell); }
      else { cells.splice(at, 1); cells.push(cells[0].map(blankCell)); }
    } else {
      for (r = 0; r < ROWS; r++) {
        if (delta > 0) { cells[r].pop(); cells[r].splice(at, 0, blankCell()); }
        else { cells[r].splice(at, 1); cells[r].push(blankCell()); }
      }
      if (delta > 0) { colWidths.splice(at, 0, null); colWidths.length = COLS; }
      else { colWidths.splice(at, 1); colWidths.push(null); }
    }
    adjustAll(axis, at, delta);
  }
  if (axis === "c" && typeof applyWidths === "function") applyWidths();
  afterChange();
  highlightSel();
}

SHEET_INIT.push(function () {
  onBtn("btn-row-ins", function () { changeLines("r", 1); });
  onBtn("btn-row-del", function () { changeLines("r", -1); });
  onBtn("btn-col-ins", function () { changeLines("c", 1); });
  onBtn("btn-col-del", function () { changeLines("c", -1); });
});
