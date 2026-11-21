/*
 * spreadsheet_resize.js
 * Column widths: drag the right edge of a column letter to resize (double-click the edge to
 * reset). Widths are saved with the sheet (colWidths). Unset columns share the free width,
 * never narrower than CFG.colWidth.auto.
 * SH18: row heights. Drag the bottom edge of a row number to resize (double-click to return
 * to automatic). Automatic rows (heights[r] = null) grow and shrink to fit wrapped text and
 * explicit line breaks, never shorter than CFG.rowHeight.auto (30px), clamped 8–400.
 * Auto-fit uses estimateRowHeight (pure math, no 26×100 layout reads).
 * HO3: the default cell size is 12pt = 16px, so the math default is 16 (was 13). One line is
 * 6 + 16 * 1.25 = 26px, still under the 30px automatic floor. Explicit cell sizes stay px.
 * SH39: wrap is ON by default (Settings > "Wrap text by default"). A cell's wrap is st.wrap = true
 * (explicit on), st.nowrap = true (explicit off), else the default: effectiveWrap(st, defaultOn).
 * So every automatic row grows to fit long text, also in opened .xlsx / .ods / .csv files.
 * A height set by hand (heights[r]) still wins; "Fit row height" (row menu) clears it.
 */

/* Pure helper: estimated pixel height of one cell's text. Used by auto-fit and by tests.
 * counts explicit lines (\n) and, when wrap is on, a simple character-wrap estimate.
 * defaults: font 16px (HO3, 12pt; before HO3 13px), line-height 1.25, vertical padding 6, horizontal padding 12,
 * char width 0.6em, automatic floor 30, clamp 8–400. */
function estimateRowHeight(text, opts) {
  opts = opts || {};
  var min = opts.min != null ? opts.min : 8;
  var max = opts.max != null ? opts.max : 400;
  var floor = opts.automatic ? (opts.floor != null ? opts.floor : 30) : 0;
  /* (before HO3) var fontSize = opts.fontSize || 13; */
  var fontSize = opts.fontSize || SHEET_DEFAULT_FONT_PX;
  var lineHeight = opts.lineHeight || 1.25;
  var padY = opts.padding != null ? opts.padding : 6;
  var padX = opts.padX != null ? opts.padX : 12;
  var wrap = !!opts.wrap;
  var widthPx = opts.widthPx || 100;
  var charW = opts.charWidth || (fontSize * 0.6);
  var lines, i, part, visual, innerW, charsPerLine, n, h;
  text = text == null ? "" : String(text);
  lines = text.split(/\r\n|\n|\r/);
  if (!lines.length) lines = [""];
  visual = 0;
  innerW = Math.max(1, widthPx - padX);
  charsPerLine = Math.max(1, Math.floor(innerW / Math.max(1, charW)));
  for (i = 0; i < lines.length; i++) {
    part = lines[i];
    if (wrap) {
      n = part.length === 0 ? 1 : Math.ceil(part.length / charsPerLine);
      visual += n;
    } else {
      visual += 1;
    }
  }
  if (visual < 1) visual = 1;
  h = Math.round(padY + visual * fontSize * lineHeight);
  return clampRowHeight(h, { min: min, max: max, floor: floor });
}

function clampRowHeight(h, opts) {
  opts = opts || {};
  var min = opts.min != null ? opts.min : 8;
  var max = opts.max != null ? opts.max : 400;
  var floor = opts.floor != null ? opts.floor : 0;
  h = Math.round(Number(h) || 0);
  if (h < floor) h = floor;
  if (h < min) h = min;
  if (h > max) h = max;
  return h;
}

/* Pure helper: sticky top offsets for frozen rows. Hidden / filtered rows are skipped
 * so a later frozen row sits against the previous visible one. heightFn(r) is the
 * used height (manual or automatic). */
function freezeTopOffsets(headerH, freezeRows, heightFn, hiddenFn) {
  var tops = [headerH], tacc = headerH, r, h;
  for (r = 0; r < (freezeRows || 0); r++) {
    if (!hiddenFn || !hiddenFn(r)) {
      h = typeof heightFn === "function" ? heightFn(r) : headerH;
      tacc += h;
    }
    tops.push(tacc);
  }
  return tops;
}

