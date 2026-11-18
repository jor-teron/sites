#!/usr/bin/env node
/* SH32: Spreadsheet saves directly to .xlsx, .ods and .csv.
   Loads the real spreadsheet modules (config, state, storage, files, xlsx with the
   vendored SheetJS) plus spreadsheet_saveformat.js in a vm, with a fake SHEET_HOS
   session, a fake Hub drive (FsDrives / FsOps), fake file handles and a stubbed
   OfficeDialog that records every dialog. When soffice is installed, the .xlsx and
   .ods bytes are converted headless to .csv and the values are checked.
   Run: node --test apps/office/spreadsheet/test-sh32-saveformat.cjs */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const dir = __dirname;
const XLSX = require(path.join(dir, 'vendor/sheetjs/xlsx.full.min.js'));
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

/* ---------- fakes ---------- */
function fakeDir(name) {
  const d = {
    name: name, kind: 'directory', files: new Map(), dirs: new Map(),
    getDirectoryHandle(n, o) {
      if (!d.dirs.has(n)) {
        if (!(o && o.create)) return Promise.reject(Object.assign(new Error('NotFound'), { name: 'NotFoundError' }));
        d.dirs.set(n, fakeDir(n));
      }
      return Promise.resolve(d.dirs.get(n));
    },
    getFileHandle(n, o) {
      if (!d.files.has(n)) {
        if (!(o && o.create)) return Promise.reject(Object.assign(new Error('NotFound'), { name: 'NotFoundError' }));
        d.files.set(n, null);
      }
      return Promise.resolve(fakeHandle(n, (blob) => d.files.set(n, blob)));
    },
    removeEntry(n) { d.files.delete(n); return Promise.resolve(); }
  };
  return d;
}
function fakeHandle(name, onWrite) {
  const h = {
    kind: 'file', name: name, writes: [],
    createWritable() {
      return Promise.resolve({
        write(blob) { h.writes.push(blob); if (onWrite) onWrite(blob); return Promise.resolve(); },
        close() { return Promise.resolve(); },
        abort() { return Promise.resolve(); }
      });
    }
  };
  return h;
}
function allNames(d, pre) {
  let out = [];
  pre = pre || '';
  d.files.forEach((v, k) => out.push(pre + k));
  d.dirs.forEach((v, k) => { out = out.concat(allNames(v, pre + k + '/')); });
  return out;
}
async function blobText(b) { return Buffer.from(await b.arrayBuffer()).toString('utf8'); }
async function blobBuf(b) { return Buffer.from(await b.arrayBuffer()); }

