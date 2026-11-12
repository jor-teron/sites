#!/usr/bin/env node
/* HO2 smoke tests. Node only: no browser, no Puppeteer, no network.
   node apps/office/shared/tests/ho2.test.cjs
*/
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '../../../..');
var OFFICE = path.join(ROOT, 'apps/office');
var failed = 0;
var passed = 0;
var pending = [];

function test(name, fn) {
  var result;
  try { result = fn(); }
  catch (e) {
    failed++;
    console.error('FAIL', name);
    console.error(e && e.stack || e);
    return;
  }
  if (result && typeof result.then === 'function') {
    pending.push(result.then(function () { passed++; }, function (e) {
      failed++;
      console.error('FAIL', name);
      console.error(e && e.stack || e);
    }));
  } else {
    passed++;
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (ent) {
    var p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  });
  return out;
}

/* Drop comments, then quotes, so (before HO2) lines and "javascript:alert(1)" are not calls. */
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

/* Browser dialog calls. OfficeDialog.confirm( / .prompt( stay, because of the dot. */
var CALL = /(^|[^\w$.])(?:window\s*\.\s*)?(?:alert|confirm|prompt)\s*\(/;

function Node(tag) {
  this.tag = tag || 'div';
  this.className = '';
  this.textContent = '';
  this.children = [];
  this.parentNode = null;
  this.listeners = {};
  this.attributes = {};
  this.style = {};
  this.dataset = {};
  this.hidden = false;
  this.value = '';
  this.type = '';
  this.id = '';
  this.title = '';
  this.spellcheck = true;
}
Node.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
Node.prototype.insertBefore = function (c, ref) {
  c.parentNode = this;
  var i = this.children.indexOf(ref);
  if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
  return c;
};
Node.prototype.removeChild = function (c) {
  var i = this.children.indexOf(c);
  if (i >= 0) this.children.splice(i, 1);
  if (c) c.parentNode = null;
  return c;
};
Node.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
Node.prototype.setAttribute = function (k, v) { this.attributes[k] = String(v); if (k === 'id') this.id = String(v); };
Node.prototype.addEventListener = function (type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); };
Node.prototype.removeEventListener = function (type, fn) {
  var list = this.listeners[type] || [];
  this.listeners[type] = list.filter(function (f) { return f !== fn; });
};
Node.prototype.focus = function () { if (this.ownerDocument) this.ownerDocument.activeElement = this; };
Node.prototype.select = function () {};
Node.prototype.close = function () { this.open = false; };
Node.prototype.showModal = function () { this.open = true; this.modal = true; };
Node.prototype.click = function () { fire(this, 'click', { target: this }); };
Object.defineProperty(Node.prototype, 'firstChild', { get: function () { return this.children[0] || null; } });
Object.defineProperty(Node.prototype, 'lastChild', { get: function () { return this.children[this.children.length - 1] || null; } });
Object.defineProperty(Node.prototype, 'isConnected', { get: function () {
  var n = this;
  while (n) { if (n.tag === 'body') return true; n = n.parentNode; }
  return false;
}});
Object.defineProperty(Node.prototype, 'innerHTML', {
  set: function (v) { this.textContent = String(v == null ? '' : v).replace(/<[^>]+>/g, ''); },
  get: function () { return this.textContent; }
});
Node.prototype.querySelector = function () { return null; };
Node.prototype.contains = function (n) {
  var p = n;
  while (p) { if (p === this) return true; p = p.parentNode; }
  return false;
};

function fire(el, type, extra) {
  var e = extra || {};
  e.preventDefault = e.preventDefault || function () { e.defaultPrevented = true; };
  e.stopPropagation = e.stopPropagation || function () {};
  (el.listeners[type] || []).forEach(function (fn) { fn(e); });
  return e;
}

function walkNodes(n, out) {
  out.push(n);
  (n.children || []).forEach(function (c) { walkNodes(c, out); });
  return out;
}

