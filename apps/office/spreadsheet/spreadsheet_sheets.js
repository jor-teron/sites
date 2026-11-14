/*
 * spreadsheet_sheets.js  (SH8)
 * Workbook UI: bottom tab bar (add, rename, delete, duplicate, reorder),
 * freeze panes, hide / unhide rows and columns, and a selection status bar
 * (Sum, Average, Count). In-app dialogs only.
 */

function afterSheetOp() {
  bindActiveSheet();
  if (typeof applyFilters === "function") applyFilters();
  if (typeof applyWidths === "function") applyWidths();
  else if (typeof applyHiddenAndFreeze === "function") applyHiddenAndFreeze();
  paintAll();
  if (typeof dataRenderFilterButtons === "function") dataRenderFilterButtons();
  if (typeof renderCharts === "function") renderCharts();
  highlightSel();
  renderSheetTabs();
  saveStore();
  syncStyleUi();
}

function switchSheet(i) {
  if (i < 0 || i >= workbook.sheets.length) return;
  /* SH22: a formula draft is open (or already pointing): only switch the view, keep editing */
  if (typeof pointOnTab === "function" && pointOnTab(i)) return;
  if (i === workbook.active) { renderSheetTabs(); return; }
  blurEditing();
  stashSheetView();
  workbook.active = i;
  bindActiveSheet();
  restoreSheetView();
  afterSheetOp();
}

function addSheet() {
  if (workbook.sheets.length >= CFG.sheets.max) { setStatus(TXT.sheetMax); return; }
  undoRecord("sheet-add");
  stashSheetView();
  workbook.sheets.push(makeSheet(nextSheetName()));
  workbook.active = workbook.sheets.length - 1;
  bindActiveSheet();
  selR = selC = extR = extC = 0; selMode = "cell";
  afterSheetOp();
  setStatus(TXT.sheetAdded);
}

function duplicateSheet(idx) {
  if (idx == null) idx = workbook.active;
  if (workbook.sheets.length >= CFG.sheets.max) { setStatus(TXT.sheetMax); return; }
  var src = workbook.sheets[idx], copy, r, c;
  undoRecord("sheet-dup");
  stashSheetView();
  copy = makeSheet(nextSheetName(src.name));
  /* (before SH24) the copy loop wrote a cell object into every slot.
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      copy.cells[r][c] = {
        formula: src.cells[r][c].formula,
        value: src.cells[r][c].value,
        style: Object.assign(defaultStyle(), src.cells[r][c].style || {})
      };
    }
    copy.hiddenRows[r] = !!src.hiddenRows[r];
  }
  */
  forEachReal(src.cells, function (rr, cc, cell) {
    copy.cells[rr][cc] = {
      formula: cell.formula,
      value: cell.value,
      style: Object.assign(defaultStyle(), cell.style || {})
    };
  });
  for (r = 0; r < ROWS; r++) copy.hiddenRows[r] = !!src.hiddenRows[r];
  for (c = 0; c < COLS; c++) {
    copy.widths[c] = src.widths[c];
    copy.hiddenCols[c] = !!src.hiddenCols[c];
  }
  if (src.heights && copy.heights) {
    for (r = 0; r < ROWS; r++) copy.heights[r] = typeof src.heights[r] === "number" ? src.heights[r] : null;
  }
  copy.freeze = { rows: src.freeze.rows || 0, cols: src.freeze.cols || 0 };
  copy.filters = typeof cloneFilters === "function" ? cloneFilters(src.filters) : JSON.parse(JSON.stringify(src.filters || { on: false, r1: 0, r2: 0, c1: 0, c2: 0, cols: {} }));
  copy.validations = typeof cloneValidations === "function" ? cloneValidations(src.validations) : JSON.parse(JSON.stringify(src.validations || []));
  copy.merges = JSON.parse(JSON.stringify(src.merges || []));
  copy.condFormats = JSON.parse(JSON.stringify(src.condFormats || []));
  copy.charts = JSON.parse(JSON.stringify(src.charts || []));
  workbook.sheets.splice(idx + 1, 0, copy);
  workbook.active = idx + 1;
  bindActiveSheet();
  restoreSheetView();
  afterSheetOp();
  setStatus(TXT.sheetDuplicated);
}

