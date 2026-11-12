/*
 * spreadsheet_logic.js
 * App orchestrator: after-change pipeline and start-up (boot).
 * Modules: state, storage, files, grid, edit, fill, toolbar (this file loads last of those);
 * shortcuts, block selection, clipboard, undo, rows / columns, sort, number formats and
 * column widths live in the other spreadsheet_*.js modules, which add start-up functions to SHEET_INIT.
 * Formula engine: spreadsheet_formula.js + spreadsheet_functions.js + spreadsheet_refs.js.
 */

/**
 * Recalc, repaint and save after any change to cells
 */
function afterChange() {
  recalcAll();
  if (typeof applyFilters === "function") applyFilters();
  /* (before SH18)
  if (typeof applyHiddenAndFreeze === "function") applyHiddenAndFreeze();
  paintAll();
  */
  if (typeof applyRowHeights === "function") applyRowHeights();
  if (typeof applyHiddenAndFreeze === "function") applyHiddenAndFreeze();
  paintAll();
  if (typeof dataRenderFilterButtons === "function") dataRenderFilterButtons();
  if (typeof renderCharts === "function") renderCharts();
  syncStyleUi();
  saveStore();
  if (typeof updateStats === "function") updateStats();
}

/**
 * Boot
 */
function boot() {
  var i;
  emptyWorkbook();
  /* (before HOS1) loadStore(); */
  recalcAll();
  if (typeof applyFilters === "function") {
    var si;
    for (si = 0; si < workbook.sheets.length; si++) applyFilters(si);
  }
  buildTable();
  if (typeof applyHiddenAndFreeze === "function") applyHiddenAndFreeze();
  wireUi();
  document.addEventListener("keydown", onDocKey);
  for (i = 0; i < SHEET_INIT.length; i++) {
    try { SHEET_INIT[i](); } catch (e) { console.warn("spreadsheet: init failed", e); }
  }
  paintAll();
  highlightSel();
  setStatus(TXT.ready);
}

document.addEventListener("DOMContentLoaded", boot);
