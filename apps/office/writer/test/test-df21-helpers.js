/* DF21: Writer writing helpers. Text rules (writer-writetext.js) and, with a
   tiny fake DOM, the screen side (writer-write.js): spell check default and
   apply, focus mode on / off / Esc, and the Read Aloud hand-off.
   Run: node apps/office/writer/test/test-df21-helpers.js
   No browser, no network. */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');

/* (before DW5) var ROOT = path.resolve(__dirname, '../../..'); */
var ROOT = path.resolve(__dirname, '../../../..');
/* (before DF25) var T = require('./modules/draftly-writetext.js'); */
/* (before DW5) var T = require('./modules/writer-writetext.js'); */
var T = require('../modules/writer-writetext.js');
var passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('ok', name); }
  catch (e) { failed++; console.log('FAIL', name, '\n ', e && e.message); }
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

/* ---------- change case ---------- */

test('UPPER and lower', function () {
  assert.strictEqual(T.caseText('Hello World, ok?', 'upper'), 'HELLO WORLD, OK?');
  assert.strictEqual(T.caseText('Hello WORLD', 'lower'), 'hello world');
  assert.strictEqual(T.caseText('straße', 'upper'), 'STRASSE');
  assert.strictEqual(T.caseText('abc', 'nope'), 'abc');
  assert.strictEqual(T.caseText(null, 'upper'), '');
});

test('Title Case: every word, rest lower', function () {
  assert.strictEqual(T.caseText('the QUICK brown fox', 'title'), 'The Quick Brown Fox');
  assert.strictEqual(T.caseText('a tale of two cities', 'title'), 'A Tale Of Two Cities');
  assert.strictEqual(T.caseText('  hello\n\nworld  ', 'title'), '  Hello\n\nWorld  ');
});

test('Title Case: apostrophes, hyphens, digits', function () {
  assert.strictEqual(T.caseText("don't stop o\u2019neil", 'title'), "Don't Stop O\u2019neil");
  assert.strictEqual(T.caseText("'quoted' words", 'title'), "'Quoted' Words");
  assert.strictEqual(T.caseText('well-known 3rd place', 'title'), 'Well-Known 3rd Place');
});

test('Title Case: context from text before the selection', function () {
  assert.strictEqual(T.caseText('LO world', 'title', 'hel'), 'lo World');   /* starts mid-word */
  assert.strictEqual(T.caseText('world', 'title', 'hello '), 'World');
  assert.strictEqual(T.caseText('t go', 'title', "don'"), 't Go');
  assert.strictEqual(T.caseText('t go', 'title', " '"), 'T Go');
});

test('Title Case: non-Latin letters and marks', function () {
  assert.strictEqual(T.caseText('élan vital', 'title'), 'Élan Vital');
  assert.strictEqual(T.caseText('नमस्ते दुनिया', 'title'), 'नमस्ते दुनिया');   /* no case: unchanged */
});

/* ---------- reading time and characters ---------- */

test('reading time: 200 words a minute, rounded up', function () {
  assert.strictEqual(T.WPM, 200);
  assert.strictEqual(T.readMinutes(0), 0);
  assert.strictEqual(T.readMinutes(1), 1);
  assert.strictEqual(T.readMinutes(200), 1);
  assert.strictEqual(T.readMinutes(201), 2);
  assert.strictEqual(T.readMinutes(1000), 5);
  assert.strictEqual(T.readMinutes(-4), 0);
  assert.strictEqual(T.readMinutes('x'), 0);
  assert.strictEqual(T.readLabel(0), '0 min read');
  assert.strictEqual(T.readLabel(450), '3 min read');
});

test('character label', function () {
  assert.strictEqual(T.charLabel(0), '0 characters');
  assert.strictEqual(T.charLabel(1), '1 character');
  assert.strictEqual(T.charLabel(1234567), '12,34,567 characters');
});

/* ---------- plain text for Read Aloud ---------- */

test('plain text from editor blocks', function () {
  var txt = T.plainFromBlocks([
    { text: 'Title', cont: false },
    { text: 'First half of a para\u00a0', cont: false },
    { text: 'and its second half on page 2.', cont: true },
    { text: '\u200b', cont: false },
    { text: '   spaced    out   ', cont: false }
  ]);
  assert.strictEqual(txt, 'Title\n\nFirst half of a para and its second half on page 2.\n\nspaced out');
  assert.strictEqual(T.plainFromBlocks([]), '');
  assert.strictEqual(T.plainFromBlocks([{ text: 'x', cont: true }]), 'x');
});

test('tidy caps at the Read Aloud limit', function () {
  var big = new Array(T.RA_MAX + 50).join('a');
  assert.strictEqual(T.tidy(big).length, T.RA_MAX);
  assert.strictEqual(T.tidy('a\r\n\r\n\r\n\r\nb'), 'a\n\nb');
});

