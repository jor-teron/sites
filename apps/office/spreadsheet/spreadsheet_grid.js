/*
 * spreadsheet_grid.js
 * Grid render: header clicks, selection highlight, cell painting.
 * SH24: the table draws only the visible rows and columns (plus a small
 * buffer, and any frozen rows or columns). #sheet-sizer is the full scroll
 * size, so the scrollbar still covers A..FZ × 1..1000.
 */

var SHEET_VIEW = { bufR: 8, bufC: 4, key: "", inside: false, lock: 0, raf: 0, printing: false, spec: null, met: null, hold: null, wired: false };
var SHEET_DOM = { heads: [], rows: [] };

function sheetHeadH() { return 30; }
function sheetHeadW() { return (CFG.colWidth && CFG.colWidth.rowHead) || 40; }

function sheetColPx(c) {
  if (typeof hiddenCols !== "undefined" && hiddenCols && hiddenCols[c]) return 0;
  if (typeof colWidthPx === "function") return colWidthPx(c);
  if (typeof colWidths !== "undefined" && colWidths && colWidths[c]) return colWidths[c];
  return (CFG.colWidth && CFG.colWidth.auto) || 100;
}

function sheetRowPx(r) {
  if (typeof rowHidden === "function" && rowHidden(r)) return 0;
  if (typeof usedRowHeight === "function") return usedRowHeight(r);
  return (CFG.rowHeight && CFG.rowHeight.auto) || 30;
}

/* Prefix sums of row heights and column widths. Index i is the start of row/col i. */
function sheetPrefix() {
  var rowY = new Array(ROWS + 1), colX = new Array(COLS + 1);
  var y = 0, x = 0, i;
  rowY[0] = 0;
  for (i = 0; i < ROWS; i++) { y += sheetRowPx(i); rowY[i + 1] = y; }
  colX[0] = 0;
  for (i = 0; i < COLS; i++) { x += sheetColPx(i); colX[i + 1] = x; }
  return { rowY: rowY, colX: colX, headH: sheetHeadH(), headW: sheetHeadW(), totalH: y, totalW: x };
}

