#!/usr/bin/env node
/* SH41: drawn rows take their height from the prefix sums, so the drawn block matches the
 * scroll box (an opened file no longer shows ~14 rows then blank grid); a tighter wrap
 * estimate; renderViewport always clears SHEET_VIEW.inside. vm + a tiny DOM stub, no browser.
 *   node --test apps/office/spreadsheet/test-sh41-row-heights.cjs
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const live = (src) => src.replace(/<!--[\s\S]*?-->/g, '');

/* Minimal elements: enough for buildVirtualTable (createElement, appendChild, style, dataset). */
function node(tag) {
  const n = {
    tagName: String(tag).toUpperCase(), children: [], style: {}, dataset: {}, className: '', id: '',
    textContent: '', colSpan: 1, title: '',
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    addEventListener() {},
    querySelector(sel) {
      if (sel.indexOf('table') === 0) return find(this, (x) => x.tagName === 'TABLE');
      return null;
    },
    querySelectorAll(sel) {
      if (sel === 'tr[data-r]') return all(this, (x) => x.tagName === 'TR' && x.dataset.r != null);
      if (sel === 'col') return all(this, (x) => x.tagName === 'COL');
      return [];
    }
  };
  Object.defineProperty(n, 'innerHTML', { get() { return ''; }, set() { n.children = []; } });
  return n;
}
function find(root, fn) { for (const c of root.children) { if (fn(c)) return c; const f = find(c, fn); if (f) return f; } return null; }
function all(root, fn, out) { out = out || []; for (const c of root.children) { if (fn(c)) out.push(c); all(c, fn, out); } return out; }

function load() {
  const wrap = node('div'); wrap.id = 'sheet-wrap'; wrap.clientHeight = 615; wrap.clientWidth = 390; wrap.scrollTop = 0; wrap.scrollLeft = 0;
  const ids = { 'sheet-wrap': wrap };
  const document = {
    head: node('head'), body: node('body'),
    createElement: (t) => node(t),
    getElementById(id) {
      if (ids[id]) return ids[id];
      return find(wrap, (x) => x.id === id);
    },
    querySelector(sel) { return sel.indexOf('table') === 0 ? find(wrap, (x) => x.tagName === 'TABLE') : null; },
    querySelectorAll() { return []; },
    addEventListener() {}
  };
  const ctx = {
    console, Date, Math, Number, String, Boolean, Array, Object, Proxy, JSON, parseInt, parseFloat, isNaN, isFinite,
    RegExp, Error, TypeError, NaN, Infinity, undefined, setTimeout, clearTimeout,
    document, window: { addEventListener() {}, removeEventListener() {} }, requestAnimationFrame: (fn) => setTimeout(fn, 0)
  };
  vm.createContext(ctx);
  const files = ['spreadsheet_config.js', 'spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_refs.js',
    'spreadsheet_state.js', 'spreadsheet_format.js', 'spreadsheet_grid.js', 'spreadsheet_resize.js'];
  vm.runInContext(files.map(read).join('\n;\n'), ctx, { filename: 'spreadsheet-sh41.js' });
  /* The cells themselves are not under test: plain stand-ins for the per-cell builders and painters. */
  vm.runInContext([
    'injectSheetCss = function () {};',
    'captureSheetEdit = function () { return null; };',
    'restoreSheetEdit = function () {};',
    'makeColHead = function (c) { var th = document.createElement("th"); th.dataset.c = String(c); return th; };',
    'makeDataCell = function (r, c) { var td = document.createElement("td"); td.dataset.r = String(r); td.dataset.c = String(c); return td; };',
    'layoutFrozenVirtual = function () {};',
    'paintRendered = function () {};',
    'highlightSel = function () {};',
    'applyMerges = function () {};',
    'dataRenderFilterButtons = function () {};'
  ].join('\n'), ctx);
  ctx.emptyWorkbook();
  return { ctx, wrap };
}
function setCell(ctx, a1, text) {
  const a = ctx.parseAddr(a1);
  ctx.workbook.sheets[0].cells[a.r][a.c].formula = String(text);
  ctx.workbook.sheets[0].cells[a.r][a.c].value = String(text);
}
/* A sheet like the bug report: 60 rows, every 5th with a long note that wraps. */
function fill(ctx) {
  for (let r = 1; r <= 60; r++) {
    setCell(ctx, 'A' + r, 'item' + r);
    setCell(ctx, 'B' + r, r % 5 === 0 ? 'long note text that wraps '.repeat(3) : 'short');
    setCell(ctx, 'C' + r, '2026-01-' + String(10 + (r % 18)));
  }
}
function drawn(wrap) { return all(wrap, (x) => x.tagName === 'TR' && x.dataset.r != null); }
function spacer(wrap) { return find(wrap, (x) => x.tagName === 'TR' && x.className === 'sheet-spacer'); }
const px = (s) => parseFloat(s || '0');

test('every drawn row gets its height from the prefix (sheetRowSpanPx)', () => {
  const { ctx, wrap } = load();
  fill(ctx);
  ctx.renderViewport(true);
  const m = ctx.SHEET_VIEW.met;
  const rows = drawn(wrap);
  assert.ok(rows.length > 0);
  let tall = 0;
  for (const tr of rows) {
    const r = +tr.dataset.r;
    assert.strictEqual(px(tr.style.height), m.rowY[r + 1] - m.rowY[r], 'row ' + r);
    assert.strictEqual(px(tr.style.height), ctx.sheetRowSpanPx(m, r));
    if (px(tr.style.height) > 30) tall++;
  }
  assert.ok(tall > 0, 'long notes fit taller than 30px');
});

