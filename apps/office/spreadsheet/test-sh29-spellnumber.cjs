#!/usr/bin/env node
/* SH29: SPELLNUMBER wording and formula-engine integration.
   Run: node --test apps/office/spreadsheet/test-sh29-spellnumber.cjs
   No DOM, no browser, no network. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const SPELLNUMBER = require(path.join(dir, 'spreadsheet_spellnumber.js'));

function loadEngine() {
  const files = [
    'spreadsheet_config.js',
    'spreadsheet_formula.js',
    'spreadsheet_spellnumber.js',
    'spreadsheet_functions.js',
    'spreadsheet_refs.js',
    'spreadsheet_state.js'
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
  }).join('\n;\n'), ctx, { filename: 'spreadsheet-sh29.js' });
  ctx.emptyWorkbook();
  ctx.bindActiveSheet();
  return ctx;
}

function setFormula(ctx, a1, formula) {
  const addr = ctx.parseAddr(a1);
  ctx.workbook.sheets[ctx.workbook.active].cells[addr.r][addr.c].formula = String(formula);
}

function cellValue(ctx, a1) {
  const addr = ctx.parseAddr(a1);
  return ctx.workbook.sheets[ctx.workbook.active].cells[addr.r][addr.c].value;
}

function evalCell(ctx, formula) {
  ctx.emptyWorkbook();
  ctx.bindActiveSheet();
  setFormula(ctx, 'A1', formula);
  ctx.recalcAll();
  return cellValue(ctx, 'A1');
}

/* (before SH30) test('STYLE_HINT names WORLD, INR, USA or UK', function () {
  assert.equal(SPELLNUMBER.STYLE_HINT, 'SPELLNUMBER style: WORLD, INR, USA or UK');
}); */
test('STYLE_HINT names WORLD, INDIA/INR, USA/USD or UK/GBP', function () {
  assert.equal(SPELLNUMBER.STYLE_HINT, 'SPELLNUMBER style: WORLD, INDIA/INR, USA/USD or UK/GBP');
});

/* (before SH31) test('WORLD wording: examples, zero, decimals, scales, hyphen, minus' */
test('WORLD wording: examples, zero, decimals, scales, no hyphen, minus', function () {
  assert.equal(SPELLNUMBER.spell(1250000.5), 'One million two hundred fifty thousand point five');
  assert.equal(SPELLNUMBER.spell(1250000.5, ''), 'One million two hundred fifty thousand point five');
  assert.equal(SPELLNUMBER.spell(1250000.5, 'WORLD'), 'One million two hundred fifty thousand point five');
  assert.equal(SPELLNUMBER.spell(1250000.5, 'world'), 'One million two hundred fifty thousand point five');
  assert.equal(SPELLNUMBER.spell(0.25, 'WORLD'), 'Zero point two five');
  assert.equal(SPELLNUMBER.spell(0, 'WORLD'), 'Zero');
  assert.equal(SPELLNUMBER.spell(1, 'WORLD'), 'One');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(21, 'WORLD'), 'Twenty-one'); */
  assert.equal(SPELLNUMBER.spell(21, 'WORLD'), 'Twenty one');
  assert.equal(SPELLNUMBER.spell(105, 'WORLD'), 'One hundred five');
  assert.equal(SPELLNUMBER.spell(1000000000, 'WORLD'), 'One billion');
  assert.equal(SPELLNUMBER.spell(1e14, 'WORLD'), 'One hundred trillion');
  assert.equal(SPELLNUMBER.spell(1.5, 'WORLD'), 'One point five');
  assert.equal(SPELLNUMBER.spell(10.05, 'WORLD'), 'Ten point zero five');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(-21, 'WORLD'), 'Minus twenty-one'); */
  assert.equal(SPELLNUMBER.spell(-21, 'WORLD'), 'Minus twenty one');
  assert.equal(SPELLNUMBER.spell(-0.25, 'WORLD'), 'Minus zero point two five');
});