function load(o) {
  o = o || {};
  const files = [
    'spreadsheet_config.js', 'spreadsheet_formula.js', 'spreadsheet_functions.js', 'spreadsheet_refs.js',
    'spreadsheet_state.js', 'spreadsheet_storage.js', 'spreadsheet_format.js', 'spreadsheet_style.js',
    'spreadsheet_files.js', 'spreadsheet_xlsx.js'
  ];
  const rec = { dialogs: [], downloads: [], pickers: [], origSave: [], origAutosave: [], origOpen: [], status: [], clash: [] };
  const root = fakeDir('local');
  const session = {
    skipWrite: false, applying: false, dest: null, autoName: '', name: 'Untitled 1',
    save(opts) { rec.origSave.push(opts || {}); return Promise.resolve({ ok: true, wrote: true, name: session.name }); },
    autosave(opts) { rec.origAutosave.push(opts || {}); return Promise.resolve({ ok: true, wrote: false }); },
    openFile(file, dest) { rec.origOpen.push(file.name); return Promise.resolve(true); },
    prepareNew() { return Promise.resolve('Untitled 2'); },
    detach() { session.dest = null; },
    stemName() { return session.name; },
    noteStem(n) { session.name = n; },
    isAutoName(n) { return !!session.autoName && n === session.autoName; }
  };
  const anchors = [];
  const ctx = {
    console, Date, Math, Number, String, Boolean, Array, Object, Proxy, JSON, Promise, Map, Uint8Array, ArrayBuffer,
    parseInt, isNaN, isFinite, RegExp, Error, TypeError, NaN, Infinity, undefined, setTimeout, clearTimeout,
    Blob: Blob,
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    document: {
      addEventListener() {}, getElementById() { return null; },
      createElement() { const a = { click() { rec.downloads.push({ name: a.download }); }, remove() {} }; anchors.push(a); return a; },
      body: { appendChild() {} }
    },
    SHEET_INIT: [],
    undoRecord() {}, afterChange() {}, highlightSel() {}, applyWidths() {}, renderSheetTabs() {},
    setStatus(m) { rec.status.push(m); },
    OfficeNotify: { show() {}, saveOk() {}, saveProblem() {} },
    OfficeDialog: {
      form(spec) { rec.dialogs.push({ kind: 'form', spec }); return Promise.resolve(o.form ? o.form(spec) : null); },
      prompt(spec) { rec.dialogs.push({ kind: 'prompt', spec }); return Promise.resolve(null); },
      confirm(spec) { rec.dialogs.push({ kind: 'confirm', spec }); return Promise.resolve(false); },
      alert(spec) { rec.dialogs.push({ kind: 'alert', spec }); return Promise.resolve(true); }
    },
    OfficeNative: {
      inHub: () => !!o.hub,
      clashDialog(name, free) { rec.clash.push([name, free]); return Promise.resolve(o.clash || null); }
    },
    SHEET_HOS: session
  };
  if (o.hub) {
    ctx.FsDrives = { hasLocal: true, handle: () => Promise.resolve(root) };
    ctx.FsOps = {
      exists: (d, n) => Promise.resolve(d.files.has(n)),
      writeFile: (d, n, blob) => { d.files.set(n, blob); return Promise.resolve(); },
      uniqueName: (d, n) => { const m = /^(.*?)(\.[^.]+)$/.exec(n); let i = 2; while (d.files.has(m[1] + ' (' + i + ')' + m[2])) i++; return Promise.resolve(m[1] + ' (' + i + ')' + m[2]); }
    };
  }
  if (o.picker) {
    ctx.showSaveFilePicker = (opts) => { rec.pickers.push(opts); const h = fakeHandle(o.pickName || opts.suggestedName); rec.pickedHandle = h; return Promise.resolve(h); };
  }
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(files.map(read).join('\n;\n'), ctx, { filename: 'spreadsheet-sh32.js' });
  ctx.XLSX = XLSX;
  /* fingerprint source for SHEET_SAVEFMT.sig (the real one is spreadsheet_hos.js Hos.capture / pack) */
  vm.runInContext(`var SHEET_HOS_FORMAT = { pack: function (d) { return d; }, capture: function () {
    return { name: SHEET_HOS.stemName(), sheets: workbook.sheets.map(function (s) {
      var out = []; forEachReal(s.cells, function (r, c, cell) { out.push([r, c, cell.formula]); }); return [s.name, out]; }) }; } };`, ctx);
  vm.runInContext(read('spreadsheet_saveformat.js'), ctx, { filename: 'spreadsheet_saveformat.js' });
  vm.runInContext(`emptyWorkbook(); cells[0][0].formula = "Item"; cells[0][1].formula = "Qty";
    cells[1][0].formula = "Pens"; cells[1][1].formula = "12"; cells[2][0].formula = "Ink"; cells[2][1].formula = "3";`, ctx);
  return { ctx, F: ctx.SHEET_SAVEFMT, session, rec, root };
}
function setCell(ctx, r, c, v) { vm.runInContext(`cells[${r}][${c}].formula = ${JSON.stringify(v)};`, ctx); }

