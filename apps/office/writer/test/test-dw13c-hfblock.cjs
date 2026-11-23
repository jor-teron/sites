/* DW13c: Writer letterhead header / footer (one full-width block, resizable
   picture, grows to fit). Pure checks, no browser, no network:
   - migration of the old 3-slot shape (texts become lines with their slot's
     alignment, first slot picture taken, S / M / L mapped to a height)
   - .how save / load round trip of the new shape (and old files still load)
   - height clamp, aspect and resize math, S / M / L presets
   - block height and how far the body moves (one plain line: nothing)
   - paste and drop route a picture to the one block (real Writer.hf)
   - DOCX / ODT header XML has the picture before the text lines
   Run: node --test apps/office/writer/test/test-dw13c-hfblock.cjs */
'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const I = require('../modules/writer-hfimg.js');
const How = require('../modules/writer-how.js');

const DIR = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
/* 40 x 20 px red PNG (aspect 2:1) */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAIAAABwJOjsAAAAJElEQVR42mM4ISc3IIhh1OJRi0ctHrV41OJRi0ctHrV45FgMAFLhLK5O4QWwAAAAAElFTkSuQmCC';
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
const near = (a, b) => Math.abs(a - b) < 1e-6;

/* ---------------------------------------------------------- migration */
test('migration: slot texts become lines left -> centre -> right with their alignment', () => {
  const b = I.normalize({ head: ['Acme Ltd', 'Invoice', '{date}'], foot: ['', '{page}', ''] });
  assert.equal(b.v, 2);
  assert.deepEqual(b.head, ['Acme Ltd', 'Invoice', '{date}']);
  assert.deepEqual(b.al.head, ['l', 'c', 'r']);
  assert.deepEqual(b.foot, ['{page}']);          /* empty slots are skipped */
  assert.deepEqual(b.al.foot, ['c']);
  assert.deepEqual(b.pic, { head: null, foot: null });
});

test('migration: the first slot picture is taken, its size mapped to a height, its slot to the alignment', () => {
  const b = I.normalize({ head: ['', 'x', ''], foot: ['', '', ''], img: {
    head: [null, { src: PNG, size: 'L' }, { src: JPG, size: 'S' }],
    foot: [{ src: 'javascript:1', size: 'M' }, null, { src: JPG, size: 's' }] } });
  assert.deepEqual(b.pic.head, { src: PNG, h: 20, a: 'c' });
  assert.deepEqual(b.pic.foot, { src: JPG, h: 8, a: 'r' });   /* the broken one is skipped */
  assert.deepEqual(I.normalize({ head: [], foot: [], img: { head: [{ src: PNG }] } }).pic.head, { src: PNG, h: 14, a: 'l' });   /* no size: M */
});

test('migration: missing / broken values give an empty block', () => {
  const blank = I.blank();
  assert.deepEqual(I.normalize(undefined), blank);
  assert.deepEqual(I.normalize(null), blank);
  assert.deepEqual(I.normalize('x'), blank);
  assert.deepEqual(I.normalize({ head: 'x', foot: 5 }), blank);
  assert.deepEqual(blank, { v: 2, head: [], foot: [], al: { head: [], foot: [] }, pic: { head: null, foot: null } });
});

test('block normalize: alignments fill in, bad pictures drop, all-empty lines become []', () => {
  const b = I.normalize({ v: 2, head: ['A', 'B', ''], foot: [' ', ''], al: { head: ['right', 'x'] },
    pic: { head: { src: PNG, h: 99, a: 'left' }, foot: { src: 'http://x/y.png', h: 10 } } });
  assert.deepEqual(b.head, ['A', 'B', '']);          /* a blank line under the text is kept */
  assert.deepEqual(b.al.head, ['r', 'c', 'c']);
  assert.deepEqual(b.foot, []);
  assert.deepEqual(b.pic.head, { src: PNG, h: 60, a: 'l' });   /* clamped */
  assert.equal(b.pic.foot, null);
  const long = I.normalize({ v: 2, head: Array.from({ length: 50 }, (x, i) => 'L' + i), foot: [] });
  assert.equal(long.head.length, I.MAX_LINES);
  assert.equal(I.normalize({ v: 2, head: ['a\nb'], foot: [] }).head[0], 'a b');
});