function rewriteAllFormulas(oldName, newName) {
  var si, r, c, sh;
  for (si = 0; si < workbook.sheets.length; si++) {
    sh = workbook.sheets[si];
    /* (before SH24) for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) {
      sh.cells[r][c].formula = rewriteSheetRefs(sh.cells[r][c].formula, oldName, newName);
    } */
    forEachReal(sh.cells, function (rr, cc, cell) {
      if (!isFormula(cell.formula)) return;
      cell.formula = rewriteSheetRefs(cell.formula, oldName, newName);
    });
  }
}

function renameSheetTo(idx, name) {
  var err = validateSheetName(name, idx);
  if (err) return err;
  name = String(name).trim();
  var old = workbook.sheets[idx].name;
  if (old === name) return "";
  undoRecord("sheet-rename");
  workbook.sheets[idx].name = name;
  rewriteAllFormulas(old, name);
  afterChange();
  renderSheetTabs();
  setStatus(TXT.sheetRenamed);
  return "";
}

function promptRename(idx) {
  if (typeof OfficeDialog === "undefined") return;
  OfficeDialog.form({
    title: "Rename sheet",
    fields: [{ key: "name", label: "Name", value: workbook.sheets[idx].name }],
    okLabel: "Rename",
    validate: function (v) { return validateSheetName(v.name, idx); }
  }).then(function (vals) {
    if (!vals) return;
    renameSheetTo(idx, vals.name);
  });
}

function deleteSheetAt(idx) {
  if (workbook.sheets.length <= 1) { setStatus(TXT.lastSheet); return; }
  var name = workbook.sheets[idx].name;
  undoRecord("sheet-delete");
  stashSheetView();
  workbook.sheets.splice(idx, 1);
  rewriteAllFormulas(name, null);
  if (workbook.active > idx) workbook.active--;
  else if (workbook.active >= workbook.sheets.length) workbook.active = workbook.sheets.length - 1;
  bindActiveSheet();
  restoreSheetView();
  afterChange();
  if (typeof applyWidths === "function") applyWidths();
  renderSheetTabs();
  highlightSel();
  setStatus(TXT.sheetDeleted);
}

function confirmDeleteSheet(idx) {
  if (workbook.sheets.length <= 1) { setStatus(TXT.lastSheet); return; }
  if (typeof OfficeDialog === "undefined") return;
  OfficeDialog.confirm({
    title: "Delete sheet?",
    message: "Delete \"" + workbook.sheets[idx].name + "\"? Formulas that point at it become #REF!. This can be undone.",
    okLabel: "Delete",
    danger: true
  }).then(function (ok) { if (ok) deleteSheetAt(idx); });
}

function moveSheet(idx, to) {
  if (to < 0 || to >= workbook.sheets.length || to === idx) return;
  undoRecord("sheet-move");
  stashSheetView();
  var sh = workbook.sheets.splice(idx, 1)[0];
  workbook.sheets.splice(to, 0, sh);
  if (workbook.active === idx) workbook.active = to;
  else if (idx < workbook.active && to >= workbook.active) workbook.active--;
  else if (idx > workbook.active && to <= workbook.active) workbook.active++;
  bindActiveSheet();
  renderSheetTabs();
  saveStore();
  setStatus(TXT.sheetMoved);
}

function copySheet(s) { /* used by tests / xlsx */ return s; }

/* ---------- Freeze & hide ---------- */

function setFreeze(rows, cols, msg) {
  rows = Math.max(0, Math.min(ROWS, rows | 0));
  cols = Math.max(0, Math.min(COLS, cols | 0));
  if (freeze.rows === rows && freeze.cols === cols) {
    if (typeof applyHiddenAndFreeze === "function") applyHiddenAndFreeze();
    return;
  }
  undoRecord("freeze");
  freeze.rows = rows;
  freeze.cols = cols;
  if (typeof applyHiddenAndFreeze === "function") applyHiddenAndFreeze();
  saveStore();
  setStatus(msg || (rows || cols ? TXT.frozenPanes : TXT.unfrozen));
}

