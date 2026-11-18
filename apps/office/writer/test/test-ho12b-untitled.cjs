/* HO12b: a new Writer document is "Untitled N", never Doc_YYYY_MM_DD_HH-MM.
   Two new documents made in the same minute get different names, and the
   first autosave of an auto-made name never opens the "Name already used"
   dialog. Loads writer-storage.js and writer-how.js in a vm with a fake Hub
   drive. No browser, no network.
   Run: node --test apps/office/writer/test/test-ho12b-untitled.cjs */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../../../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const DOCNAME = read('apps/office/shared/office-docname.js');
const NEWDOC = read('apps/office/shared/office-newdoc.js');
const STORAGE = read('apps/office/writer/modules/writer-storage.js');
const HOW = read('apps/office/writer/modules/writer-how.js');

/* One shared Documents folder, like the Hub Local drive. */
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
      uniqueName: (dir, name) => Promise.resolve(name.replace(/\.how$/, ' (2).how'))
    }
  };
}

function el() {
  return {
    innerHTML: '',
    value: '',
    querySelector() { return null; },
    get textContent() { return String(this.innerHTML).replace(/<[^>]*>/g, ''); }
  };
}

/* One Writer tab. search is its iframe query (?new=1&untitled=N). */
function bootTab(drive, search, text) {
  const input = el();
  const dialogs = [];
  const ctx = {
    console,
    Blob,
    Promise,
    URLSearchParams,
    location: { search: search || '', origin: 'https://hub.test', hash: '' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: {
      body: { classList: { contains: (c) => c === 'in-hub' } },
      createElement: () => el(),
      getElementById: (id) => (id === 'fileNameInput' ? input : null)
    },
    FsDrives: drive.FsDrives,
    FsOps: drive.FsOps,
    addEventListener: () => {}
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.parent = { postMessage() {} };
  vm.createContext(ctx);
  vm.runInContext(DOCNAME, ctx, { filename: 'office-docname.js' });
  vm.runInContext(NEWDOC, ctx, { filename: 'office-newdoc.js' });
  vm.runInContext(STORAGE, ctx, { filename: 'writer-storage.js' });
  const W = ctx.Writer;
  W.config = { namePrefix: 'Doc_', landscapeClass: 'landscape', paperSize: 'A4', marginPreset: 'normal', marginTopCm: 1, marginBottomCm: 1, marginLeftCm: 1, marginRightCm: 1 };
  W.pages = { combinedHtml: () => '<p>' + (text || 'Hello') + '</p>' };
  W.storage.clashDialog = (name) => { dialogs.push(name); return Promise.resolve(null); };
  vm.runInContext(HOW, ctx, { filename: 'writer-how.js' });
  return { W, input, dialogs };
}

test('makeName is Untitled N, not a Doc_ minute stamp', () => {
  const tab = bootTab(makeDrive(), '?new=1&untitled=3');
  assert.equal(tab.W.storage.makeName(), 'Untitled 3');
  assert.ok(!/^Doc_/.test(tab.W.storage.makeName()));
  const plain = bootTab(makeDrive(), '');
  assert.equal(plain.W.storage.makeName(), 'Untitled 1');
  assert.match(plain.W.storage.makeStampName(new Date(2026, 10, 18, 18, 5)), /^Doc_2026_11_18_18-05$/);
});

test('two new documents in the same minute get different names (Hub Office numbers)', async () => {
  const drive = makeDrive();
  const a = bootTab(drive, '?new=1&untitled=1', 'A');
  const b = bootTab(drive, '?new=1&untitled=2', 'B');
  a.W.storage.fillNameIfEmpty();
  b.W.storage.fillNameIfEmpty();
  await a.W.how.nameNew();
  await b.W.how.nameNew();
  assert.equal(a.input.value, 'Untitled 1');
  assert.equal(b.input.value, 'Untitled 2');
  await a.W.how.autosave();
  await b.W.how.autosave();
  assert.deepEqual(Array.from(drive.files.keys()).sort(), ['Untitled 1.how', 'Untitled 2.how']);
  assert.equal(a.dialogs.length + b.dialogs.length, 0);
});

test('same auto name in two tabs: the second autosave quietly takes the next Untitled N', async () => {
  const drive = makeDrive();
  const a = bootTab(drive, '?new=1', 'A');
  const b = bootTab(drive, '?new=1', 'B');
  a.W.storage.fillNameIfEmpty();
  b.W.storage.fillNameIfEmpty();
  await a.W.how.nameNew();
  await b.W.how.nameNew();
  assert.equal(a.input.value, 'Untitled 1');
  assert.equal(b.input.value, 'Untitled 1');
  const ra = await a.W.how.autosave();
  const rb = await b.W.how.autosave();
  assert.equal(ra.name, 'Untitled 1');
  assert.equal(rb.name, 'Untitled 2');
  assert.equal(b.input.value, 'Untitled 2');
  assert.equal(b.dialogs.length, 0, 'no "Name already used" dialog for an auto-made name');
  assert.equal(JSON.parse(drive.files.get('Untitled 1.how')).html, '<p>A</p>');
  assert.equal(JSON.parse(drive.files.get('Untitled 2.how')).html, '<p>B</p>');
  /* Once saved, the name is the file's own. */
  assert.equal(b.W.storage.autoName, '');
});

test('a user-typed name that is taken still asks', async () => {
  const drive = makeDrive();
  drive.files.set('Report.how', '{}');
  const tab = bootTab(drive, '?new=1', 'X');
  tab.W.storage.fillNameIfEmpty();
  await tab.W.how.nameNew();
  tab.input.value = 'Report';
  await tab.W.how.autosave();
  assert.deepEqual(tab.dialogs, ['Report']);
});

test('nameNew skips saved Untitled names and gaps are reused', async () => {
  const drive = makeDrive();
  drive.files.set('Untitled 1.how', '{}');
  drive.files.set('untitled 3.how', '{}');
  const tab = bootTab(drive, '?new=1&untitled=1', 'X');
  tab.W.storage.fillNameIfEmpty();
  assert.equal(await tab.W.how.nameNew(), 'Untitled 2');
  const fresh = await tab.W.how.fresh();
  assert.equal(fresh, 'Untitled 2');
});
