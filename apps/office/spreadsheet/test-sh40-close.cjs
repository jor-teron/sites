#!/usr/bin/env node
/* SH40: File > Close and the "no workbook open" state (Writer DW18).
 * Pure checks plus the page wiring in a vm with small stubs (no browser): menu order,
 * spreadsheet_empty.js transitions, autosave blocked while empty, Close saves then
 * empties, Delete ends empty, the boot decision, the Close question, New while empty.
 *   node --test apps/office/spreadsheet/test-sh40-close.cjs
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
const E = require('./spreadsheet_empty.js');

/* FsRef.parse from shared/fs/fs_ref.js (browser IIFE that sets window.FsRef). */
function fsRef() {
  const w = {};
  vm.runInNewContext(fs.readFileSync(path.join(dir, '../../../shared/fs/fs_ref.js'), 'utf8'), { window: w, URLSearchParams, encodeURIComponent });
  return w.FsRef;
}
function store(init) {
  const m = Object.assign({}, init || {});
  return { m, getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } };
}
function el(id) {
  const attrs = {}, cls = new Set(), handlers = {};
  return {
    id, hidden: false, disabled: false, innerHTML: '', handlers,
    setAttribute(k, v) { attrs[k] = String(v); }, removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return k in attrs; }, getAttribute(k) { return k in attrs ? attrs[k] : null; },
    appendChild() {}, focus() {}, blur() {},
    addEventListener(t, fn) { (handlers[t] = handlers[t] || []).push(fn); },
    classList: { add(c) { cls.add(c); }, remove(c) { cls.delete(c); }, toggle(c, on) { if (on) cls.add(c); else cls.delete(c); }, contains(c) { return cls.has(c); } }
  };
}