/* Smallest index whose end is past px. prefix[i] is the start, prefix[n] the total. */
function prefixIndex(prefix, px, n) {
  var lo = 0, hi, mid;
  if (n <= 0) return 0;
  if (px <= 0) return 0;
  if (px >= prefix[n]) return n - 1;
  hi = n - 1;
  while (lo < hi) {
    mid = (lo + hi) >> 1;
    if (prefix[mid + 1] <= px) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function rangeHits(a1, a2, b1, b2) { return !(a2 < b1 || a1 > b2); }

function cellHasInk(cell) {
  if (!cell || cell._empty) return false;
  if (cell.formula != null && String(cell.formula) !== "") return true;
  if (cell.value != null && String(cell.value) !== "") return true;
  return typeof styleDirty === "function" && styleDirty(cell.style);
}

/* Last row and column that have text, a formula, a style or a merge. -1 when the sheet is blank. */
function usedBounds(grid) {
  var r2 = -1, c2 = -1, merges, i, m, g = grid || (typeof cells !== "undefined" ? cells : null);
  if (g && typeof forEachReal === "function") {
    forEachReal(g, function (r, c, cell) {
      if (!cellHasInk(cell)) return;
      if (r > r2) r2 = r;
      if (c > c2) c2 = c;
    });
  }
  merges = (typeof workbook !== "undefined" && workbook && workbook.sheets) ? workbook.sheets[workbook.active].merges : null;
  if (merges) {
    for (i = 0; i < merges.length; i++) {
      m = merges[i];
      if (!m) continue;
      if (m.r2 > r2) r2 = m.r2;
      if (m.c2 > c2) c2 = m.c2;
    }
  }
  return { r2: r2, c2: c2 };
}

function pushSpan(list, from, to, hiddenFn) {
  var i;
  for (i = from; i <= to; i++) {
    if (hiddenFn && hiddenFn(i)) continue;
    list.push(i);
  }
}

function viewLists(m, r0, r1, c0, c1, fzR, fzC) {
  var cols = [], rows = [], gap;
  pushSpan(cols, 0, fzC - 1, function (c) { return typeof hiddenCols !== "undefined" && hiddenCols && hiddenCols[c]; });
  if (c0 > fzC) {
    gap = m.colX[c0] - m.colX[fzC];
    if (gap > 0) cols.push({ spacer: true, px: gap });
  }
  pushSpan(cols, Math.max(c0, fzC), c1, function (c) { return typeof hiddenCols !== "undefined" && hiddenCols && hiddenCols[c]; });
  pushSpan(rows, 0, fzR - 1, function (r) { return typeof rowHidden === "function" && rowHidden(r); });
  if (r0 > fzR) {
    gap = m.rowY[r0] - m.rowY[fzR];
    if (gap > 0) rows.push({ spacer: true, px: gap });
  }
  pushSpan(rows, Math.max(r0, fzR), r1, function (r) { return typeof rowHidden === "function" && rowHidden(r); });
  return { cols: cols, rows: rows };
}

function viewSpec(m, scrollTop, scrollLeft, viewH, viewW, printing) {
  var fzR, fzC, r0, r1, c0, c1, rA, rB, cA, cB, merges, i, mrg, lists, used, key, si;
  if (printing) {
    used = usedBounds();
    r1 = used.r2 < 0 ? 0 : Math.min(ROWS - 1, used.r2);
    c1 = used.c2 < 0 ? 0 : Math.min(COLS - 1, used.c2);
    lists = viewLists(m, 0, r1, 0, c1, 0, 0);
    si = workbook ? workbook.active : 0;
    return { cols: lists.cols, rows: lists.rows, r0: 0, r1: r1, c0: 0, c1: c1, fzR: 0, fzC: 0, key: "p:" + si + ":" + r1 + ":" + c1 };
  }
  fzR = (typeof freeze !== "undefined" && freeze && freeze.rows) || 0;
  fzC = (typeof freeze !== "undefined" && freeze && freeze.cols) || 0;
  if (fzR > ROWS) fzR = ROWS;
  if (fzC > COLS) fzC = COLS;
  rA = prefixIndex(m.rowY, Math.max(0, scrollTop), ROWS);
  rB = prefixIndex(m.rowY, Math.max(0, scrollTop + Math.max(1, viewH - m.headH) - 1), ROWS);
  cA = prefixIndex(m.colX, Math.max(0, scrollLeft), COLS);
  cB = prefixIndex(m.colX, Math.max(0, scrollLeft + Math.max(1, viewW - m.headW) - 1), COLS);
  r0 = Math.max(fzR, rA - SHEET_VIEW.bufR);
  r1 = Math.min(ROWS - 1, rB + SHEET_VIEW.bufR);
  c0 = Math.max(fzC, cA - SHEET_VIEW.bufC);
  c1 = Math.min(COLS - 1, cB + SHEET_VIEW.bufC);
  merges = (typeof workbook !== "undefined" && workbook && workbook.sheets) ? workbook.sheets[workbook.active].merges : null;
  if (merges) {
    for (i = 0; i < merges.length; i++) {
      mrg = merges[i];
      if (!mrg) continue;
      if (!rangeHits(mrg.r1, mrg.r2, rA, rB) && !rangeHits(mrg.r1, mrg.r2, 0, fzR - 1)) continue;
      if (!rangeHits(mrg.c1, mrg.c2, cA, cB) && !rangeHits(mrg.c1, mrg.c2, 0, fzC - 1)) continue;
      if (mrg.r2 - mrg.r1 <= 40) {
        if (mrg.r1 >= fzR) r0 = Math.min(r0, mrg.r1);
        r1 = Math.max(r1, Math.min(ROWS - 1, mrg.r2));
      }
      if (mrg.c2 - mrg.c1 <= 16) {
        if (mrg.c1 >= fzC) c0 = Math.min(c0, mrg.c1);
        c1 = Math.max(c1, Math.min(COLS - 1, mrg.c2));
      }
    }
  }
  if (r0 > r1) r0 = Math.max(fzR, 0);
  if (c0 > c1) c0 = Math.max(fzC, 0);
  lists = viewLists(m, r0, r1, c0, c1, fzR, fzC);
  si = workbook ? workbook.active : 0;
  key = si + ":" + fzR + ":" + fzC + ":" + r0 + ":" + r1 + ":" + c0 + ":" + c1;
  return { cols: lists.cols, rows: lists.rows, r0: r0, r1: r1, c0: c0, c1: c1, fzR: fzR, fzC: fzC, key: key };
}

function injectSheetCss() {
  if (document.getElementById("sheet-sh24-css")) return;
  var style = document.createElement("style");
  style.id = "sheet-sh24-css";
  style.textContent = ""
    + "#name-box{width:7.5em;flex:0 0 auto;margin-right:6px;text-align:center;padding:4px 6px;}"
    + "#sheet-sizer{position:relative;}"
    + "th.sheet-spacer,td.sheet-spacer{border-color:transparent;background:transparent;padding:0;}"
    + "tr.sheet-spacer td{border-color:transparent;background:transparent;}"
    + "@media print{#sheet-sizer{min-width:0!important;min-height:0!important;}#name-box{display:none!important;}}";
  document.head.appendChild(style);
}

function captureSheetEdit() {
  var a = document.activeElement;
  if (!a || a.tagName !== "INPUT" || !a.dataset || a.dataset.r == null || a.id === "formula-bar" || a.id === "name-box") return null;
  return {
    r: +a.dataset.r, c: +a.dataset.c, value: a.value,
    start: a.selectionStart, end: a.selectionEnd, editing: !a.readOnly
  };
}

function restoreSheetEdit(hold) {
  var inp, range;
  if (!hold) return;
  inp = inpGrid[hold.r] && inpGrid[hold.r][hold.c];
  if (!inp) return;
  range = selR !== extR || selC !== extC;
  if (hold.editing) {
    inp.readOnly = false;
    inp.value = hold.value;
    inp.focus();
    if (hold.start != null && inp.setSelectionRange) inp.setSelectionRange(hold.start, hold.end);
    return;
  }
  if (typeof keepExtent !== "undefined") {
    if (range) keepExtent = true;
    inp.focus();
    if (range) keepExtent = false;
  }
}

function spacerEl(tag) {
  var el = document.createElement(tag);
  el.className = "sheet-spacer";
  return el;
}

function makeColHead(c) {
  var th = document.createElement("th"), grip;
  th.className = CLS.colHead;
  th.textContent = colLetter(c);
  th.dataset.c = String(c);
  th.addEventListener("click", onColHeadClick);
  grip = document.createElement("span");
  grip.className = CLS.colGrip;
  grip.dataset.c = String(c);
  th.appendChild(grip);
  return th;
}

function makeDataCell(r, c) {
  var td = document.createElement("td"), inp, handle;
  td.className = CLS.cell;
  td.dataset.r = String(r);
  td.dataset.c = String(c);
  inp = document.createElement("input");
  inp.setAttribute("spellcheck", "false");
  inp.readOnly = true;
  inp.dataset.r = String(r);
  inp.dataset.c = String(c);
  if (typeof bindCell === "function") bindCell(inp, r, c);
  if (!inpGrid[r]) inpGrid[r] = [];
  inpGrid[r][c] = inp;
  td.appendChild(inp);
  handle = document.createElement("span");
  handle.className = CLS.fillHandle;
  handle.dataset.r = String(r);
  handle.dataset.c = String(c);
  if (typeof onFillStart === "function") handle.addEventListener("mousedown", onFillStart);
  td.appendChild(handle);
  return td;
}

function ensureSheetChrome() {
  var wrap = document.getElementById("sheet-wrap"), sizer, table;
  injectSheetCss();
  if (!wrap) return null;
  sizer = document.getElementById("sheet-sizer");
  if (!sizer) {
    wrap.innerHTML = "";
    sizer = document.createElement("div");
    sizer.id = "sheet-sizer";
    table = document.createElement("table");
    table.className = CLS.table;
    sizer.appendChild(table);
    wrap.appendChild(sizer);
  }
  if (!SHEET_VIEW.wired) {
    SHEET_VIEW.wired = true;
    wrap.addEventListener("scroll", onSheetScroll);
    window.addEventListener("beforeprint", onSheetBeforePrint);
    window.addEventListener("afterprint", onSheetAfterPrint);
    wireNameBox();
  }
  return sizer;
}

function buildVirtualTable(spec) {
  var sizer = ensureSheetChrome(), table, colgroup, col, tr, th, td, grip, i, j, item, r, cols, rows;
  if (!sizer) return;
  table = sizer.querySelector("table." + CLS.table);
  SHEET_VIEW.hold = captureSheetEdit();
  inpGrid = [];
  SHEET_DOM.heads = [];
  SHEET_DOM.rows = [];
  table.innerHTML = "";
  cols = spec.cols;
  rows = spec.rows;
  colgroup = document.createElement("colgroup");
  col = document.createElement("col");
  col.className = CLS.rowHeadCol;
  colgroup.appendChild(col);
  for (i = 0; i < cols.length; i++) {
    col = document.createElement("col");
    if (cols[i].spacer) col.className = "sheet-spacer";
    else { col.className = CLS.dataCol; col.dataset.c = String(cols[i]); }
    colgroup.appendChild(col);
  }
  table.appendChild(colgroup);
  tr = document.createElement("tr");
  th = document.createElement("th");
  th.className = CLS.corner;
  th.title = TXT.selectAll;
  th.addEventListener("click", function () { if (typeof selectAll === "function") selectAll(); });
  tr.appendChild(th);
  for (i = 0; i < cols.length; i++) {
    if (cols[i].spacer) tr.appendChild(spacerEl("th"));
    else {
      th = makeColHead(cols[i]);
      SHEET_DOM.heads[cols[i]] = th;
      tr.appendChild(th);
    }
  }
  table.appendChild(tr);
  for (i = 0; i < rows.length; i++) {
    item = rows[i];
    tr = document.createElement("tr");
    if (item && item.spacer) {
      tr.className = "sheet-spacer";
      td = document.createElement("td");
      td.className = "sheet-spacer";
      td.colSpan = cols.length + 1;
      tr.style.height = item.px + "px";
      tr.appendChild(td);
      table.appendChild(tr);
      continue;
    }
    r = item;
    tr.dataset.r = String(r);
    td = document.createElement("td");
    td.className = CLS.rowNum;
    td.textContent = String(r + 1);
    td.dataset.r = String(r);
    td.addEventListener("click", onRowHeadClick);
    grip = document.createElement("span");
    grip.className = CLS.rowGrip;
    grip.dataset.r = String(r);
    td.appendChild(grip);
    tr.appendChild(td);
    SHEET_DOM.rows[r] = tr;
    for (j = 0; j < cols.length; j++) {
      if (cols[j].spacer) tr.appendChild(spacerEl("td"));
      else tr.appendChild(makeDataCell(r, cols[j]));
    }
    table.appendChild(tr);
  }
}

function syncVirtualBox(m, spec) {
  var sizer = document.getElementById("sheet-sizer"), table, cols, i, px, total, list;
  if (!sizer) return;
  table = sizer.querySelector("table." + CLS.table);
  if (!table) return;
  cols = table.querySelectorAll("col");
  if (!cols.length) return;
  list = spec.cols;
  cols[0].style.width = m.headW + "px";
  total = m.headW;
  for (i = 0; i < list.length; i++) {
    px = list[i].spacer ? list[i].px : sheetColPx(list[i]);
    if (cols[i + 1]) cols[i + 1].style.width = px + "px";
    total += px;
  }
  table.style.width = total + "px";
  if (SHEET_VIEW.printing) {
    sizer.style.minWidth = "";
    sizer.style.minHeight = "";
  } else {
    sizer.style.minWidth = (m.headW + m.totalW) + "px";
    sizer.style.minHeight = (m.headH + m.totalH) + "px";
  }
}

function syncVirtualHeights() {
  var m = sheetPrefix(), table, trs, i, r, h, sp, spec;
  SHEET_VIEW.met = m;
  table = document.querySelector("table." + CLS.table);
  if (!table) return;
  trs = table.querySelectorAll("tr[data-r]");
  for (i = 0; i < trs.length; i++) {
    r = +trs[i].dataset.r;
    h = sheetRowPx(r);
    trs[i].style.height = h ? (h + "px") : "";
  }
  sp = table.querySelector("tr.sheet-spacer");
  spec = SHEET_VIEW.spec;
  if (sp && spec) sp.style.height = Math.max(0, m.rowY[spec.r0] - m.rowY[spec.fzR]) + "px";
  syncVirtualBox(m, spec || { cols: [] });
}

function syncVirtualWidths() {
  var m = sheetPrefix();
  SHEET_VIEW.met = m;
  if (SHEET_VIEW.spec) syncVirtualBox(m, SHEET_VIEW.spec);
}

function renderViewport(force) {
  var wrap = document.getElementById("sheet-wrap"), m, spec;
  if (!wrap || SHEET_VIEW.inside) return;
  if (!document.getElementById("sheet-sizer")) ensureSheetChrome();
  m = sheetPrefix();
  SHEET_VIEW.met = m;
  spec = viewSpec(m, wrap.scrollTop || 0, wrap.scrollLeft || 0, wrap.clientHeight || 480, wrap.clientWidth || 800, SHEET_VIEW.printing);
  if (!force && spec.key === SHEET_VIEW.key) {
    syncVirtualBox(m, spec);
    return;
  }
  SHEET_VIEW.inside = true;
  SHEET_VIEW.key = spec.key;
  SHEET_VIEW.spec = spec;
  buildVirtualTable(spec);
  syncVirtualBox(m, spec);
  layoutFrozenVirtual();
  if (typeof applyMerges === "function") applyMerges();
  paintRendered();
  if (typeof dataRenderFilterButtons === "function") dataRenderFilterButtons();
  highlightSel();
  restoreSheetEdit(SHEET_VIEW.hold);
  SHEET_VIEW.inside = false;
}

function onSheetScroll() {
  if (SHEET_VIEW.lock || SHEET_VIEW.printing || SHEET_VIEW.inside) return;
  if (SHEET_VIEW.raf) cancelAnimationFrame(SHEET_VIEW.raf);
  SHEET_VIEW.raf = requestAnimationFrame(function () {
    SHEET_VIEW.raf = 0;
    renderViewport(false);
  });
}

function onSheetBeforePrint() {
  SHEET_VIEW.printing = true;
  SHEET_VIEW.key = "";
  renderViewport(true);
}
function onSheetAfterPrint() {
  SHEET_VIEW.printing = false;
  SHEET_VIEW.key = "";
  renderViewport(true);
}

function ensureCellVisible(r, c) {
  var wrap = document.getElementById("sheet-wrap"), m, fzR, fzC, viewH, viewW, y, y2, x, x2, frozenH, frozenW, top, bot, left, right;
  if (!wrap) return;
  if (r < 0) r = 0;
  if (c < 0) c = 0;
  if (r >= ROWS) r = ROWS - 1;
  if (c >= COLS) c = COLS - 1;
  m = sheetPrefix();
  fzR = (freeze && freeze.rows) || 0;
  fzC = (freeze && freeze.cols) || 0;
  viewH = wrap.clientHeight || 480;
  viewW = wrap.clientWidth || 800;
  SHEET_VIEW.lock++;
  if (r >= fzR) {
    y = m.rowY[r];
    y2 = m.rowY[r + 1];
    frozenH = m.rowY[fzR] || 0;
    top = wrap.scrollTop;
    bot = top + Math.max(1, viewH - m.headH);
    if (y < top + frozenH) wrap.scrollTop = Math.max(0, y - frozenH);
    else if (y2 > bot) wrap.scrollTop = Math.max(0, y2 - (viewH - m.headH));
  }
  if (c >= fzC) {
    x = m.colX[c];
    x2 = m.colX[c + 1];
    frozenW = m.colX[fzC] || 0;
    left = wrap.scrollLeft;
    right = left + Math.max(1, viewW - m.headW);
    if (x < left + frozenW) wrap.scrollLeft = Math.max(0, x - frozenW);
    else if (x2 > right) wrap.scrollLeft = Math.max(0, x2 - (viewW - m.headW));
  }
  SHEET_VIEW.lock--;
  renderViewport(true);
}

function sheetHeadCell(c) { return SHEET_DOM.heads[c] || null; }
function sheetRowHead(r) { return SHEET_DOM.rows[r] ? SHEET_DOM.rows[r].cells[0] : null; }
function sheetCellTd(r, c) {
  var inp = inpGrid[r] && inpGrid[r][c];
  return inp ? inp.parentNode : null;
}

function setSticky(el, topVal, leftVal, zi) {
  if (!el) return;
  if (topVal == null && leftVal == null) {
    el.style.top = "";
    el.style.left = "";
    if (!el.classList.contains(CLS.corner) && !el.classList.contains(CLS.colHead) && !el.classList.contains(CLS.rowNum)) {
      el.style.position = "";
      el.style.zIndex = "";
    } else el.style.zIndex = "";
    el.classList.remove("frozen-cell");
    return;
  }
  el.style.position = "sticky";
  if (topVal != null) el.style.top = topVal + "px";
  else el.style.top = (el.classList.contains(CLS.colHead) || el.classList.contains(CLS.corner)) ? "0px" : "";
  if (leftVal != null) el.style.left = leftVal + "px";
  else el.style.left = (el.classList.contains(CLS.rowNum) || el.classList.contains(CLS.corner)) ? "0px" : "";
  el.style.zIndex = String(zi);
  el.classList.add("frozen-cell");
}

function layoutFrozenVirtual() {
  var table = document.querySelector("table." + CLS.table), m, headH, headW, fzC, fzR, tops, corner, nodes, i, el, c, r, fr, fc, topVal, n;
  if (!table || !document.getElementById("sheet-sizer")) return;
  m = SHEET_VIEW.met || sheetPrefix();
  headH = m.headH;
  headW = m.headW;
  fzC = (freeze && freeze.cols) || 0;
  fzR = (freeze && freeze.rows) || 0;
  tops = typeof freezeTopOffsets === "function"
    ? freezeTopOffsets(headH, fzR, sheetRowPx, typeof rowHidden === "function" ? rowHidden : function () { return false; })
    : null;
  corner = table.querySelector("th." + CLS.corner);
  setSticky(corner, 0, 0, 6);
  nodes = table.querySelectorAll("th." + CLS.colHead);
  for (i = 0; i < nodes.length; i++) {
    el = nodes[i];
    c = +el.dataset.c;
    el.classList.remove("hide-mark-left", "hide-mark-right");
    if (c < fzC && !hiddenCols[c]) setSticky(el, 0, headW + m.colX[c], 5);
    else setSticky(el, 0, null, 4);
  }
  nodes = table.querySelectorAll("td." + CLS.rowNum);
  for (i = 0; i < nodes.length; i++) {
    el = nodes[i];
    r = +el.dataset.r;
    el.classList.remove("hide-mark-top", "hide-mark-bottom");
    fr = r < fzR && !(typeof rowHidden === "function" && rowHidden(r));
    topVal = fr && tops ? tops[r] : null;
    setSticky(el, topVal, 0, fr ? 5 : 3);
  }
  nodes = table.querySelectorAll("td." + CLS.cell);
  for (i = 0; i < nodes.length; i++) {
    el = nodes[i];
    r = +el.dataset.r;
    c = +el.dataset.c;
    fr = r < fzR && !(typeof rowHidden === "function" && rowHidden(r));
    fc = c < fzC && !hiddenCols[c];
    if (!fr && !fc) {
      setSticky(el, null, null, 0);
      el.style.position = "relative";
      el.classList.remove("frozen-cell");
    } else setSticky(el, fr && tops ? tops[r] : null, fc ? (headW + m.colX[c]) : null, (fr && fc) ? 3 : 2);
  }
  for (c = 0; c < COLS; c++) {
    if (!hiddenCols[c]) continue;
    if (c > 0 && !hiddenCols[c - 1] && SHEET_DOM.heads[c - 1]) SHEET_DOM.heads[c - 1].classList.add("hide-mark-right");
    n = c + 1;
    while (n < COLS && hiddenCols[n]) n++;
    if (n < COLS && SHEET_DOM.heads[n]) SHEET_DOM.heads[n].classList.add("hide-mark-left");
    else if (n >= COLS && c > 0 && SHEET_DOM.heads[c - 1]) SHEET_DOM.heads[c - 1].classList.add("hide-mark-right");
  }
  for (r = 0; r < ROWS; r++) {
    if (!hiddenRows[r]) continue;
    if (r > 0 && !hiddenRows[r - 1] && sheetRowHead(r - 1)) sheetRowHead(r - 1).classList.add("hide-mark-bottom");
    n = r + 1;
    while (n < ROWS && hiddenRows[n]) n++;
    if (n < ROWS && sheetRowHead(n)) sheetRowHead(n).classList.add("hide-mark-top");
  }
}

function applyMergesVirtual() {
  var table = document.querySelector("table." + CLS.table), nodes, i, td, merges, m, r, c, anchor, rowList, colList, k, a, b, ok;
  if (!table) return;
  nodes = table.querySelectorAll("td." + CLS.cell);
  for (i = 0; i < nodes.length; i++) {
    td = nodes[i];
    td.removeAttribute("rowspan");
    td.removeAttribute("colspan");
    td.classList.remove("merged", "merge-hidden");
    td.style.display = "";
  }
  if (typeof styleSheetMerges !== "function") return;
  merges = styleSheetMerges();
  for (i = 0; i < merges.length; i++) {
    m = merges[i];
    if (!m) continue;
    anchor = sheetCellTd(m.r1, m.c1);
    rowList = [];
    colList = [];
    for (r = m.r1; r <= m.r2; r++) if (SHEET_DOM.rows[r]) rowList.push(r);
    for (c = m.c1; c <= m.c2; c++) if (SHEET_DOM.heads[c]) colList.push(c);
    ok = rowList.length && rowList[0] === m.r1;
    if (ok) {
      for (k = 1; k < rowList.length; k++) {
        a = SHEET_DOM.rows[rowList[k - 1]];
        b = SHEET_DOM.rows[rowList[k]];
        if (!a || !b || a.nextElementSibling !== b) { rowList.length = k; break; }
      }
    } else rowList = anchor ? [m.r1] : [];
    ok = colList.length && colList[0] === m.c1;
    if (ok) {
      for (k = 1; k < colList.length; k++) {
        a = SHEET_DOM.heads[colList[k - 1]];
        b = SHEET_DOM.heads[colList[k]];
        if (!a || !b || a.nextElementSibling !== b) { colList.length = k; break; }
      }
    } else colList = anchor ? [m.c1] : [];
    if (anchor && rowList.length && colList.length) {
      if (rowList.length > 1) anchor.rowSpan = rowList.length;
      if (colList.length > 1) anchor.colSpan = colList.length;
      anchor.classList.add("merged");
    }
    for (r = m.r1; r <= m.r2; r++) {
      for (c = m.c1; c <= m.c2; c++) {
        if (anchor && r === m.r1 && c === m.c1) continue;
        if (rowList.indexOf(r) < 0 || colList.indexOf(c) < 0) {
          td = sheetCellTd(r, c);
          if (td) { td.classList.add("merge-hidden"); td.style.display = "none"; }
          continue;
        }
        if (r === m.r1 && c === m.c1) continue;
        td = sheetCellTd(r, c);
        if (!td) continue;
        td.classList.add("merge-hidden");
        td.style.display = "none";
      }
    }
  }
}

function wireNameBox() {
  var el = document.getElementById("name-box");
  if (!el || el._wired) return;
  el._wired = true;
  el.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      gotoNameBox();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      el.blur();
      syncNameBox();
    }
  });
  el.addEventListener("blur", syncNameBox);
}

