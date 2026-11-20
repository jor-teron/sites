#!/usr/bin/env node
/* SH37: File menu like Writer: order, one Open... routed by extension (handle kept),
 * one Export... chooser, DW16 height. Loads the classic script via vm, no browser.
 *   node --test apps/office/spreadsheet/test-sh37-filemenu.cjs
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

function load(extra) {
  const ctx = Object.assign({ console, Promise, Number, String, Math, isFinite }, extra || {});
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('spreadsheet_filemenu.js'), ctx, { filename: 'spreadsheet_filemenu.js' });
  return ctx;
}

test('openKind routes by extension', () => {
  const M = load().SHEET_FILEMENU;
  assert.strictEqual(M.openKind('Book.hos'), 'hos');
  assert.strictEqual(M.openKind('a.XLSX'), 'workbook');
  assert.strictEqual(M.openKind('a.xlsm'), 'workbook');
  assert.strictEqual(M.openKind('a.xls'), 'workbook');
  assert.strictEqual(M.openKind('a.ods'), 'workbook');
  assert.strictEqual(M.openKind(' data.CSV '), 'csv');
  assert.strictEqual(M.openKind('notes.txt'), null);
  assert.strictEqual(M.openKind('noext'), null);
  assert.strictEqual(M.openKind('dot.'), null);
  assert.strictEqual(M.openKind(''), null);
  assert.strictEqual(M.openKind(null), null);
});

test('keepsHandle: write-back formats keep the handle, .xls does not', () => {
  const M = load().SHEET_FILEMENU;
  ['a.hos', 'a.xlsx', 'a.xlsm', 'a.ods', 'a.csv'].forEach((n) => assert.strictEqual(M.keepsHandle(n), true, n));
  ['a.xls', 'a.txt', ''].forEach((n) => assert.strictEqual(M.keepsHandle(n), false, n));
});

test('openPicked sends each kind to its existing opener', async () => {
  const calls = [];
  const ctx = load({
    SHEET_HOS: { openFile: (f, dest) => { calls.push(['hos', f.name, dest]); return Promise.resolve(true); } },
    SHEET_SAVEFMT: { openAny: (f, o) => { calls.push(['any', f.name, o]); return true; }, inHub: () => false },
    setStatus: (m) => calls.push(['status', m])
  });
  const M = ctx.SHEET_FILEMENU;
  const h = { name: 'Book.hos' };
  await M.openPicked({ name: 'Book.hos' }, h);
  await M.openPicked({ name: 'Plain.hos' });
  await M.openPicked({ name: 'Q.xlsx' }, { name: 'Q.xlsx' });
  await M.openPicked({ name: 'Old.xls' }, { name: 'Old.xls' });
  await M.openPicked({ name: 'D.csv' }, { name: 'D.csv' });
  const r = await M.openPicked({ name: 'x.txt' });
  assert.strictEqual(r, false);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(calls)), [
    ['hos', 'Book.hos', { kind: 'handle', handle: { name: 'Book.hos' }, name: 'Book.hos' }],
    ['hos', 'Plain.hos', null],
    ['any', 'Q.xlsx', { handle: { name: 'Q.xlsx' } }],
    ['any', 'Old.xls', {}],
    ['any', 'D.csv', { handle: { name: 'D.csv' } }],
    ['status', 'Choose a .hos, .xlsx, .xlsm, .xls, .ods or .csv file to open it']
  ]);
});

test('openMode: picker only outside the Hub and when the browser has it', () => {
  const M = load().SHEET_FILEMENU;
  assert.strictEqual(M.openMode({ showOpenFilePicker() {} }, false), 'picker');
  assert.strictEqual(M.openMode({ showOpenFilePicker() {} }, true), 'input');
  assert.strictEqual(M.openMode({}, false), 'input');
  assert.strictEqual(M.openMode(null, false), 'input');
  assert.strictEqual(M.openPickerFail({ name: 'AbortError' }), 'silent');
  assert.strictEqual(M.openPickerFail(new Error('x')), 'input');
  const acc = M.pickTypes()[0].accept;
  const exts = [].concat.apply([], Object.keys(acc).map((k) => Array.from(acc[k]))).sort();
  assert.deepStrictEqual(exts, Array.from(M.ACCEPT).sort());
});

test('menuMaxHeight matches Writer DW16 (min 160, 8px gap)', () => {
  const M = load().SHEET_FILEMENU;
  assert.strictEqual(M.menuMaxHeight(80, 900), 812);
  assert.strictEqual(M.menuMaxHeight(8, 600), 584);
  assert.strictEqual(M.menuMaxHeight(500, 600), 160);
  assert.strictEqual(M.menuMaxHeight('x', 400), 392);
  assert.strictEqual(M.menuMaxHeight(10, NaN), 160);
});

test('html: live File menu order, one Open..., one Export... chooser, labels', () => {
  const M = load().SHEET_FILEMENU;
  const html = read('spreadsheet.html');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  const start = live.indexOf('id="of-file-menu"');
  const end = live.indexOf('id="sheet-export-menu"');
  assert.ok(start > 0 && end > start);
  const menu = live.slice(start, end);
  const ids = [];
  menu.replace(/<button[^>]*\bid="([^"]+)"/g, (m, id) => { ids.push(id); return m; });
  /* (before SH38) assert.deepStrictEqual(ids, Array.from(M.ORDER)); SH38 fills the Rename and Delete slots. */
  /* (before SH40) assert.deepStrictEqual(ids.filter((id) => id !== 'btn-rename' && id !== 'btn-delete'),
    ['btn-clear', 'btn-open', 'btn-save', 'btn-save-as', 'btn-print', 'btn-export-menu', 'settingsMenuBtn']); */
  assert.deepStrictEqual(ids.filter((id) => id !== 'btn-rename' && id !== 'btn-delete' && id !== 'btn-close'),   // SH40 adds Close
    ['btn-clear', 'btn-open', 'btn-save', 'btn-save-as', 'btn-print', 'btn-export-menu', 'settingsMenuBtn']);
  assert.ok(menu.indexOf('<span>New</span>') !== -1);
  assert.ok(menu.indexOf('<span>Open...</span>') !== -1);
  assert.ok(menu.indexOf('<span>Print</span>') !== -1);
  assert.ok(menu.indexOf('<span>Export...</span>') !== -1);
  assert.ok(menu.indexOf('Functions') > menu.indexOf('settingsMenuBtn'));
  assert.ok(live.indexOf('id="btn-open-hos"') === -1, 'old Open .hos is commented out');
  assert.ok(html.indexOf('(before SH37) <button type="button" class="file-item" role="menuitem" id="btn-open-hos"') !== -1);
  const chooser = live.slice(end, live.indexOf('</div>', end));
  const ex = [];
  chooser.replace(/<button[^>]*\bid="([^"]+)"/g, (m, id) => { ex.push(id); return m; });
  assert.deepStrictEqual(ex, Array.from(M.EXPORTS));
  const m = /<input id="file-import" type="file" accept="([^"]*)"/.exec(live);
  assert.ok(m, 'file-import input kept');
  const acc = m[1].split(',');
  M.ACCEPT.forEach((e) => assert.ok(acc.indexOf(e) !== -1, e));
  assert.ok(/<label id="file-import-wrap" hidden/.test(live), 'fallback input is hidden');
});