/* ---------- pure helpers ---------- */
test('format from a file name', function () {
  const { F } = load();
  assert.equal(F.formatOf('Sales.xlsx'), 'xlsx');
  assert.equal(F.formatOf('Sales.XLSX'), 'xlsx');
  assert.equal(F.formatOf('Budget.ods'), 'ods');
  assert.equal(F.formatOf('grid.csv'), 'csv');
  assert.equal(F.formatOf('Book.hos'), 'hos');
  assert.equal(F.formatOf('Old.xls'), 'hos', '.xls is opened but saves as .hos');
  assert.equal(F.formatOf('notes.txt'), 'hos');
  assert.equal(F.formatOf(''), 'hos');
  assert.equal(F.extFormat('a.txt'), '');
  assert.equal(F.isDirect('xlsx') && F.isDirect('ods') && F.isDirect('csv'), true);
  assert.equal(F.isDirect('hos'), false);
});

test('Save As names: stem, extension and a typed extension picks the format', function () {
  const { F } = load();
  assert.equal(F.stem('Sales.xlsx'), 'Sales');
  assert.equal(F.stem('  Q1: plan.ods '), 'Q1 plan');
  assert.equal(F.stem(''), 'Sheet');
  assert.equal(F.fileName('Sales', 'ods'), 'Sales.ods');
  assert.equal(F.fileName('Sales.xlsx', 'csv'), 'Sales.csv');
  assert.equal(F.fileName('Sales', 'hos'), 'Sales.hos');
  assert.deepEqual(JSON.parse(JSON.stringify(F.saveAsChoice({ name: 'Report', format: 'ods' }, 'xlsx'))), { name: 'Report', format: 'ods', file: 'Report.ods' });
  assert.deepEqual(JSON.parse(JSON.stringify(F.saveAsChoice({ name: 'Data.csv', format: 'xlsx' }, 'xlsx'))), { name: 'Data', format: 'csv', file: 'Data.csv' });
  assert.deepEqual(JSON.parse(JSON.stringify(F.saveAsChoice({ name: 'Back.hos', format: 'ods' }, 'ods'))), { name: 'Back', format: 'hos', file: 'Back.hos' });
  assert.equal(F.saveAsChoice({ name: 'X', format: 'bogus' }, 'csv').format, 'csv');
  assert.deepEqual(Array.from(F.ORDER), ['hos', 'xlsx', 'ods', 'csv']);
});