/* A page with SHEET_HOS / SHEET_SAVEFMT fakes, then filemenu.js and empty.js as the page loads them. */
function page(o) {
  o = o || {};
  const ids = {};
  ['of-tabs', 'of-ribbon', 'sheet-formula-row', 'sheet-wrap', 'sheet-footer', 'sheet-empty-panel', 'sheet-empty-recent',
    'sheet-empty-new', 'sheet-empty-open', 'btn-rename', 'btn-save', 'btn-save-as', 'btn-print', 'btn-close', 'btn-delete',
    'btn-export-menu', 'btn-clear', 'btn-open'].forEach((id) => { ids[id] = el(id); });
  ids['sheet-empty-panel'].hidden = true;
  const body = el('body');
  const log = [];
  const winListeners = {}, docListeners = {};
  const hos = {
    dest: o.hosDest || null, skipWrite: false, applying: false, autoName: 'Untitled 1', lastHash: 'x',
    stem: (n) => String(n).replace(/\.hos$/i, ''),
    stemName: () => 'Book',
    detach() { log.push('detach'); this.dest = null; },
    save(opts) { log.push('save:' + JSON.stringify(opts || {})); return Promise.resolve({ ok: true, wrote: true }); },
    autosave(opts) { log.push('autosave:' + JSON.stringify(opts || {})); return Promise.resolve({ ok: true, wrote: true }); },
    openFile(file) { log.push('openFile:' + file.name); return Promise.resolve(file.name !== 'bad.hos'); },
    openName(n) { return this.openFile({ name: n }); },
    start() { log.push('start'); return Promise.resolve(true); },
    list() { return Promise.resolve(o.rows || []); },
    inHub: () => !!o.inHub, canLocal: () => !!o.inHub,
    prepareNew() { log.push('prepareNew'); return Promise.resolve('Untitled 2'); }
  };
  const fmt = {
    format: o.format || 'hos', dest: o.fmtDest || null,
    inHub: () => !!o.inHub, canLocal: () => !!o.inHub,
    currentName: () => 'Book',
    reset() { log.push('fmt.reset'); this.format = 'hos'; this.dest = null; },
    openCsvFile(f) { log.push('csv:' + f.name); return Promise.resolve(true); }
  };
  const ctx = {
    console, Promise, Number, String, Math, isFinite, Date, JSON, Object, Array, RegExp, setTimeout, clearTimeout,
    SHEET_INIT: [], SHEET_HOS: hos, SHEET_SAVEFMT: fmt,
    workbook: { sheets: [{ cells: o.cells || [] }], active: 0 },
    UNDO: { past: o.undo || [], future: [] },
    rowStore: (row) => row,
    localStorage: o.ls || store(),
    location: { hash: o.hash || '', search: o.search || '', href: 'https://x/apps/office/spreadsheet/spreadsheet.html' + (o.hash || '') },
    history: { replaceState(a, b, url) { log.push('replace:' + url); ctx.location.hash = ''; } },
    FsRef: fsRef(),
    emptyWorkbook() { log.push('emptyWorkbook'); ctx.workbook = { sheets: [{ cells: [] }], active: 0 }; },
    renderViewport(full) { log.push('render:' + full); },
    importXlsxFile(f) { log.push('xlsx:' + f.name); },
    applyWidths() { ctx.renderViewport(true); },
    undoRecord(t) { log.push('undo:' + t); ctx.UNDO.past.push(t); },
    afterChange() {}, highlightSel() {}, renderSheetTabs() {}, undoButtons() {},
    saveStore() {},
    OfficeDialog: { confirm(q) { log.push('confirm:' + q.title); return Promise.resolve(o.answer !== false); } },
    OfficeNotify: { show(m) { log.push('toast:' + m); } },
    SHEET_HUB: { title: () => 'Book', setTitle(v) { log.push('title:' + ctx.SHEET_HUB.title()); } },
    addEventListener(t, fn, cap) { (winListeners[t] = winListeners[t] || []).push(fn); },
    document: {
      body, activeElement: null,
      getElementById: (id) => ids[id] || null,
      addEventListener(t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
      createElement: () => el('x')
    }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.parent = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('spreadsheet_filemenu.js'), ctx, { filename: 'spreadsheet_filemenu.js' });
  vm.runInContext(read('spreadsheet_empty.js'), ctx, { filename: 'spreadsheet_empty.js' });
  ctx.SHEET_INIT.forEach((fn) => fn());
  /* SH40a: Close asks with a Save As / Discard / Cancel box (no DOM here): stand-in that logs like the old confirm.
     (before SH40a) closeWorkbook used OfficeDialog.confirm, logged above as confirm:<title>. */
  ctx.SHEET_FILEMENU.askCloseChoice = () => { log.push('confirm:Close workbook?'); return Promise.resolve(o.choice || (o.answer === false ? 'cancel' : 'discard')); };
  return { ctx, ids, body, log, hos, fmt, winListeners, docListeners, E: ctx.SHEET_EMPTY, M: ctx.SHEET_FILEMENU };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

/* ---------- menu ---------- */
test('File menu order: New, Open..., Rename, Save, Save As, Print, Close, Delete, Export..., Settings', () => {
  const html = live(read('spreadsheet.html'));
  const menu = html.slice(html.indexOf('id="of-file-menu"'), html.indexOf('id="sheet-export-menu"'));
  const ids = [];
  menu.replace(/<button[^>]*\bid="([^"]+)"/g, (m, id) => { ids.push(id); return m; });
  assert.deepStrictEqual(ids, ['btn-clear', 'btn-open', 'btn-rename', 'btn-save', 'btn-save-as', 'btn-print', 'btn-close', 'btn-delete', 'btn-export-menu', 'settingsMenuBtn']);
  const M = require('./spreadsheet_filemenu.js');
  assert.deepStrictEqual(Array.from(M.ORDER), ids);
  assert.ok(menu.indexOf('<span>Close</span>') !== -1);
});

test('html: empty panel, script and stylesheet, version SH40', () => {
  const html = read('spreadsheet.html'), l = live(html);
  for (const id of ['sheet-empty-panel', 'sheet-empty-new', 'sheet-empty-open', 'sheet-empty-recent']) assert.ok(l.indexOf('id="' + id + '"') !== -1, id);
  assert.ok(/id="sheet-empty-panel"[^>]*hidden/.test(l));
  assert.ok(l.indexOf('spreadsheet_empty.js?v=SH40') > l.indexOf('spreadsheet_filemenu.js?v=SH40'), 'empty.js after filemenu.js');
  assert.ok(l.indexOf('spreadsheet_empty.css?v=SH40') !== -1);
  /* (before SH41) assert.ok(l.indexOf('spreadsheet_settings.js?v=SH40') !== -1 && l.indexOf('spreadsheet_quick.js?v=SH40') !== -1); */
  /* (before SH42) assert.ok((l.indexOf('spreadsheet_settings.js?v=SH40') !== -1 || l.indexOf('spreadsheet_settings.js?v=SH41') !== -1) && l.indexOf('spreadsheet_quick.js?v=SH40') !== -1); */
  assert.ok((l.indexOf('spreadsheet_settings.js?v=SH40') !== -1 || l.indexOf('spreadsheet_settings.js?v=SH41') !== -1 || l.indexOf('spreadsheet_settings.js?v=SH42') !== -1) && l.indexOf('spreadsheet_quick.js?v=SH40') !== -1);
  assert.ok(html.indexOf('<title>Spreadsheet SH40</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH40) <title>Spreadsheet SH39</title> -->') !== -1);
  assert.ok(read('spreadsheet_settings.js').indexOf('var SHEET_VERSION = "SH40";') !== -1);
  assert.ok(read('spreadsheet_filemenu.js').indexOf("/* (before SH40) M.blankWorkbook(); */") !== -1);
  assert.ok(read('spreadsheet_readme.md').indexOf('## SH40') !== -1);
  const css = read('spreadsheet_empty.css');
  assert.ok(css.indexOf('body.sheet-empty #sheet-wrap') !== -1 && css.indexOf('min-height: 44px') !== -1);
});

/* ---------- pure rules ---------- */
test('transitions and canEdit / canWrite', () => {
  assert.deepStrictEqual(E.next({ empty: false }, 'close'), { empty: true });
  assert.deepStrictEqual(E.next({ empty: false }, 'delete'), { empty: true });
  assert.deepStrictEqual(E.next(null, 'boot-empty'), { empty: true });
  for (const a of ['new', 'open', 'boot-file', 'boot-blank']) assert.deepStrictEqual(E.next({ empty: true }, a), { empty: false }, a);
  assert.deepStrictEqual(E.next({ empty: true }, 'other'), { empty: true });
  assert.strictEqual(E.canEdit({ empty: true }), false);
  assert.strictEqual(E.canWrite({ empty: true }), false);
  assert.strictEqual(E.canWrite({ empty: false }), true);
});

test('keys while empty: New / Open run, Save / Print toast, edit keys blocked, others pass', () => {
  const on = { empty: true };
  const k = (key, x) => E.keyAction(on, Object.assign({ key, ctrlKey: true }, x || {}));
  assert.strictEqual(k('n'), 'new');
  assert.strictEqual(k('O'), 'open');
  assert.strictEqual(k('s'), 'toast');
  assert.strictEqual(k('p'), 'toast');
  for (const c of ['z', 'y', 'v', 'x', 'd', 'r', 'b', 'a']) assert.strictEqual(k(c), 'block', c);
  assert.strictEqual(k('n', { shiftKey: true }), null);
  assert.strictEqual(E.keyAction(on, { key: 'Delete', target: { tagName: 'BODY' } }), 'block');
  assert.strictEqual(E.keyAction(on, { key: 'Backspace', target: { tagName: 'INPUT' } }), null);
  assert.strictEqual(E.keyAction(on, { key: 'ArrowDown' }), null);
  assert.strictEqual(E.keyAction({ empty: false }, { key: 'n', ctrlKey: true }), null);
});

test('Close asks only when the flush cannot keep the edits, and never in the Hub', () => {
  assert.strictEqual(E.closeNeedsConfirm({ willWrite: false, changed: true }), true);
  assert.strictEqual(E.closeNeedsConfirm({ willWrite: true, changed: true }), false);
  assert.strictEqual(E.closeNeedsConfirm({ willWrite: false, changed: true, blank: true }), false);
  assert.strictEqual(E.closeNeedsConfirm({ willWrite: false, changed: false }), false);
  assert.strictEqual(E.closeNeedsConfirm({ inHub: true, willWrite: false, changed: true }), false);
  assert.strictEqual(E.flushWrites({ format: 'hos', inHub: true, canLocal: true }), true);
  assert.strictEqual(E.flushWrites({ format: 'hos', destKind: 'handle' }), true);
  assert.strictEqual(E.flushWrites({ format: 'hos' }), false);
  assert.strictEqual(E.flushWrites({ format: 'xlsx', destKind: 'handle' }), true);
  assert.strictEqual(E.flushWrites({ format: 'csv', destKind: 'hub', inHub: true, canLocal: true }), true);
  assert.strictEqual(E.flushWrites({ format: 'ods', destKind: 'hub' }), false);
  assert.strictEqual(E.flushWrites({ format: 'xlsx', inHub: true, canLocal: true }), false);
});

test('boot decision: #new / sheet_open_new -> blank, file link -> file, ?new=1 -> blank, else empty', () => {
  const parse = fsRef().parse;
  assert.strictEqual(E.bootMode({}), 'empty');
  assert.strictEqual(E.bootMode({ fresh: true, hashFile: true }), 'blank');
  assert.strictEqual(E.bootMode({ hashFile: true }), 'file');
  assert.strictEqual(E.bootMode({ officeNew: true }), 'blank');
  assert.strictEqual(E.hashHasFile('#drive=local&path=Documents&file=A.hos', parse), true);
  assert.strictEqual(E.hashHasFile('#drive=local&file=b.XLSX', parse), true);
  assert.strictEqual(E.hashHasFile('#drive=local&file=c.csv', parse), true);
  assert.strictEqual(E.hashHasFile('#drive=local&file=d.png', parse), false);
  assert.strictEqual(E.hashHasFile('#new', parse), false);
  assert.strictEqual(E.hashHasFile('', parse), false);
});

test('recentRows and workbookBlank', () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ name: 'B' + i + '.hos' }));
  const out = E.recentRows([null].concat(rows));
  assert.strictEqual(out.length, 8);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(out[0])), { name: 'B0.hos', label: 'B0' });
  assert.strictEqual(E.workbookBlank([{ cells: [] }]), true);
  const row = []; row[3] = { formula: '', value: '' };
  assert.strictEqual(E.workbookBlank([{ cells: [row] }]), true);
  const row2 = []; row2[1] = { formula: '=1', value: 1 };
  assert.strictEqual(E.workbookBlank([{ cells: [] }, { cells: [undefined, row2] }]), false);
});

