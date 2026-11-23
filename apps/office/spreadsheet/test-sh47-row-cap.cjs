#!/usr/bin/env node
/* SH47: xlsx/xls/ods open reads at most ROWS rows per sheet (XLSX.read sheetRows) and the
   open toast names every sheet that had more. Pure helpers are checked directly; the real
   modules run in a vm (no DOM) with the vendored SheetJS for the open path.
   Run: node --test apps/office/spreadsheet/test-sh47-row-cap.cjs */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const XLSX = require(path.join(dir, 'vendor/sheetjs/xlsx.full.min.js'));
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const live = (src) => src.replace(/<!--[\s\S]*?-->/g, '');
const plain = (x) => JSON.parse(JSON.stringify(x));

function load() {
  const files = ['spreadsheet_config.js', 'spreadsheet_formula.js', 'spreadsheet_functions.js',
    'spreadsheet_refs.js', 'spreadsheet_state.js', 'spreadsheet_storage.js', 'spreadsheet_format.js',
    'spreadsheet_style.js', 'spreadsheet_files.js', 'spreadsheet_xlsx.js', 'spreadsheet_lazy.js',
    'spreadsheet_sheets.js', 'spreadsheet_undo.js', 'spreadsheet_rows.js'];
  const rec = { status: [], notes: [], reads: [] };
  const ctx = {
    console, Date, Math, Number, String, Boolean, Array, Object, Proxy, JSON, Promise, Map, Uint8Array, ArrayBuffer,
    parseInt, isNaN, isFinite, RegExp, Error, TypeError, NaN, Infinity, undefined, setTimeout, clearTimeout,
    document: {
      addEventListener() {}, getElementById() { return null; }, querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return { style: {}, dataset: {}, classList: { add() {}, toggle() {} }, appendChild() {}, addEventListener() {}, setAttribute() {}, querySelector() { return null; } }; }
    },
    SHEET_INIT: [],
    OfficeNotify: { show(m) { rec.notes.push(m); } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(files.map(read).join('\n;\n'), ctx, { filename: 'spreadsheet-sh47.js' });
  vm.runInContext(`
    function setStatus(m) { __rec.status.push(m); }
    function afterChange() { recalcAll(); }
    function paintAll() {} function highlightSel() {} function applyWidths() {} function syncStyleUi() {}
    function blurEditing() {} function updateStats() {} function applyFilters() {} function saveStore() {}
    function undoButtons() {}`, Object.assign(ctx, { __rec: rec }));
  /* SheetJS wrapped so the test sees the options every read got */
  const spy = Object.assign({}, XLSX, { read(d, o) { rec.reads.push(o); return XLSX.read(d, o); } });
  ctx.XLSX = spy;
  ctx.xlsxLoad = () => Promise.resolve(spy);
  ctx.emptyWorkbook();
  return { ctx, rec };
}

function sheetOf(rows, cols) {
  const aoa = [];
  for (let r = 0; r < rows; r++) { const row = []; for (let c = 0; c < (cols || 2); c++) row.push(r * 10 + c); aoa.push(row); }
  return XLSX.utils.aoa_to_sheet(aoa);
}
function book(sheets, bookType) {
  const wb = XLSX.utils.book_new();
  for (const [name, ws] of sheets) XLSX.utils.book_append_sheet(wb, ws, name);
  const buf = XLSX.write(wb, { bookType: bookType || 'xlsx', type: 'buffer' });
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}
function open(ctx, ab, name) {
  return ctx.importXlsxFile({ name: name || 'book.xlsx', arrayBuffer: () => Promise.resolve(ab) }, {});
}
const flush = () => new Promise((r) => setTimeout(r, 0));
/* the open toast ("Opening…" comes first) */
const openToast = (rec) => rec.notes[rec.notes.length - 1];
function maxRow(ctx, si) {
  let m = -1;
  ctx.forEachReal(ctx.workbook.sheets[si].cells, (r) => { if (r > m) m = r; });
  return m;
}

/* ---------- pure ---------- */
test('pure: xlsxRefRows reads the last row of a range', () => {
  const { ctx } = load();
  assert.equal(ctx.xlsxRefRows('A1:O20000'), 20000);
  assert.equal(ctx.xlsxRefRows('B3'), 3);
  assert.equal(ctx.xlsxRefRows('$A$1:$XFD$1048576'), 1048576);
  assert.equal(ctx.xlsxRefRows(''), 0);
  assert.equal(ctx.xlsxRefRows(undefined), 0);
  assert.equal(ctx.xlsxRefRows('junk'), 0);
});

test('pure: xlsxRowCapHits prefers !fullref, falls back to !ref, skips sheets at or under the cap', () => {
  const { ctx } = load();
  const hits = ctx.xlsxRowCapHits([
    { name: 'Cut', ws: { '!ref': 'A1:C1000', '!fullref': 'A1:C20000' } },
    { name: 'Exact', ws: { '!ref': 'A1:C1000' } },
    { name: 'Small', ws: { '!ref': 'A1:B10' } },
    { name: 'NoCut', ws: { '!ref': 'A1:B1500' } },           /* reader ignored sheetRows */
    { name: 'Empty', ws: {} },
    { name: 'Missing', ws: null }
  ], 1000);
  assert.deepEqual(plain(hits), [{ name: 'Cut', rows: 20000 }, { name: 'NoCut', rows: 1500 }]);
  assert.deepEqual(plain(ctx.xlsxRowCapHits([], 1000)), []);
  assert.deepEqual(plain(ctx.xlsxRowCapHits(null, 1000)), []);
});

test('pure: xlsxRowCapNote wording and digit groups', () => {
  const { ctx } = load();
  assert.equal(ctx.xlsxRowCapNote([{ name: 'Sheet1', rows: 20000 }], 1000),
    'Only the first 1000 rows were opened (Sheet1 had 20,000).');
  assert.equal(ctx.xlsxRowCapNote([{ name: 'A', rows: 1001 }, { name: 'B', rows: 1234567 }], 1000),
    'Only the first 1000 rows were opened (A had 1,001; B had 1,234,567).');
  assert.equal(ctx.xlsxRowCapNote([], 1000), '');
  assert.equal(ctx.xlsxGroupNum(999), '999');
  assert.equal(ctx.xlsxGroupNum(1000), '1,000');
});

test('read options: sheetRows is ROWS from config (not a literal)', () => {
  const { ctx } = load();
  const o = plain(ctx.xlsxReadOpts());
  assert.deepEqual(o, { type: 'array', cellFormula: true, sheetRows: ctx.CFG.grid.rows });
  assert.equal(ctx.ROWS, ctx.CFG.grid.rows);
  ctx.ROWS = 50;
  assert.equal(ctx.xlsxReadOpts().sheetRows, 50);
  const src = read('spreadsheet_xlsx.js');
  assert.ok(!/sheetRows:\s*\d/.test(src), 'no hardcoded sheetRows');
});

/* ---------- open ---------- */
test('xlsx open: every XLSX.read gets sheetRows; one toast names the cut sheets with their original rows', async () => {
  const { ctx, rec } = load();
  const R = ctx.ROWS;
  const ab = book([['Small', sheetOf(5)], ['Sheet1', sheetOf(R + 1500)], ['Other', sheetOf(R)], ['Big2', sheetOf(R * 3)]]);
  assert.equal(await open(ctx, ab), true);
  await flush();
  assert.ok(rec.reads.length >= 1);
  for (const o of rec.reads) assert.equal(o.sheetRows, R);
  assert.equal(rec.notes.filter((m) => /Only the first/.test(m)).length, 1, 'one toast with the note');
  const n = openToast(rec);
  const want = 'Only the first ' + R + ' rows were opened (Sheet1 had ' + ctx.xlsxGroupNum(R + 1500) +
    '; Big2 had ' + ctx.xlsxGroupNum(R * 3) + ').';
  assert.ok(n.indexOf(want) !== -1, n);
  assert.ok(n.indexOf('Small had') === -1 && n.indexOf('Other had') === -1, n);
  /* grid still holds exactly the first ROWS rows of the cut sheet once it is opened */
  ctx.ensureSheetReady(1);
  assert.equal(maxRow(ctx, 1), R - 1);
  assert.equal(String(ctx.workbook.sheets[1].cells[R - 1][0].value), String((R - 1) * 10));
});

test('xlsx open: no note when every sheet fits', async () => {
  const { ctx, rec } = load();
  const ab = book([['A', sheetOf(10)], ['B', sheetOf(ctx.ROWS)]]);
  await open(ctx, ab);
  await flush();
  assert.ok(!rec.notes.some((m) => /Only the first/.test(m)), JSON.stringify(rec.notes));
});

test('active sheet cut: named in the toast too', async () => {
  const { ctx, rec } = load();
  const ab = book([['Sheet1', sheetOf(ctx.ROWS + 1)]]);
  await open(ctx, ab);
  await flush();
  assert.ok(openToast(rec).indexOf('(Sheet1 had ' + ctx.xlsxGroupNum(ctx.ROWS + 1) + ').') !== -1, openToast(rec));
  assert.equal(maxRow(ctx, 0), ctx.ROWS - 1);
});

test('lazy sheet (SH49) converted later: the status bar repeats the note for that sheet', async () => {
  const { ctx, rec } = load();
  const R = ctx.ROWS;
  const ab = book([['First', sheetOf(3)], ['Later', sheetOf(R + 7)]]);
  await open(ctx, ab);
  await flush();
  assert.equal(ctx.lazyIsLoaded(1), false);
  rec.status.length = 0;
  ctx.ensureSheetReady(1);
  assert.ok(rec.status.indexOf('Only the first ' + R + ' rows were opened (Later had ' + ctx.xlsxGroupNum(R + 7) + ').') !== -1,
    JSON.stringify(rec.status));
  assert.equal(maxRow(ctx, 1), R - 1);
  /* a sheet that fits says nothing when it loads */
  const { ctx: c2, rec: r2 } = load();
  await open(c2, book([['First', sheetOf(3)], ['Fits', sheetOf(4)]]));
  await flush();
  r2.status.length = 0;
  c2.ensureSheetReady(1);
  assert.ok(!r2.status.some((m) => /Only the first/.test(m)));
});

test('ods open: capped and named the same way', async () => {
  const { ctx, rec } = load();
  const R = ctx.ROWS;
  const ab = book([['Sheet1', sheetOf(R + 20)]], 'ods');
  await open(ctx, ab, 'book.ods');
  await flush();
  for (const o of rec.reads) assert.equal(o.sheetRows, R);
  assert.ok(openToast(rec).indexOf('Only the first ' + R + ' rows were opened (Sheet1 had ' + ctx.xlsxGroupNum(R + 20) + ').') !== -1, openToast(rec));
  assert.equal(maxRow(ctx, 0), R - 1);
});

test('xls (BIFF8) open: capped and named the same way', async () => {
  const { ctx, rec } = load();
  const R = ctx.ROWS;
  const ab = book([['Sheet1', sheetOf(R + 2)]], 'biff8');
  await open(ctx, ab, 'book.xls');
  await flush();
  for (const o of rec.reads) assert.equal(o.sheetRows, R);
  assert.ok(openToast(rec).indexOf('(Sheet1 had ' + ctx.xlsxGroupNum(R + 2) + ').') !== -1, openToast(rec));
  assert.equal(maxRow(ctx, 0), R - 1);
});

/* ---------- CSV ---------- */
test('CSV import is unaffected: no SheetJS, no row-cap note, same clip as before', () => {
  const { ctx, rec } = load();
  const R = ctx.ROWS;
  const lines = [];
  for (let r = 0; r < R + 5; r++) lines.push(r + ',x' + r);
  ctx.importCsvText(lines.join('\n'));
  assert.equal(rec.reads.length, 0, 'CSV never calls XLSX.read');
  assert.ok(!rec.notes.concat(rec.status).some((m) => /Only the first/.test(String(m))));
  assert.equal(String(ctx.workbook.sheets[ctx.workbook.active].cells[R - 1][0].value), String(R - 1));
  assert.equal(maxRow(ctx, ctx.workbook.active), R - 1);
  assert.ok(read('spreadsheet_files.js').indexOf('sheetRows') === -1);
  assert.ok(read('spreadsheet_saveformat.js').indexOf('XLSX.read') === -1);
});

/* ---------- wiring ---------- */
test('wiring: version SH47, ?v= tokens, readme, old code kept as comments', () => {
  const html = read('spreadsheet.html');
  assert.ok(html.indexOf('<title>Spreadsheet SH47</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH47) <title>Spreadsheet SH46</title> -->') !== -1);
  const l = live(html);
  const loader = read('spreadsheet_loader.js');   /* SH58: xlsx/lazy moved to lazy loader */
  /* (before SH58) for (const f of ['spreadsheet_xlsx.js', 'spreadsheet_lazy.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH47') !== -1, f); */
  for (const f of ['spreadsheet_xlsx.js', 'spreadsheet_lazy.js', 'spreadsheet_settings.js']) assert.ok(new RegExp(f.replace('.', '\\.') + '\\?v=SH(47|58)').test(l + '\n' + loader), f);
  /* (before SH58) assert.ok(l.indexOf('spreadsheet_lazy.js?v=') > l.indexOf('spreadsheet_xlsx.js?v=')); */
  assert.ok(loader.indexOf('spreadsheet_lazy.js?v=') !== -1 && loader.indexOf('spreadsheet_xlsx.js?v=') !== -1);
  assert.ok(read('spreadsheet_settings.js').indexOf('var SHEET_VERSION = "SH47";') !== -1);
  assert.ok(read('spreadsheet_settings.js').indexOf('/* (before SH47) var SHEET_VERSION = "SH46";') !== -1);
  assert.ok(read('spreadsheet_xlsx.js').indexOf('/* (before SH47) var XLSX = res[0], wb = XLSX.read(res[1], { type: "array", cellFormula: true }); */') !== -1);
  assert.ok(read('spreadsheet_readme.md').indexOf('## SH47') !== -1);
});