function syncNameBox() {
  var el = document.getElementById("name-box");
  if (!el || document.activeElement === el) return;
  if (typeof rangeLabel === "function") el.value = rangeLabel();
}

function gotoNameBox() {
  var el = document.getElementById("name-box"), s, parts, a, b;
  if (!el) return;
  s = String(el.value || "").trim().toUpperCase().replace(/\$/g, "");
  parts = s.split(":");
  a = typeof parseAddr === "function" ? parseAddr(parts[0]) : null;
  b = parts.length > 1 ? parseAddr(parts[1]) : a;
  if (!a || (parts.length > 1 && !b)) {
    if (typeof setStatus === "function") setStatus("Can't find " + el.value);
    return;
  }
  if (!b) b = a;
  selR = a.r;
  selC = a.c;
  extR = b.r;
  extC = b.c;
  selMode = (a.r === b.r && a.c === b.c) ? "cell" : "cell";
  if (typeof blurEditing === "function") blurEditing();
  ensureCellVisible(a.r, a.c);
  if (inpGrid[a.r] && inpGrid[a.r][a.c]) inpGrid[a.r][a.c].focus();
  else highlightSel();
}

/* (before SH24) buildTable drew every row and column.
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
    grip = document.createElement("span");
    grip.className = CLS.rowGrip;
    grip.dataset.r = String(r);
    td.appendChild(grip);
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
*/
function buildTable() {
  ensureSheetChrome();
  SHEET_VIEW.key = "";
  renderViewport(true);
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
  if (CLS.rowGrip && ev.target.classList.contains(CLS.rowGrip)) return;
  var r = parseInt(ev.currentTarget.dataset.r, 10);
  blurEditing();
  if (!ev.shiftKey) selR = r;
  selC = 0; extC = COLS - 1; extR = r;
  selMode = "row";
  highlightSel();
  setStatus(TXT.rowPrefix + (r + 1));
}

