/* DW12: Writer saves directly to .docx and .odt (like LibreOffice).
   - pure logic of writer-how.js: format from an opened file name, Save As
     target names, MIME types, the save router (which generator runs);
   - Save of an opened .docx / .odt writes back to the same Hub file in the
     same format (no .how copy), Save As picks a format that later Saves keep,
     timers never rewrite a .docx / .odt, and no warning / confirm is shown
     (OfficeDialog stubbed: only the Save As form may open);
   - standalone: Save writes to the picked / opened file handle;
   - writer-docxopen.js: opening a .docx no longer saves a .how copy;
   - if LibreOffice (soffice) is installed: the real generators build a .docx
     and an .odt from a small document and soffice converts them to text.
   Loads the modules in a vm with stubs. No browser, no network.
   Run: node --test apps/office/writer/test/test-dw12-saveformat.cjs */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const DIR = path.resolve(__dirname, '..');
const ROOT = path.resolve(DIR, '../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HOW = read('apps/office/writer/modules/writer-how.js');
const DOCXOPEN = read('apps/office/writer/modules/writer-docxopen.js');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ODT_MIME = 'application/vnd.oasis.opendocument.text';

/* ---------------------------------------------------------------- pure logic */
function loadHowPlain() {
  const ctx = { console, Blob, Promise, JSON };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(HOW, ctx, { filename: 'writer-how.js' });
  return ctx.Writer.how;
}

test('format chosen from an opened file name', () => {
  const How = loadHowPlain();
  assert.equal(How.formatOf('Report.docx'), 'docx');
  assert.equal(How.formatOf('REPORT.DOCX'), 'docx');
  assert.equal(How.formatOf('Notes.odt'), 'odt');
  assert.equal(How.formatOf('Plan.how'), 'how');
  assert.equal(How.formatOf('readme.txt'), 'how');
  assert.equal(How.formatOf('no extension'), 'how');
  assert.equal(How.extFormat('a.txt'), '');
});

test('Save As target names: stem + the new extension', () => {
  const How = loadHowPlain();
  assert.equal(How.targetName('Report.docx', 'odt'), 'Report.odt');
  assert.equal(How.targetName('Report.odt', 'docx'), 'Report.docx');
  assert.equal(How.targetName('Report.docx', 'how'), 'Report.how');
  assert.equal(How.targetName('Report', 'docx'), 'Report.docx');
  assert.equal(How.targetName('Q?.how', 'odt'), 'Q.odt');
  /* .how names behave as before */
  assert.equal(How.fileName('Quarterly review'), 'Quarterly review.how');
  assert.equal(How.fileName('Quarterly review.how'), 'Quarterly review.how');
  assert.equal(How.stem('Report.docx'), 'Report');
});

test('MIME types', () => {
  const How = loadHowPlain();
  assert.equal(How.mimeOf('docx'), DOCX_MIME);
  assert.equal(How.mimeOf('odt'), ODT_MIME);
  assert.equal(How.mimeOf('how'), 'application/json');
  assert.deepEqual(Array.from(How.FORMAT_ORDER), ['how', 'docx', 'odt']);
});

function stubExport(calls) {
  return {
    docxHtml: (h) => { calls.push('docxHtml'); return '<p>D</p>'; },
    combinedHtml: () => { calls.push('combinedHtml'); return '<p>O</p>'; },
    withDocx: (fn) => { calls.push('withDocx'); return Promise.resolve(fn()); },
    makeDocxBlob: (html) => { calls.push('makeDocxBlob:' + html); return new Blob(['DOCX:' + html], { type: DOCX_MIME }); },
    makeOdtBlob: (html) => { calls.push('makeOdtBlob:' + html); return new Blob(['ODT:' + html], { type: ODT_MIME }); }
  };
}

test('the save router picks the right generator', async () => {
  const How = loadHowPlain();
  assert.equal(How.generatorFor('docx'), 'docx');
  assert.equal(How.generatorFor('odt'), 'odt');
  assert.equal(How.generatorFor('how'), 'how');
  assert.equal(How.generatorFor('txt'), 'how');
  let calls = [];
  let blob = await How.blobFor('docx', stubExport(calls));
  assert.equal(await blob.text(), 'DOCX:<p>D</p>');
  assert.deepEqual(calls, ['withDocx', 'docxHtml', 'makeDocxBlob:<p>D</p>']);
  calls = [];
  blob = await How.blobFor('odt', stubExport(calls));
  assert.equal(await blob.text(), 'ODT:<p>O</p>');
  assert.deepEqual(calls, ['combinedHtml', 'makeOdtBlob:<p>O</p>']);
  await assert.rejects(How.blobFor('how', stubExport([])));
});

/* ---------------------------------------------------------------- Writer in a vm */
function makeDrive() {
  const files = new Map();
  const docs = {
    getFileHandle(name, opts) {
      if (!files.has(name) && !(opts && opts.create)) return Promise.reject(new Error('NotFound'));
      return Promise.resolve({
        name,
        createWritable() {
          let text = '';
          return Promise.resolve({
            write(blob) { return blob.text().then((t) => { text = t; }); },
            close() { files.set(name, text); return Promise.resolve(); },
            abort() { return Promise.resolve(); }
          });
        }
      });
    },
    removeEntry(name) { files.delete(name); return Promise.resolve(); }
  };
  const root = { getDirectoryHandle() { return Promise.resolve(docs); } };
  return {
    files,
    FsDrives: { hasLocal: true, handle: () => Promise.resolve(root) },
    FsOps: {
      exists: (dir, name) => Promise.resolve(files.has(name)),
      list: () => Promise.resolve(Array.from(files.keys()).map((name) => ({ kind: 'file', name, modified: 0 }))),
      uniqueName: (dir, name) => Promise.resolve(name.replace(/(\.\w+)$/, ' (2)$1'))
    }
  };
}
function el() {
  return { innerHTML: '', value: '', querySelector() { return null; }, get textContent() { return String(this.innerHTML).replace(/<[^>]*>/g, ''); } };
}
function fakeHandle(name, store) {
  return {
    kind: 'file',
    name,
    createWritable() {
      let data = '';
      return Promise.resolve({
        write(blob) { return blob.text().then((t) => { data = t; }); },
        close() { store.set(name, data); return Promise.resolve(); },
        abort() { return Promise.resolve(); }
      });
    }
  };
}

/* hub: true = inside the Hub (Documents drive), false = standalone. */
function boot(opts) {
  opts = opts || {};
  const drive = opts.drive || makeDrive();
  const state = { html: '<p>Hello</p>', name: '', dialogs: [], toasts: [], exportCalls: [], pickerCalls: [] };
  const input = el();
  const ctx = {
    console, Blob, Promise, JSON, Object, setTimeout, clearTimeout,
    location: { search: '', origin: 'https://hub.test', hash: '' },
    document: {
      body: { classList: { contains: (c) => c === 'in-hub' && !!opts.hub }, appendChild() {} },
      createElement: () => ({ ...el(), click() {}, remove() {} }),
      getElementById: (id) => (id === 'fileNameInput' ? input : null)
    },
    URL: { createObjectURL: () => 'blob:x', revokeObjectURL() {} },
    addEventListener: () => {}
  };
  if (opts.hub) { ctx.FsDrives = drive.FsDrives; ctx.FsOps = drive.FsOps; }
  if (opts.picker) ctx.showSaveFilePicker = (o) => { state.pickerCalls.push(o); return Promise.resolve(opts.picker(o)); };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.parent = opts.hub ? { postMessage() {} } : ctx;
  vm.createContext(ctx);
  const W = ctx.Writer = {};
  W.config = { landscapeClass: 'landscape', paperSize: 'A4', marginPreset: 'normal', marginTopCm: 1, marginBottomCm: 1, marginLeftCm: 1, marginRightCm: 1 };
  W.storage = {
    loadedName: '', autoName: '',
    isAutoName: () => false,
    currentName: () => state.name,
    setCurrentName: (n) => { state.name = n; input.value = n; },
    fillNameIfEmpty: () => state.name || (state.name = 'Untitled 1'),
    isBlankUnsaved: () => false,
    noteSaved() {}, noteFailed() {},
    clashDialog: (n) => { state.dialogs.push('clash:' + n); return Promise.resolve(null); }
  };
  W.pages = { combinedHtml: () => state.html };
  W.ui = { showToast: (m) => state.toasts.push(m) };
  W.export = stubExport(state.exportCalls);
  /* OfficeDialog stub: record every call. Only Save As's form answers. */
  W.dialog = {
    confirm: (o) => { state.dialogs.push('confirm:' + (o && o.title)); return Promise.resolve(true); },
    alert: (o) => { state.dialogs.push('alert:' + (o && o.title)); return Promise.resolve(true); },
    prompt: (o) => { state.dialogs.push('prompt:' + (o && o.title)); return Promise.resolve(state.name); },
    form: (o) => { state.dialogs.push('form:' + o.title); state.lastForm = o; return Promise.resolve(opts.formAnswer ? opts.formAnswer(o) : null); }
  };
  vm.runInContext(HOW, ctx, { filename: 'writer-how.js' });
  return { ctx, W, How: W.how, drive, state, input };
}

test('Hub: an opened .docx saves back to the same file as .docx, with no .how copy and no warning', async () => {
  const t = boot({ hub: true });
  t.drive.files.set('Report.docx', 'ORIGINAL');
  t.W.storage.setCurrentName('Report');
  t.How.opened('docx', { kind: 'hub', drive: 'local', path: 'Documents', name: 'Report.docx' });
  assert.equal(t.How.format, 'docx');
  t.state.html = '<p>Edited</p>';
  const res = await t.How.save({ explicit: true });
  assert.equal(res.wrote, true);
  assert.equal(res.name, 'Report');
  assert.equal(res.fmt, 'docx');
  assert.equal(t.drive.files.get('Report.docx'), 'DOCX:<p>D</p>');
  assert.deepEqual(Array.from(t.drive.files.keys()), ['Report.docx']);
  assert.ok(t.state.exportCalls.includes('makeDocxBlob:<p>D</p>'));
  assert.deepEqual(t.state.dialogs, [], 'no confirm / alert / keep-format box');
  assert.deepEqual(t.state.toasts, [], 'no warning toast');
  assert.equal(t.input.value, 'Report', 'the name stays the file name without its extension');
});

test('Hub: an opened .odt saves back as .odt into its own folder', async () => {
  const t = boot({ hub: true });
  t.W.storage.setCurrentName('Notes');
  t.How.opened('odt', { kind: 'hub', drive: 'local', path: 'Work', name: 'Notes.odt' });
  t.state.html = '<p>More</p>';
  await t.How.save({ explicit: true });
  assert.equal(t.drive.files.get('Notes.odt'), 'ODT:<p>O</p>');
  assert.equal(t.drive.files.has('Notes.how'), false);
  assert.deepEqual(t.state.dialogs, []);
});

test('timers never rewrite a .docx; a flush writes it only when the content changed', async () => {
  const t = boot({ hub: true });
  t.W.storage.setCurrentName('Report');
  t.How.opened('docx', { kind: 'hub', drive: 'local', path: 'Documents', name: 'Report.docx' });
  /* unchanged: neither timer nor flush writes */
  assert.equal((await t.How.autosave({ timer: true })).wrote, false);
  assert.equal((await t.How.autosave()).wrote, false);
  t.state.html = '<p>Changed</p>';
  assert.equal((await t.How.autosave({ timer: true })).wrote, false, 'typing timer');
  assert.equal(t.drive.files.size, 0);
  assert.equal(t.state.exportCalls.length, 0, 'no .docx was built on the timer');
  const r = await t.How.autosave();
  assert.equal(r.wrote, true, 'leave / New / Open flush writes the changed file');
  assert.equal(t.drive.files.get('Report.docx'), 'DOCX:<p>D</p>');
  assert.equal(t.drive.files.has('Report.how'), false);
  /* written again only after another change */
  t.state.exportCalls.length = 0;
  assert.equal((await t.How.autosave()).wrote, false);
  assert.equal(t.state.exportCalls.length, 0);
});

test('a .docx with no file to go to is not written by any autosave', async () => {
  const t = boot({ hub: true });
  t.W.storage.setCurrentName('Dropped');
  t.How.opened('docx', null);
  t.state.html = '<p>x</p>';
  assert.equal((await t.How.autosave()).wrote, false);
  assert.equal(t.drive.files.size, 0);
  /* Save writes it to Documents in its format */
  await t.How.save({ explicit: true });
  assert.deepEqual(Array.from(t.drive.files.keys()), ['Dropped.docx']);
});

test('Save As picks a format; later Saves keep it; no warning', async () => {
  const t = boot({ hub: true, formatAnswer: null, formAnswer: () => ({ name: 'Report', format: 'odt' }) });
  t.W.storage.setCurrentName('Report');
  t.How.opened('docx', { kind: 'hub', drive: 'local', path: 'Documents', name: 'Report.docx' });
  t.drive.files.set('Report.docx', 'ORIGINAL');
  const res = await t.How.save({ explicit: true, saveAs: true });
  assert.equal(res.wrote, true);
  assert.equal(t.How.format, 'odt');
  assert.equal(t.drive.files.get('Report.odt'), 'ODT:<p>O</p>');
  assert.equal(t.drive.files.get('Report.docx'), 'ORIGINAL', 'Save As keeps the old file');
  /* the form lists the three formats, current one selected */
  const fmt = t.state.lastForm.fields.find((f) => f.key === 'format');
  assert.deepEqual(JSON.parse(JSON.stringify(fmt.options.map((o) => o.value))), ['how', 'docx', 'odt']);
  assert.equal(fmt.value, 'docx');
  assert.deepEqual(JSON.parse(JSON.stringify(fmt.options.map((o) => o.label))), ['Writer document (.how)', 'Word (.docx)', 'OpenDocument Text (.odt)']);
  t.state.html = '<p>Later</p>';
  t.drive.files.set('Report.odt', 'OLD');
  await t.How.save({ explicit: true });
  assert.equal(t.drive.files.get('Report.odt'), 'ODT:<p>O</p>');
  assert.deepEqual(t.state.dialogs, ['form:Save as'], 'only the Save As form, no confirm / alert');
  assert.deepEqual(t.state.toasts, []);
});

test('Save As back to Writer document (.how) writes a .how and keeps it', async () => {
  const t = boot({ hub: true, formAnswer: () => ({ name: 'Report', format: 'how' }) });
  t.W.storage.setCurrentName('Report');
  t.How.opened('docx', { kind: 'hub', drive: 'local', path: 'Documents', name: 'Report.docx' });
  await t.How.save({ explicit: true, saveAs: true });
  assert.equal(t.How.format, 'how');
  const doc = JSON.parse(t.drive.files.get('Report.how'));
  assert.equal(doc.format, 'how');
  assert.equal(doc.html, '<p>Hello</p>');
});

test('a new .how document still autosaves as .how (unchanged)', async () => {
  const t = boot({ hub: true });
  t.W.storage.setCurrentName('Plan');
  await t.How.autosave({ timer: true });
  assert.deepEqual(Array.from(t.drive.files.keys()), ['Plan.how']);
  assert.equal(t.state.exportCalls.length, 0);
});

test('standalone: Save writes the opened file handle in its format', async () => {
  const disk = new Map();
  const t = boot({ hub: false });
  t.W.storage.setCurrentName('Letter');
  const h = fakeHandle('Letter.docx', disk);
  t.How.opened('docx', { kind: 'handle', handle: h, name: 'Letter.docx' });
  t.state.html = '<p>Edit</p>';
  assert.equal((await t.How.autosave({ timer: true })).wrote, false);
  const res = await t.How.save({ explicit: true });
  assert.equal(res.wrote, true);
  assert.equal(disk.get('Letter.docx'), 'DOCX:<p>D</p>');
  assert.deepEqual(t.state.dialogs, []);
});

test('standalone: Save As asks name + format, then the picker; an extension typed in the picker wins', async () => {
  const disk = new Map();
  const t = boot({ hub: false, formAnswer: () => ({ name: 'Letter', format: 'docx' }), picker: (o) => fakeHandle('Letter final.odt', disk) });
  t.W.storage.setCurrentName('Letter');
  await t.How.save({ explicit: true, saveAs: true });
  assert.equal(t.state.pickerCalls[0].suggestedName, 'Letter.docx');
  assert.deepEqual(JSON.parse(JSON.stringify(t.state.pickerCalls[0].types[0].accept)), { [DOCX_MIME]: ['.docx'] });
  assert.equal(disk.get('Letter final.odt'), 'ODT:<p>O</p>');
  assert.equal(t.How.format, 'odt');
  assert.equal(t.input.value, 'Letter final');
  assert.deepEqual(t.state.dialogs, ['form:Save as']);
});

test('Save As cancelled writes nothing', async () => {
  const t = boot({ hub: true, formAnswer: () => null });
  t.W.storage.setCurrentName('X');
  const res = await t.How.save({ explicit: true, saveAs: true });
  assert.equal(res.cancelled, true);
  assert.equal(t.drive.files.size, 0);
});

/* ---------------------------------------------------------------- docxopen */
function bootOpen(name, hubDest) {
  const t = boot({ hub: true });
  const ctx = t.ctx;
  const W = t.W;
  ctx.TextDecoder = TextDecoder;
  ctx.Uint8Array = Uint8Array;
  ctx.document.addEventListener = () => {};
  W.app = { inputTimer: 0 };
  W.docxread = { read: () => Promise.resolve({ html: '<p>From docx</p>', hf: null, page: null, notes: [] }) };
  W.odtread = { read: () => Promise.resolve({ html: '<p>From odt</p>', hf: null, page: null, notes: [] }) };
  W.txt = { stem: (n) => n.replace(/\.txt$/i, ''), read: () => Promise.resolve({ html: '<p>From txt</p>', hf: null, page: null, notes: [] }) };
  const ed = { innerHTML: '' };
  W.pages.rebuildSinglePage = () => {};
  W.pages.firstEditor = () => ed;
  W.pages.layoutAll = () => {};
  W.pages.combinedHtml = () => ed.innerHTML;
  W.editor = { stripMarks() {} };
  W.history = { reset() {} };
  W.ui.setPage = () => {}; W.ui.setOrientation = () => {};
  /* the blank page before the open is not flushed to a file */
  W.storage.isBlankUnsaved = (h) => !h;
  vm.runInContext(DOCXOPEN, ctx, { filename: 'writer-docxopen.js' });
  const file = { name, size: 10, type: '', arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)) };
  return W.docxopen.open(file, hubDest ? { dest: hubDest } : undefined).then((r) => ({ t, r, ed }));
}