test('Read Aloud hand-off keys match ra_store.js', function () {
  var h = T.raHandoff('Hello there.');
  assert.deepStrictEqual(h.set, { 'readaloud.source': '"text"', 'readaloud.text': '"Hello there."' });
  assert.deepStrictEqual(h.remove, ['readaloud.pos.text']);
  var ra = read('apps/tools/read-aloud/ra_store.js');
  assert.ok(ra.indexOf("var P = 'readaloud.';") !== -1, 'prefix');
  assert.ok(/JSON\.parse\(v\)/.test(ra), 'values are JSON');
  var ui = read('apps/tools/read-aloud/ra_ui.js');
  assert.ok(ui.indexOf("RAStore.get('text')") !== -1 && ui.indexOf("RAStore.get('source')") !== -1, 'Read Aloud reads source and text at start');
  assert.ok(fs.existsSync(path.join(ROOT, 'apps/tools/read-aloud/read-aloud.html')));
  /* (before DF25) assert.ok(fs.existsSync(path.resolve(__dirname, T.RA_PAGE)), 'RA_PAGE resolves from draftly.html'); */
  /* (before DW5) assert.ok(fs.existsSync(path.resolve(__dirname, T.RA_PAGE)), 'RA_PAGE resolves from writer.html'); */
  assert.ok(fs.existsSync(path.resolve(__dirname, '..', T.RA_PAGE)), 'RA_PAGE resolves from writer.html');
  assert.ok(fs.existsSync(path.join(ROOT, T.RA_ENTRY, 'index.html')), 'RA_ENTRY');
});

test('spell check preference default is off', function () {
  assert.strictEqual(T.SPELL_DEFAULT, false);
  assert.strictEqual(T.spellOn(null), false);
  assert.strictEqual(T.spellOn({}), false);
  assert.strictEqual(T.spellOn({ spellcheck: 'yes' }), false);
  assert.strictEqual(T.spellOn({ spellcheck: true }), true);
  /* (before DF25) var st = read('apps/office/draftly/modules/draftly-settings.js'); */
  var st = read('apps/office/writer/modules/writer-settings.js');
  assert.ok(/spellcheck: false/.test(st), 'settings default');
  assert.ok(st.indexOf("key: 'spellcheck', type: 'switch'") !== -1, 'settings switch');
});

/* ---------- screen side with a tiny fake DOM ---------- */

