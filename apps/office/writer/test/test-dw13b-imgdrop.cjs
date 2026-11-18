/* DW13b: Writer drag and drop of picture files onto the page and header / footer.
   Pure checks with stubs (no browser): a picture dropped on the body is inserted
   at the drop point, a drop on a header / footer slot sets that slot's picture
   at M, document drops are unchanged, a non-picture file keeps the toast, drags
   without files are ignored, several pictures insert in order as one undo step.
   Run: node --test apps/office/writer/test/test-dw13b-imgdrop.cjs */
'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const DROP = read('modules/writer-imgdrop.js');
const OPEN = read('modules/writer-docxopen.js');

/* Tiny fake elements: closest() walks a parent chain by class / id. */
function el(cls, parent, extra) {
  const e = Object.assign({
    nodeType: 1, parentElement: parent || null, cls: cls.split(' '), attrs: {},
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; },
    closest(sel) {
      const names = sel.split(',').map((s) => s.trim());
      for (let n = this; n; n = n.parentElement) {
        for (const s of names) {
          if (s[0] === '#' && n.id === s.slice(1)) return n;
          if (s[0] === '.' && n.cls.indexOf(s.slice(1)) !== -1) return n;
        }
      }
      return null;
    },
    querySelectorAll(sel) { return (this.kids || []).filter((k) => k.cls.indexOf(sel.slice(1)) !== -1); },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    getBoundingClientRect() { return this.rect || { left: 0, right: 0, top: 0, bottom: 0 }; },
    focus() {}
  }, extra || {});
  return e;
}

function world() {
  const workspace = el('workspace', null, { id: 'workspace' });
  const paper = el('paper', workspace);
  const editor = el('editor', paper);
  const para = el('p', editor);
  const text = { nodeType: 3, parentElement: para };
  const box = el('hf-box hf-head', paper, { attrs: { 'data-part': 'head' }, rect: { left: 100, right: 700, top: 20, bottom: 50 } });
  const cells = [0, 1, 2].map((k) => {
    const c = el('hf-cell', box, { rect: { left: 100 + k * 200, right: 290 + k * 200, top: 20, bottom: 50 } });
    c.kids = [el('hf-slot', c, { attrs: { 'data-slot': String(k) } })];
    return c;
  });
  box.kids = cells;
  paper.kids = [box];
  const ribbon = el('ribbon', null);
  return { workspace, paper, editor, para, text, box, cells, ribbon };
}

function load(opts) {
  opts = opts || {};
  const w = world();
  const listeners = {};
  const log = [];
  let sel = null;
  const doc = {
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    contains() { return true; },
    getElementById() { return null; },
    caretRangeFromPoint(x, y) {
      log.push(['caretAt', x, y]);
      return opts.noCaret ? null : { startContainer: w.text, startOffset: 3, selectNodeContents() {}, collapse() {} };
    },
    createRange() { return { setStart() {}, collapse() {} }; }
  };
  const ctx = {
    console, Promise, setTimeout, clearTimeout, Math, Array, Infinity,
    document: doc,
    window: { getSelection() { return { removeAllRanges() {}, addRange(r) { sel = r; log.push(['caret', r.startOffset]); } }; } }
  };
  const W = ctx.window.Writer = {
    config: { editorClass: 'editor' },
    editor: {
      isInEditor: (n) => { const e = n && (n.nodeType === 1 ? n : n.parentElement); return !!(e && e.closest('.editor')); },
      saveSelection() {}
    },
    history: { checkpoint: () => log.push(['checkpoint']), commit: () => log.push(['commit']) },
    ui: { showToast: (m) => log.push(['toast', m]) },
    breaks: { changed() {} },
    image: {
      load: (f, max) => { log.push(['load', f.name, max || 0]); return f.bad ? Promise.reject(new Error('x')) : Promise.resolve('data:image/png;base64,' + f.name); },
      insert: (src) => { log.push(['insert', src]); return null; }
    },
    hfimg: { MAX_PX: 600 },
    docxopen: {},
    how: { isHow: (f) => /\.how$/.test(f.name), openFile: (f) => log.push(['openHow', f.name]), inHub: () => true }
  };
  const pics = { head: [null, null, null], foot: [null, null, null] };
  W.hf = {
    editing: !!opts.editing, lastSlot: null,
    enter: (part, k) => { W.hf.editing = true; log.push(['enter', part.name, k]); },
    exit: () => { W.hf.editing = false; log.push(['exit']); },
    setPic: (part, k, pic) => { pics[part][k] = pic; log.push(['setPic', part, k, pic.size, pic.src]); },
    pics: () => pics, note: (m) => log.push(['note', m]), refocus() {}, syncPicTools() {}
  };
  vm.createContext(ctx);
  ctx.Writer = W;
  vm.runInContext(DROP, ctx);
  /* writer-docxopen.js: only its bind() / drop handler is used here */
  vm.runInContext(OPEN.replace(/\nWriter\.docxopen\.bind\(\);\s*$/, '\n'), ctx);
  const D = W.docxopen;
  D.isDocx = (f) => /\.docx$/.test(f.name); D.isOdt = (f) => /\.odt$/.test(f.name); D.isTxt = (f) => /\.txt$/.test(f.name);
  D.open = (f) => log.push(['open', f.name]);
  D.bind();
  return { ctx, W, w, log, listeners, pics, getSel: () => sel };
}

