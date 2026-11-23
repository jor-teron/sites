/* DW13b: Writer drag and drop of picture files onto the page and header / footer.
   Pure checks with stubs (no browser): a picture dropped on the body is inserted
   at the drop point, a drop on a header / footer slot sets that slot's picture
   at M, document drops are unchanged, a non-picture file keeps the toast, drags
   without files are ignored, several pictures insert in order as one undo step.
   DW13c: the header / footer is one block, so a drop anywhere on it (or its
   margin) sets its one picture at 14 mm, centred (k is always 0). The slot
   checks below were rewritten for that with the same intent ("(before DW13c)").
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
  /* (before DW13c) three .hf-cell children (200 px apart), each with a .hf-slot */
  const hfText = el('hf-text hf-slot', box, { attrs: { 'data-part': 'head', 'data-slot': '0' } });
  const pic = el('hf-pic', box);
  box.kids = [hfText, pic];
  paper.kids = [box];
  const ribbon = el('ribbon', null);
  return { workspace, paper, editor, para, text, box, hfText, pic, ribbon };
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
  /* (before DW13c) pics rows of 3 and setPic(part, k, { src, size }) */
  const pics = { head: opts.oldPic || null, foot: null };
  W.hf = {
    editing: !!opts.editing, lastSlot: null,
    enter: (part, k) => { W.hf.editing = true; log.push(['enter', part.name, k]); },
    exit: () => { W.hf.editing = false; log.push(['exit']); },
    setPic: (part, pic) => { pics[part] = pic; log.push(['setPic', part, pic.h, pic.a, pic.src]); },
    pic: (part) => pics[part], note: (m) => log.push(['note', m]), refocus() {}, syncPicTools() {}
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

/* (before DW13c) 'a picture dropped on a header slot sets that slot at size M, 600 px' (slot 2) */
test('a picture dropped on the header sets its picture at 14 mm, centred, 600 px', async () => {
  const L = load();
  await fire(L, 'drop', dropEvt(L.w.hfText, [file('logo.png', 'image/png'), file('b.png', 'image/png')]));
  assert.deepEqual(L.log.find((x) => x[0] === 'enter'), ['enter', 'head', 0]);
  assert.deepEqual(L.log.filter((x) => x[0] === 'load'), [['load', 'logo.png', 600]]);
  assert.deepEqual(L.log.find((x) => x[0] === 'setPic'), ['setPic', 'head', 14, 'c', 'data:image/png;base64,logo.png']);
  assert.ok(!L.log.some((x) => x[0] === 'insert' || x[0] === 'checkpoint'));   /* not the body, not body undo */
});

test('a drop on the header picture replaces it and keeps its height and alignment', async () => {
  const L = load({ oldPic: { src: 'data:image/png;base64,OLD', h: 33, a: 'r' } });
  await fire(L, 'drop', dropEvt(L.w.pic, [file('new.png', 'image/png')]));
  assert.deepEqual(L.log.find((x) => x[0] === 'setPic'), ['setPic', 'head', 33, 'r', 'data:image/png;base64,new.png']);
});

/* (before DW13c) '... picks the slot by position' (x 350 -> centre slot 1) */
test('an empty (hidden) header: a drop in its margin on the paper goes to the header block', async () => {
  const L = load({ editing: true });
  await fire(L, 'drop', dropEvt(L.w.paper, [file('a.png', 'image/png')], null, 350, 30));
  assert.ok(!L.log.some((x) => x[0] === 'enter'));
  assert.equal(L.W.hf.lastSlot, L.w.hfText);
  assert.deepEqual(L.log.find((x) => x[0] === 'setPic').slice(0, 4), ['setPic', 'head', 14, 'c']);
  const M = load({ editing: true });
  await fire(M, 'drop', dropEvt(M.w.paper, [file('a.png', 'image/png')], null, 350, 90));   /* below the header box */
  assert.ok(!M.log.some((x) => x[0] === 'setPic'));
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

/* (before DW13c) the outlined element was the slot's .hf-cell; now the whole .hf-box */
test('dragover outlines the header slot under a picture, and drop clears it', async () => {
  const L = load();
  const cell = L.w.box;
  await fire(L, 'dragover', dropEvt(L.w.hfText, [file('a.png', 'image/png')]));
  assert.ok(cell.classList.contains('hf-drop'));
  await fire(L, 'dragover', dropEvt(L.w.para, [file('a.png', 'image/png')]));
  assert.ok(!cell.classList.contains('hf-drop'));
  await fire(L, 'dragover', dropEvt(L.w.hfText, [file('a.docx', '')]));
  assert.ok(!cell.classList.contains('hf-drop'));   /* only pictures */
});

test('release is DW13b; script loaded before writer-docxopen.js; no browser dialogs or fetch', () => {
  const html = read('writer.html');
  /* (before DW13c) assert.ok(html.replace(/<!--[\s\S]*?-->/g, '').indexOf('<title>Writer DW13b</title>') !== -1); */
  /* (before DW14) assert.ok(/<title>Writer DW13(b|c)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW14a) assert.ok(/<title>Writer DW(13b|13c|14)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW15) assert.ok(/<title>Writer DW(13b|13c|14|14a)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW16) assert.ok(/<title>Writer DW(13b|13c|14|14a|15)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW17) assert.ok(/<title>Writer DW(13b|13c|14|14a|15|16)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW18) assert.ok(/<title>Writer DW(13b|13c|14|14a|15|16|17)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW19) assert.ok(/<title>Writer DW(13b|13c|14|14a|15|16|17|18)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW22) assert.ok(/<title>Writer DW(13b|13c|14|14a|15|16|17|18|19)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW23) assert.ok(/<title>Writer DW(13b|13c|14|14a|15|16|17|18|19|22)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW24) assert.ok(/<title>Writer DW(13b|13c|14|14a|15|16|17|18|19|22|23)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW25) assert.ok(/<title>Writer DW(13b|13c|14|14a|15|16|17|18|19|22|23|24)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  assert.ok(/<title>Writer DW(13b|13c|14|14a|15|16|17|18|19|22|23|24|25|26)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, '')));
  assert.ok(html.indexOf('<!-- (before DW13b) <title>Writer DW13</title> -->') !== -1);
  /* (before DW26) writer-imgdrop.js and writer-docxopen.js were static script tags in writer.html. */
  const vendor = read('modules/writer-vendor.js');
  assert.ok(html.indexOf('modules/writer-vendor.js') !== -1);
  assert.ok(vendor.indexOf('modules/writer-imgdrop.js') !== -1 && vendor.indexOf('modules/writer-docxopen.js') !== -1);
  /* (before DW13c) assert.ok(/release:\s*'DW13b'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW14) assert.ok(/release:\s*'DW13[bc]'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW14a) assert.ok(/release:\s*'DW(13b|13c|14)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW15) assert.ok(/release:\s*'DW(13b|13c|14|14a)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW16) assert.ok(/release:\s*'DW(13b|13c|14|14a|15)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW17) assert.ok(/release:\s*'DW(13b|13c|14|14a|15|16)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW18) assert.ok(/release:\s*'DW(13b|13c|14|14a|15|16|17)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW19) assert.ok(/release:\s*'DW(13b|13c|14|14a|15|16|17|18)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW22) assert.ok(/release:\s*'DW(13b|13c|14|14a|15|16|17|18|19)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW23) assert.ok(/release:\s*'DW(13b|13c|14|14a|15|16|17|18|19|22)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW24) assert.ok(/release:\s*'DW(13b|13c|14|14a|15|16|17|18|19|22|23)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW25) assert.ok(/release:\s*'DW(13b|13c|14|14a|15|16|17|18|19|22|23|24)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW(13b|13c|14|14a|15|16|17|18|19|22|23|24|25|26)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, '')));
  const src = DROP.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(src));
  assert.ok(!/\bfetch\s*\(/.test(src));
});