function makeDocument() {
  var body = new Node('body');
  var doc = {
    body: body,
    activeElement: null,
    listeners: {},
    title: 'Notely',
    createElement: function (tag) {
      var n = new Node(tag);
      n.ownerDocument = doc;
      return n;
    },
    addEventListener: function (type, fn) { (doc.listeners[type] = doc.listeners[type] || []).push(fn); },
    removeEventListener: function (type, fn) {
      doc.listeners[type] = (doc.listeners[type] || []).filter(function (f) { return f !== fn; });
    },
    contains: function (n) { return !!(n && (n === body || n.isConnected || body.contains(n))); },
    getElementById: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; }
  };
  body.ownerDocument = doc;
  return doc;
}

function boot(files, extras) {
  var doc = makeDocument();
  var store = {
    map: Object.create(null),
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(this.map, k) ? this.map[k] : null; },
    setItem: function (k, v) { this.map[k] = String(v); },
    removeItem: function (k) { delete this.map[k]; }
  };
  var ctx = {
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    Promise: Promise,
    Object: Object,
    Array: Array,
    String: String,
    Error: Error,
    JSON: JSON,
    Math: Math,
    Date: Date,
    document: doc,
    localStorage: store,
    location: { origin: 'https://hub.test' },
    indexedDB: extras && extras.indexedDB
  };
  ctx.listeners = {};
  ctx.addEventListener = function (type, fn) { (ctx.listeners[type] = ctx.listeners[type] || []).push(fn); };
  ctx.removeEventListener = function (type, fn) {
    ctx.listeners[type] = (ctx.listeners[type] || []).filter(function (f) { return f !== fn; });
  };
  ctx.window = ctx;
  ctx.top = ctx;
  ctx.parent = ctx;
  ctx.globalThis = ctx;
  if (extras) Object.keys(extras).forEach(function (k) { if (k !== 'indexedDB') ctx[k] = extras[k]; });
  vm.createContext(ctx);
  files.forEach(function (rel) {
    vm.runInContext(read(rel), ctx, { filename: rel });
  });
  ctx.__doc = doc;
  ctx.__store = store;
  return ctx;
}

function cards(ctx) {
  var host = ctx.__doc.body.children.filter(function (n) { return n.className === 'of-notes'; })[0];
  if (!host) return [];
  return host.children.filter(function (n) { return String(n.className).indexOf('of-note') !== -1 && String(n.className).indexOf('of-notes') === -1; });
}

function cardText(card) {
  return walkNodes(card, []).map(function (n) { return n.textContent || ''; }).join(' ');
}

var CHANGED = [
  'apps/office/shared/office-theme.js',
  'apps/office/shared/office-notify.js',
  'apps/office/shared/office-dialog.js',
  'apps/office/shared/office-settings.js',
  /* (before DF25) 'apps/office/draftly/modules/draftly-storage.js', */
  'apps/office/writer/modules/writer-storage.js',
  /* (before DF25) 'apps/office/draftly/modules/draftly-docs.js', */
  'apps/office/writer/modules/writer-docs.js',
  /* (before DF25) 'apps/office/draftly/modules/draftly-settings.js', */
  'apps/office/writer/modules/writer-settings.js',
  /* (before DF25) 'apps/office/draftly/modules/draftly-vendor.js', */
  'apps/office/writer/modules/writer-vendor.js',
  /* (before DF25) 'apps/office/draftly/modules/draftly-pdf.js', */
  'apps/office/writer/modules/writer-pdf.js',
  /* (before DF25) 'apps/office/draftly/modules/draftly-pdfgen.js', */
  'apps/office/writer/modules/writer-pdfgen.js',
  /* (before DF25) 'apps/office/draftly/modules/draftly-export.js', */
  'apps/office/writer/modules/writer-export.js',
  /* (before DF25) 'apps/office/draftly/modules/draftly-merge-ui.js', */
  'apps/office/writer/modules/writer-merge-ui.js',
  'apps/office/base/modules/base-ui.js',
  'apps/office/spreadsheet/spreadsheet_settings.js',
  'apps/office/notely/nl_store.js',
  'apps/office/notely/nl_editor.js',
  'apps/office/notely/nl_handoff.js',
  'apps/office/notely/parked/nl_clear.js',
  'apps/office/notepad/notepad.js',
  'apps/office/paper-scan/paper-scan.js',
  'apps/office/paper-scan/ps_send.js',
  'apps/office/print/print_host.js',
  'apps/office/print/print_scan.js'
];

