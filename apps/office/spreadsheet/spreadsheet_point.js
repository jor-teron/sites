/*
 * spreadsheet_point.js  (SH22)
 * Point at another sheet's cell while writing a formula.
 *   - A formula draft (text starts with "=") is open in a cell or the formula bar.
 *   - Clicking another sheet tab only switches the view. The draft moves to the
 *     formula bar and keeps focus there (it is not committed or cancelled).
 *   - On that sheet, clicking a cell inserts Sheet2!A1 (or 'My Sheet'!A1) at the
 *     caret. Clicking another cell straight after replaces that ref (Excel style).
 *   - Enter commits to the origin cell and returns there. Esc cancels and returns.
 * Same-sheet pointing and drag ranges are not here (planned as SH23).
 */

/* null, or { sheet, r, c, last: { start, end, ref } | null } while pointing */
var SHEET_POINT = null;

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
  if (last && start === end && last.end === start && text.slice(last.start, last.end) === last.ref) {
    start = last.start;
  }
  var out = text.slice(0, start) + ref + text.slice(end);
  return { text: out, caret: start + ref.length, last: { start: start, end: start + ref.length, ref: ref } };
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

/* Cell mousedown while pointing (capture phase, before selection code) */
function pointOnCellDown(ev) {
  if (!SHEET_POINT || ev.button !== 0) return;
  var at = cellFromEvent(ev), bar = pointBar(), res, start, end;
  if (!at) return;
  if (workbook.active === SHEET_POINT.sheet) {
    /* Same-sheet pointing is SH23: commit like a normal cell edit, then the click selects */
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

SHEET_INIT.push(function () {
  var wrap = document.getElementById("sheet-wrap"), bar = pointBar(), tabs = document.getElementById("sheet-tabs");
  if (wrap) wrap.addEventListener("mousedown", pointOnCellDown, true);
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