function file(name, type, extra) { return Object.assign({ name, type }, extra || {}); }
function dropEvt(target, files, types, x, y) {
  const e = {
    target, clientX: x == null ? 300 : x, clientY: y == null ? 300 : y, prevented: false,
    dataTransfer: { types: types || ['Files'], files, items: files.map((f) => ({ kind: 'file', type: f.type })) },
    preventDefault() { this.prevented = true; }
  };
  return e;
}
async function fire(L, t, e) { for (const fn of L.listeners[t] || []) fn(e); await new Promise((r) => setTimeout(r, 5)); }

test('a picture dropped on the page body goes in at the drop point as one undo step', async () => {
  const L = load();
  const e = dropEvt(L.w.para, [file('a.png', 'image/png')], null, 320, 410);
  await fire(L, 'drop', e);
  assert.ok(e.prevented);
  assert.ok(L.log.some((x) => x[0] === 'caretAt' && x[1] === 320 && x[2] === 410));
  const seq = L.log.filter((x) => ['caret', 'checkpoint', 'insert', 'commit', 'load'].includes(x[0])).map((x) => x[0]);
  assert.deepEqual(seq, ['load', 'caret', 'checkpoint', 'insert', 'commit']);
  assert.deepEqual(L.log.find((x) => x[0] === 'load'), ['load', 'a.png', 0]);   /* body downscale: 1600 px default */
  assert.equal(L.getSel().startOffset, 3);
});

test('several pictures insert in order, still one undo step; an unreadable one is skipped with a note', async () => {
  const L = load();
  const files = [file('1.jpg', 'image/jpeg'), file('2.gif', 'image/gif'), file('x.webp', 'image/webp', { bad: true }), file('3.webp', 'image/webp')];
  await fire(L, 'drop', dropEvt(L.w.para, files));
  assert.deepEqual(L.log.filter((x) => x[0] === 'insert').map((x) => x[1]),
    ['data:image/png;base64,1.jpg', 'data:image/png;base64,2.gif', 'data:image/png;base64,3.webp']);
  assert.equal(L.log.filter((x) => x[0] === 'checkpoint').length, 1);
  assert.equal(L.log.filter((x) => x[0] === 'commit').length, 1);
  assert.ok(L.log.some((x) => x[0] === 'toast' && /1 of 4/.test(x[1])));
});

test('no caret at the point (page margin, old browser): falls back to the current caret', async () => {
  const L = load({ noCaret: true });
  await fire(L, 'drop', dropEvt(L.w.paper, [file('a.png', 'image/png')], null, 300, 900));
  assert.ok(!L.log.some((x) => x[0] === 'caret'));
  assert.deepEqual(L.log.filter((x) => x[0] === 'insert').length, 1);
});

test('a picture dropped on a header slot sets that slot at size M, 600 px', async () => {
  const L = load();
  const slotEl = L.w.cells[2].kids[0];
  await fire(L, 'drop', dropEvt(slotEl, [file('logo.png', 'image/png'), file('b.png', 'image/png')]));
  assert.deepEqual(L.log.find((x) => x[0] === 'enter'), ['enter', 'head', 2]);
  assert.deepEqual(L.log.filter((x) => x[0] === 'load'), [['load', 'logo.png', 600]]);
  assert.deepEqual(L.log.find((x) => x[0] === 'setPic'), ['setPic', 'head', 2, 'M', 'data:image/png;base64,logo.png']);
  assert.ok(!L.log.some((x) => x[0] === 'insert' || x[0] === 'checkpoint'));   /* not the body, not body undo */
});

