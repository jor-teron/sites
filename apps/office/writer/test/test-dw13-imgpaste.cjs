/* DW13: Writer copy and paste pictures within Writer and into header / footer.
   Pure checks with stubs (no browser, no network): the MAX_HTML cap skips
   data: picture bytes, the picture cap, the sanitizer keeps a picture's width,
   no "Paste as text" chip for a picture-only paste, external paste unchanged,
   copy / cut of a selected picture gives <img> html, Ctrl+V replaces a selected
   picture, and a picture pasted into a header / footer slot sets that slot.
   Run: node --test apps/office/writer/test/test-dw13-imgpaste.cjs */
'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(DIR, 'modules/writer-paste.js'), 'utf8');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const big = (n) => 'data:image/jpeg;base64,' + '/9j/'.padEnd(n, 'A');

function load() {
  const listeners = {};
  const log = [];
  const ctx = {
    console, Promise, Blob, Uint8Array, atob, Date, Math, setTimeout, clearTimeout,
    document: {
      addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
      contains() { return true; },
      execCommand() {}
    },
    window: { getSelection() { return null; } }
  };
  ctx.window.Writer = {
    editor: { isInEditor: () => true, pastePlain: (t) => log.push(['plain', t]), saveSelection() {} },
    history: { checkpoint: () => log.push(['checkpoint']), commit: () => log.push(['commit']) },
    ui: { showToast: (m) => log.push(['toast', m]) }
  };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const W = ctx.window.Writer;
  const P = W.paste;
  P.inCell = () => false;
  P.sanitize = (h) => h;            /* the DOM sanitizer needs a browser; checked by source below */
  P.insertHtml = (h) => log.push(['html', h]);
  P.showChip = () => log.push(['chip']);
  P.replaceSel = () => { log.push(['replaceSel']); return false; };
  return { ctx, W, P, log, listeners };
}

function clip(data, files) {
  return { getData: (t) => data[t] || '', files: files || [], items: [] };
}
function pasteEvt(data, files) { return { clipboardData: clip(data, files), preventDefault() {}, stopPropagation() {} }; }

test('size cap ignores data: picture bytes; pictures have their own cap', () => {
  const { P } = load();
  const html = '<p>Hi</p><p class="dl-img-block"><img src="' + big(3 * 1024 * 1024) + '" style="width:50%"></p>';
  const m = P.measure(html);
  assert.ok(html.length > P.MAX_HTML);
  assert.ok(m.html < 200);
  assert.equal(m.count, 1);
  assert.equal(P.plan({ html, text: 'Hi' }), 'html');
  assert.equal(P.plan({ html: '<p>' + 'x'.repeat(P.MAX_HTML + 10) + '</p>', text: 'x' }), 'big');
  const huge = '<img src="' + big(P.MAX_IMG + 10) + '">';
  assert.equal(P.plan({ html: huge, text: '' }), 'bigimg');
});

test('picture cap: a paste over 20 MB of pictures toasts and pastes text only', () => {
  const { P, log } = load();
  P.handle(pasteEvt({ 'text/html': '<p>a</p><img src="' + big(P.MAX_IMG + 10) + '">', 'text/plain': 'a' }));
  assert.deepEqual(log.find((x) => x[0] === 'plain'), ['plain', 'a']);
  assert.ok(log.some((x) => x[0] === 'toast' && /too big/.test(x[1])));
  assert.ok(!log.some((x) => x[0] === 'html'));
});

test('copy inside Writer: a big picture (> 2 MB html) pastes as a picture, not plain text', async () => {
  const { W, P, log } = load();
  let loads = 0;
  W.image = { load: () => { loads++; return Promise.resolve('data:image/jpeg;base64,/9j/AAAA'); } };
  const pic = big(2.5 * 1024 * 1024);
  const html = '<meta charset="utf-8"><p class="dl-img-block"><img src="' + pic + '" alt="" style="width:40%;max-width:100%;"></p>';
  P.handle(pasteEvt({ 'text/html': html }));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(loads, 1, 'big picture downscaled through Writer.image.load');
  const ins = log.find((x) => x[0] === 'html');
  assert.ok(ins && ins[1].indexOf('data:image/jpeg;base64,/9j/AAAA') !== -1 && ins[1].indexOf(pic) === -1);
  assert.ok(!log.some((x) => x[0] === 'plain'));
  assert.ok(!log.some((x) => x[0] === 'chip'), 'no chip for a picture-only paste');
  assert.deepEqual(log.filter((x) => x[0] === 'checkpoint' || x[0] === 'commit').map((x) => x[0]), ['checkpoint', 'commit']);
});

test('a small Writer picture pastes straight away; text + picture keeps the chip', () => {
  const a = load();
  a.P.handle(pasteEvt({ 'text/html': '<p class="dl-img-block"><img src="' + PNG + '"></p>' }));
  assert.ok(a.log.some((x) => x[0] === 'html'));
  assert.ok(!a.log.some((x) => x[0] === 'chip'));
  assert.ok(a.log.some((x) => x[0] === 'replaceSel'), 'Ctrl+V with a picture selected replaces it');
  const b = load();
  b.P.handle(pasteEvt({ 'text/html': '<p>Hello</p><img src="' + PNG + '">', 'text/plain': 'Hello' }));
  assert.ok(b.log.some((x) => x[0] === 'chip'));
});