function fakeEl(id, tag) {
  var attrs = {}, cls = {};
  return {
    id: id, tagName: (tag || 'div').toUpperCase(), hidden: true, spellcheck: false, listeners: {},
    classList: {
      toggle: function (c, on) { if (on === undefined) on = !cls[c]; if (on) cls[c] = 1; else delete cls[c]; return on; },
      contains: function (c) { return !!cls[c]; },
      add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; }
    },
    setAttribute: function (k, v) { attrs[k] = String(v); },
    getAttribute: function (k) { return attrs[k] == null ? null : attrs[k]; },
    addEventListener: function (t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    click: function () {}, remove: function () {}
  };
}
function boot(opts) {
  opts = opts || {};
  var els = {};
  ['spellBtn', 'focusBtn', 'focusExitBtn', 'readAloudBtn', 'focusBar', 'statusChars', 'statusRead',
    'focusUndoBtn', 'focusRedoBtn', 'focusSaveBtn'].forEach(function (id) { els[id] = fakeEl(id, 'button'); });
  var editorsList = [fakeEl('ed1'), fakeEl('ed2')];
  var body = fakeEl('body', 'body');
  var store = {}, winL = {}, opened = [], toasts = [], tabs = [], quick = [];
  var doc = {
    body: body,
    getElementById: function (id) { return els[id] || null; },
    querySelectorAll: function (q) { return q === '.editor' ? editorsList : []; },
    querySelector: function (q) { return opts.busy ? {} : null; },
    createElement: function () { var a = fakeEl('a', 'a'); a.click = function () { opened.push(['tab', a.href]); }; return a; },
    contains: function () { return true; }
  };
  body.appendChild = function () {};
  var settings = { s: { spellcheck: !!opts.spell }, panel: {}, set: function (k, v) { this.s[k] = v; W().applySpell(); } };
  var win = {
    /* (before DF25) document: doc, location: { href: 'http://x/apps/office/draftly/draftly.html', protocol: 'http:', origin: 'http://x' }, */
    document: doc, location: { href: 'http://x/apps/office/writer/writer.html', protocol: 'http:', origin: 'http://x' },
    localStorage: { setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; }, getItem: function (k) { return store[k] == null ? null : store[k]; } },
    addEventListener: function (t, fn, cap) { (winL[t] = winL[t] || []).push(fn); },
    getSelection: function () { return { rangeCount: 0, isCollapsed: true }; },
    OfficeQuick: { refresh: function () {}, run: function (id) { quick.push(id); } },
    URL: URL, console: console, Promise: Promise, JSON: JSON, Object: Object, Array: Array
  };
  win.window = win;
  if (opts.hub) { win.top = { __hubOpenApp: function (m) { opened.push(['hub', m]); return true; } }; win.parent = win.top; }
  else { win.top = win; win.parent = win; }
  /* (before DF25) win.Draftly = { */
  win.Writer = {
    config: { editorClass: 'editor' },
    settings: settings,
    ui: {
      showToast: function (m) { toasts.push(m); },
      onClick: function (id, fn) { if (els[id]) els[id].addEventListener('click', fn); }
    },
    editor: { isInEditor: function () { return false; }, focusEditor: function () {} },
    view: { closePops: function () {}, fit: function () {} },
    ribbon: { isFileOpen: function () { return false; }, setFile: function () {}, selectTab: function (n) { tabs.push(n); } },
    find: { blocks: function () { return opts.blocks || []; }, last: { words: 401, chars: 2300 } },
    app: { ready: true },
    how: { autosave: function () { opened.push(['save']); return Promise.resolve({ ok: true }); } }
  };
  /* (before DF25) function W() { return win.Draftly.write; } */
  function W() { return win.Writer.write; }
  var ctx = vm.createContext(win);
  /* (before DF25) vm.runInContext(read('apps/office/draftly/modules/draftly-writetext.js'), ctx, { filename: 'draftly-writetext.js' }); */
  vm.runInContext(read('apps/office/writer/modules/writer-writetext.js'), ctx, { filename: 'writer-writetext.js' });
  /* (before DF25) vm.runInContext(read('apps/office/draftly/modules/draftly-write.js'), ctx, { filename: 'draftly-write.js' }); */
  vm.runInContext(read('apps/office/writer/modules/writer-write.js'), ctx, { filename: 'writer-write.js' });
  return { win: win, els: els, eds: editorsList, body: body, store: store, winL: winL, opened: opened, toasts: toasts, tabs: tabs, quick: quick, W: W() };
}
function key(b, k) {
  var ev = { key: k, defaultPrevented: false, preventDefault: function () { this.defaultPrevented = true; } };
  (b.winL.keydown || []).forEach(function (fn) { fn(ev); });
  return ev;
}
function click(b, id) { (b.els[id].listeners.click || []).forEach(function (fn) { fn({ preventDefault: function () {} }); }); }

test('spell check: off by default on every editor, toggle turns it on', function () {
  var b = boot();
  b.eds.forEach(function (e) { assert.strictEqual(e.spellcheck, false); assert.strictEqual(e.getAttribute('spellcheck'), 'false'); });
  assert.strictEqual(b.els.spellBtn.getAttribute('aria-pressed'), 'false');
  click(b, 'spellBtn');
  b.eds.forEach(function (e) { assert.strictEqual(e.spellcheck, true); assert.strictEqual(e.getAttribute('spellcheck'), 'true'); });
  assert.strictEqual(b.els.spellBtn.getAttribute('aria-pressed'), 'true');
  /* (before DF25) assert.strictEqual(b.win.Draftly.settings.s.spellcheck, true); */
  assert.strictEqual(b.win.Writer.settings.s.spellcheck, true);
});

test('status bar shows characters and reading time at start', function () {
  var b = boot();
  assert.strictEqual(b.els.statusChars.textContent, '2,300 characters');
  assert.strictEqual(b.els.statusRead.textContent, '3 min read');
});

test('focus mode: class, bar, Esc and tab switch restore the chrome', function () {
  var b = boot();
  click(b, 'focusBtn');
  assert.ok(b.body.classList.contains('df-focus'));
  assert.strictEqual(b.els.focusBar.hidden, false);
  assert.strictEqual(b.els.focusBtn.getAttribute('aria-pressed'), 'true');
  var ev = key(b, 'Escape');
  assert.ok(ev.defaultPrevented);
  assert.ok(!b.body.classList.contains('df-focus'));
  assert.strictEqual(b.els.focusBar.hidden, true);
  assert.ok(!key(b, 'Escape').defaultPrevented, 'Esc does nothing when focus is off');
  b.W.setFocus(true);
  /* (before DF25) b.win.Draftly.ribbon.selectTab('home'); */
  b.win.Writer.ribbon.selectTab('home');
  assert.ok(!b.body.classList.contains('df-focus'), 'tab switch exits');
  assert.deepStrictEqual(b.tabs, ['home']);
  b.W.setFocus(true);
  click(b, 'focusExitBtn');
  assert.ok(!b.body.classList.contains('df-focus'), 'Exit button');
  b.W.setFocus(true);
  click(b, 'focusSaveBtn'); click(b, 'focusUndoBtn');
  assert.deepStrictEqual(b.quick, ['save', 'undo']);
});

