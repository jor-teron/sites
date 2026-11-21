#!/usr/bin/env node
/* SH40a: Close asks Save As / Discard / Cancel before dropping edits that cannot be saved back
 * (also in the Hub, e.g. an .xlsx picked with no save-back target). A failed .xlsx / .ods open
 * goes back to the empty panel. Same vm stubs as test-sh40-close.cjs, no browser.
 *   node --test apps/office/spreadsheet/test-sh40a-close-ask.cjs
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
const row = []; row[0] = { formula: 'x', value: 'x' };

test('closeDecision: dirty and no save-back -> confirm; otherwise close', () => {
  assert.strictEqual(E.closeDecision({ dirty: true, canSaveBack: false }), 'confirm');
  assert.strictEqual(E.closeDecision({ dirty: true, canSaveBack: true }), 'close');
  assert.strictEqual(E.closeDecision({ dirty: false, canSaveBack: false }), 'close');
  assert.strictEqual(E.closeDecision({}), 'close');
  const M = require('./spreadsheet_filemenu.js');
  assert.strictEqual(M.closeDecisionFor({ changed: true, blank: false, willWrite: false, inHub: true }, E), 'confirm', 'in the Hub too');
  assert.strictEqual(M.closeDecisionFor({ changed: true, blank: true, willWrite: false }, E), 'close', 'blank');
  assert.strictEqual(M.closeDecisionFor({ changed: false, willWrite: false }, E), 'close', 'no edits');
  assert.strictEqual(M.closeDecisionFor({ changed: true, willWrite: true }, E), 'close', 'save-back target');
  assert.deepStrictEqual(M.CLOSE_CHOICES.map((c) => c.id), ['cancel', 'discard', 'saveas']);
  assert.ok(M.closeMessage('Book').indexOf('"Book"') === 0);
});

/* Hub, an .xlsx opened through the Hub file picker: format xlsx, no dest. */
const hubPicked = (x) => Object.assign({ inHub: true, format: 'xlsx', fmtDest: null, cells: [row], undo: ['edit'], hash: '#new' }, x || {});

test('Hub picked .xlsx with edits: asks; Cancel keeps it open', async () => {
  const p = page(hubPicked({ choice: 'cancel' }));
  await p.hos.start();
  assert.strictEqual(await p.M.closeWorkbook(), false);
  assert.ok(p.log.indexOf('confirm:Close workbook?') !== -1);
  assert.ok(!p.E.isEmpty());
});

test('Discard closes into the empty state without writing', async () => {
  const p = page(hubPicked({ choice: 'discard' }));
  await p.hos.start();
  p.log.length = 0;
  p.M.askCloseChoice = () => Promise.resolve('discard');
  assert.strictEqual(await p.M.closeWorkbook(), true);
  assert.ok(p.E.isEmpty());
  assert.ok(!p.log.some((l) => l.indexOf('autosave') === 0 || l.indexOf('save:') === 0), p.log.join(' | '));
  assert.ok(p.log.some((l) => l.indexOf('toast:Closed without saving') === 0));
});

test('Save As runs the Save As flow and closes only after it wrote', async () => {
  let p = page(hubPicked());
  await p.hos.start();
  p.M.askCloseChoice = () => Promise.resolve('saveas');
  p.log.length = 0;
  assert.strictEqual(await p.M.closeWorkbook(), true);
  const sa = p.log.indexOf('save:{"explicit":true,"saveAs":true}');
  const em = p.log.indexOf('emptyWorkbook');
  assert.ok(sa !== -1 && em > sa, p.log.join(' | '));
  assert.ok(p.E.isEmpty());
  /* Save As cancelled (nothing written): the workbook stays open. */
  p = page(hubPicked());
  await p.hos.start();
  p.M.askCloseChoice = () => Promise.resolve('saveas');
  p.hos.save = () => Promise.resolve({ ok: true, cancelled: true, wrote: false });
  assert.strictEqual(await p.M.closeWorkbook(), false);
  assert.ok(!p.E.isEmpty());
  /* Save As failed: stays open too. */
  p.hos.save = () => Promise.reject(new Error('disk'));
  assert.strictEqual(await p.M.closeWorkbook(), false);
  assert.ok(!p.E.isEmpty());
});

