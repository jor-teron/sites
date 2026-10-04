/*
 * spreadsheet_select.js
 * Block selection: mouse drag across cells, Shift+click, Shift+arrows (moveExtent),
 * select all (Ctrl+A or the corner box). The active cell stays where the block started.
 */
var selDrag = false;

/* Grow / shrink the block with Shift+arrow. Returns true if the key was an arrow. */
function moveExtent(key) {
  var dr = key === KEYS.up ? -1 : key === KEYS.down ? 1 : 0;
  var dc = key === KEYS.left ? -1 : key === KEYS.right ? 1 : 0;
  if (!dr && !dc) return false;
  extR = Math.max(0, Math.min(ROWS - 1, extR + dr));
  extC = Math.max(0, Math.min(COLS - 1, extC + dc));
  selMode = "cell";
  highlightSel();
  var td = inpGrid[extR][extC].parentNode;
  if (td.scrollIntoView) td.scrollIntoView({ block: "nearest", inline: "nearest" });
  return true;
}

/* Whole sheet */
function selectAll() {
  keepExtent = true;
  blurEditing();
  focusCell(0, 0);
  keepExtent = false;
  extR = ROWS - 1;
  extC = COLS - 1;
  selMode = "all";
  highlightSel();
  setStatus(TXT.selectAll);
}

function cellFromEvent(ev) {
  var el = ev.target && ev.target.closest ? ev.target.closest("td." + CLS.cell) : null;
  if (!el) return null;
  return { r: parseInt(el.dataset.r, 10), c: parseInt(el.dataset.c, 10) };
}

SHEET_INIT.push(function () {
  var wrap = document.getElementById("sheet-wrap");
  wrap.addEventListener("mousedown", function (ev) {
    if (ev.button !== 0 || ev.target.classList.contains(CLS.fillHandle)) return;
    var at = cellFromEvent(ev);
    if (!at) return;
    if (ev.shiftKey) {                       // extend from the active cell, keep focus there
      ev.preventDefault();
      extR = at.r; extC = at.c; selMode = "cell";
      highlightSel();
      return;
    }
    if (isEditing(ev.target)) return;        // selecting text inside the cell being edited
    selDrag = true;                          // focus (and collapse) happens by default
  });
  wrap.addEventListener("mouseover", function (ev) {
    if (!selDrag) return;
    var at = cellFromEvent(ev);
    if (!at || (at.r === extR && at.c === extC)) return;
    extR = at.r; extC = at.c; selMode = "cell";
    highlightSel();
  });
  document.addEventListener("mouseup", function () { selDrag = false; });
});
