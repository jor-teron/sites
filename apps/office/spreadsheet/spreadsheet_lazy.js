/*
 * spreadsheet_lazy.js  (SH49)
 * Open .xlsx / .xlsm / .ods / .xls one sheet at a time.
 * SheetJS still reads the whole file once (SH47: with sheetRows = ROWS). The
 * SH47: converting a placeholder that was cut at the row cap repeats the note in the
 * status bar ("Only the first 1000 rows were opened (S3 had 20,000)."). The open toast
 * already named it.
 * first sheet is converted and calculated on open. Every other sheet is a
 * placeholder: its name is in the tab bar, sheet.lazy holds a key into
 * SHEET_LAZY.raw (the SheetJS worksheet, kept in memory), and its cells are empty.
 * - Switching to it (switchSheet, pointing at its tab, duplicate) converts it and
 *   recalculates (ensureSheetReady).
 * - recalcAll first converts every placeholder that a loaded sheet's formulas name
 *   (lazyBeforeRecalc). A name only known while a formula runs (INDIRECT) is
 *   converted from findSheetIndex during the recalc, and the recalc runs again,
 *   so values equal opening every sheet at once.
 * - Anything that needs every sheet (Save / Save As / Export xlsx / ods, the .hos
 *   capture, Find / Replace in all sheets, rename / delete / move, insert / delete
 *   rows and columns) calls lazyLoadAll or ensureAllSheetsLoaded first, so the
 *   output is the same as before SH49.
 * - Option (d): a converted cell gets the file's cached value v at once; the
 *   recalc that follows replaces it, exactly as before.
 * - Undo snapshots keep sheet.lazy, so undo brings back a placeholder.
 * - The save fingerprint (SHEET_SAVEFMT.sig) names a placeholder, or a converted
 *   sheet whose cells still equal the file, by its key, so converting a sheet is
 *   not a change and an unedited file is not written back.
 * Pure helpers (lazyFormulaSheets, lazyNeeded, lazyCellsKey) are tested in
 * test-sh49-lazy-sheets.cjs.
 */
var SHEET_LAZY = { raw: Object.create(null), next: 1, inRecalc: false, grew: false, stale: false };

/* Lower-case names of the sheets a formula points at: Sheet2!A1, 'My sheet'!A1:B2,
   and a quoted "Sheet3!A1" (an INDIRECT literal). Extra names are harmless. (pure) */
function lazyFormulaSheets(f) {
  var out = [], seen = Object.create(null), re, m, s, k;
  if (typeof f !== "string" || f.charAt(0) !== "=" || f.indexOf("!") < 0) return out;
  function add(n) {
    n = String(n == null ? "" : n).toLowerCase();
    if (n && !seen[n]) { seen[n] = 1; out.push(n); }
  }
  if (typeof mapRefs === "function") {
    mapRefs(f, function (x) { if (x && x.sheet != null) add(x.sheet); return ""; });
  }
  re = /"((?:[^"]|"")*)"/g;
  while ((m = re.exec(f))) {
    s = m[1].replace(/""/g, '"');
    k = s.lastIndexOf("!");
    if (k > 0) {
      s = s.slice(0, k);
      if (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'") s = s.slice(1, -1).replace(/''/g, "'");
      add(s);
    }
  }
  return out;
}

/* Which placeholder sheets must be converted: start from seeds (sheet indexes),
   follow the names refsOf(i) returns, keep the lazy ones, in visit order. (pure) */
function lazyNeeded(names, isLazy, refsOf, seeds) {
  var idx = Object.create(null), seen = Object.create(null), queue = [], need = [], i, j, k, refs;
  for (i = 0; i < names.length; i++) {
    k = String(names[i] == null ? "" : names[i]).toLowerCase();
    if (idx[k] == null) idx[k] = i;
  }
  for (i = 0; i < seeds.length; i++) {
    if (seeds[i] == null || seen[seeds[i]]) continue;
    seen[seeds[i]] = 1;
    queue.push(seeds[i]);
  }
  while (queue.length) {
    j = queue.shift();
    if (isLazy[j]) need.push(j);
    refs = refsOf(j) || [];
    for (k = 0; k < refs.length; k++) {
      i = idx[String(refs[k]).toLowerCase()];
      if (i != null && !seen[i]) { seen[i] = 1; queue.push(i); }
    }
  }
  return need;
}

