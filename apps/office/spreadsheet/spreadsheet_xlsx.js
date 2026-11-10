/*
 * spreadsheet_xlsx.js  (SH6, SH8)
 * Open / save .xlsx (and open .xls) with SheetJS Community Edition (Apache-2.0),
 * vendored in vendor/sheetjs/. The 950 KB library is lazy-loaded only on the
 * first XLSX open or export, so normal use stays light.
 * Import: every worksheet, up to CFG.sheets.max (20), each clipped to A-Z x 100;
 * a toast names how many were loaded and how many were cut. Values and
 * formulas (SheetJS cell .f -> "=" + f). Styles are skipped (the community
 * build does not read them).
 * Export: every sheet, values + formulas; file name from the Hub title.
 * SH11: merged cells are written as SheetJS !merges (CE supports this).
 * Cell styles (font, fill, border, align) are attached as cell.s where the
 * library would allow it; SheetJS Community Edition usually does not write
 * them, so they stay reliable in the app's own sheet-v3 save. Number / date
 * formats are written on cell.z, which CE does keep.
 */
function xlsxFmtZ(fmt) {
  if (fmt === "int") return "0";
  if (fmt === "dec2") return "0.00";
  if (fmt === "thousands") return "#,##0.00";
  if (fmt === "percent") return "0.00%";
  if (fmt === "currency") return '"₹"#,##0.00';
  if (fmt === "date") return "yyyy-mm-dd";
  if (fmt === "datedmy") return "dd/mm/yyyy";
  if (fmt === "time") return "hh:mm";
  if (fmt === "datetime") return "yyyy-mm-dd hh:mm";
  return null;
}

function xlsxCellStyle(st) {
  if (!st) return null;
  var s = {}, any = false;
  if (st.bold || st.italic || st.underline || st.fontSize || st.color) {
    s.font = {};
    if (st.bold) s.font.bold = true;
    if (st.italic) s.font.italic = true;
    if (st.underline) s.font.underline = true;
    if (st.fontSize) s.font.sz = st.fontSize;
    if (st.color) s.font.color = { rgb: String(st.color).replace("#", "").toUpperCase() };
    any = true;
  }
  if (st.bg) { s.fill = { fgColor: { rgb: String(st.bg).replace("#", "").toUpperCase() }, patternType: "solid" }; any = true; }
  if (st.align || st.wrap) {
    s.alignment = {};
    if (st.align) s.alignment.horizontal = st.align;
    if (st.wrap) s.alignment.wrapText = true;
    any = true;
  }
  if (st.bt || st.br || st.bb || st.bl) {
    s.border = {};
    function edge(col) { return col ? { style: "thin", color: { rgb: String(col).replace("#", "").toUpperCase() } } : undefined; }
    if (st.bt) s.border.top = edge(st.bt);
    if (st.br) s.border.right = edge(st.br);
    if (st.bb) s.border.bottom = edge(st.bb);
    if (st.bl) s.border.left = edge(st.bl);
    any = true;
  }
  return any ? s : null;
}

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

/* Fill a sheet's cells from a SheetJS worksheet (pure; returns count of dropped cells) */
function xlsxFillGrid(XLSX, ws, grid) {
  var dropped = 0, key, a, cell, txt;
  grid = grid || cells;
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
    grid[a.r][a.c].formula = txt;
  }
  return dropped;
}

function importXlsxFile(file) {
  xlsxToast("Opening " + file.name + "…");
  Promise.all([xlsxLoad(), file.arrayBuffer()]).then(function (res) {
    var XLSX = res[0], wb = XLSX.read(res[1], { type: "array", cellFormula: true });
    var cap = (CFG.sheets && CFG.sheets.max) || 20;
    var names = wb.SheetNames || [];
    var take = names.slice(0, cap);
    var cutSheets = names.length - take.length;
    undoRecord("import");
    stashSheetView();
    var used = {}, sheets = [], dropped = 0, i, name, sh;
    for (i = 0; i < take.length; i++) {
      name = String(take[i] || ("Sheet" + (i + 1))).slice(0, CFG.sheets.nameMax);
      name = uniqueName(name, used);
      sh = makeSheet(name);
      dropped += xlsxFillGrid(XLSX, wb.Sheets[take[i]], sh.cells);
      sheets.push(sh);
    }
    if (!sheets.length) sheets.push(makeSheet("Sheet1"));
    workbook = { sheets: sheets, active: 0 };
    bindActiveSheet();
    selR = selC = extR = extC = 0; selMode = "cell";
    afterChange();
    if (typeof applyWidths === "function") applyWidths();
    if (typeof renderSheetTabs === "function") renderSheetTabs();
    highlightSel();
    var msg = "Loaded " + sheets.length + " sheet" + (sheets.length === 1 ? "" : "s");
    if (cutSheets) msg += " (" + cutSheets + " extra sheet" + (cutSheets === 1 ? "" : "s") + " not opened; max " + cap + ")";
    if (dropped) msg += ", " + dropped + " cells outside A–Z × " + ROWS + " skipped";
    xlsxToast(msg);
  }).catch(function (e) { xlsxToast("Could not open file: " + e.message); });
}