test('hasText / wantChip: pictures, spaces and markup are not text', () => {
  const { P } = load();
  assert.equal(P.hasText('<html><head><style>p{}</style><title>T</title></head><body><!--StartFragment--><p>&nbsp;<img src="' + PNG + '"></p></body>'), false);
  assert.equal(P.hasText('<p><img src="x.png"> Hello</p>'), true);
  assert.equal(P.wantChip('html', '<img src="' + PNG + '">'), false);
  assert.equal(P.wantChip('html', '<b>x</b>'), true);
  assert.equal(P.wantChip('plain', '<b>x</b>'), false);
});

test('external paste unchanged: html wins over an image file; file only when nothing else', () => {
  const { P } = load();
  assert.equal(P.plan({ html: '<img src="https://example.com/a.png">', text: '', hasFile: true }), 'html');
  assert.equal(P.plan({ html: '', text: '', hasFile: true }), 'image');
  assert.equal(P.plan({ html: '', text: 'x', hasFile: true }), 'plain');
  assert.equal(P.plan({ html: '', text: '', hasFile: false }), 'none');
  assert.equal(P.plan({ html: '<b>x</b>', text: 'x', plainOnly: true }), 'plain');
});

test('sanitizer keeps data: pictures with their width', () => {
  const { P } = load();
  assert.ok(P.IMG.test(PNG));
  assert.ok(!P.IMG.test('https://example.com/a.png'));
  assert.equal(P.imgWidth('width:40%;max-width:100%;'), '40%');
  assert.equal(P.imgWidth('max-width:100%;width:62.5%'), '62.5%');
  assert.equal(P.imgWidth('max-width:100%;'), '100%');
  assert.equal(P.imgWidth('width:300px'), '100%');
  assert.equal(P.imgWidth('width:2%'), '100%');
  assert.equal(P.imgWidth(null), '100%');
  const live = SRC.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/if \(tag === 'IMG'\)[\s\S]{0,400}P\.IMG\.test\(srcv\)[\s\S]{0,400}P\.imgWidth\(n\.getAttribute\('style'\)\)/.test(live));
});

test('copy / cut of a selected picture puts <img> html on the clipboard', () => {
  const { W, P, log, listeners } = load();
  const img = { getAttribute: (a) => (a === 'src' ? PNG : null), style: { width: '50%' } };
  let removed = 0;
  W.image = { sel: img, remove: () => { removed++; } };
  const set = {};
  const ev = (type) => ({ type, clipboardData: { setData: (t, v) => { set[t] = v; } }, preventDefault() { this.prevented = true; } });
  assert.equal(listeners.copy.length, 1);
  assert.equal(listeners.cut.length, 1);
  const c = ev('copy'); P.onCopy(c);
  assert.ok(c.prevented);
  assert.equal(set['text/html'], '<p class="dl-img-block"><img src="' + PNG + '" alt="" style="width:50%;max-width:100%;"></p>');
  assert.equal(removed, 0);
  const x = ev('cut'); P.onCopy(x);
  assert.equal(removed, 1);
  assert.deepEqual(log.map((l) => l[0]), ['checkpoint', 'commit'], 'cut is one undo step');
  /* nothing selected: the browser copies text as usual */
  W.image.sel = null;
  const n = ev('copy'); P.onCopy(n);
  assert.ok(!n.prevented);
  /* the copied html pastes back as a picture */
  assert.equal(P.firstDataImg(set['text/html']), PNG);
});

/* (before DW13c) the two tests below pasted into slot k (foot slot 2 / head slot 0) and
   expected setPic(part, k, { src, size: 'M' }). DW13c: the header / footer is one block
   (.hf-text, still class hf-slot): setPic(part, { src, h: 14, a: 'c' }), and a replaced
   picture keeps its height and alignment. */
test('header / footer: a Writer picture pasted into the block sets its picture at 14 mm, centred', async () => {
  const { W, P } = load();
  const calls = [];
  const pics = { head: null, foot: null };
  W.hfimg = { MAX_PX: 600 };
  let max = 0;
  W.image = { load: (b, m) => { max = m; assert.equal(b.type, 'image/png'); return Promise.resolve('data:image/png;base64,SMALL'); } };
  const slot = { nodeType: 1, closest: (s) => (s === '.hf-slot' ? slot : null) };
  W.hf = {
    editing: true, lastSlot: null,
    activeSlot: () => ({ part: 'foot', k: 0 }),
    setPic: (part, pic) => { calls.push([part, pic]); pics[part] = pic; },
    pic: (part) => pics[part], note: (m) => calls.push(['note', m]), refocus() {}
  };
  const e = pasteEvt({ 'text/html': '<p class="dl-img-block"><img src="' + PNG + '" style="width:30%"></p>' });
  e.target = slot;
  let stopped = false; e.preventDefault = () => { stopped = true; };
  P.onHfPaste(e);
  await new Promise((r) => setTimeout(r, 5));
  assert.ok(stopped);
  assert.equal(W.hf.lastSlot, slot);
  assert.equal(max, 600);
  assert.equal(calls.length, 1, 'one setPic = one header / footer undo step');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), ['foot', { src: 'data:image/png;base64,SMALL', h: 14, a: 'c' }]);
});

