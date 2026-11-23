#!/usr/bin/env node
/* SH45: ISERROR (any error), ISERR (any error but #N/A), ISNA (#N/A only), with error cells,
   1/0, VLOOKUP not found, numbers, text, blanks, typed error text, inner calls, and IF(ISERROR(...)).
   Real spreadsheet modules in a vm (no DOM).
   Run: node --test apps/office/spreadsheet/test-sh45-iserror.cjs */
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
  vm.runInContext(files.map(read).join('\n;\n'), ctx, { filename: 'spreadsheet-sh45.js' });
  ctx.setStatus = (m) => { rec.status.push(m); };
  ctx.XLSX = XLSX;
  return { ctx, rec };
}

const C = load().ctx;
function set(a1, f) { const a = C.parseAddr(a1); C.workbook.sheets[0].cells[a.r][a.c].formula = String(f); }
function val(a1) { const a = C.parseAddr(a1); return C.workbook.sheets[0].cells[a.r][a.c].value; }
/* A1 Hello, B1 #DIV/0!, A2:B2 lookup row (apple, 1), C1 #N/A (lookup miss), D1 #NAME?, E1 42, F1 blank (never set) */
function ev(formulas) {
  C.emptyWorkbook();
  set('A1', 'Hello'); set('B1', '=1/0'); set('A2', 'apple'); set('B2', '1');
  set('C1', '=VLOOKUP("zz",A2:B2,2,FALSE)'); set('D1', '=NOPE(1)'); set('E1', '42');
  formulas.forEach((f, i) => set('Z' + (i + 1), f));
  C.recalcAll();
  return formulas.map((f, i) => val('Z' + (i + 1)));
}
const T = 'TRUE', F = 'FALSE';

test('error cells: #DIV/0!, #N/A and #NAME? refs', () => {
  assert.deepEqual(ev(['=ISERROR(B1)', '=ISERR(B1)', '=ISNA(B1)', '=ISERROR(C1)', '=ISERR(C1)', '=ISNA(C1)', '=ISERROR(D1)', '=ISERR(D1)', '=ISNA(D1)']),
    [T, T, F, T, F, T, T, T, F]);
});

test('direct expressions: 1/0, an error ref in math or &, SQRT(-1)', () => {
  assert.deepEqual(ev(['=ISERROR(1/0)', '=ISERR(1/0)', '=ISNA(1/0)', '=ISERROR(B1+1)', '=ISERROR("a"&B1)', '=ISERROR(SQRT(-1))', '=ISERR(SQRT(-1))']),
    [T, T, F, T, T, T, T]);
});

test('inner calls: VLOOKUP not found is #N/A; UPPER of an error is that error', () => {
  assert.deepEqual(ev(['=ISNA(VLOOKUP("zz",A2:B2,2,FALSE))', '=ISERROR(VLOOKUP("zz",A2:B2,2,FALSE))', '=ISERR(VLOOKUP("zz",A2:B2,2,FALSE))',
    '=ISERROR(VLOOKUP("apple",A2:B2,2,FALSE))', '=ISERROR(UPPER(B1))', '=ISNA(UPPER(B1))', '=ISERROR(LEN(A1))',
    '=ISNA(IFERROR(1/0,VLOOKUP("zz",A2:B2,2,FALSE)))']),
    [T, T, F, F, T, F, F, T]);
});

test('numbers, text and blanks are not errors', () => {
  assert.deepEqual(ev(['=ISERROR(5)', '=ISERROR(E1)', '=ISERROR(A1)', '=ISERROR(F1)', '=ISERR(F1)', '=ISNA(F1)', '=ISERROR("text")', '=ISERROR(1+1)']),
    [F, F, F, F, F, F, F, F]);
});

test('a typed error string in quotes is text, not an error', () => {
  assert.deepEqual(ev(['=ISERROR("#DIV/0!")', '=ISNA("#N/A")', '=ISERR("#VALUE!")']), [F, F, F]);
});

