/*
 * spreadsheet_point.js  (SH22, SH23)
 * Point at another sheet's cell while writing a formula.
 *   - A formula draft (text starts with "=") is open in a cell or the formula bar.
 *   - Clicking another sheet tab only switches the view. The draft moves to the
 *     formula bar and keeps focus there (it is not committed or cancelled).
 *   - On that sheet, clicking a cell inserts Sheet2!A1 (or 'My Sheet'!A1) at the
 *     caret. Clicking another cell straight after replaces that ref (Excel style).
 *   - Enter commits to the origin cell and returns there. Esc cancels and returns.
 * (before SH23) Same-sheet pointing and drag ranges are not here (planned as SH23).
 * SH23: same-sheet pointing and drag ranges.
 *   - While a formula draft is open (cell input or formula bar), clicking another cell
 *     on the same sheet inserts A1 at the caret, but only where a ref makes sense
 *     (right after = ( , + - * / ^ & < > : or a just-inserted ref). Otherwise the
 *     click commits as before. Clicking the cell being edited just keeps editing.
 *   - Mouse-down + drag inserts / replaces a range (A1:B3, Sheet2!A1:B3), top-left
 *     first, updated live. Shift+click grows the just-inserted ref into a range.
 *   - Back on the origin sheet while pointing across sheets, the same rule applies
 *     (no sheet prefix) instead of committing.
 *   - The in-cell input keeps focus and caret (mousedown default is prevented),
 *     so Enter / Esc there behave as before.
 */

/* null, or { sheet, r, c, last: { start, end, ref } | null } while pointing */
var SHEET_POINT = null;
/* SH23: the last inserted ref, { el, start, end, ref, text, anchor: { sheet, r, c } }, or null.
   (before SH23 the last ref lived only in SHEET_POINT.last) */
var POINT_LAST = null;
/* SH23: { el, anchor: { sheet, r, c }, r, c } while a drag range is being drawn */
var POINT_DRAG = null;

/* ---- pure helpers (no DOM; tested by test-sh22-sheet-pointing.js) ---- */

/* True when the text is a formula draft */
function pointIsFormula(text) {
  return typeof text === "string" && text.charAt(0) === "=";
}

/* "Sheet2!A1" / "'My Sheet'!A1" (same quoting rule as typed refs, quoteSheetName) */
function pointRefText(sheetName, r, c) {
  return quoteSheetName(sheetName) + "!" + colLetter(c) + (r + 1);
}

/*
 * Insert ref at the caret (or over the selected text). If the previous inserted
 * ref still ends at the caret and is unchanged, replace it instead.
 * Returns { text, caret, last }.
 */
function pointInsertRef(text, start, end, last, ref) {
  text = String(text == null ? "" : text);
  if (start == null || start < 0 || start > text.length) start = text.length;
  if (end == null || end < start || end > text.length) end = start;
  /* (before SH23)
  if (last && start === end && last.end === start && text.slice(last.start, last.end) === last.ref) {
  */
  if (pointCanReplace(text, start, end, last)) {
    start = last.start;
  }
  var out = text.slice(0, start) + ref + text.slice(end);
  /* (before SH23) return { text: out, caret: start + ref.length, last: { start: start, end: start + ref.length, ref: ref } }; */
  return { text: out, caret: start + ref.length, last: { start: start, end: start + ref.length, ref: ref, text: out } };
}

/* SH23: the caret sits right after the ref inserted last, and nothing was typed since
   (last.text, when present, is the whole draft just after that insert) */
function pointCanReplace(text, start, end, last) {
  return !!(last && start === end && last.end === start &&
    text.slice(last.start, last.end) === last.ref &&
    (last.text == null || last.text === text));
}

/* SH23: characters after which a clicked cell becomes a ref (Excel style) */
var POINT_REF_AFTER = "=(,+-*/^&<>:";

/*
 * SH23: may a cell click insert a ref at this caret?  True right after "=", "(", ",",
 * an operator, ":" (spaces before the caret are skipped), or when the caret is just
 * after the ref inserted last. False for plain text, before the "=", or inside "...".
 */
function pointCaretAllowsRef(text, start, end, last) {
  var i, q = 0, ch;
  text = String(text == null ? "" : text);
  if (!pointIsFormula(text)) return false;
  if (start == null || start < 0 || start > text.length) start = text.length;
  if (end == null || end < start || end > text.length) end = start;
  if (pointCanReplace(text, start, end, last)) return true;
  if (start < 1) return false;
  for (i = 0; i < start; i++) if (text.charAt(i) === '"') q++;
  if (q % 2) return false;                       // inside a string literal
  i = start - 1;
  while (i > 0 && /\s/.test(text.charAt(i))) i--;
  ch = text.charAt(i);
  return ch !== "" && POINT_REF_AFTER.indexOf(ch) >= 0;
}

