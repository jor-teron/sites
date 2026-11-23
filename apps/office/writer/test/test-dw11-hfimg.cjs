/* DW11: Writer header / footer pictures.
   Pure checks: normalise old / missing / broken data, size mapping and
   margin fit, PDF placement math, .how round-trip with pictures, and the
   header / footer undo for adding, resizing and removing a picture.
   DW13c: the 3-slot normaliser is now I.normalizeSlots (still used to read
   old files); I.normalize returns the one-block shape (test-dw13c-hfblock.cjs).
   The .how and Writer.hf checks below now expect the block shape: one
   picture per header / footer { src, h, a } instead of per-slot { src, size }.
   No browser, no network.
   Run: node --test apps/office/writer/test/test-dw11-hfimg.cjs */
'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const I = require('../modules/writer-hfimg.js');
const How = require('../modules/writer-how.js');

const DIR = path.resolve(__dirname, '..');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';

test('normalize: old documents without pictures load with empty picture slots', () => {
  /* (before DW13c) const out = I.normalize({ head: ['Hub', '', 'Office'], foot: ['', '{page}', ''] }); */
  const out = I.normalizeSlots({ head: ['Hub', '', 'Office'], foot: ['', '{page}', ''] });
  assert.deepEqual(out.head, ['Hub', '', 'Office']);
  assert.deepEqual(out.foot, ['', '{page}', '']);
  assert.deepEqual(out.img, { head: [null, null, null], foot: [null, null, null] });
});

test('normalize: missing or broken hf gives a blank header / footer', () => {
  const blank = { head: ['', '', ''], foot: ['', '', ''], img: { head: [null, null, null], foot: [null, null, null] } };
  /* (before DW13c) assert.deepEqual(I.normalize(undefined), blank); */
  assert.deepEqual(I.normalizeSlots(undefined), blank);
  /* (before DW13c) assert.deepEqual(I.normalize(null), blank); */
  assert.deepEqual(I.normalizeSlots(null), blank);
  /* (before DW13c) assert.deepEqual(I.normalize('nope'), blank); */
  assert.deepEqual(I.normalizeSlots('nope'), blank);
  /* (before DW13c) assert.deepEqual(I.normalize({ head: 'x', foot: 5, img: 'y' }), blank); */
  assert.deepEqual(I.normalizeSlots({ head: 'x', foot: 5, img: 'y' }), blank);
  /* (before DW13c) assert.deepEqual(I.normalize({ head: ['a'], foot: [null, 2] }).foot, ['', '2', '']); */
  assert.deepEqual(I.normalizeSlots({ head: ['a'], foot: [null, 2] }).foot, ['', '2', '']);
});

test('normalize: invalid pictures are dropped, sizes default to M', () => {
  /* (before DW13c) const out = I.normalize({ head: ['', '', ''], foot: ['', '', ''], img: { */
  const out = I.normalizeSlots({ head: ['', '', ''], foot: ['', '', ''], img: {
    head: [{ src: PNG, size: 'S' }, { src: 'javascript:alert(1)', size: 'M' }, { src: JPG }],
    foot: [{ src: 'data:image/svg+xml;base64,PHN2Zz4=', size: 'L' }, 7, { src: PNG, size: 'xl' }]
  } });
  assert.deepEqual(out.img.head, [{ src: PNG, size: 'S' }, null, { src: JPG, size: 'M' }]);
  assert.deepEqual(out.img.foot, [null, null, { src: PNG, size: 'M' }]);
  assert.equal(I.normPic({ src: PNG, size: 'l' }).size, 'L');
  assert.equal(I.normPic({ src: 'data:image/png;base64,' + 'A'.repeat(I.MAX_SRC + 1) }), null);
  assert.equal(I.normPic(null), null);
  assert.equal(I.hasAny(out.img), true);
  assert.equal(I.hasAny(I.blankPics()), false);
  assert.equal(I.hasAny(undefined), false);
});

test('size mapping: S 8 mm, M 14 mm, L 20 mm when the margin has room', () => {
  assert.equal(I.heightMm('S', 30), 8);
  assert.equal(I.heightMm('M', 30), 14);
  assert.equal(I.heightMm('L', 30), 20);
  assert.equal(I.heightMm('?', 30), 14);
});

