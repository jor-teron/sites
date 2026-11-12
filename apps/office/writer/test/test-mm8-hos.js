/* MM8: Writer Mail Merge reads Spreadsheet .hos files (modules/writer-hos.js) and
   writer-merge.js picks hos / xlsx / csv by content. Fixtures are built here and
   samples/merge_sample.hos is checked too.
   Run: node apps/office/writer/test/test-mm8-hos.js
   No browser, no network. */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');

var ROOT = path.resolve(__dirname, '../../../..');
var WR = path.join(ROOT, 'apps/office/writer');
var passed = 0, failed = 0, asyncTests = [];

function test(name, fn) {
  try { fn(); passed++; console.log('ok', name); }
  catch (e) { failed++; console.log('FAIL', name, '\n ', e && e.message); }
}
function atest(name, fn) { asyncTests.push([name, fn]); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

/* A small browser-like context with the Merge engine scripts */
function context() {
  var store = {};
  var ctx = {
    console: console, TextDecoder: TextDecoder, Uint8Array: Uint8Array, ArrayBuffer: ArrayBuffer, Promise: Promise,
    localStorage: { getItem: function (k) { return store[k] == null ? null : store[k]; }, setItem: function (k, v) { store[k] = String(v); } },
    setTimeout: setTimeout, clearTimeout: clearTimeout
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['writer-csv.js', 'writer-numfmt.js', 'writer-xlsx.js', 'writer-hos.js', 'writer-merge.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(WR, 'modules', f), 'utf8'), ctx, { filename: f });
  });
  return ctx;
}
function C(r, c, formula, value, style) { var o = { r: r, c: c, formula: formula, value: value }; if (style) o.style = style; return o; }
function hosText(sheets, version) {
  return JSON.stringify({ format: 'hos', version: version == null ? 1 : version, name: 'Book', created: 1, updated: 1, active: 0,
    cols: 26, rows: 100, page: {}, settings: {}, sheets: sheets }, null, 2);
}
function buf(text) { var b = Buffer.from(text, 'utf8'); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length); }

var BOOK = hosText([
  { name: 'Customers', cells: [
    /* row 0 empty, column A empty: both are skipped */
    C(1, 1, 'Name', 'Name'), C(1, 2, 'Amount', 'Amount'), C(1, 3, 'Total', 'Total'), C(1, 4, 'Due', 'Due'), C(1, 5, 'Share', 'Share'),
    C(2, 1, 'Anna', 'Anna'), C(2, 2, '1250', 1250, { fmt: 'currency' }), C(2, 3, '=C3*2', 2500, { fmt: 'thousands' }),
    C(2, 4, '2026-12-01', '2026-12-01', { fmt: 'datedmy' }), C(2, 5, '0.125', 0.125, { fmt: 'percent' }),
    C(3, 1, 'Rahul', 'Rahul'), C(3, 2, '980.5', 980.5, { fmt: 'dec2' }), C(3, 3, '=C4*2', '', { fmt: 'currency' }),
    C(3, 4, '', '', { bold: true }), C(3, 5, 'n/a', '', { fmt: 'percent' })
  ], merges: [], charts: [{ id: 'c1', type: 'column', range: 'B2:C4' }], hiddenRows: [2], filters: { on: true } },
  { name: 'Orders', cells: [C(0, 0, 'Order', 'Order'), C(0, 1, 'Qty', 'Qty'), C(1, 0, 'A-1', 'A-1'), C(1, 1, '2', 2, { fmt: 'int' })] },
  { name: 'Blank', cells: [C(4, 4, '', '', { bold: true })] }
]);

var ctx = context();
var H = ctx.Writer.hos;

/* ---------- sniffing ---------- */
test('sniff by content: hos, how, csv, xlsx-like', function () {
  assert.strictEqual(H.sniff(buf(BOOK)).kind, 'hos');
  assert.strictEqual(H.sniff(buf('\ufeff  ' + BOOK)).kind, 'hos', 'BOM and spaces before the JSON');
  assert.strictEqual(H.sniff(buf(JSON.stringify({ format: 'how', version: 1, html: '' }))).kind, 'how');
  assert.strictEqual(H.sniff(buf('Name,Amount\nAnna,1\n')).kind, 'other');
  assert.strictEqual(H.sniff(buf('{not json, really}\n')).kind, 'other', 'CSV starting with { stays CSV');
  assert.strictEqual(H.sniff(buf('PK\u0003\u0004')).kind, 'other');
});

