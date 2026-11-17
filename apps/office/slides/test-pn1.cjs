#!/usr/bin/env node
/* PN1: Presentation opens LibreOffice .odp files (slides_odp.js).
   Builds a small .odp with SLZip store pack, then asserts the parsed deck.
   Run: node --test apps/office/slides/test-pn1.cjs
   No DOM, no browser, no network. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG = Buffer.from(PNG_B64, 'base64');

function load() {
  const ctx = {
    window: {},
    console: console,
    Uint8Array: Uint8Array,
    ArrayBuffer: ArrayBuffer,
    DataView: DataView,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    Buffer: Buffer
  };
  ctx.global = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'slides_zip.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'slides_odp.js'), 'utf8'), ctx);
  return { Zip: ctx.SLZip, Odp: ctx.SLOdp, ctx: ctx };
}

/* objects made in a vm sandbox need a clone before deepStrictEqual */
function plain(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

function contentXml(pages, autoStyles) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
    'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" ' +
    'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" ' +
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
    'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ' +
    'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ' +
    'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" ' +
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
    'xmlns:xlink="http://www.w3.org/1999/xlink">' +
    '<office:automatic-styles>' + (autoStyles || '') + '</office:automatic-styles>' +
    '<office:body><office:presentation>' + pages + '</office:presentation></office:body>' +
    '</office:document-content>';
}

function stylesXml() {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
    'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ' +
    'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ' +
    'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" ' +
    'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0" ' +
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">' +
    '<office:automatic-styles>' +
    '<style:page-layout style:name="PM1">' +
    '<style:page-layout-properties fo:page-width="28cm" fo:page-height="15.75cm"/>' +
    '</style:page-layout>' +
    '</office:automatic-styles>' +
    '<office:master-styles>' +
    '<style:master-page style:name="Default" style:page-layout-name="PM1"/>' +
    '</office:master-styles>' +
    '</office:document-styles>';
}

function metaXml(title) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<office:document-meta xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    '<office:meta><dc:title>' + title + '</dc:title></office:meta></office:document-meta>';
}