/* Pure helper: shift a size list (heights or widths) on insert (delta > 0) or delete. */
function shiftSizeList(list, at, delta, fill, len) {
  if (!list) return list;
  if (delta > 0) { list.splice(at, 0, fill); list.length = len; }
  else { list.splice(at, 1); list.push(fill); }
  return list;
}

function rowHeightCfg() {
  return (typeof CFG !== "undefined" && CFG.rowHeight) ? CFG.rowHeight : { auto: 30, min: 8, max: 400 };
}

/* HO3: 12pt at 96 dpi. var (not const) so it is a plain global in tests. */
var SHEET_DEFAULT_FONT_PX = 16;

/* (before HO3)
function defaultSheetFontSize() {
  if (typeof SHEET_SETTINGS !== "undefined" && SHEET_SETTINGS && SHEET_SETTINGS.fontSize) {
    return SHEET_SETTINGS.fontSize;
  }
  return 13;
}
*/
/* HO3: Settings default size in px for the auto-fit math. Values live on SHEET_SETTINGS.s
 * (the old code read SHEET_SETTINGS.fontSize, which was never set, so it always used 13). */
function defaultSheetFontSize() {
  var s = typeof SHEET_SETTINGS !== "undefined" && SHEET_SETTINGS ? SHEET_SETTINGS.s : null;
  if (s && s.fontSize && typeof sheetFontSizePx === "function") return sheetFontSizePx(s.fontSize) || SHEET_DEFAULT_FONT_PX;
  return SHEET_DEFAULT_FONT_PX;
}

/* ---------- SH39 pure helpers (test-sh39-wrap.cjs) ---------- */
/* Effective wrap of a style. Explicit on (wrap === true) or off (nowrap === true) wins;
 * otherwise the "Wrap text by default" setting (missing = on). */
function effectiveWrap(st, defaultOn) {
  if (st && st.wrap === true) return true;
  if (st && st.nowrap === true) return false;
  return defaultOn !== false;
}
/* Toolbar Wrap: store an explicit on / off. Off keeps st.wrap false, so the XLSX export
 * (if (st.wrap) wrapText) and the .hos delta do not write wrap for it. */
function setExplicitWrap(st, on) {
  if (!st) return st;
  st.wrap = !!on;
  st.nowrap = !on;
  return st;
}
/* (before SH41) True when the text needs more than one line in widthPx (a line break, or longer
 * than the column at ~0.6em per character). 0.6em was too wide: "2026-01-03" at 16px in a 100px
 * column counted as two lines, so most imported rows fitted to 46px.
function wrapTextOverflows(text, widthPx, fontSize) {
  var fs, charsPerLine;
  text = text == null ? "" : String(text);
  if (!text) return false;
  if (text.indexOf("\n") !== -1 || text.indexOf("\r") !== -1) return true;
  fs = fontSize || SHEET_DEFAULT_FONT_PX;
  charsPerLine = Math.max(1, Math.floor(Math.max(1, (widthPx || 100) - 12) / Math.max(1, fs * 0.6)));
  return text.length > charsPerLine;
}
*/
/* SH41: rough width of one line of text in em (pure). Narrow marks and spaces ~0.3em,
 * digits 0.55em, wide capitals 0.9em, other letters 0.52em, CJK / emoji 1em. */
var SHEET_WRAP_NARROW = " .,:;'|!il-()[]/\\\"`jtfr";   /* digits (1 too) stay 0.55em: tabular */
var SHEET_WRAP_WIDE = "MWmw@%&";
function wrapTextWidthEm(text) {
  var em = 0, i, ch, code;
  text = text == null ? "" : String(text);
  for (i = 0; i < text.length; i++) {
    ch = text.charAt(i);
    code = text.charCodeAt(i);
    if (code >= 0x2E80) em += 1;
    else if (SHEET_WRAP_NARROW.indexOf(ch) !== -1) em += 0.3;
    else if (code >= 48 && code <= 57) em += 0.55;
    else if (SHEET_WRAP_WIDE.indexOf(ch) !== -1) em += 0.9;
    else if (code >= 65 && code <= 90) em += 0.62;
    else em += 0.52;
  }
  return em;
}
/* True when the text needs more than one line in widthPx (a line break, or wider than the
 * column less 12px padding). Pure; short text short-circuits, so plain cells stay cheap. */
