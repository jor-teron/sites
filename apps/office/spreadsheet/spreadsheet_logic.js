/*
 * spreadsheet_logic.js
 * Grid UI: columns x rows from SPREADSHEET_CONFIG (spreadsheet_config.js)
 * LocalStorage, CSV, print, styles, cell editing, autofill drag.
 * Cells have two modes: selected (input is readOnly; typing starts an edit, F2 / double-click
 * edits the current text) and editing. Shortcuts, block selection, clipboard, undo, rows /
 * columns, sort, number formats and column widths live in the spreadsheet_*.js modules,
 * which add start-up functions to SHEET_INIT.
 * Formula engine lives in spreadsheet_formula.js (uses the COLS, ROWS, COL_LETTERS, cells globals below)
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
 * Save grid (and column widths)
 */
function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ cols: COLS, rows: ROWS, cells: cells, widths: colWidths }));
    setStatus(TXT.saved);
  } catch (e) {
    setStatus(TXT.saveFailed);
  }
}

/**
 * Load grid. Older saves (no widths, no number format) load as before.
 */
function loadStore() {
  var raw, data, r, c, src;
  try {
    raw = localStorage.getItem(STORE_KEY);
    if (!raw) raw = localStorage.getItem(CFG.storage.legacyKey);
    if (!raw) return false;
    data = JSON.parse(raw);
    if (!data || !data.cells) return false;
    emptyGrid();
    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        src = data.cells[r] && data.cells[r][c];
        if (src) {
          cells[r][c].formula = src.formula || "";
          cells[r][c].value = src.value;
          cells[r][c].style = Object.assign(defaultStyle(), src.style || {});
        }
      }
    }
    colWidths = [];
    if (Array.isArray(data.widths)) {
      for (c = 0; c < COLS; c++) colWidths[c] = typeof data.widths[c] === "number" ? data.widths[c] : null;
    }
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Status text
 */
function setStatus(msg) {
  var el = document.getElementById("status");
  if (el) el.textContent = msg;
}

/**
 * Recalc, repaint and save after any change to cells
 */
function afterChange() {
  recalcAll();
  paintAll();
  syncStyleUi();
  saveStore();
}

/**
 * Export formulas as CSV. Trailing empty rows and columns are left out
 * (blank cells inside the used area are kept).
 */