test('opening a .docx from Hub Files makes no .how copy; Save writes the .docx back', async () => {
  const { t, r } = await bootOpen('Minutes.docx', { kind: 'hub', drive: 'local', path: 'Documents', name: 'Minutes.docx' });
  assert.equal(r, 'Minutes');
  assert.equal(t.How.format, 'docx');
  assert.equal(t.drive.files.size, 0, 'no .how copy');
  await t.How.save({ explicit: true });
  assert.deepEqual(Array.from(t.drive.files.keys()), ['Minutes.docx']);
});

test('opening a .odt keeps odt; opening a .txt still saves a .how (DW9)', async () => {
  const a = await bootOpen('Notes.odt', null);
  assert.equal(a.t.How.format, 'odt');
  assert.equal(a.t.drive.files.size, 0);
  const b = await bootOpen('readme.txt', null);
  assert.equal(b.t.How.format, 'how');
  assert.deepEqual(Array.from(b.t.drive.files.keys()), ['readme.how']);
});

test('release is DW12', () => {
  const html = fs.readFileSync(path.join(DIR, 'writer.html'), 'utf8');
  /* (before DW13) assert.ok(html.replace(/<!--[\s\S]*?-->/g, '').indexOf('<title>Writer DW12</title>') !== -1); */
  /* (before DW13b) assert.ok(/<title>Writer DW1(2|3)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW13c) assert.ok(/<title>Writer DW1(2|3|3b)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  assert.ok(/<title>Writer DW1(2|3|3b|3c)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, '')));
  assert.ok(html.indexOf('<!-- (before DW12) <title>Writer DW11a</title> -->') !== -1);
  const cfg = fs.readFileSync(path.join(DIR, 'modules/writer-config.js'), 'utf8');
  /* (before DW13) assert.ok(/release:\s*'DW12'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW13b) assert.ok(/release:\s*'DW1(2|3)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW13c) assert.ok(/release:\s*'DW1(2|3|3b)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW1(2|3|3b|3c)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
  /* no format warning anywhere in the save code */
  const how = HOW.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/keep (this|current) format/i.test(how));
  assert.ok(!/\.confirm\(/.test(how));
});

