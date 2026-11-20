#!/usr/bin/env node
/* SH33: Spreadsheet opens and saves .xlsm (Excel macro-enabled) and keeps the macros.
   Same harness as test-sh32-saveformat.cjs (real spreadsheet modules + vendored SheetJS
   in a vm, fake SHEET_HOS session, fake Hub drive and file handles, stubbed OfficeDialog)
   plus spreadsheet_xlsm.js. The .xlsm fixture is built in the test with XLSX.CFB:
   a workbook with one sheet, a fake xl/vbaProject.bin with known bytes, a signature
   part, a customUI part, the macroEnabled content type, the vbaProject relationship
   and code names. When soffice is installed the saved .xlsm is converted headless to
   .csv; when python3 is there, zipfile double-checks the structure.
   Run: node --test apps/office/spreadsheet/test-sh33-xlsm.cjs */

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
    'spreadsheet_files.js', 'spreadsheet_xlsx.js', 'spreadsheet_xlsm.js'
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
  vm.runInContext(files.map(read).join('\n;\n'), ctx, { filename: 'spreadsheet-sh33.js' });
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

/* ---------- the .xlsm fixture ---------- */
const VBA = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 1, 2, 3, 250, 251, 252, 253, 254, 255, 0x53, 0x48, 0x33]);
const SIG = Uint8Array.from([9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
function buildXlsm(o) {
  o = o || {};
  const vba = o.vba !== false;
  const CFB = XLSX.CFB;
  const z = CFB.utils.cfb_new();
  const add = (p, s) => CFB.utils.cfb_add(z, '/' + p, typeof s === 'string' ? Buffer.from(s, 'utf8') : s);
  add('[Content_Types].xml', HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    (vba ? '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>' : '') +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    (vba ? '<Override PartName="/xl/vbaProjectSignature.bin" ContentType="application/vnd.ms-office.vbaProjectSignature"/>' +
      '<Override PartName="/customUI/customUI14.xml" ContentType="application/xml"/>' : '') +
    '</Types>');
  add('_rels/.rels', HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    (vba ? '<Relationship Id="rId9" Type="http://schemas.microsoft.com/office/2007/relationships/ui/extensibility" Target="customUI/customUI14.xml"/>' : '') +
    '</Relationships>');
  add('xl/workbook.xml', HEAD + '<workbook ' + NS + '><workbookPr codeName="MeinBuch"/><sheets><sheet name="Data &amp; Co" sheetId="1" r:id="rId1"/></sheets></workbook>');
  add('xl/_rels/workbook.xml.rels', HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    (vba ? '<Relationship Id="rId2" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProject" Target="vbaProject.bin"/>' : '') +
    '</Relationships>');
  add('xl/worksheets/sheet1.xml', HEAD + '<worksheet ' + NS + '><sheetPr codeName="DataSheet"/><dimension ref="A1:B3"/><sheetData>' +
    '<row r="1"><c r="A1" t="inlineStr"><is><t>Item</t></is></c><c r="B1" t="inlineStr"><is><t>Qty</t></is></c></row>' +
    '<row r="2"><c r="A2" t="inlineStr"><is><t>Pens</t></is></c><c r="B2"><v>12</v></c></row>' +
    '<row r="3"><c r="A3" t="inlineStr"><is><t>Ink</t></is></c><c r="B3"><v>3</v></c></row>' +
    '</sheetData></worksheet>');
  if (vba) {
    add('xl/vbaProject.bin', VBA);
    add('xl/vbaProjectSignature.bin', SIG);
    add('xl/_rels/vbaProject.bin.rels', HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.microsoft.com/office/2006/relationships/vbaProjectSignature" Target="vbaProjectSignature.bin"/></Relationships>');
    add('customUI/customUI14.xml', '<customUI xmlns="http://schemas.microsoft.com/office/2009/07/customui"><ribbon/></customUI>');
  }
  return Buffer.from(CFB.write(z, { fileType: 'zip', type: 'array' }));
}
function unzip(buf) {
  const z = XLSX.CFB.read(new Uint8Array(buf), { type: 'array' });
  const get = (p) => { const e = XLSX.CFB.find(z, '/' + p); return e && e.content ? Buffer.from(e.content) : null; };
  const txt = (p) => { const b = get(p); return b ? b.toString('utf8') : null; };
  return { get, txt };
}
async function openXlsm(ctx, F, name, bytes, o) {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length);
  ctx.importXlsxFile({ name, arrayBuffer: () => Promise.resolve(ab) }, o || {});
  for (let i = 0; i < 100 && F.format !== F.formatOf(name); i++) await new Promise((r) => setTimeout(r, 5));
  await new Promise((r) => setTimeout(r, 5));
}
function lastWrite(h) { return h.writes[h.writes.length - 1]; }

/* ---------- pure helpers ---------- */
test('format from a .xlsm name; .xlsm is a direct (save-back) format through SheetJS', function () {
  const { F } = load();
  assert.equal(F.formatOf('Macro.xlsm'), 'xlsm');
  assert.equal(F.formatOf('Macro.XLSM'), 'xlsm');
  assert.equal(F.extFormat('Macro.xlsm'), 'xlsm');
  assert.equal(F.isDirect('xlsm'), true);
  assert.equal(F.generatorFor('xlsm'), 'sheetjs');
  assert.equal(F.stem('Macro.xlsm'), 'Macro');
  assert.equal(F.fileName('Macro', 'xlsm'), 'Macro.xlsm');
  assert.equal(F.mimeOf('xlsm'), 'application/vnd.ms-excel.sheet.macroEnabled.12');
  assert.equal(F.FORMATS.xlsm.label, 'Excel with macros (.xlsm)');
  assert.deepEqual(Array.from(F.ORDER), ['hos', 'xlsx', 'ods', 'csv'], 'the base list has no .xlsm');
});

test('open accept lists include .xlsm (file input, open picker, drop / Hub link check)', function () {
  const { ctx, F } = load();
  const html = read('spreadsheet.html');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  const m = /<input id="file-import" type="file" accept="([^"]*)"/.exec(live);
  assert.ok(m, 'file-import input');
  assert.ok(m[1].split(',').indexOf('.xlsm') !== -1, 'input accept has .xlsm');
  const acc = F.pickTypes()[0].accept;
  assert.deepEqual(Array.from(acc['application/vnd.ms-excel.sheet.macroEnabled.12']), ['.xlsm']);
  assert.ok(/\.xlsm/.test(F.pickTypes()[0].description));
  assert.equal(ctx.xlsxIsWorkbookName('Macro.xlsm'), true);
  assert.equal(ctx.xlsxIsWorkbookFile({ name: 'x', type: 'application/vnd.ms-excel.sheet.macroEnabled.12' }), true);
  assert.equal(ctx.xlsxIsWorkbookName('Macro.xlsb'), false);
  assert.ok(/xlsx\|xlsm\|xls\|ods/.test(read('spreadsheet_toolbar.js')), 'toolbar fallback test has .xlsm');
});

