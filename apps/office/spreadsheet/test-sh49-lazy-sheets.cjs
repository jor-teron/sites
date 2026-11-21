#!/usr/bin/env node
/* SH49: xlsx sheets load one at a time. Real spreadsheet modules in a vm (no DOM) open
   workbooks built in memory with the vendored SheetJS, and every lazy result is compared
   with an eager open (all sheets converted, one recalc) of the same file.
   Run: node --test apps/office/spreadsheet/test-sh49-lazy-sheets.cjs */
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

function load() {
  const files = ['spreadsheet_config.js', 'spreadsheet_formula.js', 'spreadsheet_functions.js',
    'spreadsheet_refs.js', 'spreadsheet_state.js', 'spreadsheet_storage.js', 'spreadsheet_format.js',
    'spreadsheet_style.js', 'spreadsheet_files.js', 'spreadsheet_xlsx.js', 'spreadsheet_lazy.js',
    'spreadsheet_sheets.js', 'spreadsheet_undo.js', 'spreadsheet_rows.js'];
  const rec = { status: [], notes: [] };
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
  vm.runInContext(files.map(read).join('\n;\n'), ctx, { filename: 'spreadsheet-sh49.js' });
  /* DOM-side hooks the modules call; recalc is the real one */
  vm.runInContext(`
    function setStatus(m) { __rec.status.push(m); }
    function afterChange() { recalcAll(); }
    function paintAll() {} function highlightSel() {} function applyWidths() {} function syncStyleUi() {}
    function blurEditing() {} function updateStats() {} function applyFilters() {} function saveStore() {}
    function undoButtons() {}`, Object.assign(ctx, { __rec: rec }));
  ctx.XLSX = XLSX;
  ctx.xlsxLoad = () => Promise.resolve(XLSX);
  ctx.emptyWorkbook();
  return { ctx, rec };
}

