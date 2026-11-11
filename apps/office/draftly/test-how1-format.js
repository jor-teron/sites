/* HOW1: .how round-trip. No DOM, no browser, no network.
   Run: node apps/office/draftly/test-how1-format.js */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var dir = __dirname;
var How = require('./modules/draftly-how.js');

var img = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
var doc = {
  name: 'Quarterly review',
  created: 1700000000000,
  updated: 1700000001000,
  html: '<p><b>Hello</b> <i style="color:#112233">there</i></p>' +
    '<p class="dl-img-block"><img src="' + img + '" alt="" style="width:40%"></p>',
  hf: { head: ['Hub', '', 'Office'], foot: ['', '{page}', '{date}'] },
  page: {
    size: 'Legal',
    orientation: 'landscape',
    margins: 'custom',
    custom: { top: 1, bottom: 1.5, left: 2, right: 2.2 },
    numbers: { on: true, pos: 'right' }
  }
};

var text = How.stringify(doc);
assert.strictEqual(text.slice(0, 1), '{', 'a .how file is a JSON object');
assert.strictEqual(text.indexOf('PK'), -1, 'not a zip');
assert.ok(text.indexOf('"format": "how"') !== -1, 'format name how');
assert.ok(text.indexOf('"version": 1') !== -1, 'format version 1');

var back = How.parse(text);
assert.strictEqual(back.format, 'how');
assert.strictEqual(back.version, 1);
assert.strictEqual(back.name, doc.name);
assert.strictEqual(back.created, doc.created);
assert.strictEqual(back.updated, doc.updated);
assert.strictEqual(back.html, doc.html, 'content, formatting and the image come back');
assert.deepStrictEqual(back.hf, doc.hf);
assert.deepStrictEqual(back.page, How.pageOf(doc.page));
assert.strictEqual(back.page.size, 'Legal');
assert.strictEqual(back.page.orientation, 'landscape');
assert.strictEqual(back.page.margins, 'custom');
assert.strictEqual(back.page.custom.right, 2.2);
assert.strictEqual(back.page.numbers.on, true);
assert.strictEqual(back.page.numbers.pos, 'right');
assert.ok(back.html.indexOf(img) !== -1, 'image data URL is embedded');

var again = How.parse(How.stringify(back));
assert.strictEqual(again.html, back.html);
assert.deepStrictEqual(again.page, back.page);
assert.deepStrictEqual(again.hf, back.hf);
assert.strictEqual(again.created, back.created);

function rejects(raw, label) {
  assert.throws(function () { How.parse(raw); }, function (e) {
    assert.ok(e.userMessage, label);
    return true;
  }, label);
}
rejects('{"name":"Old","html":"<p>Hi</p>","updated":1}', 'old IndexedDB-shaped record');
rejects('{"format":"how","version":2,"html":"<p>a</p>"}', 'newer version');
rejects('{"format":"draftly","version":1,"html":"<p>a</p>"}', 'other format name');
rejects('not json', 'not json');

assert.strictEqual(How.fileName('Quarterly review'), 'Quarterly review.how');
assert.strictEqual(How.fileName('Quarterly review.how'), 'Quarterly review.how');
assert.strictEqual(How.fileName('Q?.how'), 'Q.how');
assert.strictEqual(How.isHow({ name: 'Letter.how' }), true);
assert.strictEqual(How.isHow({ name: 'Letter.docx' }), false);
assert.strictEqual(How.FORMAT, 'how');
assert.strictEqual(How.VERSION, 1);

function read(rel) { return fs.readFileSync(path.join(dir, rel), 'utf8'); }
function live(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

var docs = read('modules/draftly-docs.js');
var docsLive = live(docs);
assert.ok(docs.indexOf('(before HOW1)') !== -1, 'old load path kept');
assert.ok(docsLive.indexOf('listDocs') === -1, 'IndexedDB list is not called');
assert.ok(docsLive.indexOf('getDoc') === -1, 'IndexedDB get is not called');
assert.ok(docsLive.indexOf('Draftly.how') !== -1);

var docx = read('modules/draftly-docxopen.js');
var docxLive = live(docx);
assert.ok(docx.indexOf('(before HOW1)') !== -1);
assert.ok(docxLive.indexOf('docxread.read') !== -1, 'docx import still reads');
assert.ok(docxLive.indexOf('listDocs') === -1, 'docx import does not list IndexedDB');
assert.ok(docxLive.indexOf('isDocx') !== -1);

var html = read('draftly.html');
assert.ok(html.indexOf('id="openHowBtn"') !== -1);
assert.ok(html.indexOf('id="saveAsBtn"') !== -1);
assert.ok(html.indexOf('modules/draftly-how.js') !== -1);
assert.ok(html.indexOf('id="openDocxBtn"') !== -1);
assert.ok(html.indexOf('?v=') === -1, 'no cache-bust query');

var typesSrc = fs.readFileSync(path.join(dir, '../../../shared/fs/filetypes.js'), 'utf8');
var typesCtx = { window: {} };
vm.createContext(typesCtx);
vm.runInContext(typesSrc, typesCtx);
var opened = typesCtx.window.FileTypes.apps('Letter.how');
assert.strictEqual(opened[0].id, 'draftly');
assert.strictEqual(opened[0].name, 'Writer');
assert.strictEqual(opened[0].file, true);
assert.strictEqual(opened[0].url, 'apps/office/draftly/');
var jsonApps = typesCtx.window.FileTypes.apps('notes.json');
assert.strictEqual(jsonApps[0].id, 'notely', '.json stays with Notely');
var pngApps = typesCtx.window.FileTypes.apps('cat.png');
assert.strictEqual(pngApps[0].id, 'viewer');

var desc = 'Word processor with A4 pages: native .how files - PDF or DOCX';
assert.ok(desc.length < 90, desc.length);
assert.strictEqual(desc.indexOf(','), -1);

console.log('how1 format checks passed');
