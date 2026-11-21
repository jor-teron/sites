#!/usr/bin/env node
/* SH42: CONCATENATE(text1, text2, ...) (Excel's classic name for CONCAT), shared by CONCAT:
   text, refs, ranges, numbers, dates, TRUE/FALSE, blanks, errors (returned so IFERROR sees
   them), the catalog entry, and .xlsx formulas with CONCATENATE / _xlfn. prefixes.
   Real spreadsheet modules in a vm (no DOM); the import test builds an .xlsx with the vendored SheetJS.
   Run: node --test apps/office/spreadsheet/test-sh42-concatenate.cjs */
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

function load(extra) {
  const files = ['spreadsheet_config.js', 'spreadsheet_formula.js', 'spreadsheet_functions.js',
    'spreadsheet_refs.js', 'spreadsheet_state.js'].concat(extra || []);
  const rec = { status: [], notes: [] };
  const ctx = {
    console, Date, Math, Number, String, Boolean, Array, Object, Proxy, JSON, Promise, Map, Uint8Array, ArrayBuffer,
    parseInt, isNaN, isFinite, RegExp, Error, TypeError, NaN, Infinity, undefined, setTimeout, clearTimeout,
    document: {
      addEventListener() {}, getElementById() { return null; }, querySelector() { return null; },
      querySelectorAll() { return []; },
      createElement() { return { style: {}, classList: { add() {}, toggle() {} }, appendChild() {}, querySelector() { return null; } }; }
    },
    SHEET_INIT: [],
    undoRecord() {}, afterChange() {}, highlightSel() {}, applyWidths() {}, renderSheetTabs() {},
    OfficeNotify: { show(m) { rec.notes.push(m); } }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(files.map(read).join('\n;\n'), ctx, { filename: 'spreadsheet-sh42.js' });
  ctx.setStatus = (m) => { rec.status.push(m); };
  ctx.XLSX = XLSX;
  return { ctx, rec };
}

const C = load().ctx;
function set(a1, f) { const a = C.parseAddr(a1); C.workbook.sheets[0].cells[a.r][a.c].formula = String(f); }
function val(a1) { const a = C.parseAddr(a1); return C.workbook.sheets[0].cells[a.r][a.c].value; }
/* A1 Hello, A2 3.5, A3 TRUE, A4 blank, B1 #DIV/0!, B2 a date, B3 World */
function fresh() {
  C.emptyWorkbook();
  set('A1', 'Hello'); set('A2', '3.5'); set('A3', 'TRUE'); set('B1', '=1/0'); set('B2', '=DATE(2026,1,3)'); set('B3', 'World');
}
function ev(formulas) {
  fresh();
  formulas.forEach((f, i) => set('Z' + (i + 1), f));
  C.recalcAll();
  return formulas.map((f, i) => val('Z' + (i + 1)));
}

test('text: joins every argument in order', () => {
  assert.deepEqual(ev(['=CONCATENATE("a","b","c")', '=CONCATENATE("one"," ","two")', '=CONCATENATE("x")', '=concatenate("lo","wer")']),
    ['abc', 'one two', 'x', 'lower']);
});

test('refs and mixed text; text that looks like a sheet ref stays text', () => {
  assert.deepEqual(ev(['=CONCATENATE(A1," ",B3)', '=CONCATENATE(A1,"!")', '=CONCATENATE("Sheet1!A1")', '=CONCATENATE(A1,", ",B3,".")']),
    ['Hello World', 'Hello!', 'Sheet1!A1', 'Hello, World.']);
});

test('numbers, dates and TRUE / FALSE join as their value text (same as CONCAT)', () => {
  const got = ev(['=CONCATENATE(A2,"|",A3)', '=CONCATENATE(B2)', '=CONCATENATE(A2*2,"x")', '=CONCATENATE(1,2,3)',
    '=CONCAT(A2,"|",A3)', '=CONCAT(B2)']);
  assert.equal(got[0], '3.5|TRUE');
  assert.equal(got[1], '2026-01-03');
  assert.equal(got[2], '7x');
  assert.equal(String(got[3]), '123');
  assert.equal(got[4], got[0]);
  assert.equal(got[5], got[1]);
});

test('blanks are empty text; a range is joined row by row (CONCAT too)', () => {
  assert.deepEqual(ev(['=CONCATENATE(A1,A4,"x")', '=CONCATENATE(A4)', '=CONCATENATE(A1:A4)', '=CONCAT(A1:A3)', '=CONCATENATE(A2:B3)']),
    ['Hellox', '', 'Hello3.5TRUE', 'Hello3.5TRUE', '3.52026-01-03TRUEWorld']);
});

test('errors: the first error value is the result, and IFERROR can catch it', () => {
  assert.deepEqual(ev(['=CONCATENATE(A1,B1)', '=CONCATENATE(B1,"x")', '=CONCATENATE(A1:B1)', '=IFERROR(CONCATENATE(A1,B1),"bad")',
    '=IFERROR(CONCATENATE(A1,"ok"),"bad")', '=CONCAT(A1,B1)']),
    ['#DIV/0!', '#DIV/0!', '#DIV/0!', 'bad', 'Hellook', '#DIV/0!']);
});

test('nested: LEN, UPPER and & around CONCATENATE', () => {
  assert.deepEqual(ev(['=LEN(CONCATENATE("ab","cd"))', '=UPPER(CONCATENATE(A1,B3))', '=CONCATENATE("a","b")&"c"']),
    [4, 'HELLOWORLD', 'abc']);
});

test('Excel prefixes: _xlfn. / _xlws. / COM.MICROSOFT. name the plain function; text keeps them', () => {
  assert.deepEqual(ev(['=_xlfn.CONCAT("a","b")', '=_xlfn.CONCATENATE("x",1)', '=CONCATENATE("_xlfn.x")', '=_XLFN.CONCAT(A1)']),
    ['ab', 'x1', '_xlfn.x', 'Hello']);
  assert.equal(C.fxStripPrefixes('_xlfn.CONCAT(A1)&_xlfn._xlws.SORT(B1:B2)'), 'CONCAT(A1)&SORT(B1:B2)');
  assert.equal(C.fxStripPrefixes('1+COM.MICROSOFT.IFS(TRUE,1)'), '1+IFS(TRUE,1)');
  assert.equal(C.fxStripPrefixes('A1+B2'), 'A1+B2');
});

test('catalog: CONCATENATE right after CONCAT, Text, sig and hint; dispatched', () => {
  const cat = C.FX_CATALOG;
  const i = cat.findIndex((x) => x.name === 'CONCAT');
  assert.ok(i >= 0);
  assert.deepEqual(JSON.parse(JSON.stringify(cat[i + 1])), {
    name: 'CONCATENATE', cat: 'Text', sig: 'CONCATENATE(text1, text2, ...)', hint: 'Join text values (classic Excel name for CONCAT).'
  });
  assert.notEqual(C.evalFunc('CONCATENATE', ['"a"', '"b"']), '#NAME?');
  assert.equal(C.evalFunc('CONCATENATE', ['"a"', '"b"']), 'ab');
  assert.ok(/CONCATENATE\(a, b, \.\.\.\)/.test(read('FUNCTIONS.txt')));
});

test('opening an .xlsx with CONCATENATE and _xlfn.CONCAT: values evaluate, no "Not supported" note', async () => {
  const { ctx, rec } = load(['spreadsheet_storage.js', 'spreadsheet_format.js', 'spreadsheet_style.js', 'spreadsheet_files.js', 'spreadsheet_xlsx.js']);
  ctx.xlsxLoad = () => Promise.resolve(XLSX);
  const ws = {
    A1: { t: 's', v: 'Jor' }, B1: { t: 'n', v: 41 },
    C1: { t: 's', v: 'Jor is 41', f: 'CONCATENATE(A1," is ",B1)' },
    D1: { t: 's', v: 'Jor41', f: '_xlfn.CONCAT(A1:B1)' },
    '!ref': 'A1:D1'
  };
  const buf = XLSX.write({ SheetNames: ['Sheet1'], Sheets: { Sheet1: ws } }, { bookType: 'xlsx', type: 'buffer' });
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  ctx.importXlsxFile({ name: 'cat.xlsx', arrayBuffer: () => Promise.resolve(ab) }, {});
  for (let i = 0; i < 200 && !rec.status.some((m) => /^Loaded/.test(m)); i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(rec.status.filter((m) => /^Loaded/.test(m)).pop(), 'Loaded 1 sheet');
  vm.runInContext('recalcAll()', ctx);
  const row = ctx.workbook.sheets[0].cells[0];
  assert.ok(/CONCATENATE\(A1," is ",B1\)/.test(row[2].formula));
  assert.equal(row[2].value, 'Jor is 41');
  assert.equal(row[3].value, 'Jor41');
});

test('wiring: version SH42, ?v= tokens, readme, old CONCAT kept as a comment', () => {
  const html = read('spreadsheet.html');
  assert.ok(html.indexOf('<title>Spreadsheet SH42</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH42) <title>Spreadsheet SH41</title> -->') !== -1);
  const l = live(html);
  /* (before SH44) for (const f of ['spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH42') !== -1, f); */
  /* (before SH45) for (const f of ['spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH42') !== -1 || l.indexOf(f + '?v=SH44') !== -1, f);   // SH44: formula, functions, settings */
  /* (before SH49) for (const f of ['spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH42') !== -1 || l.indexOf(f + '?v=SH44') !== -1 || l.indexOf(f + '?v=SH45') !== -1, f);   // SH44: formula, functions, settings */
  /* (before SH46) for (const f of ['spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH42') !== -1 || l.indexOf(f + '?v=SH44') !== -1 || l.indexOf(f + '?v=SH45') !== -1 || l.indexOf(f + '?v=SH49') !== -1, f);   // SH44: formula, functions, settings */
  for (const f of ['spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH42') !== -1 || l.indexOf(f + '?v=SH44') !== -1 || l.indexOf(f + '?v=SH45') !== -1 || l.indexOf(f + '?v=SH49') !== -1 || l.indexOf(f + '?v=SH46') !== -1, f);   // SH44: formula, functions, settings
  assert.ok(read('spreadsheet_settings.js').indexOf('var SHEET_VERSION = "SH42";') !== -1);
  assert.ok(read('spreadsheet_functions.js').indexOf('/* (before SH42) CONCAT joined each argument as text') !== -1);
  assert.ok(read('spreadsheet_readme.md').indexOf('## SH42') !== -1);
});
