/*
 * spreadsheet_xlsx.js  (SH6, SH8, SH27)
 * Open / save .xlsx (and open .xls) with SheetJS Community Edition (Apache-2.0),
 * vendored in vendor/sheetjs/. The 950 KB library is lazy-loaded only on the
 * first XLSX / ODS open or export, so normal use stays light.
 * SH27: the same path opens and exports LibreOffice .ods (XLSX.read / write
 * with bookType 'ods'). File → Open (XLSX / ODS / CSV), drop, or a Hub
 * #drive=&file= link ending .ods / .xlsx / .xls. File → Export ODS.
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
 * SH17: a border colour of "auto" (and the old default #000000) is written as
 * black (000000). Import still does not read cell styles. Merges are unchanged.
 * SH13: spill ghosts are not stored, so export writes the anchor formula only
 * (plus that cell's cached top-left value). Import still loads formulas and values.
 * SH32: an opened .xlsx / .ods is the Save target (spreadsheet_saveformat.js):
 * importXlsxFile(file, { dest | handle }) no longer makes a .hos copy of it.
 * .xls still becomes a .hos. A Hub link to a .csv opens it the same way.
 * A drop keeps the file handle (Chromium, outside the Hub).
 * SH33: .xlsm (Excel with macros) opens like .xlsx (Open, drop, Hub link). Its
 * macro parts are kept in memory (SHEET_XLSM.extract, spreadsheet_xlsm.js) and
 * Save writes back to the same .xlsm with them. Macros are not run or shown.
 * SH35: the open toast adds "Not supported yet: NAME, ... (n cells)" when a
 * formula uses a function this app does not have.
 * SH47: XLSX.read gets sheetRows = ROWS (CFG.grid.rows), so rows past the grid are not
 * parsed at all. A sheet that had more rows (ws["!fullref"], or "!ref" when the reader
 * ignored sheetRows) is named in the open toast: "Only the first 1000 rows were opened
 * (Sheet1 had 20,000)." (xlsxRowCapHits / xlsxRowCapNote, pure). CSV open is unchanged.
 * SH49: open converts and calculates only the first sheet; the others are
 * placeholders converted on first use (spreadsheet_lazy.js). Export / Save build
 * the book after ensureAllSheetsLoaded, so the file is the same as before.
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
    function edge(col) {
      /* (before SH17): return col ? { style: "thin", color: { rgb: String(col).replace("#", "").toUpperCase() } } : undefined; */
      var rgb = typeof styleBorderExportColor === "function"
        ? styleBorderExportColor(col)
        : String(col).replace("#", "").toUpperCase();
      return col ? { style: "thin", color: { rgb: rgb } } : undefined;
    }
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

/* Fill a sheet's cells from a SheetJS worksheet (pure; returns count of dropped cells)
   SH49: o.cached also writes the file's cached value (formula cells: v; others: the text) */
/* (before SH49) function xlsxFillGrid(XLSX, ws, grid) { */
function xlsxFillGrid(XLSX, ws, grid, o) {
  var dropped = 0, key, a, cell, txt, slot, cv;
  var cached = !!(o && o.cached);
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
    /* (before SH49) grid[a.r][a.c].formula = txt; */
    slot = grid[a.r][a.c];
    slot.formula = txt;
    if (cached) {
      cv = txt;
      if (cell.f) {
        if (cell.t === "b") cv = cell.v ? "TRUE" : "FALSE";
        else if (cell.t === "e") cv = cell.w || "";
        else cv = cell.v == null ? "" : cell.v;
      }
      slot.value = cv;
    }
  }
  return dropped;
}

/* ---------- SH47: row cap ---------- */
/* Read options for opening a workbook: rows past the grid (ROWS) are not parsed. */
function xlsxReadOpts() {
  var cap = typeof ROWS === "number" && ROWS > 0 ? ROWS : ((CFG.grid && CFG.grid.rows) || 1000);
  return { type: "array", cellFormula: true, sheetRows: cap };
}

/* Pure: last row number (1-based) of an A1 range like "A1:O20000"; 0 when unreadable. */
function xlsxRefRows(ref) {
  var m, end;
  if (typeof ref !== "string" || !ref) return 0;
  end = ref.split(":").pop();
  m = /^\$?[A-Za-z]{0,3}\$?(\d+)$/.exec(end.trim());
  return m ? parseInt(m[1], 10) : 0;
}