test('node --check on HO2 JavaScript', function () {
  CHANGED.forEach(function (rel) {
    var r = cp.spawnSync(process.execPath, ['--check', path.join(ROOT, rel)], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, rel + '\n' + (r.stderr || r.stdout));
  });
});

test('no browser alert/confirm/prompt calls remain outside vendor', function () {
  assert.ok(CALL.test(strip(' if (!confirm("x")) return; ')));
  assert.ok(CALL.test(strip('window.confirm("x")')));
  assert.ok(CALL.test(strip('alert("x")')));
  assert.ok(!CALL.test(strip('OfficeDialog.confirm({ message: "x" })')));
  assert.ok(!CALL.test(strip('OfficeDialog.prompt({ label: "x" })')));
  assert.ok(!CALL.test(strip('/* window.confirm("x") */')));
  assert.ok(!CALL.test(strip('var s = "javascript:alert(1)";')));
  var bad = [];
  walk(OFFICE, []).forEach(function (file) {
    if (!/\.js$/.test(file)) return;
    var rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (rel.indexOf('/vendor/') !== -1) return;
    var src = strip(fs.readFileSync(file, 'utf8'));
    if (CALL.test(src)) bad.push(rel);
  });
  assert.deepStrictEqual(bad, []);
});

test('dialog confirm resolves true and false; alert uses showModal', function () {
  var ctx = boot(['apps/office/shared/office-dialog.js']);
  var doc = ctx.__doc;
  function buttons() {
    return walkNodes(doc.body, []).filter(function (n) { return n.tag === 'button'; });
  }
  function dialog() {
    return doc.body.children.filter(function (n) { return n.tag === 'dialog'; })[0];
  }
  function key(name) {
    var e = { key: name, isComposing: false, shiftKey: false, preventDefault: function () {}, stopPropagation: function () {} };
    (doc.listeners.keydown || []).forEach(function (fn) { fn(e); });
  }
  var first = ctx.OfficeDialog.confirm({ title: 'Delete?', message: 'Sure?', danger: true });
  buttons().filter(function (b) { return b.className.indexOf('dlg-ok') !== -1; })[0].click();
  return first.then(function (v) {
    assert.strictEqual(v, true);
  }).then(function () {
    var p = ctx.OfficeDialog.confirm({ title: 'Delete?', message: 'Sure?' });
    var ok = buttons().filter(function (b) { return b.className.indexOf('dlg-ok') !== -1; })[0];
    assert.ok(dialog().modal, 'showModal');
    assert.strictEqual(ok.textContent, 'OK');
    ok.click();
    return p;
  }).then(function (v) {
    assert.strictEqual(v, true);
    var p = ctx.OfficeDialog.confirm({ title: 'Delete?', message: 'Sure?', okLabel: 'Delete', danger: true });
    var cancel = buttons().filter(function (b) { return b.className.indexOf('dlg-cancel') !== -1; })[0];
    var danger = buttons().filter(function (b) { return b.className.indexOf('dlg-danger') !== -1; })[0];
    assert.ok(danger, 'danger style');
    assert.strictEqual(doc.activeElement, cancel);
    cancel.click();
    return p;
  }).then(function (v) {
    assert.strictEqual(v, false);
    var p = ctx.OfficeDialog.confirm({ title: 'T', message: 'M' });
    key('Escape');
    return p;
  }).then(function (v) {
    assert.strictEqual(v, false);
    var p = ctx.OfficeDialog.confirm({ title: 'T', message: 'M' });
    key('Enter');
    return p;
  }).then(function (v) {
    assert.strictEqual(v, true);
    var p = ctx.OfficeDialog.confirm({ title: 'T', message: 'M', danger: true });
    key('Enter');
    return p;
  }).then(function (v) {
    assert.strictEqual(v, false, 'Enter on the focused Cancel cancels');
    var p = ctx.OfficeDialog.alert({ title: 'Paper Scan', message: 'No device is connected.' });
    var dlg = dialog();
    assert.ok(dlg.modal);
    var texts = walkNodes(dlg, []).map(function (n) { return n.textContent; }).join('\n');
    assert.ok(texts.indexOf('No device is connected.') !== -1);
    assert.ok(!buttons().some(function (b) { return b.className.indexOf('dlg-cancel') !== -1; }));
    buttons().filter(function (b) { return b.className.indexOf('dlg-ok') !== -1; })[0].click();
    return p;
  }).then(function (v) {
    assert.strictEqual(v, true);
  });
});