/* ---------- table ---------- */
test('valid .hos: header, saved values, formats, cached formula, blank columns dropped', function () {
  var wb = H.open(buf(BOOK));
  assert.deepStrictEqual(Array.from(wb.sheets), ['Customers', 'Orders', 'Blank']);
  var t = wb.table(0);
  assert.ok(t.ok, t.error);
  assert.deepStrictEqual(Array.from(t.header), ['Name', 'Amount', 'Total', 'Due', 'Share']);
  assert.strictEqual(t.rows.length, 2, 'hidden rows and filters are not applied');
  assert.deepStrictEqual(Array.from(t.rows[0]), ['Anna', '\u20b91,250.00', '2,500', '01/12/2026', '12.5%']);
  assert.deepStrictEqual(Array.from(t.rows[1]), ['Rahul', '980.50', '', '', 'n/a']);
  assert.ok(t.warnings.some(function (w) { return /1 formula cell has no saved result/.test(w); }), 'uncached formula warning: ' + t.warnings.join(' | '));
});
test('second sheet', function () {
  var t = H.open(buf(BOOK)).table(1);
  assert.deepStrictEqual(Array.from(t.header), ['Order', 'Qty']);
  assert.deepStrictEqual(Array.from(t.rows[0]), ['A-1', '2']);
});
test('empty sheet is an error', function () {
  var t = H.open(buf(BOOK)).table(2);
  assert.strictEqual(t.ok, false);
  assert.strictEqual(t.error, 'The sheet "Blank" is empty');
});
test('version 2 is refused', function () {
  assert.throws(function () { H.open(buf(hosText([{ name: 'S', cells: [] }], 2))); },
    function (e) { return e.userMessage === 'This .hos file is version 2. Writer Mail Merge reads version 1'; });
});
test('a Writer .how is refused as merge data', function () {
  assert.throws(function () { H.open(buf(JSON.stringify({ format: 'how', version: 1, html: '<p>x</p>' }))); },
    function (e) { return e.userMessage === 'This is a Writer document (.how), not merge data: choose a CSV, Excel or Spreadsheet .hos file'; });
});
test('26 x 100 grid: cells outside are not read, with a warning', function () {
  var t = H.open(buf(hosText([{ name: 'S', cells: [C(0, 0, 'A', 'A'), C(1, 0, 'x', 'x'), C(150, 0, 'far', 'far'), C(0, 30, 'Z', 'Z')] }]))).table(0);
  assert.deepStrictEqual(Array.from(t.header), ['A']);
  assert.strictEqual(t.rows.length, 1);
  assert.ok(t.warnings.some(function (w) { return /2 cells are outside the 26 \u00d7 100 grid/.test(w); }));
});
test('number formats match Spreadsheet formatCellValue', function () {
  var sctx = { CFG: { numberFormat: { currency: '\u20b9', locale: 'en-IN' } } };
  vm.createContext(sctx);
  vm.runInContext(read('apps/office/spreadsheet/spreadsheet_functions.js').match(/function fxParseDate[\s\S]*?\n}\n/)[0], sctx);
  vm.runInContext(read('apps/office/spreadsheet/spreadsheet_format.js').match(/function formatCellValue[\s\S]*?\n}\n/)[0], sctx);
  var cases = [[1234567.891, 'thousands'], [-0.004, 'dec2'], [12.5, 'int'], [0.3333, 'percent'], [-1234.5, 'currency'], [0, 'currency'],
    ['2026-11-10 14:05', 'datetime'], ['2026-11-10 14:05', 'time'], ['10/11/2026', 'date'], [46000, 'date'], ['text', 'currency'], ['#DIV/0!', 'dec2'], [true, 'general']];
  cases.forEach(function (c) { assert.strictEqual(H.format(c[0], c[1]), sctx.formatCellValue(c[0], c[1]), JSON.stringify(c)); });
});
test('sample merge_sample.hos opens: Customers + Orders', function () {
  var wb = H.open(buf(read('apps/office/writer/samples/merge_sample.hos')));
  assert.deepStrictEqual(Array.from(wb.sheets), ['Customers', 'Orders']);
  var t = wb.table(0);
  assert.ok(t.ok);
  assert.strictEqual(t.rows.length, 3);
  assert.strictEqual(t.rows[0][0], 'Anna Smith');
  assert.strictEqual(t.warnings.length, 0, t.warnings.join(' | '));
});