test('INR wording: currency, lakh, crore, no " only", INDIA alias', function () {
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1250000.5, 'INR'), 'Twelve lakh fifty thousand rupees and fifty paise'); */
  assert.equal(SPELLNUMBER.spell(1250000.5, 'INR'), 'Twelve lakh fifty thousand and fifty paise');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1250000.5, 'inr'), 'Twelve lakh fifty thousand rupees and fifty paise'); */
  assert.equal(SPELLNUMBER.spell(1250000.5, 'inr'), 'Twelve lakh fifty thousand and fifty paise');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1, 'INR'), 'One rupee'); */
  assert.equal(SPELLNUMBER.spell(1, 'INR'), 'One');
  assert.equal(SPELLNUMBER.spell(0.5, 'INR'), 'Fifty paise');
  assert.equal(SPELLNUMBER.spell(0.01, 'INR'), 'One paisa');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(100, 'INR'), 'One hundred rupees'); */
  assert.equal(SPELLNUMBER.spell(100, 'INR'), 'One hundred');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(0, 'INR'), 'Zero rupees'); */
  assert.equal(SPELLNUMBER.spell(0, 'INR'), 'Zero');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(100000, 'INR'), 'One lakh rupees'); */
  assert.equal(SPELLNUMBER.spell(100000, 'INR'), 'One lakh');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(10000000, 'INR'), 'One crore rupees'); */
  assert.equal(SPELLNUMBER.spell(10000000, 'INR'), 'One crore');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1000000000, 'INR'), 'One hundred crore rupees'); */
  assert.equal(SPELLNUMBER.spell(1000000000, 'INR'), 'One hundred crore');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1, 'INDIA'), 'One rupee'); */
  assert.equal(SPELLNUMBER.spell(1, 'INDIA'), 'One');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(100, 'india'), 'One hundred rupees'); */
  assert.equal(SPELLNUMBER.spell(100, 'india'), 'One hundred');
  const text = SPELLNUMBER.spell(100, 'INR');
  assert.equal(text.endsWith(' only'), false);
  assert.equal(text.includes(' only'), false);
});

test('USA wording: dollars and cents, no and inside hundreds', function () {
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1250000.5, 'USA'), 'One million two hundred fifty thousand dollars and fifty cents'); */
  assert.equal(SPELLNUMBER.spell(1250000.5, 'USA'), 'One million two hundred fifty thousand and fifty cents');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1, 'USA'), 'One dollar'); */
  assert.equal(SPELLNUMBER.spell(1, 'USA'), 'One');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1.01, 'USA'), 'One dollar and one cent'); */
  assert.equal(SPELLNUMBER.spell(1.01, 'USA'), 'One and one cent');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(0, 'USA'), 'Zero dollars'); */
  assert.equal(SPELLNUMBER.spell(0, 'USA'), 'Zero');
  assert.equal(SPELLNUMBER.spell(0.01, 'USA'), 'One cent');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(105, 'USA'), 'One hundred five dollars'); */
  assert.equal(SPELLNUMBER.spell(105, 'USA'), 'One hundred five');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(-1, 'USA'), 'Minus one dollar'); */
  assert.equal(SPELLNUMBER.spell(-1, 'USA'), 'Minus one');
});

test('UK wording: pounds and pence, and inside hundreds, penny/pence', function () {
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1250000.5, 'UK'), 'One million two hundred and fifty thousand pounds and fifty pence'); */
  assert.equal(SPELLNUMBER.spell(1250000.5, 'UK'), 'One million two hundred and fifty thousand and fifty pence');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(105, 'UK'), 'One hundred and five pounds'); */
  assert.equal(SPELLNUMBER.spell(105, 'UK'), 'One hundred and five');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1, 'UK'), 'One pound'); */
  assert.equal(SPELLNUMBER.spell(1, 'UK'), 'One');
  assert.equal(SPELLNUMBER.spell(0.01, 'UK'), 'One penny');
  assert.equal(SPELLNUMBER.spell(0.02, 'UK'), 'Two pence');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(0, 'UK'), 'Zero pounds'); */
  assert.equal(SPELLNUMBER.spell(0, 'UK'), 'Zero');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(-105, 'UK'), 'Minus one hundred and five pounds'); */
  assert.equal(SPELLNUMBER.spell(-105, 'UK'), 'Minus one hundred and five');
});

test('rounding to cents is string-safe (0.295, 1.005, 0.29)', function () {
  assert.equal(SPELLNUMBER.spell(0.295, 'USA'), 'Thirty cents');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1.005, 'USA'), 'One dollar and one cent'); */
  assert.equal(SPELLNUMBER.spell(1.005, 'USA'), 'One and one cent');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(0.29, 'USA'), 'Twenty-nine cents'); */
  assert.equal(SPELLNUMBER.spell(0.29, 'USA'), 'Twenty nine cents');
  assert.equal(SPELLNUMBER.spell(0.295, 'INR'), 'Thirty paise');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1.005, 'UK'), 'One pound and one penny'); */
  assert.equal(SPELLNUMBER.spell(1.005, 'UK'), 'One and one penny');
});

