#!/usr/bin/env node
/* SH44: IFERROR catches errors inside text functions (calls run innermost first; a CellError
   becomes the call's error text), unwrapped cells still show the error, and CONCAT /
   CONCATENATE / TEXTJOIN join numbers at 15 significant digits (fxNumberText).
   Real spreadsheet modules in a vm (no DOM).
   Run: node --test apps/office/spreadsheet/test-sh44-text-iferror.cjs */
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
  vm.runInContext(files.map(read).join('\n;\n'), ctx, { filename: 'spreadsheet-sh44.js' });
  ctx.setStatus = (m) => { rec.status.push(m); };
  ctx.XLSX = XLSX;
  return { ctx, rec };
}

const C = load().ctx;
function set(a1, f) { const a = C.parseAddr(a1); C.workbook.sheets[0].cells[a.r][a.c].formula = String(f); }
function val(a1) { const a = C.parseAddr(a1); return C.workbook.sheets[0].cells[a.r][a.c].value; }
/* A1 Hello, A2 apple / B2 1 (lookup table), B1 #DIV/0! */
function ev(formulas) {
  C.emptyWorkbook();
  set('A1', 'Hello'); set('B1', '=1/0'); set('A2', 'apple'); set('B2', '1');
  formulas.forEach((f, i) => set('Z' + (i + 1), f));
  C.recalcAll();
  return formulas.map((f, i) => val('Z' + (i + 1)));
}

test('CONCATENATE / CONCAT / TEXTJOIN join numbers at 15 significant digits; & unchanged', () => {
  assert.deepEqual(ev(['=CONCATENATE("n=",0.1+0.2)', '=CONCAT(0.1+0.2)', '=CONCAT("x",1/3)', '=TEXTJOIN(",",TRUE,0.1+0.2,1/3)',
    '="n="&(0.1+0.2)', '=CONCATENATE(1/3)', '=CONCAT(2,"|",-0.5)']),
    /* a number-only text result is stored as the number (as before), so these two compare as numbers */
    ['n=0.3', 0.3, 'x0.333333333333333', '0.3,0.333333333333333', 'n=0.3', 0.333333333333333, '2|-0.5']);
});

test('fxNumberText: numbers rounded to 15 digits then String; other values unchanged', () => {
  assert.equal(C.fxNumberText(0.1 + 0.2), '0.3');
  assert.equal(C.fxNumberText(1 / 3), '0.333333333333333');
  assert.equal(C.fxNumberText(42), '42');
  assert.equal(C.fxNumberText(0), '0');
  assert.equal(C.fxNumberText('0.30000000000000004'), '0.30000000000000004');   // typed text stays
  assert.equal(C.fxNumberText('abc'), 'abc');
});

test('IFERROR catches an error inside LEN, UPPER, LEFT and SUM', () => {
  assert.deepEqual(ev(['=IFERROR(LEN(B1),"bad")', '=IFERROR(UPPER(1/0),"bad")', '=IFERROR(LEFT(B1,3),"bad")', '=IFERROR(SUM(B1),"bad")',
    '=IFERROR(TEXTJOIN(",",TRUE,B1),"bad")', '=IFERROR(LEN(UPPER(B1)),"bad")']),
    ['bad', 'bad', 'bad', 'bad', 'bad', 'bad']);
});

test('without IFERROR the cell still shows the error', () => {
  assert.deepEqual(ev(['=LEN(B1)', '=UPPER(1/0)', '=LEFT(B1,3)', '=SUM(B1)', '=LEN(B1)+1', '=UPPER(1/0)&"x"', '=LEN(UPPER(B1))', '=SUM(LEN(B1),1)']),
    ['#DIV/0!', '#DIV/0!', '#DIV/0!', '#DIV/0!', '#DIV/0!', '#DIV/0!', '#DIV/0!', '#DIV/0!']);
});

test('no error: IFERROR returns the value; a typed "#DIV/0!" string is plain text', () => {
  assert.deepEqual(ev(['=IFERROR(LEN(A1),"bad")', '=IFERROR(UPPER(A1),"bad")', '=LEN("#DIV/0!")', '=IFERROR(SUM(1,2)*2,"bad")']),
    [5, 'HELLO', 7, 6]);
});

test('existing CONCAT and VLOOKUP IFERROR cases still work', () => {
  assert.deepEqual(ev(['=IFERROR(CONCAT(A1,B1),"bad")', '=IFERROR(CONCATENATE(A1,"ok"),"bad")', '=IFERROR(VLOOKUP("zz",A2:B2,2,FALSE),"nf")',
    '=IFERROR(VLOOKUP("apple",A2:B2,2,FALSE),"nf")', '=IFERROR(B1,"bad")', '=CONCAT(A1,B1)']),
    ['bad', 'Hellook', 'nf', 1, 'bad', '#DIV/0!']);
});

test('fxErrorArg: marked error args pass on, error-aware names and typed text do not', () => {
  const bag = ['#DIV/0!', 'plain', '#N/A'];
  const mark = { 0: true, 2: true };
  assert.equal(C.fxErrorArg('__S1__,__S0__', mark, 'LEN', bag), '#DIV/0!');
  assert.equal(C.fxErrorArg('__S2__', mark, 'upper', bag), '#N/A');
  assert.equal(C.fxErrorArg('__S0__,__S1__', mark, 'IFERROR', bag), null);
  assert.equal(C.fxErrorArg('__S1__', mark, 'LEN', bag), null);
  assert.equal(C.fxErrorArg('', {}, 'LEN', []), null);
});

test('a non-CellError exception is not swallowed', () => {
  const src = read('spreadsheet_formula.js');
  assert.ok(/catch \(e\) \{\s*if \(!\(e instanceof CellError\)\) throw e;\s*out = e\.value;/.test(src));
  assert.ok(src.indexOf('/* (before SH44) out = evalFunc(name, splitArgs(inside), { r: evalRow, c: evalCol, si: evalSheetIdx });') !== -1);
});

test('wiring: version SH44, ?v= tokens, readme', () => {
  const html = read('spreadsheet.html');
  assert.ok(html.indexOf('<title>Spreadsheet SH44</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH44) <title>Spreadsheet SH42</title> -->') !== -1);
  const l = live(html);
  /* (before SH45) for (const f of ['spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH44') !== -1, f); */
  /* (before SH49) for (const f of ['spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH44') !== -1 || l.indexOf(f + '?v=SH45') !== -1, f);   // SH45: formula, functions, settings */
  /* (before SH46) for (const f of ['spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH44') !== -1 || l.indexOf(f + '?v=SH45') !== -1 || l.indexOf(f + '?v=SH49') !== -1, f);   // SH45: formula, functions, settings */
  /* (before SH47) for (const f of ['spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH44') !== -1 || l.indexOf(f + '?v=SH45') !== -1 || l.indexOf(f + '?v=SH49') !== -1 || l.indexOf(f + '?v=SH46') !== -1, f);   // SH45: formula, functions, settings */
  /* (before SH58) ... */
  for (const f of ['spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_settings.js']) assert.ok(new RegExp(f.replace('.', '\\.') + '\\?v=SH(44|45|46|47|49|58)').test(l), f);
  assert.ok(read('spreadsheet_settings.js').indexOf('var SHEET_VERSION = "SH44";') !== -1);
  assert.ok(read('spreadsheet_functions.js').indexOf('/* (before SH44) out += String(x); */') !== -1);
  assert.ok(read('spreadsheet_readme.md').indexOf('## SH44') !== -1);
});