test('A save-back target keeps SH40: flush, no question', async () => {
  const p = page(hubPicked({ fmtDest: { kind: 'hub', drive: 'local', path: 'Documents', name: 'a.xlsx' } }));
  await p.hos.start();
  let asked = false;
  p.M.askCloseChoice = () => { asked = true; return Promise.resolve('cancel'); };
  assert.strictEqual(await p.M.closeWorkbook(), true);
  assert.strictEqual(asked, false);
  assert.ok(p.log.indexOf('autosave:{"flush":true}') !== -1);
});

test('Delete never asks the Close question', async () => {
  const p = page(hubPicked());
  await p.hos.start();
  let asked = false;
  p.M.askCloseChoice = () => { asked = true; return Promise.resolve('cancel'); };
  await p.M.deleteNow({ onDisk: false }, { dest: null }, 'Book');
  assert.strictEqual(asked, false);
  assert.ok(p.E.isEmpty());
});

test('a failed .xlsx open from the empty state goes back to the empty panel', async () => {
  const p = page();
  await p.hos.start();
  assert.ok(p.E.isEmpty());
  /* A failing importXlsxFile (it now returns Promise<boolean>), wrapped the way install() does at load. */
  p.ctx.importXlsxFile = () => Promise.resolve(false);
  p.ctx.SHEET_EMPTY.install(p.ctx);
  await p.ctx.importXlsxFile({ name: 'bad.xlsx' });
  await tick();
  assert.ok(p.E.isEmpty(), 'empty again');
  const xs = read('spreadsheet_xlsx.js');
  assert.ok(xs.indexOf('  return Promise.all([xlsxLoad(), file.arrayBuffer()]).then(function (res) {') !== -1);
  assert.ok(xs.indexOf('}).catch(function (e) { xlsxToast("Could not open file: " + e.message); return false; });') !== -1);
  assert.ok(xs.indexOf('(before SH40a)') !== -1);
});

test('wiring: version SH40a, ?v= tokens, readme, old Close kept as a comment', () => {
  const html = read('spreadsheet.html');
  assert.ok(html.indexOf('<title>Spreadsheet SH40a</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH40a) <title>Spreadsheet SH40</title> -->') !== -1);
  const l = live(html);
  /* (before SH41) for (const f of ['spreadsheet_settings.js', 'spreadsheet_xlsx.js', 'spreadsheet_filemenu.js', 'spreadsheet_empty.js']) assert.ok(l.indexOf(f + '?v=SH40a') !== -1, f); */
  /* (before SH42) for (const f of ['spreadsheet_settings.js', 'spreadsheet_xlsx.js', 'spreadsheet_filemenu.js', 'spreadsheet_empty.js']) assert.ok(l.indexOf(f + '?v=SH40a') !== -1 || (f === 'spreadsheet_settings.js' && l.indexOf(f + '?v=SH41') !== -1), f);   // SH41: settings */
  /* (before SH44) for (const f of ['spreadsheet_settings.js', 'spreadsheet_xlsx.js', 'spreadsheet_filemenu.js', 'spreadsheet_empty.js']) assert.ok(l.indexOf(f + '?v=SH40a') !== -1 || (f === 'spreadsheet_settings.js' && (l.indexOf(f + '?v=SH41') !== -1 || l.indexOf(f + '?v=SH42') !== -1)), f);   // SH41: settings */
  /* (before SH45) for (const f of ['spreadsheet_settings.js', 'spreadsheet_xlsx.js', 'spreadsheet_filemenu.js', 'spreadsheet_empty.js']) assert.ok(l.indexOf(f + '?v=SH40a') !== -1 || (f === 'spreadsheet_settings.js' && (l.indexOf(f + '?v=SH41') !== -1 || l.indexOf(f + '?v=SH42') !== -1 || l.indexOf(f + '?v=SH44') !== -1)), f);   // SH41: settings */
  for (const f of ['spreadsheet_settings.js', 'spreadsheet_xlsx.js', 'spreadsheet_filemenu.js', 'spreadsheet_empty.js']) assert.ok(l.indexOf(f + '?v=SH40a') !== -1 || (f === 'spreadsheet_settings.js' && (l.indexOf(f + '?v=SH41') !== -1 || l.indexOf(f + '?v=SH42') !== -1 || l.indexOf(f + '?v=SH44') !== -1 || l.indexOf(f + '?v=SH45') !== -1)), f);   // SH41: settings
  assert.ok(read('spreadsheet_settings.js').indexOf('var SHEET_VERSION = "SH40a";') !== -1);
  assert.ok(read('spreadsheet_filemenu.js').indexOf('/* (before SH40a)\n  /* File > Close') !== -1);
  assert.ok(read('spreadsheet_readme.md').indexOf('## SH40a') !== -1);
});
