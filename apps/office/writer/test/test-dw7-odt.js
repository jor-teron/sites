/* DW7: Writer opens LibreOffice .odt files (modules/writer-odtread.js).
   Builds a small .odt with writer-zip's store pack (and one deflated zip
   for inflate), then asserts the parser output.
   Run: node --test apps/office/writer/test/test-dw7-odt.js
   No DOM, no browser, no network. */
'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const DIR = path.resolve(__dirname, '..');
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG = Buffer.from(PNG_B64, 'base64');

function loadZip() {
  const code = fs.readFileSync(path.join(DIR, 'modules/writer-zip.js'), 'utf8');
  const ctx = {
    window: {},
    Uint8Array,
    ArrayBuffer,
    DataView,
    TextEncoder,
    Blob,
    Date
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.Writer.zip;
}

const Zip = loadZip();
const Odt = require('../modules/writer-odtread.js');

function xmlContent(body, autoStyles) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
    'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ' +
    'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" ' +
    'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" ' +
    'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" ' +
    'xmlns:xlink="http://www.w3.org/1999/xlink" ' +
    'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0">' +
    '<office:automatic-styles>' + (autoStyles || '') + '</office:automatic-styles>' +
    '<office:body><office:text>' + body + '</office:text></office:body>' +
    '</office:document-content>';
}

function stylesXml(extra) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
    'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" ' +
    'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" ' +
    'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0">' +
    '<office:styles>' + (extra || '') + '</office:styles>' +
    '</office:document-styles>';
}

