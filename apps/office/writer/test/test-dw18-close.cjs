/* DW18: File > Close and the "no document open" state.
   Pure checks (no browser): menu order, writer-empty.js transitions, autosave
   blocked while empty (writer-how.js with a fake Hub drive), Close saves then
   empties, Delete of the open document ends empty, the boot decision
   (empty / file link / writer_open_new), and New while empty stays in this window.
   Run: node --test apps/office/writer/test/test-dw18-close.cjs */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.resolve(__dirname, '..');
const ROOT = path.resolve(DIR, '../../..');
const read = (rel) => fs.readFileSync(path.join(DIR, rel), 'utf8');
const EMPTY = read('modules/writer-empty.js');
const DOCS = read('modules/writer-docs.js');
const STORAGE = read('modules/writer-storage.js');
const HOW = read('modules/writer-how.js');
const FSREF = fs.readFileSync(path.join(ROOT, 'shared/fs/fs_ref.js'), 'utf8');

function live(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

function memStore(init) {
  const data = Object.assign({}, init || {});
  return {
    data,
    getItem(k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
    setItem(k, v) { data[k] = String(v); },
    removeItem(k) { delete data[k]; }
  };
}

function el(id) {
  const attrs = {};
  const cls = new Set();
  return {
    id, innerHTML: '', value: '', hidden: false, disabled: false,
    setAttribute(k, v) { attrs[k] = String(v); },
    removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k); },
    appendChild() {}, addEventListener() {}, focus() {}, blur() {},
    querySelector() { return null; },
    get textContent() { return String(this.innerHTML).replace(/<[^>]*>/g, ''); },
    classList: { add(c) { cls.add(c); }, remove(c) { cls.delete(c); }, toggle(c, on) { if (on) cls.add(c); else cls.delete(c); }, contains(c) { return cls.has(c); } }
  };
}

const E = require(path.join(DIR, 'modules/writer-empty.js'));

/* ---------- menu ---------- */
test('File menu order: New, Open..., Rename, Save, Save As, Print, Close, Delete, Export...', () => {
  const html = live(read('writer.html'));
  const start = html.indexOf('id="fileMenu"');
  const menu = html.slice(start, html.indexOf('</div>\n\n', start) > 0 ? html.indexOf('id="settingsMenuBtn"', start) : undefined);
  const items = [];
  menu.replace(/<button[^>]*id="([^"]+)"[^>]*>[\s\S]*?<span>([^<]*)/g, (_, id, label) => { items.push([id, label.trim()]); });
  assert.deepEqual(items.map((x) => x[0]), ['newBtn', 'openFileBtn', 'renameBtn', 'saveBtn', 'saveAsBtn', 'printBtn', 'closeDocBtn', 'deleteCurrentBtn', 'exportBtn']);
  assert.deepEqual(items.map((x) => x[1]), ['New', 'Open...', 'Rename', 'Save', 'Save As', 'Print', 'Close', 'Delete', 'Export...']);
  assert.ok(/id="closeDocBtn"><svg viewBox="0 0 24 24" aria-hidden="true">/.test(html), 'Close has an icon like the other items');
});