/* Pure: sheets [{ name, ws }] -> [{ name, rows }] for every sheet that had more than cap
   rows. The original range is ws["!fullref"] (SheetJS sets it when sheetRows cut the
   sheet); without it, ws["!ref"] (a reader that ignored sheetRows). */
function xlsxRowCapHits(list, cap) {
  var out = [], i, ws, rows;
  for (i = 0; list && i < list.length; i++) {
    ws = list[i] && list[i].ws;
    if (!ws) continue;
    rows = xlsxRefRows(ws["!fullref"]) || xlsxRefRows(ws["!ref"]);
    if (rows > cap) out.push({ name: String(list[i].name), rows: rows });
  }
  return out;
}

/* Pure: 20000 -> "20,000". */
function xlsxGroupNum(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/* Pure: "Only the first 1000 rows were opened (Sheet1 had 20,000; Data had 5,000)." or "". */
function xlsxRowCapNote(hits, cap) {
  var parts = [], i;
  if (!hits || !hits.length) return "";
  for (i = 0; i < hits.length; i++) parts.push(hits[i].name + " had " + xlsxGroupNum(hits[i].rows));
  return "Only the first " + cap + " rows were opened (" + parts.join("; ") + ").";
}

function xlsxIsWorkbookName(name) {
  /* (before SH33) return /\.(xlsx|xls|ods)$/i.test(String(name || "")); */
  return /\.(xlsx|xlsm|xls|ods)$/i.test(String(name || ""));
}

function xlsxIsWorkbookFile(file) {
  if (!file) return false;
  if (xlsxIsWorkbookName(file.name)) return true;
  var t = String(file.type || "").toLowerCase();
  /* (before SH33) return t.indexOf("spreadsheetml") >= 0 || t.indexOf("opendocument.spreadsheet") >= 0 || t === "application/vnd.ms-excel"; */
  return t.indexOf("spreadsheetml") >= 0 || t.indexOf("opendocument.spreadsheet") >= 0 || t === "application/vnd.ms-excel" ||
    t.indexOf("ms-excel.sheet.macroenabled") >= 0;
}

/* Build sheet objects from a SheetJS workbook (pure). */
function xlsxSheetsFromBook(XLSX, wb) {
  var cap = (CFG.sheets && CFG.sheets.max) || 20;
  var names = wb.SheetNames || [];
  var take = names.slice(0, cap);
  var used = {}, sheets = [], dropped = 0, i, name, sh;
  for (i = 0; i < take.length; i++) {
    name = String(take[i] || ("Sheet" + (i + 1))).slice(0, CFG.sheets.nameMax);
    name = uniqueName(name, used);
    sh = makeSheet(name);
    dropped += xlsxFillGrid(XLSX, wb.Sheets[take[i]], sh.cells);
    sheets.push(sh);
  }
  return { sheets: sheets, cutSheets: names.length - take.length, dropped: dropped };
}

/* SH49: like xlsxSheetsFromBook, but only sheet `first` (default 0) is converted.
   Every other sheet is a placeholder (sheet.lazy = key of its raw worksheet).
   dropped counts the converted sheet only; moreCut is true when a placeholder's
   range goes past the grid. */
function xlsxSheetsFromBookLazy(XLSX, wb, first) {
  var cap = (CFG.sheets && CFG.sheets.max) || 20;
  var names = wb.SheetNames || [];
  var take = names.slice(0, cap);
  var used = {}, sheets = [], dropped = 0, moreCut = false, i, name, sh, ws;
  first = first | 0;
  for (i = 0; i < take.length; i++) {
    name = String(take[i] || ("Sheet" + (i + 1))).slice(0, CFG.sheets.nameMax);
    name = uniqueName(name, used);
    sh = makeSheet(name);
    ws = wb.Sheets[take[i]];
    if (i === first) {
      dropped += xlsxFillGrid(XLSX, ws, sh.cells, { cached: true });
      sh.lazyClean = lazyRegister(XLSX, ws);
    } else {
      sh.lazy = lazyRegister(XLSX, ws);
      if (lazyRangeCut(XLSX, ws)) moreCut = true;
    }
    sheets.push(sh);
  }
  return { sheets: sheets, cutSheets: names.length - take.length, dropped: dropped, moreCut: moreCut };
}

/* Write the live workbook through SheetJS (pure; type defaults to array). */
function xlsxWriteBook(XLSX, bookType, typ) {
  return XLSX.write(xlsxBuildBook(XLSX), { bookType: bookType || "xlsx", type: typ || "array" });
}

/* (before SH32) function importXlsxFile(file) { */
function importXlsxFile(file, o) {
  o = o || {};
  var SF = (typeof SHEET_SAVEFMT !== "undefined") ? SHEET_SAVEFMT : null;   /* SH32 */
  var direct = SF ? SF.formatOf(file && file.name) : "hos";
  /* (before SH33) if (direct !== "xlsx" && direct !== "ods") direct = ""; */
  if (direct !== "xlsx" && direct !== "xlsm" && direct !== "ods") direct = "";
  if (SF) SF.flush();   /* SH32: an .xlsx / .ods / .csv being replaced is written first when changed */
  xlsxToast("Opening " + file.name + "…");
  if (file && file.name && window.SHEET_HUB && SHEET_HUB.setTitle) {
    SHEET_HUB.setTitle(String(file.name).replace(/\.[^.]+$/, ""));
  }
  /* (before SH40a) Promise.all([xlsxLoad(), file.arrayBuffer()]).then(function (res) { ... }) returned nothing. */
  /* SH40a: returns Promise<boolean> so a failed open can go back to the empty panel (spreadsheet_empty.js). */
  return Promise.all([xlsxLoad(), file.arrayBuffer()]).then(function (res) {
    /* (before SH47) var XLSX = res[0], wb = XLSX.read(res[1], { type: "array", cellFormula: true }); */
    var XLSX = res[0], wb = XLSX.read(res[1], xlsxReadOpts());   /* SH47: sheetRows = ROWS */
    /* (before SH49) var loaded = xlsxSheetsFromBook(XLSX, wb); */
    var loaded = typeof xlsxSheetsFromBookLazy === "function" && typeof lazyRegister === "function"
      ? xlsxSheetsFromBookLazy(XLSX, wb, 0) : xlsxSheetsFromBook(XLSX, wb);   /* SH49: first sheet only */
    /* SH33: an .xlsm keeps its macro parts (raw bytes, memory only) for Save. */
    var macro = null;
    if (direct === "xlsm" && typeof SHEET_XLSM !== "undefined") {
      try { macro = SHEET_XLSM.extract(XLSX, res[1]); } catch (e) { macro = null; }
    }
    var sheets = loaded.sheets, cutSheets = loaded.cutSheets, dropped = loaded.dropped;
    undoRecord("import");
    stashSheetView();
    if (!sheets.length) sheets.push(makeSheet("Sheet1"));
    workbook = { sheets: sheets, active: 0 };

    bindActiveSheet();
    selR = selC = extR = extC = 0; selMode = "cell";
    /* HOS1: Open XLSX replaces the workbook, so it becomes its own .hos file
       instead of overwriting the one that was open. CSV import still edits
       the current sheet. */
    if (typeof SHEET_HOS !== "undefined" && SHEET_HOS.detach) {
      SHEET_HOS.detach();
      SHEET_HOS.skipWrite = true;
    }
    /* SH46: afterChange, applyWidths and highlightSel below share one full render */
    var held = typeof sheetRenderHold === "function" ? sheetRenderHold() : false;
    try {
    afterChange();
    if (typeof saveStore === "function") clearTimeout(saveStore._t);
    var saved = Promise.resolve();
    /* (before SH32) every opened workbook became a .hos copy:
    if (typeof SHEET_HOS !== "undefined" && SHEET_HOS.detach) {
      SHEET_HOS.skipWrite = false;
      saved = SHEET_HOS.save({ unique: true });
    } */
    if (SF && direct) {
      /* SH32: Save writes back to this .xlsx / .ods; the .hos session stays held. */
      /* (before SH33) SF.opened(direct, o.dest || (o.handle ? { kind: "handle", handle: o.handle, name: o.handle.name || file.name } : null), file.name); */
      SF.opened(direct, o.dest || (o.handle ? { kind: "handle", handle: o.handle, name: o.handle.name || file.name } : null), file.name, macro);
    } else if (typeof SHEET_HOS !== "undefined" && SHEET_HOS.detach) {
      if (SF) SF.reset();
      SHEET_HOS.skipWrite = false;
      saved = SHEET_HOS.save({ unique: true });
    }
    if (typeof applyWidths === "function") applyWidths();
    if (typeof renderSheetTabs === "function") renderSheetTabs();
    highlightSel();
    } finally { if (held) sheetRenderRelease(); }
    var msg = "Loaded " + sheets.length + " sheet" + (sheets.length === 1 ? "" : "s");
    if (cutSheets) msg += " (" + cutSheets + " extra sheet" + (cutSheets === 1 ? "" : "s") + " not opened; max " + ((CFG.sheets && CFG.sheets.max) || 20) + ")";
    /* (before SH24) if (dropped) msg += ", " + dropped + " cells outside A–Z × " + ROWS + " skipped"; */
    if (dropped) msg += ", " + dropped + " cells outside A–FZ × " + ROWS + " skipped";
    if (loaded.moreCut) msg += ", some cells outside A–FZ × " + ROWS + " in other sheets will be skipped";   /* SH49 */
    /* SH35: one short note naming functions this app does not have */
    var unknownNote = "";
    /* (before SH49) try { unknownNote = typeof fxUnknownNote === "function" ? fxUnknownNote(sheets) : ""; } catch (e) { unknownNote = ""; } */
    /* SH49: placeholders are scanned from their raw worksheets, so the note is the same and nothing is converted */
    try {
      unknownNote = typeof lazyUnknownNote === "function" ? lazyUnknownNote(sheets)
        : (typeof fxUnknownNote === "function" ? fxUnknownNote(sheets) : "");
    } catch (e) { unknownNote = ""; }
    if (unknownNote) msg += ". " + unknownNote;
    /* SH47: sheets cut at the row cap, placeholders (SH49) included: their raw worksheets carry !fullref */
    var capNote = "";
    try {
      var capList = [], ci;
      for (ci = 0; ci < sheets.length && wb.SheetNames && ci < wb.SheetNames.length; ci++) {
        capList.push({ name: sheets[ci].name, ws: wb.Sheets[wb.SheetNames[ci]] });
      }
      capNote = xlsxRowCapNote(xlsxRowCapHits(capList, ROWS), ROWS);
    } catch (e) { capNote = ""; }
    if (capNote) msg += ". " + capNote;
    saved.then(function () { xlsxToast(msg); }, function () { xlsxToast(msg); });
    return true;   /* SH40a */
  /* (before SH40a) }).catch(function (e) { xlsxToast("Could not open file: " + e.message); }); */
  }).catch(function (e) { xlsxToast("Could not open file: " + e.message); return false; });
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
  /* (before SH24) for (r = 0; r < ROWS; r++) for (c = 0; c < COLS; c++) read every slot.
     The loop below only visits cells that were actually stored. */
  forEachReal(grid, function (r, c, real) {
      f = real.formula;
      st = real.style;
      if ((f == null || String(f) === "") && !(st && (st.bt || st.br || st.bb || st.bl || st.bg || st.bold || st.fmt))) return;
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
  });
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
  /* SH49: every sheet converted and calculated first, so the file is the same as an eager open */
  if (typeof ensureAllSheetsLoaded === "function") ensureAllSheetsLoaded();
  for (i = 0; i < workbook.sheets.length; i++) {
    sh = workbook.sheets[i];
    name = uniqueName((sh.name || "Sheet").replace(/[\\\/?*\[\]:]/g, " ").slice(0, 31) || "Sheet1", used);
    XLSX.utils.book_append_sheet(wb, xlsxBuildSheet(XLSX, sh.cells, sh), name);
  }
  return wb;
}

function exportXlsxKind(bookType, ext) {
  xlsxLoad().then(function (XLSX) {
    var t = xlsxTitle();
    XLSX.writeFile(xlsxBuildBook(XLSX), t.replace(/[\\\/:*?"<>|]/g, "_") + "." + ext, { bookType: bookType });
  }).catch(function (e) { xlsxToast("Export failed: " + e.message); });
}

/* (before SH27) function exportXlsx() { xlsxLoad().then(function (XLSX) { XLSX.writeFile(xlsxBuildBook(XLSX), name + ".xlsx"); }); } */
function exportXlsx() { exportXlsxKind("xlsx", "xlsx"); }
function exportOds() { exportXlsxKind("ods", "ods"); }

var xlsxHashKey = "";
function openXlsxFromHash() {
  if (typeof window === "undefined" || !window.FsRef || typeof window.FsRef.parse !== "function" || !window.location) {
    return Promise.resolve(false);
  }
  var ref = window.FsRef.parse(window.location.hash);
  /* (before SH32) if (!ref || !ref.name || !xlsxIsWorkbookName(ref.name)) return Promise.resolve(false); */
  var isCsv = !!(ref && ref.name && /\.csv$/i.test(ref.name) && typeof SHEET_SAVEFMT !== "undefined");
  if (!ref || !ref.name || !(xlsxIsWorkbookName(ref.name) || isCsv)) return Promise.resolve(false);
  if (typeof window.FsRef.resolve !== "function") return Promise.resolve(false);
  var key = (window.FsRef.hash ? window.FsRef.hash(ref) : (ref.drive + "|" + (ref.path || "") + "|" + ref.name));
  if (key === xlsxHashKey) return Promise.resolve(false);
  xlsxHashKey = key;
  return window.FsRef.resolve(ref).then(function (got) {
    var handle = got && (got.file || got.handle || got);
    if (!handle || typeof handle.getFile !== "function") { xlsxHashKey = ""; return false; }
    return handle.getFile().then(function (file) {
      /* (before SH32) importXlsxFile(file); */
      var dest = { kind: "hub", drive: ref.drive, path: ref.path || "", name: ref.name };   /* SH32: Save writes back here */
      if (isCsv) return SHEET_SAVEFMT.openCsvFile(file, { dest: dest });
      importXlsxFile(file, { dest: dest });
      return true;
    });
  }).catch(function (e) {
    xlsxHashKey = "";
    xlsxToast("Could not open file: " + ((e && (e.userMessage || e.message)) || String(e)));
    return false;
  });
}

if (typeof SHEET_INIT !== "undefined") {
  SHEET_INIT.push(function () {
    if (typeof SHEET_HOS !== "undefined" && SHEET_HOS && typeof SHEET_HOS.start === "function" && !SHEET_HOS._xlsxStartWrapped) {
      var start = SHEET_HOS.start;
      SHEET_HOS._xlsxStartWrapped = true;
      SHEET_HOS.start = function () {
        return openXlsxFromHash().then(function (ok) {
          if (ok) return true;
          return start.call(SHEET_HOS);
        });
      };
    }
    if (typeof window !== "undefined") window.addEventListener("hashchange", function () { openXlsxFromHash(); });
  });
}

function bindXlsxUi() {
  if (SHEET_XLSX._uiBound || typeof document === "undefined") return;
  SHEET_XLSX._uiBound = true;
  var b = document.getElementById("btn-export-xlsx");
  if (b) b.addEventListener("click", exportXlsx);
  var o = document.getElementById("btn-export-ods");
  if (o) o.addEventListener("click", exportOds);
  document.addEventListener("dragover", function (e) {
    if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1) e.preventDefault();
  });
  /* (before SH32)
  document.addEventListener("drop", function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!xlsxIsWorkbookFile(f)) return;
    e.preventDefault();
    importXlsxFile(f);
  }); */
  document.addEventListener("drop", function (e) {
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    var SF = (typeof SHEET_SAVEFMT !== "undefined") ? SHEET_SAVEFMT : null;
    var csv = !!(SF && f && /\.csv$/i.test(f.name || ""));
    if (!xlsxIsWorkbookFile(f) && !csv) return;
    e.preventDefault();
    /* SH32: keep the dropped file's handle (Chromium, outside the Hub) so Save writes back to it. */
    var hp = SF ? SF.dropHandle(e, f) : null;
    function go(h) {
      if (csv) SF.openCsvFile(f, h ? { handle: h } : {});
      else importXlsxFile(f, h ? { handle: h } : {});
    }
    if (hp && hp.then) hp.then(function (h) { go(h && h.kind === "file" ? h : null); }, function () { go(null); });
    else go(null);
  });
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindXlsxUi);
  else bindXlsxUi();
}