test('css: File menu and chooser grow to the window bottom', () => {
  const css = read('spreadsheet_ribbon.css');
  assert.ok(/#of-file-menu,\s*#sheet-export-menu\s*\{/.test(css));
  assert.ok(css.indexOf('max-height: max(160px, calc(100dvh - var(--file-menu-top, 80px) - 8px));') !== -1);
  assert.ok(css.indexOf('overflow: auto;') !== -1);
  const shared = read('../shared/office-tools.css');
  assert.ok(shared.indexOf('.file-menu { width: 260px; max-height: calc(100vh - 80px); }') !== -1, 'shared css unchanged');
});

test('wiring: title, VERSION, ?v= tokens, script order, readme', () => {
  const html = read('spreadsheet.html');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(html.indexOf('<title>Spreadsheet SH37</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH37) <title>Spreadsheet SH36</title> -->') !== -1);
  assert.ok(read('spreadsheet_settings.js').indexOf('var SHEET_VERSION = "SH37";') !== -1);
  /* (before SH40) assert.ok(/spreadsheet_filemenu\.js\?v=SH3[7-9]/.test(live)); */
  assert.ok(/spreadsheet_filemenu\.js\?v=SH(3[7-9]|40)/.test(live));
  assert.ok(live.search(/spreadsheet_filemenu\.js/) > live.indexOf('spreadsheet_saveformat.js'));
  assert.ok(/spreadsheet_toolbar\.js\?v=SH3[7-9]/.test(live));
  assert.ok(/spreadsheet_ribbon\.css\?v=SH3[7-9]/.test(live));
  assert.ok(read('spreadsheet_readme.md').indexOf('## SH37') !== -1);
});
