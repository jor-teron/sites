/* DW14a: Writer File > Open... uses showOpenFilePicker when it is
   available, so Save can write back to a picked .docx / .odt.
   Pure checks (no browser): openMode, openPickerFail, openFromMenu
   routing, and the handle is passed to the existing openers.
   Run: node --test apps/office/writer/test/test-dw14a-open-writeback.cjs */
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

function loadDocs(opts) {
  opts = opts || {};
  const src = fs.readFileSync(path.join(DIR, 'modules/writer-docs.js'), 'utf8');
  const log = [];
  const input = {
    value: 'preset',
    click() { log.push(['input-click', this.value]); }
  };
  const win = opts.window || {};
  const how = {
    openFile(file, dest) { log.push(['how', file && file.name, dest]); }
  };
  if (opts.inHub != null) how.inHub = function inHub() { return !!opts.inHub; };
  win.Writer = {
    ui: { onClick() {}, showToast(m) { log.push(['toast', m]); } },
    how: how,
    docxopen: { open(file, o) { log.push(['docxopen', file && file.name, o]); } }
  };
  const ctx = {
    console,
    window: win,
    document: {
      getElementById(id) { return id === 'openFile' ? input : null; },
      addEventListener() {}
    }
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'writer-docs.js' });
  return { docs: ctx.window.Writer.docs, log, input, win };
}

function handleFor(name) {
  const file = { name: name };
  return {
    name: name,
    getFile() { return Promise.resolve(file); }
  };
}

test('openMode: picker when showOpenFilePicker exists, else input', () => {
  const { docs } = loadDocs();
  assert.equal(typeof docs.openMode, 'function');
  assert.equal(docs.openMode({ showOpenFilePicker: function () {} }), 'picker');
  assert.equal(docs.openMode({}), 'input');
  assert.equal(docs.openMode({ showOpenFilePicker: 'no' }), 'input');
  assert.equal(docs.openMode(null), 'input');
  assert.equal(docs.openMode(undefined), 'input');
});

test('openPickerFail: AbortError is silent; other errors fall back to input', () => {
  const { docs } = loadDocs();
  assert.equal(typeof docs.openPickerFail, 'function');
  assert.equal(docs.openPickerFail({ name: 'AbortError' }), 'silent');
  assert.equal(docs.openPickerFail({ name: 'SecurityError' }), 'input');
  assert.equal(docs.openPickerFail({ name: 'NotAllowedError' }), 'input');
  assert.equal(docs.openPickerFail(new Error('fail')), 'input');
  assert.equal(docs.openPickerFail(null), 'input');
  assert.equal(docs.openPickerFail(undefined), 'input');
});

test('openFromMenu: no picker uses the hidden input, no toast', async () => {
  const { docs, log, win } = loadDocs();
  await docs.openFromMenu(win);
  assert.deepEqual(log, [['input-click', '']]);
});

test('openFromMenu: AbortError is silent — no input click, no toast', async () => {
  const { docs, log, win } = loadDocs({
    window: {
      showOpenFilePicker() { return Promise.reject({ name: 'AbortError', message: 'The user aborted a request.' }); }
    }
  });
  await docs.openFromMenu(win);
  assert.deepEqual(log, []);
});

test('openFromMenu: SecurityError and other errors fall back to the hidden input', async () => {
  const a = loadDocs({
    window: {
      showOpenFilePicker() { return Promise.reject({ name: 'SecurityError', message: 'blocked' }); }
    }
  });
  await a.docs.openFromMenu(a.win);
  assert.deepEqual(a.log, [['input-click', '']]);

  const b = loadDocs({
    window: {
      showOpenFilePicker() { return Promise.reject(new Error('boom')); }
    }
  });
  await b.docs.openFromMenu(b.win);
  assert.deepEqual(b.log, [['input-click', '']]);
});

test('openFromMenu: a picked .docx / .odt / .txt goes to docxopen with the handle', async () => {
  async function pick(name) {
    const h = handleFor(name);
    const { docs, log, win } = loadDocs({
      window: {
        showOpenFilePicker() { return Promise.resolve([h]); }
      }
    });
    await docs.openFromMenu(win);
    return { log, h };
  }
  const docx = await pick('Report.docx');
  assert.deepEqual(docx.log, [['docxopen', 'Report.docx', { handle: docx.h }]]);
  const odt = await pick('Notes.odt');
  assert.deepEqual(odt.log, [['docxopen', 'Notes.odt', { handle: odt.h }]]);
  const txt = await pick('readme.txt');
  assert.deepEqual(txt.log, [['docxopen', 'readme.txt', { handle: txt.h }]]);
});