/* ---------------------------------------------------------------- LibreOffice round trip */
/* A tiny DOM for writer-docxgen.js: paragraphs and inline <b>/<i> with text only. */
function miniDom(html) {
  function textNode(s, parent) { return { nodeType: 3, nodeName: '#text', nodeValue: s, textContent: s, parentNode: parent, childNodes: [] }; }
  function elem(tag, parent) {
    const n = {
      nodeType: 1, tagName: tag.toUpperCase(), nodeName: tag.toUpperCase(), parentNode: parent, childNodes: [],
      style: {}, classList: { contains: () => false }, attrs: {},
      getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; },
      hasAttribute(k) { return this.attrs[k] != null; },
      querySelector() { return null; }, querySelectorAll() { return []; },
      get textContent() { return this.childNodes.map((c) => c.textContent).join(''); },
      get firstChild() { return this.childNodes[0] || null; },
      get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
    };
    return n;
  }
  const body = elem('body', null);
  let cur = body;
  const re = /<(\/?)(\w+)[^>]*>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[3]) cur.childNodes.push(textNode(m[3], cur));
    else if (m[1]) cur = cur.parentNode || body;
    else { const e = elem(m[2], cur); cur.childNodes.push(e); cur = e; }
  }
  function link(n) {
    n.childNodes.forEach((c, i) => {
      c.previousSibling = n.childNodes[i - 1] || null;
      c.nextSibling = n.childNodes[i + 1] || null;
      c.nextElementSibling = n.childNodes.slice(i + 1).find((x) => x.nodeType === 1) || null;
      link(c);
    });
  }
  link(body);
  return { body };
}