/*
 * SH23: ref text for a block, normalised to top-left:bottom-right.
 * sheetName null = same sheet (no prefix). One cell gives "A1", not "A1:A1".
 */
function pointRangeText(sheetName, r1, c1, r2, c2) {
  var top = Math.min(r1, r2), bot = Math.max(r1, r2), left = Math.min(c1, c2), right = Math.max(c1, c2);
  var a = colLetter(left) + (top + 1), b = colLetter(right) + (bot + 1);
  var prefix = sheetName == null ? "" : quoteSheetName(sheetName) + "!";
  return prefix + (a === b ? a : a + ":" + b);
}

/*
 * What a sheet-tab click should do.
 *   state:   SHEET_POINT (or null)
 *   draft:   the text being edited, or null when nothing is being edited
 *   active:  index of the visible sheet; target: index of the clicked tab
 * Returns "normal" (old behaviour: blur commits), "start" (begin pointing),
 * "return" (back to the origin sheet, still editing) or "switch" (pointing, other sheet).
 */
function pointTabAction(state, draft, active, target) {
  if (state) return target === state.sheet ? "return" : "switch";
  if (target === active) return "normal";
  if (draft != null && pointIsFormula(draft)) return "start";
  return "normal";
}

/* ---- DOM side ---- */

function pointBar() { return document.getElementById("formula-bar"); }

/* The formula draft being edited right now (cell input or formula bar), or null */
function pointDraftEl() {
  var a = document.activeElement, bar = pointBar();
  if (!a) return null;
  if (isEditing(a) && pointIsFormula(a.value)) return a;
  if (a === bar && pointIsFormula(bar.value)) return a;
  return null;
}

/* Show sheet i without committing (pointing mode) */
function pointShowSheet(i) {
  stashSheetView();
  workbook.active = i;
  bindActiveSheet();
  restoreSheetView();
  afterSheetOp();
}

function pointRefocus(caret) {
  var bar = pointBar();
  if (!bar) return;
  if (document.activeElement !== bar) bar.focus();
  if (caret != null) { try { bar.setSelectionRange(caret, caret); } catch (e) {} }
  if (typeof fxShowHint !== "function") return;
  fxShowHint(bar);
  /* the cell input's fx blur timer (150 ms) hides the hint; show it again for the bar */
  setTimeout(function () { if (SHEET_POINT && document.activeElement === bar) fxShowHint(bar); }, 200);
}

/*
 * Called by switchSheet before it blurs. Returns true when SH22 handled the click.
 */
function pointOnTab(i) {
  var el = pointDraftEl(), bar = pointBar(), act, caret;
  act = pointTabAction(SHEET_POINT, el ? el.value : null, workbook.active, i);
  if (act === "normal") return false;
  pointMark(null);                     // SH23: ref outline belongs to the sheet being left
  POINT_DRAG = null;
  if (act === "start") {
    caret = el.selectionStart != null ? el.selectionStart : el.value.length;
    SHEET_POINT = { sheet: workbook.active, r: selR, c: selC, last: null };
    if (el !== bar) {
      bar.value = el.value;            // carry the draft in the formula bar
      el.readOnly = true;              // its blur sees SHEET_POINT and does not commit
    }
    bar.focus();
    pointShowSheet(i);
    pointRefocus(caret);
    return true;
  }
  caret = document.activeElement === bar ? bar.selectionStart : bar.value.length;
  if (i !== workbook.active) pointShowSheet(i);
  else renderSheetTabs();
  pointRefocus(caret);
  return true;
}

/* Enter (commit = true) or Esc (commit = false): back to the origin sheet and cell.
   noFocus: focus already went somewhere else (stray click), so do not take it back. */
function pointFinish(commit, noFocus) {
  var p = SHEET_POINT, bar = pointBar(), text = bar ? bar.value : "";
  if (!p) return;
  SHEET_POINT = null;
  POINT_LAST = POINT_DRAG = null;      // SH23
  pointMark(null);
  if (workbook.active !== p.sheet) {
    stashSheetView();
    workbook.active = p.sheet;
    bindActiveSheet();
    restoreSheetView();
  }
  if (commit) commitCell(p.r, p.c, text);
  afterSheetOp();
  if (typeof fxHideHint === "function") fxHideHint();
  if (noFocus) {
    selR = extR = p.r; selC = extC = p.c; selMode = "cell";
    highlightSel();
  } else focusCell(p.r, p.c);   // its focus handler puts the cell's formula back in the bar
  if (bar) bar.value = String(cells[p.r][p.c].formula == null ? "" : cells[p.r][p.c].formula);
}

