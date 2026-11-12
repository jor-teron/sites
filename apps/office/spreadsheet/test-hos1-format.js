/* HOS1: .hos round-trip. No DOM, no browser, no network.
   Run: node apps/office/spreadsheet/test-hos1-format.js */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var dir = __dirname;
var Hos = require('./spreadsheet_hos.js');
var Native = require('../shared/office-native.js');

function cellAt(sheet, r, c) {
  var i, cells = sheet.cells || [];
  for (i = 0; i < cells.length; i++) if (cells[i].r === r && cells[i].c === c) return cells[i];
  return null;
}

var doc = {
  name: 'Budget 2026',
  created: 1700000000000,
  updated: 1700000001000,
  active: 1,
  settings: { theme: 'dark', ribbonCollapsed: true },
  page: {
    orientation: 'landscape',
    paper: 'Letter',
    margins: 'custom',
    custom: { top: 1, bottom: 1.2, left: 2, right: 2.2 },
    gridlines: false,
    headings: true,
    fit: true
  },
  sheets: [
    {
      name: 'Income',
      cells: [
        { r: 0, c: 0, formula: 'Qty', value: 'Qty', style: { bold: true, bt: 'auto', br: '#112233', bb: 'auto', bl: 'auto' } },
        { r: 1, c: 0, formula: '2', value: 2, style: {} },
        { r: 1, c: 1, formula: '=A2*3', value: 6, style: { align: 'right', fmt: 'currency', italic: true } }
      ],
      widths: [120],
      heights: [null, 28],
      hiddenRows: [],
      hiddenCols: [2],
      freeze: { rows: 1, cols: 0 },
      sel: [1, 1, 1, 1, 'cell'],
      filters: { on: true, r1: 0, r2: 1, c1: 0, c2: 1, cols: { 0: { blanks: false, values: ['2'] } } },
      validations: [{ r1: 1, c1: 0, r2: 1, c2: 0, source: '1, 2' }],
      merges: [{ r1: 0, c1: 2, r2: 1, c2: 3 }],
      condFormats: [{ r1: 1, c1: 1, r2: 1, c2: 1, type: 'above', value: 5, fill: '#c6efce' }],
      charts: [{ id: 'c1', type: 'column', range: 'A1:B2', title: 'Income', x: 10, y: 20, w: 360, h: 220 }]
    },
    {
      name: 'Costs',
      cells: [
        { r: 0, c: 0, formula: '=Income!A2', value: 2, style: { underline: true } },
        { r: 2, c: 3, formula: 'Note', value: 'Note', style: { wrap: true, bg: '#fff2cc' } }
      ]
    }
  ]
};

var text = Hos.stringify(doc);
assert.strictEqual(text.slice(0, 1), '{', 'a .hos file is a JSON object');
assert.strictEqual(text.indexOf('PK'), -1, 'not a zip');
assert.ok(text.indexOf('"format": "hos"') !== -1, 'format name hos');
assert.ok(text.indexOf('"version": 1') !== -1, 'format version 1');
assert.strictEqual(text.indexOf('"theme"'), -1, 'app theme is not stored');
assert.strictEqual(text.indexOf('spreadsheet_settings'), -1, 'app settings key is not stored');

var back = Hos.parse(text);
assert.strictEqual(back.format, 'hos');
assert.strictEqual(back.version, 1);
assert.strictEqual(back.name, doc.name);
assert.strictEqual(back.created, doc.created);
assert.strictEqual(back.updated, doc.updated);
assert.strictEqual(back.active, 1);
assert.strictEqual(back.cols, 26);
assert.strictEqual(back.rows, 100);
assert.strictEqual(back.sheets.length, 2);
assert.deepStrictEqual(back.settings, {});
assert.strictEqual(back.page.orientation, 'landscape');
assert.strictEqual(back.page.paper, 'Letter');
assert.strictEqual(back.page.margins, 'custom');
assert.strictEqual(back.page.custom.right, 2.2);
assert.strictEqual(back.page.custom.bottom, 1.2);
assert.strictEqual(back.page.gridlines, false);
assert.strictEqual(back.page.headings, true);
assert.strictEqual(back.page.fit, true);