test('size mapping: cut down to fit inside the margin, never below the minimum', () => {
  assert.equal(I.heightMm('L', 15), 13);          /* 15 - 1 edge - 1 gap */
  assert.equal(I.heightMm('S', 9), 7);
  assert.equal(I.heightMm('L', 5), I.MIN_MM);     /* default 0.5 cm top margin */
  assert.equal(I.heightMm('M', 0), I.MIN_MM);
});

test('fit keeps the aspect ratio and the column width', () => {
  assert.deepEqual(I.fit(2, 'M', 30, 60), { w: 28, h: 14 });
  const wide = I.fit(10, 'L', 30, 50);              /* 200 mm wide wanted, column 50 mm */
  assert.ok(Math.abs(wide.w - 45) < 1e-9);
  assert.ok(Math.abs(wide.h - 4.5) < 1e-9);
  assert.deepEqual(I.fit(NaN, 'S', 30, 60), { w: 8, h: 8 });
});

test('boxTop centres the header / footer box in the margin', () => {
  assert.equal(I.boxTop(30, 14), 8);
  assert.equal(I.boxTop(5, 4.2), I.EDGE_MM);
  assert.equal(I.boxTop(5, 3), I.EDGE_MM);
});

test('PDF placement: picture before text, left / centre / right', () => {
  const g = { w: 210, ml: 20, mr: 20 };            /* A4, 170 mm text width */
  const L = I.place(0, 10, 30, g);
  assert.equal(L.picX, 20);
  assert.equal(L.textX, 20 + 10 + I.PIC_GAP_MM);
  const C = I.place(1, 10, 30, g);
  const total = 10 + I.PIC_GAP_MM + 30;
  assert.ok(Math.abs(C.picX - (105 - total / 2)) < 1e-9);
  assert.ok(Math.abs(C.textX - (C.picX + 10 + I.PIC_GAP_MM)) < 1e-9);
  const R = I.place(2, 10, 30, g);
  assert.ok(Math.abs(R.textX + 30 - 190) < 1e-9);   /* text ends at the right margin */
  assert.ok(Math.abs(R.picX - (190 - total)) < 1e-9);
  assert.deepEqual(I.place(0, 10, 0, g), { picX: 20, textX: 30 });   /* picture only: no gap */
  assert.ok(Math.abs(I.place(1, 0, 30, g).textX - 90) < 1e-9);       /* text only: centred as before */
});

test('scaleTo caps the longest side for header pictures', () => {
  assert.deepEqual(I.scaleTo(1200, 300), { w: 600, h: 150 });
  assert.deepEqual(I.scaleTo(300, 1200), { w: 150, h: 600 });
  assert.deepEqual(I.scaleTo(100, 50), { w: 100, h: 50 });
  assert.deepEqual(I.scaleTo(0, 50), { w: 0, h: 0 });
});

/* (before DW13c) the two .how tests expected the 3-slot shape back unchanged
   (hf.img per slot, no img key without pictures). DW13c: old files come back
   as the one-block shape, the first slot picture at its preset height. */
test('.how round-trip keeps header / footer pictures', () => {
  const hf = { head: ['Acme Ltd', '', '{date}'], foot: ['', '{page}', ''],
    img: { head: [{ src: PNG, size: 'L' }, null, null], foot: [null, null, { src: JPG, size: 'S' }] } };
  const want = { v: 2, head: ['Acme Ltd', '{date}'], foot: ['{page}'], al: { head: ['l', 'r'], foot: ['c'] },
    pic: { head: { src: PNG, h: 20, a: 'l' }, foot: { src: JPG, h: 8, a: 'r' } } };
  const text = How.stringify({ name: 'Letter', html: '<p>Hi</p>', hf: hf });
  const back = How.parse(text);
  assert.deepEqual(back.hf, want);
  assert.deepEqual(How.parse(How.stringify(back)).hf, want);
});