test('MIME types', function () {
  const { F } = load();
  assert.equal(F.mimeOf('xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(F.mimeOf('ods'), 'application/vnd.oasis.opendocument.spreadsheet');
  assert.equal(F.mimeOf('csv'), 'text/csv');
  assert.equal(F.mimeOf('hos'), 'application/json');
});

test('generator routing: xlsx / ods through SheetJS, csv through csvText, hos refused', async function () {
  const { F } = load();
  assert.equal(F.generatorFor('xlsx'), 'sheetjs');
  assert.equal(F.generatorFor('ods'), 'sheetjs');
  assert.equal(F.generatorFor('csv'), 'csv');
  assert.equal(F.generatorFor('hos'), 'hos');
  const x = await F.blobFor('xlsx');
  assert.equal(x.type, F.mimeOf('xlsx'));
  const xb = await blobBuf(x);
  assert.equal(xb.slice(0, 2).toString(), 'PK');
  const wb = XLSX.read(xb, { type: 'buffer' });
  assert.equal(wb.Sheets[wb.SheetNames[0]].B2.v, 12);
  const ob = await blobBuf(await F.blobFor('ods'));
  assert.equal(ob.slice(0, 2).toString(), 'PK');
  assert.ok(ob.toString('latin1').indexOf('application/vnd.oasis.opendocument.spreadsheet') !== -1);
  const c = await F.blobFor('csv');
  assert.equal(c.type, 'text/csv');
  assert.equal(await blobText(c), 'Item,Qty\nPens,12\nInk,3');
  await assert.rejects(F.blobFor('hos'));
});

/* ---------- Hub ---------- */
test('Hub: an opened .xlsx saves back to the same file and folder, no .hos copy', async function () {
  const { ctx, F, session, rec, root } = load({ hub: true });
  const work = fakeDir('Work'); root.dirs.set('Work', work); work.files.set('Sales.xlsx', 'old');
  F.opened('xlsx', { kind: 'hub', drive: 'local', path: 'Work', name: 'Sales.xlsx' }, 'Sales.xlsx');
  assert.equal(session.skipWrite, true, 'the .hos session is held');
  assert.equal(session.name, 'Sales', 'the name has no extension');
  setCell(ctx, 3, 0, 'Clips');
  const res = await session.save({ explicit: true });
  assert.equal(res.wrote, true);
  const wb = XLSX.read(await blobBuf(work.files.get('Sales.xlsx')), { type: 'buffer' });
  assert.equal(wb.Sheets[wb.SheetNames[0]].A4.v, 'Clips');
  assert.equal(rec.origSave.length, 0, 'the .hos save path was not used');
  assert.deepEqual(allNames(root).filter((n) => /\.hos$/.test(n)), []);
  assert.equal(rec.dialogs.length, 0, 'no dialog on Save');
  assert.equal(rec.clash.length, 0);
});

test('Hub: an opened .xlsx with no folder saves to Documents on the first Save', async function () {
  const { F, session, root } = load({ hub: true });
  F.opened('csv', null, 'grid.csv');
  await session.save({ explicit: true });
  assert.deepEqual(allNames(root), ['Documents/grid.csv']);
  assert.equal(await blobText(root.dirs.get('Documents').files.get('grid.csv')), 'Item,Qty\nPens,12\nInk,3');
  assert.equal(F.dest.path, 'Documents');
});

test('Hub: Save As box picks .ods, keeps the old file, later Saves keep .ods', async function () {
  const { ctx, F, session, rec, root } = load({ hub: true, form: () => ({ name: 'Report', format: 'ods' }) });
  const work = fakeDir('Work'); root.dirs.set('Work', work); work.files.set('Sales.xlsx', 'old');
  F.opened('xlsx', { kind: 'hub', drive: 'local', path: 'Work', name: 'Sales.xlsx' }, 'Sales.xlsx');
  const res = await session.save({ explicit: true, saveAs: true });
  assert.equal(res.wrote, true);
  assert.equal(rec.dialogs.length, 1);
  const spec = rec.dialogs[0].spec;
  assert.equal(rec.dialogs[0].kind, 'form');
  assert.equal(spec.title, 'Save as');
  assert.deepEqual(JSON.parse(JSON.stringify(spec.fields.map((f) => f.key))), ['name', 'format']);
  assert.equal(spec.fields[0].value, 'Sales');
  assert.equal(spec.fields[1].value, 'xlsx', 'current format preselected');
  assert.deepEqual(JSON.parse(JSON.stringify(spec.fields[1].options.map((x) => x.value))), ['hos', 'xlsx', 'ods', 'csv']);
  assert.equal(work.files.get('Sales.xlsx'), 'old', 'old file kept');
  assert.ok(work.files.get('Report.ods'), 'new file in the same folder');
  assert.equal(F.format, 'ods');
  assert.equal(session.name, 'Report');
  setCell(ctx, 4, 0, 'More');
  await session.save({ explicit: true });
  const wb = XLSX.read(await blobBuf(work.files.get('Report.ods')), { type: 'buffer' });
  assert.equal(wb.Sheets[wb.SheetNames[0]].A5.v, 'More');
  assert.equal(rec.dialogs.length, 1, 'plain Save asks nothing');
  assert.equal(rec.origSave.length, 0);
});

test('Save As: a typed .csv wins over the select; Save As .hos goes through the .hos path with the chosen name', async function () {
  let answer = { name: 'Data.csv', format: 'xlsx' };
  const { F, session, rec, root } = load({ hub: true, form: () => answer });
  F.opened('xlsx', { kind: 'hub', drive: 'local', path: 'Documents', name: 'Sales.xlsx' }, 'Sales.xlsx');
  await session.save({ explicit: true, saveAs: true });
  assert.equal(F.format, 'csv');
  assert.ok(root.dirs.get('Documents').files.get('Data.csv'));
  answer = { name: 'Book', format: 'hos' };
  const res = await session.save({ explicit: true, saveAs: true });
  assert.equal(res.wrote, true);
  assert.equal(rec.origSave.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(rec.origSave[0])), { explicit: true, saveAs: true });
  assert.equal(F.format, 'hos');
  assert.equal(session.skipWrite, false, '.hos autosave is back on');
  assert.equal(session.name, 'Book');
  assert.equal(rec.dialogs.filter((d) => d.kind !== 'form').length, 0);
});

test('Save As from a new .hos workbook to .xlsx detaches the .hos session', async function () {
  const { F, session, root } = load({ hub: true, form: () => ({ name: 'Plan', format: 'xlsx' }) });
  session.dest = { kind: 'hub', drive: 'local', path: 'Documents', name: 'Untitled 1.hos' };
  root.dirs.set('Documents', fakeDir('Documents'));
  root.dirs.get('Documents').files.set('Untitled 1.hos', '{}');
  await session.save({ explicit: true, saveAs: true });
  assert.ok(root.dirs.get('Documents').files.get('Plan.xlsx'));
  assert.ok(root.dirs.get('Documents').files.get('Untitled 1.hos'), 'old .hos kept');
  assert.equal(session.dest, null);
  assert.equal(session.skipWrite, true);
  assert.equal(F.format, 'xlsx');
});

test('Hub: a taken name on Save As asks Replace / Use (not a format warning); cancel is quiet', async function () {
  const { F, session, rec, root } = load({ hub: true, form: () => ({ name: 'Taken', format: 'csv' }), clash: 'use' });
  const docs = fakeDir('Documents'); root.dirs.set('Documents', docs); docs.files.set('Taken.csv', 'x');
  F.opened('xlsx', { kind: 'hub', drive: 'local', path: 'Documents', name: 'Sales.xlsx' }, 'Sales.xlsx');
  await session.save({ explicit: true, saveAs: true });
  assert.deepEqual(rec.clash, [['Taken', 'Taken (2)']]);
  assert.ok(docs.files.get('Taken (2).csv'));
  assert.equal(docs.files.get('Taken.csv'), 'x');
});

/* ---------- outside the Hub ---------- */
test('standalone: an opened file handle is written back in its format', async function () {
  const { F, session, rec } = load({ picker: true });
  const h = fakeHandle('Budget.ods');
  F.opened('ods', { kind: 'handle', handle: h, name: 'Budget.ods' }, 'Budget.ods');
  await session.save({ explicit: true });
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].type, F.mimeOf('ods'));
  assert.equal(rec.pickers.length, 0, 'no picker when the handle is held');
  assert.equal(rec.downloads.length, 0);
});