function manifest(entries, encrypted) {
  var files = ['/'].concat(entries);
  var body = files.map(function (p) {
    var typ = p === '/' ? 'application/vnd.oasis.opendocument.text' :
      (p === 'content.xml' ? 'text/xml' : 'application/octet-stream');
    var enc = (encrypted && p === 'content.xml')
      ? '<manifest:encryption-data manifest:checksum-type="SHA1"><manifest:algorithm manifest:algorithm-name="Blowfish CFB"/></manifest:encryption-data>'
      : '';
    return '<manifest:file-entry manifest:full-path="' + p + '" manifest:media-type="' + typ + '">' + enc + '</manifest:file-entry>';
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">' +
    body + '</manifest:manifest>';
}

function enc(s) { return new TextEncoder().encode(s); }

async function packStored(files) {
  const entries = Object.keys(files).map(function (name) {
    var data = files[name];
    if (typeof data === 'string') data = enc(data);
    if (data instanceof Buffer) data = new Uint8Array(data);
    return { name: name, data: data };
  });
  const blob = Zip.build(entries);
  return new Uint8Array(await blob.arrayBuffer());
}

function crc32(bytes) {
  return Zip.crc32(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

function packDeflated(files) {
  /* Minimal zip (method 8) so a real LibreOffice-style .odt can be tested. */
  const parts = [];
  const central = [];
  let offset = 0;
  const names = Object.keys(files);
  names.forEach(function (name) {
    let data = files[name];
    if (typeof data === 'string') data = Buffer.from(data, 'utf8');
    data = Buffer.from(data);
    const stored = name === 'mimetype';
    const comp = stored ? data : zlib.deflateRawSync(data);
    const nameB = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameB.length, 26);
    parts.push(local, nameB, comp);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(stored ? 0 : 8, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameB.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameB);
    offset += 30 + nameB.length + comp.length;
  });
  const cdSize = central.reduce(function (n, b) { return n + b.length; }, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat(parts.concat(central, [end])));
}

const AUTO = '' +
  '<style:style style:name="Tbold" style:family="text">' +
  '<style:text-properties fo:font-weight="bold"/></style:style>' +
  '<style:style style:name="Titalic" style:family="text">' +
  '<style:text-properties fo:font-style="italic"/></style:style>' +
  '<style:style style:name="Tunder" style:family="text">' +
  '<style:text-properties style:text-underline-style="solid"/></style:style>' +
  '<style:style style:name="Tstrike" style:family="text">' +
  '<style:text-properties style:text-line-through-style="solid"/></style:style>' +
  '<text:list-style style:name="Lbullet">' +
  '<text:list-level-style-bullet text:level="1" text:bullet-char="•"/>' +
  '</text:list-style>' +
  '<text:list-style style:name="Lnum">' +
  '<text:list-level-style-number text:level="1" style:num-format="1"/>' +
  '</text:list-style>';

const NAMED = '<style:style style:name="Heading_20_1" style:family="paragraph" style:display-name="Heading 1">' +
  '<style:text-properties fo:font-weight="bold" fo:font-size="18pt"/></style:style>';

function fixtureFiles() {
  const body =
    '<text:h text:outline-level="1">Heading One</text:h>' +
    '<text:p>Hello <text:span text:style-name="Tbold">bold run</text:span> there</text:p>' +
    '<text:list text:style-name="Lbullet">' +
    '<text:list-item><text:p>First item</text:p></text:list-item>' +
    '<text:list-item><text:p>Second item</text:p></text:list-item>' +
    '</text:list>' +
    '<table:table>' +
    '<table:table-row>' +
    '<table:table-cell><text:p>A1</text:p></table:table-cell>' +
    '<table:table-cell><text:p>A2</text:p></table:table-cell>' +
    '</table:table-row>' +
    '<table:table-row>' +
    '<table:table-cell><text:p>B1</text:p></table:table-cell>' +
    '<table:table-cell><text:p>B2</text:p></table:table-cell>' +
    '</table:table-row>' +
    '</table:table>' +
    '<text:p><draw:frame svg:width="1cm"><draw:image xlink:href="Pictures/dot.png"/></draw:frame></text:p>';
  const content = xmlContent(body, AUTO);
  const styles = stylesXml(NAMED);
  const files = {
    'mimetype': 'application/vnd.oasis.opendocument.text',
    'content.xml': content,
    'styles.xml': styles,
    'META-INF/manifest.xml': manifest(['content.xml', 'styles.xml', 'Pictures/dot.png']),
    'Pictures/dot.png': PNG
  };
  return files;
}

function assertFixture(html) {
  assert.ok(html.indexOf('<h1>') !== -1 && html.indexOf('Heading One') !== -1, 'heading comes across');
  assert.ok(/<b>bold run<\/b>/.test(html), 'bold run comes across, got: ' + html);
  assert.ok(/<ul>/.test(html) && html.indexOf('First item') !== -1 && html.indexOf('Second item') !== -1, 'bullet list comes across');
  assert.ok(/<table/.test(html) && html.indexOf('A1') !== -1 && html.indexOf('A2') !== -1 && html.indexOf('B1') !== -1 && html.indexOf('B2') !== -1, '2x2 table comes across');
  assert.ok(html.indexOf('data:image/png;base64,' + PNG_B64) !== -1, 'picture is a data URL');
  assert.ok(html.indexOf('dl-img-block') !== -1, 'picture uses the writer image block');
}

test('stored .odt: heading, bold, list, 2x2 table, png', async function () {
  const buf = await packStored(fixtureFiles());
  const res = await Odt.read(buf);
  assert.ok(res && typeof res.html === 'string');
  assertFixture(res.html);
  assert.ok(res.hf && Array.isArray(res.hf.head) && res.hf.head.length === 3);
});

test('deflated .odt inflates and parses the same fixture', async function () {
  const buf = packDeflated(fixtureFiles());
  const res = await Odt.read(buf);
  assertFixture(res.html);
});

test('italic, underline, strike, numbered list, named heading style', async function () {
  const body =
    '<text:h text:style-name="Heading_20_1">Named Head</text:h>' +
    '<text:p>' +
    '<text:span text:style-name="Titalic">ital</text:span> ' +
    '<text:span text:style-name="Tunder">under</text:span> ' +
    '<text:span text:style-name="Tstrike">strike</text:span>' +
    '</text:p>' +
    '<text:list text:style-name="Lnum">' +
    '<text:list-item><text:p>One</text:p></text:list-item>' +
    '<text:list-item><text:p>Two</text:p></text:list-item>' +
    '</text:list>';
  const files = {
    'mimetype': 'application/vnd.oasis.opendocument.text',
    'content.xml': xmlContent(body, AUTO),
    'styles.xml': stylesXml(NAMED),
    'META-INF/manifest.xml': manifest(['content.xml', 'styles.xml'])
  };
  const res = await Odt.read(await packStored(files));
  assert.ok(res.html.indexOf('<h1>') !== -1 && res.html.indexOf('Named Head') !== -1, 'named Heading 1 style');
  assert.ok(/<i>ital<\/i>/.test(res.html), 'italic');
  assert.ok(/<u>under<\/u>/.test(res.html), 'underline');
  assert.ok(/<s>strike<\/s>/.test(res.html), 'strike');
  assert.ok(/<ol>/.test(res.html) && res.html.indexOf('One') !== -1 && res.html.indexOf('Two') !== -1, 'numbered list');
});

async function rejects(buf, snippet, label) {
  await assert.rejects(function () { return Odt.read(buf); }, function (e) {
    assert.ok(e && e.userMessage, label + ' has userMessage');
    assert.ok(String(e.userMessage).toLowerCase().indexOf(snippet) !== -1,
      label + ' message "' + (e && e.userMessage) + '" should mention ' + snippet);
    return true;
  }, label);
}

test('errors: not a zip, missing content.xml, encrypted manifest, encrypted zip flag', async function () {
  await rejects(new Uint8Array([0, 1, 2, 3, 4]), 'not a valid .odt', 'not a zip');
  await rejects(Buffer.from('hello'), 'not a valid .odt', 'plain text');

  const missing = await packStored({
    'mimetype': 'application/vnd.oasis.opendocument.text',
    'META-INF/manifest.xml': manifest([])
  });
  await rejects(missing, 'no readable document text', 'missing content.xml');

  const encFiles = fixtureFiles();
  encFiles['META-INF/manifest.xml'] = manifest(['content.xml', 'styles.xml', 'Pictures/dot.png'], true);
  encFiles['content.xml'] = 'not-xml-this-is-ciphertext';
  await rejects(await packStored(encFiles), 'password protected', 'encrypted manifest');

  const flagged = Uint8Array.from(await packStored(fixtureFiles()));
  /* Set the encrypt bit (bit 0) on every local and central header. */
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  var i = flagged.length - 22, min = Math.max(0, i - 65535);
  for (; i >= min; i--) if (u32(flagged, i) === 0x06054b50) break;
  var n = u16(flagged, i + 10), p = u32(flagged, i + 16), k;
  for (k = 0; k < n; k++) {
    flagged[p + 8] = flagged[p + 8] | 1;
    var off = u32(flagged, p + 42);
    flagged[off + 6] = flagged[off + 6] | 1;
    p += 46 + u16(flagged, p + 28) + u16(flagged, p + 30) + u16(flagged, p + 32);
  }
  await rejects(flagged, 'password protected', 'encrypted zip flag');
});

test('writer.html wires the odt reader and the combined Open menu', function () {
  const html = fs.readFileSync(path.join(DIR, 'writer.html'), 'utf8');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  /* (before DW8) assert.ok(live.indexOf('<title>Writer DW7</title>') !== -1); */
  /* (before DW9) assert.ok(live.indexOf('<title>Writer DW8</title>') !== -1); */
  /* (before DW11) assert.ok(live.indexOf('<title>Writer DW9</title>') !== -1); */
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
  assert.ok(/<title>Writer DW1(1a|2|3|3b|3c|4|4a|5|6|7|8|9)<\/title>/.test(live));
  assert.ok(html.indexOf('<!-- (before DW7) <title>Writer DF25</title> -->') !== -1);
  assert.ok(html.indexOf('<!-- (before DW8) <title>Writer DW7</title> -->') !== -1);
  assert.ok(html.indexOf('<!-- (before DW9) <title>Writer DW8</title> -->') !== -1);
  /* (before DW14) assert.ok(live.indexOf('Open .docx / .odt') !== -1); */
  /* (before DW14) assert.ok(live.indexOf('accept=".docx,.odt,') !== -1); */
  assert.ok(live.indexOf('Open...') !== -1);
  assert.ok(live.indexOf('accept=".how,.docx,.odt,') !== -1);
  assert.ok(live.indexOf('src="modules/writer-odtread.js"') !== -1);
  assert.ok(live.indexOf('src="modules/writer-odtread.js"') < live.indexOf('src="modules/writer-docxopen.js"'));
  assert.ok(!/\?v=/.test(html), 'no cache-bust query');
  const open = fs.readFileSync(path.join(DIR, 'modules/writer-docxopen.js'), 'utf8');
  assert.ok(open.indexOf('isOdt') !== -1);
  assert.ok(open.indexOf('Writer.odtread.read') !== -1);
  assert.ok(open.indexOf('Writer.dialog.alert') !== -1);
  assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(open.replace(/Writer\.dialog\.\w+|OfficeDialog\.\w+/g, '')), 'no browser dialogs');
});
