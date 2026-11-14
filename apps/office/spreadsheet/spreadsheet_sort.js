/*
 * spreadsheet_sort.js
 * Sort the selected block by the active cell's column (one cell selected: the used area
 * of the sheet, by the current column). Numbers come before text, blanks always last;
 * whole rows of the block move together (formulas, styles). No header-row detection.
 */
function sortKey(v) {
  if (v === "" || v === null || v === undefined) return { t: 2 };
  if (typeof v === "number") return { t: 0, n: v };
  var s = String(v), n = Number(s);
  if (s.trim() !== "" && !isNaN(n)) return { t: 0, n: n };
  return { t: 1, s: s.toLowerCase() };
}

function usedArea() {
  /* (before SH24) for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
    if (cells[r][c].formula !== "" && cells[r][c].formula != null) { if (r > lr) lr = r; if (c > lc) lc = c; }
  } */
  var lr = -1, lc = -1;
  forEachReal(cells, function (r, c, cell) {
    if (cell.formula !== "" && cell.formula != null) { if (r > lr) lr = r; if (c > lc) lc = c; }
  });
  return lr < 0 ? null : { r1: 0, r2: lr, c1: 0, c2: Math.max(lc, selC) };
}

function sortSelection(desc) {
  var g = selRange();
  if (g.r1 === g.r2 && g.c1 === g.c2) g = usedArea();
  if (!g || g.r1 === g.r2) return;
  var key = selC >= g.c1 && selC <= g.c2 ? selC : g.c1;
  var rows = [], r, c, i;
  for (r = g.r1; r <= g.r2; r++) {
    var store = rowStore(cells[r]);
    var slice = [], cc;
    for (cc = g.c1; cc <= g.c2; cc++) slice.push(store[cc] || null);
    var keyCell = store[key];
    rows.push({ src: r, k: sortKey(keyCell ? keyCell.value : ""), cells: slice });
  }
  rows.sort(function (a, b) {
    if (a.k.t !== b.k.t) return a.k.t - b.k.t;
    if (a.k.t === 2) return 0;
    var d = a.k.t === 0 ? a.k.n - b.k.n : (a.k.s < b.k.s ? -1 : a.k.s > b.k.s ? 1 : 0);
    return desc ? -d : d;
  });
  undoRecord("sort");
  for (i = 0; i < rows.length; i++) {
    r = g.r1 + i;
    for (c = g.c1; c <= g.c2; c++) {
      var x = rows[i].cells[c - g.c1];
      if (!x) cells[r][c] = undefined;
      else cells[r][c] = { formula: shiftFormula(x.formula, r - rows[i].src, 0), value: x.value, style: x.style };
    }
  }
  afterChange();
  setStatus((desc ? TXT.sortedDesc : TXT.sortedAsc) + " " + colLetter(g.c1) + (g.r1 + 1) + ":" + colLetter(g.c2) + (g.r2 + 1));
}

SHEET_INIT.push(function () {
  onBtn("btn-sort-asc", function () { sortSelection(false); });
  onBtn("btn-sort-desc", function () { sortSelection(true); });
});
