#!/usr/bin/env node
/* SH46: render cache. The automatic column width is read once per render pass, automatic
   row heights are memoised per sheet (key: version + widths + wrap / font settings), and
   renders inside sheetRenderBatch collapse to one. Real modules in a vm with a tiny DOM stub;
   every cached prefix is compared with the uncached computation.
   Run: node --test apps/office/spreadsheet/test-sh46-render-cache.cjs */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const live = (src) => src.replace(/<!--[\s\S]*?-->/g, '');
const plain = (x) => JSON.parse(JSON.stringify(x));

function load() {
  const files = ['spreadsheet_config.js', 'spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_refs.js',
    'spreadsheet_state.js', 'spreadsheet_format.js', 'spreadsheet_style.js', 'spreadsheet_resize.js', 'spreadsheet_grid.js'];
  const wrapEl = { clientWidth: 1200, clientHeight: 700, scrollTop: 0, scrollLeft: 0, addEventListener() {} };
  const ctx = {
    console, Date, Math, Number, String, Boolean, Array, Object, Proxy, JSON, Promise, Map, WeakMap, Uint8Array, ArrayBuffer,
    parseInt, isNaN, isFinite, RegExp, Error, TypeError, NaN, Infinity, undefined, setTimeout, clearTimeout,
    document: {
      addEventListener() {}, getElementById(id) { return id === 'sheet-wrap' ? wrapEl : null; }, querySelector() { return null; },
      querySelectorAll() { return []; }, documentElement: {}, body: { classList: { toggle() {} }, style: { setProperty() {} } },
      createElement() { return { style: {}, dataset: {}, classList: { add() {}, toggle() {} }, appendChild() {}, addEventListener() {}, setAttribute() {} }; }
    },
    window: {}, SHEET_INIT: [], getComputedStyle: () => ({ getPropertyValue: () => '' })
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(files.map(read).join('\n;\n'), ctx, { filename: 'spreadsheet-sh46.js' });
  ctx.emptyWorkbook();
  return { ctx, wrapEl };
}

const LONG = 'A long note that will wrap across several lines in a normal column width for sure';
function fill(ctx, rows) {
  for (let r = 0; r < rows; r++) {
    ctx.cells[r][0].formula = String(r);
    ctx.cells[r][1].formula = r % 7 === 0 ? LONG : 'note ' + r;
    ctx.cells[r][2].formula = '=A' + (r + 1) + '*2';
  }
  ctx.recalcAll();
}
/* The pre-SH46 computation: every row through autoFitRowHeight, no memo, no pass. */
function uncachedRowY(ctx) {
  const y = [0];
  let acc = 0;
  for (let r = 0; r < ctx.ROWS; r++) {
    let h;
    if (ctx.rowHidden(r)) h = 0;
    else {
      const m = ctx.sheetHeights() && ctx.sheetHeights()[r];
      h = typeof m === 'number' && m > 0 ? m : ctx.autoFitRowHeight(r);
    }
    acc += h; y.push(acc);
  }
  return y;
}
const rowY = (ctx) => plain(ctx.sheetPrefix().rowY);

test('pure: width signature, memo key and memo reuse', () => {
  const { ctx } = load();
  assert.equal(ctx.sheetWidthSig([null, 80, null], [false, false, true], 100, 3), '100:a,80,h');
  const k1 = ctx.rowFitKey(3, '100:a', true, 16, { auto: 30, min: 8, max: 400 });
  assert.notEqual(k1, ctx.rowFitKey(4, '100:a', true, 16, { auto: 30, min: 8, max: 400 }));
  assert.notEqual(k1, ctx.rowFitKey(3, '100:a', false, 16, { auto: 30, min: 8, max: 400 }));
  assert.notEqual(k1, ctx.rowFitKey(3, '100:a', true, 20, { auto: 30, min: 8, max: 400 }));
  assert.notEqual(k1, ctx.rowFitKey(3, '90:a', true, 16, { auto: 30, min: 8, max: 400 }));
  const g = [], g2 = [];
  const m = ctx.rowFitMemoFor(null, k1, g);
  m.h[0] = 45;
  assert.equal(ctx.rowFitMemoFor(m, k1, g), m);           // hit
  assert.notEqual(ctx.rowFitMemoFor(m, k1 + 'x', g), m);  // key changed
  assert.notEqual(ctx.rowFitMemoFor(m, k1, g2), m);       // other grid
  assert.equal(ctx.rowFitMemoFor(m, k1, g2).h.length, 0);
});

test('cached prefix equals the uncached computation; a second prefix is all hits', () => {
  const { ctx } = load();
  fill(ctx, 400);
  const a = rowY(ctx);
  assert.deepEqual(a, uncachedRowY(ctx));
  assert.ok(a[1] - a[0] > 30, 'row 1 (long text) is taller than one line');
  const fits = ctx.SHEET_RCACHE.stats.rowFit;
  assert.deepEqual(rowY(ctx), a);
  assert.equal(ctx.SHEET_RCACHE.stats.rowFit, fits, 'no row re-fitted');
});

test('autoColWidth runs once per pass, not once per cell', () => {
  const { ctx } = load();
  fill(ctx, 1000);
  let n0 = ctx.SHEET_RCACHE.stats.autoColWidth;
  ctx.sheetRenderDirty();
  ctx.sheetPrefix();
  const perPrefix = ctx.SHEET_RCACHE.stats.autoColWidth - n0;
  assert.ok(perPrefix <= 1, 'autoColWidth calls per prefix: ' + perPrefix);
  /* a paint loop (cellTextWidthPx per cell) inside one render pass */
  n0 = ctx.SHEET_RCACHE.stats.autoColWidth;
  ctx.sheetPassBegin();
  for (let r = 0; r < 40; r++) for (let c = 0; c < 20; c++) ctx.cellTextWidthPx(null, r, c);
  ctx.sheetPassEnd();
  assert.equal(ctx.SHEET_RCACHE.stats.autoColWidth - n0, 1);
  /* outside a pass it is still read live (one-off callers) */
  n0 = ctx.SHEET_RCACHE.stats.autoColWidth;
  ctx.colWidthPx(3); ctx.colWidthPx(4);
  assert.equal(ctx.SHEET_RCACHE.stats.autoColWidth - n0, 2);
});

test('an edit (undoRecord / afterChange / recalc bump the version) re-fits and matches uncached', () => {
  const { ctx } = load();
  fill(ctx, 50);
  const before = rowY(ctx);
  ctx.cells[3][1].formula = LONG + ' ' + LONG;
  ctx.recalcAll();                 // recalcAll bumps the version
  const after = rowY(ctx);
  assert.deepEqual(after, uncachedRowY(ctx));
  assert.ok(after[4] - after[3] > before[4] - before[3]);
  ctx.cells[3][1].style = Object.assign(ctx.defaultStyle(), { fontSize: 30 });
  ctx.sheetRenderDirty();
  assert.deepEqual(rowY(ctx), uncachedRowY(ctx));
});

test('width change, hidden column and window width change the key without a bump', () => {
  const { ctx, wrapEl } = load();
  fill(ctx, 50);
  rowY(ctx);
  ctx.colWidths[1] = 40;
  const a = rowY(ctx);
  assert.deepEqual(a, uncachedRowY(ctx));
  ctx.hiddenCols[1] = true;
  assert.deepEqual(rowY(ctx), uncachedRowY(ctx));
  ctx.hiddenCols[1] = false; ctx.colWidths[1] = null;
  wrapEl.clientWidth = 400;        // narrower window: smaller automatic width
  assert.deepEqual(rowY(ctx), uncachedRowY(ctx));
});

test('row insert / delete, hidden rows and hand-set heights match uncached', () => {
  const { ctx } = load();
  fill(ctx, 60);
  rowY(ctx);
  ctx.cells.splice(2, 0, ctx.makeSparseRow()); ctx.cells.length = ctx.ROWS;   // insert row 3
  ctx.recalcAll();
  assert.deepEqual(rowY(ctx), uncachedRowY(ctx));
  ctx.cells.splice(0, 1); ctx.cells.push(ctx.makeSparseRow());                // delete row 1
  ctx.recalcAll();
  assert.deepEqual(rowY(ctx), uncachedRowY(ctx));
  ctx.hiddenRows[7] = true;                                                  // read live, no bump
  ctx.workbook.sheets[0].heights[8] = 77;
  const y = rowY(ctx);
  assert.deepEqual(y, uncachedRowY(ctx));
  assert.equal(y[8] - y[7], 0);
  assert.equal(y[9] - y[8], 77);
});

test('each sheet keeps its own memo; switching back without edits is all hits', () => {
  const { ctx } = load();
  fill(ctx, 30);
  ctx.workbook.sheets.push(ctx.makeSheet('Two'));
  const a0 = rowY(ctx);
  ctx.workbook.active = 1; ctx.bindActiveSheet();
  const a1 = rowY(ctx);
  assert.notDeepEqual(a0, a1);
  ctx.workbook.active = 0; ctx.bindActiveSheet();
  const fits = ctx.SHEET_RCACHE.stats.rowFit;
  assert.deepEqual(rowY(ctx), a0);
  assert.equal(ctx.SHEET_RCACHE.stats.rowFit, fits);
});

test('sheetRenderBatch: three render requests become one full render at the end', () => {
  const { ctx } = load();
  let n = 0;
  ctx.renderViewportCore = () => { n++; };
  ctx.sheetRenderBatch(() => {
    ctx.renderViewport(true); ctx.renderViewport(false);
    ctx.sheetRenderBatch(() => { ctx.renderViewport(true); });   // nested
    assert.equal(n, 0);
  });
  assert.equal(n, 1);
  ctx.renderViewport(false);
  assert.equal(n, 2);                                            // outside a batch: immediate
  ctx.sheetRenderBatch(() => {});
  assert.equal(n, 2);                                            // nothing asked, nothing drawn
});

test('wiring: version SH46, ?v= tokens, readme, old code kept as comments', () => {
  const html = read('spreadsheet.html');
  assert.ok(html.indexOf('<title>Spreadsheet SH46</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH46) <title>Spreadsheet SH49</title> -->') !== -1);
  const l = live(html);
  for (const f of ['spreadsheet_grid.js', 'spreadsheet_resize.js', 'spreadsheet_logic.js', 'spreadsheet_sheets.js', 'spreadsheet_undo.js',
    'spreadsheet_formula.js', 'spreadsheet_settings.js', 'spreadsheet_xlsx.js']) assert.ok(l.indexOf(f + '?v=SH46') !== -1, f);
  assert.ok(read('spreadsheet_settings.js').indexOf('var SHEET_VERSION = "SH46";') !== -1);
  assert.ok(read('spreadsheet_resize.js').indexOf('/* (before SH46) return autoFitRowHeight(r); */') !== -1);
  assert.ok(read('spreadsheet_grid.js').indexOf('/* (before SH46) function renderViewport(force) { */') !== -1);
  assert.ok(read('spreadsheet_readme.md').indexOf('## SH46') !== -1);
});