function hasSoffice() {
  const r = spawnSync('soffice', ['--version'], { encoding: 'utf8', timeout: 60000 });
  return r.status === 0;
}

test('LibreOffice round trip: .docx and .odt built by Save keep the text', { timeout: 240000 }, async (t) => {
  if (!hasSoffice()) { t.skip('soffice not installed'); return; }
  const BODY = '<p>Hello DW12 world</p><p>Second <b>bold</b> line</p>';
  const ctx = {
    Uint8Array, ArrayBuffer, DataView, TextEncoder, TextDecoder, Blob, Date, Buffer, Math, JSON, Promise,
    console: { log() {}, warn() {}, error() {} },
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    document: { body: { classList: { contains: () => false } }, createElement: () => ({ innerHTML: '', querySelectorAll: () => [] }) },
    addEventListener() {}, removeEventListener() {},
    DOMParser: function () { this.parseFromString = (s) => miniDom(s.replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, '')); }
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['writer-config.js', 'writer-hfimg.js', 'writer-zip.js', 'writer-docxgen.js', 'writer-odtgen.js', 'writer-export.js', 'writer-how.js'].forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(DIR, 'modules', f), 'utf8'), ctx, { filename: f });
  });
  const W = ctx.Writer;
  W.hf = { data: { head: ['', '', ''], foot: ['', '', ''], img: { head: [null, null, null], foot: [null, null, null] } }, today: () => '18/11/2026' };
  /* the open document's HTML, as Save would read it */
  W.flow = { joinedHtml: () => BODY };
  W.export.docxHtml = () => BODY;   /* the page-break rewrite needs a real DOM; the body has none */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dw12-'));
  for (const fmt of ['docx', 'odt']) {
    const blob = await W.how.blobFor(fmt, W.export);
    const file = path.join(tmp, 'doc.' + fmt);
    fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
    const out = path.join(tmp, fmt);
    fs.mkdirSync(out);
    const r = spawnSync('soffice', ['--headless', '-env:UserInstallation=file://' + path.join(tmp, 'profile'), '--convert-to', 'txt:Text', '--outdir', out, file], { encoding: 'utf8', timeout: 120000 });
    assert.equal(r.status, 0, r.stderr);
    const txt = fs.readFileSync(path.join(out, 'doc.txt'), 'utf8');
    assert.match(txt, /Hello DW12 world/, fmt);
    assert.match(txt, /Second bold line/, fmt);
  }
});
