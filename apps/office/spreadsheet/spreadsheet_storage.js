/*
 * spreadsheet_storage.js
 * Save / load the workbook in localStorage (SH8: sheet-v3).
 * An older sheet-v2 (or v1) save is copied into Sheet1 on first load and left
 * in place as a backup; later loads use only v3.
 */

function serializeSheet(s) {
  var hiddenR = [], hiddenC = [], i;
  for (i = 0; i < ROWS; i++) if (s.hiddenRows[i]) hiddenR.push(i);
  for (i = 0; i < COLS; i++) if (s.hiddenCols[i]) hiddenC.push(i);
  return {
    name: s.name,
    cells: s.cells,
    widths: s.widths,
    hiddenRows: hiddenR,
    hiddenCols: hiddenC,
    freeze: { rows: s.freeze.rows || 0, cols: s.freeze.cols || 0 },
    sel: s.sel || [0, 0, 0, 0, "cell"]
  };
}

function serializeWorkbook() {
  stashSheetView();
  return {
    v: 3,
    cols: COLS,
    rows: ROWS,
    active: workbook.active,
    sheets: workbook.sheets.map(serializeSheet)
  };
}

function fillSheetCells(dst, srcCells) {
  var r, c, src;
  if (!srcCells) return;
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      src = srcCells[r] && srcCells[r][c];
      if (src) {
        dst.cells[r][c].formula = src.formula || "";
        dst.cells[r][c].value = src.value;
        dst.cells[r][c].style = Object.assign(defaultStyle(), src.style || {});
      }
    }
  }
}

function applyWidthsList(dst, list) {
  var c;
  for (c = 0; c < COLS; c++) dst.widths[c] = (list && typeof list[c] === "number") ? list[c] : null;
}

function applyFlagList(dst, list, n) {
  var i;
  for (i = 0; i < n; i++) dst[i] = false;
  if (Array.isArray(list)) {
    for (i = 0; i < list.length; i++) {
      if (list[i] === true && i < n) dst[i] = true;
      else if (typeof list[i] === "number" && list[i] >= 0 && list[i] < n) dst[list[i]] = true;
    }
  }
}

function deserializeSheet(raw, fallbackName) {
  var s = makeSheet(raw && raw.name ? String(raw.name).slice(0, CFG.sheets.nameMax) : fallbackName);
  if (!s.name) s.name = fallbackName;
  fillSheetCells(s, raw && raw.cells);
  applyWidthsList(s, raw && raw.widths);
  applyFlagList(s.hiddenRows, raw && raw.hiddenRows, ROWS);
  applyFlagList(s.hiddenCols, raw && raw.hiddenCols, COLS);
  if (raw && raw.freeze) {
    s.freeze.rows = Math.max(0, Math.min(ROWS, raw.freeze.rows | 0));
    s.freeze.cols = Math.max(0, Math.min(COLS, raw.freeze.cols | 0));
  }
  if (raw && Array.isArray(raw.sel) && raw.sel.length >= 4) s.sel = raw.sel.slice(0, 5);
  return s;
}

function uniqueName(name, used) {
  var base = (name || "Sheet").slice(0, CFG.sheets.nameMax), n = base, i = 2;
  var key = n.toLowerCase();
  while (used[key]) { n = (base + " (" + i + ")").slice(0, CFG.sheets.nameMax); key = n.toLowerCase(); i++; }
  used[key] = 1;
  return n;
}

/**
 * Save the workbook (and column widths, freeze, hidden, active sheet)
 */
function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(serializeWorkbook()));
    setStatus(TXT.saved);
  } catch (e) {
    setStatus(TXT.saveFailed);
  }
}

function loadLegacyGrid(data) {
  var s = makeSheet("Sheet1");
  fillSheetCells(s, data.cells);
  applyWidthsList(s, data.widths);
  workbook = { sheets: [s], active: 0 };
  bindActiveSheet();
}

/**
 * Load the workbook. sheet-v3 wins. If it is missing, a sheet-v2 / v1 save
 * is migrated into Sheet1 and v2/v1 are left untouched as a backup.
 */
function loadStore() {
  var raw, data;
  try {
    raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      data = JSON.parse(raw);
      if (data && Array.isArray(data.sheets) && data.sheets.length) {
        var used = {}, sheets = [], i, s, max = CFG.sheets.max || 20;
        for (i = 0; i < data.sheets.length && i < max; i++) {
          s = deserializeSheet(data.sheets[i], "Sheet" + (i + 1));
          s.name = uniqueName(s.name, used);
          sheets.push(s);
        }
        if (!sheets.length) return false;
        var act = data.active | 0;
        if (act < 0 || act >= sheets.length) act = 0;
        workbook = { sheets: sheets, active: act };
        bindActiveSheet();
        var sel = sheets[act].sel;
        if (sel && sel.length >= 4) {
          selR = sel[0]; selC = sel[1]; extR = sel[2]; extC = sel[3];
          selMode = sel[4] || "cell";
        }
        return true;
      }
      /* A v3 key that still looks like a single-sheet v2 payload */
      if (data && data.cells) { loadLegacyGrid(data); return true; }
      return false;
    }
    raw = localStorage.getItem(CFG.storage.legacyKey);
    if (!raw && CFG.storage.legacyKey1) raw = localStorage.getItem(CFG.storage.legacyKey1);
    if (!raw) return false;
    data = JSON.parse(raw);
    if (!data || !data.cells) return false;
    loadLegacyGrid(data);
    try { localStorage.setItem(STORE_KEY, JSON.stringify(serializeWorkbook())); } catch (e) {}
    return true;
  } catch (e) {
    return false;
  }
}