function freezeTopRow() { setFreeze(1, freeze.cols, TXT.frozenTop); }
function freezeFirstCol() { setFreeze(freeze.rows, 1, TXT.frozenFirst); }
function unfreezePanes() { setFreeze(0, 0, TXT.unfrozen); }
function freezeAtActive() {
  if (selR === 0 && selC === 0) { setStatus(TXT.freezeAtA1); return; }
  setFreeze(selR, selC, TXT.frozenPanes);
}

function hideSelection(axis) {
  var g = selRange(), lo = axis === "r" ? g.r1 : g.c1, hi = axis === "r" ? g.r2 : g.c2;
  var flags = axis === "r" ? hiddenRows : hiddenCols, k, any = false, vis;
  for (k = lo; k <= hi; k++) if (!flags[k]) any = true;
  if (!any) return;
  /* Don't hide every row or every column */
  vis = 0;
  for (k = 0; k < flags.length; k++) if (!flags[k] && (k < lo || k > hi)) vis++;
  if (!vis) { setStatus(axis === "r" ? "Can't hide every row" : "Can't hide every column"); return; }
  undoRecord("hide");
  for (k = lo; k <= hi; k++) flags[k] = true;
  bumpSelOutOfHidden();
  if (typeof applyWidths === "function") applyWidths();
  else applyHiddenAndFreeze();
  highlightSel();
  saveStore();
  setStatus(axis === "r" ? TXT.rowsHidden : TXT.colsHidden);
}

function unhideAroundSelection() {
  var g = selRange(), r, c, any = false;
  for (r = g.r1; r <= g.r2; r++) if (hiddenRows[r]) any = true;
  for (c = g.c1; c <= g.c2; c++) if (hiddenCols[c]) any = true;
  /* Selecting around a gap: rows between the first and last selected, inclusive */
  if (!any) {
    for (r = g.r1; r <= g.r2; r++) if (hiddenRows[r]) any = true;
    for (c = g.c1; c <= g.c2; c++) if (hiddenCols[c]) any = true;
  }
  if (!any) { setStatus(TXT.nothingHidden); return; }
  undoRecord("unhide");
  for (r = g.r1; r <= g.r2; r++) hiddenRows[r] = false;
  for (c = g.c1; c <= g.c2; c++) hiddenCols[c] = false;
  if (typeof applyWidths === "function") applyWidths();
  else applyHiddenAndFreeze();
  highlightSel();
  saveStore();
  setStatus(TXT.unhidden);
}

function unhideAll() {
  var r, c, any = false;
  for (r = 0; r < ROWS; r++) if (hiddenRows[r]) any = true;
  for (c = 0; c < COLS; c++) if (hiddenCols[c]) any = true;
  if (!any) { setStatus(TXT.nothingHidden); return; }
  undoRecord("unhide-all");
  for (r = 0; r < ROWS; r++) hiddenRows[r] = false;
  for (c = 0; c < COLS; c++) hiddenCols[c] = false;
  if (typeof applyWidths === "function") applyWidths();
  else applyHiddenAndFreeze();
  highlightSel();
  saveStore();
  setStatus(TXT.unhidden);
}

function bumpSelOutOfHidden() {
  var n;
  if (hiddenRows[selR] || hiddenCols[selC]) {
    n = nextVisible(selR, selC, hiddenRows[selR] ? 1 : 0, hiddenCols[selC] ? 1 : 0);
    if (hiddenRows[n.r] || hiddenCols[n.c]) n = nextVisible(selR, selC, hiddenRows[selR] ? -1 : 0, hiddenCols[selC] ? -1 : 0);
    selR = n.r; selC = n.c;
  }
  if (hiddenRows[extR] || hiddenCols[extC]) { extR = selR; extC = selC; }
}

/* ---------- Hidden + freeze painting ---------- */