/* Text key of a grid's formulas and styles (values left out), row by row. (pure) */
function lazyCellsKey(grid) {
  var parts = [];
  forEachReal(grid, function (r, c, cell) {
    var f = cell.formula == null ? "" : String(cell.formula);
    var dirty = typeof styleDirty === "function" ? styleDirty(cell.style) : false;
    if (f === "" && !dirty) return;
    parts.push(r + "," + c + "\u0001" + f + "\u0001" + (dirty ? JSON.stringify(cell.style) : ""));
  });
  return parts.join("\u0002");
}

/* Keep a SheetJS worksheet; returns its key. */
function lazyRegister(XLSX, ws) {
  var id = SHEET_LAZY.next++;
  SHEET_LAZY.raw[id] = { XLSX: XLSX, ws: ws || {}, refs: null, base: null };
  return id;
}

/* True when a worksheet's used range goes past the grid (some cells will be skipped). */
function lazyRangeCut(XLSX, ws) {
  var g;
  if (!ws || !ws["!ref"]) return false;
  try { g = XLSX.utils.decode_range(ws["!ref"]); } catch (e) { return false; }
  return g.e.r >= ROWS || g.e.c >= COLS;
}

function lazyAny() {
  var i;
  if (typeof workbook === "undefined" || !workbook || !workbook.sheets) return false;
  for (i = 0; i < workbook.sheets.length; i++) if (workbook.sheets[i].lazy != null) return true;
  return false;
}

function lazyIsLoaded(i) {
  var sh = workbook && workbook.sheets[i];
  return !!sh && sh.lazy == null;
}

/* Sheet names that sheet i's formulas point at (placeholder: read from the raw worksheet). */
function lazySheetRefs(i) {
  var sh = workbook.sheets[i], out = [], seen = Object.create(null), ent, key, cell;
  function addAll(list) {
    var k;
    for (k = 0; k < list.length; k++) if (!seen[list[k]]) { seen[list[k]] = 1; out.push(list[k]); }
  }
  if (!sh) return out;
  if (sh.lazy != null) {
    ent = SHEET_LAZY.raw[sh.lazy];
    if (!ent) return out;
    if (!ent.refs) {
      for (key in ent.ws) {
        if (key.charAt(0) === "!") continue;
        cell = ent.ws[key];
        if (cell && cell.f && String(cell.f).indexOf("!") >= 0) addAll(lazyFormulaSheets("=" + cell.f));
      }
      ent.refs = out;
    }
    return ent.refs;
  }
  forEachReal(sh.cells, function (r, c, x) {
    var f = x.formula;
    if (typeof f === "string" && f.charAt(0) === "=" && f.indexOf("!") >= 0) addAll(lazyFormulaSheets(f));
  });
  return out;
}

/* Convert one placeholder sheet (cells only, no recalc). Returns true when it was converted. */
function lazySheetLoad(i) {
  var sh = typeof workbook !== "undefined" && workbook && workbook.sheets[i], id, ent;
  if (!sh || sh.lazy == null) return false;
  id = sh.lazy;
  ent = SHEET_LAZY.raw[id];
  delete sh.lazy;
  if (ent && typeof xlsxFillGrid === "function") xlsxFillGrid(ent.XLSX, ent.ws, sh.cells, { cached: true });
  /* SH47: this sheet had more rows than the grid */
  if (ent && typeof xlsxRowCapHits === "function" && typeof setStatus === "function") {
    try {
      var capNote = xlsxRowCapNote(xlsxRowCapHits([{ name: sh.name, ws: ent.ws }], ROWS), ROWS);
      if (capNote) setStatus(capNote);
    } catch (e) {}
  }
  sh.lazyClean = id;
  SHEET_LAZY.stale = true;
  if (SHEET_LAZY.inRecalc) SHEET_LAZY.grew = true;
  return true;
}

