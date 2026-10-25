/*
 * spreadsheet_toolbar.js
 * Toolbar wiring: buttons, file import, formula bar, style controls and their sync.
 * (The ribbon will hook in here.) Colour split buttons use ../shared/office-colour.js (SH1).
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
  wireColours();
  if (typeof initRibbon === "function") initRibbon();   // spreadsheet_ribbon.js: tabs + File menu
}

/* SH1: cell fill + text colour palettes (null = no fill / automatic) */
var SHEET_FILLS = [
  ["No fill", null], ["Yellow", "#ffff00"], ["Light orange", "#ffd966"], ["Light green", "#c6efce"],
  ["Light blue", "#bdd7ee"], ["Pink", "#f4b6c2"], ["Grey", "#d9d9d9"], ["Red", "#c00000"],
  ["Green", "#00b050"], ["Blue", "#0070c0"], ["Purple", "#7030a0"]
];
var SHEET_TEXTS = [
  ["Automatic", null], ["Black", "#000000"], ["White", "#ffffff"], ["Red", "#ff0000"],
  ["Dark red", "#c00000"], ["Orange", "#ed7d31"], ["Gold", "#bf9000"], ["Green", "#00b050"],
  ["Blue", "#0070c0"], ["Dark blue", "#002060"], ["Purple", "#7030a0"]
];
var SHEET_COLOUR = {};
function wireColours() {
  if (typeof OfficeColour === "undefined" || !document.getElementById("fill-colour-btn")) return;
  [["fill", SHEET_FILLS, "#ffff00", null, "bg"], ["text", SHEET_TEXTS, "#ff0000", "var(--text)", "color"]].forEach(function (p) {
    SHEET_COLOUR[p[0]] = OfficeColour.create({
      btn: document.getElementById(p[0] + "-colour-btn"), arrow: document.getElementById(p[0] + "-colour-arrow"),
      menu: document.getElementById(p[0] + "-colour-menu"), bar: document.getElementById(p[0] + "-colour-bar"),
      palette: p[1], key: "spreadsheet.last-" + p[0] + "-colour", fallback: p[2], autoBar: p[3],
      onPick: function (v) {
        styleSelection("cell-" + p[0], function (st) { if (v) st[p[4]] = v; else delete st[p[4]]; });
      }
    });
  });
}