var income = back.sheets[0];
assert.strictEqual(income.name, 'Income');
var qty = cellAt(income, 0, 0);
assert.ok(qty, 'header cell');
assert.strictEqual(qty.formula, 'Qty');
assert.strictEqual(qty.value, 'Qty');
assert.strictEqual(qty.style.bold, true);
assert.strictEqual(qty.style.bt, 'auto', 'SH17 auto border');
assert.strictEqual(qty.style.br, '#112233');
assert.strictEqual(qty.style.bb, 'auto');
assert.strictEqual(qty.style.bl, 'auto');
var qtyN = cellAt(income, 1, 0);
assert.strictEqual(qtyN.formula, '2');
assert.strictEqual(qtyN.value, 2);
assert.ok(!qtyN.style, 'default style is omitted');
var formula = cellAt(income, 1, 1);
assert.strictEqual(formula.formula, '=A2*3');
assert.strictEqual(formula.value, 6);
assert.strictEqual(formula.style.align, 'right');
assert.strictEqual(formula.style.fmt, 'currency');
assert.strictEqual(formula.style.italic, true);
assert.strictEqual(income.widths[0], 120);
assert.strictEqual(income.widths.length, 26);
assert.strictEqual(income.widths[1], null);
assert.strictEqual(income.heights[1], 28);
assert.strictEqual(income.heights.length, 100);
assert.strictEqual(income.heights[0], null);
assert.deepStrictEqual(income.hiddenCols, [2]);
assert.deepStrictEqual(income.freeze, { rows: 1, cols: 0 });
assert.deepStrictEqual(income.merges, doc.sheets[0].merges);
assert.deepStrictEqual(income.condFormats, doc.sheets[0].condFormats);
assert.deepStrictEqual(income.charts, doc.sheets[0].charts);
assert.deepStrictEqual(income.filters, doc.sheets[0].filters);
assert.strictEqual(income.validations[0].source, '1, 2');

var costs = back.sheets[1];
assert.strictEqual(costs.name, 'Costs');
var cross = cellAt(costs, 0, 0);
assert.strictEqual(cross.formula, '=Income!A2');
assert.strictEqual(cross.value, 2);
assert.strictEqual(cross.style.underline, true);
var note = cellAt(costs, 2, 3);
assert.strictEqual(note.style.wrap, true);
assert.strictEqual(note.style.bg, '#fff2cc');

var again = Hos.parse(Hos.stringify(back));
assert.strictEqual(again.active, back.active);
assert.strictEqual(cellAt(again.sheets[0], 1, 1).formula, '=A2*3');
assert.strictEqual(cellAt(again.sheets[0], 0, 0).style.bt, 'auto');
assert.deepStrictEqual(again.sheets[0].merges, back.sheets[0].merges);
assert.deepStrictEqual(again.sheets[0].condFormats, back.sheets[0].condFormats);
assert.deepStrictEqual(again.page, back.page);
assert.strictEqual(again.sheets[0].heights[1], 28);
assert.strictEqual(again.sheets[1].name, 'Costs');
assert.strictEqual(again.created, back.created);

/* Live capture stores a grid, not a sparse list. */
var grid = [];
grid[0] = [];
grid[0][1] = { formula: '=1+1', value: 2, style: { italic: true, bl: '#00ff00' } };
var fromGrid = Hos.parse(Hos.stringify({ name: 'Grid', sheets: [{ name: 'G', cells: grid }] }));
var gcell = cellAt(fromGrid.sheets[0], 0, 1);
assert.strictEqual(gcell.formula, '=1+1');
assert.strictEqual(gcell.value, 2);
assert.strictEqual(gcell.style.italic, true);
assert.strictEqual(gcell.style.bl, '#00ff00');
assert.strictEqual(cellAt(fromGrid.sheets[0], 0, 0), null, 'empty grid cells are left out');

function rejects(raw, label) {
  assert.throws(function () { Hos.parse(raw); }, function (e) {
    assert.ok(e.userMessage, label);
    return true;
  }, label);
}
rejects('{"v":4,"sheets":[{"name":"Sheet1","cells":[]}]}', 'sheet-v4 record');
rejects('{"format":"hos","version":2,"sheets":[{"name":"A"}]}', 'newer version');
rejects('{"format":"how","version":1,"sheets":[{"name":"A"}]}', 'writer file');
rejects('not json', 'not json');

