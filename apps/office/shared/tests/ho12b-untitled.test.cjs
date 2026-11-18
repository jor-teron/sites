#!/usr/bin/env node
/* HO12b: Untitled N numbering, extension stripping, &untitled=N, and the
 * OfficeNative quiet path for an auto-made name.
 * Run with: node --test apps/office/shared/tests/ho12b-untitled.test.cjs
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../../../..');
const D = require(path.join(ROOT, 'apps/office/shared/office-docname.js'));
const NewDoc = require(path.join(ROOT, 'apps/office/shared/office-newdoc.js'));
const NATIVE = fs.readFileSync(path.join(ROOT, 'apps/office/shared/office-native.js'), 'utf8');
const DOCNAME = fs.readFileSync(path.join(ROOT, 'apps/office/shared/office-docname.js'), 'utf8');

test('untitled() starts at 1 and takes the lowest free number', () => {
  assert.equal(D.untitled([]), 'Untitled 1');
  assert.equal(D.untitled(['Untitled 1', 'Untitled 2']), 'Untitled 3');
  assert.equal(D.untitled(['Untitled 1', 'Untitled 3']), 'Untitled 2', 'gaps are reused');
  assert.equal(D.untitled(['Untitled 2']), 'Untitled 1');
});

test('untitled() ignores case and extensions, and other names', () => {
  assert.equal(D.untitled(['untitled 1.how', 'UNTITLED 2.HOS', 'Untitled 3.docx']), 'Untitled 4');
  assert.equal(D.untitled(['Report.how', 'Untitled', 'Untitled 1 copy', 'Untitled 1 (2).how']), 'Untitled 1');
  assert.equal(D.untitled([{ name: 'Untitled 1.hop' }]), 'Untitled 2', 'accepts file rows');
  assert.equal(D.untitled(null), 'Untitled 1');
});

test('untitled() uses the preferred number when it is free', () => {
  assert.equal(D.untitled([], 3), 'Untitled 3');
  assert.equal(D.untitled(['Untitled 3.how'], 3), 'Untitled 1');
  assert.equal(D.untitled(['Untitled 1', 'Untitled 3'], 3), 'Untitled 2');
  assert.equal(D.untitled([], 0), 'Untitled 1');
  assert.equal(D.untitled([], 'x'), 'Untitled 1');
});

test('untitledNumber() reads Untitled N only', () => {
  assert.equal(D.untitledNumber('Untitled 7'), 7);
  assert.equal(D.untitledNumber('untitled 7.how'), 7);
  assert.equal(D.untitledNumber('Untitled'), 0);
  assert.equal(D.untitledNumber('Untitled 0'), 0);
  assert.equal(D.untitledNumber('My Untitled 2'), 0);
});

test('stripExt() drops a known office extension only', () => {
  assert.equal(D.stripExt('Report.how'), 'Report');
  assert.equal(D.stripExt('Report.docx'), 'Report');
  assert.equal(D.stripExt('Budget.HOS'), 'Budget');
  assert.equal(D.stripExt('Deck.hop'), 'Deck');
  assert.equal(D.stripExt('Shop.hob'), 'Shop');
  assert.equal(D.stripExt('Jobs.hot'), 'Jobs');
  assert.equal(D.stripExt('Documents/Letter.odt'), 'Letter');
  assert.equal(D.stripExt('Report v1.2'), 'Report v1.2', 'unknown suffix stays');
  assert.equal(D.stripExt('Archive.tar.gz'), 'Archive.tar.gz');
  assert.equal(D.stripExt('.how'), '.how', 'never strips to empty');
  assert.equal(D.stripExt('Plain'), 'Plain');
});

test('preferred() and initial() read ?untitled=N', () => {
  assert.equal(D.preferred('?new=1&untitled=4'), 4);
  assert.equal(D.preferred('?new=1'), 0);
  assert.equal(D.preferred('?untitled=0'), 0);
  assert.equal(D.preferred('?untitled=abc'), 0);
  assert.equal(D.initial('?new=1&untitled=2'), 'Untitled 2');
  assert.equal(D.initial(''), 'Untitled 1');
});

test('frameSrc() adds &untitled=N only with new=1', () => {
  assert.equal(NewDoc.frameSrc('../writer/', { untitled: 2 }), '../writer/?new=1&untitled=2');
  assert.equal(NewDoc.frameSrc('../writer/?a=1', { untitled: 1 }), '../writer/?a=1&new=1&untitled=1');
  assert.equal(NewDoc.frameSrc('../writer/', { hash: 'file=A.how', untitled: 2 }), '../writer/#file=A.how');
  assert.equal(NewDoc.frameSrc('../writer/', {}), '../writer/?new=1');
  assert.equal(NewDoc.frameSrc('../writer/', { untitled: 0 }), '../writer/?new=1');
});

/* OfficeNative in a vm with a fake Hub Documents folder. */
function bootNative(files, search) {
  const ctx = {
    console, Blob, Promise, URLSearchParams,
    location: { search: search || '', origin: 'https://hub.test', hash: '' },
    document: { body: { classList: { contains: (c) => c === 'in-hub' } } },
    addEventListener: () => {}
  };
  const docs = {
    getFileHandle(name, opts) {
      if (!files.has(name) && !(opts && opts.create)) return Promise.reject(new Error('NotFound'));
      return Promise.resolve({
        createWritable() {
          let text = '';
          return Promise.resolve({
            write(b) { return b.text().then((t) => { text = t; }); },
            close() { files.set(name, text); return Promise.resolve(); },
            abort() { return Promise.resolve(); }
          });
        }
      });
    },
    removeEntry(name) { files.delete(name); return Promise.resolve(); }
  };
  const root = { getDirectoryHandle: () => Promise.resolve(docs) };
  ctx.FsDrives = { hasLocal: true, handle: () => Promise.resolve(root) };
  ctx.FsOps = {
    exists: (dir, n) => Promise.resolve(files.has(n)),
    list: () => Promise.resolve(Array.from(files.keys()).map((name) => ({ kind: 'file', name, modified: 0 }))),
    uniqueName: (dir, n) => Promise.resolve(n.replace(/\.hos$/, ' (2).hos'))
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.parent = { postMessage() {} };
  vm.createContext(ctx);
  vm.runInContext(DOCNAME, ctx, { filename: 'office-docname.js' });
  vm.runInContext(NATIVE, ctx, { filename: 'office-native.js' });
  let name = 'Sheet';
  const clashes = [];
  const N = ctx.OfficeNative.create({
    ext: 'hos', fallback: 'Sheet',
    capture: () => ({ name, cells: [1] }),
    pack: (doc) => ({ name: doc.name, cells: doc.cells, created: doc.created || 1 }),
    parse: (t) => JSON.parse(t),
    currentName: () => name,
    setName: (n) => { name = n; },
    clash: (n) => { clashes.push(n); return Promise.resolve(null); }
  });
  return { N, clashes, name: () => name, setTyped: (n) => { name = n; } };
}

test('OfficeNative.newName() picks the lowest free Untitled N (preferred from the URL)', async () => {
  const files = new Map([['Untitled 1.hos', '{}']]);
  const a = bootNative(files, '?new=1&untitled=1');
  assert.equal(await a.N.newName(), 'Untitled 2');
  assert.equal(a.name(), 'Untitled 2');
  const b = bootNative(files, '?new=1&untitled=4');
  assert.equal(await b.N.newName(), 'Untitled 4');
});

test('OfficeNative: an auto-made name never shows the clash dialog; a typed one does', async () => {
  const files = new Map();
  const a = bootNative(files, '?new=1');
  const b = bootNative(files, '?new=1');
  await a.N.newName();
  await b.N.newName();
  assert.equal(a.name(), 'Untitled 1');
  assert.equal(b.name(), 'Untitled 1');
  await a.N.autosave();
  const res = await b.N.autosave();
  assert.equal(res.name, 'Untitled 2');
  assert.equal(b.name(), 'Untitled 2');
  assert.equal(b.clashes.length, 0);
  assert.equal(b.N.autoName, '', 'saved: no longer auto');
  assert.deepEqual(Array.from(files.keys()).sort(), ['Untitled 1.hos', 'Untitled 2.hos']);

  const c = bootNative(files, '?new=1');
  await c.N.newName();
  c.setTyped('Untitled 1');
  c.N.autoName = '';
  await c.N.autosave();
  assert.deepEqual(c.clashes, ['Untitled 1'], 'a user-chosen name keeps the dialog');
});