/* ---------- the main round trip ---------- */
test('open .xlsm, edit a cell, Save back to the same file: macros, content types, rels, code names kept', async function () {
  const { ctx, F, session, rec } = load({ picker: true });
  const h = fakeHandle('Macro.xlsm');
  await openXlsm(ctx, F, 'Macro.xlsm', buildXlsm(), { handle: h });
  assert.equal(F.format, 'xlsm');
  assert.equal(F.dest.handle, h);
  assert.equal(session.name, 'Macro');
  assert.equal(session.skipWrite, true);
  assert.ok(F.macro && F.macro.hasVba, 'macro parts kept in memory');
  assert.equal(vm.runInContext('workbook.sheets[0].name', ctx), 'Data & Co');
  assert.equal(vm.runInContext('cells[1][1].formula', ctx), '12');
  setCell(ctx, 1, 1, '42');
  setCell(ctx, 3, 0, 'Total');
  setCell(ctx, 3, 1, '=SUM(B2:B3)');
  vm.runInContext('recalcAll()', ctx);
  const res = await session.save({ explicit: true });
  assert.equal(res.wrote, true);
  assert.equal(h.writes.length, 1, 'written back to the held handle');
  assert.equal(rec.pickers.length, 0);
  assert.equal(rec.dialogs.length, 0, 'no warning or dialog');
  assert.equal(rec.origSave.length, 0, 'no .hos copy');
  const blob = lastWrite(h);
  assert.equal(blob.type.toLowerCase(), 'application/vnd.ms-excel.sheet.macroenabled.12');
  const buf = await blobBuf(blob);
  const z = unzip(buf);
  assert.deepEqual(Array.from(z.get('xl/vbaProject.bin')), Array.from(VBA), 'vbaProject.bin byte-identical');
  assert.deepEqual(Array.from(z.get('xl/vbaProjectSignature.bin')), Array.from(SIG), 'signature kept');
  assert.ok(z.txt('xl/_rels/vbaProject.bin.rels').indexOf('vbaProjectSignature.bin') !== -1);
  assert.ok(z.txt('customUI/customUI14.xml').indexOf('<ribbon/>') !== -1);
  const ct = z.txt('[Content_Types].xml');
  assert.ok(/<Override PartName="\/xl\/workbook.xml" ContentType="application\/vnd.ms-excel.sheet.macroEnabled.main\+xml"\/>/.test(ct), 'macroEnabled workbook type');
  assert.ok(ct.indexOf('spreadsheetml.sheet.main+xml') === -1, 'no plain workbook type left');
  assert.ok(/<Default Extension="bin" ContentType="application\/vnd.ms-office.vbaProject"\/>/.test(ct), 'bin Default is vbaProject');
  assert.ok(/<Override PartName="\/xl\/vbaProject.bin" ContentType="application\/vnd.ms-office.vbaProject"\/>/.test(ct), 'vbaProject Override');
  assert.ok(/<Override PartName="\/xl\/vbaProjectSignature.bin" ContentType="application\/vnd.ms-office.vbaProjectSignature"\/>/.test(ct));
  assert.ok(/<Override PartName="\/customUI\/customUI14.xml"/.test(ct));
  const wr = z.txt('xl/_rels/workbook.xml.rels');
  const vrel = /<Relationship Id="(rId\d+)" Type="http:\/\/schemas.microsoft.com\/office\/2006\/relationships\/vbaProject" Target="vbaProject.bin"\/>/.exec(wr);
  assert.ok(vrel, 'vbaProject relationship');
  const ids = (wr.match(/Id="[^"]+"/g) || []);
  assert.equal(new Set(ids).size, ids.length, 'relationship ids are unique');
  assert.ok(/ui\/extensibility" Target="customUI\/customUI14.xml"/.test(z.txt('_rels/.rels')), 'root customUI rel');
  const wbx = z.txt('xl/workbook.xml');
  assert.ok(/<workbookPr\b[^>]*codeName="MeinBuch"/.test(wbx), 'ThisWorkbook code name carried over');
  const sheetPath = 'xl/worksheets/sheet1.xml';
  assert.ok(/<worksheet\b[^>]*><sheetPr codeName="DataSheet"\/>/.test(z.txt(sheetPath)) || /<sheetPr\b[^>]*codeName="DataSheet"/.test(z.txt(sheetPath)), 'sheet code name carried over');
  const wb = XLSX.read(buf, { type: 'buffer' });
  assert.deepEqual(wb.SheetNames, ['Data & Co']);
  assert.equal(wb.Sheets['Data & Co'].B2.v, 42, 'edited value');
  assert.equal(wb.Sheets['Data & Co'].B4.f, 'SUM(B2:B3)');
  /* a second Save still keeps them (in memory, not re-read from the written file) */
  setCell(ctx, 4, 0, 'More');
  await session.save({ explicit: true });
  assert.equal(h.writes.length, 2);
  assert.deepEqual(Array.from(unzip(await blobBuf(lastWrite(h))).get('xl/vbaProject.bin')), Array.from(VBA));
});

test('Hub: an opened .xlsm saves back to the same file in its folder', async function () {
  const { ctx, F, session, root } = load({ hub: true });
  const work = fakeDir('Work'); root.dirs.set('Work', work); work.files.set('Macro.xlsm', 'old');
  await openXlsm(ctx, F, 'Macro.xlsm', buildXlsm(), { dest: { kind: 'hub', drive: 'local', path: 'Work', name: 'Macro.xlsm' } });
  setCell(ctx, 2, 1, '7');
  await session.save({ explicit: true });
  assert.deepEqual(allNames(root), ['Work/Macro.xlsm']);
  const buf = await blobBuf(work.files.get('Macro.xlsm'));
  assert.deepEqual(Array.from(unzip(buf).get('xl/vbaProject.bin')), Array.from(VBA));
  assert.equal(XLSX.read(buf, { type: 'buffer' }).Sheets['Data & Co'].B3.v, 7);
});

test('a renamed sheet loses its code name; ThisWorkbook keeps it', async function () {
  const { ctx, F } = load();
  await openXlsm(ctx, F, 'Macro.xlsm', buildXlsm(), {});
  vm.runInContext('workbook.sheets[0].name = "Renamed"', ctx);
  const z = unzip(await blobBuf(await F.blobFor('xlsm')));
  assert.ok(!/codeName="DataSheet"/.test(z.txt('xl/worksheets/sheet1.xml')));
  assert.ok(/codeName="MeinBuch"/.test(z.txt('xl/workbook.xml')));
  assert.deepEqual(Array.from(z.get('xl/vbaProject.bin')), Array.from(VBA));
});

test('an .xlsm without vbaProject.bin saves as the plain workbook with the macroEnabled type', async function () {
  const { ctx, F } = load();
  await openXlsm(ctx, F, 'Plain.xlsm', buildXlsm({ vba: false }), {});
  assert.equal(F.format, 'xlsm');
  assert.ok(F.macro && !F.macro.hasVba);
  const z = unzip(await blobBuf(await F.blobFor('xlsm')));
  assert.equal(z.get('xl/vbaProject.bin'), null);
  const ct = z.txt('[Content_Types].xml');
  assert.ok(ct.indexOf('application/vnd.ms-excel.sheet.macroEnabled.main+xml') !== -1);
  assert.ok(ct.indexOf('vbaProject') === -1);
  assert.ok(z.txt('xl/_rels/workbook.xml.rels').indexOf('vbaProject') === -1);
});

test('unreadable macro parts: Save still writes an .xlsm (macroEnabled, no error)', async function () {
  const { ctx, F, session } = load({ picker: true });
  const h = fakeHandle('Odd.xlsm');
  ctx.SHEET_XLSM.extract = () => { throw new Error('broken'); };
  await openXlsm(ctx, F, 'Odd.xlsm', buildXlsm(), { handle: h });
  assert.equal(F.format, 'xlsm');
  setCell(ctx, 5, 0, 'x');
  await session.save({ explicit: true });
  const z = unzip(await blobBuf(lastWrite(h)));
  assert.ok(z.txt('[Content_Types].xml').indexOf('macroEnabled.main+xml') !== -1);
});

/* ---------- Save As ---------- */
test('Save As lists .xlsm only for a workbook from an .xlsm; typed .xlsm picks it only then', async function () {
  const a = load({ hub: true, form: () => null });
  a.F.opened('xlsx', null, 'Sales.xlsx');
  await a.session.save({ explicit: true, saveAs: true });
  assert.deepEqual(JSON.parse(JSON.stringify(a.rec.dialogs[0].spec.fields[1].options.map((x) => x.value))), ['hos', 'xlsx', 'ods', 'csv']);
  assert.equal(a.F.saveAsChoice({ name: 'Copy.xlsm', format: 'xlsx' }, 'xlsx').format, 'xlsx', 'no macros: typed .xlsm falls back to .xlsx');
  assert.equal(a.F.saveAsChoice({ name: 'Copy', format: 'xlsm' }, 'xlsx').format, 'xlsx');

  const b = load({ hub: true, form: () => null });
  await openXlsm(b.ctx, b.F, 'Macro.xlsm', buildXlsm(), { dest: { kind: 'hub', drive: 'local', path: 'Documents', name: 'Macro.xlsm' } });
  await b.session.save({ explicit: true, saveAs: true });
  const fld = b.rec.dialogs[0].spec.fields[1];
  assert.deepEqual(JSON.parse(JSON.stringify(fld.options.map((x) => x.value))), ['hos', 'xlsx', 'xlsm', 'ods', 'csv']);
  assert.equal(fld.options[2].label, 'Excel with macros (.xlsm)');
  assert.equal(fld.value, 'xlsm', 'current format preselected');
  assert.deepEqual(JSON.parse(JSON.stringify(b.F.saveAsChoice({ name: 'Copy.xlsm', format: 'xlsx' }, 'xlsm'))), { name: 'Copy', format: 'xlsm', file: 'Copy.xlsm' });
  b.F.reset();
  assert.equal(b.F.macro, null, 'New / .hos open forgets the macro parts');
});

test('Save As .xlsx from an .xlsm drops the macro parts silently; Save As .xlsm keeps them', async function () {
  let answer = { name: 'NoMacros', format: 'xlsx' };
  const { ctx, F, session, rec, root } = load({ hub: true, form: () => answer });
  const docs = fakeDir('Documents'); root.dirs.set('Documents', docs);
  await openXlsm(ctx, F, 'Macro.xlsm', buildXlsm(), { dest: { kind: 'hub', drive: 'local', path: 'Documents', name: 'Macro.xlsm' } });
  await session.save({ explicit: true, saveAs: true });
  assert.equal(F.format, 'xlsx');
  const z = unzip(await blobBuf(docs.files.get('NoMacros.xlsx')));
  assert.equal(z.get('xl/vbaProject.bin'), null);
  assert.equal(z.get('xl/vbaProjectSignature.bin'), null);
  assert.equal(z.get('customUI/customUI14.xml'), null);
  assert.ok(z.txt('[Content_Types].xml').indexOf('macroEnabled.main+xml') === -1);
  assert.ok(z.txt('[Content_Types].xml').indexOf('vbaProject') === -1);
  assert.ok(z.txt('xl/_rels/workbook.xml.rels').indexOf('vbaProject') === -1);
  assert.equal(rec.dialogs.length, 1, 'only the Save As box, no warning');
  answer = { name: 'Again.xlsm', format: 'xlsx' };
  await session.save({ explicit: true, saveAs: true });
  assert.equal(F.format, 'xlsm');
  assert.deepEqual(Array.from(unzip(await blobBuf(docs.files.get('Again.xlsm'))).get('xl/vbaProject.bin')), Array.from(VBA));
  assert.equal(docs.files.get('Again.xlsm').type.toLowerCase(), 'application/vnd.ms-excel.sheet.macroenabled.12');
});

/* ---------- autosave and memory ---------- */
test('timers never write the .xlsm; a flush writes it only when changed; macros never reach the .hos fingerprint', async function () {
  const { ctx, F, session, root } = load({ hub: true });
  const docs = fakeDir('Documents'); root.dirs.set('Documents', docs);
  await openXlsm(ctx, F, 'Macro.xlsm', buildXlsm(), { dest: { kind: 'hub', drive: 'local', path: 'Documents', name: 'Macro.xlsm' } });
  await session.autosave();
  await session.autosave({ flush: true });
  assert.equal(docs.files.size, 0, 'unchanged: nothing written');
  setCell(ctx, 6, 0, 'y');
  await session.autosave({ timer: true });
  assert.equal(docs.files.size, 0, 'the timer never writes');
  await session.autosave({ flush: true });
  assert.deepEqual(Array.from(unzip(await blobBuf(docs.files.get('Macro.xlsm'))).get('xl/vbaProject.bin')), Array.from(VBA));
  assert.ok(F.sig().indexOf('vbaProject') === -1);
  const src = read('spreadsheet_xlsm.js') + read('spreadsheet_saveformat.js');
  assert.ok(!/localStorage\s*[.\[]|setItem\(/.test(src), 'macro parts are never put in localStorage');
});

test('opening an .xlsx after an .xlsm forgets the macro parts', async function () {
  const { ctx, F } = load();
  await openXlsm(ctx, F, 'Macro.xlsm', buildXlsm(), {});
  assert.ok(F.macro);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['A']]), 'S1');
  await openXlsm(ctx, F, 'Plain.xlsx', Buffer.from(XLSX.write(book, { bookType: 'xlsx', type: 'array' })), {});
  assert.equal(F.format, 'xlsx');
  assert.equal(F.macro, null);
});

/* ---------- wiring ---------- */
test('wiring: title, VERSION, ?v= tokens, script order, readme', function () {
  const html = read('spreadsheet.html');
  assert.ok(html.indexOf('<title>Spreadsheet SH33</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH33) <title>Spreadsheet SH32</title> -->') !== -1);
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  /* (before SH35) every file below was checked for ?v=SH33; SH35 bumps settings and xlsx. */
  /* (before SH36) settings was SH33 or SH35; SH36 bumps settings. */
  for (const f of ['spreadsheet_toolbar.js', 'spreadsheet_settings.js', 'spreadsheet_xlsx.js', 'spreadsheet_xlsm.js', 'spreadsheet_saveformat.js']) {
    /* (before SH37) assert.ok(live.indexOf(f + '?v=SH33') !== -1 || live.indexOf(f + '?v=SH35') !== -1 || live.indexOf(f + '?v=SH36') !== -1, f); */
    /* (before SH40) assert.ok(new RegExp(f.replace('.', '\\.') + '\\?v=SH3[3-9]').test(live), f); */
    assert.ok(new RegExp(f.replace('.', '\\.') + '\\?v=SH(3[3-9]|40)').test(live), f);
  }
  /* (before SH35) assert.ok(live.indexOf('spreadsheet_xlsm.js?v=SH33') > live.indexOf('spreadsheet_xlsx.js?v=SH33')); */
  assert.ok(live.indexOf('spreadsheet_xlsm.js?v=SH33') > live.indexOf('spreadsheet_xlsx.js?v='));
  assert.ok(live.indexOf('spreadsheet_xlsm.js?v=SH33') < live.indexOf('spreadsheet_saveformat.js?v=SH33'));
  assert.ok(read('spreadsheet_settings.js').indexOf('var SHEET_VERSION = "SH33";') !== -1);
  const readme = read('spreadsheet_readme.md');
  const sec = readme.slice(readme.indexOf('## SH33'));
  assert.ok(readme.indexOf('## SH33') !== -1);
  assert.ok(/localStorage/.test(sec) && /code name/i.test(sec) && /vbaProject\.bin/.test(sec));
});

/* ---------- external checks ---------- */
function which(b) { try { cp.execFileSync('which', [b], { stdio: 'pipe' }); return true; } catch (e) { return false; } }
const SOFFICE = ['soffice', 'libreoffice'].find(which) || '';
const PY = which('python3');

async function savedXlsm() {
  const { ctx, F } = load();
  await openXlsm(ctx, F, 'Macro.xlsm', buildXlsm(), {});
  setCell(ctx, 1, 1, '42');
  setCell(ctx, 3, 0, 'Total');
  setCell(ctx, 3, 1, '=SUM(B2:B3)');
  vm.runInContext('recalcAll()', ctx);
  return blobBuf(await F.blobFor('xlsm'));
}

test('python3 zipfile: the saved .xlsm is a valid zip with the macro parts', { skip: !PY && 'python3 not installed' }, async function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sh33-'));
  try {
    const p = path.join(tmp, 'Macro.xlsm');
    fs.writeFileSync(p, await savedXlsm());
    const out = cp.execFileSync('python3', ['-c', [
      'import sys, zipfile, json',
      'z = zipfile.ZipFile(sys.argv[1])',
      'assert z.testzip() is None',
      'print(json.dumps({"names": z.namelist(), "vba": list(z.read("xl/vbaProject.bin"))}))'
    ].join('\n'), p], { encoding: 'utf8' });
    const j = JSON.parse(out);
    for (const n of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/vbaProject.bin', 'xl/vbaProjectSignature.bin', 'customUI/customUI14.xml']) {
      assert.ok(j.names.indexOf(n) !== -1, n);
    }
    assert.deepEqual(j.vba, Array.from(VBA));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('soffice: the saved .xlsm converts to csv with the edited values', { skip: !SOFFICE && 'soffice not installed', timeout: 180000 }, async function () {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sh33-'));
  try {
    const p = path.join(tmp, 'Macro.xlsm');
    fs.writeFileSync(p, await savedXlsm());
    const out = path.join(tmp, 'out');
    fs.mkdirSync(out);
    cp.execFileSync(SOFFICE, ['-env:UserInstallation=file://' + path.join(tmp, 'profile'), '--headless', '--convert-to', 'csv', '--outdir', out, p], { stdio: 'pipe', timeout: 150000 });
    const csv = fs.readFileSync(path.join(out, 'Macro.csv'), 'utf8').replace(/\r/g, '').trim();
    assert.equal(csv, 'Item,Qty\nPens,42\nInk,3\nTotal,45');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