/* ---------- page wiring ---------- */
test('boot: no link -> empty (start not run, nothing saved); file link -> start; sheet_open_new -> start', async () => {
  let p = page();
  assert.strictEqual(await p.hos.start(), false);
  assert.ok(p.E.isEmpty());
  assert.ok(p.log.indexOf('start') === -1);
  assert.ok(p.body.classList.contains('sheet-empty'));
  assert.strictEqual(p.ids['sheet-empty-panel'].hidden, false);
  assert.strictEqual(p.ids['btn-save'].disabled, true);
  assert.strictEqual(p.ids['btn-close'].disabled, true);
  assert.ok(p.ids['of-ribbon'].hasAttribute('inert') && p.ids['sheet-wrap'].hasAttribute('inert'));
  assert.ok(p.log.indexOf('title:') !== -1, 'Hub title is just "Spreadsheet" (empty file title)');
  p = page({ hash: '#drive=local&path=Documents&file=A.hos' });
  await p.hos.start();
  assert.ok(!p.E.isEmpty());
  assert.ok(p.log.indexOf('start') !== -1);
  p = page({ ls: store({ sheet_open_new: String(Date.now()) }) });
  await p.hos.start();
  assert.ok(!p.E.isEmpty(), 'the SH38 New window opens a workbook');
  assert.strictEqual(p.ctx.localStorage.getItem('sheet_open_new'), null, 'flag taken');
  p = page({ search: '?new=1' });
  p.ctx.OfficeNewDoc = { isNewDocLaunch: (s) => /new=1/.test(s) };
  await p.hos.start();
  assert.ok(!p.E.isEmpty());
});

