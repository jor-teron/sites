/*
 * spreadsheet_toolbar.js
 * Toolbar wiring: buttons, file import, formula bar, style controls and their sync.
 * (The ribbon will hook in here.)
 */

/**
 * Toolbar style controls from current cell
 */
function syncStyleUi() {
  var st = cellStyle(selR, selC);
  document.getElementById("align-sel").value = st.align || CFG.defaultStyle.align;
  document.getElementById("btn-bold").classList.toggle(CLS.toggleOn, !!st.bold);
  document.getElementById("btn-italic").classList.toggle(CLS.toggleOn, !!st.italic);
  document.getElementById("btn-under").classList.toggle(CLS.toggleOn, !!st.underline);
  document.getElementById("fill-color").value = st.bg || CFG.colors.fillPicker;
  document.getElementById("text-color").value = st.color || CFG.colors.textPicker;
  var fs = document.getElementById("fmt-sel");
  if (fs) fs.value = st.fmt || "general";
}

/* Change the style of the block (undoable; colour pickers merge while dragging) */
function styleSelection(tag, fn) {
  undoRecord(tag);
  forSelection(function (r, c) { fn(cellStyle(r, c)); });
  paintAll();
  syncStyleUi();
  saveStore();
}

/* Click helper */
function onBtn(id, fn) {
  var el = document.getElementById(id);
  if (el) el.addEventListener("click", fn);
}

/**
 * Wire toolbar
 */
function wireUi() {
  onBtn("btn-export", exportCsv);
  onBtn("btn-print", printSheet);
  onBtn("btn-clear", function () {
    if (!confirm(TXT.confirmClear)) return;
    undoRecord("clear-all");
    emptyGrid();
    afterChange();
  });
  document.getElementById("file-import").addEventListener("change", function (ev) {
    var file = ev.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { importCsvText(String(reader.result)); };
    reader.readAsText(file);
    ev.target.value = "";
  });
  document.getElementById("formula-bar").addEventListener("keydown", function (ev) {
    if (ev.key === KEYS.commit) {
      ev.preventDefault();
      commitCell(selR, selC, ev.target.value);
      focusCell(selR, selC);
    }
  });
  document.getElementById("align-sel").addEventListener("change", function (ev) {
    styleSelection("align", function (st) { st.align = ev.target.value; });
  });
  onBtn("btn-bold", function () {
    var on = !cellStyle(selR, selC).bold;
    styleSelection("bold", function (st) { st.bold = on; });
  });
  onBtn("btn-italic", function () {
    var on = !cellStyle(selR, selC).italic;
    styleSelection("italic", function (st) { st.italic = on; });
  });
  onBtn("btn-under", function () {
    var on = !cellStyle(selR, selC).underline;
    styleSelection("underline", function (st) { st.underline = on; });
  });
  document.getElementById("fill-color").addEventListener("input", function (ev) {
    styleSelection("fill-color", function (st) { st.bg = ev.target.value; });
  });
  document.getElementById("text-color").addEventListener("input", function (ev) {
    styleSelection("text-color", function (st) { st.color = ev.target.value; });
  });
  if (typeof initRibbon === "function") initRibbon();   // spreadsheet_ribbon.js: tabs + File menu
}