function exportCsv() {
  var r, c, row, f, lines = [], lastR = -1, lastC = -1;
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      f = cells[r][c].formula;
      if (f != null && String(f) !== "") {
        if (r > lastR) lastR = r;
        if (c > lastC) lastC = c;
      }
    }
  }
  for (r = 0; r <= lastR; r++) {
    row = [];
    for (c = 0; c <= lastC; c++) {
      f = cells[r][c].formula;
      if (f == null) f = "";
      f = String(f);
      if (/[",\n]/.test(f)) f = '"' + f.replace(/"/g, '""') + '"';
      row.push(f);
    }
    lines.push(row.join(","));
  }
  downloadText(CFG.csv.exportName, lines.join("\n"));
}

/**
 * Trigger file download
 */
function downloadText(name, text) {
  var blob = new Blob([text], { type: CFG.csv.mime });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Import CSV (undoable)
 */
function importCsvText(text) {
  var rows = parseCsv(text);
  var r, c;
  undoRecord("import");
  emptyGrid();
  for (r = 0; r < Math.min(ROWS, rows.length); r++) {
    for (c = 0; c < Math.min(COLS, rows[r].length); c++) {
      cells[r][c].formula = rows[r][c];
    }
  }
  afterChange();
  setStatus(TXT.csvLoaded);
}

/**
 * Minimal CSV / TSV parser (sep defaults to ",")
 */
function parseCsv(text, sep) {
  var rows = [];
  var row = [];
  var cur = "";
  var i, ch, inQ = false;
  sep = sep || ",";
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (i = 0; i < text.length; i++) {
    ch = text.charAt(i);
    if (inQ) {
      if (ch === '"' && text.charAt(i + 1) === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"' && cur === "") inQ = true;
      else if (ch === sep) {
        row.push(cur);
        cur = "";
      } else if (ch === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else cur += ch;
    }
  }
  row.push(cur);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

/**
 * Print via browser dialog (Save as PDF there)
 */
function printSheet() {
  window.print();
}

/**
 * Build table DOM
 */
function buildTable() {
  var wrap = document.getElementById("sheet-wrap");
  var table = document.createElement("table");
  table.className = CLS.table;
  var colgroup = document.createElement("colgroup");
  var col, r, c, tr, th, td, inp, handle, grip;

  col = document.createElement("col");
  col.className = CLS.rowHeadCol;
  colgroup.appendChild(col);
  for (c = 0; c < COLS; c++) {
    col = document.createElement("col");
    col.className = CLS.dataCol;
    colgroup.appendChild(col);
  }
  table.appendChild(colgroup);

  tr = document.createElement("tr");
  th = document.createElement("th");
  th.className = CLS.corner;
  th.title = TXT.selectAll;
  th.addEventListener("click", function () { selectAll(); });
  tr.appendChild(th);
  for (c = 0; c < COLS; c++) {
    th = document.createElement("th");
    th.className = CLS.colHead;
    th.textContent = colLetter(c);
    th.dataset.c = String(c);
    th.addEventListener("click", onColHeadClick);
    grip = document.createElement("span");
    grip.className = CLS.colGrip;
    grip.dataset.c = String(c);
    th.appendChild(grip);
    tr.appendChild(th);
  }
  table.appendChild(tr);

  inpGrid = [];
  for (r = 0; r < ROWS; r++) {
    inpGrid[r] = [];
    tr = document.createElement("tr");
    td = document.createElement("td");
    td.className = CLS.rowNum;
    td.textContent = String(r + 1);
    td.dataset.r = String(r);
    td.addEventListener("click", onRowHeadClick);
    tr.appendChild(td);
    for (c = 0; c < COLS; c++) {
      td = document.createElement("td");
      td.className = CLS.cell;
      td.dataset.r = String(r);
      td.dataset.c = String(c);
      inp = document.createElement("input");
      inp.setAttribute("spellcheck", "false");
      inp.readOnly = true;
      inp.dataset.r = String(r);
      inp.dataset.c = String(c);
      bindCell(inp, r, c);
      inpGrid[r][c] = inp;
      td.appendChild(inp);
      handle = document.createElement("span");
      handle.className = CLS.fillHandle;
      handle.dataset.r = String(r);
      handle.dataset.c = String(c);
      handle.addEventListener("mousedown", onFillStart);
      td.appendChild(handle);
      tr.appendChild(td);
    }
    table.appendChild(tr);
  }
  wrap.innerHTML = "";
  wrap.appendChild(table);
}

/**
 * Click column letter: select the whole column (Shift = extend)
 */
function onColHeadClick(ev) {
  if (ev.target.classList.contains(CLS.colGrip)) return;
  var c = parseInt(ev.currentTarget.dataset.c, 10);
  blurEditing();
  if (!ev.shiftKey) selC = c;
  selR = 0; extR = ROWS - 1; extC = c;
  selMode = "col";
  highlightSel();
  setStatus(TXT.columnPrefix + colLetter(c));
}

/**
 * Click row number: select the whole row (Shift = extend)
 */
function onRowHeadClick(ev) {
  var r = parseInt(ev.currentTarget.dataset.r, 10);
  blurEditing();
  if (!ev.shiftKey) selR = r;
  selC = 0; extC = COLS - 1; extR = r;
  selMode = "row";
  highlightSel();
  setStatus(TXT.rowPrefix + (r + 1));
}

/* Leave the current cell (commits an edit) without selecting another */
function blurEditing() {
  var a = document.activeElement;
  if (a && a.dataset && a.dataset.r != null && a.tagName === "INPUT") a.blur();
}

/* True while the user is typing in a cell */
function isEditing(el) {
  return !!(el && el.tagName === "INPUT" && el.dataset.r != null && !el.readOnly);
}

/* Switch a cell input to editing; keep = keep current text (F2 / double-click) */
function startEdit(inp, keep) {
  inp.readOnly = false;
  if (!keep) inp.value = "";
  else { var n = inp.value.length; inp.setSelectionRange(n, n); }
}

/**
 * Bind one cell input
 */
function bindCell(inp, r, c) {
  inp.addEventListener("focus", function () {
    selR = r;
    selC = c;
    if (!keepExtent) { extR = r; extC = c; selMode = "cell"; }
    inp.readOnly = true;
    inp.value = cells[r][c].formula;
    document.getElementById("formula-bar").value = cells[r][c].formula;
    highlightSel();
    syncStyleUi();
  });
  inp.addEventListener("blur", function () {
    var editing = !inp.readOnly;
    inp.readOnly = true;
    if (editing && inp.value !== String(cells[r][c].formula == null ? "" : cells[r][c].formula)) commitCell(r, c, inp.value);
    else paintCell(r, c);
  });
  inp.addEventListener("dblclick", function () { if (inp.readOnly) startEdit(inp, true); });
  inp.addEventListener("keydown", onCellKey);
}

/* Set while focus moves inside a block selection (keeps the block) */
var keepExtent = false;

/**
 * Keys inside a cell: selected mode (navigate, type to start editing) or editing mode
 */
function onCellKey(ev) {
  var inp = ev.target;
  var r = selR;
  var c = selC;
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;      // shortcuts: spreadsheet_keys.js
  if (inp.readOnly) {
    if (ev.key === "F2") { ev.preventDefault(); startEdit(inp, true); return; }
    if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); clearSelection(); return; }
    if (ev.key.length === 1) { startEdit(inp, false); return; }   // the key's character goes in
  } else if (ev.key === "Escape") {
    ev.preventDefault();
    inp.value = cells[r][c].formula;
    inp.readOnly = true;
    return;
  }
  if (ev.shiftKey && !isEditing(inp) && moveExtent(ev.key)) { ev.preventDefault(); return; }
  if (ev.key === KEYS.commit) {
    ev.preventDefault();
    inp.blur();
    focusCell(Math.min(ROWS - 1, r + 1), c);
  } else if (ev.key === KEYS.next) {
    ev.preventDefault();
    inp.blur();
    focusCell(r, ev.shiftKey ? Math.max(0, c - 1) : Math.min(COLS - 1, c + 1));
  } else if (ev.key === KEYS.up) {
    ev.preventDefault();
    inp.blur();
    focusCell(Math.max(0, r - 1), c);
  } else if (ev.key === KEYS.down) {
    ev.preventDefault();
    inp.blur();
    focusCell(Math.min(ROWS - 1, r + 1), c);
  } else if (ev.key === KEYS.left && (inp.readOnly || inp.selectionStart === 0)) {
    ev.preventDefault();
    inp.blur();
    focusCell(r, Math.max(0, c - 1));
  } else if (ev.key === KEYS.right && (inp.readOnly || inp.selectionStart === inp.value.length)) {
    ev.preventDefault();
    inp.blur();
    focusCell(r, Math.min(COLS - 1, c + 1));
  }
}

/**
 * Document-level keys when no cell has focus (e.g. after a header click)
 */
function onDocKey(ev) {
  var t = ev.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.shiftKey && moveExtent(ev.key)) { ev.preventDefault(); return; }
  if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); clearSelection(); return; }
  if (ev.key === KEYS.up) {
    ev.preventDefault();
    focusCell(Math.max(0, selR - 1), selC);
  } else if (ev.key === KEYS.down) {
    ev.preventDefault();
    focusCell(Math.min(ROWS - 1, selR + 1), selC);
  } else if (ev.key === KEYS.left) {
    ev.preventDefault();
    focusCell(selR, Math.max(0, selC - 1));
  } else if (ev.key === KEYS.right) {
    ev.preventDefault();
    focusCell(selR, Math.min(COLS - 1, selC + 1));
  } else if (ev.key === KEYS.commit || ev.key === "F2") {
    ev.preventDefault();
    focusCell(selR, selC);
  }
}

