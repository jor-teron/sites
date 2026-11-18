#!/usr/bin/env node
/* SH30: SPELLNUMBER accepts country name and currency code.
   Run: node --test apps/office/spreadsheet/test-sh30-spellnumber-aliases.cjs
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
  }).join('\n;\n'), ctx, { filename: 'spreadsheet-sh30.js' });
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

const INR_NUMBERS = [1250000.5, 1250.50, 1, 0.5, 0.01, 100, 0, 100000];
const USA_NUMBERS = [1250000.5, 1250.50, 1, 1.01, 105, 0.01, 0];
const UK_NUMBERS = [1250000.5, 1250.50, 105, 1, 0.01, 0.02, 0];

function assertSamePair(a, b, numbers) {
  numbers.forEach(function (n) {
    const wa = SPELLNUMBER.spell(n, a);
    const wb = SPELLNUMBER.spell(n, b);
    assert.equal(wa, wb, a + ' vs ' + b + ' for ' + n);
    assert.equal(String(wa).endsWith(' only'), false, String(wa));
    assert.equal(String(wa).includes(' only'), false, String(wa));
  });
}

test('STYLE_HINT lists both names for each style', function () {
  assert.equal(SPELLNUMBER.STYLE_HINT, 'SPELLNUMBER style: WORLD, INDIA/INR, USA/USD or UK/GBP');
});

test('INDIA and INR give the same wording, including decimals', function () {
  assertSamePair('INDIA', 'INR', INR_NUMBERS);
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1250000.5, 'INR'), 'Twelve lakh fifty thousand rupees and fifty paise'); */
  assert.equal(SPELLNUMBER.spell(1250000.5, 'INR'), 'Twelve lakh fifty thousand and fifty paise');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1250000.5, 'INDIA'), 'Twelve lakh fifty thousand rupees and fifty paise'); */
  assert.equal(SPELLNUMBER.spell(1250000.5, 'INDIA'), 'Twelve lakh fifty thousand and fifty paise');
});

test('USA and USD give the same wording, including decimals', function () {
  assertSamePair('USA', 'USD', USA_NUMBERS);
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1250000.5, 'USD'), 'One million two hundred fifty thousand dollars and fifty cents'); */
  assert.equal(SPELLNUMBER.spell(1250000.5, 'USD'), 'One million two hundred fifty thousand and fifty cents');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1.01, 'USD'), 'One dollar and one cent'); */
  assert.equal(SPELLNUMBER.spell(1.01, 'USD'), 'One and one cent');
});

test('UK and GBP give the same wording, including decimals', function () {
  assertSamePair('UK', 'GBP', UK_NUMBERS);
  /* (before SH31) assert.equal(SPELLNUMBER.spell(105, 'GBP'), 'One hundred and five pounds'); */
  assert.equal(SPELLNUMBER.spell(105, 'GBP'), 'One hundred and five');
  /* (before SH31) assert.equal(SPELLNUMBER.spell(1250000.5, 'GBP'), 'One million two hundred and fifty thousand pounds and fifty pence'); */
  assert.equal(SPELLNUMBER.spell(1250000.5, 'GBP'), 'One million two hundred and fifty thousand and fifty pence');
});

test('lowercase and mixed case work for country names and currency codes', function () {
  const inr = SPELLNUMBER.spell(1250.50, 'INR');
  ['INR', 'inr', 'Inr', 'INDIA', 'india', 'India'].forEach(function (s) {
    assert.equal(SPELLNUMBER.spell(1250.50, s), inr, s);
  });
  const usa = SPELLNUMBER.spell(1250.50, 'USA');
  ['USA', 'usa', 'Usa', 'USD', 'usd', 'Usd'].forEach(function (s) {
    assert.equal(SPELLNUMBER.spell(1250.50, s), usa, s);
  });
  const uk = SPELLNUMBER.spell(1250.50, 'UK');
  ['UK', 'uk', 'Uk', 'GBP', 'gbp', 'Gbp'].forEach(function (s) {
    assert.equal(SPELLNUMBER.spell(1250.50, s), uk, s);
  });
});

test('short codes IN, US and GB are #VALUE!', function () {
  ['IN', 'in', 'US', 'us', 'GB', 'gb'].forEach(function (s) {
    assert.equal(SPELLNUMBER.spell(100, s), '#VALUE!', s);
  });
});

test('a blank style gives WORLD', function () {
  const world = SPELLNUMBER.spell(1250000.5, 'WORLD');
  assert.equal(SPELLNUMBER.spell(1250000.5), world);
  assert.equal(SPELLNUMBER.spell(1250000.5, ''), world);
  assert.equal(SPELLNUMBER.spell(1250000.5, '  '), world);
  assert.equal(world, 'One million two hundred fifty thousand point five');
});

test('no wording ends with "only"', function () {
  const styles = ['WORLD', 'INR', 'INDIA', 'USA', 'USD', 'UK', 'GBP', 'inr', 'india', 'usd', 'gbp'];
  const numbers = [0, 1, 0.5, 105, 1250.50, 1250000.5, -1];
  styles.forEach(function (s) {
    numbers.forEach(function (n) {
      const text = String(SPELLNUMBER.spell(n, s));
      assert.equal(text.endsWith(' only'), false, text + ' (' + s + ')');
      assert.equal(/only$/i.test(text), false, text + ' (' + s + ')');
    });
  });
});

test('engine: quoted and bare country names and currency codes', function () {
  const ctx = loadEngine();
  /* (before SH31) const inr = 'Twelve lakh fifty thousand rupees and fifty paise'; */
  const inr = 'Twelve lakh fifty thousand and fifty paise';
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1250000.5,"INR")'), inr);
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1250000.5, INR)'), inr);
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1250000.5, inr)'), inr);
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1250000.5, INDIA)'), inr);
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1250000.5,"india")'), inr);
  /* (before SH31) assert.equal(evalCell(ctx, '=SPELLNUMBER(1, USD)'), 'One dollar'); */
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1, USD)'), 'One');
  /* (before SH31) assert.equal(evalCell(ctx, '=SPELLNUMBER(1,"usd")'), 'One dollar'); */
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1,"usd")'), 'One');
  /* (before SH31) assert.equal(evalCell(ctx, '=SPELLNUMBER(105, GBP)'), 'One hundred and five pounds'); */
  assert.equal(evalCell(ctx, '=SPELLNUMBER(105, GBP)'), 'One hundred and five');
  /* (before SH31) assert.equal(evalCell(ctx, '=SPELLNUMBER(105,"gbp")'), 'One hundred and five pounds'); */
  assert.equal(evalCell(ctx, '=SPELLNUMBER(105,"gbp")'), 'One hundred and five');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(1250000.5)'), 'One million two hundred fifty thousand point five');
});

test('engine: short codes and unknown styles are #VALUE!', function () {
  const ctx = loadEngine();
  assert.equal(evalCell(ctx, '=SPELLNUMBER(100, IN)'), '#VALUE!');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(100,"US")'), '#VALUE!');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(100, GB)'), '#VALUE!');
  assert.equal(evalCell(ctx, '=SPELLNUMBER(100, YEN)'), '#VALUE!');
});

test('fx catalog hint lists both names for each style', function () {
  const ctx = loadEngine();
  const item = ctx.fxFindName('SPELLNUMBER');
  assert.ok(item);
  assert.ok(item.hint.indexOf('INDIA/INR') !== -1);
  assert.ok(item.hint.indexOf('USA/USD') !== -1);
  assert.ok(item.hint.indexOf('UK/GBP') !== -1);
});
