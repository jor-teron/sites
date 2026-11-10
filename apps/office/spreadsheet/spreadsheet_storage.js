/*
 * spreadsheet_storage.js
 * Save / load the workbook in localStorage (SH12: sheet-v4).
 * Older sheet-v3 / v2 / v1 saves are migrated into v4 on first load and left
 * in place as a backup; later loads use only v4. Charts live on each sheet.
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
    sel: s.sel || [0, 0, 0, 0, "cell"],
    filters: s.filters || { on: false, r1: 0, r2: 0, c1: 0, c2: 0, cols: {} },
    validations: s.validations || [],
    merges: s.merges || [],
    condFormats: s.condFormats || [],
    charts: s.charts || []
  };
}

function serializeWorkbook() {
  stashSheetView();
  return {
    v: 4,
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
  if (raw && raw.filters) s.filters = raw.filters;
  if (raw && Array.isArray(raw.validations)) s.validations = raw.validations;
  if (raw && Array.isArray(raw.merges)) s.merges = raw.merges;
  if (raw && Array.isArray(raw.condFormats)) s.condFormats = raw.condFormats;
  if (raw && Array.isArray(raw.charts)) s.charts = raw.charts;
  if (typeof applyFilters === "function") {
    /* compute filterHidden after the workbook is bound; loadStore does it per sheet later */
  }
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
 * Build a workbook from a parsed localStorage payload (v4, v3, or a legacy grid).
 * Returns true on success. Does not write storage.
 */
function applyWorkbookPayload(data) {
  if (data && Array.isArray(data.sheets) && data.sheets.length) {
    var used = {}, sheets = [], i, s, max = CFG.sheets.max || 20, act, sel, fi;
    for (i = 0; i < data.sheets.length && i < max; i++) {
      s = deserializeSheet(data.sheets[i], "Sheet" + (i + 1));
      s.name = uniqueName(s.name, used);
      if (!s.charts) s.charts = [];
      sheets.push(s);
    }
    if (!sheets.length) return false;
    act = data.active | 0;
    if (act < 0 || act >= sheets.length) act = 0;
    workbook = { sheets: sheets, active: act };
    bindActiveSheet();
    if (typeof applyFilters === "function") {
      for (fi = 0; fi < sheets.length; fi++) applyFilters(fi);
    }
    sel = sheets[act].sel;
    if (sel && sel.length >= 4) {
      selR = sel[0]; selC = sel[1]; extR = sel[2]; extC = sel[3];
      selMode = sel[4] || "cell";
    }
    return true;
  }
  if (data && data.cells) { loadLegacyGrid(data); return true; }
  return false;
}

/**
 * Load the workbook. sheet-v4 wins. If it is missing, a sheet-v3 / v2 / v1
 * save is migrated into v4 and the old key is left in place as a backup.
 */
function loadStore() {
  var keys = [STORE_KEY, CFG.storage.legacyKey, CFG.storage.legacyKey1, CFG.storage.legacyKey2], k, raw, data, i;
  try {
    for (i = 0; i < keys.length; i++) {
      k = keys[i];
      if (!k) continue;
      raw = localStorage.getItem(k);
      if (!raw) continue;
      data = JSON.parse(raw);
      if (!applyWorkbookPayload(data)) continue;
      if (k !== STORE_KEY) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(serializeWorkbook())); } catch (e) {}
      }
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}