test('standalone: no handle -> the save picker once, then Saves keep that handle', async function () {
  const { F, session, rec } = load({ picker: true });
  F.opened('csv', null, 'grid.csv');
  await session.save({ explicit: true });
  assert.equal(rec.pickers.length, 1);
  assert.equal(rec.pickers[0].suggestedName, 'grid.csv');
  assert.deepEqual(JSON.parse(JSON.stringify(rec.pickers[0].types[0].accept)), { 'text/csv': ['.csv'] });
  await session.save({ explicit: true });
  assert.equal(rec.pickers.length, 1);
  assert.equal(rec.pickedHandle.writes.length, 2);
});

test('standalone: an extension typed in the save picker wins', async function () {
  const { F, session } = load({ picker: true, pickName: 'Other.ods', form: () => ({ name: 'Sales', format: 'xlsx' }) });
  F.opened('xlsx', null, 'Sales.xlsx');
  await session.save({ explicit: true, saveAs: true });
  assert.equal(F.format, 'ods');
  assert.equal(F.dest.name, 'Other.ods');
});

test('standalone: no picker -> a download named after the sheet', async function () {
  const { F, session, rec } = load();
  F.opened('xlsx', null, 'Sales.xlsx');
  const res = await session.save({ explicit: true });
  assert.equal(res.verb, 'Downloaded');
  assert.deepEqual(rec.downloads.map((d) => d.name), ['Sales.xlsx']);
  assert.equal(F.dest, null);
});