assert.strictEqual(Hos.fileName('Budget 2026'), 'Budget 2026.hos');
assert.strictEqual(Hos.fileName('Budget 2026.hos'), 'Budget 2026.hos');
assert.strictEqual(Hos.fileName('Q?.hos'), 'Q.hos');
assert.strictEqual(Hos.fileName(''), 'Sheet.hos');
assert.strictEqual(Hos.isHos({ name: 'Budget.hos' }), true);
assert.strictEqual(Hos.isHos({ name: 'Budget.xlsx' }), false);
assert.strictEqual(Hos.FORMAT, 'hos');
assert.strictEqual(Hos.VERSION, 1);
assert.strictEqual(Native.stem('Q?.hos', 'hos', 'Sheet'), Hos.stem('Q?.hos'));
assert.strictEqual(Native.stem('Budget 2026', 'hos', 'Sheet'), 'Budget 2026');

function read(rel) { return fs.readFileSync(path.join(dir, rel), 'utf8'); }
function live(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

var storage = read('spreadsheet_storage.js');
var storageLive = live(storage);
assert.ok(storage.indexOf('(before HOS1)') !== -1, 'old save path kept');
assert.strictEqual(storageLive.indexOf('localStorage.setItem'), -1);
assert.strictEqual(storageLive.indexOf('localStorage.getItem'), -1);
assert.ok(storageLive.indexOf('function serializeWorkbook') !== -1);
assert.ok(storageLive.indexOf('function applyWorkbookPayload') !== -1);

var logic = read('spreadsheet_logic.js');
var logicLive = live(logic);
assert.ok(logic.indexOf('(before HOS1)') !== -1);
assert.strictEqual(logicLive.indexOf('loadStore()'), -1);

var page = read('spreadsheet_page.js');
var pageLive = live(page);
assert.ok(page.indexOf('(before HOS1)') !== -1);
assert.strictEqual(pageLive.indexOf('localStorage.setItem'), -1);
assert.strictEqual(pageLive.indexOf('localStorage.getItem'), -1);

var hub = read('spreadsheet_hub.js');
var hubLive = live(hub);
assert.ok(hub.indexOf('(before HOS1)') !== -1);
assert.strictEqual(hubLive.indexOf('localStorage.setItem'), -1);
assert.strictEqual(hubLive.indexOf('localStorage.getItem'), -1);

var xlsx = read('spreadsheet_xlsx.js');
var xlsxLive = live(xlsx);
assert.ok(xlsxLive.indexOf('function importXlsxFile') !== -1);
assert.ok(xlsxLive.indexOf('function exportXlsx') !== -1);
assert.ok(xlsxLive.indexOf('XLSX.read') !== -1);
var files = read('spreadsheet_files.js');
assert.ok(live(files).indexOf('function exportCsv') !== -1);
assert.ok(live(files).indexOf('function importCsvText') !== -1);

var html = read('spreadsheet.html');
assert.ok(html.indexOf('id="btn-open-hos"') !== -1);
assert.ok(html.indexOf('id="btn-save"') !== -1);
assert.ok(html.indexOf('id="btn-save-as"') !== -1);
assert.ok(html.indexOf('id="hos-file"') !== -1);
assert.ok(html.indexOf('spreadsheet_hos.js') !== -1);
assert.ok(html.indexOf('office-native.js') !== -1);
assert.ok(html.indexOf('id="file-import"') !== -1);
assert.ok(html.indexOf('id="btn-export"') !== -1);
assert.ok(html.indexOf('id="btn-export-xlsx"') !== -1);
assert.ok(html.indexOf('<title>Spreadsheet SH14</title>') !== -1);
assert.ok(html.indexOf('?v=SH14') !== -1);
assert.strictEqual(html.indexOf('?v=HOS'), -1);
assert.strictEqual(html.indexOf('?v=SH18'), -1);
var settingsJs = read('spreadsheet_settings.js');
assert.ok(settingsJs.indexOf('SHEET_VERSION = "SH14"') !== -1);

var typesSrc = fs.readFileSync(path.join(dir, '../../../shared/fs/filetypes.js'), 'utf8');
var typesCtx = { window: {} };
vm.createContext(typesCtx);
vm.runInContext(typesSrc, typesCtx);
var opened = typesCtx.window.FileTypes.apps('Budget.hos');
assert.strictEqual(opened[0].id, 'spreadsheet');
assert.strictEqual(opened[0].name, 'Spreadsheet');
assert.strictEqual(opened[0].file, true);
assert.strictEqual(opened[0].url, 'apps/office/spreadsheet/');
var howApps = typesCtx.window.FileTypes.apps('Letter.how');
/* (before DF25) assert.strictEqual(howApps[0].id, 'draftly'); */
assert.strictEqual(howApps[0].id, 'writer');   /* DF25: Writer's Hub id */
assert.strictEqual(typesCtx.window.FileTypes.app('draftly').id, 'writer');   /* DF25: old id is an alias */
var jsonApps = typesCtx.window.FileTypes.apps('notes.json');
assert.strictEqual(jsonApps[0].id, 'notely', '.json stays with Notely');
var pngApps = typesCtx.window.FileTypes.apps('cat.png');
assert.strictEqual(pngApps[0].id, 'viewer');

var desc = 'Spreadsheet with formulas and styles: native .hos files - CSV or XLSX';
assert.ok(desc.length < 90, desc.length);
assert.strictEqual(desc.indexOf(','), -1);
var csv = fs.readFileSync(path.join(dir, '../office-apps.csv'), 'utf8');
assert.ok(csv.indexOf(desc) !== -1);
assert.ok(csv.indexOf('(before HOS1)') !== -1);
var index = fs.readFileSync(path.join(dir, '../../../hub/core/hub_appindex.js'), 'utf8');
assert.ok(index.indexOf(desc) !== -1);
assert.ok(index.indexOf('"spreadsheet":') !== -1);
assert.ok(index.indexOf('apps/office/spreadsheet/spreadsheet_icon.png') !== -1);

/* Restore into the real workbook helpers (no DOM). */
var boot = [
  'spreadsheet_config.js',
  'spreadsheet_state.js',
  'spreadsheet_storage.js',
  'spreadsheet_hos.js'
].map(function (f) { return fs.readFileSync(path.join(dir, f), 'utf8'); }).join('\n;\n');
var app = {
  console: console, Date: Date, Math: Math, Number: Number, String: String,
  Boolean: Boolean, Array: Array, Object: Object, JSON: JSON, parseInt: parseInt,
  isNaN: isNaN, isFinite: isFinite, RegExp: RegExp, Error: Error, TypeError: TypeError,
  NaN: NaN, Infinity: Infinity, undefined: undefined,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  window: {}, document: undefined
};
vm.createContext(app);
vm.runInContext(boot, app, { filename: 'spreadsheet-hos1.js' });
app.window.SHEET_HOS_FORMAT.applyToWorkbook(back);
assert.strictEqual(app.workbook.sheets.length, 2);
assert.strictEqual(app.workbook.active, 1);
assert.strictEqual(app.workbook.sheets[0].name, 'Income');
assert.strictEqual(app.workbook.sheets[0].cells[0][0].formula, 'Qty');
assert.strictEqual(app.workbook.sheets[0].cells[0][0].style.bold, true);
assert.strictEqual(app.workbook.sheets[0].cells[0][0].style.bt, 'auto');
assert.strictEqual(app.workbook.sheets[0].cells[0][0].style.br, '#112233');
assert.strictEqual(app.workbook.sheets[0].cells[0][0].style.align, 'center', 'default align comes back');
assert.strictEqual(app.workbook.sheets[0].cells[1][1].formula, '=A2*3');
assert.strictEqual(app.workbook.sheets[0].cells[1][1].style.fmt, 'currency');
assert.strictEqual(app.workbook.sheets[0].widths[0], 120);
assert.strictEqual(app.workbook.sheets[0].heights[1], 28);
assert.strictEqual(app.workbook.sheets[0].heights[0], null);
assert.strictEqual(app.workbook.sheets[0].hiddenCols[2], true);
assert.strictEqual(app.workbook.sheets[0].freeze.rows, 1);
assert.deepStrictEqual(app.workbook.sheets[0].merges, doc.sheets[0].merges);
assert.deepStrictEqual(app.workbook.sheets[0].condFormats, doc.sheets[0].condFormats);
assert.strictEqual(app.workbook.sheets[0].charts[0].type, 'column');
assert.strictEqual(app.workbook.sheets[1].cells[0][0].formula, '=Income!A2');
assert.strictEqual(app.workbook.sheets[1].cells[2][3].style.bg, '#fff2cc');
assert.strictEqual(app.workbook.sheets[0].sel[0], 1, 'Income keeps its selection');
assert.strictEqual(app.workbook.sheets[0].sel[1], 1);
assert.strictEqual(app.selR, 0, 'the active sheet is Costs, whose selection is A1');
assert.strictEqual(app.workbook.sheets[0].cells[0][1].formula, '', 'an empty cell stays empty');

console.log('hos1 format checks passed');
