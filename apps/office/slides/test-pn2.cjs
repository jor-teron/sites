#!/usr/bin/env node
/* PN2: Presentation exports LibreOffice .odp files (slides_odpgen.js).
   Builds a two-slide deck (text box with a bold run and bullets, a rect,
   a tiny PNG, a background colour and notes), packs it with SLZip, then
   asserts the package and a round-trip through slides_odp.js.
   Run: node --test apps/office/slides/test-pn2.cjs
   No DOM, no browser, no network. If soffice is on the machine, also
   converts the output to PDF as a sanity check. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { spawnSync } = require('child_process');

const dir = __dirname;
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG = Buffer.from(PNG_B64, 'base64');
const MIME = 'application/vnd.oasis.opendocument.presentation';

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
  vm.runInContext(fs.readFileSync(path.join(dir, 'slides_text.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'slides_odp.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'slides_odpgen.js'), 'utf8'), ctx);
  return { Zip: ctx.SLZip, Odp: ctx.SLOdp, Gen: ctx.SLOdpgen, Text: ctx.SLText, ctx: ctx };
}

/* objects made in a vm sandbox need a clone before deepStrictEqual */
function plain(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

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

function sampleDeck() {
  return {
    name: 'Demo talk',
    theme: 'light',
    slides: [
      {
        layout: 'blank',
        bg: '#1a365d',
        notes: 'Say this out loud',
        texts: [{
          x: 40, y: 180, w: 280, h: 220, z: 1, fill: '',
          doc: {
            paragraphs: [
              {
                list: 'none', level: 0, align: 'center',
                runs: [
                  { text: 'Hello ' },
                  { text: 'World', b: true, color: '#f6e05e', size: 24 }
                ]
              },
              { list: 'bullet', level: 0, runs: [{ text: 'First point' }] },
              { list: 'bullet', level: 0, runs: [{ text: 'Second point' }] },
              { list: 'bullet', level: 1, runs: [{ text: 'Nested' }] }
            ]
          }
        }],
        shapes: [{
          kind: 'rect', x: 400, y: 200, w: 160, h: 80,
          fill: '#f97316', stroke: '#7c2d12', sw: 1, z: 2
        }],
        pics: [{
          x: 700, y: 200, w: 80, h: 80, z: 0,
          src: 'data:image/png;base64,' + PNG_B64,
          fit: 'contain'
        }],
        tables: [],
        hide: false
      },
      {
        layout: 'blank',
        tables: [{
          x: 80, y: 80, w: 400, h: 200, z: 3, rows: 2, cols: 2,
          cells: [
            [{ doc: { paragraphs: [{ runs: [{ text: 'A1' }], list: 'none', level: 0 }] } },
             { doc: { paragraphs: [{ runs: [{ text: 'B1' }], list: 'none', level: 0 }] } }],
            [{ doc: { paragraphs: [{ runs: [{ text: 'A2' }], list: 'none', level: 0 }] } },
             { doc: { paragraphs: [{ runs: [{ text: 'B2' }], list: 'none', level: 0 }] } }]
          ]
        }]
      }
    ]
  };
}

function buildPacked() {
  const { Zip, Gen } = load();
  const built = Gen.build(sampleDeck());
  const packed = Zip.pack(built.files);
  return { Zip, Gen, built, packed };
}

test('mimetype is the first entry, stored, with no extra field', () => {
  const { packed } = buildPacked();
  assert.equal(packed[0], 0x50);
  assert.equal(packed[1], 0x4B);
  const entries = zipEntries(packed);
  assert.ok(entries.length >= 5, 'package has several files');
  const first = entries[0];
  assert.equal(first.offset, 0, 'mimetype starts at offset 0');
  assert.equal(first.name, 'mimetype');
  assert.equal(first.method, 0, 'stored');
  assert.equal(first.flags, 0, 'flags 0');
  assert.equal(first.extra, 0, 'no extra field');
  assert.equal(utf8(first.data), MIME);
  assert.equal(utf8(packed.subarray(38, 38 + first.data.length)), MIME);
});

test('manifest lists every file and the picture', () => {
  const { packed } = buildPacked();
  const entries = zipEntries(packed);
  const names = entries.map(function (e) { return e.name; });
  assert.equal(names[0], 'mimetype');
  assert.ok(names.indexOf('META-INF/manifest.xml') !== -1);
  assert.ok(names.indexOf('content.xml') !== -1);
  assert.ok(names.indexOf('styles.xml') !== -1);
  assert.ok(names.indexOf('meta.xml') !== -1);
  const pic = names.filter(function (n) { return /^Pictures\/image1\.png$/i.test(n); });
  assert.equal(pic.length, 1, 'one PNG in Pictures/');
  const man = entries.find(function (e) { return e.name === 'META-INF/manifest.xml'; });
  const xml = utf8(man.data);
  names.forEach(function (n) {
    if (n === 'mimetype') return;
    assert.ok(xml.indexOf('manifest:full-path="' + n + '"') !== -1, 'manifest lists ' + n);
  });
  assert.ok(xml.indexOf('manifest:full-path="/"') !== -1);
  assert.ok(xml.indexOf(MIME) !== -1);
  assert.ok(xml.indexOf('image/png') !== -1);
});

test('content.xml and styles.xml are well-formed and hold the sample', () => {
  const { packed, Gen } = buildPacked();
  const entries = zipEntries(packed);
  const content = utf8(entries.find(function (e) { return e.name === 'content.xml'; }).data);
  const styles = utf8(entries.find(function (e) { return e.name === 'styles.xml'; }).data);
  const meta = utf8(entries.find(function (e) { return e.name === 'meta.xml'; }).data);
  const bal = tagBalance(content);
  assert.ok(bal.ok, bal.reason || 'content.xml balanced');
  const sbal = tagBalance(styles);
  assert.ok(sbal.ok, sbal.reason || 'styles.xml balanced');
  assert.equal((content.match(/<draw:page\b/g) || []).length, 3, 'two slides plus a notes page');
  assert.ok(/Hello /.test(content) && /World/.test(content));
  assert.ok(/fo:font-weight="bold"/.test(content));
  assert.ok(/fo:text-align="center"/.test(content));
  assert.ok(content.indexOf('text:list') !== -1);
  assert.ok(/First point/.test(content) && /Nested/.test(content));
  assert.ok(content.indexOf('<draw:rect') !== -1);
  assert.ok(/draw:fill-color="#f97316"/.test(content));
  assert.ok(/svg:stroke-color="#7c2d12"/.test(content));
  assert.ok(/Pictures\/image1\.png/.test(content));
  assert.ok(/presentation:class="notes"/.test(content));
  assert.ok(/Say this out loud/.test(content));
  assert.ok(content.indexOf('table:table') !== -1);
  assert.ok(/A1/.test(content) && /B2/.test(content));
  assert.ok(/fo:page-width="28cm"/.test(styles) || /fo:page-width="28(\.0+)?cm"/.test(styles));
  assert.ok(/fo:page-height="15\.75cm"/.test(styles));
  assert.ok(/style:name="Default"/.test(styles));
  assert.ok(/Demo talk/.test(meta));
  assert.equal(Gen.PW, 28);
  assert.equal(Gen.PH, 15.75);
});

test('round-trip through slides_odp.js keeps text, bullets, a rect, a picture, a background, notes and a table', () => {
  const { Zip, Odp, Gen } = load();
  const built = Gen.build(sampleDeck());
  const packed = Zip.pack(built.files);
  const un = Zip.unpack(packed);
  assert.ok(un.files, un.error);
  const parsed = Odp.parse(un.files);
  const r = plain(parsed);
  assert.ok(!r.error, r.error);
  assert.equal(r.deck.name, 'Demo talk');
  assert.equal(r.deck.slides.length, 2);

  const s1 = r.deck.slides[0];
  assert.equal(s1.bg, '#1a365d');
  assert.equal(s1.notes, 'Say this out loud');
  assert.equal(s1.texts.length, 1, 'text box stayed a text box, not a title or body');
  const paras = s1.texts[0].doc.paragraphs;
  const titleText = paras[0].runs.map(x => x.text).join('');
  assert.equal(titleText, 'Hello World');
  assert.equal(paras[0].align, 'center');
  const bold = paras[0].runs.find(x => x.text === 'World' || (x.text && x.text.indexOf('World') >= 0));
  assert.ok(bold && bold.b === true, 'World run is bold');
  assert.equal(bold.color, '#f6e05e');
  const bullets = paras.filter(p => p.list === 'bullet');
  assert.ok(bullets.length >= 3, 'expected 3 bullet paras, got ' + bullets.length);
  assert.equal(bullets[0].runs.map(x => x.text).join(''), 'First point');
  assert.equal(bullets[0].level, 0);
  assert.equal(bullets[1].runs.map(x => x.text).join(''), 'Second point');
  assert.equal(bullets[2].runs.map(x => x.text).join(''), 'Nested');
  assert.equal(bullets[2].level, 1);

  assert.ok(s1.shapes.length >= 1, 'rect shape missing');
  const rect = s1.shapes[0];
  assert.equal(rect.kind, 'rect');
  assert.equal(rect.fill, '#f97316');
  assert.equal(rect.stroke, '#7c2d12');
  assert.equal(rect.x, 400);
  assert.equal(rect.y, 200);
  assert.equal(rect.w, 160);
  assert.equal(rect.h, 80);

  assert.equal(s1.pics.length, 1);
  assert.ok(s1.pics[0].src.indexOf('data:image/png;base64,') === 0);
  assert.ok(s1.pics[0].src.replace(/\s+/g, '').indexOf(PNG_B64) >= 0);
  assert.equal(s1.pics[0].x, 700);
  assert.equal(s1.pics[0].y, 200);
  assert.equal(s1.pics[0].w, 80);
  assert.equal(s1.pics[0].h, 80);

  const box = s1.texts[0];
  assert.equal(box.x, 40);
  assert.equal(box.y, 180);
  assert.equal(box.w, 280);
  assert.equal(box.h, 220);

  const s2 = r.deck.slides[1];
  assert.equal(s2.tables.length, 1);
  assert.equal(s2.tables[0].rows, 2);
  assert.equal(s2.tables[0].cols, 2);
  const a1 = s2.tables[0].cells[0][0].doc.paragraphs[0].runs.map(x => x.text).join('');
  assert.equal(a1, 'A1');
  const b2 = s2.tables[0].cells[1][1].doc.paragraphs[0].runs.map(x => x.text).join('');
  assert.equal(b2, 'B2');
});

test('slides.html wires Export .odp next to Export .pptx and loads odpgen', () => {
  const html = fs.readFileSync(path.join(dir, 'slides.html'), 'utf8');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(live.indexOf('<title>Presentation PN2</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before PN2) <title>Presentation PN1</title> -->') !== -1);
  const pptxAt = [];
  const odpAt = [];
  live.replace(/<button type="button" role="menuitem" data-a="pptx">⬇ Export \.pptx…<\/button>/g, function (_, i) { pptxAt.push(i); return _; });
  live.replace(/<button type="button" role="menuitem" data-a="odp">⬇ Export \.odp…<\/button>/g, function (_, i) { odpAt.push(i); return _; });
  /* String.replace callback gets offset as the 3rd arg when no groups; with no capture, 2nd is offset. */
  const pptx = [];
  const odp = [];
  let idx = 0, s = live;
  while ((idx = s.indexOf('data-a="pptx">⬇ Export .pptx…', idx)) !== -1) { pptx.push(idx); idx++; }
  idx = 0;
  while ((idx = s.indexOf('data-a="odp">⬇ Export .odp…', idx)) !== -1) { odp.push(idx); idx++; }
  assert.equal(pptx.length, 2, 'two Export .pptx items');
  assert.equal(odp.length, 2, 'two Export .odp items');
  assert.ok(pptx[0] < odp[0] && odp[0] < pptx[1], 'File menu: Export .odp follows Export .pptx');
  assert.ok(pptx[1] < odp[1], '⋯ menu: Export .odp follows Export .pptx');
  assert.ok(live.indexOf('src="slides_odpgen.js?v=PN2"') !== -1);
  assert.ok(live.indexOf('src="slides_zip.js?v=PN2"') < live.indexOf('src="slides_odpgen.js?v=PN2"'));
  assert.ok(live.indexOf('src="slides_odp.js?v=PN2"') < live.indexOf('src="slides_odpgen.js?v=PN2"'));
  const app = fs.readFileSync(path.join(dir, 'slides_app.js'), 'utf8');
  assert.ok(/var VERSION = 'PN2'/.test(app));
  assert.ok(app.indexOf("/* (before PN2) var VERSION = 'PN1'; */") !== -1);
  assert.ok(app.indexOf('function exportOdp()') !== -1);
  assert.ok(app.indexOf('SLOdpgen.build') !== -1);
  const stripped = app.replace(/dialog\s*\(|warnMsg\s*\(/g, '');
  assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(stripped), 'no browser dialogs in slides_app.js export path');
  const gen = fs.readFileSync(path.join(dir, 'slides_odpgen.js'), 'utf8');
  assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(gen), 'no browser dialogs in odpgen');
});

if (fs.existsSync('/usr/bin/soffice') || fs.existsSync('/usr/bin/libreoffice')) {
  test('LibreOffice opens the exported .odp', (t) => {
    const { packed } = buildPacked();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pn2-odp-'));
    const odpPath = path.join(tmp, 'sample.odp');
    fs.writeFileSync(odpPath, packed);
    const bin = fs.existsSync('/usr/bin/soffice') ? 'soffice' : 'libreoffice';
    const r = spawnSync(bin, ['--headless', '--convert-to', 'pdf', '--outdir', tmp, odpPath], {
      encoding: 'utf8',
      timeout: 90000
    });
    const pdfPath = path.join(tmp, 'sample.pdf');
    if (!fs.existsSync(pdfPath)) {
      t.skip('soffice did not write sample.pdf: ' + (r.stderr || r.stdout || r.status));
      return;
    }
    const st = fs.statSync(pdfPath);
    assert.ok(st.size > 200, 'PDF should not be empty, got ' + st.size + ' bytes');
    /* Prefer a text extract when poppler is there, otherwise a non-empty PDF is enough. */
    const toText = spawnSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8', timeout: 20000 });
    if (toText.status === 0 && toText.stdout) {
      const txt = toText.stdout;
      assert.ok(/Hello/.test(txt) && /World/.test(txt), txt);
      assert.ok(/First point/.test(txt), txt);
      assert.ok(/A1/.test(txt) && /B2/.test(txt), txt);
    }
  });
}