/* ---------- autosave ---------- */
test('timers never write .xlsx / .ods / .csv; flushes write only a changed file with a target', async function () {
  const { ctx, F, session, rec, root } = load({ hub: true });
  const docs = fakeDir('Documents'); root.dirs.set('Documents', docs);
  F.opened('xlsx', { kind: 'hub', drive: 'local', path: 'Documents', name: 'Sales.xlsx' }, 'Sales.xlsx');
  setCell(ctx, 5, 0, 'x');
  await session.autosave();
  await session.autosave({ timer: true });
  await session.save({ unique: true });
  assert.equal(docs.files.size, 0, 'timer / non-explicit save wrote nothing');
  assert.equal(rec.origAutosave.length, 0);
  await session.autosave({ flush: true });
  assert.ok(docs.files.get('Sales.xlsx'), 'flush wrote the changed file');
  docs.files.delete('Sales.xlsx');
  await session.autosave({ flush: true });
  assert.equal(docs.files.size, 0, 'unchanged: no rewrite');
  /* the Hub title may already show the next file being opened: the flush keeps the target's own name */
  session.name = 'Next';
  setCell(ctx, 5, 1, 'w');
  await session.autosave({ flush: true });
  assert.deepEqual(Array.from(docs.files.keys()), ['Sales.xlsx']);
  docs.files.delete('Sales.xlsx');
  session.name = 'Sales';
  await session.save({ explicit: true });
  assert.ok(docs.files.get('Sales.xlsx'), 'explicit Save always writes');
});

test('flush with no target writes nothing; a .hos workbook autosaves through the .hos path', async function () {
  const a = load({ hub: true });
  a.F.opened('csv', null, 'grid.csv');
  setCell(a.ctx, 6, 0, 'y');
  await a.session.autosave({ flush: true });
  assert.deepEqual(allNames(a.root), []);
  const b = load({ hub: true });
  await b.session.autosave();
  await b.session.save({ explicit: true });
  assert.equal(b.rec.origAutosave.length, 1);
  assert.equal(b.rec.origSave.length, 1);
});

test('New and opening a .hos flush a changed target, then go back to .hos', async function () {
  const { ctx, F, session, rec } = load({ picker: true });
  const h = fakeHandle('Budget.ods');
  F.opened('ods', { kind: 'handle', handle: h, name: 'Budget.ods' }, 'Budget.ods');
  setCell(ctx, 7, 0, 'z');
  await session.openFile({ name: 'Other.hos' }, null);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(h.writes.length, 1, 'changed target written before the open');
  assert.deepEqual(rec.origOpen, ['Other.hos']);
  assert.equal(F.format, 'hos');
  assert.equal(session.skipWrite, false);
  F.opened('csv', { kind: 'handle', handle: h, name: 'g.csv' }, 'g.csv');
  F.flush();
  session.prepareNew();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(h.writes.length, 1, 'unchanged: New writes nothing');
  assert.equal(F.format, 'hos');
});

/* ---------- opening ---------- */
test('opening .xlsx / .ods / .csv makes no .hos copy; .xls still does', async function () {
  const { ctx, F, session, rec } = load({ hub: true });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['A', 1], ['B', 2]]), 'S1');
  const bytes = XLSX.write(book, { bookType: 'xlsx', type: 'array' });
  const file = (name) => ({ name, arrayBuffer: () => Promise.resolve(bytes) });
  const dest = { kind: 'hub', drive: 'local', path: 'Work', name: 'In.xlsx' };
  ctx.importXlsxFile(file('In.xlsx'), { dest });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(rec.origSave.length, 0);
  assert.equal(F.format, 'xlsx');
  assert.equal(F.dest.name, 'In.xlsx');
  assert.equal(session.skipWrite, true);
  assert.equal(session.name, 'In');
  ctx.importXlsxFile(file('Old.xls'));
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(rec.origSave.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(rec.origSave[0])), { unique: true });
  assert.equal(F.format, 'hos');
  const ok = await F.openCsvFile({ name: 'People.csv', text: () => Promise.resolve('n,a\n"Smith, J",4') }, { dest: { kind: 'hub', drive: 'local', path: 'Work', name: 'People.csv' } });
  assert.equal(ok, true);
  assert.equal(F.format, 'csv');
  assert.equal(rec.origSave.length, 1, 'csv open: no .hos save');
  assert.equal(vm.runInContext('workbook.sheets.length', ctx), 1);
  assert.equal(vm.runInContext('workbook.sheets[0].name', ctx), 'People');
  assert.equal(vm.runInContext('cells[1][0].formula', ctx), 'Smith, J');
  assert.equal(vm.runInContext('csvText()', ctx), 'n,a\n"Smith, J",4');
});

