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
    inp.value = cells[r][c].formula;
    document.getElementById("formula-bar").value = cells[r][c].formula;
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
function onCellKey(ev) {
  var inp = ev.target;
  var r = selR;
  var c = selC;
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
    focusCell(Math.min(ROWS - 1, r + 1), c);
  } else if (ev.key === KEYS.next) {
    ev.preventDefault();
    inp.blur();
    focusCell(r, ev.shiftKey ? Math.max(0, c - 1) : Math.min(COLS - 1, c + 1));
  } else if (ev.key === KEYS.up) {
    ev.preventDefault();
    inp.blur();
    focusCell(Math.max(0, r - 1), c);
  } else if (ev.key === KEYS.down) {
    ev.preventDefault();
    inp.blur();
    focusCell(Math.min(ROWS - 1, r + 1), c);
  } else if (ev.key === KEYS.left && (inp.readOnly || inp.selectionStart === 0)) {
    ev.preventDefault();
    inp.blur();
    focusCell(r, Math.max(0, c - 1));
  } else if (ev.key === KEYS.right && (inp.readOnly || inp.selectionStart === inp.value.length)) {
    ev.preventDefault();
    inp.blur();
    focusCell(r, Math.min(COLS - 1, c + 1));
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
    focusCell(Math.max(0, selR - 1), selC);
  } else if (ev.key === KEYS.down) {
    ev.preventDefault();
    focusCell(Math.min(ROWS - 1, selR + 1), selC);
  } else if (ev.key === KEYS.left) {
    ev.preventDefault();
    focusCell(selR, Math.max(0, selC - 1));
  } else if (ev.key === KEYS.right) {
    ev.preventDefault();
    focusCell(selR, Math.min(COLS - 1, selC + 1));
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
  var inp = inpGrid[r] && inpGrid[r][c];
  if (inp) {
    if (document.activeElement === inp) highlightSel();
    else inp.focus();
  }
}

/* Clear formulas / values of the block (styles stay) */
function clearSelection() {
  var any = false;
  forSelection(function (r, c) { if (cells[r][c].formula !== "") any = true; });
  if (!any) return;
  undoRecord("clear");
  forSelection(function (r, c) { cells[r][c].formula = ""; });
  afterChange();
  if (inpGrid[selR] && document.activeElement === inpGrid[selR][selC]) {
    inpGrid[selR][selC].value = "";
    document.getElementById("formula-bar").value = "";
  }
}