test('an empty (hidden) header: a drop in its margin on the paper picks the slot by position', async () => {
  const L = load({ editing: true });
  await fire(L, 'drop', dropEvt(L.w.paper, [file('a.png', 'image/png')], null, 350, 30));
  assert.ok(!L.log.some((x) => x[0] === 'enter'));
  assert.equal(L.W.hf.lastSlot, L.w.cells[1].kids[0]);
  assert.deepEqual(L.log.find((x) => x[0] === 'setPic').slice(0, 4), ['setPic', 'head', 1, 'M']);
});

test('dropping on the ribbon or a dialog does nothing but stops the browser opening it', async () => {
  const L = load();
  const e = dropEvt(L.w.ribbon, [file('a.png', 'image/png')]);
  await fire(L, 'drop', e);
  assert.ok(e.prevented);
  assert.ok(!L.log.some((x) => ['insert', 'setPic', 'load', 'toast'].includes(x[0])));
});

test('document drops are unchanged', async () => {
  const L = load();
  for (const n of ['a.docx', 'b.odt', 'c.txt', 'd.how']) {
    const e = dropEvt(L.w.para, [file(n, '')]);
    await fire(L, 'drop', e);
    assert.ok(e.prevented, n);
  }
  assert.deepEqual(L.log.filter((x) => x[0] === 'open' || x[0] === 'openHow').map((x) => x[1]), ['a.docx', 'b.odt', 'c.txt', 'd.how']);
  assert.ok(!L.log.some((x) => x[0] === 'insert' || x[0] === 'toast'));
});

test('a non-picture, non-document file keeps the toast; an unsupported picture type gets its own', async () => {
  const L = load();
  await fire(L, 'drop', dropEvt(L.w.para, [file('x.zip', 'application/zip')]));
  assert.deepEqual(L.log.filter((x) => x[0] === 'toast').map((x) => x[1]), ['Drop a .how, .docx, .odt or .txt file to open it']);
  const e = dropEvt(L.w.para, [file('v.svg', 'image/svg+xml')]);
  await fire(L, 'drop', e);
  assert.ok(e.prevented);
  assert.ok(/PNG, JPEG, GIF or WebP/.test(L.log.filter((x) => x[0] === 'toast')[1][1]));
  assert.ok(!L.log.some((x) => x[0] === 'insert'));
});

test('drags without files (moving a picture inside Writer, text) are left to the browser', async () => {
  const L = load();
  const e = dropEvt(L.w.para, [], ['text/html', 'text/uri-list']);
  e.dataTransfer.items = [];
  await fire(L, 'dragover', e);
  await fire(L, 'drop', e);
  assert.ok(!e.prevented);
  assert.ok(!L.log.length);
});

test('dragover outlines the header slot under a picture, and drop clears it', async () => {
  const L = load();
  const cell = L.w.cells[0];
  await fire(L, 'dragover', dropEvt(cell.kids[0], [file('a.png', 'image/png')]));
  assert.ok(cell.classList.contains('hf-drop'));
  await fire(L, 'dragover', dropEvt(L.w.para, [file('a.png', 'image/png')]));
  assert.ok(!cell.classList.contains('hf-drop'));
  await fire(L, 'dragover', dropEvt(cell.kids[0], [file('a.docx', '')]));
  assert.ok(!cell.classList.contains('hf-drop'));   /* only pictures */
});

test('release is DW13b; script loaded before writer-docxopen.js; no browser dialogs or fetch', () => {
  const html = read('writer.html');
  assert.ok(html.replace(/<!--[\s\S]*?-->/g, '').indexOf('<title>Writer DW13b</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before DW13b) <title>Writer DW13</title> -->') !== -1);
  assert.ok(html.indexOf('modules/writer-imgdrop.js') !== -1 && html.indexOf('modules/writer-imgdrop.js') < html.indexOf('modules/writer-docxopen.js'));
  assert.ok(/release:\s*'DW13b'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, '')));
  const src = DROP.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(src));
  assert.ok(!/\bfetch\s*\(/.test(src));
});