/* ---------- writer-merge.js wiring ---------- */
function src(name, text) {
  var state = { text: text, t: 1 };
  return { s: state, kind: 'handle', name: name, getFile: function () {
    var b = buf(state.text);
    return Promise.resolve({ size: b.byteLength, lastModified: state.t, arrayBuffer: function () { return Promise.resolve(b); } });
  } };
}
atest('merge: .hos source gives kind hos, sheets, sheet pick and remembered sheet', function () {
  var c = context(), M = c.Writer.merge;
  var s = src('book.hos', BOOK);
  return M.setSource(s).then(function () {
    assert.strictEqual(M.error, '');
    assert.strictEqual(M.data.kind, 'hos');
    assert.strictEqual(M.data.sheet, 'Customers');
    assert.deepStrictEqual(Array.from(M.sheets), ['Customers', 'Orders', 'Blank']);
    assert.strictEqual(M.data.delimiter, '');
    return M.setSheet('Orders');
  }).then(function () {
    assert.strictEqual(M.data.sheet, 'Orders');
    assert.strictEqual(M.settings.sheet, 'Orders');
    assert.deepStrictEqual(Array.from(M.fieldNames()), ['Order', 'Qty']);
    /* the file changes: Orders sheet removed -> first sheet with a note */
    s.s.text = hosText([{ name: 'Customers', cells: [C(0, 0, 'Name', 'Name'), C(1, 0, 'Anna', 'Anna')] }]);
    s.s.t = 2;
    return M.readSource({ keepRow: true });
  }).then(function (r) {
    assert.ok(r.changed);
    assert.strictEqual(M.data.sheet, 'Customers');
    assert.strictEqual(M.data.note, 'Sheet "Orders" is not in the file: showing "Customers"');
    return M.readSource({ keepRow: true });
  }).then(function (r) {
    assert.strictEqual(r.changed, false, 'same content: no refresh');
  });
});
atest('merge: detection by content, not by name', function () {
  var c = context(), M = c.Writer.merge;
  return M.setSource(src('data.txt', BOOK)).then(function () {
    assert.strictEqual(M.data.kind, 'hos', '.hos content under another name');
    return M.setSource(src('data.csv', 'Name,City\nAnna,Paris\n'));
  }).then(function () {
    assert.strictEqual(M.data.kind, 'csv');
    assert.strictEqual(M.sheets.length, 0);
  });
});
atest('merge: bad version, .how and a broken .hos show messages', function () {
  var c = context(), M = c.Writer.merge;
  return M.setSource(src('v2.hos', hosText([{ name: 'S', cells: [C(0, 0, 'A', 'A')] }], 2))).then(function (r) {
    assert.strictEqual(r.error, 'This .hos file is version 2. Writer Mail Merge reads version 1');
    assert.strictEqual(M.data, null);
    return M.setSource(src('letter.how', JSON.stringify({ format: 'how', version: 1, html: '' })));
  }).then(function (r) {
    assert.strictEqual(r.error, 'This is a Writer document (.how), not merge data: choose a CSV, Excel or Spreadsheet .hos file');
    return M.setSource(src('broken.hos', 'Name,City\nAnna,Paris\n'));
  }).then(function (r) {
    assert.strictEqual(r.error, 'This .hos file could not be read: it is not a Spreadsheet file');
  });
});

/* ---------- UI and page wiring (static) ---------- */
test('chooser, Browse and #mmFile list .hos, not .how; script order', function () {
  var ui = read('apps/office/writer/modules/writer-merge-ui.js');
  var html = read('apps/office/writer/writer.html');
  assert.ok(/function isDataName\(n\) \{ return isCsvName\(n\) \|\| isXlsxName\(n\) \|\| isHosName\(n\); \}/.test(ui));
  assert.ok(ui.indexOf("'application/json': ['.hos']") !== -1);
  assert.ok(!/'\.how'/.test(ui), 'a Writer .how is not listed as merge data');
  var m = html.match(/<input type="file" id="mmFile" accept="([^"]+)" hidden>\s*<\/div>/);
  assert.ok(m && m[1].split(',').indexOf('.hos') !== -1 && m[1].indexOf('.how') === -1, 'mmFile accept');
  var a = html.indexOf('<script src="modules/writer-csv.js">'), b = html.indexOf('<script src="modules/writer-hos.js">'), c = html.indexOf('<script src="modules/writer-merge.js">');
  assert.ok(a > 0 && b > a && c > b, 'writer-hos.js loads after writer-csv.js and before writer-merge.js');
  assert.ok(!/writer\.html\?v=|modules\/writer-[a-z-]+\.js\?v=/.test(html), 'no ?v= on Writer');
});

(async function () {
  for (var i = 0; i < asyncTests.length; i++) {
    try { await asyncTests[i][1](); passed++; console.log('ok', asyncTests[i][0]); }
    catch (e) { failed++; console.log('FAIL', asyncTests[i][0], '\n ', e && e.message); }
  }
  console.log(passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
})();
