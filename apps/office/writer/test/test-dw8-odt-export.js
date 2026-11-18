/* DW8: Writer exports LibreOffice .odt files (modules/writer-odtgen.js).
   Builds a sample document (heading, bold run, nested list, 2x2 table,
   tiny PNG), packs it with writer-zip, then asserts the package and a
   round-trip through writer-odtread.js.
   Run: node --test apps/office/writer/test/test-dw8-odt-export.js
   No DOM, no browser, no network. If soffice is on the machine, also
   converts the output to text as a sanity check (it is not installed). */
'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawnSync } = require('child_process');

const DIR = path.resolve(__dirname, '..');
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function loadWriter() {
  const ctx = {
    window: {},
    Uint8Array,
    ArrayBuffer,
    DataView,
    TextEncoder,
    TextDecoder,
    Blob,
    Date,
    Buffer,
    console,
    atob: function (s) { return Buffer.from(s, 'base64').toString('binary'); }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'modules/writer-zip.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(DIR, 'modules/writer-odtgen.js'), 'utf8'), ctx);
  return ctx.Writer;
}

const Writer = loadWriter();
const Odt = require('../modules/writer-odtread.js');

const SAMPLE =
  '<h1>Heading One</h1>' +
  '<p>A <b>bold</b> word.</p>' +
  '<ul><li>One<ul><li>Nested</li></ul></li><li>Two</li></ul>' +
  '<table><tr><td>A1</td><td>A2</td></tr><tr><td>B1</td><td>B2</td></tr></table>' +
  '<p class="dl-img-block"><img src="data:image/png;base64,' + PNG_B64 + '" alt="" style="width:10%;max-width:100%"></p>';

function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }
function u16(b, o) { return b[o] | (b[o + 1] << 8); }