test('focus mode: Esc is left to an open menu / find bar / dialog', function () {
  var b = boot({ busy: true });
  b.W.setFocus(true);
  assert.ok(!key(b, 'Escape').defaultPrevented);
  assert.ok(b.body.classList.contains('df-focus'));
});

var asyncTests = [];
asyncTests.push(['read aloud: in the Hub saves first, then __hubOpenApp', function () {
  var b = boot({ hub: true, blocks: [{ text: 'Hi.', cont: false }] });
  b.store['readaloud.pos.text'] = '{"i":4}';
  return b.W.readAloud().then(function (how) {
    assert.strictEqual(how, 'hub');
    assert.deepStrictEqual(b.opened, [['save'], ['hub', 'apps/tools/read-aloud/']]);
    assert.ok(!('readaloud.pos.text' in b.store), 'position reset');
  });
}]);
asyncTests.push(['read aloud: empty document does nothing', function () {
  var b = boot();
  return b.W.readAloud().then(function (r) {
    assert.strictEqual(r, false);
    assert.deepStrictEqual(b.opened, []);
    assert.ok(!('readaloud.text' in b.store));
    assert.ok(b.toasts.indexOf('Nothing to read yet') !== -1);
  });
}]);
asyncTests.push(['read aloud: document text, standalone opens a new tab', function () {
  var b = boot({ blocks: [{ text: 'Hello.', cont: false }, { text: 'World.', cont: false }] });
  return b.W.readAloud().then(function (how) {
    assert.strictEqual(how, 'tab');
    assert.strictEqual(b.store['readaloud.source'], '"text"');
    assert.strictEqual(JSON.parse(b.store['readaloud.text']), 'Hello.\n\nWorld.');
    assert.deepStrictEqual(b.opened, [['tab', 'http://x/apps/tools/read-aloud/read-aloud.html']]);
  });
}]);

test('html wiring: Review tab, status items, scripts, title', function () {
  /* (before DF25) var html = read('apps/office/draftly/draftly.html'); */
  var html = read('apps/office/writer/writer.html');
  ['id="tabReview"', 'id="panelReview"', 'id="spellBtn"', 'data-case="upper"', 'data-case="lower"', 'data-case="title"',
    'id="focusBtn"', 'id="readAloudBtn"', 'id="statusChars"', 'id="statusRead"', 'id="focusBar"', 'id="focusExitBtn"',
    /* (before DF25) 'src="modules/draftly-writetext.js"', 'src="modules/draftly-write.js"', 'href="ui/write.css"', '<title>Writer DF21</title>'] */
    'src="modules/writer-writetext.js"', 'src="modules/writer-write.js"', 'href="ui/write.css"', '<title>Writer DF25</title>']
    .forEach(function (s) { assert.ok(html.indexOf(s) !== -1, s); });
  /* (before DF25) assert.ok(html.indexOf('draftly-writetext.js') < html.indexOf('draftly-write.js"')); */
  assert.ok(html.indexOf('writer-writetext.js') < html.indexOf('writer-write.js"'));
  /* (before DF25) assert.ok(html.indexOf('draftly-write.js"') < html.indexOf('draftly-app.js')); */
  assert.ok(html.indexOf('writer-write.js"') < html.indexOf('writer-app.js'));
  assert.ok(!/\?v=/.test(html), 'no ?v=');
  /* (before DF25) var hub = read('apps/office/draftly/modules/draftly-hub.js'); */
  var hub = read('apps/office/writer/modules/writer-hub.js');
  assert.ok(hub.indexOf("{ id: 'review', label: 'Review' }") !== -1);
  /* (before DF25) var src = read('apps/office/draftly/modules/draftly-write.js').replace(/\/\*[\s\S]*?\*\//g, ''); */
  var src = read('apps/office/writer/modules/writer-write.js').replace(/\/\*[\s\S]*?\*\//g, '');
  /* (before DF25) assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(src.replace(/Draftly\.dialog\.\w+|OfficeDialog\.\w+/g, '')), 'no browser dialogs'); */
  assert.ok(!/\b(alert|confirm|prompt)\s*\(/.test(src.replace(/Writer\.dialog\.\w+|OfficeDialog\.\w+/g, '')), 'no browser dialogs');
});

(async function () {
  for (var i = 0; i < asyncTests.length; i++) {
    try { await asyncTests[i][1](); passed++; console.log('ok', asyncTests[i][0]); }
    catch (e) { failed++; console.log('FAIL', asyncTests[i][0], '\n ', e && e.message); }
  }
  console.log(passed + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
})();