/**
 * Write formula and recalc (undoable)
 */
function commitCell(r, c, text) {
  if (String(cells[r][c].formula == null ? "" : cells[r][c].formula) === text) return;
  undoRecord("edit");
  cells[r][c].formula = text;
  afterChange();
}

/**
 * Focus cell (collapses the block to that cell)
 */
function focusCell(r, c) {
  selR = r;
  selC = c;
  extR = r;
  extC = c;
  selMode = "cell";
  var inp = inpGrid[r] && inpGrid[r][c];
  if (inp) {
    if (document.activeElement === inp) highlightSel();
    else inp.focus();
  }
}

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
 * Highlight selection: active cell outline, block band, header bands
 */
function highlightSel() {
  var all = document.querySelectorAll("." + CLS.selected + ", ." + CLS.band);
  var i, r, c, g = selRange(), multi = g.r1 !== g.r2 || g.c1 !== g.c2;
  for (i = 0; i < all.length; i++) all[i].classList.remove(CLS.selected, CLS.band);
  if (multi) {
    for (r = g.r1; r <= g.r2; r++) {
      for (c = g.c1; c <= g.c2; c++) inpGrid[r][c].parentNode.classList.add(CLS.band);
    }
  }
  for (c = g.c1; c <= g.c2; c++) {
    var th = document.querySelector("th." + CLS.colHead + '[data-c="' + c + '"]');
    if (th) th.classList.add(CLS.band);
  }
  for (r = g.r1; r <= g.r2; r++) {
    var rn = document.querySelector("td." + CLS.rowNum + '[data-r="' + r + '"]');
    if (rn) rn.classList.add(CLS.band);
  }
  if (inpGrid[selR] && inpGrid[selR][selC]) inpGrid[selR][selC].parentNode.classList.add(CLS.selected);
  if (multi) setStatus(rangeLabel());
}