test('empty panel, script and stylesheet are in writer.html', () => {
  const html = live(read('writer.html'));
  ['emptyPanel', 'emptyNewBtn', 'emptyOpenBtn', 'emptyRecent'].forEach((id) => assert.ok(html.indexOf('id="' + id + '"') !== -1, id));
  assert.ok(/<section class="empty-panel" id="emptyPanel"[^>]*hidden>/.test(html));
  assert.ok(html.indexOf('modules/writer-empty.js') !== -1 && html.indexOf('modules/writer-empty.js') < html.indexOf('modules/writer-docs.js'));
  assert.ok(html.indexOf('ui/empty.css') !== -1);
  const css = read('ui/empty.css');
  assert.ok(/body\.writer-empty \.pages-scaler/.test(css) && /#ruler/.test(css) && /\.status-bar/.test(css));
  assert.ok(/var\(--text-primary\)/.test(css) && /min-height: 44px/.test(css), 'theme variables and touch size');
});

/* ---------- pure rules ---------- */
test('empty-state transitions and canEdit / canWrite', () => {
  let s = { empty: false };
  s = E.next(s, 'close'); assert.equal(s.empty, true);
  assert.equal(E.canEdit(s), false); assert.equal(E.canWrite(s), false);
  s = E.next(s, 'something-else'); assert.equal(s.empty, true, 'unknown action keeps the state');
  s = E.next(s, 'new'); assert.equal(s.empty, false);
  s = E.next(s, 'delete'); assert.equal(s.empty, true);
  s = E.next(s, 'open'); assert.equal(s.empty, false);
  assert.equal(E.next(null, 'boot-empty').empty, true);
  assert.equal(E.next({ empty: true }, 'blank').empty, false);
  assert.equal(E.canEdit({ empty: false }), true);
  assert.equal(E.canWrite(null), true);
});

test('keys while empty: New / Open run, Save / Print toast, edit keys blocked, others pass', () => {
  const on = { empty: true };
  assert.equal(E.keyAction({ empty: false }, { ctrlKey: true, key: 's' }), null);
  assert.equal(E.keyAction(on, { ctrlKey: true, key: 'n' }), 'new');
  assert.equal(E.keyAction(on, { metaKey: true, key: 'O' }), 'open');
  assert.equal(E.keyAction(on, { ctrlKey: true, key: 's' }), 'toast');
  assert.equal(E.keyAction(on, { ctrlKey: true, key: 'p' }), 'toast');
  assert.equal(E.keyAction(on, { ctrlKey: true, key: 'z' }), 'block');
  assert.equal(E.keyAction(on, { ctrlKey: true, key: 'b' }), 'block');
  assert.equal(E.keyAction(on, { key: 'a' }), null, 'plain typing is not touched');
  assert.equal(E.keyAction(on, { ctrlKey: true, key: 'r' }), null, 'browser reload still works');
  assert.equal(E.keyAction(on, { ctrlKey: true, altKey: true, key: 's' }), null);
});

test('Close asks only when the flush cannot keep the edits', () => {
  assert.equal(E.flushWrites({ inHub: true, canLocal: true, format: 'how' }), true);
  assert.equal(E.flushWrites({ format: 'how', destKind: 'handle' }), true);
  assert.equal(E.flushWrites({ format: 'how' }), false, 'standalone .how without a file');
  assert.equal(E.flushWrites({ format: 'docx', destKind: 'handle' }), true, 'DW14a picked .docx writes back');
  assert.equal(E.flushWrites({ inHub: true, canLocal: true, format: 'odt', destKind: 'hub' }), true);
  assert.equal(E.flushWrites({ inHub: true, canLocal: true, format: 'docx' }), false, '.docx with no file');
  assert.equal(E.closeNeedsConfirm({ willWrite: true, changed: true }), false);
  assert.equal(E.closeNeedsConfirm({ willWrite: false, blank: true, changed: true }), false);
  assert.equal(E.closeNeedsConfirm({ willWrite: false, blank: false, changed: false }), false);
  assert.equal(E.closeNeedsConfirm({ willWrite: false, blank: false, changed: true }), true);
});

test('boot decision: writer_open_new / #new → blank, file link → file, Hub Office new → blank, else empty', () => {
  assert.equal(E.bootMode({}), 'empty');
  assert.equal(E.bootMode({ fresh: true }), 'blank');
  assert.equal(E.bootMode({ fresh: true, hashFile: true }), 'blank');
  assert.equal(E.bootMode({ hashFile: true }), 'file');
  assert.equal(E.bootMode({ officeNew: true }), 'blank');
  const ctx = { window: {}, URLSearchParams };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(FSREF, ctx, { filename: 'fs_ref.js' });
  const parse = ctx.FsRef.parse;
  assert.equal(E.hashHasFile('#drive=local&path=Documents&file=Plan.how', parse), true);
  assert.equal(E.hashHasFile('#drive=local&file=Letter.docx', parse), true);
  assert.equal(E.hashHasFile('#drive=local&file=photo.png', parse), false);
  assert.equal(E.hashHasFile('#new', parse), false);
  assert.equal(E.hashHasFile('', parse), false);
  assert.equal(E.hashHasFile('#drive=local&file=a.how', null), false);
});

test('recentRows: newest first, at most 8, labels without .how', () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push({ name: 'Doc ' + i + '.how' });
  const out = E.recentRows(rows);
  assert.equal(out.length, 8);
  assert.deepEqual(out[0], { name: 'Doc 0.how', label: 'Doc 0' });
  assert.deepEqual(E.recentRows(null), []);
});

