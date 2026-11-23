/* DW14: Writer File menu — one Open..., one Export..., new order.
   Pure checks (no browser): openKind from a file name, openPicked routes
   to the existing openers or a toast, and writer.html has the new menu.
   Run: node --test apps/office/writer/test/test-dw14-filemenu.cjs */
'use strict';

const test = require('node:test');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIR = path.resolve(__dirname, '..');

function live(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

function loadDocs() {
  const src = fs.readFileSync(path.join(DIR, 'modules/writer-docs.js'), 'utf8');
  const log = [];
  const ctx = {
    console,
    window: {},
    document: { getElementById() { return null; }, addEventListener() {} }
  };
  ctx.window.Writer = {
    ui: { onClick() {}, showToast(m) { log.push(['toast', m]); } },
    how: { openFile(file, dest) { log.push(['how', file && file.name, dest]); } },
    docxopen: { open(file) { log.push(['docxopen', file && file.name]); } }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'writer-docs.js' });
  return { docs: ctx.window.Writer.docs, log };
}

test('openKind: how, docx, odt, txt, or null', () => {
  const { docs } = loadDocs();
  assert.equal(typeof docs.openKind, 'function');
  assert.equal(docs.openKind('Letter.how'), 'how');
  assert.equal(docs.openKind('Letter.HOW'), 'how');
  assert.equal(docs.openKind('Report.docx'), 'docx');
  assert.equal(docs.openKind('Notes.ODT'), 'odt');
  assert.equal(docs.openKind('readme.txt'), 'txt');
  assert.equal(docs.openKind('  plan.Txt  '), 'txt');
  assert.equal(docs.openKind('archive.tar.txt'), 'txt');
  assert.equal(docs.openKind('folder/file.docx'), 'docx');
  assert.equal(docs.openKind('no-extension'), null);
  assert.equal(docs.openKind('ends-with-dot.'), null);
  assert.equal(docs.openKind('notes.pdf'), null);
  assert.equal(docs.openKind('notes.doc'), null);
  assert.equal(docs.openKind(''), null);
  assert.equal(docs.openKind(null), null);
});

test('openPicked routes to the existing openers, or a toast', () => {
  const { docs, log } = loadDocs();
  docs.openPicked({ name: 'Letter.how' });
  docs.openPicked({ name: 'Report.docx' });
  docs.openPicked({ name: 'Notes.odt' });
  docs.openPicked({ name: 'readme.txt' });
  docs.openPicked({ name: 'photo.png' });
  docs.openPicked(null);
  assert.deepEqual(log, [
    ['how', 'Letter.how', null],
    ['docxopen', 'Report.docx'],
    ['docxopen', 'Notes.odt'],
    ['docxopen', 'readme.txt'],
    ['toast', 'Choose a .how, .docx, .odt or .txt file to open it']
  ]);
});

