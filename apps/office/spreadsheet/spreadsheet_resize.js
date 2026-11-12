/*
 * spreadsheet_resize.js
 * Column widths: drag the right edge of a column letter to resize (double-click the edge to
 * reset). Widths are saved with the sheet (colWidths). Unset columns share the free width,
 * never narrower than CFG.colWidth.auto.
 * SH18: row heights. Drag the bottom edge of a row number to resize (double-click to return
 * to automatic). Automatic rows (heights[r] = null) grow and shrink to fit wrapped text and
 * explicit line breaks, never shorter than CFG.rowHeight.auto (30px), clamped 8–400.
 * Auto-fit uses estimateRowHeight (pure math, no 26×100 layout reads).
 */

/* Pure helper: estimated pixel height of one cell's text. Used by auto-fit and by tests.
 * counts explicit lines (\n) and, when wrap is on, a simple character-wrap estimate.
 * defaults: font 13px, line-height 1.25, vertical padding 6, horizontal padding 12,
 * char width 0.6em, automatic floor 30, clamp 8–400. */
function estimateRowHeight(text, opts) {
  opts = opts || {};
  var min = opts.min != null ? opts.min : 8;
  var max = opts.max != null ? opts.max : 400;
  var floor = opts.automatic ? (opts.floor != null ? opts.floor : 30) : 0;
  var fontSize = opts.fontSize || 13;
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

function defaultSheetFontSize() {
  if (typeof SHEET_SETTINGS !== "undefined" && SHEET_SETTINGS && SHEET_SETTINGS.fontSize) {
    return SHEET_SETTINGS.fontSize;
  }
  return 13;
}

function colWidthPx(c) {
  if (typeof colWidths !== "undefined" && colWidths && colWidths[c]) return colWidths[c];
  if (typeof autoColWidth === "function") return autoColWidth();
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
  return autoFitRowHeight(r);
}

function autoFitRowHeight(r) {
  var cfg = rowHeightCfg();
  var maxH = cfg.auto, c, text, st, w, m, mW, i, fontSize, v, need, merges, s;
  s = typeof workbook !== "undefined" && workbook && workbook.sheets && workbook.sheets[workbook.active];
  merges = s && s.merges;
  for (c = 0; c < COLS; c++) {
    if (typeof hiddenCols !== "undefined" && hiddenCols && hiddenCols[c]) continue;
    if (!cells || !cells[r] || !cells[r][c]) continue;
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
    need = estimateRowHeight(text, {
      wrap: !!(st && st.wrap),
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

function autoColWidth() {
  var wrap = document.getElementById("sheet-wrap");
  var free = (wrap ? wrap.clientWidth : 1200) - CFG.colWidth.rowHead;
  var fixed = 0, nAuto = 0, c;
  for (c = 0; c < COLS; c++) {
    if (hiddenCols && hiddenCols[c]) continue;
    if (colWidths[c]) fixed += colWidths[c]; else nAuto++;
  }
  return nAuto ? Math.max(CFG.colWidth.auto, Math.floor((free - fixed) / nAuto)) : CFG.colWidth.auto;
}

function applyWidths() {
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
      document.body.classList.add("row-resizing");
      return;
    }
    if (!ev.target.classList.contains(CLS.colGrip)) return;
    ev.preventDefault();
    ev.stopPropagation();
    var c = parseInt(ev.target.dataset.c, 10);
    var col = document.querySelectorAll("table." + CLS.table + " col." + CLS.dataCol)[c];
    drag = { type: "col", c: c, x: ev.clientX, w: col.getBoundingClientRect().width || parseFloat(col.style.width) };
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
    document.body.classList.remove("col-resizing");
    document.body.classList.remove("row-resizing");
    saveStore();
  });
  document.getElementById("sheet-wrap").addEventListener("dblclick", function (ev) {
    if (CLS.rowGrip && ev.target.classList.contains(CLS.rowGrip)) {
      ev.preventDefault();
      ev.stopPropagation();
      var s = workbook && workbook.sheets[workbook.active];
      if (s && s.heights) {
        if (typeof undoRecord === "function") undoRecord("row-height");
        s.heights[parseInt(ev.target.dataset.r, 10)] = null;
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