test('header / footer: text pastes as before; image file pastes as the picture, a replaced one keeps its size', async () => {
  const { W, P } = load();
  const calls = [];
  W.image = { load: () => Promise.resolve('data:image/png;base64,F') };
  const slot = { nodeType: 1, closest: () => slot };
  W.hf = { editing: true, activeSlot: () => ({ part: 'head', k: 0 }), setPic: (...a) => calls.push(a), pic: () => ({ src: 'x', h: 30, a: 'r' }), note() {}, refocus() {} };
  const t = pasteEvt({ 'text/html': '<p>Logo <img src="' + PNG + '"></p>', 'text/plain': 'Logo' });
  t.target = slot; let prevented = false; t.preventDefault = () => { prevented = true; };
  P.onHfPaste(t);
  assert.ok(!prevented, 'text with a picture stays a plain text paste in the block');
  const f = pasteEvt({}, [{ type: 'image/png' }]);
  f.target = slot;
  P.onHfPaste(f);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'head');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][1])), { src: 'data:image/png;base64,F', h: 30, a: 'r' });
  /* not editing: nothing happens */
  W.hf.editing = false;
  const g = pasteEvt({}, [{ type: 'image/png' }]); g.target = slot; let p2 = false; g.preventDefault = () => { p2 = true; };
  P.onHfPaste(g);
  assert.ok(!p2);
});

test('dataBlob decodes a data URL; bigImgs finds only big pictures', () => {
  const { P } = load();
  const b = P.dataBlob(PNG);
  assert.equal(b.type, 'image/png');
  assert.ok(b.size > 60);
  assert.equal(P.dataBlob('https://x'), null);
  assert.equal(P.bigImgs('<img src="' + PNG + '">').length, 0);
  assert.equal(P.bigImgs('<img src="' + big(P.SHRINK + 5) + '">').length, 1);
});

test('release is DW13; Writer picture keys in writer-image.js; no browser dialogs', () => {
  const html = fs.readFileSync(path.join(DIR, 'writer.html'), 'utf8');
  /* (before DW13b) assert.ok(html.replace(/<!--[\s\S]*?-->/g, '').indexOf('<title>Writer DW13</title>') !== -1); */
  /* (before DW13c) assert.ok(html.replace(/<!--[\s\S]*?-->/g, '').indexOf('<title>Writer DW13b</title>') !== -1); */
  /* (before DW14) assert.ok(/<title>Writer DW13(b|c)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW14a) assert.ok(/<title>Writer DW(13b|13c|14)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW15) assert.ok(/<title>Writer DW(13b|13c|14|14a)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW16) assert.ok(/<title>Writer DW(13b|13c|14|14a|15)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW17) assert.ok(/<title>Writer DW(13b|13c|14|14a|15|16)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  /* (before DW18) assert.ok(/<title>Writer DW(13b|13c|14|14a|15|16|17)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, ''))); */
  assert.ok(/<title>Writer DW(13b|13c|14|14a|15|16|17|18)<\/title>/.test(html.replace(/<!--[\s\S]*?-->/g, '')));
  assert.ok(html.indexOf('<!-- (before DW13) <title>Writer DW12</title> -->') !== -1);
  const cfg = fs.readFileSync(path.join(DIR, 'modules/writer-config.js'), 'utf8');
  /* (before DW13b) assert.ok(/release:\s*'DW13'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW13c) assert.ok(/release:\s*'DW13b?'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW14) assert.ok(/release:\s*'DW13[bc]?'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW14a) assert.ok(/release:\s*'DW(13|13b|13c|14)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW15) assert.ok(/release:\s*'DW(13|13b|13c|14|14a)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW16) assert.ok(/release:\s*'DW(13|13b|13c|14|14a|15)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW17) assert.ok(/release:\s*'DW(13|13b|13c|14|14a|15|16)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW18) assert.ok(/release:\s*'DW(13|13b|13c|14|14a|15|16|17)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW(13|13b|13c|14|14a|15|16|17|18)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
  const img = fs.readFileSync(path.join(DIR, 'modules/writer-image.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/e\.ctrlKey \|\| e\.metaKey/.test(img) && /selectNode\(I\.sel\)/.test(img));
  ['modules/writer-paste.js', 'modules/writer-image.js'].forEach((f) => {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(src), f);
    assert.ok(!/\bfetch\s*\(/.test(src), 'no remote fetch in ' + f);
  });
});
