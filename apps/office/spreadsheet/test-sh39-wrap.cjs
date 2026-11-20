#!/usr/bin/env node
'use strict';
/* SH39: wrap is on by default. effectiveWrap, the explicit-off toggle, auto-fit of long text,
 * hand-set heights kept, Fit row height, the setting off (old behaviour), .hos / XLSX style keys.
 *   node --test apps/office/spreadsheet/test-sh39-wrap.cjs
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dir = __dirname;
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

function load(files, extra) {
  const ctx = Object.assign({
    console, Math, Number, String, Boolean, Array, Object, JSON, parseInt, isNaN, isFinite, RegExp, Error,
    CFG: { rowHeight: { auto: 30, min: 8, max: 400 }, colWidth: { auto: 100, min: 30, rowHead: 40 } },
    CLS: { table: 'sheet', rowHeadCol: 'row-head', dataCol: 'data', colGrip: 'col-grip', rowGrip: 'row-grip' },
    COLS: 26, ROWS: 100,
    SHEET_INIT: { push() {} },
    document: { getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; }, addEventListener() {} },
    window: { addEventListener() {} }
  }, extra || {});
  vm.createContext(ctx);
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  return ctx;
}

/* A one-sheet grid: cells[r][c] = { value, style }. */
function grid(ctx, list, heights) {
  const cells = [];
  for (let r = 0; r < ctx.ROWS; r++) cells.push([]);
  for (const it of list) cells[it.r][it.c] = { formula: '', value: it.v, style: it.st || {} };
  ctx.cells = cells;
  ctx.colWidths = [];
  ctx.hiddenCols = [];
  ctx.workbook = { active: 0, sheets: [{ heights: heights || [], merges: [] }] };
  ctx.realCellAt = (cs, r, c) => (cs[r] && cs[r][c]) || null;
  ctx.cellStyle = (r, c) => (cells[r][c] && cells[r][c].style) || {};
  return cells;
}

const LONG = 'This is a long sentence that is clearly wider than one hundred pixel column';

test('effectiveWrap: explicit on / off win, else the default (missing = on)', () => {
  const ctx = load(['spreadsheet_resize.js']);
  assert.strictEqual(ctx.effectiveWrap({}, true), true);
  assert.strictEqual(ctx.effectiveWrap({}, undefined), true);
  assert.strictEqual(ctx.effectiveWrap(null, true), true);
  assert.strictEqual(ctx.effectiveWrap({}, false), false);
  assert.strictEqual(ctx.effectiveWrap({ wrap: false, nowrap: false }, true), true, 'old saved wrap:false is "not set"');
  assert.strictEqual(ctx.effectiveWrap({ wrap: true }, false), true);
  assert.strictEqual(ctx.effectiveWrap({ wrap: false, nowrap: true }, true), false);
});

test('toggle: off on a default-wrapped cell stores nowrap, keeps wrap false', () => {
  const ctx = load(['spreadsheet_resize.js']);
  const st = { wrap: false, nowrap: false };
  const on = !ctx.effectiveWrap(st, true);
  assert.strictEqual(on, false);
  ctx.setExplicitWrap(st, on);
  assert.deepStrictEqual({ wrap: st.wrap, nowrap: st.nowrap }, { wrap: false, nowrap: true });
  assert.strictEqual(ctx.effectiveWrap(st, true), false);
  ctx.setExplicitWrap(st, !ctx.effectiveWrap(st, true));
  assert.deepStrictEqual({ wrap: st.wrap, nowrap: st.nowrap }, { wrap: true, nowrap: false });
});

test('wrapTextOverflows: short text short-circuits, long text and breaks overflow', () => {
  const ctx = load(['spreadsheet_resize.js']);
  assert.strictEqual(ctx.wrapTextOverflows('', 100, 16), false);
  assert.strictEqual(ctx.wrapTextOverflows('Short', 100, 16), false);
  assert.strictEqual(ctx.wrapTextOverflows(LONG, 100, 16), true);
  assert.strictEqual(ctx.wrapTextOverflows('a\nb', 100, 16), true);
  assert.strictEqual(ctx.wrapTextOverflows(LONG, 2000, 16), false);
});