test('IF(ISERROR(...)) and friends take the right branch (IF reads FALSE as false)', () => {
  assert.deepEqual(ev(['=IF(ISERROR(B1),"e","ok")', '=IF(ISERROR(A1),"e","ok")', '=IF(ISNA(C1),"missing","found")', '=IF(ISNA(B1),"missing","other")',
    '=IF(ISERR(C1),"err","na")', '=NOT(ISERROR(B1))', '=IF(FALSE,"y","n")', '=IF(ISBLANK(A1),"y","n")', '=IF(AND(1,0),"y","n")']),
    ['e', 'ok', 'missing', 'other', 'na', F, 'n', 'n', 'n']);
});

test('counting errors (IF inside SUM)', () => {
  assert.deepEqual(ev(['=SUM(IF(ISERROR(B1),1,0),IF(ISERROR(C1),1,0),IF(ISERROR(E1),1,0))', '=SUM(IF(ISNA(C1),1,0),IF(ISNA(B1),1,0))']), [2, 1]);
});

test('fxIsErrorKind: the pure rule (#NULL! included)', () => {
  for (const e of ['#DIV/0!', '#N/A', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#NULL!', '#ERR']) assert.equal(C.fxIsErrorKind('ISERROR', e), true, e);
  for (const e of ['#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#NULL!']) assert.equal(C.fxIsErrorKind('ISERR', e), true, e);
  assert.equal(C.fxIsErrorKind('ISERR', '#N/A'), false);
  assert.equal(C.fxIsErrorKind('ISNA', '#N/A'), true);
  assert.equal(C.fxIsErrorKind('ISNA', '#DIV/0!'), false);
  for (const n of ['ISERROR', 'ISERR', 'ISNA']) { assert.equal(C.fxIsErrorKind(n, null), false); assert.equal(C.fxIsErrorKind(n, ''), false); }
  assert.equal(C.fxErrorOf('#NULL!'), '#NULL!');
  assert.equal(C.fxErrorOf('"#NULL!"'), null);
});

test('catalog, FUNCTIONS.txt and the error-aware lists', () => {
  const cat = C.FX_CATALOG.map((x) => JSON.parse(JSON.stringify(x)));
  for (const n of ['ISERROR', 'ISERR', 'ISNA']) {
    const e = cat.find((x) => x.name === n);
    assert.ok(e, n);
    assert.equal(e.cat, 'Logic');
    assert.equal(e.sig, n + '(value)');
    assert.ok(e.hint.length > 0);
    assert.notEqual(C.evalFunc(n, ['1']), '#NAME?');
    assert.ok(new RegExp('^\\s+' + n + '\\(value\\)', 'm').test(read('FUNCTIONS.txt')), n);
    assert.ok(vm.runInContext('FX_ERROR_AWARE.' + n + ' && FX_ERROR_BARE.' + n, C), n);
  }
});

test('wiring: version SH45, ?v= tokens, readme, old IF rule kept as a comment', () => {
  const html = read('spreadsheet.html');
  assert.ok(html.indexOf('<title>Spreadsheet SH45</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH45) <title>Spreadsheet SH44</title> -->') !== -1);
  const l = live(html);
  /* (before SH49) for (const f of ['spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH45') !== -1, f); */
  /* (before SH46) for (const f of ['spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH45') !== -1 || l.indexOf(f + '?v=SH49') !== -1, f);   // SH49: formula, settings */
  /* (before SH47) for (const f of ['spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH45') !== -1 || l.indexOf(f + '?v=SH49') !== -1 || l.indexOf(f + '?v=SH46') !== -1, f);   // SH49: formula, settings */
  /* (before SH58) ... */
  for (const f of ['spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_settings.js']) assert.ok(new RegExp(f.replace('.', '\\.') + '\\?v=SH(45|46|47|49|58)').test(l), f);
  assert.ok(read('spreadsheet_settings.js').indexOf('var SHEET_VERSION = "SH45";') !== -1);
  assert.ok(read('spreadsheet_formula.js').indexOf('/* (before SH45) return !!(left && left !== 0 && left !== ERR);') !== -1);
  assert.ok(read('spreadsheet_readme.md').indexOf('## SH45') !== -1);
});