/* (before SH23) the SH22 cell mousedown; same-sheet clicks always committed:
/* Cell mousedown while pointing (capture phase, before selection code) * /
function pointOnCellDown(ev) {
  if (!SHEET_POINT || ev.button !== 0) return;
  var at = cellFromEvent(ev), bar = pointBar(), res, start, end;
  if (!at) return;
  if (workbook.active === SHEET_POINT.sheet) {
    /* Same-sheet pointing is SH23: commit like a normal cell edit, then the click selects * /
    pointFinish(true, true);
    return;
  }
  ev.preventDefault();                   // keep focus (and the draft) in the formula bar
  ev.stopPropagation();                  // no selection change
  start = document.activeElement === bar ? bar.selectionStart : bar.value.length;
  end = document.activeElement === bar ? bar.selectionEnd : start;
  res = pointInsertRef(bar.value, start, end, SHEET_POINT.last,
    pointRefText(workbook.sheets[workbook.active].name, at.r, at.c));
  bar.value = res.text;
  SHEET_POINT.last = res.last;
  pointRefocus(res.caret);
}
*/

/* ---- SH23 DOM helpers ---- */

/* The draft a cell click may point into: the bar while pointing across sheets, else an open formula draft */
function pointEditor() {
  return SHEET_POINT ? pointBar() : pointDraftEl();
}

function pointSelOf(el) {
  if (document.activeElement === el && el.selectionStart != null) {
    return { start: el.selectionStart, end: el.selectionEnd != null ? el.selectionEnd : el.selectionStart };
  }
  return { start: el.value.length, end: el.value.length };
}

function pointLastFor(el) {
  return POINT_LAST && POINT_LAST.el === el ? POINT_LAST : null;
}

/* Keep editing in el with the caret at pos (bar: SH22 refocus; cell input: stays put) */
function pointFocus(el, pos) {
  if (el === pointBar()) { pointRefocus(pos); return; }
  if (document.activeElement !== el) el.focus();
  if (pos != null) { try { el.setSelectionRange(pos, pos); } catch (e) {} }
  if (typeof fxShowHint === "function") fxShowHint(el);
}

/* Light outline on the cells of the ref inserted last (null clears) */
var POINT_MARK_CLS = "point-ref";
function pointMark(g) {
  var old = document.querySelectorAll("td." + POINT_MARK_CLS), i, r, c;
  for (i = 0; i < old.length; i++) old[i].classList.remove(POINT_MARK_CLS);
  if (!g || typeof inpGrid === "undefined") return;
  for (r = Math.min(g.r1, g.r2); r <= Math.max(g.r1, g.r2); r++) {
    for (c = Math.min(g.c1, g.c2); c <= Math.max(g.c1, g.c2); c++) {
      if (inpGrid[r] && inpGrid[r][c]) inpGrid[r][c].parentNode.classList.add(POINT_MARK_CLS);
    }
  }
}

/* Put the ref for anchor..at into el (replacing the last ref when the caret is still after it) */
function pointPut(el, anchor, at, sel) {
  var prefix = SHEET_POINT && workbook.active !== SHEET_POINT.sheet ? workbook.sheets[workbook.active].name : null;
  var ref = pointRangeText(prefix, anchor.r, anchor.c, at.r, at.c);
  var res = pointInsertRef(el.value, sel.start, sel.end, pointLastFor(el), ref);
  el.value = res.text;
  POINT_LAST = { el: el, start: res.last.start, end: res.last.end, ref: ref, text: res.text, anchor: anchor };
  if (SHEET_POINT) SHEET_POINT.last = res.last;
  pointMark({ r1: anchor.r, c1: anchor.c, r2: at.r, c2: at.c });
  pointFocus(el, res.caret);
}