/* (before SH24) highlightSel walked every selected cell in the full table.
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
  if (typeof paintSpillOutline === "function") paintSpillOutline();
  if (multi) setStatus(rangeLabel());
  if (typeof updateStats === "function") updateStats();
}
*/
function highlightSel() {
  var all = document.querySelectorAll("." + CLS.selected + ", ." + CLS.band);
  var i, r, c, inp, g = selRange(), multi = g.r1 !== g.r2 || g.c1 !== g.c2, th, rn;
  for (i = 0; i < all.length; i++) all[i].classList.remove(CLS.selected, CLS.band);
  if (multi) {
    for (r = g.r1; r <= g.r2; r++) {
      if (!inpGrid[r]) continue;
      for (c = g.c1; c <= g.c2; c++) {
        inp = inpGrid[r][c];
        if (inp) inp.parentNode.classList.add(CLS.band);
      }
    }
  }
  for (c = g.c1; c <= g.c2; c++) {
    th = SHEET_DOM.heads[c];
    if (th) th.classList.add(CLS.band);
  }
  for (r = g.r1; r <= g.r2; r++) {
    rn = sheetRowHead(r);
    if (rn) rn.classList.add(CLS.band);
  }
  if (inpGrid[selR] && inpGrid[selR][selC]) inpGrid[selR][selC].parentNode.classList.add(CLS.selected);
  if (typeof paintSpillOutline === "function") paintSpillOutline();
  if (multi) setStatus(rangeLabel());
  if (typeof updateStats === "function") updateStats();
  syncNameBox();
}