test('autofit: long unwrapped text grows the row by default; short rows stay 30', () => {
  const ctx = load(['spreadsheet_resize.js']);
  grid(ctx, [{ r: 0, c: 0, v: LONG }, { r: 1, c: 0, v: 'Short' }, { r: 1, c: 1, v: 12345 }]);
  assert.ok(ctx.usedRowHeight(0) > 30, 'long text row grows: ' + ctx.usedRowHeight(0));
  assert.strictEqual(ctx.usedRowHeight(0), ctx.estimateRowHeight(LONG, { wrap: true, widthPx: 100, fontSize: 16, automatic: true, floor: 30 }));
  assert.strictEqual(ctx.usedRowHeight(1), 30);
  assert.strictEqual(ctx.usedRowHeight(2), 30, 'empty row');
});

test('autofit: explicit off keeps one line; tallest cell wins; max clamp', () => {
  const ctx = load(['spreadsheet_resize.js']);
  grid(ctx, [
    { r: 0, c: 0, v: LONG, st: { nowrap: true } },
    { r: 1, c: 0, v: 'abc def ghi jkl mno pqr' }, { r: 1, c: 1, v: LONG },
    { r: 2, c: 0, v: LONG.repeat(40) }
  ]);
  assert.strictEqual(ctx.usedRowHeight(0), 30);
  assert.strictEqual(ctx.usedRowHeight(1), ctx.estimateRowHeight(LONG, { wrap: true, widthPx: 100, automatic: true }));
  assert.strictEqual(ctx.usedRowHeight(2), 400);
});

test('hand-set heights stay; Fit row height clears them', () => {
  const ctx = load(['spreadsheet_resize.js']);
  const heights = [];
  heights[0] = 22; heights[3] = 50;
  grid(ctx, [{ r: 0, c: 0, v: LONG }], heights);
  assert.strictEqual(ctx.usedRowHeight(0), 22);
  assert.strictEqual(ctx.clearRowHeights(heights, 3, 0), 2);
  assert.strictEqual(heights[0], null);
  assert.strictEqual(heights[3], null);
  assert.ok(ctx.usedRowHeight(0) > 30);
  assert.strictEqual(ctx.clearRowHeights(null, 0, 1), 0);
});

test('fitSelectedRowHeights clears the selected rows, records undo, saves', () => {
  const calls = [];
  const ctx = load(['spreadsheet_resize.js'], {
    selR: 1, extR: 2,
    undoRecord: (t) => calls.push('undo:' + t),
    saveStore: () => calls.push('save'),
    renderViewport: () => calls.push('render')
  });
  const heights = [40, 41, 42, 43];
  grid(ctx, [], heights);
  ctx.selRange = () => ({ r1: 1, r2: 2, c1: 0, c2: 25 });
  assert.strictEqual(ctx.fitSelectedRowHeights(), 2);
  assert.deepStrictEqual(Array.from(heights), [40, null, null, 43]);
  assert.ok(calls.indexOf('undo:row-height') === 0 && calls.indexOf('save') !== -1);
});

test('setting off gives the old behaviour (only explicit wrap or breaks grow rows)', () => {
  const ctx = load(['spreadsheet_resize.js'], { SHEET_SETTINGS: { s: { wrapDefault: false } } });
  assert.strictEqual(ctx.sheetWrapDefault(), false);
  grid(ctx, [{ r: 0, c: 0, v: LONG }, { r: 1, c: 0, v: LONG, st: { wrap: true } }, { r: 2, c: 0, v: 'a\nb\nc' }]);
  assert.strictEqual(ctx.usedRowHeight(0), 30);
  assert.ok(ctx.usedRowHeight(1) > 30);
  assert.ok(ctx.usedRowHeight(2) > 30);
  ctx.SHEET_SETTINGS.s.wrapDefault = true;
  assert.ok(ctx.usedRowHeight(0) > 30);
  ctx.SHEET_SETTINGS = null;
  assert.strictEqual(ctx.sheetWrapDefault(), true, 'no settings = on');
});