/* S1: numbers, a local formula; S2: points at S1; S3: points at S2; S4: plain + a formula. */
function bookA(sheet0Extra) {
  const S1 = { A1: { t: 'n', v: 5 }, A2: { t: 'n', v: 7 }, B1: { t: 'n', v: 12, f: 'A1+A2' }, '!ref': 'A1:C3' };
  if (sheet0Extra) Object.assign(S1, sheet0Extra);
  const S2 = { A1: { t: 'n', v: 13, f: "S1!B1+1" }, B1: { t: 's', v: 'two' }, '!ref': 'A1:B1' };
  const S3 = { A1: { t: 'n', v: 26, f: "S2!A1*2" }, B1: { t: 'n', v: 33 }, C1: { t: 'n', v: 99, f: "'My Data'!A1+S2!A1" }, '!ref': 'A1:C1' };
  const S4 = { A1: { t: 'n', v: 4 }, B1: { t: 'n', v: 44 }, C1: { t: 'n', v: 0, f: 'A1*B1' }, D1: { t: 's', v: 'x', f: 'UPPER("x")&NOTAFUNC(1)' }, '!ref': 'A1:D1' };
  const wb = { SheetNames: ['S1', 'S2', 'S3', 'My Data'], Sheets: { S1, S2, S3, 'My Data': S4 } };
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function lazyOpen(ctx, ab) {
  return ctx.importXlsxFile({ name: 'book.xlsx', arrayBuffer: () => Promise.resolve(ab) }, {});
}
/* Eager reference: every sheet converted (the pre-SH49 xlsxSheetsFromBook), one recalc. */
function eagerOpen(ctx, ab) {
  const wb = XLSX.read(ab, { type: 'array', cellFormula: true });
  ctx.workbook = { sheets: ctx.xlsxSheetsFromBook(XLSX, wb).sheets, active: 0 };
  ctx.bindActiveSheet();
  ctx.recalcAll();
}
function dump(ctx) {
  return plain(ctx.workbook.sheets.map((s) => {
    const out = [];
    ctx.forEachReal(s.cells, (r, c, cell) => { out.push([r, c, cell.formula, cell.value]); });
    return [s.name, out];
  }));
}
function sheetDump(ctx, si) { return dump(ctx)[si]; }
const plain = (x) => JSON.parse(JSON.stringify(x));   // vm arrays are another realm
const lazyFlags = (ctx) => plain(ctx.workbook.sheets.map((s) => s.lazy != null));

test('open: only sheet 0 is converted; the rest are placeholders with names', async () => {
  const { ctx, rec } = load();
  assert.equal(await lazyOpen(ctx, bookA()), true);
  assert.deepEqual(lazyFlags(ctx), [false, true, true, true]);
  assert.deepEqual(plain(ctx.workbook.sheets.map((s) => s.name)), ['S1', 'S2', 'S3', 'My Data']);
  assert.deepEqual(sheetDump(ctx, 1)[1], []);
  const lazyS1 = sheetDump(ctx, 0);
  eagerOpen(ctx, bookA());
  assert.deepEqual(lazyS1, sheetDump(ctx, 0));
  assert.ok(rec.status.some((m) => /^Loaded 4 sheets/.test(m)));
});

test('the SH35 note on open names functions in placeholder sheets without converting them', async () => {
  const { ctx, rec } = load();
  await lazyOpen(ctx, bookA());
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(lazyFlags(ctx), [false, true, true, true]);
  const msg = rec.status.find((m) => /^Loaded/.test(m));
  assert.ok(/Not supported yet: NOTAFUNC \(1 cell\)/.test(msg), msg);
});

test('switching to a sheet converts it (and the sheets it points at) with eager values', async () => {
  const { ctx } = load();
  await lazyOpen(ctx, bookA());
  ctx.switchSheet(2);
  assert.equal(ctx.workbook.active, 2);
  /* S3 points at S2 and My Data; S2 points at S1 */
  assert.deepEqual(lazyFlags(ctx), [false, false, false, false]);
  const got = dump(ctx);
  eagerOpen(ctx, bookA());
  assert.deepEqual(got, dump(ctx));
  const { ctx: c2 } = load();
  await lazyOpen(c2, bookA());
  c2.switchSheet(1);
  assert.deepEqual(lazyFlags(c2), [false, false, true, true]);
  assert.equal(c2.workbook.sheets[1].cells[0][0].value, 13);
});

test('a formula on sheet 0 that points at sheet 3 converts sheet 3 only, value as eager', async () => {
  const extra = { C1: { t: 'n', v: 0, f: "'My Data'!C1+1" } };
  const { ctx } = load();
  await lazyOpen(ctx, bookA(extra));
  assert.deepEqual(lazyFlags(ctx), [false, true, true, false]);
  assert.equal(ctx.workbook.sheets[0].cells[0][2].value, 177);
  const lazyAll = (ctx.ensureAllSheetsLoaded(), dump(ctx));
  eagerOpen(ctx, bookA(extra));
  assert.equal(ctx.workbook.sheets[0].cells[0][2].value, 177);
  assert.deepEqual(lazyAll, dump(ctx));
});

test('INDIRECT with a computed sheet name converts that sheet during the recalc', async () => {
  const extra = { A3: { t: 'n', v: 3 }, C2: { t: 'n', v: 0, f: 'INDIRECT("S"&A3&"!B1")*2' } };
  const { ctx } = load();
  await lazyOpen(ctx, bookA(extra));
  assert.equal(ctx.workbook.sheets[2].lazy, undefined);
  assert.equal(ctx.workbook.sheets[0].cells[1][2].value, 66);
  eagerOpen(ctx, bookA(extra));
  assert.equal(ctx.workbook.sheets[0].cells[1][2].value, 66);
});

test('export after a lazy open equals the eager export', async () => {
  const { ctx } = load();
  await lazyOpen(ctx, bookA());
  const lazyBook = ctx.xlsxBuildBook(XLSX);
  assert.deepEqual(lazyFlags(ctx), [false, false, false, false]);
  eagerOpen(ctx, bookA());
  const eagerBook = ctx.xlsxBuildBook(XLSX);
  assert.deepEqual(JSON.parse(JSON.stringify(lazyBook)), JSON.parse(JSON.stringify(eagerBook)));
  /* and the written bytes read back the same */
  const a = XLSX.read(ctx.xlsxWriteBook(XLSX, 'xlsx', 'array'), { type: 'array', cellFormula: true });
  const { ctx: c2 } = load();
  await lazyOpen(c2, bookA());
  const b = XLSX.read(c2.xlsxWriteBook(XLSX, 'xlsx', 'array'), { type: 'array', cellFormula: true });
  for (const n of a.SheetNames) assert.deepEqual(XLSX.utils.sheet_to_json(b.Sheets[n], { header: 1 }), XLSX.utils.sheet_to_json(a.Sheets[n], { header: 1 }), n);
});

test('rename an unloaded sheet: formulas in other unloaded sheets follow, as eager', async () => {
  const { ctx } = load();
  await lazyOpen(ctx, bookA());
  assert.equal(ctx.renameSheetTo(1, 'Second'), '');
  assert.deepEqual(lazyFlags(ctx), [false, false, false, false]);
  const got = dump(ctx);
  eagerOpen(ctx, bookA());
  ctx.renameSheetTo(1, 'Second');
  assert.deepEqual(got, dump(ctx));
  assert.equal(ctx.workbook.sheets[2].cells[0][0].formula, '=Second!A1*2');
});

test('delete an unloaded sheet: formulas that pointed at it become #REF!, as eager', async () => {
  const { ctx } = load();
  await lazyOpen(ctx, bookA());
  ctx.deleteSheetAt(1);
  const got = dump(ctx);
  assert.deepEqual(got.map((s) => s[0]), ['S1', 'S3', 'My Data']);
  eagerOpen(ctx, bookA());
  ctx.deleteSheetAt(1);
  assert.deepEqual(got, dump(ctx));
  assert.equal(ctx.workbook.sheets[1].cells[0][0].value, '#REF!');
});

test('move, Find and serialize load every sheet first', async () => {
  const { ctx } = load();
  await lazyOpen(ctx, bookA());
  ctx.moveSheet(3, 0);
  assert.deepEqual(lazyFlags(ctx), [false, false, false, false]);
  assert.deepEqual(plain(ctx.workbook.sheets.map((s) => s.name)), ['My Data', 'S1', 'S2', 'S3']);
  const { ctx: c2 } = load();
  await lazyOpen(c2, bookA());
  const ser = c2.serializeWorkbook();
  assert.deepEqual(lazyFlags(c2), [false, false, false, false]);
  assert.equal(ser.sheets.length, 4);
});

test('undo keeps a placeholder a placeholder; it still converts to the file values', async () => {
  const { ctx } = load();
  await lazyOpen(ctx, bookA());
  const snap = ctx.undoSnapshot();
  ctx.workbook.sheets[0].cells[0][0].formula = '50';
  ctx.undoRestore(snap);
  assert.deepEqual(lazyFlags(ctx), [false, true, true, true]);
  assert.equal(ctx.workbook.sheets[0].cells[0][0].formula, '5');
  ctx.switchSheet(3);
  assert.equal(ctx.workbook.sheets[3].cells[0][2].value, 176);
});

test('save fingerprint token: placeholder and unedited sheets keep their key; an edit drops it', async () => {
  const { ctx } = load();
  await lazyOpen(ctx, bookA());
  const s0 = ctx.workbook.sheets[0], s2 = ctx.workbook.sheets[2];
  const t0 = ctx.lazySigToken(s0), t2 = ctx.lazySigToken(s2);
  assert.ok(t0 && t2 && t0 !== t2);
  ctx.switchSheet(2);
  assert.equal(ctx.lazySigToken(s2), t2);
  s2.cells[0][1].formula = '34';
  assert.equal(ctx.lazySigToken(s2), null);
  s2.cells[0][1].formula = '33';
  assert.equal(ctx.lazySigToken(s2), t2);
});

test('pure: lazyFormulaSheets reads plain, quoted and INDIRECT-literal sheet names', () => {
  const { ctx } = load();
  assert.deepEqual(Array.from(ctx.lazyFormulaSheets("=S2!A1+'My Data'!B2:C3+S2!B1")), ['s2', 'my data']);
  assert.deepEqual(Array.from(ctx.lazyFormulaSheets('=INDIRECT("\'Bob\'\'s\'!A1")+INDIRECT("Data!B2")')), ["bob's", 'data']);
  assert.deepEqual(Array.from(ctx.lazyFormulaSheets('=A1+B2')), []);
  assert.deepEqual(Array.from(ctx.lazyFormulaSheets('plain!text')), []);
  assert.deepEqual(Array.from(ctx.lazyFormulaSheets('="Hi!"&A1')), ['hi']);   // harmless extra name
});

test('pure: lazyNeeded follows names from the seeds and keeps lazy sheets in visit order', () => {
  const { ctx } = load();
  const names = ['A', 'B', 'C', 'D', 'E'];
  const refs = { 0: ['c'], 2: ['b', 'zz'], 1: [], 3: ['e'], 4: [] };
  assert.deepEqual(Array.from(ctx.lazyNeeded(names, [false, true, true, true, true], (i) => refs[i], [0])), [2, 1]);
  assert.deepEqual(Array.from(ctx.lazyNeeded(names, [false, true, true, true, true], (i) => refs[i], [0, 3])), [3, 2, 4, 1]);
  assert.deepEqual(Array.from(ctx.lazyNeeded(names, [false, false, false, false, false], (i) => refs[i], [0])), []);
});

test('wiring: version SH49, ?v= tokens, lazy script after xlsx, readme, old code kept as comments', () => {
  const html = read('spreadsheet.html');
  assert.ok(html.indexOf('<title>Spreadsheet SH49</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH49) <title>Spreadsheet SH45</title> -->') !== -1);
  const l = live(html);
  for (const f of ['spreadsheet_formula.js', 'spreadsheet_state.js', 'spreadsheet_storage.js', 'spreadsheet_settings.js',
    'spreadsheet_undo.js', 'spreadsheet_rows.js', 'spreadsheet_sheets.js', 'spreadsheet_data.js', 'spreadsheet_xlsx.js',
    'spreadsheet_lazy.js', 'spreadsheet_hos.js', 'spreadsheet_saveformat.js', 'spreadsheet_empty.js', 'spreadsheet.css']) {
    /* (before SH46) assert.ok(l.indexOf(f + '?v=SH49') !== -1, f); */
    assert.ok(l.indexOf(f + '?v=SH49') !== -1 || l.indexOf(f + '?v=SH46') !== -1, f);
  }
  assert.ok(l.indexOf('spreadsheet_lazy.js?v=SH49') > l.indexOf('spreadsheet_xlsx.js?v=SH49'));
  assert.ok(read('spreadsheet_settings.js').indexOf('var SHEET_VERSION = "SH49";') !== -1);
  assert.ok(read('spreadsheet_xlsx.js').indexOf('/* (before SH49) var loaded = xlsxSheetsFromBook(XLSX, wb); */') !== -1);
  assert.ok(read('spreadsheet_formula.js').indexOf('/* (before SH49) function recalcAll() { */') !== -1);
  assert.ok(read('spreadsheet_readme.md').indexOf('## SH49') !== -1);
});