test('writer.html File menu: new order, one Open..., one Export...', () => {
  const html = fs.readFileSync(path.join(DIR, 'writer.html'), 'utf8');
  const src = live(html);
  const ids = ['newBtn', 'openFileBtn', 'renameBtn', 'saveBtn', 'saveAsBtn', 'printBtn', 'deleteCurrentBtn', 'exportBtn', 'settingsMenuBtn', 'recentBtn'];
  const pos = ids.map((id) => {
    const i = src.indexOf('id="' + id + '"');
    assert.ok(i !== -1, 'missing ' + id);
    return i;
  });
  for (let i = 1; i < pos.length; i++) {
    assert.ok(pos[i - 1] < pos[i], ids[i - 1] + ' should come before ' + ids[i]);
  }
  assert.ok(src.indexOf('>Open...</span>') !== -1 || src.indexOf('>Open...</span') !== -1 || /<span>Open\.\.\.<\/span>/.test(src));
  assert.ok(/<span>Export\.\.\.<\/span>/.test(src));
  assert.ok(/<span>Delete<\/span>/.test(src));
  assert.ok(src.indexOf('Delete document') === -1);
  assert.ok(src.indexOf('Open .how') === -1);
  assert.ok(src.indexOf('Open .docx / .odt / .txt') === -1);
  assert.ok(src.indexOf('Export DOCX') === -1);
  assert.ok(src.indexOf('id="openFile"') !== -1);
  assert.ok(src.indexOf('accept=".how,.docx,.odt,.txt,') !== -1);
  assert.ok(src.indexOf('id="exportMenu"') !== -1);
  const menu = src.slice(src.indexOf('id="exportMenu"'), src.indexOf('id="exportMenu"') + 1200);
  assert.ok(menu.indexOf('id="exportDocxBtn"') !== -1);
  assert.ok(menu.indexOf('id="exportOdtBtn"') !== -1);
  assert.ok(menu.indexOf('id="exportPdfBtn"') !== -1);
  assert.ok(menu.indexOf('id="exportDocxBtn"') < menu.indexOf('id="exportOdtBtn"'));
  assert.ok(menu.indexOf('id="exportOdtBtn"') < menu.indexOf('id="exportPdfBtn"'));
  assert.ok(/<span>DOCX<\/span>/.test(menu) && /<span>ODT<\/span>/.test(menu) && /<span>PDF<\/span>/.test(menu));
  /* Old buttons and inputs are kept as comments. */
  assert.ok(html.indexOf('<!-- (before DW14) <button type="button" class="file-item" role="menuitem" id="openHowBtn">') !== -1);
  assert.ok(html.indexOf('<!-- (before DW14) <input type="file" id="howFile" accept=".how,application/json" hidden> -->') !== -1);
  assert.ok(html.indexOf('<!-- (before DW14) <button type="button" class="file-item" role="menuitem" id="openDocxBtn">') !== -1);
  assert.ok(html.indexOf('<!-- (before DW14) <title>Writer DW13c</title> -->') !== -1);
  /* (before DW14a) assert.ok(/<title>Writer DW14<\/title>/.test(src)); */
  /* (before DW15) assert.ok(/<title>Writer DW14a?<\/title>/.test(src)); */
  /* (before DW16) assert.ok(/<title>Writer DW1(4|4a|5)<\/title>/.test(src)); */
  /* (before DW17) assert.ok(/<title>Writer DW1(4|4a|5|6)<\/title>/.test(src)); */
  /* (before DW18) assert.ok(/<title>Writer DW1(4|4a|5|6|7)<\/title>/.test(src)); */
  /* (before DW19) assert.ok(/<title>Writer DW1(4|4a|5|6|7|8)<\/title>/.test(src)); */
  /* (before DW22) assert.ok(/<title>Writer DW1(4|4a|5|6|7|8|9)<\/title>/.test(src)); */
  /* (before DW23) assert.ok(/<title>Writer DW(1(4|4a|5|6|7|8|9)|22)<\/title>/.test(src)); */
  /* (before DW24) assert.ok(/<title>Writer DW(1(4|4a|5|6|7|8|9)|22|23)<\/title>/.test(src)); */
  /* (before DW25) assert.ok(/<title>Writer DW(1(4|4a|5|6|7|8|9)|22|23|24)<\/title>/.test(src)); */
  assert.ok(/<title>Writer DW(1(4|4a|5|6|7|8|9)|22|23|24|25)<\/title>/.test(src));
  assert.ok(!/\?v=/.test(html), 'no cache-bust query');
});

test('docs.js and export.js keep the old wiring as comments and bind the new controls', () => {
  const docs = fs.readFileSync(path.join(DIR, 'modules/writer-docs.js'), 'utf8');
  const exp = fs.readFileSync(path.join(DIR, 'modules/writer-export.js'), 'utf8');
  const liveDocs = live(docs);
  const liveExp = live(exp);
  assert.ok(docs.indexOf('(before DW14)') !== -1);
  assert.ok(exp.indexOf('(before DW14)') !== -1);
  assert.ok(liveDocs.indexOf("Writer.ui.onClick('openFileBtn'") !== -1);
  assert.ok(liveDocs.indexOf("getElementById('openFile')") !== -1);
  assert.ok(liveDocs.indexOf('Writer.docs.openPicked') !== -1);
  assert.ok(liveDocs.indexOf("Writer.ui.onClick('openHowBtn'") === -1);
  assert.ok(liveExp.indexOf("Writer.ui.onClick('exportBtn'") !== -1);
  assert.ok(liveExp.indexOf('Writer.export.openChooser') !== -1);
  assert.ok(liveExp.indexOf('Writer.export.closeChooser') !== -1);
  assert.ok(liveExp.indexOf("Writer.ui.onClick('exportDocxBtn'") !== -1);
  assert.ok(liveExp.indexOf("Writer.ui.onClick('exportOdtBtn'") !== -1);
  assert.ok(liveExp.indexOf("Writer.ui.onClick('exportPdfBtn'") !== -1);
  const cfg = fs.readFileSync(path.join(DIR, 'modules/writer-config.js'), 'utf8');
  /* (before DW14a) assert.ok(/release:\s*'DW14'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW15) assert.ok(/release:\s*'DW14a?'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW16) assert.ok(/release:\s*'DW1(4|4a|5)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW17) assert.ok(/release:\s*'DW1(4|4a|5|6)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW18) assert.ok(/release:\s*'DW1(4|4a|5|6|7)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW19) assert.ok(/release:\s*'DW1(4|4a|5|6|7|8)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW22) assert.ok(/release:\s*'DW1(4|4a|5|6|7|8|9)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW23) assert.ok(/release:\s*'DW(1(4|4a|5|6|7|8|9)|22)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW24) assert.ok(/release:\s*'DW(1(4|4a|5|6|7|8|9)|22|23)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW25) assert.ok(/release:\s*'DW(1(4|4a|5|6|7|8|9)|22|23|24)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW(1(4|4a|5|6|7|8|9)|22|23|24|25)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
});
