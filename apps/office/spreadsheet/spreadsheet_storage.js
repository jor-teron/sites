/*
 * spreadsheet_storage.js
 * Save / load the sheet (cells + column widths) in localStorage.
 */

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