function wrapTextOverflows(text, widthPx, fontSize) {
  var fs, room;
  text = text == null ? "" : String(text);
  if (!text) return false;
  if (text.indexOf("\n") !== -1 || text.indexOf("\r") !== -1) return true;
  fs = fontSize || SHEET_DEFAULT_FONT_PX;
  room = Math.max(1, (widthPx || 100) - 12);
  if (text.length * fs <= room) return false;   /* fits even at the widest (1em) */
  return wrapTextWidthEm(text) * fs > room;
}
/* "Wrap text by default" setting (SHEET_SETTINGS.s.wrapDefault); missing = on. */
function sheetWrapDefault() {
  var s = typeof SHEET_SETTINGS !== "undefined" && SHEET_SETTINGS ? SHEET_SETTINGS.s : null;
  return !(s && s.wrapDefault === false);
}
/* Fit row height: clear the hand-set heights of rows r1..r2 so they auto-fit. Returns how many changed. */
function clearRowHeights(heights, r1, r2) {
  var r, n = 0, a = Math.min(r1, r2), b = Math.max(r1, r2);
  if (!heights) return 0;
  for (r = a; r <= b; r++) {
    if (heights[r] != null) { heights[r] = null; n++; }
  }
  return n;
}
/* Width a cell's text can use: the column, or the visible columns of its merge. */
function cellTextWidthPx(merges, r, c) {
  var m = typeof styleMergeAt === "function" ? styleMergeAt(merges, r, c) : null, w = 0, i;
  if (!m) return colWidthPx(c);
  for (i = m.c1; i <= m.c2; i++) {
    if (typeof hiddenCols !== "undefined" && hiddenCols && hiddenCols[i]) continue;
    w += colWidthPx(i);
  }
  return w;
}

/* ---------- SH46: render cache ----------
 * autoColWidth (one layout read of #sheet-wrap and a loop over every column) ran once per
 * cell: in the row-height autofit and in paintCell. Now it runs once per render pass
 * (sheetPassBegin / sheetPassEnd around sheetPrefix and renderViewport).
 * Automatic row heights (autoFitRowHeight) are memoised per sheet. The memo key is
 * SHEET_RCACHE.ver (bumped by sheetRenderDirty on undoRecord, afterChange, recalcAll,
 * paintAll, applyRowHeights and a settings change) plus every other input of the fit:
 * column widths / hidden columns / the automatic width (sheetWidthSig), wrap-by-default,
 * the default font size and the row-height config. A hand-set height or a hidden row is
 * read live, as before. */
var SHEET_RCACHE = {
  ver: 1, pass: 0, autoW: null, passKey: null,
  memos: typeof WeakMap === "function" ? new WeakMap() : null,
  stats: { autoColWidth: 0, rowFit: 0, rowHit: 0 }
};

/* Something that changes row heights may have changed: drop the memoised heights. */
function sheetRenderDirty() { SHEET_RCACHE.ver++; }

function sheetPassBegin() {
  if (SHEET_RCACHE.pass++ === 0) { SHEET_RCACHE.autoW = null; SHEET_RCACHE.passKey = null; }
}
function sheetPassEnd() {
  SHEET_RCACHE.pass = Math.max(0, SHEET_RCACHE.pass - 1);
  if (!SHEET_RCACHE.pass) { SHEET_RCACHE.autoW = null; SHEET_RCACHE.passKey = null; }
}

/* Pure: one text for the column widths a row fit depends on ("h" hidden, "a" automatic). */
function sheetWidthSig(widths, hidden, autoW, n) {
  var out = [], c;
  for (c = 0; c < n; c++) out.push(hidden && hidden[c] ? "h" : (widths && widths[c] ? String(widths[c]) : "a"));
  return String(autoW) + ":" + out.join(",");
}

/* Pure: memo key for automatic row heights. */
function rowFitKey(ver, widthSig, wrapDef, fontPx, cfg) {
  cfg = cfg || {};
  return [ver, wrapDef ? 1 : 0, fontPx, cfg.auto, cfg.min, cfg.max, widthSig].join("|");
}

/* Pure: the memo when it was made for this key and grid, else a new empty one. */
function rowFitMemoFor(memo, key, grid) {
  if (memo && memo.key === key && memo.grid === grid) return memo;
  return { key: key, grid: grid, h: [] };
}