/* Convert every placeholder (no recalc; the caller recalculates, e.g. afterChange). */
function lazyLoadAll() {
  var i, any = false;
  if (typeof workbook === "undefined" || !workbook || !workbook.sheets) return false;
  for (i = 0; i < workbook.sheets.length; i++) if (lazySheetLoad(i)) any = true;
  return any;
}

/* Every sheet converted and calculated: used before save, export and search. */
function ensureAllSheetsLoaded() {
  var any = lazyLoadAll();
  if ((any || SHEET_LAZY.stale) && typeof recalcAll === "function") recalcAll();
  return any;
}

/* One sheet converted and calculated (switching to it). */
function ensureSheetReady(i) {
  var any = lazySheetLoad(i);
  if ((any || SHEET_LAZY.stale) && typeof recalcAll === "function") recalcAll();
  return any;
}

/* Called by recalcAll: convert the active sheet and every placeholder that a loaded
   sheet (or one converted on the way) names, so one recalc pass is enough. */
function lazyBeforeRecalc() {
  var sheets, names = [], isLazy = [], seeds = [], i, need;
  if (!lazyAny()) return;
  sheets = workbook.sheets;
  for (i = 0; i < sheets.length; i++) {
    names.push(sheets[i].name);
    isLazy.push(sheets[i].lazy != null);
    if (sheets[i].lazy == null) seeds.push(i);
  }
  if (isLazy[workbook.active]) seeds.push(workbook.active);
  need = lazyNeeded(names, isLazy, lazySheetRefs, seeds);
  for (i = 0; i < need.length; i++) lazySheetLoad(need[i]);
}

/* Key of the file's own cells for a sheet (built once from the raw worksheet). */
function lazyBaseKey(id) {
  var ent = SHEET_LAZY.raw[id], tmp;
  if (!ent) return null;
  if (ent.base == null) {
    tmp = makeCells();
    xlsxFillGrid(ent.XLSX, ent.ws, tmp);
    ent.base = lazyCellsKey(tmp);
  }
  return ent.base;
}

/* Save fingerprint token: a placeholder, or a converted sheet whose formulas and
   styles still equal the file, is "xlsx-sheet:<key>"; anything else is null. */
function lazySigToken(sh) {
  if (!sh) return null;
  if (sh.lazy != null) return "xlsx-sheet:" + sh.lazy;
  if (sh.lazyClean != null && SHEET_LAZY.raw[sh.lazyClean] && lazyCellsKey(sh.cells) === lazyBaseKey(sh.lazyClean)) {
    return "xlsx-sheet:" + sh.lazyClean;
  }
  return null;
}

/* SH35 note on open without converting placeholders: their formulas are read from
   the raw worksheets (clipped to the grid, like a conversion). */
function lazyUnknownNote(sheets) {
  var list = [], i, sh, ent, grid, key, a, cell;
  if (typeof fxUnknownNote !== "function") return "";
  for (i = 0; i < sheets.length; i++) {
    sh = sheets[i];
    if (sh.lazy == null) { list.push(sh); continue; }
    ent = SHEET_LAZY.raw[sh.lazy];
    if (!ent) continue;
    grid = makeCells();
    for (key in ent.ws) {
      if (key.charAt(0) === "!") continue;
      cell = ent.ws[key];
      if (!cell || !cell.f) continue;
      a = ent.XLSX.utils.decode_cell(key);
      if (a.r >= ROWS || a.c >= COLS) continue;
      grid[a.r][a.c].formula = "=" + cell.f;
    }
    list.push({ name: sh.name, cells: grid });
  }
  return fxUnknownNote(list);
}
