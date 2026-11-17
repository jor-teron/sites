#!/usr/bin/env node
/* SH27: Spreadsheet opens and exports LibreOffice .ods.
   Loads SheetJS, builds a 2-sheet workbook through xlsxWriteBook,
   reads it back through xlsxSheetsFromBook, and checks extension routing.
   Run: node --test apps/office/spreadsheet/test-sh27.cjs
   No DOM, no browser, no network. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const XLSX = require(path.join(dir, 'vendor/sheetjs/xlsx.full.min.js'));

function load() {
  const files = [
    'spreadsheet_config.js',
    'spreadsheet_formula.js',
    'spreadsheet_functions.js',
    'spreadsheet_refs.js',
    'spreadsheet_state.js',
    'spreadsheet_storage.js',
    'spreadsheet_format.js',
    'spreadsheet_style.js',
    'spreadsheet_xlsx.js'
  ];
  const ctx = {
    console: console, Date: Date, Math: Math, Number: Number, String: String,
    Boolean: Boolean, Array: Array, Object: Object, Proxy: Proxy, JSON: JSON,
    parseInt: parseInt, isNaN: isNaN, isFinite: isFinite, RegExp: RegExp,
    Error: Error, TypeError: TypeError, NaN: NaN, Infinity: Infinity,
    undefined: undefined, setTimeout: setTimeout, clearTimeout: clearTimeout,
    window: {},
    document: { addEventListener: function () {}, getElementById: function () { return null; } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(files.map(function (f) {
    return fs.readFileSync(path.join(dir, f), 'utf8');
  }).join('\n;\n'), ctx, { filename: 'spreadsheet-sh27.js' });
  return ctx;
}

function formulaOf(sheet, r, c) {
  const row = sheet.cells[r];
  const cell = row && row[c];
  return cell && cell.formula != null ? String(cell.formula) : '';
}

test('xlsxIsWorkbookName routes .ods, .xlsx and .xls, not .hos or .csv', function () {
  const ctx = load();
  assert.equal(ctx.xlsxIsWorkbookName('Sales.ods'), true);
  assert.equal(ctx.xlsxIsWorkbookName('Sales.ODS'), true);
  assert.equal(ctx.xlsxIsWorkbookName('Book.xlsx'), true);
  assert.equal(ctx.xlsxIsWorkbookName('Old.xls'), true);
  assert.equal(ctx.xlsxIsWorkbookName('Budget.hos'), false);
  assert.equal(ctx.xlsxIsWorkbookName('grid.csv'), false);
  assert.equal(ctx.xlsxIsWorkbookName('notes.txt'), false);
  assert.equal(ctx.xlsxIsWorkbookName(''), false);
  assert.equal(ctx.xlsxIsWorkbookFile({ name: 'Q1.ods', type: '' }), true);
  assert.equal(ctx.xlsxIsWorkbookFile({ name: 'plain.txt', type: 'application/vnd.oasis.opendocument.spreadsheet' }), true);
  assert.equal(ctx.xlsxIsWorkbookFile({ name: 'plain.txt', type: 'text/plain' }), false);
});

test('.ods export/import keeps two sheets, values and a formula', function () {
  const ctx = load();
  ctx.emptyWorkbook();
  const income = ctx.workbook.sheets[0];
  income.name = 'Income';
  income.cells[0][0].formula = 'Qty';
  income.cells[0][1].formula = '2';
  income.cells[0][2].formula = '=B1*3';
  income.cells[0][2].value = 6;
  ctx.workbook.sheets.push(ctx.makeSheet('Costs'));
  const costs = ctx.workbook.sheets[1];
  costs.cells[0][0].formula = 'Note';
  costs.cells[1][0].formula = '10';

  const buf = ctx.xlsxWriteBook(XLSX, 'ods', 'buffer');
  assert.ok(buf && buf.length > 100, 'ods bytes were written');
  assert.equal(Buffer.from(buf).slice(0, 2).toString(), 'PK', 'ods is a zip');

  const wb = XLSX.read(buf, { type: 'buffer', cellFormula: true });
  const loaded = ctx.xlsxSheetsFromBook(XLSX, wb);
  assert.equal(loaded.sheets.length, 2);
  assert.equal(loaded.cutSheets, 0);
  assert.equal(loaded.sheets[0].name, 'Income');
  assert.equal(loaded.sheets[1].name, 'Costs');
  assert.equal(formulaOf(loaded.sheets[0], 0, 0), 'Qty');
  assert.equal(formulaOf(loaded.sheets[0], 0, 1), '2');
  assert.equal(formulaOf(loaded.sheets[0], 0, 2), '=B1*3');
  assert.equal(formulaOf(loaded.sheets[1], 0, 0), 'Note');
  assert.equal(formulaOf(loaded.sheets[1], 1, 0), '10');
});

test('spreadsheet.html wires Open ODS, Export ODS, SH27 title and tokens', function () {
  const html = fs.readFileSync(path.join(dir, 'spreadsheet.html'), 'utf8');
  const settings = fs.readFileSync(path.join(dir, 'spreadsheet_settings.js'), 'utf8');
  assert.ok(html.indexOf('<title>Spreadsheet SH27</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH27) <title>Spreadsheet SH24</title> -->') !== -1);
  assert.ok(html.indexOf('Open (XLSX / ODS / CSV)') !== -1);
  assert.ok(html.indexOf('accept=".xlsx,.xls,.ods,') !== -1);
  assert.ok(html.indexOf('id="btn-export-ods"') !== -1);
  assert.ok(html.indexOf('Export ODS') !== -1);
  assert.ok(html.indexOf('spreadsheet_xlsx.js?v=SH27') !== -1);
  assert.ok(html.indexOf('spreadsheet_toolbar.js?v=SH27') !== -1);
  assert.ok(html.indexOf('spreadsheet_settings.js?v=SH27') !== -1);
  assert.ok(html.indexOf('?v=HO3') !== -1);
  assert.ok(settings.indexOf('var SHEET_VERSION = "SH27";') !== -1);
  assert.ok(settings.indexOf('(before SH27)') !== -1);
  const xlsx = fs.readFileSync(path.join(dir, 'spreadsheet_xlsx.js'), 'utf8');
  assert.ok(xlsx.indexOf('function exportOds') !== -1);
  assert.ok(xlsx.indexOf("bookType: bookType") !== -1);
  assert.ok(xlsx.indexOf('function xlsxWriteBook') !== -1);
  const toolbar = fs.readFileSync(path.join(dir, 'spreadsheet_toolbar.js'), 'utf8');
  assert.ok(toolbar.indexOf('xlsxIsWorkbookName') !== -1);
  assert.ok(toolbar.indexOf('(before SH27)') !== -1);
});