/* ---------------------------------------------------------- .how */
test('.how round trip keeps the block (lines, alignments, picture height and alignment)', () => {
  const hf = { v: 2, head: ['Acme Ltd', '12 High Street', ''], foot: ['Page {page} of {pages}'],
    al: { head: ['c', 'c', 'l'], foot: ['r'] }, pic: { head: { src: PNG, h: 23.5, a: 'c' }, foot: null } };
  const back = How.parse(How.stringify({ name: 'Letterhead', html: '<p>Hi</p>', hf: hf }));
  assert.deepEqual(back.hf, hf);
  assert.deepEqual(How.parse(How.stringify(back)).hf, hf);
  const text = How.stringify({ name: 'A', html: '', hf: hf });
  assert.ok(text.indexOf('"version": 1') !== -1, 'file version unchanged');
  assert.ok(text.indexOf('"v": 2') !== -1, 'hf shape version 2');
});

test('.how: an old 3-slot file loads into the block, no pic key without pictures', () => {
  const old = JSON.parse(How.stringify({ name: 'Old', html: '<p>x</p>' }));
  old.hf = { head: ['Left', '', 'Right'], foot: ['', '', ''], img: { head: [null, null, { src: JPG, size: 'L' }] } };
  const back = How.parse(JSON.stringify(old));
  assert.deepEqual(back.hf, { v: 2, head: ['Left', 'Right'], foot: [], al: { head: ['l', 'r'], foot: [] }, pic: { head: { src: JPG, h: 20, a: 'r' }, foot: null } });
  const plain = How.parse(How.stringify({ name: 'P', html: '', hf: { v: 2, head: ['x'], foot: [], al: { head: ['c'] } } }));
  assert.ok(!('pic' in plain.hf));
});

/* ---------------------------------------------------------- size math */
test('height clamp 6..60 mm, presets S 8 / M 14 / L 20, default 14', () => {
  assert.equal(I.clampH(2), 6);
  assert.equal(I.clampH(80), 60);
  assert.equal(I.clampH(17.333), 17.33);
  assert.equal(I.clampH('x'), 14);
  assert.equal(I.clampH(-3), 6);
  assert.deepEqual(I.PRESETS, { S: 8, M: 14, L: 20 });
  assert.equal(I.DEFAULT_H, 14);
  assert.equal(I.presetOf(8), 'S');
  assert.equal(I.presetOf(20), 'L');
  assert.equal(I.presetOf(21), '');
});

test('aspect and resize math: width follows the height, never wider than the column', () => {
  assert.deepEqual(I.fitPic(2, 14, 170), { w: 28, h: 14 });
  const wide = I.fitPic(10, 30, 170);            /* 300 mm wanted, column 170 mm */
  assert.ok(near(wide.w, 170) && near(wide.h, 17));
  assert.deepEqual(I.fitPic(NaN, 10, 170), { w: 10, h: 10 });
  assert.equal(I.resizeH(14, 6), 20);            /* drag 6 mm down / out */
  assert.equal(I.resizeH(14, -20), 6);           /* never below 6 */
  assert.equal(I.resizeH(50, 30), 60);           /* never above 60 */
  assert.equal(I.picX('l', 28, 170), 0);
  assert.equal(I.picX('c', 28, 170), 71);
  assert.equal(I.picX('r', 28, 170), 142);
});

