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
  /* SH49: not-yet-loaded xlsx sheets are converted first so their formulas shift too */
  if (typeof lazyLoadAll === "function") lazyLoadAll();
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

  if (typeof document !== "undefined" && document) {
    var wrap = document.getElementById("sheet-wrap");
    if (wrap) {
      wrap.addEventListener("contextmenu", onGridContextMenu);
      wrap.addEventListener("scroll", closeGridContextMenu);
    }
    document.addEventListener("mousedown", function (ev) {
      var m = document.getElementById("sheet-context-menu");
      if (m && !m.contains(ev.target)) closeGridContextMenu();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeGridContextMenu();
    });
    if (typeof window !== "undefined" && window && window.addEventListener) {
      window.addEventListener("resize", closeGridContextMenu);
    }
  }
});

/* ---------- SH25: Grid Context Menu ---------- */

function closeGridContextMenu() {
  if (typeof document === "undefined" || !document) return;
  var m = document.getElementById("sheet-context-menu");
  if (m) m.remove();
}

function gridContextMenuItems(type) {
  if (type === "row") {
    return [
      { id: "row-ins", label: "Insert row above", run: function () { changeLines("r", 1); } },
      { id: "row-del", label: "Delete row", run: function () { changeLines("r", -1); } },
      { sep: true },
      { id: "clear", label: "Clear contents", shortcut: "Del", run: function () { if (typeof clearSelection === "function") clearSelection(); } },
      { sep: true },
      { id: "row-hide", label: "Hide row", run: function () { if (typeof hideSelection === "function") hideSelection("r"); } },
      /* (before SH39) the row menu ended at Unhide rows */
      { id: "row-unhide", label: "Unhide rows", run: function () { if (typeof unhideAroundSelection === "function") unhideAroundSelection(); } },
      { sep: true },
      { id: "row-fit", label: "Fit row height", run: function () { if (typeof fitSelectedRowHeights === "function") fitSelectedRowHeights(); } }   /* SH39 */
    ];
  }
  if (type === "col") {
    return [
      { id: "col-ins", label: "Insert column left", run: function () { changeLines("c", 1); } },
      { id: "col-del", label: "Delete column", run: function () { changeLines("c", -1); } },
      { sep: true },
      { id: "clear", label: "Clear contents", shortcut: "Del", run: function () { if (typeof clearSelection === "function") clearSelection(); } },
      { sep: true },
      { id: "col-hide", label: "Hide column", run: function () { if (typeof hideSelection === "function") hideSelection("c"); } },
      { id: "col-unhide", label: "Unhide columns", run: function () { if (typeof unhideAroundSelection === "function") unhideAroundSelection(); } }
    ];
  }
  if (type === "corner") {
    return [
      { id: "cut", label: "Cut", shortcut: "Ctrl+X", run: function () {
        var t = typeof copyBlock === "function" ? copyBlock(true) : "";
        if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
          navigator.clipboard.writeText(t).catch(function () {});
        }
      }},
      { id: "copy", label: "Copy", shortcut: "Ctrl+C", run: function () {
        var t = typeof copyBlock === "function" ? copyBlock(false) : "";
        if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
          navigator.clipboard.writeText(t).catch(function () {});
        }
      }},
      { id: "paste", label: "Paste", shortcut: "Ctrl+V", run: function () {
        if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.readText && window.isSecureContext) {
          navigator.clipboard.readText().then(function (txt) {
            if (typeof pasteText === "function") pasteText(txt);
          }, function () {
            if (typeof pasteText === "function") pasteText(null);
          });
        } else if (typeof pasteText === "function") pasteText(null);
      }},
      { sep: true },
      { id: "clear", label: "Clear contents", shortcut: "Del", run: function () { if (typeof clearSelection === "function") clearSelection(); } }
    ];
  }
  // "cell"
  return [
    { id: "cut", label: "Cut", shortcut: "Ctrl+X", run: function () {
      var t = typeof copyBlock === "function" ? copyBlock(true) : "";
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
        navigator.clipboard.writeText(t).catch(function () {});
      }
    }},
    { id: "copy", label: "Copy", shortcut: "Ctrl+C", run: function () {
      var t = typeof copyBlock === "function" ? copyBlock(false) : "";
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
        navigator.clipboard.writeText(t).catch(function () {});
      }
    }},
    { id: "paste", label: "Paste", shortcut: "Ctrl+V", run: function () {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.readText && window.isSecureContext) {
        navigator.clipboard.readText().then(function (txt) {
          if (typeof pasteText === "function") pasteText(txt);
        }, function () {
          if (typeof pasteText === "function") pasteText(null);
        });
      } else if (typeof pasteText === "function") pasteText(null);
    }},
    { sep: true },
    { id: "row-ins", label: "Insert row above", run: function () { changeLines("r", 1); } },
    { id: "row-del", label: "Delete row", run: function () { changeLines("r", -1); } },
    { id: "col-ins", label: "Insert column left", run: function () { changeLines("c", 1); } },
    { id: "col-del", label: "Delete column", run: function () { changeLines("c", -1); } },
    { sep: true },
    { id: "clear", label: "Clear contents", shortcut: "Del", run: function () { if (typeof clearSelection === "function") clearSelection(); } }
  ];
}

