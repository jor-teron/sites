/*
 * spreadsheet_edit.js
 * Cell editing and input: selected vs editing mode, cell keys, document keys,
 * commit, focus, clearing the selection.
 */

/* Leave the current cell (commits an edit) without selecting another */
function blurEditing() {
  var a = document.activeElement;
  if (a && a.dataset && a.dataset.r != null && a.tagName === "INPUT") a.blur();
}

/* True while the user is typing in a cell */
function isEditing(el) {
  return !!(el && el.tagName === "INPUT" && el.dataset.r != null && !el.readOnly);
}

/* Switch a cell input to editing; keep = keep current text (F2 / double-click) */
function startEdit(inp, keep) {
  inp.readOnly = false;
  if (!keep) inp.value = "";
  else { var n = inp.value.length; inp.setSelectionRange(n, n); }
}

/**
 * Bind one cell input
 */
function bindCell(inp, r, c) {
  inp.addEventListener("focus", function () {
    selR = r;
    selC = c;
    if (!keepExtent) { extR = r; extC = c; selMode = "cell"; }
    inp.readOnly = true;
    /* (before SH13): inp.value = cells[r][c].formula; a ghost has no formula, so it flashed blank */
    var formulaText = cells[r][c].formula == null ? "" : String(cells[r][c].formula);
    var ghost = typeof ghostAt === "function" ? ghostAt(workbook.active, r, c) : null;
    if (formulaText === "" && ghost) inp.value = formatCellValue(ghost.value, cellStyle(r, c).fmt);
    else inp.value = formulaText;
    document.getElementById("formula-bar").value = formulaText;
    highlightSel();
    syncStyleUi();
  });
  inp.addEventListener("blur", function () {
    var editing = !inp.readOnly;
    inp.readOnly = true;
    if (editing && inp.value !== String(cells[r][c].formula == null ? "" : cells[r][c].formula)) commitCell(r, c, inp.value);
    else paintCell(r, c);
  });
  inp.addEventListener("dblclick", function () { if (inp.readOnly) startEdit(inp, true); });
  inp.addEventListener("keydown", onCellKey);
}

/**
 * Keys inside a cell: selected mode (navigate, type to start editing) or editing mode
 */
/* SH18: Alt+Enter inserts a newline and turns Wrap on. Plain Enter still commits and moves down.
 * The in-cell editor stays a single-line <input>, so a break already in the formula is appended
 * when the input cannot keep it. The cell-face shows the break after commit. */
function insertCellLineBreak(inp, r, c) {
  var formula = String(cells[r][c].formula == null ? "" : cells[r][c].formula);
  var text, start, end, st, needWrap;
  if (isEditing(inp) && inp.value.indexOf("\n") === -1 && formula.indexOf("\n") === -1 && formula.indexOf("\r") === -1) {
    start = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
    end = inp.selectionEnd != null ? inp.selectionEnd : start;
    text = inp.value.slice(0, start) + "\n" + inp.value.slice(end);
  } else if (isEditing(inp) && inp.value.indexOf("\n") !== -1) {
    start = inp.selectionStart != null ? inp.selectionStart : inp.value.length;
    end = inp.selectionEnd != null ? inp.selectionEnd : start;
    text = inp.value.slice(0, start) + "\n" + inp.value.slice(end);
  } else {
    text = formula + "\n";
  }
  st = ensureStyle(r, c);
  needWrap = !st.wrap;
  if (text === formula && !needWrap) return;
  undoRecord("line-break");
  cells[r][c].formula = text;
  if (needWrap) st.wrap = true;
  /* Leave the cell committed. An <input type="text"> cannot keep the break, so
     staying in edit would overwrite the formula with a single line on blur.
     The cell-face shows the break after paint. */
  if (inp) inp.readOnly = true;
  afterChange();
}