/**
 * Apply style object to a td + input
 */
function applyLook(td, inp, st) {
  inp.style.textAlign = st.align || CFG.defaultStyle.align;
  inp.style.fontWeight = st.bold ? CFG.boldWeight : "";
  inp.style.fontStyle = st.italic ? "italic" : "";
  inp.style.textDecoration = st.underline ? "underline" : "";
  td.style.background = st.bg || "";
  inp.style.color = st.color || "";
}

/**
 * Paint one cell: style, shown value (number format applied), error style
 */
function paintCell(r, c) {
  var inp = inpGrid[r] && inpGrid[r][c];
  if (!inp) return;
  var td = inp.parentNode, st = cellStyle(r, c), v = cells[r][c].value;
  applyLook(td, inp, st);
  if (inp === document.activeElement) return;
  inp.value = formatCellValue(v, st.fmt);
  if (v === ERR || CFG.errorValues.indexOf(v) !== -1) td.classList.add(CLS.error);
  else td.classList.remove(CLS.error);
}

/**
 * Paint values and styles
 */
function paintAll() {
  var r, c;
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) paintCell(r, c);
  }
}

/**
 * Toolbar style controls from current cell
 */
function syncStyleUi() {
  var st = cellStyle(selR, selC);
  document.getElementById("align-sel").value = st.align || CFG.defaultStyle.align;
  document.getElementById("btn-bold").classList.toggle(CLS.toggleOn, !!st.bold);
  document.getElementById("btn-italic").classList.toggle(CLS.toggleOn, !!st.italic);
  document.getElementById("btn-under").classList.toggle(CLS.toggleOn, !!st.underline);
  document.getElementById("fill-color").value = st.bg || CFG.colors.fillPicker;
  document.getElementById("text-color").value = st.color || CFG.colors.textPicker;
  var fs = document.getElementById("fmt-sel");
  if (fs) fs.value = st.fmt || "general";
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

/* Change the style of the block (undoable; colour pickers merge while dragging) */
function styleSelection(tag, fn) {
  undoRecord(tag);
  forSelection(function (r, c) { fn(cellStyle(r, c)); });
  paintAll();
  syncStyleUi();
  saveStore();
}

/* Clear formulas / values of the block (styles stay) */
function clearSelection() {
  var any = false;
  forSelection(function (r, c) { if (cells[r][c].formula !== "") any = true; });
  if (!any) return;
  undoRecord("clear");
  forSelection(function (r, c) { cells[r][c].formula = ""; });
  afterChange();
  if (inpGrid[selR] && document.activeElement === inpGrid[selR][selC]) {
    inpGrid[selR][selC].value = "";
    document.getElementById("formula-bar").value = "";
  }
}

/**
 * Start autofill drag
 */
function onFillStart(ev) {
  ev.preventDefault();
  ev.stopPropagation();
  fillDrag = { r0: selR, c0: selC };
  document.addEventListener("mousemove", onFillMove);
  document.addEventListener("mouseup", onFillEnd);
}

/**
 * Track fill target cell under pointer
 */
function onFillMove(ev) {
  var el = document.elementFromPoint(ev.clientX, ev.clientY);
  if (!el) return;
  var td = el.closest ? el.closest("td." + CLS.cell) : null;
  if (!td) return;
  fillDrag.r1 = parseInt(td.dataset.r, 10);
  fillDrag.c1 = parseInt(td.dataset.c, 10);
}

/**
 * Fill down or right from origin
 */
function onFillEnd() {
  document.removeEventListener("mousemove", onFillMove);
  document.removeEventListener("mouseup", onFillEnd);
  if (!fillDrag || fillDrag.r1 == null) {
    fillDrag = null;
    return;
  }
  undoRecord("fill");
  runAutofill(fillDrag.r0, fillDrag.c0, fillDrag.r1, fillDrag.c1);
  fillDrag = null;
  afterChange();
}

/**
 * Copy / series from (r0,c0) toward (r1,c1)
 * Vertical or horizontal only (Excel-like simple fill)
 */
function runAutofill(r0, c0, r1, c1) {
  var src = cells[r0][c0];
  var f = src.formula;
  var n = Number(src.value);
  var isNum = f && f.charAt(0) !== "=" && !isNaN(n) && String(src.value).trim() !== "";
  var r, c, step, i;

  if (Math.abs(r1 - r0) >= Math.abs(c1 - c0)) {
    step = r1 >= r0 ? 1 : -1;
    i = 1;
    for (r = r0 + step; step > 0 ? r <= r1 : r >= r1; r += step, i++) {
      if (f && String(f).charAt(0) === "=") {
        cells[r][c0].formula = shiftFormula(f, r - r0, 0);
      } else if (isNum) {
        cells[r][c0].formula = String(n + i * step);
      } else {
        cells[r][c0].formula = f;
      }
      cells[r][c0].style = Object.assign(defaultStyle(), src.style);
    }
  } else {
    step = c1 >= c0 ? 1 : -1;
    i = 1;
    for (c = c0 + step; step > 0 ? c <= c1 : c >= c1; c += step, i++) {
      if (f && String(f).charAt(0) === "=") {
        cells[r0][c].formula = shiftFormula(f, 0, c - c0);
      } else if (isNum) {
        cells[r0][c].formula = String(n + i * step);
      } else {
        cells[r0][c].formula = f;
      }
      cells[r0][c].style = Object.assign(defaultStyle(), src.style);
    }
  }
}

/* Click helper */
function onBtn(id, fn) {
  var el = document.getElementById(id);
  if (el) el.addEventListener("click", fn);
}

/**
 * Wire toolbar
 */
function wireUi() {
  onBtn("btn-export", exportCsv);
  onBtn("btn-print", printSheet);
  onBtn("btn-clear", function () {
    if (!confirm(TXT.confirmClear)) return;
    undoRecord("clear-all");
    emptyGrid();
    afterChange();
  });
  document.getElementById("file-import").addEventListener("change", function (ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { importCsvText(String(reader.result)); };
    reader.readAsText(file);
    ev.target.value = "";
  });
  document.getElementById("formula-bar").addEventListener("keydown", function (ev) {
    if (ev.key === KEYS.commit) {
      ev.preventDefault();
      commitCell(selR, selC, ev.target.value);
      focusCell(selR, selC);
    }
  });
  document.getElementById("align-sel").addEventListener("change", function (ev) {
    styleSelection("align", function (st) { st.align = ev.target.value; });
  });
  onBtn("btn-bold", function () {
    var on = !cellStyle(selR, selC).bold;
    styleSelection("bold", function (st) { st.bold = on; });
  });
  onBtn("btn-italic", function () {
    var on = !cellStyle(selR, selC).italic;
    styleSelection("italic", function (st) { st.italic = on; });
  });
  onBtn("btn-under", function () {
    var on = !cellStyle(selR, selC).underline;
    styleSelection("underline", function (st) { st.underline = on; });
  });
  document.getElementById("fill-color").addEventListener("input", function (ev) {
    styleSelection("fill-color", function (st) { st.bg = ev.target.value; });
  });
  document.getElementById("text-color").addEventListener("input", function (ev) {
    styleSelection("text-color", function (st) { st.color = ev.target.value; });
  });
  document.addEventListener("keydown", onDocKey);
}

/**
 * Boot
 */
function boot() {
  var i;
  emptyGrid();
  loadStore();
  recalcAll();
  buildTable();
  wireUi();
  for (i = 0; i < SHEET_INIT.length; i++) {
    try { SHEET_INIT[i](); } catch (e) { console.warn("spreadsheet: init failed", e); }
  }
  paintAll();
  highlightSel();
  setStatus(TXT.ready);
}

document.addEventListener("DOMContentLoaded", boot);
