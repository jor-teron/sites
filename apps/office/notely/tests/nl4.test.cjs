#!/usr/bin/env node
/* NL4 smoke tests. Node only: stubbed window/parent, no browser, no network.
   node apps/office/notely/tests/nl4.test.cjs
*/
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '../../../..');
var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok', name);
  } catch (e) {
    failed++;
    console.error('FAIL', name);
    console.error(e && e.stack || e);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function boot(inFrame) {
  var messages = [];
  var listeners = [];
  var classList = {
    list: [],
    add: function (c) { if (this.list.indexOf(c) < 0) this.list.push(c); },
    contains: function (c) { return this.list.indexOf(c) !== -1; }
  };
  var buttons = {
    'btn-open': { id: 'btn-open', hidden: false, disabled: false },
    'btn-download': { id: 'btn-download', hidden: false, disabled: false },
    status: { id: 'status', hidden: false, disabled: false }
  };
  var calls = [];
  var parent = {
    postMessage: function (data, origin) { messages.push({ data: data, origin: origin }); }
  };
  var ctx = {
    console: console,
    document: {
      body: { classList: classList },
      getElementById: function (id) { return buttons[id] || null; }
    },
    location: { origin: 'https://hub.test' },
    addEventListener: function (type, fn) { listeners.push({ type: type, fn: fn }); },
    messages: messages,
    buttons: buttons,
    calls: calls,
    classList: classList,
    NL: {
      files: {
        open: function () { calls.push('open'); },
        download: function () { calls.push('download'); }
      }
    },
    dispatch: function (data, origin, source) {
      var ev = { data: data, origin: origin == null ? 'https://hub.test' : origin, source: source || parent };
      listeners.forEach(function (l) { if (l.type === 'message') l.fn(ev); });
    }
  };
  ctx.window = ctx;
  ctx.parent = inFrame ? parent : ctx;
  if (!inFrame) ctx.postMessage = parent.postMessage;
  vm.createContext(ctx);
  vm.runInContext(read('apps/office/shared/office-hubbar.js'), ctx, { filename: 'office-hubbar.js' });
  vm.runInContext(read('apps/office/notely/nl_hubbar.js'), ctx, { filename: 'nl_hubbar.js' });
  ctx.NL.hubbar.init();
  return ctx;
}

function plain(v) { return JSON.parse(JSON.stringify(v)); }

function bar(ctx) {
  assert.ok(ctx.messages.length, 'expected a hubTitleBar message');
  var msg = ctx.messages[ctx.messages.length - 1];
  assert.strictEqual(msg.origin, 'https://hub.test');
  assert.ok(msg.data && msg.data.hubTitleBar, 'hubTitleBar envelope');
  return plain(msg.data.hubTitleBar);
}

test('node --check on NL4 JavaScript', function () {
  ['apps/office/notely/nl_hubbar.js', 'apps/office/notely/nl_main.js'].forEach(function (rel) {
    var r = cp.spawnSync(process.execPath, ['--check', path.join(ROOT, rel)], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, rel + '\n' + (r.stderr || r.stdout));
  });
});

test('inside a frame, hello sends Open and Download via set()', function () {
  var ctx = boot(true);
  assert.strictEqual(ctx.messages.length, 0, 'nothing before hello');
  assert.strictEqual(ctx.buttons['btn-open'].hidden, false);
  assert.strictEqual(ctx.buttons['btn-download'].hidden, false);
  ctx.dispatch({ hubTitleBarHello: { v: 1 } });
  var m = bar(ctx);
  assert.strictEqual(m.op, 'set');
  assert.strictEqual(m.v, 1);
  assert.ok(Array.isArray(m.buttons));
  assert.ok(m.buttons.length >= 1 && m.buttons.length <= 8);
  assert.deepStrictEqual(m.buttons.map(function (b) { return b.id; }), ['open', 'download']);
  assert.deepStrictEqual(m.buttons.map(function (b) { return b.label; }), ['Open', 'Download']);
  assert.deepStrictEqual(m.buttons.map(function (b) { return b.enabled; }), [true, true]);
  m.buttons.forEach(function (b) {
    assert.ok(b.icon && b.icon.length <= 4, 'text glyph');
    assert.ok(b.label.length <= 24);
    assert.ok(b.title && b.title.length <= 60);
  });
  assert.strictEqual(m.buttons[0].icon, '📂');
  assert.strictEqual(m.buttons[1].icon, '⤓');
  assert.deepStrictEqual(m.tabs, []);
  assert.ok(ctx.HubTitleBar.linked);
  assert.ok(ctx.classList.contains('hub-titlebar'));
  assert.strictEqual(ctx.buttons['btn-open'].hidden, true, 'in-page Open hides');
  assert.strictEqual(ctx.buttons['btn-download'].hidden, true, 'in-page Download hides');
  assert.strictEqual(ctx.buttons.status.hidden, false, 'word count stays');
});

test('hub clicks route to Notely open and download', function () {
  var ctx = boot(true);
  ctx.dispatch({ hubTitleBarHello: { v: 1 } });
  var n = ctx.messages.length;
  ctx.dispatch({ hubTitleBarClick: { v: 1, kind: 'button', id: 'open' } });
  ctx.dispatch({ hubTitleBarClick: { v: 1, kind: 'button', id: 'download' } });
  assert.deepStrictEqual(plain(ctx.calls), ['open', 'download']);
  assert.strictEqual(ctx.messages.length, n, 'enabled did not change');
  ctx.dispatch({ hubTitleBarClick: { v: 1, kind: 'tab', id: 'open' } });
  ctx.dispatch({ hubTitleBarClick: { v: 1, kind: 'button', id: 'bold' } });
  assert.deepStrictEqual(plain(ctx.calls), ['open', 'download']);
});

test('disabled button syncs with update and does not run', function () {
  var ctx = boot(true);
  ctx.dispatch({ hubTitleBarHello: { v: 1 } });
  ctx.buttons['btn-download'].disabled = true;
  ctx.NL.hubbar.sync();
  var m = bar(ctx);
  assert.strictEqual(m.op, 'update');
  assert.deepStrictEqual(m.buttons, [{ id: 'download', enabled: false }]);
  ctx.dispatch({ hubTitleBarClick: { v: 1, kind: 'button', id: 'download' } });
  ctx.dispatch({ hubTitleBarClick: { v: 1, kind: 'button', id: 'open' } });
  assert.deepStrictEqual(plain(ctx.calls), ['open']);
  var n = ctx.messages.length;
  ctx.NL.hubbar.sync();
  assert.strictEqual(ctx.messages.length, n, 'no change, no update');
  ctx.buttons['btn-download'].disabled = false;
  ctx.NL.hubbar.sync();
  m = bar(ctx);
  assert.strictEqual(m.op, 'update');
  assert.deepStrictEqual(m.buttons, [{ id: 'download', enabled: true }]);
  ctx.dispatch({ hubTitleBarClick: { v: 1, kind: 'button', id: 'download' } });
  assert.deepStrictEqual(plain(ctx.calls), ['open', 'download']);
});

test('frame with no hello sends nothing and keeps the toolbar buttons', function () {
  var ctx = boot(true);
  ctx.dispatch({ hubTitleBarHello: { v: 1 } }, 'https://evil.test');
  ctx.dispatch({ hubTitleBarHello: { v: 1 } }, 'https://hub.test', { not: 'parent' });
  ctx.dispatch({ hubTitleBarClick: { v: 1, kind: 'button', id: 'open' } });
  assert.strictEqual(ctx.messages.length, 0);
  assert.strictEqual(ctx.calls.length, 0);
  assert.strictEqual(ctx.HubTitleBar.linked, false);
  assert.strictEqual(ctx.classList.contains('hub-titlebar'), false);
  assert.strictEqual(ctx.buttons['btn-open'].hidden, false);
  assert.strictEqual(ctx.buttons['btn-download'].hidden, false);
  ctx.NL.hubbar.sync();
  assert.strictEqual(ctx.messages.length, 0);
});

test('standalone sends nothing and keeps the toolbar buttons', function () {
  var ctx = boot(false);
  assert.strictEqual(ctx.HubTitleBar.inFrame, false);
  ctx.dispatch({ hubTitleBarHello: { v: 1 } });
  ctx.dispatch({ hubTitleBarClick: { v: 1, kind: 'button', id: 'open' } });
  ctx.NL.hubbar.sync();
  assert.strictEqual(ctx.messages.length, 0);
  assert.strictEqual(ctx.calls.length, 0);
  assert.strictEqual(ctx.HubTitleBar.linked, false);
  assert.strictEqual(ctx.classList.contains('hub-titlebar'), false);
  assert.strictEqual(ctx.buttons['btn-open'].hidden, false);
  assert.strictEqual(ctx.buttons['btn-download'].hidden, false);
  assert.strictEqual(ctx.buttons.status.hidden, false);
});

test('page still has the buttons, shortcuts, and hub-only hide rule', function () {
  var html = read('apps/office/notely/notely.html');
  var css = read('apps/office/notely/notely.css');
  var keys = read('apps/office/notely/nl_keys.js');
  var main = read('apps/office/notely/nl_main.js');
  assert.ok(html.indexOf('id="btn-open"') !== -1);
  assert.ok(html.indexOf('id="btn-download"') !== -1);
  assert.ok(html.indexOf('../shared/office-hubbar.js') !== -1);
  assert.ok(html.indexOf('nl_hubbar.js') !== -1);
  assert.ok(css.indexOf('body.hub-titlebar #btn-open') !== -1);
  assert.ok(css.indexOf('body.hub-titlebar #btn-download') !== -1);
  assert.ok(keys.indexOf('NL.files.download()') !== -1);
  assert.ok(keys.indexOf('NL.files.open()') !== -1);
  assert.ok(main.indexOf('NL.hubbar') !== -1);
  assert.ok(main.indexOf("on('btn-open'") !== -1);
  assert.ok(main.indexOf("on('btn-download'") !== -1);
});

if (failed) {
  console.error(failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log(passed + ' passed');