function onCellKey(ev) {
  var inp = ev.target;
  var r = selR;
  var c = selC;
  if (ev.altKey && ev.key === KEYS.commit) {
    ev.preventDefault();
    ev.stopPropagation();
    insertCellLineBreak(inp, r, c);
    return;
  }
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;      // shortcuts: spreadsheet_keys.js
  if (inp.readOnly) {
    if (ev.key === "F2") { ev.preventDefault(); startEdit(inp, true); return; }
    if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); clearSelection(); return; }
    if (ev.key.length === 1) { startEdit(inp, false); return; }   // the key's character goes in
  } else if (ev.key === "Escape") {
    ev.preventDefault();
    inp.value = cells[r][c].formula;
    inp.readOnly = true;
    return;
  }
  if (ev.shiftKey && !isEditing(inp) && moveExtent(ev.key)) { ev.preventDefault(); return; }
  if (ev.key === KEYS.commit) {
    ev.preventDefault();
    inp.blur();
    focusCell(nextVisible(r, c, 1, 0).r, c);
  } else if (ev.key === KEYS.next) {
    ev.preventDefault();
    inp.blur();
    var step = ev.shiftKey ? nextVisible(r, c, 0, -1) : nextVisible(r, c, 0, 1);
    focusCell(r, step.c);
  } else if (ev.key === KEYS.up) {
    ev.preventDefault();
    inp.blur();
    focusCell(nextVisible(r, c, -1, 0).r, c);
  } else if (ev.key === KEYS.down) {
    ev.preventDefault();
    inp.blur();
    focusCell(nextVisible(r, c, 1, 0).r, c);
  } else if (ev.key === KEYS.left && (inp.readOnly || inp.selectionStart === 0)) {
    ev.preventDefault();
    inp.blur();
    focusCell(r, nextVisible(r, c, 0, -1).c);
  } else if (ev.key === KEYS.right && (inp.readOnly || inp.selectionStart === inp.value.length)) {
    ev.preventDefault();
    inp.blur();
    focusCell(r, nextVisible(r, c, 0, 1).c);
  }
}

/**
 * Document-level keys when no cell has focus (e.g. after a header click)
 */
function onDocKey(ev) {
  var t = ev.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
  if (ev.shiftKey && moveExtent(ev.key)) { ev.preventDefault(); return; }
  if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); clearSelection(); return; }
  if (ev.key === KEYS.up) {
    ev.preventDefault();
    focusCell(nextVisible(selR, selC, -1, 0).r, selC);
  } else if (ev.key === KEYS.down) {
    ev.preventDefault();
    focusCell(nextVisible(selR, selC, 1, 0).r, selC);
  } else if (ev.key === KEYS.left) {
    ev.preventDefault();
    focusCell(selR, nextVisible(selR, selC, 0, -1).c);
  } else if (ev.key === KEYS.right) {
    ev.preventDefault();
    focusCell(selR, nextVisible(selR, selC, 0, 1).c);
  } else if (ev.key === KEYS.commit || ev.key === "F2") {
    ev.preventDefault();
    focusCell(selR, selC);
  }
}

/**
 * Write formula and recalc (undoable)
 */
function commitCell(r, c, text) {
  if (String(cells[r][c].formula == null ? "" : cells[r][c].formula) === text) return;
  undoRecord("edit");
  cells[r][c].formula = text;
  afterChange();
}

/**
 * Focus cell (collapses the block to that cell)
 */
function focusCell(r, c) {
  selR = r;
  selC = c;
  extR = r;
  extC = c;
  selMode = "cell";
  /* (before SH24) the cell input always existed, so this did not scroll. */
  if (typeof ensureCellVisible === "function") ensureCellVisible(r, c);
  var inp = inpGrid[r] && inpGrid[r][c];
  if (inp) {
    if (document.activeElement === inp) highlightSel();
    else inp.focus();
  } else if (typeof highlightSel === "function") highlightSel();
}

/* Clear formulas / values of the block (styles stay) */
function clearSelection() {
  var any = false;
  forSelection(function (r, c) {
    var cell = realCellAt(cells, r, c);
    if (cell && cell.formula !== "" && cell.formula != null) any = true;
  });
  if (!any) return;
  undoRecord("clear");
  forSelection(function (r, c) {
    var cell = realCellAt(cells, r, c);
    if (cell) cell.formula = "";
  });
  afterChange();
  if (inpGrid[selR] && document.activeElement === inpGrid[selR][selC]) {
    inpGrid[selR][selC].value = "";
    document.getElementById("formula-bar").value = "";
  }
}
