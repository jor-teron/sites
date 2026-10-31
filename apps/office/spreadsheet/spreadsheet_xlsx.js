/*
 * spreadsheet_xlsx.js  (SH6)
 * Open / save .xlsx (and open .xls) with SheetJS Community Edition (Apache-2.0),
 * vendored in vendor/sheetjs/. The 950 KB library is lazy-loaded only on the
 * first XLSX open or export, so normal use stays light.
 * Import: first sheet only (toast names it if there are more); values and
 * formulas (SheetJS cell .f -> "=" + f). Cells beyond A–Z × ROWS are dropped.
 * Styles are skipped (the community build does not read them).
 * Export: values + formulas, sheet name and file name from the Hub title.
 */
var SHEET_XLSX = { src: "vendor/sheetjs/xlsx.full.min.js", loading: null };

function xlsxLoad() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (SHEET_XLSX.loading) return SHEET_XLSX.loading;
  SHEET_XLSX.loading = new Promise(function (ok, fail) {
    var s = document.createElement("script");
    s.src = SHEET_XLSX.src;
    s.onload = function () { ok(window.XLSX); };
    s.onerror = function () { SHEET_XLSX.loading = null; fail(new Error("SheetJS load failed")); };
    document.head.appendChild(s);
  });
  return SHEET_XLSX.loading;
}

function xlsxToast(m) { setStatus(m); if (window.OfficeNotify) OfficeNotify.show(m); }

function xlsxTitle() {
  var t = (window.SHEET_HUB && SHEET_HUB.title) ? SHEET_HUB.title() : "Sheet";
  return String(t || "Sheet");
}

/* Fill the grid from a SheetJS worksheet (pure; returns count of dropped cells) */
function xlsxFillGrid(XLSX, ws) {
  var dropped = 0, key, a, cell, txt;
  for (key in ws) {
    if (key.charAt(0) === "!") continue;
    a = XLSX.utils.decode_cell(key);
    cell = ws[key];
    if (a.r >= ROWS || a.c >= COLS) { dropped++; continue; }
    if (cell.f) txt = "=" + cell.f;
    else if (cell.t === "b") txt = cell.v ? "TRUE" : "FALSE";
    else if (cell.t === "e") txt = cell.w || "";
    else if (cell.t === "d" || (cell.t === "n" && cell.w && /[\/\-:]/.test(cell.w))) txt = cell.w || String(cell.v);
    else txt = cell.v == null ? "" : String(cell.v);
    cells[a.r][a.c].formula = txt;
  }
  return dropped;
}

function importXlsxFile(file) {
  xlsxToast("Opening " + file.name + "…");
  Promise.all([xlsxLoad(), file.arrayBuffer()]).then(function (res) {
    var XLSX = res[0], wb = XLSX.read(res[1], { type: "array", cellFormula: true });
    var name = wb.SheetNames[0], ws = wb.Sheets[name];
    undoRecord("import");
    emptyGrid();
    var dropped = xlsxFillGrid(XLSX, ws);
    afterChange();
    var msg = "Loaded sheet \"" + name + "\"";
    if (wb.SheetNames.length > 1) msg += " (1 of " + wb.SheetNames.length + ")";
    if (dropped) msg += ", " + dropped + " cells outside A–Z × " + ROWS + " skipped";
    xlsxToast(msg);
  }).catch(function (e) { xlsxToast("Could not open file: " + e.message); });
}

/* Build a workbook from the grid (pure) */
function xlsxBuildBook(XLSX, sheetName) {
  var ws = {}, r, c, f, lastR = -1, lastC = -1, v;
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      f = cells[r][c].formula;
      if (f == null || String(f) === "") continue;
      f = String(f);
      if (f.charAt(0) === "=") {
        v = cells[r][c].value;
        ws[XLSX.utils.encode_cell({ r: r, c: c })] = typeof v === "number"
          ? { t: "n", v: v, f: f.slice(1) } : { t: "s", v: v == null ? "" : String(v), f: f.slice(1) };
      } else if (f !== "" && !isNaN(Number(f)) && /\d/.test(f)) {
        ws[XLSX.utils.encode_cell({ r: r, c: c })] = { t: "n", v: Number(f) };
      } else if (/^(TRUE|FALSE)$/i.test(f)) {
        ws[XLSX.utils.encode_cell({ r: r, c: c })] = { t: "b", v: /^TRUE$/i.test(f) };
      } else {
        ws[XLSX.utils.encode_cell({ r: r, c: c })] = { t: "s", v: f };
      }
      if (r > lastR) lastR = r;
      if (c > lastC) lastC = c;
    }
  }
  ws["!ref"] = lastR < 0 ? "A1" : "A1:" + XLSX.utils.encode_cell({ r: lastR, c: lastC });
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.replace(/[\\\/?*\[\]:]/g, " ").slice(0, 31) || "Sheet1");
  return wb;
}

function exportXlsx() {
  xlsxLoad().then(function (XLSX) {
    var t = xlsxTitle();
    XLSX.writeFile(xlsxBuildBook(XLSX, t), t.replace(/[\\\/:*?"<>|]/g, "_") + ".xlsx");
  }).catch(function (e) { xlsxToast("Export failed: " + e.message); });
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", function () {
  var b = document.getElementById("btn-export-xlsx");
  if (b) b.addEventListener("click", exportXlsx);
});