/* The automatic column width, read once per render pass. */
function sheetAutoW() {
  if (SHEET_RCACHE.pass > 0) {
    if (SHEET_RCACHE.autoW == null) SHEET_RCACHE.autoW = autoColWidth();
    return SHEET_RCACHE.autoW;
  }
  return autoColWidth();
}

function sheetRowFitKeyNow() {
  var key;
  if (SHEET_RCACHE.pass > 0 && SHEET_RCACHE.passKey) return SHEET_RCACHE.passKey;
  key = rowFitKey(SHEET_RCACHE.ver,
    sheetWidthSig(typeof colWidths !== "undefined" ? colWidths : null, typeof hiddenCols !== "undefined" ? hiddenCols : null, sheetAutoW(), COLS),
    sheetWrapDefault(), defaultSheetFontSize(), rowHeightCfg());
  if (SHEET_RCACHE.pass > 0) SHEET_RCACHE.passKey = key;
  return key;
}

/* autoFitRowHeight(r) through the per-sheet memo. */
function cachedAutoFitRowHeight(r) {
  var s = typeof workbook !== "undefined" && workbook && workbook.sheets && workbook.sheets[workbook.active];
  var memo, old, h;
  if (!s || !SHEET_RCACHE.memos) return autoFitRowHeight(r);
  old = SHEET_RCACHE.memos.get(s);
  memo = rowFitMemoFor(old, sheetRowFitKeyNow(), typeof cells !== "undefined" ? cells : null);
  if (memo !== old) SHEET_RCACHE.memos.set(s, memo);
  h = memo.h[r];
  if (h === undefined) {
    h = autoFitRowHeight(r);
    memo.h[r] = h;
    SHEET_RCACHE.stats.rowFit++;
  } else SHEET_RCACHE.stats.rowHit++;
  return h;
}

function colWidthPx(c) {
  if (typeof colWidths !== "undefined" && colWidths && colWidths[c]) return colWidths[c];
  /* (before SH46) if (typeof autoColWidth === "function") return autoColWidth(); */
  if (typeof autoColWidth === "function") return sheetAutoW();
  return (typeof CFG !== "undefined" && CFG.colWidth && CFG.colWidth.auto) ? CFG.colWidth.auto : 100;
}

function sheetHeights() {
  var s = typeof workbook !== "undefined" && workbook && workbook.sheets && workbook.sheets[workbook.active];
  return s && s.heights ? s.heights : null;
}

/* Displayed height of a row: a saved number if the user set one, otherwise content-fit. */
function usedRowHeight(r) {
  var heights = sheetHeights(), h;
  if (heights) {
    h = heights[r];
    if (typeof h === "number" && h > 0) return h;
  }
  /* (before SH46) return autoFitRowHeight(r); */
  return cachedAutoFitRowHeight(r);   /* SH46: memoised per sheet */
}

function autoFitRowHeight(r) {
  var cfg = rowHeightCfg();
  var maxH = cfg.auto, c, text, st, w, m, mW, i, fontSize, v, need, merges, s;
  s = typeof workbook !== "undefined" && workbook && workbook.sheets && workbook.sheets[workbook.active];
  merges = s && s.merges;
  var store = (typeof rowStore === "function" && typeof cells !== "undefined" && cells) ? rowStore(cells[r]) : null;
  if (store && store._n === 0) return maxH;
  var wrapDef = sheetWrapDefault(), wrapOn, oneLine;   /* SH39 */
  for (c = 0; c < COLS; c++) {
    if (typeof hiddenCols !== "undefined" && hiddenCols && hiddenCols[c]) continue;
    if (store && !store[c]) continue;
    if (!cells || !cells[r] || !realCellAt(cells, r, c)) continue;
    m = typeof styleMergeAt === "function" ? styleMergeAt(merges, r, c) : null;
    if (m && (m.r1 !== r || m.c1 !== c)) continue;
    st = typeof cellStyle === "function" ? cellStyle(r, c) : (cells[r][c].style || {});
    v = typeof displayedVal === "function" ? displayedVal(r, c, workbook.active) : cells[r][c].value;
    text = typeof formatCellValue === "function" ? formatCellValue(v, st && st.fmt) : String(v == null ? "" : v);
    w = colWidthPx(c);
    if (m) {
      mW = 0;
      for (i = m.c1; i <= m.c2; i++) {
        if (typeof hiddenCols !== "undefined" && hiddenCols && hiddenCols[i]) continue;
        mW += colWidthPx(i);
      }
      w = mW;
    }
    fontSize = (st && st.fontSize) ? Number(st.fontSize) : defaultSheetFontSize();
    /* SH39: wrap on by default. A one-line cell that fits under the current height skips the estimate. */
    wrapOn = effectiveWrap(st, wrapDef);
    oneLine = 6 + fontSize * 1.25;
    if (oneLine <= maxH && text.indexOf("\n") === -1 && text.indexOf("\r") === -1 &&
        (!wrapOn || !wrapTextOverflows(text, w, fontSize))) continue;
    need = estimateRowHeight(text, {
      /* (before SH39) wrap: !!(st && st.wrap), */
      wrap: wrapOn,
      widthPx: w,
      fontSize: fontSize,
      lineHeight: 1.25,
      padding: 6,
      padX: 12,
      min: cfg.min,
      max: cfg.max,
      floor: cfg.auto,
      automatic: true
    });
    if (need > maxH) maxH = need;
  }
  return maxH;
}

