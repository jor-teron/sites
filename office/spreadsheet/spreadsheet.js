/*
 * spreadsheet.js
 * Grid UI: 26 columns (A-Z) x 100 rows
 * LocalStorage, CSV, print, styles, selection, autofill drag
 * Formula engine lives in formula.js
 */

/* Number of columns A..Z */
var COLS = 26;

/* Number of data rows */
var ROWS = 100;

/* LocalStorage key */
var STORE_KEY = "sheet-v2";

/* Column letters A-Z */
var COL_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/* cells[r][c] store */
var cells = [];

/* Selected cell */
var selR = 0;
var selC = 0;

/* Column or row selection: "cell" | "col" | "row" */
var selMode = "cell";

/* Autofill drag state */
var fillDrag = null;

/* Cached input elements [r][c] */
var inpGrid = [];

/* Default cell style */
function defaultStyle() {
  return {
    align: "center",
    bold: false,
    italic: false,
    underline: false,
    bg: "",
    color: ""
  };
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
 * Save grid
 */
function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ cols: COLS, rows: ROWS, cells: cells }));
    setStatus("Saved");
  } catch (e) {
    setStatus("Save failed");
  }
}

/**
 * Load grid
 */
function loadStore() {
  var raw, data, r, c, src;
  try {
    raw = localStorage.getItem(STORE_KEY);
    if (!raw) raw = localStorage.getItem("sheet-v1");
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
 * Export formulas as CSV
 */
function exportCsv() {
  var r, c, row, f, lines = [];
  for (r = 0; r < ROWS; r++) {
    row = [];
    for (c = 0; c < COLS; c++) {
      f = cells[r][c].formula;
      if (f == null) f = "";
      f = String(f);
      if (/[",\n]/.test(f)) f = '"' + f.replace(/"/g, '""') + '"';
      row.push(f);
    }
    lines.push(row.join(","));
  }
  downloadText("sheet.csv", lines.join("\n"));
}

/**
 * File download helper
 */
function downloadText(name, text) {
  var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Import CSV
 */
function importCsvText(text) {
  var rows = parseCsv(text);
  var r, c, val;
  emptyGrid();
  for (r = 0; r < Math.min(ROWS, rows.length); r++) {
    for (c = 0; c < Math.min(COLS, rows[r].length); c++) {
      val = rows[r][c];
      cells[r][c].formula = val;
    }
  }
  recalcAll();
  paintAll();
  saveStore();
  setStatus("CSV loaded");
}

/**
 * Minimal CSV parser
 */
function parseCsv(text) {
  var rows = [];
  var row = [];
  var cur = "";
  var i, ch, inQ = false;
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
      if (ch === '"') inQ = true;
      else if (ch === ",") {
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
  table.className = "sheet";
  var colgroup = document.createElement("colgroup");
  var col, r, c, tr, th, td, inp, handle;

  col = document.createElement("col");
  col.className = "row-head";
  colgroup.appendChild(col);
  for (c = 0; c < COLS; c++) {
    col = document.createElement("col");
    col.className = "data";
    colgroup.appendChild(col);
  }
  table.appendChild(colgroup);

  tr = document.createElement("tr");
  th = document.createElement("th");
  th.className = "corner";
  tr.appendChild(th);
  for (c = 0; c < COLS; c++) {
    th = document.createElement("th");
    th.className = "col-head";
    th.textContent = colLetter(c);
    th.dataset.c = String(c);
    th.addEventListener("click", onColHeadClick);
    tr.appendChild(th);
  }
  table.appendChild(tr);

  inpGrid = [];
  for (r = 0; r < ROWS; r++) {
    inpGrid[r] = [];
    tr = document.createElement("tr");
    td = document.createElement("td");
    td.className = "row-num";
    td.textContent = String(r + 1);
    td.dataset.r = String(r);
    td.addEventListener("click", onRowHeadClick);
    tr.appendChild(td);
    for (c = 0; c < COLS; c++) {
      td = document.createElement("td");
      td.className = "cell";
      td.dataset.r = String(r);
      td.dataset.c = String(c);
      inp = document.createElement("input");
      inp.setAttribute("spellcheck", "false");
      inp.dataset.r = String(r);
      inp.dataset.c = String(c);
      bindCell(inp, r, c);
      inpGrid[r][c] = inp;
      td.appendChild(inp);
      handle = document.createElement("span");
      handle.className = "fill-handle";
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
 * Click column letter
 */
function onColHeadClick(ev) {
  var c = parseInt(ev.currentTarget.dataset.c, 10);
  selC = c;
  selR = 0;
  selMode = "col";
  highlightSel();
  setStatus("Column " + colLetter(c));
}

/**
 * Click row number
 */
function onRowHeadClick(ev) {
  var r = parseInt(ev.currentTarget.dataset.r, 10);
  selR = r;
  selC = 0;
  selMode = "row";
  highlightSel();
  setStatus("Row " + (r + 1));
}

/**
 * Bind one cell input
 */
function bindCell(inp, r, c) {
  inp.addEventListener("focus", function () {
    selR = r;
    selC = c;
    selMode = "cell";
    inp.value = cells[r][c].formula;
    document.getElementById("formula-bar").value = cells[r][c].formula;
    highlightSel();
    syncStyleUi();
  });
  inp.addEventListener("blur", function () {
    commitCell(r, c, inp.value);
  });
  inp.addEventListener("keydown", onCellKey);
}

/**
 * Arrow / Enter / Tab
 */
function onCellKey(ev) {
  var r = selR;
  var c = selC;
  if (ev.key === "Enter") {
    ev.preventDefault();
    ev.target.blur();
    focusCell(Math.min(ROWS - 1, r + 1), c);
  } else if (ev.key === "Tab") {
    ev.preventDefault();
    ev.target.blur();
    focusCell(r, ev.shiftKey ? Math.max(0, c - 1) : Math.min(COLS - 1, c + 1));
  } else if (ev.key === "ArrowUp" && !ev.shiftKey) {
    ev.preventDefault();
    ev.target.blur();
    focusCell(Math.max(0, r - 1), c);
  } else if (ev.key === "ArrowDown" && !ev.shiftKey) {
    ev.preventDefault();
    ev.target.blur();
    focusCell(Math.min(ROWS - 1, r + 1), c);
  } else if (ev.key === "ArrowLeft" && ev.target.selectionStart === 0) {
    ev.preventDefault();
    ev.target.blur();
    focusCell(r, Math.max(0, c - 1));
  } else if (ev.key === "ArrowRight" && ev.target.selectionStart === ev.target.value.length) {
    ev.preventDefault();
    ev.target.blur();
    focusCell(r, Math.min(COLS - 1, c + 1));
  }
}

/**
 * Document-level arrows when not typing
 */
function onDocKey(ev) {
  var tag = ev.target && ev.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (ev.key === "ArrowUp") {
    ev.preventDefault();
    focusCell(Math.max(0, selR - 1), selC);
  } else if (ev.key === "ArrowDown") {
    ev.preventDefault();
    focusCell(Math.min(ROWS - 1, selR + 1), selC);
  } else if (ev.key === "ArrowLeft") {
    ev.preventDefault();
    focusCell(selR, Math.max(0, selC - 1));
  } else if (ev.key === "ArrowRight") {
    ev.preventDefault();
    focusCell(selR, Math.min(COLS - 1, selC + 1));
  }
}

/**
 * Write formula and recalc
 */
function commitCell(r, c, text) {
  cells[r][c].formula = text;
  recalcAll();
  paintAll();
  saveStore();
}

/**
 * Focus cell
 */
function focusCell(r, c) {
  selR = r;
  selC = c;
  selMode = "cell";
  var inp = document.querySelector('input[data-r="' + r + '"][data-c="' + c + '"]');
  if (inp) inp.focus();
}

/**
 * Highlight selection
 */
function highlightSel() {
  var all = document.querySelectorAll(".selected, .sel-band");
  var i, r, c, td, th;
  for (i = 0; i < all.length; i++) all[i].classList.remove("selected", "sel-band");

  if (selMode === "col") {
    th = document.querySelector("th.col-head[data-c=\"" + selC + "\"]");
    if (th) th.classList.add("sel-band");
    for (r = 0; r < ROWS; r++) {
      td = document.querySelector('td.cell[data-r="' + r + '"][data-c="' + selC + '"]');
      if (td) td.classList.add("sel-band");
    }
    return;
  }
  if (selMode === "row") {
    td = document.querySelector("td.row-num[data-r=\"" + selR + "\"]");
    if (td) td.classList.add("sel-band");
    for (c = 0; c < COLS; c++) {
      td = document.querySelector('td.cell[data-r="' + selR + '"][data-c="' + c + '"]');
      if (td) td.classList.add("sel-band");
    }
    return;
  }
  td = document.querySelector('td.cell[data-r="' + selR + '"][data-c="' + selC + '"]');
  if (td) td.classList.add("selected");
}

/**
 * Apply style object to a td + input
 */
function applyLook(td, inp, st) {
  inp.style.textAlign = st.align || "center";
  inp.style.fontWeight = st.bold ? "700" : "";
  inp.style.fontStyle = st.italic ? "italic" : "";
  inp.style.textDecoration = st.underline ? "underline" : "";
  td.style.background = st.bg || "";
  inp.style.color = st.color || "";
}

/**
 * Paint values and styles
 */
function paintAll() {
  var r, c, inp, v, td, st;
  var active = document.activeElement;
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      inp = inpGrid[r] && inpGrid[r][c];
      if (!inp) continue;
      td = inp.parentNode;
      st = cellStyle(r, c);
      applyLook(td, inp, st);
      if (inp === active) continue;
      v = cells[r][c].value;
      inp.value = v === undefined || v === null ? "" : String(v);
      if (v === ERR || v === "#DIV/0!") td.classList.add("error");
      else td.classList.remove("error");
    }
  }
}

/**
 * Toolbar style controls from current cell
 */
function syncStyleUi() {
  var st = cellStyle(selR, selC);
  document.getElementById("align-sel").value = st.align || "center";
  document.getElementById("btn-bold").classList.toggle("on", !!st.bold);
  document.getElementById("btn-italic").classList.toggle("on", !!st.italic);
  document.getElementById("btn-under").classList.toggle("on", !!st.underline);
  document.getElementById("fill-color").value = st.bg || "#1e1e1e";
  document.getElementById("text-color").value = st.color || "#e8e8e8";
}

/**
 * Apply style to selection (cell / row / col)
 */
function forSelection(fn) {
  var r, c;
  if (selMode === "col") {
    for (r = 0; r < ROWS; r++) fn(r, selC);
  } else if (selMode === "row") {
    for (c = 0; c < COLS; c++) fn(selR, c);
  } else {
    fn(selR, selC);
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
  var td = el.closest ? el.closest("td.cell") : null;
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
  runAutofill(fillDrag.r0, fillDrag.c0, fillDrag.r1, fillDrag.c1);
  fillDrag = null;
  recalcAll();
  paintAll();
  saveStore();
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

/**
 * Wire toolbar
 */
function wireUi() {
  document.getElementById("btn-export").addEventListener("click", exportCsv);
  document.getElementById("btn-print").addEventListener("click", printSheet);
  document.getElementById("btn-clear").addEventListener("click", function () {
    if (!confirm("Clear entire sheet?")) return;
    emptyGrid();
    recalcAll();
    paintAll();
    saveStore();
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
    if (ev.key === "Enter") {
      ev.preventDefault();
      commitCell(selR, selC, ev.target.value);
      focusCell(selR, selC);
    }
  });
  document.getElementById("align-sel").addEventListener("change", function (ev) {
    forSelection(function (r, c) { cellStyle(r, c).align = ev.target.value; });
    paintAll();
    saveStore();
  });
  document.getElementById("btn-bold").addEventListener("click", function () {
    forSelection(function (r, c) { cellStyle(r, c).bold = !cellStyle(r, c).bold; });
    paintAll();
    syncStyleUi();
    saveStore();
  });
  document.getElementById("btn-italic").addEventListener("click", function () {
    forSelection(function (r, c) { cellStyle(r, c).italic = !cellStyle(r, c).italic; });
    paintAll();
    syncStyleUi();
    saveStore();
  });
  document.getElementById("btn-under").addEventListener("click", function () {
    forSelection(function (r, c) { cellStyle(r, c).underline = !cellStyle(r, c).underline; });
    paintAll();
    syncStyleUi();
    saveStore();
  });
  document.getElementById("fill-color").addEventListener("input", function (ev) {
    forSelection(function (r, c) { cellStyle(r, c).bg = ev.target.value; });
    paintAll();
    saveStore();
  });
  document.getElementById("text-color").addEventListener("input", function (ev) {
    forSelection(function (r, c) { cellStyle(r, c).color = ev.target.value; });
    paintAll();
    saveStore();
  });
  document.addEventListener("keydown", onDocKey);
}

/**
 * Boot
 */
function boot() {
  emptyGrid();
  loadStore();
  recalcAll();
  buildTable();
  paintAll();
  wireUi();
  setStatus("A–Z × 100");
}

document.addEventListener("DOMContentLoaded", boot);