test('autosave error shows one notice until a later save works', function () {
  var ctx = boot(['apps/office/shared/office-notify.js']);
  var quota = new Error('quota');
  quota.name = 'QuotaExceededError';
  ctx.OfficeNotify.saveProblem('notely', quota);
  ctx.OfficeNotify.saveProblem('notely', quota);
  var list = cards(ctx);
  assert.strictEqual(list.length, 1);
  assert.ok(cardText(list[0]).indexOf("Couldn't save — storage full") !== -1);
  var blocked = new Error('denied');
  blocked.name = 'SecurityError';
  ctx.OfficeNotify.saveProblem('draftly', blocked);
  assert.strictEqual(cards(ctx).length, 2);
  assert.ok(cards(ctx).some(function (c) { return cardText(c).indexOf("Couldn't save — storage blocked") !== -1; }));
  ctx.OfficeNotify.saveOk('notely');
  assert.strictEqual(cards(ctx).length, 1);
  ctx.OfficeNotify.saveOk('draftly');
  assert.strictEqual(cards(ctx).length, 0);
});

test('Notely save failure calls the notice and pagehide flushes', function () {
  var ctx = boot([
    'apps/office/shared/office-notify.js',
    'apps/office/notely/notely_config.js',
    'apps/office/notely/nl_store.js',
    'apps/office/notely/nl_editor.js'
  ]);
  var ta = new Node('textarea');
  ta.value = '';
  ta.style = {};
  var status = new Node('span');
  ctx.__doc.getElementById = function (id) { return id === 'text' ? ta : status; };
  ctx.document = ctx.__doc;
  ctx.NL.editor.init();
  var quota = new Error('quota');
  quota.name = 'QuotaExceededError';
  ctx.__store.setItem = function () { throw quota; };
  ta.value = 'notes';
  fire(ta, 'input', {});
  assert.strictEqual(cards(ctx).length, 0, 'debounced');
  fire(ctx, 'pagehide', {});
  assert.strictEqual(cards(ctx).length, 1);
  assert.ok(cardText(cards(ctx)[0]).indexOf("Couldn't save — storage full") !== -1);
  fire(ctx, 'pagehide', {});
  assert.strictEqual(cards(ctx).length, 1, 'one notice per failure');
  ctx.__store.setItem = function (k, v) { ctx.__store.map[k] = String(v); };
  assert.strictEqual(ctx.NL.editor.save(), true);
  assert.strictEqual(cards(ctx).length, 0);
  ta.value = 'kept';
  ctx.__store.map['notely-text'] = '';
  ctx.NL.editor.init();
  assert.strictEqual(ta.value, 'kept', 'empty storage does not wipe restored text');
});