/* SH39: row menu "Fit row height": the selected rows go back to automatic (content-fit). */
function fitSelectedRowHeights() {
  var s = typeof workbook !== "undefined" && workbook && workbook.sheets && workbook.sheets[workbook.active];
  var g = typeof selRange === "function" ? selRange() : { r1: selR, r2: typeof extR === "number" ? extR : selR };
  if (!s || !s.heights) return 0;
  if (typeof undoRecord === "function") undoRecord("row-height");
  var n = clearRowHeights(s.heights, g.r1, g.r2);
  applyRowHeights();
  if (typeof applyHiddenAndFreeze === "function") applyHiddenAndFreeze();
  if (typeof saveStore === "function") saveStore();
  return n;
}

function autoColWidth() {
  SHEET_RCACHE.stats.autoColWidth++;   /* SH46 */
  var wrap = document.getElementById("sheet-wrap");
  var free = (wrap ? wrap.clientWidth : 1200) - CFG.colWidth.rowHead;
  var fixed = 0, nAuto = 0, c;
  for (c = 0; c < COLS; c++) {
    if (hiddenCols && hiddenCols[c]) continue;
    if (colWidths[c]) fixed += colWidths[c]; else nAuto++;
  }
  return nAuto ? Math.max(CFG.colWidth.auto, Math.floor((free - fixed) / nAuto)) : CFG.colWidth.auto;
}

var sheetResizeDrag = false;

function applyWidths() {
  if (typeof sheetResizeDrag !== "undefined" && sheetResizeDrag && typeof syncVirtualWidths === "function") {
    syncVirtualWidths();
    return;
  }
  if (typeof renderViewport === "function" && document.getElementById("sheet-wrap")) {
    renderViewport(true);
    return;
  }
  /* (before SH24) set a width on every column of the full table. */
  var table = document.querySelector("table." + CLS.table);
  if (!table) return;
  var cols = table.querySelectorAll("col." + CLS.dataCol), auto = autoColWidth(), total = CFG.colWidth.rowHead, c, w;
  table.querySelector("col." + CLS.rowHeadCol).style.width = CFG.colWidth.rowHead + "px";
  for (c = 0; c < COLS; c++) {
    w = colWidths[c] || auto;
    cols[c].style.width = w + "px";
    total += w;
  }
  table.style.width = total + "px";
  applyRowHeights();
  if (typeof applyHiddenAndFreeze === "function") applyHiddenAndFreeze();
}

