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
/* SH46: one full render per change (the steps below asked for 2-3), heights re-fitted once. */
function afterChange() {
  if (typeof sheetRenderDirty === "function") sheetRenderDirty();
  if (typeof sheetRenderBatch === "function") return sheetRenderBatch(afterChangeCore);
  return afterChangeCore();
}

/* (before SH46) function afterChange() { */
function afterChangeCore() {
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

/* SH58: finish first-paint boot — hide loading hint, re-enable controls,
   and replay any clicks queued while scripts & workbook loaded. */
function finishBoot() {
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    if (window.__sheetBootOnClick) {
      document.removeEventListener("click", window.__sheetBootOnClick, true);
      window.__sheetBootOnClick = null;
    }
    if (document.body) document.body.classList.remove("sheet-loading");
    var hint = document.getElementById("loadingHint");
    if (hint) hint.hidden = true;
    var waited = document.querySelectorAll("[data-boot-wait]");
    for (var i = 0; i < waited.length; i++) {
      var el = waited[i];
      el.removeAttribute("data-boot-wait");
      if (el.tagName === "SELECT") el.disabled = false;
      else if (!el.disabled) el.removeAttribute("aria-disabled");
    }
    if (Array.isArray(window.__sheetBootQueue) && window.__sheetBootQueue.length) {
      var q = window.__sheetBootQueue.slice();
      window.__sheetBootQueue = [];
      for (var j = 0; j < q.length; j++) {
        var target = q[j];
        var live = (target && document.contains(target)) ? target : (target && target.id ? document.getElementById(target.id) : null);
        if (live && !live.disabled && typeof live.click === "function") {
          live.click();
        }
      }
    }
  }
}

/**
 * Boot
 */
function boot() {
  var i, settled = false;
  try {
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
    if (typeof SHEET_LOADER !== "undefined" && SHEET_LOADER.bindLazy) SHEET_LOADER.bindLazy();
    document.addEventListener("keydown", onDocKey);
    for (i = 0; i < SHEET_INIT.length; i++) {
      try { SHEET_INIT[i](); } catch (e) { console.warn("spreadsheet: init failed", e); }
    }
    if (typeof SHEET_INIT !== "undefined" && Array.isArray(SHEET_INIT)) {
      SHEET_INIT.done = true;
      SHEET_INIT.push = function (fn) {
        var n = Array.prototype.push.call(this, fn);
        if (typeof fn === "function") {
          try { fn(); } catch (e) { console.warn("spreadsheet: lazy init failed", e); }
        }
        return n;
      };
    }
    paintAll();
    highlightSel();
    setStatus(TXT.ready);
    if (typeof window !== "undefined" && window.SHEET_BOOT_START && typeof window.SHEET_BOOT_START.then === "function") {
      settled = true;
      Promise.resolve(window.SHEET_BOOT_START).then(finishBoot, finishBoot);
    }
  } finally {
    if (!settled) finishBoot();
  }
}

/* (before SH58) document.addEventListener("DOMContentLoaded", boot); */
if (typeof document !== "undefined") {
  if (document.readyState === "complete") boot();
  else document.addEventListener("DOMContentLoaded", boot);
}