test('drawn block (spacer + rows) ends where the prefix says, so nothing is blank below', () => {
  const { ctx, wrap } = load();
  fill(ctx);
  for (const top of [0, 900, 2000]) {
    wrap.scrollTop = top;
    ctx.renderViewport(true);
    const m = ctx.SHEET_VIEW.met, spec = ctx.SHEET_VIEW.spec;
    const sp = spacer(wrap);
    let sum = sp ? px(sp.style.height) : 0;
    for (const tr of drawn(wrap)) sum += px(tr.style.height);
    assert.strictEqual(sum, m.rowY[spec.r1 + 1] - m.rowY[spec.fzR], 'scrollTop ' + top);
    /* and the drawn rows cover the visible window */
    assert.ok(m.rowY[spec.r1 + 1] >= Math.min(m.totalH, top + wrap.clientHeight - m.headH), 'covers view at ' + top);
  }
});

test('sheetRowSpanPx: prefix difference, 0 outside', () => {
  const { ctx } = load();
  const m = { rowY: [0, 30, 76, 76, 106] };
  assert.strictEqual(ctx.sheetRowSpanPx(m, 0), 30);
  assert.strictEqual(ctx.sheetRowSpanPx(m, 1), 46);
  assert.strictEqual(ctx.sheetRowSpanPx(m, 2), 0);   // hidden row
  assert.strictEqual(ctx.sheetRowSpanPx(m, 4), 0);
  assert.strictEqual(ctx.sheetRowSpanPx(m, -1), 0);
  assert.strictEqual(ctx.sheetRowSpanPx(null, 0), 0);
});

test('wrapTextOverflows: dates and short values stay one line, long text and line breaks wrap', () => {
  const { ctx } = load();
  assert.strictEqual(ctx.wrapTextOverflows('2026-01-03', 100, 16), false);
  assert.strictEqual(ctx.wrapTextOverflows('12,345.67', 100, 16), false);
  assert.strictEqual(ctx.wrapTextOverflows('Person 13', 100, 16), false);
  assert.strictEqual(ctx.wrapTextOverflows('', 100, 16), false);
  assert.strictEqual(ctx.wrapTextOverflows(null, 100, 16), false);
  assert.strictEqual(ctx.wrapTextOverflows('long note text that wraps long note text that wraps long note text that wraps', 100, 16), true);
  assert.strictEqual(ctx.wrapTextOverflows('a\nb', 400, 16), true);
  assert.strictEqual(ctx.wrapTextOverflows('WWWWWWWW', 100, 16), true);   // wide capitals
  assert.strictEqual(ctx.wrapTextOverflows('2026-01-03', 60, 16), true);  // narrow column
  assert.ok(ctx.wrapTextWidthEm('1234') > ctx.wrapTextWidthEm('....'));
  assert.ok(ctx.wrapTextWidthEm('漢字') === 2);
});

test('a date-only row fits at the default 30px (was 46px with the 0.6em estimate)', () => {
  const { ctx } = load();
  setCell(ctx, 'A1', '2026-01-03');
  assert.strictEqual(ctx.autoFitRowHeight(0), 30);
});

test('renderViewport clears SHEET_VIEW.inside even when a step throws', () => {
  const { ctx } = load();
  vm.runInContext('paintRendered = function () { throw new Error("boom"); };', ctx);
  assert.throws(() => ctx.renderViewport(true), /boom/);
  assert.strictEqual(ctx.SHEET_VIEW.inside, false);
  vm.runInContext('paintRendered = function () {};', ctx);
  ctx.renderViewport(true);
  assert.strictEqual(ctx.SHEET_VIEW.inside, false);
});

test('wiring: version SH41, ?v= tokens, readme, old code kept as comments', () => {
  const html = read('spreadsheet.html');
  assert.ok(html.indexOf('<title>Spreadsheet SH41</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH41) <title>Spreadsheet SH40a</title> -->') !== -1);
  const l = live(html);
  /* (before SH42) for (const f of ['spreadsheet_grid.js', 'spreadsheet_resize.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH41') !== -1, f); */
  /* (before SH44) for (const f of ['spreadsheet_grid.js', 'spreadsheet_resize.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH41') !== -1 || (f === 'spreadsheet_settings.js' && l.indexOf(f + '?v=SH42') !== -1), f);   // SH42: settings */
  /* (before SH45) for (const f of ['spreadsheet_grid.js', 'spreadsheet_resize.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH41') !== -1 || (f === 'spreadsheet_settings.js' && (l.indexOf(f + '?v=SH42') !== -1 || l.indexOf(f + '?v=SH44') !== -1)), f);   // SH42: settings */
  for (const f of ['spreadsheet_grid.js', 'spreadsheet_resize.js', 'spreadsheet_settings.js']) assert.ok(l.indexOf(f + '?v=SH41') !== -1 || (f === 'spreadsheet_settings.js' && (l.indexOf(f + '?v=SH42') !== -1 || l.indexOf(f + '?v=SH44') !== -1 || l.indexOf(f + '?v=SH45') !== -1)), f);   // SH42: settings
  assert.ok(read('spreadsheet_settings.js').indexOf('var SHEET_VERSION = "SH41";') !== -1);
  const grid = read('spreadsheet_grid.js');
  assert.ok(grid.indexOf('/* (before SH41) function buildVirtualTable(spec) { */') !== -1);
  assert.ok(grid.indexOf('buildVirtualTable(spec, m);') !== -1);
  assert.ok(/finally \{\s*SHEET_VIEW\.inside = false;/.test(grid));
  assert.ok(read('spreadsheet_resize.js').indexOf('(before SH41) True when the text needs more than one line') !== -1);
  assert.ok(read('spreadsheet_readme.md').indexOf('## SH41') !== -1);
});
