/* DW11a: header / footer pictures in the .docx and .odt exports.
   Loads writer-config / hfimg / zip / docxgen / odtgen / export in a vm
   with a tiny DOM stub (no browser), exports a document whose header
   and footer have text and pictures, unpacks the store-only zip and
   checks the parts. If soffice is on the machine, also converts both
   files to PDF and checks with pdfimages that the pictures are drawn.
   Run: node --test apps/office/writer/test/test-dw11a-hfimg-export.cjs */
'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawnSync, execFileSync } = require('child_process');

const DIR = path.resolve(__dirname, '..');
/* 40 x 20 px red PNG (aspect 2:1) */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAIAAABwJOjsAAAAJElEQVR42mM4ISc3IIhh1OJRi0ctHrV41OJRi0ctHrV45FgMAFLhLK5O4QWwAAAAAElFTkSuQmCC';
const WEBP = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
const TODAY = '18/11/2026';
/* main just before DW11a: the 'before' export code for the no-picture checks */
const BEFORE = '332e79a4';
function beforeSrc(file) {
  try { return execFileSync('git', ['show', BEFORE + ':apps/office/writer/modules/' + file], { cwd: DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
  catch (e) { return null; }
}

function loadWriter(src) {
  const ctx = {
    Uint8Array, ArrayBuffer, DataView, TextEncoder, TextDecoder, Blob, Date, Buffer, Math, JSON,
    console: { log() {}, warn() {}, error() {} },
    atob: function (s) { return Buffer.from(s, 'base64').toString('binary'); },
    document: { body: { classList: { contains: function () { return false; } } } },
    addEventListener: function () {}, removeEventListener: function () {},
    DOMParser: function () { this.parseFromString = function () { return { body: { childNodes: [] } }; }; }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['writer-config.js', 'writer-hfimg.js', 'writer-zip.js', 'writer-docxgen.js', 'writer-odtgen.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(DIR, 'modules', f), 'utf8'), ctx, { filename: f });
  });
  vm.runInContext(src || fs.readFileSync(path.join(DIR, 'modules/writer-export.js'), 'utf8'), ctx, { filename: 'writer-export.js' });
  const W = ctx.Writer;
  W.config.marginTopCm = 2.5;     /* room for an M picture (14 mm) */
  W.config.marginBottomCm = 0.6;  /* footer picture gets cut to fit */
  W.hf = { data: blankHf(), today: function () { return TODAY; } };
  return W;
}
function blankHf() { return { head: ['', '', ''], foot: ['', '', ''], img: { head: [null, null, null], foot: [null, null, null] } }; }

function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
function u16(b, o) { return b[o] | (b[o + 1] << 8); }
/* Store-only zip (writer-zip.js) -> { name: Uint8Array } */
function unzip(buf) {
  const b = new Uint8Array(buf);
  let i = b.length - 22;
  for (; i >= 0; i--) if (u32(b, i) === 0x06054b50) break;
  const n = u16(b, i + 10), out = {};
  let p = u32(b, i + 16);
  for (let k = 0; k < n; k++) {
    const nameLen = u16(b, p + 28), extra = u16(b, p + 30), comment = u16(b, p + 32);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    const off = u32(b, p + 42), size = u32(b, p + 24);
    const start = off + 30 + u16(b, off + 26) + u16(b, off + 28);
    out[name] = b.subarray(start, start + size);
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
const txt = function (u) { return new TextDecoder().decode(u); };

function withPictures(W) {
  W.hf.data = blankHf();
  W.hf.data.head = ['Hub Office', '', 'Page {page} of {pages}'];
  W.hf.data.foot = ['', '{date}', ''];
  W.hf.data.img.head[0] = { src: PNG, size: 'M' };
  W.hf.data.img.foot[2] = { src: PNG, size: 'S' };
}

async function docx(W, hfData) { return unzip(await W.export.makeDocxBlob('', hfData).arrayBuffer()); }
async function odt(W, hfData) { return unzip(await W.export.makeOdtBlob('<p>Body text</p>', hfData).arrayBuffer()); }

test('size math: M in a 2.5 cm margin is 14 mm high, S in a 0.6 cm margin is cut to 4 mm', () => {
  const W = loadWriter();
  withPictures(W);
  const head = W.export.hfPics('head', false), foot = W.export.hfPics('foot', false);
  assert.strictEqual(head[0].h, W.hfimg.heightMm('M', 25));
  assert.strictEqual(head[0].h, 14);
  assert.strictEqual(head[0].w, 28);           /* 2:1 picture */
  assert.strictEqual(head[1], null);
  assert.strictEqual(foot[2].h, 4);
  assert.strictEqual(foot[2].w, 8);
  assert.strictEqual(head[0].ext, 'png');
});

test('DOCX: header / footer carry an inline drawing with its own rels, media and content type', async () => {
  const W = loadWriter();
  withPictures(W);
  const z = await docx(W);
  const hdr = txt(z['word/header1.xml']), ftr = txt(z['word/footer1.xml']);
  /* drawing before the left slot's text, right r:embed id */
  assert.ok(/<wp:inline[^>]*>[\s\S]*<a:blip r:embed="rId1"\/>[\s\S]*<\/wp:inline><\/w:drawing><\/w:r><w:r>.*Hub Office/.test(hdr), hdr);
  assert.ok(hdr.indexOf('xmlns:wp=') !== -1 && hdr.indexOf('xmlns:pic=') !== -1 && hdr.indexOf('xmlns:a=') !== -1);
  assert.ok(hdr.indexOf('w:instr="PAGE"') !== -1 && hdr.indexOf('w:instr="NUMPAGES"') !== -1);
  /* EMU = mm * 36000 */
  assert.ok(hdr.indexOf('<wp:extent cx="' + 28 * 36000 + '" cy="' + 14 * 36000 + '"/>') !== -1, hdr);
  assert.ok(ftr.indexOf('<wp:extent cx="' + 8 * 36000 + '" cy="' + 4 * 36000 + '"/>') !== -1, ftr);
  assert.ok(ftr.indexOf(TODAY) !== -1);
  /* footer picture is in the right slot: after two tabs */
  assert.ok(/<w:tab\/><\/w:r>.*<w:tab\/><\/w:r><w:r>.*<w:drawing>/.test(ftr), ftr);
  const hr = txt(z['word/_rels/header1.xml.rels']), fr = txt(z['word/_rels/footer1.xml.rels']);
  assert.ok(/Id="rId1"[^>]*relationships\/image" Target="media\/header1_image1\.png"/.test(hr), hr);
  assert.ok(/Id="rId1"[^>]*Target="media\/footer1_image1\.png"/.test(fr), fr);
  assert.ok(z['word/media/header1_image1.png'] && z['word/media/header1_image1.png'][1] === 0x50);
  assert.ok(z['word/media/footer1_image1.png']);
  const ct = txt(z['[Content_Types].xml']);
  assert.ok(ct.indexOf('<Default Extension="png" ContentType="image/png"/>') !== -1, ct);
  assert.strictEqual(ct.split('Extension="png"').length, 2, 'one png default');
  assert.ok(ct.indexOf('/word/header1.xml') !== -1 && ct.indexOf('/word/footer1.xml') !== -1);
  /* header distance = DW11 boxTop (print / PDF place) */
  const doc = txt(z['word/document.xml']);
  const edge = W.hfimg.boxTop(25, 14);
  assert.ok(doc.indexOf('w:header="' + Math.round(edge * 56.7) + '"') !== -1, doc);
});

test('DOCX: a picture with no text still makes a header; webp is left out', async () => {
  const W = loadWriter();
  W.hf.data.img.head[1] = { src: PNG, size: 'L' };
  W.hf.data.img.foot[0] = { src: WEBP, size: 'L' };
  const z = await docx(W);
  const hdr = txt(z['word/header1.xml']);
  assert.ok(/<w:tab\/><\/w:r><w:r>.*<w:drawing>/.test(hdr), 'centre slot');
  assert.ok(hdr.indexOf('distR="0"') !== -1, 'no gap without text');
  assert.ok(!z['word/footer1.xml'], 'webp only: no footer');
  assert.ok(!z['word/_rels/footer1.xml.rels']);
});

test('DOCX: without pictures the header is exactly as before DW11a and there are no empty rels', async (t) => {
  const old = beforeSrc('writer-export.js');
  if (!old) { t.skip('git history not available'); return; }
  const before = loadWriter(old), W = loadWriter();
  [before, W].forEach(function (X) {
    X.hf.data.head = ['Left', 'Mid {date}', 'Page {page} / {pages}'];
    X.hf.data.foot = ['a & b', '', ''];
  });
  const want = before.export.hfXml('head', false);
  const z = await docx(W);
  assert.strictEqual(txt(z['word/header1.xml']), want);
  assert.strictEqual(txt(z['word/footer1.xml']), before.export.hfXml('foot', false));
  assert.ok(!Object.keys(z).some(function (n) { return /_rels\/(header|footer)1\.xml\.rels$/.test(n) || /^word\/media\//.test(n); }), Object.keys(z).join());
  assert.ok(txt(z['[Content_Types].xml']).indexOf('image/png') === -1);
  const doc = txt(z['word/document.xml']);
  assert.ok(doc.indexOf('w:header="' + Math.round(2.5 * 0.4 * 567) + '"') !== -1, 'header distance unchanged');
});

test('ODT: styles.xml master page has header / footer with tab slots, fields and draw:image', async () => {
  const W = loadWriter();
  withPictures(W);
  const z = await odt(W);
  const st = txt(z['styles.xml']);
  const head = /<style:header>([\s\S]*?)<\/style:header>/.exec(st), foot = /<style:footer>([\s\S]*?)<\/style:footer>/.exec(st);
  assert.ok(head && foot, st);
  assert.ok(/^<text:p text:style-name="Header"><draw:frame [^>]*text:anchor-type="as-char"[^>]*svg:width="2\.800cm" svg:height="1\.400cm"[^>]*><draw:image xlink:href="Pictures\/image1\.png"/.test(head[1]), head[1]);
  assert.ok(head[1].indexOf('Hub Office<text:tab/><text:tab/>Page <text:page-number text:select-page="current">1</text:page-number> of <text:page-count>1</text:page-count>') !== -1, head[1]);
  assert.ok(foot[1].indexOf('<text:tab/>' + TODAY + '<text:tab/><draw:frame') !== -1, foot[1]);
  assert.ok(/svg:width="0\.800cm" svg:height="0\.400cm"/.test(foot[1]), foot[1]);
  assert.ok(/<style:style style:name="Header"[\s\S]*?<style:tab-stop style:position="8\.500cm" style:type="center"\/><style:tab-stop style:position="17cm" style:type="right"\/>/.test(st));
  assert.ok(st.indexOf('<style:header-style>') !== -1 && st.indexOf('<style:footer-style>') !== -1);
  assert.ok(/style:name="MFr1" style:family="graphic"/.test(st) && /style:name="MFr2" style:family="graphic"/.test(st));
  const man = txt(z['META-INF/manifest.xml']);
  assert.ok(man.indexOf('manifest:full-path="Pictures/image1.png" manifest:media-type="image/png"') !== -1, man);
  assert.ok(man.indexOf('Pictures/image2.png') !== -1);
  assert.ok(z['Pictures/image1.png'] && z['Pictures/image2.png']);
  assert.ok(txt(z['content.xml']).indexOf('Body text') !== -1);
});

test('ODT: no header / footer gives the same styles.xml as before DW11a', async (t) => {
  const oldGen = beforeSrc('writer-odtgen.js');
  if (!oldGen) { t.skip('git history not available'); return; }
  const W = loadWriter();
  const st = txt((await odt(W))['styles.xml']);
  /* the DW8 odtgen (before DW11a) with the same options */
  const ctx = { Uint8Array, TextEncoder, TextDecoder, Blob, Buffer, console, atob: W.export && function (s) { return Buffer.from(s, 'base64').toString('binary'); } };
  ctx.window = ctx; ctx.globalThis = ctx; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'modules/writer-zip.js'), 'utf8'), ctx);
  vm.runInContext(oldGen, ctx);
  const cfg = W.config;
  const oldBlob = ctx.Writer.odtgen.build('<p>Body text</p>', {
    landscape: false, pageWidthCm: 21, pageHeightCm: 29.7,
    margins: { top: cfg.marginTopCm, right: cfg.marginRightCm, bottom: cfg.marginBottomCm, left: cfg.marginLeftCm },
    defaults: { font: cfg.fontCommandName, sizePt: cfg.fontSizePt, lineHeight: cfg.lineHeight, paraAfterPt: cfg.paragraphSpacingPt }
  });
  assert.strictEqual(st, txt(unzip(await oldBlob.arrayBuffer())['styles.xml']));
  assert.ok(st.indexOf('style:header') === -1 && st.indexOf('MFr1') === -1);
});

test('DW11 export warning is gone; release is DW11a', () => {
  const hf = fs.readFileSync(path.join(DIR, 'modules/writer-headerfooter.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const ex = fs.readFileSync(path.join(DIR, 'modules/writer-export.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(hf.indexOf('not exported') === -1 && ex.indexOf('warnExport') === -1);
  const html = fs.readFileSync(path.join(DIR, 'writer.html'), 'utf8');
  assert.ok(html.replace(/<!--[\s\S]*?-->/g, '').indexOf('<title>Writer DW11a</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before DW11a) <title>Writer DW11</title> -->') !== -1);
  const cfg = fs.readFileSync(path.join(DIR, 'modules/writer-config.js'), 'utf8');
  assert.ok(/release:\s*'DW11a'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
});

const SOFFICE = fs.existsSync('/usr/bin/soffice') ? 'soffice' : (fs.existsSync('/usr/bin/libreoffice') ? 'libreoffice' : null);
const PDFIMAGES = fs.existsSync('/usr/bin/pdfimages');
if (SOFFICE && PDFIMAGES) {
  test('LibreOffice draws the header / footer pictures from .docx and .odt (PDF smoke check)', async function (t) {
    const W = loadWriter();
    withPictures(W);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw11a-'));
    fs.writeFileSync(path.join(dir, 'hf.docx'), Buffer.from(await W.export.makeDocxBlob('', null).arrayBuffer()));
    fs.writeFileSync(path.join(dir, 'hf.odt'), Buffer.from(await W.export.makeOdtBlob('<p>Body text</p>', null).arrayBuffer()));
    for (const ext of ['docx', 'odt']) {
      const out = path.join(dir, ext);
      fs.mkdirSync(out);
      spawnSync(SOFFICE, ['-env:UserInstallation=file://' + path.join(dir, 'profile'), '--headless', '--convert-to', 'pdf', '--outdir', out, path.join(dir, 'hf.' + ext)], { encoding: 'utf8', timeout: 120000 });
      const pdf = path.join(out, 'hf.pdf');
      if (!fs.existsSync(pdf)) { t.skip('soffice wrote no PDF for .' + ext); return; }
      const list = spawnSync('pdfimages', ['-list', pdf], { encoding: 'utf8' }).stdout;
      const rows = list.split('\n').filter(function (l) { return /^\s*\d+\s+\d+\s+image/.test(l); });
      assert.ok(rows.length >= 2, '.' + ext + ': header + footer pictures in the PDF\n' + list);
    }
  });
}