test('the stubbed dialog records only the Save As box, never a format or CSV warning', async function () {
  const { ctx, F, session, rec } = load({ picker: true, form: () => ({ name: 'Two', format: 'csv' }) });
  vm.runInContext('workbook.sheets.push(makeSheet("Sheet2"));', ctx);
  F.opened('xlsx', null, 'Two.xlsx');
  await session.save({ explicit: true });
  await session.save({ explicit: true, saveAs: true });
  await session.save({ explicit: true });
  await session.autosave({ flush: true });
  assert.deepEqual(rec.dialogs.map((d) => d.kind + ':' + d.spec.title), ['form:Save as']);
  assert.equal(F.format, 'csv');
  const src = read('spreadsheet_saveformat.js');
  assert.ok(!/confirm\(|alert\(/.test(src), 'no confirm / alert in the save code');
  assert.ok(!/only the active sheet/i.test(src));
});

/* ---------- wiring ---------- */
test('wiring: title, VERSION, script order, hos.js hooks, readme', function () {
  const html = read('spreadsheet.html');
  assert.ok(html.indexOf('<title>Spreadsheet SH32</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH32) <title>Spreadsheet SH31</title> -->') !== -1);
  assert.ok(html.indexOf('spreadsheet_saveformat.js?v=SH32') > html.indexOf('spreadsheet_hos.js?v=SH32'));
  assert.ok(html.indexOf('spreadsheet_xlsx.js?v=SH32') !== -1);
  assert.ok(read('spreadsheet_settings.js').indexOf('var SHEET_VERSION = "SH32";') !== -1);
  const hos = read('spreadsheet_hos.js');
  assert.ok(hos.indexOf('session.autosave({ flush: true })') !== -1);
  assert.ok(hos.indexOf('SHEET_SAVEFMT.takeName') !== -1);
  assert.ok(hos.indexOf('Hos.capture') !== -1);
  const readme = read('spreadsheet_readme.md');
  assert.ok(readme.indexOf('## SH32') !== -1);
  assert.ok(/active sheet/i.test(readme.slice(readme.indexOf('## SH32'))));
});

/* ---------- LibreOffice round trip ---------- */
function soffice() {
  for (const b of ['soffice', 'libreoffice']) {
    try { cp.execFileSync('which', [b], { stdio: 'pipe' }); return b; } catch (e) {}
  }
  return '';
}
const SOFFICE = soffice();
test('soffice round trip: generated .xlsx and .ods convert to the same csv values', { skip: !SOFFICE && 'soffice not installed', timeout: 180000 }, async function () {
  const { ctx, F } = load();
  setCell(ctx, 3, 0, 'Total');
  setCell(ctx, 3, 1, '=SUM(B2:B3)');
  vm.runInContext('recalcAll()', ctx);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sh32-'));
  try {
    for (const fmt of ['xlsx', 'ods']) {
      const p = path.join(tmp, 'book.' + fmt);
      fs.writeFileSync(p, await blobBuf(await F.blobFor(fmt)));
      const out = path.join(tmp, fmt);
      fs.mkdirSync(out);
      cp.execFileSync(SOFFICE, ['-env:UserInstallation=file://' + path.join(tmp, 'profile'), '--headless', '--convert-to', 'csv', '--outdir', out, p], { stdio: 'pipe', timeout: 150000 });
      const csv = fs.readFileSync(path.join(out, 'book.csv'), 'utf8').replace(/\r/g, '').trim();
      assert.equal(csv, 'Item,Qty\nPens,12\nInk,3\nTotal,15', fmt + ' round trip');
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