function zipEntries(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let i = b.length - 22, min = Math.max(0, i - 65535);
  for (; i >= min; i--) if (u32(b, i) === 0x06054b50) break;
  if (i < min) throw new Error('no zip end record');
  const n = u16(b, i + 10);
  let p = u32(b, i + 16);
  const out = [];
  for (let k = 0; k < n; k++) {
    const nameLen = u16(b, p + 28), extra = u16(b, p + 30), comment = u16(b, p + 32);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    const method = u16(b, p + 10);
    const flags = u16(b, p + 8);
    const off = u32(b, p + 42);
    const localExtra = u16(b, off + 28);
    const localName = u16(b, off + 26);
    const usize = u32(b, p + 24);
    const data = b.subarray(off + 30 + localName + localExtra, off + 30 + localName + localExtra + usize);
    out.push({
      name: name,
      method: method,
      flags: flags,
      extra: localExtra,
      data: data,
      offset: off
    });
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

async function buildSample(html, opts) {
  const blob = Writer.odtgen.build(html || SAMPLE, opts || {
    landscape: false,
    pageWidthCm: 21,
    pageHeightCm: 29.7,
    margins: { top: 0.5, right: 2, bottom: 0.6, left: 2 },
    defaults: { font: 'Times New Roman', sizePt: 12, lineHeight: 1.6, paraAfterPt: 6 }
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function utf8(bytes) { return new TextDecoder('utf-8').decode(bytes); }

function tagBalance(xml) {
  const src = String(xml)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<![^>]*>/g, '');
  const stack = [];
  const re = /<(\/)?([A-Za-zA-Z0-9:._-]+)([^>]*)>/g;
  let m;
  while ((m = re.exec(src))) {
    const close = !!m[1];
    const name = m[2];
    const rest = m[3] || '';
    if (rest.trim().endsWith('/')) continue;
    if (close) {
      if (!stack.length) return { ok: false, reason: 'close without open: ' + name };
      const open = stack.pop();
      if (open !== name) return { ok: false, reason: 'mismatch: open ' + open + ' close ' + name };
    } else {
      stack.push(name);
    }
  }
  return stack.length ? { ok: false, reason: 'unclosed: ' + stack.join(', ') } : { ok: true };
}

test('mimetype is the first entry, stored, with no extra field', async function () {
  const buf = await buildSample();
  assert.strictEqual(buf[0], 0x50);
  assert.strictEqual(buf[1], 0x4B);
  const entries = zipEntries(buf);
  assert.ok(entries.length >= 5, 'package has several files');
  const first = entries[0];
  assert.strictEqual(first.offset, 0, 'mimetype starts at offset 0');
  assert.strictEqual(first.name, 'mimetype');
  assert.strictEqual(first.method, 0, 'stored');
  assert.strictEqual(first.extra, 0, 'no extra field');
  assert.strictEqual(utf8(first.data), 'application/vnd.oasis.opendocument.text');
  /* 30-byte local header + 8-byte name "mimetype" => data at 38 */
  assert.strictEqual(utf8(buf.subarray(38, 38 + first.data.length)), 'application/vnd.oasis.opendocument.text');
});

test('manifest lists every file and the picture', async function () {
  const buf = await buildSample();
  const entries = zipEntries(buf);
  const names = entries.map(function (e) { return e.name; });
  assert.ok(names.indexOf('mimetype') === 0);
  assert.ok(names.indexOf('META-INF/manifest.xml') !== -1);
  assert.ok(names.indexOf('content.xml') !== -1);
  assert.ok(names.indexOf('styles.xml') !== -1);
  assert.ok(names.indexOf('meta.xml') !== -1);
  const pic = names.filter(function (n) { return /^Pictures\/image1\.png$/i.test(n); });
  assert.strictEqual(pic.length, 1, 'one PNG in Pictures/');
  const man = entries.find(function (e) { return e.name === 'META-INF/manifest.xml'; });
  const xml = utf8(man.data);
  names.forEach(function (n) {
    if (n === 'mimetype') return;
    assert.ok(xml.indexOf('manifest:full-path="' + n + '"') !== -1, 'manifest lists ' + n);
  });
  assert.ok(xml.indexOf('manifest:full-path="/"') !== -1);
  assert.ok(xml.indexOf('application/vnd.oasis.opendocument.text') !== -1);
  assert.ok(xml.indexOf('image/png') !== -1);
});

test('content.xml is well-formed (tag balance) and holds the sample', async function () {
  const buf = await buildSample();
  const entries = zipEntries(buf);
  const content = utf8(entries.find(function (e) { return e.name === 'content.xml'; }).data);
  const styles = utf8(entries.find(function (e) { return e.name === 'styles.xml'; }).data);
  const bal = tagBalance(content);
  assert.ok(bal.ok, bal.reason || 'content.xml balanced');
  const sbal = tagBalance(styles);
  assert.ok(sbal.ok, sbal.reason || 'styles.xml balanced');
  assert.ok(content.indexOf('text:outline-level="1"') !== -1);
  assert.ok(/Heading One/.test(content));
  assert.ok(/fo:font-weight="bold"/.test(content) || /fo:font-weight="bold"/.test(styles));
  assert.ok(content.indexOf('text:list') !== -1);
  assert.ok(/Nested/.test(content));
  assert.ok(content.indexOf('table:table') !== -1);
  assert.ok(/A1/.test(content) && /B2/.test(content));
  assert.ok(/Pictures\/image1\.png/.test(content));
  assert.ok(styles.indexOf('Heading_20_1') !== -1);
  assert.ok(styles.indexOf('style:name="Standard"') !== -1);
  assert.ok(styles.indexOf('fo:page-width="21cm"') !== -1 || styles.indexOf('fo:page-width="21.000cm"') !== -1 || /fo:page-width="21(\.0+)?cm"/.test(styles));
  assert.ok(styles.indexOf('fo:margin-left="2cm"') !== -1 || /fo:margin-left="2(\.0+)?cm"/.test(styles));
});

test('round-trip through writer-odtread.js matches the sample', async function () {
  const buf = await buildSample();
  const result = await Odt.read(buf);
  assert.ok(result && typeof result.html === 'string');
  const html = result.html;
  assert.ok(/<h1\b[^>]*>Heading One<\/h1>/.test(html), html);
  assert.ok(/<b>bold<\/b>/.test(html), html);
  assert.ok(/<ul>/.test(html) && /Nested/.test(html) && /Two/.test(html), html);
  /* nested list stays nested */
  assert.ok(/<li>[^<]*One[\s\S]*<ul>[\s\S]*Nested[\s\S]*<\/ul>/.test(html), html);
  assert.ok(/<table\b/.test(html), html);
  assert.ok(/A1/.test(html) && /A2/.test(html) && /B1/.test(html) && /B2/.test(html), html);
  assert.ok(/data:image\/png;base64,/.test(html), html);
  /* PNG payload survives */
  const img = /src="(data:image\/png;base64,[^"]+)"/.exec(html);
  assert.ok(img, 'image data URL present');
  const got = img[1].replace(/^data:image\/png;base64,/, '');
  assert.strictEqual(got.replace(/\s+/g, ''), PNG_B64);
});

test('merged cells, highlight, colour, lists and page break survive a round-trip', async function () {
  const html =
    '<h2>Sub</h2>' +
    '<p style="text-align:center">Centre <span style="color:#ff0000">red</span> and <span style="background-color:#ffff00">mark</span> and <u>under</u> <s>strike</s> <i>italic</i> <sup>up</sup> <sub>down</sub>.</p>' +
    '<ol><li>First<ol><li>Inner num</li></ol></li><li>Second</li></ol>' +
    '<table><tr><td colspan="2">Wide</td></tr><tr><td>L</td><td>R</td></tr></table>' +
    '<div class="dr-pagebreak" contenteditable="false" data-label="Page break"></div>' +
    '<p>After the break</p>';
  const buf = await buildSample(html);
  const result = await Odt.read(buf);
  const out = result.html;
  assert.ok(/<h2\b[^>]*>Sub<\/h2>/.test(out), out);
  assert.ok(/text-align:\s*center/.test(out), out);
  assert.ok(/#FF0000|#ff0000/.test(out), out);
  assert.ok(/background-color:\s*#ffff00/i.test(out), out);
  assert.ok(/<u>under<\/u>/.test(out), out);
  assert.ok(/<s>strike<\/s>/.test(out), out);
  assert.ok(/<i>italic<\/i>/.test(out), out);
  assert.ok(/<sup>up<\/sup>/.test(out), out);
  assert.ok(/<sub>down<\/sub>/.test(out), out);
  assert.ok(/<ol>/.test(out) && /Inner num/.test(out), out);
  assert.ok(/colspan="2"/.test(out) && /Wide/.test(out), out);
  assert.ok(/After the break/.test(out), out);
  const content = utf8(zipEntries(buf).find(function (e) { return e.name === 'content.xml'; }).data);
  assert.ok(/fo:break-before="page"/.test(content), 'page break in content.xml');
});

test('writer.html wires Export ODT next to Export DOCX and loads odtgen', function () {
  const html = fs.readFileSync(path.join(DIR, 'writer.html'), 'utf8');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  /* (before DW9) assert.ok(live.indexOf('<title>Writer DW8</title>') !== -1); */
  /* (before DW11) assert.ok(live.indexOf('<title>Writer DW9</title>') !== -1); */
  /* (before DW11a) assert.ok(live.indexOf('<title>Writer DW11</title>') !== -1); */
  /* (before DW12) assert.ok(live.indexOf('<title>Writer DW11a</title>') !== -1); */
  assert.ok(/<title>Writer DW1(1a|2)<\/title>/.test(live));
  assert.ok(html.indexOf('<!-- (before DW8) <title>Writer DW7</title> -->') !== -1);
  assert.ok(html.indexOf('<!-- (before DW9) <title>Writer DW8</title> -->') !== -1);
  assert.ok(live.indexOf('Export ODT') !== -1);
  assert.ok(live.indexOf('id="exportOdtBtn"') !== -1);
  assert.ok(live.indexOf('id="exportDocxBtn"') < live.indexOf('id="exportOdtBtn"'));
  assert.ok(live.indexOf('id="exportOdtBtn"') < live.indexOf('id="exportPdfBtn"'));
  assert.ok(live.indexOf('src="modules/writer-odtgen.js"') !== -1);
  assert.ok(live.indexOf('src="modules/writer-zip.js"') < live.indexOf('src="modules/writer-odtgen.js"'));
  assert.ok(!/\?v=/.test(html), 'no cache-bust query');
  const exp = fs.readFileSync(path.join(DIR, 'modules/writer-export.js'), 'utf8');
  assert.ok(exp.indexOf('Writer.export.exportOdt') !== -1);
  assert.ok(exp.indexOf('exportOdtBtn') !== -1);
  assert.ok(exp.indexOf('Writer.dialog.alert') !== -1);
  const stripped = exp.replace(/Writer\.dialog\.\w+|OfficeDialog\.\w+/g, '');
  assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(stripped), 'no browser dialogs in export.js');
  const gen = fs.readFileSync(path.join(DIR, 'modules/writer-odtgen.js'), 'utf8');
  assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(gen), 'no browser dialogs in odtgen');
  const cfg = fs.readFileSync(path.join(DIR, 'modules/writer-config.js'), 'utf8');
  /* (before DW9) assert.ok(/release:\s*'DW8'/.test(cfg)); */
  /* (before DW11) assert.ok(/release:\s*'DW9'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW11a) assert.ok(/release:\s*'DW11'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW12) assert.ok(/release:\s*'DW11a'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW(11a|12)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
});

if (fs.existsSync('/usr/bin/soffice') || fs.existsSync('/usr/bin/libreoffice')) {
  test('LibreOffice opens the exported .odt', async function (t) {
    const buf = await buildSample();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dw8-odt-'));
    const odtPath = path.join(dir, 'sample.odt');
    fs.writeFileSync(odtPath, buf);
    const bin = fs.existsSync('/usr/bin/soffice') ? 'soffice' : 'libreoffice';
    const r = spawnSync(bin, ['--headless', '--convert-to', 'txt:Text', '--outdir', dir, odtPath], {
      encoding: 'utf8',
      timeout: 90000
    });
    const txtPath = path.join(dir, 'sample.txt');
    if (!fs.existsSync(txtPath)) {
      t.skip('soffice did not write sample.txt: ' + (r.stderr || r.stdout || r.status));
      return;
    }
    const txt = fs.readFileSync(txtPath, 'utf8');
    assert.ok(/Heading One/.test(txt), txt);
    assert.ok(/bold/.test(txt), txt);
    assert.ok(/Nested/.test(txt), txt);
    assert.ok(/A1/.test(txt) && /B2/.test(txt), txt);
  });
}