/* HOS1: a row height from the .hos file. null keeps the automatic row. */
function applyRowHeights() {
  if (typeof sheetResizeDrag !== "undefined" && sheetResizeDrag && typeof syncVirtualHeights === "function") {
    syncVirtualHeights();
    if (typeof layoutFrozenVirtual === "function") layoutFrozenVirtual();
    return;
  }
  if (typeof sheetRenderDirty === "function") sheetRenderDirty();   /* SH46 */
  if (typeof renderViewport === "function" && document.getElementById("sheet-sizer")) {
    renderViewport(true);
    return;
  }
  /* (before SH24) wrote a height onto every data row of the full table. */
  var table = document.querySelector("table." + CLS.table);
  var s = workbook && workbook.sheets[workbook.active];
  if (!table || !s) return;
  if (!s.heights) {
    s.heights = [];
    var i;
    for (i = 0; i < ROWS; i++) s.heights[i] = null;
  }
  var rows = table.rows, r, h, next;
  for (r = 0; r < ROWS; r++) {
    if (!rows[r + 1]) break;
    /* (before SH18)
    h = s.heights[r];
    var next = (typeof h === "number" && h > 0) ? (h + "px") : "";
    if (rows[r + 1].style.height !== next) rows[r + 1].style.height = next;
    */
    h = usedRowHeight(r);
    next = h + "px";
    if (rows[r + 1].style.height !== next) rows[r + 1].style.height = next;
  }
}

SHEET_INIT.push(function () {
  var drag = null;
  applyWidths();
  window.addEventListener("resize", applyWidths);
  document.getElementById("sheet-wrap").addEventListener("mousedown", function (ev) {
    if (CLS.rowGrip && ev.target.classList.contains(CLS.rowGrip)) {
      ev.preventDefault();
      ev.stopPropagation();
      var r = parseInt(ev.target.dataset.r, 10);
      if (typeof undoRecord === "function") undoRecord("row-height");
      drag = { type: "row", r: r, y: ev.clientY, h: usedRowHeight(r) };
      sheetResizeDrag = true;
      document.body.classList.add("row-resizing");
      return;
    }
    if (!ev.target.classList.contains(CLS.colGrip)) return;
    ev.preventDefault();
    ev.stopPropagation();
    var c = parseInt(ev.target.dataset.c, 10);
    /* (before SH24) var col = document.querySelectorAll("table." + CLS.table + " col." + CLS.dataCol)[c]; */
    var col = document.querySelector("table." + CLS.table + " col." + CLS.dataCol + '[data-c="' + c + '"]');
    if (!col) return;
    drag = { type: "col", c: c, x: ev.clientX, w: col.getBoundingClientRect().width || parseFloat(col.style.width) };
    sheetResizeDrag = true;
    document.body.classList.add("col-resizing");
  });
  document.addEventListener("mousemove", function (ev) {
    if (!drag) return;
    if (drag.type === "row") {
      var s = workbook && workbook.sheets[workbook.active];
      var cfg = rowHeightCfg();
      if (!s) return;
      if (!s.heights) s.heights = [];
      s.heights[drag.r] = clampRowHeight(drag.h + ev.clientY - drag.y, { min: cfg.min, max: cfg.max });
      applyRowHeights();
      if (typeof applyHiddenAndFreeze === "function") applyHiddenAndFreeze();
      return;
    }
    colWidths[drag.c] = Math.max(CFG.colWidth.min, Math.round(drag.w + ev.clientX - drag.x));
    applyWidths();
  });
  document.addEventListener("mouseup", function () {
    if (!drag) return;
    drag = null;
    sheetResizeDrag = false;
    document.body.classList.remove("col-resizing");
    document.body.classList.remove("row-resizing");
    if (typeof renderViewport === "function") renderViewport(true);
    saveStore();
  });
  document.getElementById("sheet-wrap").addEventListener("dblclick", function (ev) {
    if (CLS.rowGrip && ev.target.classList.contains(CLS.rowGrip)) {
      ev.preventDefault();
      ev.stopPropagation();
      var s = workbook && workbook.sheets[workbook.active];
      if (s && s.heights) {
        if (typeof undoRecord === "function") undoRecord("row-height");
        /* (before SH39) s.heights[parseInt(ev.target.dataset.r, 10)] = null; */
        clearRowHeights(s.heights, parseInt(ev.target.dataset.r, 10), parseInt(ev.target.dataset.r, 10));   /* SH39: same as Fit row height */
        applyRowHeights();
        if (typeof applyHiddenAndFreeze === "function") applyHiddenAndFreeze();
        saveStore();
      }
      return;
    }
    if (!ev.target.classList.contains(CLS.colGrip)) return;
    colWidths[parseInt(ev.target.dataset.c, 10)] = null;
    applyWidths();
    saveStore();
  });
});