/* ---------- writer-how.js: nothing is written while empty ---------- */
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

function hubTab(drive, text) {
  const input = el('fileNameInput');
  const ctx = {
    console, Blob, Promise, URLSearchParams,
    location: { search: '', origin: 'https://hub.test', hash: '' },
    localStorage: memStore(),
    document: {
      body: el('body'),
      createElement: () => el(),
      getElementById: (id) => (id === 'fileNameInput' ? input : null),
      querySelector: () => null
    },
    FsDrives: drive.FsDrives,
    FsOps: drive.FsOps,
    addEventListener: () => {}
  };
  ctx.document.body.classList.add('in-hub');
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.parent = { postMessage() {} };
  vm.createContext(ctx);
  vm.runInContext(STORAGE, ctx, { filename: 'writer-storage.js' });
  const W = ctx.Writer;
  W.config = { namePrefix: 'Doc_', landscapeClass: 'landscape', paperSize: 'A4', marginPreset: 'normal', marginTopCm: 1, marginBottomCm: 1, marginLeftCm: 1, marginRightCm: 1 };
  W.pages = { combinedHtml: () => '<p>' + (text || 'Hello') + '</p>' };
  vm.runInContext(HOW, ctx, { filename: 'writer-how.js' });
  vm.runInContext(EMPTY, ctx, { filename: 'writer-empty.js' });
  return { W, input, ctx };
}

test('autosave, the typing timer and Save write nothing while empty; they write again after leave', async () => {
  const drive = makeDrive();
  const tab = hubTab(drive, 'Kept');
  tab.input.value = 'Report';
  tab.W.empty.state = { empty: true };
  const a = await tab.W.how.autosave();
  const b = await tab.W.how.autosave({ timer: true });
  const c = await tab.W.how.save({ explicit: true });
  const d = await tab.W.how.save({ explicit: true, saveAs: true });
  [a, b, c, d].forEach((r) => { assert.equal(r.wrote, false); assert.equal(r.empty, true); });
  assert.equal(drive.files.size, 0, 'no stray Untitled / Report file');
  tab.W.empty.state = { empty: false };
  const e = await tab.W.how.autosave();
  assert.equal(e.wrote, true);
  assert.deepEqual(Array.from(drive.files.keys()), ['Report.how']);
});