/* ---------------------------------------------------------- growth */
test('block height grows with picture and lines; a plain one-line header moves nothing', () => {
  const line = I.TEXT_MM;
  assert.ok(near(I.blockMm(1, 0), line));
  assert.ok(near(I.blockMm(0, 0), line));        /* at least one line */
  assert.ok(near(I.blockMm(3, 14), 14 + I.PIC_GAP_MM + 3 * line));
  assert.equal(I.extraMm(5, I.blockMm(1, 0)), 0);    /* default 0.5 cm margin */
  assert.equal(I.extraMm(25, I.blockMm(1, 0)), 0);
  /* more than one line: the body starts GAP_MM under the block (edge 0.4 x margin) */
  const two = I.extraMm(5, I.blockMm(2, 0));
  assert.ok(near(two, Math.round((2 + 2 * line + I.GAP_MM - 5) * 100) / 100), String(two));
  const lh = I.extraMm(5, I.blockMm(2, 14));
  assert.ok(near(lh, Math.round((2 + 14 + I.PIC_GAP_MM + 2 * line + I.GAP_MM - 5) * 100) / 100), String(lh));
  assert.ok(I.extraMm(25, I.blockMm(2, 14)) < lh);       /* a big margin absorbs some of it */
  assert.equal(I.extraMm(50, I.blockMm(2, 14)), 0);      /* ... or all of it */
  assert.equal(I.edgeMm(5), 2);
});

/* Writer.hf in a DOM-less sandbox (as in test-dw11-hfimg.cjs) */
function loadHf(extra) {
  const props = {};
  const doc = {
    querySelectorAll: () => [], querySelector: () => null, getElementById: () => null,
    contains: () => true, activeElement: null, addEventListener() {},
    body: { classList: { add() {}, remove() {}, contains: () => false } },
    documentElement: { style: { setProperty: (k, v) => { props[k] = v; } } }
  };
  const flows = [];
  const win = { Writer: Object.assign({ hfimg: I,
    config: { marginTopCm: 0.5, marginBottomCm: 0.6, marginLeftCm: 2, marginRightCm: 2, inputDebounceMs: 5, paperSize: 'A4', paperSizes: { A4: { widthCm: 21, heightCm: 29.7 } } },
    pages: { layoutAll: () => flows.push(1) }, flow: {} }, extra || {}) };
  const ctx = { window: win, document: doc, console, Date, setTimeout, clearTimeout, localStorage: { getItem: () => null, setItem() {} } };
  vm.createContext(ctx);
  vm.runInContext(read('modules/writer-headerfooter.js'), ctx);
  win.Writer.hf.props = props; win.Writer.hf.flows = flows;
  return { H: win.Writer.hf, W: win.Writer, ctx, doc };
}

test('Writer.hf: the body moves by the grown block and back; pages re-flow once per change', async () => {
  const { H } = loadHf();
  H.set({ v: 2, head: ['Acme'], foot: [], al: { head: ['c'] } });
  assert.deepEqual(H.extra, { head: 0, foot: 0 });
  H.ar[PNG] = 2;
  H.setPic('head', { src: PNG, h: 14 });
  const want = I.extraMm(5, I.blockMm(1, 14));
  assert.equal(H.extra.head, want);
  assert.equal(H.props['--hf-head-extra-mm'], String(want));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(H.flows.length, 1);
  H.render();                                     /* nothing changed: no re-flow */
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(H.flows.length, 1);
  H.removePic();                                  /* not editing: no active block, nothing */
  H.setPic('head', null);
  assert.equal(H.extra.head, 0);
  assert.equal(H.props['--hf-head-extra-mm'], '0');
});

test('Writer.hf: S / M / L presets and Remove act on the selected picture', () => {
  const { H } = loadHf();
  H.set({ v: 2, head: ['x'], foot: [], pic: { head: { src: PNG, h: 33, a: 'r' } } });
  H.editing = true; H.picSel = 'head';
  H.sizePic('S');
  assert.deepEqual(H.data.pic.head, { src: PNG, h: 8, a: 'r' });
  H.sizePic('L');
  assert.equal(H.data.pic.head.h, 20);
  H.sizePic('M');
  assert.equal(H.data.pic.head.h, 14);
  H.removePic();
  assert.equal(H.data.pic.head, null);
  assert.equal(H.undoStack.length, 4);
});