test('autosave, Save and rendering do nothing while empty; they work again after leave', async () => {
  const p = page();
  await p.hos.start();
  p.log.length = 0;
  await p.hos.autosave({ flush: true });
  await p.hos.save({ explicit: true });
  p.ctx.renderViewport(false);
  assert.deepStrictEqual(p.log, []);
  assert.strictEqual(p.hos.skipWrite, true);
  p.E.leave('open');
  assert.strictEqual(p.hos.skipWrite, false);
  await p.hos.autosave({});
  assert.ok(p.log.some((l) => l.indexOf('autosave') === 0));
  assert.ok(p.log.indexOf('render:true') !== -1);
});

test('Close saves first, then empties: no new workbook, file link dropped', async () => {
  const p = page({ inHub: true, hash: '#drive=local&path=Documents&file=Book.hos', undo: ['edit'] });
  await p.hos.start();
  assert.ok(!p.E.isEmpty());
  p.log.length = 0;
  assert.strictEqual(await p.M.closeWorkbook(), true);
  assert.ok(p.E.isEmpty());
  const a = p.log.indexOf('autosave:{"flush":true}'), e = p.log.indexOf('emptyWorkbook');
  assert.ok(a !== -1 && e > a, 'flush before empty: ' + p.log.join(' | '));
  assert.ok(p.log.indexOf('confirm:Close workbook?') === -1, 'never asks in the Hub');
  assert.ok(p.log.indexOf('prepareNew') === -1, 'no new Untitled');
  assert.ok(p.log.some((l) => l.indexOf('replace:') === 0 && l.indexOf('#') === -1));
  assert.strictEqual(p.ctx.UNDO.past.length, 0);
  assert.ok(p.log.indexOf('toast:Closed Book') !== -1);
  assert.strictEqual(await p.M.closeWorkbook(), false, 'nothing to close');
});

