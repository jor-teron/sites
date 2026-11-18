#!/usr/bin/env node
/* SH31: SPELLNUMBER drops hyphens and the main currency word, keeps paise/cents/pence.
   Run: node --test apps/office/spreadsheet/test-sh31-spellnumber-wording.cjs
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
  }).join('\n;\n'), ctx, { filename: 'spreadsheet-sh31.js' });
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

const STYLES = ['WORLD', 'INR', 'INDIA', 'USA', 'USD', 'UK', 'GBP', 'inr', 'india', 'usd', 'gbp', '', 'world'];
const NUMBERS = [0, 0.01, 0.29, 0.5, 0.50, 1, 1.01, 21, 45, 105, 12345, 12345.5, 12345.50, 100000, 1250000.5, 1234567.25, -21, -1, -105, -0.25, 1e15 - 1];
const MAJOR_CURRENCY = /rupee|dollar|pound/i;

test('exact wording for the SH31 examples', function () {
  assert.equal(SPELLNUMBER.spell(12345, 'INR'), 'Twelve thousand three hundred forty five');
  assert.equal(SPELLNUMBER.spell(12345.50, 'INR'), 'Twelve thousand three hundred forty five and fifty paise');
  assert.equal(SPELLNUMBER.spell(12345.50, 'USD'), 'Twelve thousand three hundred forty five and fifty cents');
  assert.equal(SPELLNUMBER.spell(12345.50, 'UK'), 'Twelve thousand three hundred and forty five and fifty pence');
  assert.equal(SPELLNUMBER.spell(12345.5, 'WORLD'), 'Twelve thousand three hundred forty five point five');
});

test('zero is Zero; a zero whole part with a fraction is only the small unit', function () {
  assert.equal(SPELLNUMBER.spell(0, 'INR'), 'Zero');
  assert.equal(SPELLNUMBER.spell(0, 'USA'), 'Zero');
  assert.equal(SPELLNUMBER.spell(0, 'UK'), 'Zero');
  assert.equal(SPELLNUMBER.spell(0, 'WORLD'), 'Zero');
  assert.equal(SPELLNUMBER.spell(0.50, 'INR'), 'Fifty paise');
  assert.equal(SPELLNUMBER.spell(0.50, 'USD'), 'Fifty cents');
  assert.equal(SPELLNUMBER.spell(0.50, 'UK'), 'Fifty pence');
  assert.equal(SPELLNUMBER.spell(0.01, 'INR'), 'One paisa');
  assert.equal(SPELLNUMBER.spell(0.01, 'USA'), 'One cent');
  assert.equal(SPELLNUMBER.spell(0.01, 'UK'), 'One penny');
});

test('no output in any style contains a hyphen or a main currency word', function () {
  STYLES.forEach(function (s) {
    NUMBERS.forEach(function (n) {
      const text = String(SPELLNUMBER.spell(n, s));
      assert.equal(text.includes('-'), false, text + ' (' + s + ', ' + n + ')');
      assert.equal(MAJOR_CURRENCY.test(text), false, text + ' (' + s + ', ' + n + ')');
    });
  });
});

test('aliases, case, blank WORLD, and short codes stay as in SH30', function () {
  const inr = SPELLNUMBER.spell(12345.50, 'INR');
  ['INR', 'inr', 'INDIA', 'india', 'India'].forEach(function (s) {
    assert.equal(SPELLNUMBER.spell(12345.50, s), inr, s);
  });
  const usa = SPELLNUMBER.spell(12345.50, 'USA');
  ['USA', 'usa', 'USD', 'usd'].forEach(function (s) {
    assert.equal(SPELLNUMBER.spell(12345.50, s), usa, s);
  });
  const uk = SPELLNUMBER.spell(12345.50, 'UK');
  ['UK', 'uk', 'GBP', 'gbp'].forEach(function (s) {
    assert.equal(SPELLNUMBER.spell(12345.50, s), uk, s);
  });
  assert.equal(SPELLNUMBER.spell(12345.5), SPELLNUMBER.spell(12345.5, 'WORLD'));
  assert.equal(SPELLNUMBER.spell(12345.5, ''), SPELLNUMBER.spell(12345.5, 'WORLD'));
  ['IN', 'US', 'GB'].forEach(function (s) {
    assert.equal(SPELLNUMBER.spell(100, s), '#VALUE!', s);
  });
});

test('engine: the SH31 examples and no hyphen or main currency word', function () {
  const ctx = loadEngine();
  assert.equal(evalCell(ctx, '=SPELLNUMBER(12345, INR)'), 'Twelve thousand three hundred forty five');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(12345.50, INR)'), 'Twelve thousand three hundred forty five and fifty paise');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(12345.50, USD)'), 'Twelve thousand three hundred forty five and fifty cents');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(12345.50, UK)'), 'Twelve thousand three hundred and forty five and fifty pence');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(12345.5)'), 'Twelve thousand three hundred forty five point five');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(0.50, INR)'), 'Fifty paise');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(0, INR)'), 'Zero');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(21)'), 'Twenty one');
  const samples = [
    evalCell(ctx, '=SPELLNUMBER(21)'),
    evalCell(ctx, '=SPELLNUMBER(12345.50, INR)'),
    evalCell(ctx, '=SPELLNUMBER(12345.50, USD)'),
    evalCell(ctx, '=SPELLNUMBER(12345.50, GBP)'),
    evalCell(ctx, '=SPELLNUMBER(-21)')
  ];
  samples.forEach(function (text) {
    assert.equal(String(text).includes('-'), false, text);
    assert.equal(MAJOR_CURRENCY.test(String(text)), false, text);
  });
});