/**
 * Apply style object to a td + input
 */
function applyLook(td, inp, st, r, c) {
  inp.style.textAlign = st.align || CFG.defaultStyle.align;
  inp.style.fontWeight = st.bold ? CFG.boldWeight : "";
  inp.style.fontStyle = st.italic ? "italic" : "";
  inp.style.textDecoration = st.underline ? "underline" : "";
  td.style.background = st.bg || "";
  inp.style.color = st.color || "";
  if (typeof styleApplyLook === "function") styleApplyLook(td, inp, st, r, c);
}

/**
 * Paint one cell: style, shown value (number format applied), error style
 */
function paintCell(r, c) {
  var inp = inpGrid[r] && inpGrid[r][c];
  if (!inp) return;
  var td = inp.parentNode, st = cellStyle(r, c);
  /* (before SH13): var v = cells[r][c].value; ghosts were not visible */
  var v = typeof displayedVal === "function" ? displayedVal(r, c, workbook.active) : (realCellAt(cells, r, c) ? realCellAt(cells, r, c).value : "");
  var ghost = typeof ghostAt === "function" && ghostAt(workbook.active, r, c);
  if (inp !== document.activeElement) inp.value = formatCellValue(v, st.fmt);
  applyLook(td, inp, st, r, c);
  td.classList.toggle("spill-ghost", !!ghost);
  if (inp === document.activeElement) return;
  if (v === ERR || CFG.errorValues.indexOf(v) !== -1) td.classList.add(CLS.error);
  else td.classList.remove(CLS.error);
}