function manifest(entries, encrypted) {
  var files = ['/'].concat(entries);
  var body = files.map(function (p) {
    var typ = p === '/' ? 'application/vnd.oasis.opendocument.presentation' :
      (p === 'content.xml' || p.slice(-4) === '.xml' ? 'text/xml' : 'application/octet-stream');
    var enc = (encrypted && p === 'content.xml')
      ? '<manifest:encryption-data manifest:checksum-type="SHA1"><manifest:algorithm manifest:algorithm-name="Blowfish CFB"/></manifest:encryption-data>'
      : '';
    return '<manifest:file-entry manifest:full-path="' + p + '" manifest:media-type="' + typ + '">' + enc + '</manifest:file-entry>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">' +
    body + '</manifest:manifest>';
}

const AUTO = '' +
  '<style:style style:name="dp1" style:family="drawing-page">' +
  '<style:drawing-page-properties draw:fill="solid" draw:fill-color="#1a365d"/>' +
  '</style:style>' +
  '<style:style style:name="Tbold" style:family="text">' +
  '<style:text-properties fo:font-weight="bold" fo:color="#f6e05e"/>' +
  '</style:style>' +
  '<style:style style:name="Pcenter" style:family="paragraph">' +
  '<style:paragraph-properties fo:text-align="center"/>' +
  '</style:style>' +
  '<style:style style:name="grRect" style:family="graphic">' +
  '<style:graphic-properties draw:fill="solid" draw:fill-color="#f97316" draw:stroke="solid" svg:stroke-color="#7c2d12"/>' +
  '</style:style>' +
  '<text:list-style style:name="L1">' +
  '<text:list-level-style-bullet text:level="1" text:bullet-char="•"/>' +
  '<text:list-level-style-bullet text:level="2" text:bullet-char="–"/>' +
  '</text:list-style>';

const SLIDE1 = '' +
  '<draw:page draw:name="page1" draw:style-name="dp1" draw:master-page-name="Default">' +
  '<draw:frame presentation:class="title" svg:x="2cm" svg:y="1cm" svg:width="24cm" svg:height="3cm">' +
  '<draw:text-box>' +
  '<text:p text:style-name="Pcenter">Hello <text:span text:style-name="Tbold">World</text:span></text:p>' +
  '</draw:text-box></draw:frame>' +
  '<draw:frame presentation:class="outline" svg:x="2cm" svg:y="4.5cm" svg:width="24cm" svg:height="5cm">' +
  '<draw:text-box>' +
  '<text:list text:style-name="L1">' +
  '<text:list-item><text:p>First point</text:p></text:list-item>' +
  '<text:list-item><text:p>Second point</text:p>' +
  '<text:list><text:list-item><text:p>Nested</text:p></text:list-item></text:list>' +
  '</text:list-item>' +
  '</text:list>' +
  '</draw:text-box></draw:frame>' +
  '<draw:rect draw:style-name="grRect" svg:x="2cm" svg:y="10cm" svg:width="4cm" svg:height="2cm"/>' +
  '<draw:frame svg:x="20cm" svg:y="10cm" svg:width="3cm" svg:height="3cm">' +
  '<draw:image xlink:href="Pictures/dot.png"/>' +
  '</draw:frame>' +
  '</draw:page>';

const SLIDE2 = '' +
  '<draw:page draw:name="page2" draw:master-page-name="Default">' +
  '<draw:frame presentation:class="title" svg:x="2cm" svg:y="1cm" svg:width="24cm" svg:height="2.5cm">' +
  '<draw:text-box><text:p>Second slide</text:p></draw:text-box></draw:frame>' +
  '<draw:custom-shape svg:x="2cm" svg:y="5cm" svg:width="5cm" svg:height="3cm" draw:style-name="grRect">' +
  '<draw:enhanced-geometry draw:type="rectangle"/>' +
  '</draw:custom-shape>' +
  '<draw:frame svg:x="10cm" svg:y="5cm" svg:width="12cm" svg:height="4cm">' +
  '<table:table>' +
  '<table:table-row>' +
  '<table:table-cell><text:p>A1</text:p></table:table-cell>' +
  '<table:table-cell><text:p>B1</text:p></table:table-cell>' +
  '</table:table-row>' +
  '<table:table-row>' +
  '<table:table-cell><text:p>A2</text:p></table:table-cell>' +
  '<table:table-cell><text:p>B2</text:p></table:table-cell>' +
  '</table:table-row>' +
  '</table:table></draw:frame>' +
  '<presentation:notes>' +
  '<draw:page draw:name="notes2">' +
  '<draw:frame presentation:class="notes" svg:x="1cm" svg:y="1cm" svg:width="10cm" svg:height="5cm">' +
  '<draw:text-box><text:p>Say this out loud</text:p></draw:text-box>' +
  '</draw:frame></draw:page>' +
  '</presentation:notes>' +
  '</draw:page>';

function sampleFiles() {
  return {
    'mimetype': 'application/vnd.oasis.opendocument.presentation',
    'content.xml': contentXml(SLIDE1 + SLIDE2, AUTO),
    'styles.xml': stylesXml(),
    'meta.xml': metaXml('Demo talk'),
    'META-INF/manifest.xml': manifest(['content.xml', 'styles.xml', 'meta.xml', 'Pictures/dot.png']),
    'Pictures/dot.png': new Uint8Array(PNG)
  };
}

test('parse reads two slides, text, bullets, a rect, a picture and a background', () => {
  const { Zip, Odp } = load();
  const packed = Zip.pack(sampleFiles());
  const un = Zip.unpack(packed);
  assert.ok(un.files, un.error);
  const parsed = Odp.parse(un.files);
  const r = plain(parsed);
  assert.ok(!r.error, r.error);
  assert.equal(r.deck.name, 'Demo talk');
  assert.equal(r.deck.slides.length, 2);

  const s1 = r.deck.slides[0];
  assert.equal(s1.bg, '#1a365d');
  assert.equal(s1.layout, 'tc');
  const titleText = s1.title.paragraphs.map(p => p.runs.map(x => x.text).join('')).join('\n');
  assert.equal(titleText, 'Hello World');
  assert.equal(s1.title.paragraphs[0].align, 'center');
  const bold = s1.title.paragraphs[0].runs.find(x => x.text === 'World');
  assert.ok(bold && bold.b === true, 'World run is bold');
  assert.equal(bold.color, '#f6e05e');

  const bullets = s1.body.paragraphs;
  assert.ok(bullets.length >= 3, 'expected 3 body paras, got ' + bullets.length);
  assert.equal(bullets[0].runs.map(x => x.text).join(''), 'First point');
  assert.equal(bullets[0].list, 'bullet');
  assert.equal(bullets[0].level, 0);
  assert.equal(bullets[1].runs.map(x => x.text).join(''), 'Second point');
  assert.equal(bullets[2].runs.map(x => x.text).join(''), 'Nested');
  assert.equal(bullets[2].level, 1);
  assert.equal(bullets[2].list, 'bullet');

  assert.ok(s1.shapes.length >= 1, 'rect shape missing');
  const rect = s1.shapes[0];
  assert.equal(rect.kind, 'rect');
  assert.equal(rect.fill, '#f97316');
  assert.equal(rect.stroke, '#7c2d12');
  /* 2cm / 28cm × 960, 10cm / 15.75cm × 540, 4cm / 28cm × 960, 2cm / 15.75cm × 540 */
  assert.equal(rect.x, Odp.scale('2cm', 28, 960));
  assert.equal(rect.y, Odp.scale('10cm', 15.75, 540));
  assert.equal(rect.w, Odp.scale('4cm', 28, 960));
  assert.equal(rect.h, Odp.scale('2cm', 15.75, 540));

  assert.equal(s1.pics.length, 1);
  assert.ok(s1.pics[0].src.indexOf('data:image/png;base64,') === 0);
  assert.ok(s1.pics[0].src.indexOf(PNG_B64) >= 0);
  assert.equal(s1.pics[0].x, Odp.scale('20cm', 28, 960));
  assert.equal(s1.pics[0].y, Odp.scale('10cm', 15.75, 540));

  const s2 = r.deck.slides[1];
  const t2 = s2.title.paragraphs.map(p => p.runs.map(x => x.text).join('')).join('\n');
  assert.equal(t2, 'Second slide');
  assert.equal(s2.notes, 'Say this out loud');
  assert.ok(s2.shapes.some(sh => sh.kind === 'rect'), 'custom-shape rectangle comes in as a rect');
  assert.equal(s2.tables.length, 1);
  assert.equal(s2.tables[0].rows, 2);
  assert.equal(s2.tables[0].cols, 2);
  const a1 = s2.tables[0].cells[0][0].doc.paragraphs[0].runs.map(x => x.text).join('');
  assert.equal(a1, 'A1');
  const b2 = s2.tables[0].cells[1][1].doc.paragraphs[0].runs.map(x => x.text).join('');
  assert.equal(b2, 'B2');
  /* nested notes draw:page must not become a third slide */
  assert.equal(r.deck.slides.length, 2);
});

test('parse refuses a missing content.xml, a password, and a non-presentation', () => {
  const { Zip, Odp } = load();
  const empty = Odp.parse({ 'mimetype': 'application/vnd.oasis.opendocument.presentation' });
  assert.ok(empty.error);
  assert.match(empty.error, /content\.xml/i);

  const none = Odp.parse({
    'mimetype': 'application/vnd.oasis.opendocument.presentation',
    'content.xml': contentXml('', ''),
    'styles.xml': stylesXml()
  });
  assert.ok(none.error);
  assert.match(none.error, /no slides/i);

  const locked = Odp.parse({
    'mimetype': 'application/vnd.oasis.opendocument.presentation',
    'content.xml': contentXml(SLIDE1, AUTO),
    'META-INF/manifest.xml': manifest(['content.xml'], true)
  });
  assert.ok(locked.error);
  assert.match(locked.error, /password/i);

  const odt = Odp.parse({
    'mimetype': 'application/vnd.oasis.opendocument.text',
    'content.xml': '<office:document-content/>'
  });
  assert.ok(odt.error);
  assert.match(odt.error, /not a LibreOffice presentation/i);

  /* packed zip without content.xml */
  const packed = Zip.pack({ 'mimetype': 'application/vnd.oasis.opendocument.presentation', 'hello.txt': 'nope' });
  const un = Zip.unpack(packed);
  const bad = Odp.parse(un.files);
  assert.ok(bad.error);
});

test('positions in inches scale from the page size onto the 16:9 canvas', () => {
  const { Odp } = load();
  /* 10 in × 5.625 in is exactly 16:9; 1 in from the left → 96 px on a 960-wide canvas */
  const files = {
    'mimetype': 'application/vnd.oasis.opendocument.presentation',
    'styles.xml': '<?xml version="1.0"?><office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"><office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="10in" fo:page-height="5.625in"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="PM1"/></office:master-styles></office:document-styles>',
    'content.xml': contentXml(
      '<draw:page draw:master-page-name="Default">' +
      '<draw:rect svg:x="1in" svg:y="0.5in" svg:width="2in" svg:height="1in"/>' +
      '</draw:page>',
      ''
    )
  };
  const r = plain(Odp.parse(files));
  assert.ok(!r.error, r.error);
  const sh = r.deck.slides[0].shapes[0];
  assert.equal(sh.x, 96);
  assert.equal(sh.y, 48);
  assert.equal(sh.w, 192);
  assert.equal(sh.h, 96);
});
