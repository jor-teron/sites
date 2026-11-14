#!/usr/bin/env node
/* NL5 smoke tests. Node only: stubbed window/parent, no browser, no network.
   node apps/office/notely/tests/nl5.test.cjs
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
  var statusClass = {
    list: [],
    add: function (c) { if (this.list.indexOf(c) < 0) this.list.push(c); },
    remove: function (c) { this.list = this.list.filter(function (x) { return x !== c; }); },
    contains: function (c) { return this.list.indexOf(c) !== -1; }
  };
  var buttons = {
    'btn-open': { id: 'btn-open', hidden: false, disabled: false },
    'btn-download': { id: 'btn-download', hidden: false, disabled: false },
    bar: { id: 'bar', hidden: false },
    status: {
      id: 'status',
      hidden: false,
      disabled: false,
      textContent: '0 words · 0 characters',
      dataset: {},
      classList: statusClass
    }
  };
  var calls = [];
  var parent = {
    postMessage: function (data, origin) { messages.push({ data: data, origin: origin }); }
  };
  var ctx = {
    console: console,
    document: {
      body: { classList: classList },
      getElementById: function (id) { return buttons[id] || null; },
      querySelector: function (sel) { return sel === '.bar' ? buttons.bar : null; }
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

test('node --check on NL5 JavaScript', function () {
  ['apps/office/notely/nl_hubbar.js', 'apps/office/notely/nl_main.js', 'apps/office/notely/nl_editor.js'].forEach(function (rel) {
    var r = cp.spawnSync(process.execPath, ['--check', path.join(ROOT, rel)], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, rel + '\n' + (r.stderr || r.stdout));
  });
});

test('fitLabel keeps short counts and shortens long ones to 24 characters', function () {
  var ctx = boot(false);
  var fit = ctx.NL.hubbar.fitLabel;
  assert.strictEqual(fit('0 words · 0 characters'), '0 words · 0 characters');
  assert.strictEqual(fit('1 word · 1 character'), '1 word · 1 character');
  assert.strictEqual(fit('12 words · 45 characters'), '12 words · 45 characters');
  assert.strictEqual(fit('100 words · 500 characters'), '100 words · 500 chars');
  assert.strictEqual(fit('9999 words · 99999 characters'), '9999 words · 99999 chars');
  var compact = fit('10000 words · 100000 characters');
  assert.ok(compact.length <= 24, compact);
  assert.strictEqual(compact, '10000 w · 100000 ch');
  var longMsg = 'That does not look like a text file.';
  assert.strictEqual(fit(longMsg), longMsg.slice(0, 24));
  assert.strictEqual(fit(longMsg).length, 24);
});

test('title bar order is Word count, Open, Download', function () {
  var ctx = boot(true);
  ctx.dispatch({ hubTitleBarHello: { v: 1 } });
  var m = bar(ctx);
  assert.strictEqual(m.op, 'set');
  assert.deepStrictEqual(m.buttons.map(function (b) { return b.id; }), ['count', 'open', 'download']);
  assert.deepStrictEqual(m.buttons.map(function (b) { return b.label; }), ['0 words · 0 characters', 'Open', 'Download']);
  assert.strictEqual(m.buttons[0].enabled, false);
  assert.strictEqual(m.buttons[0].icon, '');
  assert.strictEqual(m.buttons[0].title, '0 words · 0 characters');
  assert.strictEqual(m.buttons[1].enabled, true);
  assert.strictEqual(m.buttons[2].enabled, true);
});

test('hide rule: in-page .bar is hidden inside the Hub, kept standalone', function () {
  var css = read('apps/office/notely/notely.css');
  assert.ok(/body\.hub-titlebar \.bar\s*\{\s*display:\s*none/.test(css), 'CSS hides .bar in the Hub');
  var ctx = boot(true);
  ctx.dispatch({ hubTitleBarHello: { v: 1 } });
  assert.strictEqual(ctx.buttons.bar.hidden, true);
  assert.ok(ctx.classList.contains('hub-titlebar'));
  var alone = boot(false);
  alone.dispatch({ hubTitleBarHello: { v: 1 } });
  assert.strictEqual(alone.buttons.bar.hidden, false);
  assert.strictEqual(alone.buttons['btn-open'].hidden, false);
  assert.strictEqual(alone.buttons['btn-download'].hidden, false);
  assert.strictEqual(alone.messages.length, 0);
});

test('count label updates with the in-page status text', function () {
  var ctx = boot(true);
  ctx.dispatch({ hubTitleBarHello: { v: 1 } });
  ctx.buttons.status.textContent = '12 words · 45 characters';
  ctx.NL.hubbar.sync();
  var m = bar(ctx);
  assert.strictEqual(m.op, 'update');
  assert.deepStrictEqual(m.buttons, [{
    id: 'count',
    label: '12 words · 45 characters',
    title: '12 words · 45 characters'
  }]);
  ctx.buttons.status.textContent = '100 words · 500 characters';
  ctx.NL.hubbar.sync();
  m = bar(ctx);
  assert.strictEqual(m.buttons[0].id, 'count');
  assert.strictEqual(m.buttons[0].label, '100 words · 500 chars');
  assert.strictEqual(m.buttons[0].title, '100 words · 500 characters');
  assert.ok(m.buttons[0].label.length <= 24);
});

test('flash message uses the count slot, then the count returns', function () {
  var ctx = boot(true);
  ctx.dispatch({ hubTitleBarHello: { v: 1 } });
  ctx.buttons.status.dataset.msg = 'Opened notes.txt';
  ctx.buttons.status.classList.add('flash');
  ctx.NL.hubbar.sync();
  var m = bar(ctx);
  assert.strictEqual(m.buttons[0].id, 'count');
  assert.strictEqual(m.buttons[0].label, 'Opened notes.txt');
  assert.strictEqual(m.buttons[0].title, 'Opened notes.txt');
  ctx.buttons.status.classList.remove('flash');
  delete ctx.buttons.status.dataset.msg;
  ctx.NL.hubbar.sync();
  m = bar(ctx);
  assert.strictEqual(m.buttons[0].label, '0 words · 0 characters');
});

test('a click on the count button does nothing', function () {
  var ctx = boot(true);
  ctx.dispatch({ hubTitleBarHello: { v: 1 } });
  var n = ctx.messages.length;
  ctx.dispatch({ hubTitleBarClick: { v: 1, kind: 'button', id: 'count' } });
  assert.deepStrictEqual(plain(ctx.calls), []);
  assert.strictEqual(ctx.messages.length, n);
});

if (failed) {
  console.error(failed + ' failed, ' + passed + ' passed');
  process.exit(1);
}
console.log(passed + ' passed');