/* (before DF25) test('Draftly autosave failure calls the notice and can retry', function () { */
test('Writer autosave failure calls the notice and can retry', function () {
  var opens = 0;
  /* (before DF25) var ctx = boot(['apps/office/shared/office-notify.js', 'apps/office/draftly/modules/draftly-storage.js'], { */
  var ctx = boot(['apps/office/shared/office-notify.js', 'apps/office/writer/modules/writer-storage.js'], {
    indexedDB: {
      open: function () {
        opens++;
        var req = { error: (function () { var e = new Error('blocked'); e.name = 'SecurityError'; return e; })() };
        setTimeout(function () { if (req.onerror) req.onerror(); }, 0);
        return req;
      }
    }
  });
  /* (before DF25) ctx.Draftly.config = { */
  ctx.Writer.config = {
    dbName: 'draftly', dbVersion: 1, storeName: 'documents', namePrefix: 'Doc_',
    /* (before DF25) storageKeyNonPrint: 'draftly_nonprinting', nonPrintOnValue: '1', nonPrintOffValue: '0' */
    storageKeyNonPrint: 'writer_nonprinting', nonPrintOnValue: '1', nonPrintOffValue: '0'
  };
  /* (before DF25) ctx.Draftly.pages = { combinedHtml: function () { return '<p>Hello</p>'; } }; */
  ctx.Writer.pages = { combinedHtml: function () { return '<p>Hello</p>'; } };
  var input = { value: 'Doc_test' };
  ctx.__doc.getElementById = function (id) { return id === 'fileNameInput' ? input : null; };
  ctx.document = ctx.__doc;
  /* (before DF25) return ctx.Draftly.storage.save().then(function () { */
  return ctx.Writer.storage.save().then(function () {
    throw new Error('save should reject');
  }, function () {
    assert.strictEqual(cards(ctx).length, 1);
    assert.ok(cardText(cards(ctx)[0]).indexOf("Couldn't save — storage blocked") !== -1);
    /* (before DF25) return ctx.Draftly.storage.save(); */
    return ctx.Writer.storage.save();
  }).then(function () { throw new Error('second save should reject'); }, function () {
    assert.ok(opens >= 2, 'failed open is not cached');
    assert.strictEqual(cards(ctx).length, 1);
  });
});

test('Notepad flushes on pagehide and keeps restored text', function () {
  var notepad = require(path.join(OFFICE, 'notepad/notepad.js'));
  var store = {
    map: { 'notepad-text': '' },
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(this.map, k) ? this.map[k] : null; },
    setItem: function (k, v) { this.map[k] = String(v); },
    removeItem: function (k) { delete this.map[k]; }
  };
  var winListeners = {};
  var docListeners = {};
  var textarea = { value: 'restored', listeners: {}, addEventListener: function (t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); } };
  var doc = {
    visibilityState: 'visible',
    addEventListener: function (t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
    createElement: function () { return { click: function () {} }; }
  };
  var win = {
    addEventListener: function (t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); },
    localStorage: store,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  };
  var noted = [];
  var app = notepad.create({
    document: doc,
    window: win,
    localStorage: store,
    textarea: textarea,
    notify: function (err) { noted.push(err); },
    notifyOk: function () { noted.push('ok'); }
  });
  app.bind();
  assert.strictEqual(textarea.value, 'restored');
  store.map['notepad-text'] = 'saved note';
  app.load();
  assert.strictEqual(textarea.value, 'saved note');
  textarea.value = 'typed';
  app.schedule();
  assert.ok(!store.map['notepad-text'] || store.map['notepad-text'] === 'saved note');
  winListeners.pagehide.forEach(function (fn) { fn(); });
  assert.strictEqual(store.map['notepad-text'], 'typed');
  doc.visibilityState = 'hidden';
  textarea.value = 'again';
  app.schedule();
  docListeners.visibilitychange.forEach(function (fn) { fn(); });
  assert.strictEqual(store.map['notepad-text'], 'again');
  store.setItem = function () { var e = new Error('full'); e.name = 'QuotaExceededError'; throw e; };
  textarea.value = 'too big';
  assert.strictEqual(app.save(), false);
  assert.strictEqual(noted[noted.length - 1].name, 'QuotaExceededError');
});