test('.how without pictures has no pic key, broken pictures are dropped', () => {
  const plain = How.parse(How.stringify({ name: 'A', html: '<p>x</p>', hf: { head: ['a', '', ''], foot: ['', '', ''] } }));
  assert.deepEqual(plain.hf, { v: 2, head: ['a'], foot: [], al: { head: ['l'], foot: [] } });
  assert.ok(!('img' in plain.hf) && !('pic' in plain.hf));
  const none = How.parse(How.stringify({ name: 'B', html: '', hf: { head: [], foot: [], img: { head: [null, null, null], foot: [null, null, null] } } }));
  assert.ok(!('pic' in none.hf));
  const bad = JSON.parse(How.stringify({ name: 'C', html: '' }));
  bad.hf.img = { head: [{ src: 'http://x/y.png', size: 'S' }], foot: 'x' };
  delete bad.hf.v;
  assert.ok(!('pic' in How.parse(JSON.stringify(bad)).hf));
  const bad2 = JSON.parse(How.stringify({ name: 'D', html: '' }));
  bad2.hf.pic = { head: { src: 'http://x/y.png', h: 9 }, foot: 'x' };
  assert.ok(!('pic' in How.parse(JSON.stringify(bad2)).hf));
});

/* Writer.hf in a tiny DOM-less sandbox: picture undo / redo. */
function loadHf() {
  const doc = {
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null,
    contains: () => true, activeElement: null, body: { classList: { add() {}, remove() {}, contains: () => false } }
  };
  const win = { Writer: { hfimg: I, config: { marginTopCm: 0.5, marginBottomCm: 0.6, inputDebounceMs: 5 } } };
  const ctx = { window: win, document: doc, console, Date, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'modules/writer-headerfooter.js'), 'utf8'), ctx);
  return win.Writer.hf;
}

/* (before DW13c) these two checked H.get().img rows and setPic(part, k, { src, size }) per slot. */
test('Writer.hf: set() normalises, isEmpty() counts pictures', () => {
  const H = loadHf();
  H.set({ head: ['', '', ''], foot: ['', '', ''] });
  assert.equal(H.isEmpty(), true);
  assert.deepEqual(H.get().pic, { head: null, foot: null });
  H.set({ head: ['', '', ''], foot: ['', '', ''], img: { head: [null, { src: PNG, size: 'S' }, null] } });
  assert.equal(H.isEmpty(), false);
  assert.equal(H.partEmpty('head'), false);
  assert.equal(H.partEmpty('foot'), true);
  assert.deepEqual(H.get().pic.head, { src: PNG, h: 8, a: 'c' });
  assert.equal(H.get().pic.foot, null);
});

test('Writer.hf: adding, resizing and removing a picture are undo steps', () => {
  const H = loadHf();
  H.set({ head: ['Acme', '', ''], foot: ['', '', ''] });
  H.setPic('head', 0, { src: PNG, size: 'M' });     /* old 3-argument form still works */
  H.setPic('head', { src: PNG, h: 20 });            /* no alignment given: keeps the one it had */
  H.setPic('head', null);
  assert.equal(H.data.pic.head, null);
  H.restore(H.undoStack, H.redoStack);
  assert.deepEqual(H.data.pic.head, { src: PNG, h: 20, a: 'c' });
  H.restore(H.undoStack, H.redoStack);
  assert.deepEqual(H.data.pic.head, { src: PNG, h: 14, a: 'c' });
  H.restore(H.undoStack, H.redoStack);
  assert.equal(H.data.pic.head, null);
  assert.deepEqual(H.data.head, ['Acme']);
  H.restore(H.redoStack, H.undoStack);
  assert.deepEqual(H.data.pic.head, { src: PNG, h: 14, a: 'c' });
  H.setPic('side', { src: PNG });                   /* bad part: ignored */
  assert.equal(H.undoStack.length, 1);
});