test('Writer.hf: page-number buttons write one {page} line, centre or right', () => {
  const { H } = loadHf();
  H.set({ v: 2, head: [], foot: ['Acme'], al: { foot: ['l'] } });
  H.setNumbers(true, 'right');
  assert.deepEqual(H.data.foot, ['Acme', '{page}']);
  assert.deepEqual(H.data.al.foot, ['l', 'r']);
  H.setNumbers(true, 'center');
  assert.deepEqual(H.data.foot, ['Acme', '{page}']);
  assert.deepEqual(H.data.al.foot, ['l', 'c']);
  H.setNumbers(false, 'center');
  assert.deepEqual(H.data.foot, ['Acme']);
});

/* ---------------------------------------------------------- paste / drop */
function fakeBlock(part) {
  const box = { nodeType: 1, getAttribute: (k) => (k === 'data-part' ? part : null) };
  const text = { nodeType: 1, classList: { contains: (c) => c === 'hf-text' || c === 'hf-slot' }, getAttribute: (k) => (k === 'data-part' ? part : '0') };
  box.closest = (s) => (s === '.hf-box' ? box : null);
  box.querySelector = (s) => (s === '.hf-text' ? text : null);
  text.closest = (s) => (s === '.hf-slot' || s === '.hf-text' ? text : (s === '.hf-box' ? box : (s === '.paper' ? null : null)));
  text.parentElement = box;
  return { box, text };
}

test('paste: a picture pasted into the footer block becomes its one picture (14 mm, centred)', async () => {
  const image = { load: (b, max) => Promise.resolve('data:image/png;base64,P' + max) };
  const { H, W, ctx } = loadHf({ image, editor: { isInEditor: () => false }, history: {}, ui: { showToast() {} } });
  ctx.Blob = Blob; ctx.atob = atob; ctx.Uint8Array = Uint8Array; ctx.Promise = Promise;
  ctx.window.getSelection = () => null;
  vm.runInContext(read('modules/writer-paste.js'), ctx);
  H.set(null);
  H.editing = true;
  const f = fakeBlock('foot');
  const e = { target: f.text, clipboardData: { getData: (t) => (t === 'text/html' ? '<img src="' + PNG + '">' : ''), files: [], items: [] }, preventDefault() { this.p = true; }, stopPropagation() {} };
  W.paste.onHfPaste(e);
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(e.p);
  assert.deepEqual(H.data.pic.foot, { src: 'data:image/png;base64,P600', h: 14, a: 'c' });
  assert.equal(H.data.pic.head, null);
  assert.equal(H.undoStack.length, 1);
});

test('drop: a picture file dropped anywhere on the header block sets its one picture', async () => {
  const image = { load: (f, max) => Promise.resolve('data:image/png;base64,' + f.name.replace(/\W/g, '') + max) };
  const { H, W, ctx } = loadHf({ image, editor: { isInEditor: () => false }, history: {}, ui: { showToast() {} } });
  vm.runInContext(read('modules/writer-imgdrop.js'), ctx);
  H.set({ v: 2, head: ['Acme'], foot: [], pic: { head: { src: JPG, h: 30, a: 'l' } } });
  H.editing = true;
  const f = fakeBlock('head');
  const s = W.imgdrop.slotAt(f.text, 10, 10);
  assert.equal(s.part, 'head');
  assert.equal(s.k, 0);
  assert.equal(s.cell, f.box);
  assert.equal(s.slot, f.text);
  await W.imgdrop.toSlot(s, { name: 'logo.png', type: 'image/png' });
  assert.deepEqual(H.data.pic.head, { src: 'data:image/png;base64,logopng600', h: 30, a: 'l' });   /* replaced: keeps size + alignment */
});