test('How.apply and How.fresh leave the empty state before layout', () => {
  const src = live(HOW);
  assert.ok(/How\.apply = function apply\(doc\) \{\s*var S = D\(\);\s*if \(S\.empty && S\.empty\.leave\) S\.empty\.leave\('open'\);/.test(src));
  assert.ok(/How\.fresh = function fresh\(\) \{\s*var S = D\(\);\s*if \(S\.empty && S\.empty\.leave\) S\.empty\.leave\('blank'\);/.test(src));
  const dx = live(read('modules/writer-docxopen.js'));
  assert.ok(dx.indexOf("Writer.empty.leave('open')") !== -1 && dx.indexOf("Writer.empty.leave('open')") < dx.indexOf('Writer.pages.rebuildSinglePage()'));
});

/* ---------- writer-docs.js with writer-empty.js ---------- */
function loadDocs(opts) {
  opts = opts || {};
  const log = [];
  const nodes = {};
  const getEl = (id) => nodes[id] || (nodes[id] = el(id));
  const store = opts.store || memStore();
  const loc = opts.location || { href: 'http://x/apps/office/writer/writer.html', protocol: 'http:', origin: 'http://x', hash: '', pathname: '/apps/office/writer/writer.html', search: '' };
  const ctx = {
    console, URL, URLSearchParams, Promise,
    setTimeout: (fn) => { fn(); return 0; }, clearTimeout() {},
    localStorage: store,
    location: loc,
    history: { replaceState(s, t, url) { log.push(['replace', url]); loc.href = String(url); loc.hash = ''; } },
    document: {
      body: el('body'),
      getElementById: getEl,
      querySelector: (sel) => (sel === 'nav.ribbon' ? getEl('nav') : null),
      createElement: () => el(),
      addEventListener() {}
    },
    addEventListener() {},
    open(url) { log.push(['open', url]); return {}; }
  };
  ctx.window = ctx;
  ctx.parent = opts.inFrame ? { postMessage(m) { log.push(['post', m]); } } : ctx;
  const editor = el('editor');
  editor.innerHTML = '<p>Hello</p>';
  let name = opts.name || 'Report';
  ctx.Writer = {
    ui: { onClick() {}, showToast(m) { log.push(['toast', m]); }, setNonPrinting() {}, setPage() {}, setOrientation() {} },
    storage: {
      loadedName: name,
      currentName: () => name,
      setCurrentName(n) { name = n; log.push(['name', n]); },
      isBlankUnsaved: () => !!opts.blank,
      fillNameIfEmpty() { if (!name) name = 'Untitled 1'; return name; },
      loadNonPrinting: () => false, loadPage: () => ({}), loadOrientation: () => 'portrait'
    },
    pages: { firstEditor: () => editor, rebuildSinglePage() { log.push(['rebuild']); } },
    editor: { stripMarks() {} },
    history: { reset() { log.push(['history-reset']); }, canUndo: () => !!opts.changed },
    hf: { set() {}, blank: () => null },
    dialog: { confirm(o) { log.push(['confirm', o.title]); return Promise.resolve(opts.confirm !== false); } },
    config: { defaultHtml: '<p><br></p>' },
    how: {
      dest: opts.dest || null,
      format: opts.format || 'how',
      inHub: () => !!opts.inHub,
      canLocal: () => !!opts.inHub,
      stem: (n) => String(n).replace(/\.how$/i, ''),
      fileName: (n) => (/\.how$/i.test(n) ? n : n + '.how'),
      autosave() { log.push(['autosave', ctx.Writer.empty.isEmpty()]); return Promise.resolve({ wrote: true }); },
      fresh() { log.push(['fresh']); ctx.Writer.empty.leave('blank'); name = 'Untitled 1'; return Promise.resolve('Untitled 1'); },
      remove(f) { log.push(['remove', f]); return Promise.resolve(); },
      list() { return Promise.resolve(opts.rows || [{ name: 'Other.how' }]); },
      openName(n) { log.push(['openName', n]); return Promise.resolve(true); },
      start() { log.push(['start']); return Promise.resolve(true); }
    },
    app: {},
    hub: { linked: !!opts.inFrame }
  };
  if (opts.inFrame) ctx.document.body.classList.add('in-hub');
  if (opts.fsref) {
    vm.createContext(ctx);
    vm.runInContext(FSREF, ctx, { filename: 'fs_ref.js' });
  } else {
    vm.createContext(ctx);
  }
  vm.runInContext(EMPTY, ctx, { filename: 'writer-empty.js' });
  vm.runInContext(DOCS, ctx, { filename: 'writer-docs.js' });
  return { W: ctx.Writer, log, nodes, editor, getName: () => name, ctx };
}

test('Close saves first, then empties: no new document, title blank, parts off', async () => {
  const t = loadDocs({ inHub: true, dest: { kind: 'hub', name: 'Report.how' } });
  t.W.app.inputTimer = 7;
  const ok = await t.W.docs.closeDoc();
  assert.equal(ok, true);
  const iSave = t.log.findIndex((x) => x[0] === 'autosave');
  assert.ok(iSave >= 0 && t.log[iSave][1] === false, 'autosave ran while the document was still open');
  assert.equal(t.W.empty.isEmpty(), true);
  assert.ok(!t.log.some((x) => x[0] === 'fresh'), 'Close makes no new document');
  assert.ok(!t.log.some((x) => x[0] === 'confirm'), 'Hub save keeps the edits, no question');
  assert.equal(t.getName(), '', 'name box empty → Hub title shows just Writer');
  assert.equal(t.W.how.dest, null);
  assert.equal(t.W.storage.loadedName, '');
  assert.equal(t.editor.innerHTML, '<p><br></p>');
  assert.ok(t.ctx.document.body.classList.contains('writer-empty'));
  assert.equal(t.nodes.emptyPanel.hidden, false);
  ['closeDocBtn', 'saveBtn', 'printBtn', 'deleteCurrentBtn', 'exportBtn', 'renameBtn', 'saveAsBtn'].forEach((id) => assert.equal(t.nodes[id].disabled, true, id));
  assert.ok(t.nodes.statusBar.hasAttribute('inert') && t.nodes.ruler.hasAttribute('inert') && t.nodes.nav.hasAttribute('inert'));
  assert.ok(t.log.some((x) => x[0] === 'toast' && x[1] === 'Closed Report'));
  assert.equal(await t.W.docs.closeDoc(), false, 'Close while empty does nothing');
});

test('Close keeps the DW14a write-back: a picked .docx is flushed through autosave, no question', async () => {
  const t = loadDocs({ format: 'docx', dest: { kind: 'handle', name: 'Letter.docx' }, changed: true });
  await t.W.docs.closeDoc();
  assert.ok(t.log.some((x) => x[0] === 'autosave'));
  assert.ok(!t.log.some((x) => x[0] === 'confirm'));
  assert.equal(t.W.empty.isEmpty(), true);
});

test('Close asks when the edits have no file; Cancel keeps the document', async () => {
  const t = loadDocs({ changed: true, confirm: false });
  assert.equal(await t.W.docs.closeDoc(), false);
  assert.ok(t.log.some((x) => x[0] === 'confirm'));
  assert.equal(t.W.empty.isEmpty(), false);
  assert.ok(!t.log.some((x) => x[0] === 'autosave'));
  const y = loadDocs({ changed: true, confirm: true });
  assert.equal(await y.W.docs.closeDoc(), true);
  assert.equal(y.W.empty.isEmpty(), true);
});

test('Close clears a #drive=&file= link so a restored window starts empty', async () => {
  const loc = { href: 'http://x/w/writer.html#drive=local&path=Documents&file=Report.how', protocol: 'http:', origin: 'http://x', hash: '#drive=local&path=Documents&file=Report.how', pathname: '/w/writer.html', search: '' };
  const t = loadDocs({ inHub: true, location: loc, fsref: true });
  await t.W.docs.closeDoc();
  assert.ok(t.log.some((x) => x[0] === 'replace' && x[1] === 'http://x/w/writer.html'));
  assert.equal(t.W.how.lastHash, '');
});

test('Delete of the open document ends empty (no next document, no blank)', async () => {
  const t = loadDocs({ inHub: true, rows: [{ name: 'Report.how' }, { name: 'Other.how' }] });
  const ok = await t.W.docs.deleteNow('Report');
  assert.equal(ok, true);
  assert.ok(t.log.some((x) => x[0] === 'remove' && x[1] === 'Report.how'));
  assert.equal(t.W.empty.isEmpty(), true);
  assert.ok(!t.log.some((x) => x[0] === 'openName' || x[0] === 'fresh'));
  assert.ok(t.log.some((x) => x[0] === 'toast' && x[1] === 'Deleted Report'));
  const src = DOCS;
  assert.ok(src.indexOf('(before DW18) the branch below opened the next .how or a blank page') !== -1);
});

test('Delete of another document leaves the open one alone', async () => {
  const t = loadDocs({ inHub: true });
  await t.W.docs.deleteNow('Other');
  assert.equal(t.W.empty.isEmpty(), false);
});

test('New while empty opens the blank document in this window (no Hub window, no tab)', async () => {
  const t = loadDocs({ inFrame: true, inHub: true });
  t.W.empty.enter('close');
  await t.W.docs.requestNew(t.ctx);
  assert.ok(t.log.some((x) => x[0] === 'fresh'));
  assert.ok(!t.log.some((x) => x[0] === 'post' || x[0] === 'open'));
  assert.equal(t.W.empty.isEmpty(), false);
  assert.equal(t.ctx.document.body.classList.contains('writer-empty'), false);
  assert.equal(t.nodes.saveBtn.disabled, false);
  assert.equal(t.nodes.emptyPanel.hidden, true);
  const s = loadDocs({ inFrame: false });
  s.W.empty.enter('close');
  await s.W.docs.requestNew(s.ctx);
  assert.ok(!s.log.some((x) => x[0] === 'open'), 'standalone: no new tab either');
});

test('boot: no link → empty (start not run); file link → start; writer_open_new → blank', async () => {
  const a = loadDocs({ fsref: true });
  await a.W.docs.load();
  assert.equal(a.W.empty.isEmpty(), true);
  assert.ok(!a.log.some((x) => x[0] === 'start' || x[0] === 'fresh'));
  assert.equal(a.W.app.ready, true);
  assert.equal(a.getName(), '');

  const loc = { href: 'http://x/w/writer.html#drive=local&file=Plan.how', protocol: 'http:', origin: 'http://x', hash: '#drive=local&file=Plan.how', pathname: '/w/writer.html', search: '' };
  const b = loadDocs({ fsref: true, location: loc });
  await b.W.docs.load();
  assert.equal(b.W.empty.isEmpty(), false);
  assert.ok(b.log.some((x) => x[0] === 'start'));

  const store = memStore({ writer_open_new: String(Date.now()) });
  const c = loadDocs({ fsref: true, store });
  await c.W.docs.load();
  assert.equal(c.W.empty.isEmpty(), false);
  assert.ok(c.log.some((x) => x[0] === 'fresh'));
  assert.equal(store.getItem('writer_open_new'), null, 'one-shot key is used up');

  const d = loadDocs({ fsref: true, location: { href: 'http://x/w/writer.html?new=1', protocol: 'http:', origin: 'http://x', hash: '', pathname: '/w/writer.html', search: '?new=1' } });
  d.ctx.OfficeNewDoc = { isNewDocLaunch: (s) => /new=1/.test(s) };
  await d.W.docs.load();
  assert.equal(d.W.empty.isEmpty(), false, 'Hub Office ?new=1 keeps its blank document');
  assert.ok(d.log.some((x) => x[0] === 'start'));
});

test('Quick Access: Save / Undo / Print are off while empty; Close is bound', () => {
  const q = live(read('modules/writer-quick.js'));
  assert.ok(/canSave: function \(\) \{ return !\(D\.empty && D\.empty\.isEmpty\(\)\); \}/.test(q));
  assert.ok(/canUndo: function \(\) \{ return !\(D\.empty && D\.empty\.isEmpty\(\)\) && D\.history\.canUndo\(\); \}/.test(q));
  assert.ok(/print: function \(\) \{ if \(D\.empty && D\.empty\.isEmpty\(\)\) \{[^}]*No document open/.test(q));
  const d = live(DOCS);
  assert.ok(d.indexOf("Writer.ui.onClick('closeDocBtn', function () { Writer.docs.closeDoc(); });") !== -1);
  assert.ok(DOCS.indexOf("(before DW18) ['load:loadDocument'") !== -1);
});

test('writer.html title is DW18; config release is DW18; old ids are kept as comments', () => {
  const html = read('writer.html');
  assert.ok(/<title>Writer DW18<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, '')));
  assert.ok(html.indexOf('<!-- (before DW18) <title>Writer DW17</title> -->') !== -1);
  const cfg = read('modules/writer-config.js');
  assert.ok(/release:\s*'DW18'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(cfg.indexOf("/* (before DW18) release: 'DW17', */") !== -1);
  assert.ok(read('writer_readme.md').indexOf('## DW18') !== -1);
});