test('Close asks when the edits have no file (standalone); Cancel keeps the workbook', async () => {
  const row = []; row[0] = { formula: 'x', value: 'x' };
  let p = page({ cells: [row], undo: ['edit'], answer: false, hash: '#new' });
  await p.hos.start();
  assert.strictEqual(await p.M.closeWorkbook(), false);
  assert.ok(p.log.indexOf('confirm:Close workbook?') !== -1);
  assert.ok(!p.E.isEmpty());
  /* A picked file (handle) is written by the flush: no question. */
  p = page({ cells: [row], undo: ['edit'], answer: false, hash: '#new', format: 'xlsx', fmtDest: { kind: 'handle', name: 'a.xlsx' } });
  await p.hos.start();
  assert.strictEqual(await p.M.closeWorkbook(), true);
  assert.ok(p.log.indexOf('confirm:Close workbook?') === -1);
  assert.ok(p.log.indexOf('fmt.reset') !== -1);
});

test('Delete of the open workbook ends empty (no new Untitled)', async () => {
  const p = page({ hash: '#new' });
  await p.hos.start();
  p.log.length = 0;
  await p.M.deleteNow({ onDisk: false }, { dest: null }, 'Book');
  assert.ok(p.E.isEmpty());
  assert.ok(p.log.indexOf('prepareNew') === -1);
  assert.ok(p.log.indexOf('toast:Closed Book') !== -1);
});

test('New while empty opens here; Open / recent / a link leave the state before drawing; a failed open goes back', async () => {
  let p = page();
  await p.hos.start();
  p.log.length = 0;
  await p.M.newHere();
  assert.ok(!p.E.isEmpty());
  assert.ok(p.log.indexOf('prepareNew') !== -1);
  assert.strictEqual(p.ctx.UNDO.past.length, 0, 'New starts with no undo history');
  /* The capture click on File > New takes the empty path: no Hub window, no tab, no question. */
  p = page();
  await p.hos.start();
  p.log.length = 0;
  const stops = [];
  const ev = { target: { closest: (sel) => (sel === '#btn-clear' ? {} : null) }, stopPropagation() { stops.push(1); }, stopImmediatePropagation() { stops.push(2); } };
  p.docListeners.click.forEach((fn) => fn(ev));
  assert.ok(!p.E.isEmpty());
  assert.deepStrictEqual(stops, [1, 2], 'the old clear handler (with its question) never runs');
  assert.ok(p.log.indexOf('prepareNew') !== -1);
  p = page();
  await p.hos.start();
  await p.hos.openName('A.hos');
  assert.ok(!p.E.isEmpty());
  p = page();
  await p.hos.start();
  p.ctx.importXlsxFile({ name: 'b.xlsx' });
  assert.ok(!p.E.isEmpty());
  p = page();
  await p.hos.start();
  await p.fmt.openCsvFile({ name: 'c.csv' });
  assert.ok(!p.E.isEmpty());
  p = page();
  await p.hos.start();
  await p.hos.openFile({ name: 'bad.hos' });
  await tick();
  assert.ok(p.E.isEmpty(), 'failed open: empty again');
});

test('keys: Ctrl+N while empty opens a workbook here, Ctrl+S toasts', async () => {
  const p = page();
  await p.hos.start();
  const key = p.winListeners.keydown[0];
  key({ key: 's', ctrlKey: true, preventDefault() {}, stopImmediatePropagation() {} });
  assert.ok(p.log.indexOf('toast:No workbook open') !== -1);
  key({ key: 'n', ctrlKey: true, preventDefault() {}, stopImmediatePropagation() {} });
  assert.ok(!p.E.isEmpty());
});

test('Quick Access: Undo / Save / Print are off while empty', () => {
  const q = read('spreadsheet_quick.js');
  assert.ok(q.indexOf('canSave: function () { return !sheetQuickEmpty(); }') !== -1);
  assert.ok(q.indexOf('canUndo: function () { return !sheetQuickEmpty() && UNDO.past.length > 0; }') !== -1);
  assert.ok(q.indexOf('(before SH40) print: printSheet,') !== -1);
});