/* ---------------------------------------------------------- DOCX / ODT */
function loadWriter() {
  const ctx = {
    Uint8Array, ArrayBuffer, DataView, TextEncoder, TextDecoder, Blob, Date, Buffer, Math, JSON,
    console: { log() {}, warn() {}, error() {} },
    atob: function (s) { return Buffer.from(s, 'base64').toString('binary'); },
    document: { body: { classList: { contains: function () { return false; } } } },
    addEventListener: function () {}, removeEventListener: function () {},
    DOMParser: function () { this.parseFromString = function () { return { body: { childNodes: [] } }; }; }
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['writer-config.js', 'writer-hfimg.js', 'writer-zip.js', 'writer-docxgen.js', 'writer-odtgen.js', 'writer-export.js'].forEach(function (f) {
    vm.runInContext(read('modules/' + f), ctx, { filename: f });
  });
  const W = ctx.Writer;
  W.hf = { today: () => '18 Nov 2026', data: { v: 2, head: ['Acme Ltd', '12 High Street'], foot: ['{page}'],
    al: { head: ['c', 'c'], foot: ['r'] }, pic: { head: { src: PNG, h: 14, a: 'c' }, foot: null } } };
  return W;
}

test('DOCX header: the picture paragraph comes before the text paragraphs', () => {
  const W = loadWriter();
  const part = W.export.hfPart('head', false);
  const xml = part.xml;
  const pic = xml.indexOf('<w:drawing>'), t1 = xml.indexOf('Acme Ltd'), t2 = xml.indexOf('12 High Street');
  assert.ok(pic > 0 && pic < t1 && t1 < t2, xml);
  assert.ok(/<w:p><w:pPr><w:jc w:val="center"\/><w:spacing w:before="0" w:after="85"[^>]*\/><\/w:pPr><w:r>[^]*?<w:drawing>/.test(xml), xml);
  assert.ok(xml.indexOf('<wp:extent cx="' + 28 * 36000 + '" cy="' + 14 * 36000 + '"/>') !== -1);
  assert.equal(part.media.length, 1);
  assert.equal(part.extraMm, I.extraMm(W.config.marginTopCm * 10, I.blockMm(2, 14)));
  const ft = W.export.hfPart('foot', false).xml;
  assert.ok(/<w:jc w:val="right"\/>.*w:instr="PAGE"/.test(ft) && ft.indexOf('<w:drawing>') === -1);
  /* mail merge: other lines, the open document's alignments and picture */
  const merged = W.export.hfPart('head', false, { head: ['Dear Ann', 'x'], foot: [] }).xml;
  assert.ok(merged.indexOf('<w:drawing>') < merged.indexOf('Dear Ann'));
});

test('ODT header: the picture paragraph comes before the aligned text paragraphs', async () => {
  const W = loadWriter();
  const hf = W.export.odtHf(false);
  assert.equal(hf.foot.pic, null);
  assert.deepEqual(JSON.parse(JSON.stringify(hf.head.lines)), [{ t: 'Acme Ltd', a: 'c' }, { t: '12 High Street', a: 'c' }]);
  const blob = W.export.makeOdtBlob('<p>Body</p>');
  const buf = Buffer.from(await blob.arrayBuffer());
  const st = buf.toString('latin1');
  const head = /<style:header>([\s\S]*?)<\/style:header>/.exec(st)[1];
  assert.ok(/^<text:p text:style-name="Header_cP"><draw:frame[^>]*svg:width="2\.800cm" svg:height="1\.400cm"/.test(head), head);
  assert.ok(head.indexOf('</draw:frame></text:p><text:p text:style-name="Header_c">Acme Ltd</text:p><text:p text:style-name="Header_c">12 High Street</text:p>') !== -1, head);
  assert.ok(/<style:footer><text:p text:style-name="Footer_r"><text:page-number/.test(st));
  assert.ok(/<style:header-footer-properties fo:min-height=/.test(st), 'the header grows from a minimum height');
});

/* ---------------------------------------------------------- wiring */
test('wiring: release DW13c, one block in the DOM code, align tools, no browser dialogs', () => {
  const html = read('writer.html'), live = html.replace(/<!--[\s\S]*?-->/g, '');
  /* (before DW14) assert.ok(live.indexOf('<title>Writer DW13c</title>') !== -1); */
  /* (before DW14a) assert.ok(/<title>Writer DW1(3c|4)<\/title>/.test(live)); */
  /* (before DW15) assert.ok(/<title>Writer DW1(3c|4|4a)<\/title>/.test(live)); */
  /* (before DW16) assert.ok(/<title>Writer DW1(3c|4|4a|5)<\/title>/.test(live)); */
  /* (before DW17) assert.ok(/<title>Writer DW1(3c|4|4a|5|6)<\/title>/.test(live)); */
  /* (before DW18) assert.ok(/<title>Writer DW1(3c|4|4a|5|6|7)<\/title>/.test(live)); */
  /* (before DW19) assert.ok(/<title>Writer DW1(3c|4|4a|5|6|7|8)<\/title>/.test(live)); */
  /* (before DW22) assert.ok(/<title>Writer DW1(3c|4|4a|5|6|7|8|9)<\/title>/.test(live)); */
  /* (before DW23) assert.ok(/<title>Writer DW(1(3c|4|4a|5|6|7|8|9)|22)<\/title>/.test(live)); */
  /* (before DW24) assert.ok(/<title>Writer DW(1(3c|4|4a|5|6|7|8|9)|22|23)<\/title>/.test(live)); */
  /* (before DW25) assert.ok(/<title>Writer DW(1(3c|4|4a|5|6|7|8|9)|22|23|24)<\/title>/.test(live)); */
  assert.ok(/<title>Writer DW(1(3c|4|4a|5|6|7|8|9)|22|23|24|25)<\/title>/.test(live));
  assert.ok(html.indexOf('<!-- (before DW13c) <title>Writer DW13b</title> -->') !== -1);
  /* (before DW14) assert.ok(/release:\s*'DW13c'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW14a) assert.ok(/release:\s*'DW1(3c|4)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW15) assert.ok(/release:\s*'DW1(3c|4|4a)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW16) assert.ok(/release:\s*'DW1(3c|4|4a|5)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW17) assert.ok(/release:\s*'DW1(3c|4|4a|5|6)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW18) assert.ok(/release:\s*'DW1(3c|4|4a|5|6|7)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW19) assert.ok(/release:\s*'DW1(3c|4|4a|5|6|7|8)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW22) assert.ok(/release:\s*'DW1(3c|4|4a|5|6|7|8|9)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW23) assert.ok(/release:\s*'DW(1(3c|4|4a|5|6|7|8|9)|22)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW24) assert.ok(/release:\s*'DW(1(3c|4|4a|5|6|7|8|9)|22|23)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW25) assert.ok(/release:\s*'DW(1(3c|4|4a|5|6|7|8|9)|22|23|24)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW(1(3c|4|4a|5|6|7|8|9)|22|23|24|25)'/.test(read('modules/writer-config.js').replace(/\/\*[\s\S]*?\*\//g, '')));
  ['data-hf-align="l"', 'data-hf-align="c"', 'data-hf-align="r"'].forEach((s) => assert.ok(live.indexOf(s) !== -1, s));
  const hf = read('modules/writer-headerfooter.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(hf.indexOf("'hf-cell") === -1, 'no slot cells');
  assert.ok(/hf-picrow/.test(hf) && /hf-pic-handle/.test(hf));
  assert.ok(/--hf-head-extra-mm/.test(read('ui/page.css')));
  ['modules/writer-headerfooter.js', 'modules/writer-hfimg.js', 'modules/writer-export.js', 'modules/writer-pdfgen.js', 'modules/writer-odtgen.js'].forEach((f) => {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/(^|[^.\w])(alert|confirm|prompt)\s*\(/.test(src), f);   /* Writer.dialog.alert is the in-app dialog */
    assert.ok(!/\bfetch\s*\(/.test(src), f);
  });
});