/* Build one SheetJS worksheet from a sheet's cells (pure) */
function xlsxDecorate(cell, st) {
  var z, s;
  if (!st) return cell;
  z = xlsxFmtZ(st.fmt);
  if (z) cell.z = z;
  s = xlsxCellStyle(st);
  if (s) cell.s = s;
  return cell;
}

function xlsxBuildSheet(XLSX, grid, sheet) {
  var ws = {}, r, c, f, lastR = -1, lastC = -1, v, cell, st, merges, i, m;
  for (r = 0; r < ROWS; r++) {
    for (c = 0; c < COLS; c++) {
      f = grid[r][c].formula;
      st = grid[r][c].style;
      if ((f == null || String(f) === "") && !(st && (st.bt || st.br || st.bb || st.bl || st.bg || st.bold || st.fmt))) continue;
      f = f == null ? "" : String(f);
      if (f.charAt(0) === "=") {
        v = grid[r][c].value;
        cell = typeof v === "number"
          ? { t: "n", v: v, f: f.slice(1) } : { t: "s", v: v == null ? "" : String(v), f: f.slice(1) };
      } else if (f !== "" && !isNaN(Number(f)) && /\d/.test(f)) {
        cell = { t: "n", v: Number(f) };
      } else if (/^(TRUE|FALSE)$/i.test(f)) {
        cell = { t: "b", v: /^TRUE$/i.test(f) };
      } else {
        cell = { t: "s", v: f };
      }
      xlsxDecorate(cell, st);
      ws[XLSX.utils.encode_cell({ r: r, c: c })] = cell;
      if (r > lastR) lastR = r;
      if (c > lastC) lastC = c;
    }
  }
  if (sheet && sheet.merges && sheet.merges.length) {
    merges = [];
    for (i = 0; i < sheet.merges.length; i++) {
      m = sheet.merges[i];
      merges.push({ s: { r: m.r1, c: m.c1 }, e: { r: m.r2, c: m.c2 } });
      if (m.r2 > lastR) lastR = m.r2;
      if (m.c2 > lastC) lastC = m.c2;
    }
    ws["!merges"] = merges;
  }
  ws["!ref"] = lastR < 0 ? "A1" : "A1:" + XLSX.utils.encode_cell({ r: lastR, c: lastC });
  return ws;
}

/* Build a workbook from every sheet (pure) */
function xlsxBuildBook(XLSX) {
  var wb = XLSX.utils.book_new();
  var used = {}, i, name, sh;
  for (i = 0; i < workbook.sheets.length; i++) {
    sh = workbook.sheets[i];
    name = uniqueName((sh.name || "Sheet").replace(/[\\\/?*\[\]:]/g, " ").slice(0, 31) || "Sheet1", used);
    XLSX.utils.book_append_sheet(wb, xlsxBuildSheet(XLSX, sh.cells, sh), name);
  }
  return wb;
}

function exportXlsx() {
  xlsxLoad().then(function (XLSX) {
    var t = xlsxTitle();
    XLSX.writeFile(xlsxBuildBook(XLSX), t.replace(/[\\\/:*?"<>|]/g, "_") + ".xlsx");
  }).catch(function (e) { xlsxToast("Export failed: " + e.message); });
}

if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", function () {
  var b = document.getElementById("btn-export-xlsx");
  if (b) b.addEventListener("click", exportXlsx);
});