test('errors: non-numeric #VALUE!, unknown style #VALUE!, cap #NUM!', function () {
  assert.equal(SPELLNUMBER.spell('abc', 'WORLD'), '#VALUE!');
  assert.equal(SPELLNUMBER.spell(true, 'WORLD'), '#VALUE!');
  assert.equal(SPELLNUMBER.spell(100, 'YEN'), '#VALUE!');
  assert.equal(SPELLNUMBER.spell(100, 'EUR'), '#VALUE!');
  assert.equal(SPELLNUMBER.spell(1e15, 'WORLD'), '#NUM!');
  assert.equal(SPELLNUMBER.spell(-1e15, 'WORLD'), '#NUM!');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1e15 - 1, 'WORLD'), 'Nine hundred ninety-nine trillion nine hundred ninety-nine billion nine hundred ninety-nine million nine hundred ninety-nine thousand nine hundred ninety-nine'); */
  assert.equal(SPELLNUMBER.spell(1e15 - 1, 'WORLD'), 'Nine hundred ninety nine trillion nine hundred ninety nine billion nine hundred ninety nine million nine hundred ninety nine thousand nine hundred ninety nine');
  assert.equal(SPELLNUMBER.spell(Infinity, 'WORLD'), '#NUM!');
  assert.equal(SPELLNUMBER.spell(NaN, 'WORLD'), '#VALUE!');
});

test('engine: quoted and bare styles, default WORLD, cell refs', function () {
  const ctx = loadEngine();
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1250000.5)'), 'One million two hundred fifty thousand point five');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1250000.5,"WORLD")'), 'One million two hundred fifty thousand point five');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1250000.5, WORLD)'), 'One million two hundred fifty thousand point five');
  /* (before SH31) assert.equal(evalCell(ctx, '=SPELLNUMBER(1250000.5,"INR")'), 'Twelve lakh fifty thousand rupees and fifty paise'); */
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1250000.5,"INR")'), 'Twelve lakh fifty thousand and fifty paise');
  /* (before SH31) assert.equal(evalCell(ctx, '=SPELLNUMBER(1250000.5, INR)'), 'Twelve lakh fifty thousand rupees and fifty paise'); */
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1250000.5, INR)'), 'Twelve lakh fifty thousand and fifty paise');
  /* (before SH31) assert.equal(evalCell(ctx, '=SPELLNUMBER(100, INDIA)'), 'One hundred rupees'); */
  assert.equal(evalCell(ctx, '=SPELLNUMBER(100, INDIA)'), 'One hundred');
  /* (before SH31) assert.equal(evalCell(ctx, '=SPELLNUMBER(1,"USA")'), 'One dollar'); */
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1,"USA")'), 'One');
  /* (before SH31) assert.equal(evalCell(ctx, '=SPELLNUMBER(1, USA)'), 'One dollar'); */
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1, USA)'), 'One');
  /* (before SH31) assert.equal(evalCell(ctx, '=SPELLNUMBER(105, UK)'), 'One hundred and five pounds'); */
  assert.equal(evalCell(ctx, '=SPELLNUMBER(105, UK)'), 'One hundred and five');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(0.01,"UK")'), 'One penny');

  ctx.emptyWorkbook();
  ctx.bindActiveSheet();
  setFormula(ctx, 'B1', 'INR');
  setFormula(ctx, 'A1', '1250000.5');
  setFormula(ctx, 'C1', '=SPELLNUMBER(A1,B1)');
  ctx.recalcAll();
  /* (before SH31) assert.equal(cellValue(ctx, 'C1'), 'Twelve lakh fifty thousand rupees and fifty paise'); */
  assert.equal(cellValue(ctx, 'C1'), 'Twelve lakh fifty thousand and fifty paise');
});

/* (before SH31) test('engine: errors and hyphenation' */
test('engine: errors and no hyphenation', function () {
  const ctx = loadEngine();
  assert.equal(evalCell(ctx, '=SPELLNUMBER("abc")'), '#VALUE!');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(100,"YEN")'), '#VALUE!');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(100, YEN)'), '#VALUE!');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1e15)'), '#NUM!');
  /* (before SH31) assert.equal(evalCell(ctx, '=SPELLNUMBER(21)'), 'Twenty-one'); */
  assert.equal(evalCell(ctx, '=SPELLNUMBER(21)'), 'Twenty one');
  /* (before SH31) assert.equal(evalCell(ctx, '=SPELLNUMBER(-1,"USA")'), 'Minus one dollar'); */
  assert.equal(evalCell(ctx, '=SPELLNUMBER(-1,"USA")'), 'Minus one');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(0.295,"USA")'), 'Thirty cents');
  /* (before SH31) assert.equal(evalCell(ctx, '=SPELLNUMBER(1.005,"USA")'), 'One dollar and one cent'); */
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1.005,"USA")'), 'One and one cent');
});

test('fx catalog lists SPELLNUMBER under Text', function () {
  const ctx = loadEngine();
  const item = ctx.fxFindName('SPELLNUMBER');
  assert.ok(item);
  assert.equal(item.cat, 'Text');
  assert.equal(item.sig, 'SPELLNUMBER(number, [style])');
  assert.ok(item.hint.indexOf('WORLD') !== -1);
  assert.ok(item.hint.indexOf('INR') !== -1);
  const names = ctx.fxSuggest('SPELL', 8).map(function (x) { return x.name; });
  assert.ok(names.indexOf('SPELLNUMBER') !== -1);
});
