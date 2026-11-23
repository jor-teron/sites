/* DW9: Writer opens plain-text .txt files (modules/writer-txt.js).
   Pure conversion tests: BOM, line endings, blank lines, HTML escape,
   empty file, stem naming. No DOM, no browser, no network.
   Run: node --test apps/office/writer/test/test-dw9-txt.cjs */
'use strict';

const test = require('node:test');
const assert = require('assert');
const Txt = require('../modules/writer-txt.js');

test('txtToParagraphs strips a UTF-8 BOM', () => {
  assert.deepEqual(Txt.txtToParagraphs('\uFEFFHello'), ['<p>Hello</p>']);
  assert.deepEqual(Txt.txtToParagraphs('\uFEFFLine 1\nLine 2'), ['<p>Line 1</p>', '<p>Line 2</p>']);
});

test('txtToParagraphs treats CRLF, CR and LF as line breaks', () => {
  assert.deepEqual(Txt.txtToParagraphs('a\r\nb'), ['<p>a</p>', '<p>b</p>']);
  assert.deepEqual(Txt.txtToParagraphs('a\rb'), ['<p>a</p>', '<p>b</p>']);
  assert.deepEqual(Txt.txtToParagraphs('a\nb'), ['<p>a</p>', '<p>b</p>']);
  assert.deepEqual(Txt.txtToParagraphs('a\r\nb\rc\nd'), ['<p>a</p>', '<p>b</p>', '<p>c</p>', '<p>d</p>']);
});

test('txtToParagraphs keeps blank lines as empty paragraphs', () => {
  assert.deepEqual(Txt.txtToParagraphs('a\n\nb'), ['<p>a</p>', '<p><br></p>', '<p>b</p>']);
  assert.deepEqual(Txt.txtToParagraphs('a\r\n\r\nb'), ['<p>a</p>', '<p><br></p>', '<p>b</p>']);
  assert.deepEqual(Txt.txtToParagraphs('\nHello'), ['<p><br></p>', '<p>Hello</p>']);
});

test('txtToParagraphs treats a trailing newline as a terminator, not a blank line', () => {
  assert.deepEqual(Txt.txtToParagraphs('hello\n'), ['<p>hello</p>']);
  assert.deepEqual(Txt.txtToParagraphs('hello\n\n'), ['<p>hello</p>', '<p><br></p>']);
});

test('txtToParagraphs escapes HTML so text is never markup', () => {
  assert.deepEqual(Txt.txtToParagraphs('<script>alert(1)</script>'), ['<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>']);
  assert.deepEqual(Txt.txtToParagraphs('A & B < C > D'), ['<p>A &amp; B &lt; C &gt; D</p>']);
});

test('txtToParagraphs leaves tabs as they are', () => {
  assert.deepEqual(Txt.txtToParagraphs('col1\tcol2'), ['<p>col1\tcol2</p>']);
});

test('an empty file gives one empty paragraph', () => {
  assert.deepEqual(Txt.txtToParagraphs(''), ['<p><br></p>']);
  assert.deepEqual(Txt.txtToParagraphs('\uFEFF'), ['<p><br></p>']);
  assert.deepEqual(Txt.txtToParagraphs('\n'), ['<p><br></p>']);
  assert.equal(Txt.toHtml(''), '<p><br></p>');
});

test('stem naming uses the file stem (notes.txt → notes)', () => {
  assert.equal(Txt.stem('notes.txt'), 'notes');
  assert.equal(Txt.stem('Notes.TXT'), 'Notes');
  assert.equal(Txt.stem('my letter.txt'), 'my letter');
  assert.equal(Txt.stem('Document'), 'Document');
  assert.equal(Txt.stem(''), 'Document');
  assert.equal(Txt.stem(null), 'Document');
});

test('read() returns the same HTML path as a docx/odt import', () => {
  const res = Txt.read('Hello\n\nWorld');
  assert.equal(res.html, '<p>Hello</p><p><br></p><p>World</p>');
  assert.equal(res.page, null);
  assert.deepEqual(res.hf, { head: ['', '', ''], foot: ['', '', ''] });
  assert.deepEqual(res.notes, []);
});