test('Auto theme follows the Hub inside the frame and the system when standalone', function () {
  var ctx = boot(['apps/office/shared/office-theme.js']);
  var dark = false;
  ctx.matchMedia = function () { return { matches: dark, addEventListener: function () {}, addListener: function () {} }; };
  ctx.window.matchMedia = ctx.matchMedia;
  ctx.__store.map['sites-hub.theme'] = 'dark';
  ctx.parent = { location: { origin: 'https://hub.test' } };
  assert.strictEqual(ctx.OfficeTheme.inHub(), true);
  assert.strictEqual(ctx.OfficeTheme.isDark('auto'), true);
  assert.strictEqual(ctx.OfficeTheme.isDark('light'), false);
  assert.strictEqual(ctx.OfficeTheme.isDark('dark'), true);
  ctx.__store.map['sites-hub.theme'] = 'light';
  dark = true;
  assert.strictEqual(ctx.OfficeTheme.isDark('auto'), false, 'Hub light wins over the system');
  ctx.parent = ctx;
  assert.strictEqual(ctx.OfficeTheme.inHub(), false);
  assert.strictEqual(ctx.OfficeTheme.isDark('auto'), true, 'standalone follows prefers-color-scheme');
  dark = false;
  assert.strictEqual(ctx.OfficeTheme.isDark('auto'), false);
  var hits = 0;
  ctx.OfficeTheme.watchHub(function () { hits++; });
  var storage = (ctx.listeners && ctx.listeners.storage) || [];
  var message = (ctx.listeners && ctx.listeners.message) || [];
  assert.ok(storage.length >= 1 && message.length >= 1);
  storage.forEach(function (fn) { fn({ key: 'sites-hub.theme' }); });
  message.forEach(function (fn) { fn({ origin: 'https://hub.test', data: { type: 'hub-prefs' } }); });
  assert.ok(hits >= 2);
});

test('heavy libraries are not script tags on page open', function () {
  function liveScripts(rel) {
    return read(rel).replace(/<!--[\s\S]*?-->/g, '');
  }
  /* (before DF25) var draftly = liveScripts('apps/office/draftly/draftly.html'); */
  var writer = liveScripts('apps/office/writer/writer.html');
  /* (before DF25) assert.ok(!/src="vendor\/jspdf\.umd\.min\.js"/.test(draftly)); */
  assert.ok(!/src="vendor\/jspdf\.umd\.min\.js"/.test(writer));
  /* (before DF25) assert.ok(!/src="vendor\/html2canvas\.min\.js"/.test(draftly)); */
  assert.ok(!/src="vendor\/html2canvas\.min\.js"/.test(writer));
  /* (before DF25) assert.ok(!/src="vendor\/html-docx\.js"/.test(draftly)); */
  assert.ok(!/src="vendor\/html-docx\.js"/.test(writer));
  /* (before DF25) assert.ok(draftly.indexOf('modules/draftly-vendor.js') !== -1); */
  assert.ok(writer.indexOf('modules/writer-vendor.js') !== -1);
  /* (before DF25) var vendor = read('apps/office/draftly/modules/draftly-vendor.js'); */
  var vendor = read('apps/office/writer/modules/writer-vendor.js');
  assert.ok(vendor.indexOf('vendor/jspdf.umd.min.js') !== -1);
  assert.ok(vendor.indexOf('vendor/html2canvas.min.js') !== -1);
  assert.ok(vendor.indexOf('vendor/html-docx.js') !== -1);
  assert.ok(!/src="vendor\/jsQR\.js"/.test(liveScripts('apps/office/paper-scan/paper-scan.html')));
  assert.ok(!/src="vendor\/jsQR\.js"/.test(liveScripts('apps/office/print/print-send.html')));
  assert.ok(read('apps/office/paper-scan/ps_send.js').indexOf('vendor/jsQR.js') !== -1);
  assert.ok(read('apps/office/print/print_scan.js').indexOf('vendor/jsQR.js') !== -1);
});

Promise.all(pending).then(function () {
  console.log(passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
});