function openGridContextMenu(ev, items) {
  if (typeof document === "undefined" || !document) return;
  if (ev && ev.preventDefault) ev.preventDefault();
  closeGridContextMenu();
  if (typeof closeSheetMenu === "function") closeSheetMenu();

  var menu = document.createElement("div");
  menu.id = "sheet-context-menu";
  menu.className = "sheet-context-menu";
  menu.setAttribute("role", "menu");

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.sep) {
      var sep = document.createElement("div");
      sep.className = "sheet-menu-sep";
      sep.setAttribute("role", "separator");
      menu.appendChild(sep);
      continue;
    }
    (function (item) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "sheet-menu-item";
      b.setAttribute("role", "menuitem");
      var lbl = document.createElement("span");
      lbl.textContent = item.label;
      b.appendChild(lbl);
      if (item.shortcut) {
        var sc = document.createElement("span");
        sc.className = "sheet-menu-shortcut";
        sc.textContent = item.shortcut;
        b.appendChild(sc);
      }
      if (item.disabled) {
        b.disabled = true;
      } else {
        b.addEventListener("click", function (e) {
          e.stopPropagation();
          closeGridContextMenu();
          item.run();
        });
      }
      menu.appendChild(b);
    })(it);
  }

  document.body.appendChild(menu);
  var w = menu.offsetWidth || 180, h = menu.offsetHeight || 200;
  var x = ev.clientX, y = ev.clientY;
  if (x == null || y == null) {
    var target = ev.target;
    var rect = target && target.getBoundingClientRect ? target.getBoundingClientRect() : null;
    x = rect ? rect.left + rect.width / 2 : 100;
    y = rect ? rect.bottom : 100;
  }
  var maxW = typeof window !== "undefined" && window.innerWidth ? window.innerWidth : 1000;
  var maxH = typeof window !== "undefined" && window.innerHeight ? window.innerHeight : 800;
  menu.style.left = Math.max(4, Math.min(x, maxW - w - 4)) + "px";
  menu.style.top = Math.max(4, Math.min(y, maxH - h - 4)) + "px";

  var first = menu.querySelector("button:not(:disabled)");
  if (first) first.focus();
}

function onGridContextMenu(ev) {
  if (!ev || !ev.target || !ev.target.closest) return;
  var wrap = document.getElementById("sheet-wrap");
  if (!wrap || !wrap.contains(ev.target)) return;

  var rowEl = ev.target.closest("td." + CLS.rowNum);
  var colEl = ev.target.closest("th." + CLS.colHead);
  var cornerEl = ev.target.closest("th." + CLS.corner);
  var cellEl = ev.target.closest("td." + CLS.cell);

  if (!rowEl && !colEl && !cornerEl && !cellEl) return;

  var g = typeof selRange === "function" ? selRange() : { r1: selR, r2: extR, c1: selC, c2: extC };

  if (rowEl) {
    var r = parseInt(rowEl.dataset.r, 10);
    var inRowSel = selMode === "row" && r >= g.r1 && r <= g.r2;
    if (!inRowSel) {
      if (typeof blurEditing === "function") blurEditing();
      selR = r; selC = 0; extC = COLS - 1; extR = r;
      selMode = "row";
      if (typeof highlightSel === "function") highlightSel();
      if (typeof setStatus === "function" && TXT.rowPrefix) setStatus(TXT.rowPrefix + (r + 1));
    }
    openGridContextMenu(ev, gridContextMenuItems("row"));
    return;
  }

  if (colEl) {
    var c = parseInt(colEl.dataset.c, 10);
    var inColSel = selMode === "col" && c >= g.c1 && c <= g.c2;
    if (!inColSel) {
      if (typeof blurEditing === "function") blurEditing();
      selC = c; selR = 0; extR = ROWS - 1; extC = c;
      selMode = "col";
      if (typeof highlightSel === "function") highlightSel();
      if (typeof setStatus === "function" && TXT.columnPrefix && typeof colLetter === "function") setStatus(TXT.columnPrefix + colLetter(c));
    }
    openGridContextMenu(ev, gridContextMenuItems("col"));
    return;
  }

  if (cornerEl) {
    if (typeof selectAll === "function") selectAll();
    openGridContextMenu(ev, gridContextMenuItems("corner"));
    return;
  }

  if (cellEl) {
    var cr = parseInt(cellEl.dataset.r, 10);
    var cc = parseInt(cellEl.dataset.c, 10);
    var inCellSel = cr >= g.r1 && cr <= g.r2 && cc >= g.c1 && cc <= g.c2;
    if (!inCellSel) {
      if (typeof blurEditing === "function") blurEditing();
      if (typeof focusCell === "function") focusCell(cr, cc);
    }
    openGridContextMenu(ev, gridContextMenuItems("cell"));
    return;
  }
}