/* Cell mousedown while a formula draft is open (capture phase, before selection code) */
function pointOnCellDown(ev) {
  var el, at, sel, last, onOrigin, oR, oC, anchor;
  if (ev.button !== 0) return;
  el = pointEditor();
  if (!el) return;
  if (!SHEET_POINT && ev.target.classList && ev.target.classList.contains(CLS.fillHandle)) return;
  at = cellFromEvent(ev);
  if (!at) return;
  onOrigin = !SHEET_POINT || workbook.active === SHEET_POINT.sheet;
  oR = SHEET_POINT ? SHEET_POINT.r : selR;
  oC = SHEET_POINT ? SHEET_POINT.c : selC;
  sel = pointSelOf(el);
  last = pointLastFor(el);
  if (onOrigin) {
    if (at.r === oR && at.c === oC) {
      if (ev.target === el) return;       // caret / text selection inside the cell being edited
      ev.preventDefault();                // the origin cell itself: no ref, keep editing
      ev.stopPropagation();
      pointFocus(el, null);
      return;
    }
    if (!pointCaretAllowsRef(el.value, sel.start, sel.end, last)) {
      /* not a ref spot: commit like a normal cell edit, then the click selects */
      if (SHEET_POINT) pointFinish(true, true);
      return;
    }
  }
  ev.preventDefault();                     // keep focus (and the draft) where it is
  ev.stopPropagation();                    // no selection change
  anchor = { sheet: workbook.active, r: at.r, c: at.c };
  if (ev.shiftKey && last && last.anchor && last.anchor.sheet === workbook.active && pointCanReplace(el.value, sel.start, sel.end, last)) {
    anchor = last.anchor;                  // Shift+click grows the last ref into a range
  }
  pointPut(el, anchor, at, sel);
  POINT_DRAG = { el: el, anchor: anchor, r: at.r, c: at.c };
}

/* Drag while pointing: replace the ref with anchor..cell under the mouse (live) */
function pointOnCellOver(ev) {
  var d = POINT_DRAG, at, last;
  if (!d) return;
  ev.stopPropagation();
  at = cellFromEvent(ev);
  if (!at || (at.r === d.r && at.c === d.c)) return;
  last = pointLastFor(d.el);
  if (!last) { POINT_DRAG = null; return; }
  d.r = at.r; d.c = at.c;
  pointPut(d.el, d.anchor, at, { start: last.end, end: last.end });
}

SHEET_INIT.push(function () {
  var wrap = document.getElementById("sheet-wrap"), bar = pointBar(), tabs = document.getElementById("sheet-tabs");
  if (wrap) wrap.addEventListener("mousedown", pointOnCellDown, true);
  if (wrap) wrap.addEventListener("mouseover", pointOnCellOver, true);   // SH23 drag ranges
  document.addEventListener("mouseup", function () {
    var d = POINT_DRAG;
    if (!d) return;
    POINT_DRAG = null;
    /* the click that follows may hide the hint; show it again for the draft */
    setTimeout(function () { if (document.activeElement === d.el && typeof fxShowHint === "function") fxShowHint(d.el); }, 0);
  });
  /* SH23: typing, Esc, or leaving the draft drops the ref outline (and the "last ref" once focus is gone) */
  document.addEventListener("input", function (ev) {
    if (POINT_LAST && ev.target === POINT_LAST.el) pointMark(null);
  }, true);
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && POINT_LAST) pointMark(null);
  }, true);
  document.addEventListener("focusout", function (ev) {
    var el = POINT_LAST && POINT_LAST.el;
    if (!el || ev.target !== el) return;
    setTimeout(function () {
      if (POINT_LAST && POINT_LAST.el === el && document.activeElement !== el) { POINT_LAST = null; pointMark(null); }
    }, 0);
  }, true);
  if (!document.getElementById("point-ref-style")) {
    /* injected so the cached spreadsheet.css?v=HO3 does not need a bump */
    var st = document.createElement("style");
    st.id = "point-ref-style";
    st.textContent = "td.cell." + POINT_MARK_CLS + " { outline: 2px dashed var(--sel); outline-offset: -2px; }";
    document.head.appendChild(st);
  }
  /* Keep focus in the draft when a tab is pressed, so its blur does not commit first */
  if (tabs) {
    tabs.addEventListener("mousedown", function (ev) {
      if (ev.button !== 0 || !ev.target.closest || !ev.target.closest(".sheet-tab")) return;
      if (SHEET_POINT || pointDraftEl()) ev.preventDefault();
    }, true);
  }
  if (!bar) return;
  bar.addEventListener("keydown", function (ev) {
    if (!SHEET_POINT) return;
    if (ev.key === "Escape") { ev.preventDefault(); pointFinish(false); }
  });
  /* Focus left for something else (ribbon, header, page): commit like a cell blur */
  bar.addEventListener("blur", function () {
    if (!SHEET_POINT) return;
    setTimeout(function () {
      var a = document.activeElement;
      if (!SHEET_POINT || a === bar || (a && a.id === "btn-fx")) return;
      if (typeof FX_UI !== "undefined" && ((FX_UI.picker && FX_UI.picker.contains(a)) || (FX_UI.hint && FX_UI.hint.contains(a)))) return;
      pointFinish(true, true);
    }, 0);
  });
});