function applyHiddenAndFreeze() {
  /* SH24: sticky offsets apply to the visible window, not every row. */
  if (typeof layoutFrozenVirtual === "function" && document.getElementById("sheet-sizer")) {
    layoutFrozenVirtual();
    return;
  }
  var table = document.querySelector("table." + CLS.table);
  if (!table) return;
  var head = table.rows[0], r, c, tr, td, th, col, mark, top, left, z;
  var cols = table.querySelectorAll("col." + CLS.dataCol);
  var cellH = 30, rowHead = CFG.colWidth.rowHead;
  try {
    var cs = getComputedStyle(document.documentElement);
    cellH = parseFloat(cs.getPropertyValue("--cell-h")) || 30;
  } catch (e) {}
  if (head && head.cells[0]) {
    var hb = head.cells[0].getBoundingClientRect().height;
    if (hb) cellH = hb;
  }

  for (c = 0; c < COLS; c++) {
    if (cols[c]) cols[c].classList.toggle("sheet-hidden", !!hiddenCols[c]);
    th = head && head.cells[c + 1];
    if (th) th.classList.toggle("sheet-hidden", !!hiddenCols[c]);
  }
  for (r = 0; r < ROWS; r++) {
    tr = table.rows[r + 1];
    if (!tr) continue;
    tr.classList.toggle("sheet-hidden", rowHidden(r));
    for (c = 0; c < COLS; c++) {
      td = tr.cells[c + 1];
      if (td) td.classList.toggle("sheet-hidden", !!hiddenCols[c]);
    }
  }

  /* Hidden markers on the next visible header */
  if (head) {
    for (c = 0; c <= COLS; c++) {
      th = head.cells[c];
      if (th) th.classList.remove("hide-mark-left", "hide-mark-right");
    }
    for (c = 0; c < COLS; c++) {
      if (!hiddenCols[c]) continue;
      if (c > 0 && !hiddenCols[c - 1] && head.cells[c]) head.cells[c].classList.add("hide-mark-right");
      var n = c + 1;
      while (n < COLS && hiddenCols[n]) n++;
      if (n < COLS && head.cells[n + 1]) head.cells[n + 1].classList.add("hide-mark-left");
      else if (n >= COLS && head.cells[c]) head.cells[c].classList.add("hide-mark-right");
    }
  }
  for (r = 0; r < ROWS; r++) {
    tr = table.rows[r + 1];
    if (!tr || !tr.cells[0]) continue;
    tr.cells[0].classList.remove("hide-mark-top", "hide-mark-bottom");
  }
  for (r = 0; r < ROWS; r++) {
    if (!hiddenRows[r]) continue;
    if (r > 0 && !hiddenRows[r - 1] && table.rows[r] && table.rows[r].cells[0]) {
      table.rows[r].cells[0].classList.add("hide-mark-bottom");
    }
    n = r + 1;
    while (n < ROWS && hiddenRows[n]) n++;
    if (n < ROWS && table.rows[n + 1] && table.rows[n + 1].cells[0]) {
      table.rows[n + 1].cells[0].classList.add("hide-mark-top");
    }
  }

  /* Sticky freeze. Hidden rows/cols are skipped when summing offsets. */
  var lefts = [rowHead], acc = rowHead;
  for (c = 0; c < COLS; c++) {
    var w = 0;
    if (!hiddenCols[c] && cols[c]) {
      w = parseFloat(cols[c].style.width) || cols[c].getBoundingClientRect().width || 0;
    }
    if (c < (freeze.cols || 0)) { acc += w; lefts.push(acc); }
  }
  /* (before SH18)
  var tops = [cellH], tacc = cellH;
  for (r = 0; r < (freeze.rows || 0); r++) {
    if (!rowHidden(r)) tacc += cellH;
    tops.push(tacc);
  }
  */
  var tops = typeof freezeTopOffsets === "function"
    ? freezeTopOffsets(cellH, freeze.rows || 0, typeof usedRowHeight === "function" ? usedRowHeight : function () { return cellH; }, rowHidden)
    : (function () {
        var t = [cellH], acc = cellH, i;
        for (i = 0; i < (freeze.rows || 0); i++) {
          if (!rowHidden(i)) acc += cellH;
          t.push(acc);
        }
        return t;
      })();

  function setSticky(el, topVal, leftVal, zi) {
    if (!el) return;
    if (topVal == null && leftVal == null) {
      el.style.top = ""; el.style.left = "";
      if (!el.classList.contains(CLS.corner) && !el.classList.contains(CLS.colHead) && !el.classList.contains(CLS.rowNum)) {
        el.style.position = "";
        el.style.zIndex = "";
      } else {
        el.style.zIndex = "";
      }
      el.classList.remove("frozen-cell");
      return;
    }
    el.style.position = "sticky";
    if (topVal != null) el.style.top = topVal + "px"; else el.style.top = el.classList.contains(CLS.colHead) || el.classList.contains(CLS.corner) ? "0px" : "";
    if (leftVal != null) el.style.left = leftVal + "px"; else el.style.left = el.classList.contains(CLS.rowNum) || el.classList.contains(CLS.corner) ? "0px" : "";
    el.style.zIndex = String(zi);
    el.classList.add("frozen-cell");
  }

  /* Reset then apply */
  if (head) {
    for (c = 0; c <= COLS; c++) {
      th = head.cells[c];
      if (!th) continue;
      if (c === 0) setSticky(th, 0, 0, 6);
      else if (c - 1 < (freeze.cols || 0) && !hiddenCols[c - 1]) setSticky(th, 0, lefts[c - 1], 5);
      else setSticky(th, 0, null, 4);
    }
  }
  for (r = 0; r < ROWS; r++) {
    tr = table.rows[r + 1];
    if (!tr) continue;
    var fr = r < (freeze.rows || 0) && !rowHidden(r);
    var topVal = fr ? tops[r] : null;
    setSticky(tr.cells[0], topVal, 0, fr ? 5 : 3);
    for (c = 0; c < COLS; c++) {
      td = tr.cells[c + 1];
      var fc = c < (freeze.cols || 0) && !hiddenCols[c];
      if (!fr && !fc) { setSticky(td, null, null, 0); td.classList.remove("frozen-cell"); td.style.position = "relative"; td.style.top = ""; td.style.left = ""; td.style.zIndex = ""; }
      else setSticky(td, fr ? topVal : null, fc ? lefts[c] : null, (fr && fc) ? 3 : 2);
    }
  }
}

