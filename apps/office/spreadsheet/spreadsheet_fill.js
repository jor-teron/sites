/*
 * spreadsheet_fill.js
 * Autofill handle: drag to copy / extend a series down or right.
 */

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