const fs = require('fs');
const path = require('path');
const DIR = path.resolve(__dirname, '..');

test('writer.html wires .txt into the import Open picker and loads writer-txt.js', () => {
  const html = fs.readFileSync(path.join(DIR, 'writer.html'), 'utf8');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
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
  /* (before DW22) assert.ok(/<title>Writer DW1(1a|2|3|3b|3c|4|4a|5|6|7|8|9)<\/title>/.test(live)); */
  /* (before DW23) assert.ok(/<title>Writer DW(1(1a|2|3|3b|3c|4|4a|5|6|7|8|9)|22)<\/title>/.test(live)); */
  /* (before DW24) assert.ok(/<title>Writer DW(1(1a|2|3|3b|3c|4|4a|5|6|7|8|9)|22|23)<\/title>/.test(live)); */
  /* (before DW25) assert.ok(/<title>Writer DW(1(1a|2|3|3b|3c|4|4a|5|6|7|8|9)|22|23|24)<\/title>/.test(live)); */
  assert.ok(/<title>Writer DW(1(1a|2|3|3b|3c|4|4a|5|6|7|8|9)|22|23|24|25|26)<\/title>/.test(live));
  assert.ok(html.indexOf('<!-- (before DW9) <title>Writer DW8</title> -->') !== -1);
  /* (before DW14) assert.ok(live.indexOf('Open .docx / .odt / .txt') !== -1); */
  /* (before DW14) assert.ok(live.indexOf('accept=".docx,.odt,.txt,') !== -1); */
  assert.ok(live.indexOf('Open...') !== -1);
  assert.ok(live.indexOf('id="openFileBtn"') !== -1);
  assert.ok(live.indexOf('accept=".how,.docx,.odt,.txt,') !== -1);
  assert.ok(live.indexOf('text/plain') !== -1);
  /* (before DW26) writer-txt.js and writer-docxopen.js were static script tags in writer.html. */
  const vendor = fs.readFileSync(path.join(DIR, 'modules/writer-vendor.js'), 'utf8');
  assert.ok(live.indexOf('src="modules/writer-vendor.js"') !== -1);
  assert.ok(vendor.indexOf('modules/writer-txt.js') !== -1);
  assert.ok(vendor.indexOf('modules/writer-docxopen.js') !== -1);
  /* Mail merge data picker is unchanged and still accepts .txt as table data. */
  assert.ok(/id="mmFile"[^>]*accept="[^"]*\.txt[^"]*"/.test(live));
  /* (before DW14) assert.ok(live.indexOf('id="howFile" accept=".how,application/json"') !== -1); */
  assert.ok(html.indexOf('id="howFile" accept=".how,application/json"') !== -1);
  assert.ok(!/\?v=/.test(html), 'no cache-bust query');
  const cfg = fs.readFileSync(path.join(DIR, 'modules/writer-config.js'), 'utf8');
  /* (before DW11) assert.ok(/release:\s*'DW9'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
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
  /* (before DW25) assert.ok(/release:\s*'DW(11a|12|13|13b|13c|14|14a|15|16|17|18|19|22|23|24)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW(11a|12|13|13b|13c|14|14a|15|16|17|18|19|22|23|24|25|26)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
});

test('docxopen and how.js accept .txt from the picker, drop and Hub hash', () => {
  const open = fs.readFileSync(path.join(DIR, 'modules/writer-docxopen.js'), 'utf8');
  const liveOpen = open.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(liveOpen.indexOf('isTxt') !== -1);
  assert.ok(liveOpen.indexOf('Writer.txt.read') !== -1);
  assert.ok(liveOpen.indexOf('Writer.txt.stem') !== -1);
  assert.ok(/isDocx\(f\)\s*\|\|\s*D\.isOdt\(f\)\s*\|\|\s*D\.isTxt\(f\)/.test(liveOpen));
  const how = fs.readFileSync(path.join(DIR, 'modules/writer-how.js'), 'utf8');
  const liveHow = how.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\\\.\(docx\|odt\|txt\)\$/.test(liveHow));
});