test('openFromMenu: a picked .how goes to how.openFile with a handle dest', async () => {
  const h = handleFor('Letter.how');
  const { docs, log, win } = loadDocs({
    window: {
      showOpenFilePicker() { return Promise.resolve([h]); }
    }
  });
  await docs.openFromMenu(win);
  assert.deepEqual(log, [['how', 'Letter.how', { kind: 'handle', handle: h, name: 'Letter.how' }]]);
});

test('openFromMenu: in the Hub, skip the picker and use the hidden input', async () => {
  let called = 0;
  const { docs, log, win } = loadDocs({
    inHub: true,
    window: {
      showOpenFilePicker() { called++; return Promise.resolve([handleFor('Report.docx')]); }
    }
  });
  await docs.openFromMenu(win);
  assert.equal(called, 0);
  assert.deepEqual(log, [['input-click', '']]);
});

test('pickTypes covers .how, .docx, .odt and .txt', () => {
  const { docs } = loadDocs();
  const types = docs.pickTypes();
  const accept = types[0].accept;
  const exts = [].concat(...Object.keys(accept).map((k) => accept[k]));
  ['.how', '.docx', '.odt', '.txt'].forEach((ext) => {
    assert.ok(exts.indexOf(ext) !== -1, 'missing ' + ext);
  });
});

test('writer.html title is DW14a; docs.js keeps the old Open... click as a comment', () => {
  const html = fs.readFileSync(path.join(DIR, 'writer.html'), 'utf8');
  const docs = fs.readFileSync(path.join(DIR, 'modules/writer-docs.js'), 'utf8');
  const src = live(html);
  const liveDocs = live(docs);
  /* (before DW15) assert.ok(/<title>Writer DW14a<\/title>/.test(src)); */
  /* (before DW16) assert.ok(/<title>Writer DW1(4a|5)<\/title>/.test(src)); */
  /* (before DW17) assert.ok(/<title>Writer DW1(4a|5|6)<\/title>/.test(src)); */
  /* (before DW18) assert.ok(/<title>Writer DW1(4a|5|6|7)<\/title>/.test(src)); */
  /* (before DW19) assert.ok(/<title>Writer DW1(4a|5|6|7|8)<\/title>/.test(src)); */
  /* (before DW22) assert.ok(/<title>Writer DW1(4a|5|6|7|8|9)<\/title>/.test(src)); */
  assert.ok(/<title>Writer DW(1(4a|5|6|7|8|9)|22)<\/title>/.test(src));
  assert.ok(html.indexOf('<!-- (before DW14a) <title>Writer DW14</title> -->') !== -1);
  assert.ok(docs.indexOf('(before DW14a)') !== -1);
  assert.ok(liveDocs.indexOf('Writer.docs.openFromMenu') !== -1);
  assert.ok(liveDocs.indexOf('Writer.docs.openMode') !== -1);
  assert.ok(liveDocs.indexOf('Writer.docs.openPickerFail') !== -1);
  assert.ok(liveDocs.indexOf('Writer.docs.openPickedHandle') !== -1);
  const cfg = fs.readFileSync(path.join(DIR, 'modules/writer-config.js'), 'utf8');
  /* (before DW15) assert.ok(/release:\s*'DW14a'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW16) assert.ok(/release:\s*'DW1(4a|5)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW17) assert.ok(/release:\s*'DW1(4a|5|6)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW18) assert.ok(/release:\s*'DW1(4a|5|6|7)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW19) assert.ok(/release:\s*'DW1(4a|5|6|7|8)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  /* (before DW22) assert.ok(/release:\s*'DW1(4a|5|6|7|8|9)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, ''))); */
  assert.ok(/release:\s*'DW(1(4a|5|6|7|8|9)|22)'/.test(cfg.replace(/\/\*[\s\S]*?\*\//g, '')));
});