test('writer.html wires DW11: title, scripts, picture tools; no browser dialogs', () => {
  const html = fs.readFileSync(path.join(DIR, 'writer.html'), 'utf8');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  /* (before DW11a) assert.ok(live.indexOf('<title>Writer DW11</title>') !== -1); */
  /* (before DW12) assert.ok(live.indexOf('<title>Writer DW11a</title>') !== -1); */
  /* (before DW13) assert.ok(/<title>Writer DW1(1a|2)<\/title>/.test(live)); */
  /* (before DW13b) assert.ok(/<title>Writer DW1(1a|2|3)<\/title>/.test(live)); */
  /* (before DW13c) assert.ok(/<title>Writer DW1(1a|2|3|3b)<\/title>/.test(live)); */
  /* (before DW14) assert.ok(/<title>Writer DW1(1a|2|3|3b|3c)<\/title>/.test(live)); */
  /* (before DW14a) assert.ok(/<title>Writer DW1(1a|2|3|3b|3c|4)<\/title>/.test(live)); */
  /* (before DW15) assert.ok(/<title>Writer DW1(1a|2|3|3b|3c|4|4a)<\/title>/.test(live)); */
  /* (before DW16) assert.ok(/<title>Writer DW1(1a|2|3|3b|3c|4|4a|5)<\/title>/.test(live)); */
  /* (before DW17) assert.ok(/<title>Writer DW1(1a|2|3|3b|3c|4|4a|5|6)<\/title>/.test(live)); */
  /* (before DW18) assert.ok(/<title>Writer DW1(1a|2|3|3b|3c|4|4a|5|6|7)<\/title>/.test(live)); */
  /* (before DW19) assert.ok(/<title>Writer DW1(1a|2|3|3b|3c|4|4a|5|6|7|8)<\/title>/.test(live)); */
  /* (before DW22) assert.ok(/<title>Writer DW1(1a|2|3|3b|3c|4|4a|5|6|7|8|9)<\/title>/.test(live)); */
  /* (before DW23) assert.ok(/<title>Writer DW(1(1a|2|3|3b|3c|4|4a|5|6|7|8|9)|22)<\/title>/.test(live)); */
  /* (before DW24) assert.ok(/<title>Writer DW(1(1a|2|3|3b|3c|4|4a|5|6|7|8|9)|22|23)<\/title>/.test(live)); */
  assert.ok(/<title>Writer DW(1(1a|2|3|3b|3c|4|4a|5|6|7|8|9)|22|23|24)<\/title>/.test(live));
  assert.ok(html.indexOf('<!-- (before DW11) <title>Writer DW9</title> -->') !== -1);
  assert.ok(live.indexOf('src="modules/writer-hfimg.js"') !== -1);
  assert.ok(live.indexOf('src="modules/writer-hfimg.js"') < live.indexOf('src="modules/writer-headerfooter.js"'));
  assert.ok(live.indexOf('src="modules/writer-hfimg.js"') < live.indexOf('src="modules/writer-how.js"'));
  ['id="hfPicBtn"', 'id="hfPicFile" accept="image/*"', 'id="hfPicOpts"', 'data-hf-size="S"', 'data-hf-size="M"', 'data-hf-size="L"', 'id="hfPicRemove"']
    .forEach((s) => assert.ok(live.indexOf(s) !== -1, s));
  const cfg = fs.readFileSync(path.join(DIR, 'modules/writer-config.js'), 'utf8');
  /* (before DW11a) assert.ok(/release:\s*'DW11'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW12) assert.ok(/release:\s*'DW11a'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW13) assert.ok(/release:\s*'DW(11a|12)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW13b) assert.ok(/release:\s*'DW(11a|12|13)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW13c) assert.ok(/release:\s*'DW(11a|12|13|13b)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW14) assert.ok(/release:\s*'DW(11a|12|13|13b|13c)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW14a) assert.ok(/release:\s*'DW(11a|12|13|13b|13c|14)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW15) assert.ok(/release:\s*'DW(11a|12|13|13b|13c|14|14a)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW16) assert.ok(/release:\s*'DW(11a|12|13|13b|13c|14|14a|15)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW17) assert.ok(/release:\s*'DW(11a|12|13|13b|13c|14|14a|15|16)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW18) assert.ok(/release:\s*'DW(11a|12|13|13b|13c|14|14a|15|16|17)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW19) assert.ok(/release:\s*'DW(11a|12|13|13b|13c|14|14a|15|16|17|18)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW22) assert.ok(/release:\s*'DW(11a|12|13|13b|13c|14|14a|15|16|17|18|19)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW23) assert.ok(/release:\s*'DW(11a|12|13|13b|13c|14|14a|15|16|17|18|19|22)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW24) assert.ok(/release:\s*'DW(11a|12|13|13b|13c|14|14a|15|16|17|18|19|22|23)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW(11a|12|13|13b|13c|14|14a|15|16|17|18|19|22|23|24)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
  ['modules/writer-hfimg.js', 'modules/writer-headerfooter.js', 'modules/writer-pdfgen.js'].forEach((f) => {
    const src = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(src), 'no browser dialogs in ' + f);
  });
});