/* Thin outline around the spill of the selected anchor cell. */
function paintSpillOutline() {
  var nodes, i, info, r, c, td, parts, r2, c2;
  nodes = document.querySelectorAll("td.spill-mark");
  for (i = 0; i < nodes.length; i++) {
    nodes[i].classList.remove("spill-mark");
    nodes[i].style.removeProperty("--spill-mark");
  }
  if (typeof spillAnchorInfo !== "function" || !workbook) return;
  info = spillAnchorInfo(workbook.active, selR, selC);
  if (!info || !inpGrid[selR]) return;
  r2 = selR + info.h - 1;
  c2 = selC + info.w - 1;
  for (r = selR; r <= r2; r++) {
    for (c = selC; c <= c2; c++) {
      if (!inpGrid[r] || !inpGrid[r][c]) continue;
      td = inpGrid[r][c].parentNode;
      parts = [];
      if (r === selR) parts.push("inset 0 1px 0 0 var(--sel)");
      if (r === r2) parts.push("inset 0 -1px 0 0 var(--sel)");
      if (c === selC) parts.push("inset 1px 0 0 0 var(--sel)");
      if (c === c2) parts.push("inset -1px 0 0 0 var(--sel)");
      if (!parts.length) continue;
      td.classList.add("spill-mark");
      td.style.setProperty("--spill-mark", parts.join(", "));
    }
  }
}

function paintRendered() {
  var spec = SHEET_VIEW.spec, rows, cols, i, j, r, c;
  if (typeof STYLE_CF_STATS !== "undefined") STYLE_CF_STATS = {};
  if (!spec) return;
  rows = spec.rows;
  cols = spec.cols;
  for (i = 0; i < rows.length; i++) {
    if (!rows[i] || rows[i].spacer) continue;
    r = rows[i];
    for (j = 0; j < cols.length; j++) {
      if (!cols[j] || cols[j].spacer) continue;
      c = cols[j];
      paintCell(r, c);
    }
  }
  if (typeof paintSpillOutline === "function") paintSpillOutline();
}

/* (before SH24) paintAll walked every cell, which meant every cell had to exist in the DOM.
function paintAll() {
  var r, c;
  if (typeof STYLE_CF_STATS !== "undefined") STYLE_CF_STATS = {};
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) paintCell(r, c);
  }
  if (typeof applyMerges === "function") applyMerges();
  if (typeof paintSpillOutline === "function") paintSpillOutline();
}
*/
function paintAll() {
  if (SHEET_VIEW.inside) { paintRendered(); return; }
  renderViewport(true);
}