function updateStats() {
  var el = document.getElementById("sheet-stats");
  if (!el) return;
  var g = selRange(), r, c, n = 0, sum = 0, v;
  /* (before SH24) the loop below walked every cell of the selection, including empties.
  for (r = g.r1; r <= g.r2; r++) {
    for (c = g.c1; c <= g.c2; c++) {
      v = numVal(r, c, workbook.active);
      if (!isNaN(v)) { sum += v; n++; }
    }
  }
  */
  var span = (g.r2 - g.r1 + 1) * (g.c2 - g.c1 + 1);
  function take(r, c) {
    v = numVal(r, c, workbook.active);
    if (!isNaN(v)) { sum += v; n++; }
  }
  if (span > 4000 && typeof forEachReal === "function") {
    forEachReal(cells, function (r, c) {
      if (r < g.r1 || r > g.r2 || c < g.c1 || c > g.c2) return;
      take(r, c);
    });
  } else {
    for (r = g.r1; r <= g.r2; r++) for (c = g.c1; c <= g.c2; c++) take(r, c);
  }
  if (n === 0) { el.textContent = ""; el.hidden = true; return; }
  el.hidden = false;
  var avg = sum / n;
  function fmt(x) { return typeof roundNum === "function" ? String(roundNum(x)) : String(x); }
  el.textContent = "Average " + fmt(avg) + "   Count " + n + "   Sum " + fmt(sum);
}

/* ---------- Tab bar ---------- */

var sheetTabDrag = null;