test('row context menu ends with Fit row height', () => {
  let fit = 0;
  const ctx = load(['spreadsheet_rows.js'], { fitSelectedRowHeights: () => { fit++; } });
  const items = ctx.gridContextMenuItems('row');
  const last = items[items.length - 1];
  assert.strictEqual(last.id, 'row-fit');
  assert.strictEqual(last.label, 'Fit row height');
  assert.ok(items[items.length - 2].sep);
  last.run();
  assert.strictEqual(fit, 1);
  assert.ok(!ctx.gridContextMenuItems('col').some((it) => it.id === 'row-fit'));
});

test('.hos keeps explicit off; default cells write no wrap keys', () => {
  const Hos = require('./spreadsheet_hos.js');
  const back = Hos.parse(Hos.stringify({ name: 'W', sheets: [{ name: 'S', cells: [
    { r: 0, c: 0, formula: 'x', value: 'x', style: { wrap: false, nowrap: true } },
    { r: 0, c: 1, formula: 'y', value: 'y', style: { wrap: false, nowrap: false } },
    { r: 0, c: 2, formula: 'z', value: 'z', style: { wrap: true } }
  ] }] }));
  const packed = JSON.parse(Hos.stringify({ name: 'W', sheets: [{ name: 'S', cells: [
    { r: 0, c: 1, formula: 'y', value: 'y', style: { wrap: false, nowrap: false } }
  ] }] }));
  const cells = packed.sheets[0].cells;
  assert.ok(!cells[0].style || (!('wrap' in cells[0].style) && !('nowrap' in cells[0].style)));
  const s = back.sheets[0];
  const at = (c) => (Array.isArray(s.cells[0]) ? s.cells[0][c] : s.cells.find((x) => x.r === 0 && x.c === c));
  assert.strictEqual(at(0).style.nowrap, true);
  assert.ok(!at(1).style || !at(1).style.nowrap, 'default cell has no nowrap');
  assert.strictEqual(at(2).style.wrap, true);
});

test('XLSX export: explicit off writes no wrapText', () => {
  const ctx = load(['spreadsheet_xlsx.js']);
  const off = ctx.xlsxCellStyle({ wrap: false, nowrap: true });
  assert.ok(!off || !off.alignment || !off.alignment.wrapText);
  assert.strictEqual(ctx.xlsxCellStyle({ wrap: true }).alignment.wrapText, true);
});

test('wiring: render, toolbar, Alt+Enter, settings, version', () => {
  const style = read('spreadsheet_style.js');
  assert.ok(style.indexOf('effectiveWrap(st, typeof sheetWrapDefault') !== -1);
  assert.ok(style.indexOf('setExplicitWrap(st, on)') !== -1);
  assert.ok(style.indexOf('(before SH39)') !== -1);
  assert.ok(read('spreadsheet_edit.js').indexOf('!effectiveWrap(st, sheetWrapDefault())') !== -1);
  const set = read('spreadsheet_settings.js');
  assert.ok(set.indexOf('wrapDefault: true') !== -1);
  assert.ok(set.indexOf('label: "Wrap text by default"') !== -1);
  assert.ok(set.indexOf('var SHEET_VERSION = "SH39";') !== -1);
  assert.ok(read('spreadsheet_config.js').indexOf('nowrap: false') !== -1);
  const html = read('spreadsheet.html');
  assert.ok(html.indexOf('<title>Spreadsheet SH39</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH39) <title>Spreadsheet SH38</title> -->') !== -1);
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const f of ['spreadsheet_config.js', 'spreadsheet_settings.js', 'spreadsheet_edit.js', 'spreadsheet_style.js', 'spreadsheet_rows.js', 'spreadsheet_resize.js', 'spreadsheet_hos.js']) {
    /* (before SH40) assert.ok(live.indexOf(f + '?v=SH39') !== -1, f); */
    assert.ok(live.indexOf(f + '?v=SH39') !== -1 || live.indexOf(f + '?v=SH40') !== -1, f);
  }
  assert.ok(read('spreadsheet_readme.md').indexOf('## SH39') !== -1);
});