function closeSheetMenu() {
  var m = document.getElementById("sheet-tab-menu");
  if (m) m.remove();
}

function openSheetMenu(idx, x, y) {
  closeSheetMenu();
  var menu = document.createElement("div");
  menu.id = "sheet-tab-menu";
  menu.className = "sheet-tab-menu";
  menu.setAttribute("role", "menu");
  function item(label, fn, disabled) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "sheet-tab-item";
    b.setAttribute("role", "menuitem");
    b.textContent = label;
    if (disabled) b.disabled = true;
    else b.addEventListener("click", function () { closeSheetMenu(); fn(); });
    menu.appendChild(b);
  }
  item("Rename…", function () { promptRename(idx); });
  item("Duplicate", function () { duplicateSheet(idx); });
  item("Delete…", function () { confirmDeleteSheet(idx); }, workbook.sheets.length <= 1);
  item("Move left", function () { moveSheet(idx, idx - 1); }, idx === 0);
  item("Move right", function () { moveSheet(idx, idx + 1); }, idx === workbook.sheets.length - 1);
  document.body.appendChild(menu);
  var w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.max(4, Math.min(x, window.innerWidth - w - 4)) + "px";
  menu.style.top = Math.max(4, Math.min(y - h, window.innerHeight - h - 4)) + "px";
}

function renderSheetTabs() {
  var bar = document.getElementById("sheet-tabs");
  if (!bar || !workbook) return;
  bar.innerHTML = "";
  var i, tab;
  for (i = 0; i < workbook.sheets.length; i++) {
    tab = document.createElement("button");
    tab.type = "button";
    tab.className = "sheet-tab" + (i === workbook.active ? " on" : "");
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", i === workbook.active ? "true" : "false");
    tab.textContent = workbook.sheets[i].name;
    tab.dataset.i = String(i);
    tab.title = workbook.sheets[i].name;
    tab.addEventListener("click", function (ev) {
      if (ev.detail === 0) switchSheet(parseInt(ev.currentTarget.dataset.i, 10));
      else switchSheet(parseInt(ev.currentTarget.dataset.i, 10));
    });
    tab.addEventListener("dblclick", function (ev) {
      ev.preventDefault();
      promptRename(parseInt(ev.currentTarget.dataset.i, 10));
    });
    tab.addEventListener("contextmenu", function (ev) {
      ev.preventDefault();
      openSheetMenu(parseInt(ev.currentTarget.dataset.i, 10), ev.clientX, ev.clientY);
    });
    tab.draggable = true;
    tab.addEventListener("dragstart", function (ev) {
      sheetTabDrag = parseInt(ev.currentTarget.dataset.i, 10);
      ev.dataTransfer.effectAllowed = "move";
      try { ev.dataTransfer.setData("text/plain", String(sheetTabDrag)); } catch (e) {}
    });
    tab.addEventListener("dragover", function (ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = "move"; });
    tab.addEventListener("drop", function (ev) {
      ev.preventDefault();
      var to = parseInt(ev.currentTarget.dataset.i, 10);
      var from = sheetTabDrag;
      sheetTabDrag = null;
      if (from == null || from === to) return;
      moveSheet(from, to);
    });
    bar.appendChild(tab);
  }
}

SHEET_INIT.push(function () {
  onBtn("btn-sheet-add", addSheet);
  onBtn("btn-freeze-top", freezeTopRow);
  onBtn("btn-freeze-first", freezeFirstCol);
  onBtn("btn-freeze-panes", freezeAtActive);
  onBtn("btn-unfreeze", unfreezePanes);
  onBtn("btn-hide-rows", function () { hideSelection("r"); });
  onBtn("btn-hide-cols", function () { hideSelection("c"); });
  onBtn("btn-unhide", unhideAroundSelection);
  onBtn("btn-unhide-all", unhideAll);
  document.addEventListener("click", function (ev) {
    var m = document.getElementById("sheet-tab-menu");
    if (m && !m.contains(ev.target)) closeSheetMenu();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") closeSheetMenu();
  });
  renderSheetTabs();
  updateStats();
});
