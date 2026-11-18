#!/usr/bin/env node
/* HO8a: office-hubbar.js passes showLabel, kind:'text', and align:'left'.
 * Run with: node --test apps/office/shared/tests/ho8a-hubbar.test.cjs
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '../../../..');
const SCRIPT_PATH = path.join(ROOT, 'apps/office/shared/office-hubbar.js');

test('node --check on office-hubbar.js', () => {
  cp.execFileSync(process.execPath, ['--check', SCRIPT_PATH]);
});

function boot() {
  const messages = [];
  const listeners = [];
  const parent = {
    postMessage: function (data, origin) { messages.push({ data: data, origin: origin }); }
  };
  const ctx = {
    console: console,
    document: { body: { classList: { add: function () {} } } },
    location: { origin: 'https://hub.test' },
    addEventListener: function (type, fn) { listeners.push({ type: type, fn: fn }); },
    messages: messages
  };
  ctx.window = ctx;
  ctx.parent = parent;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SCRIPT_PATH, 'utf8'), ctx, { filename: 'office-hubbar.js' });
  return ctx;
}

function lastBar(ctx) {
  assert.ok(ctx.messages.length, 'expected a hubTitleBar message');
  const msg = ctx.messages[ctx.messages.length - 1];
  assert.equal(msg.origin, 'https://hub.test');
  assert.ok(msg.data && msg.data.hubTitleBar, 'hubTitleBar envelope');
  return JSON.parse(JSON.stringify(msg.data.hubTitleBar));
}

test('set() without the new fields keeps the old shape (no left align, no text kind)', () => {
  const ctx = boot();
  ctx.HubTitleBar.set({
    buttons: [{ id: 'undo', icon: '↩', label: 'Undo', title: 'Undo', enabled: true }],
    tabs: [{ id: 'home', label: 'Home' }],
    activeTab: 'home'
  });
  const m = lastBar(ctx);
  assert.equal(m.op, 'set');
  assert.equal(m.v, 1);
  assert.equal(m.align, undefined);
  assert.equal(m.buttons.length, 1);
  assert.equal(m.buttons[0].id, 'undo');
  assert.equal(m.buttons[0].label, 'Undo');
  assert.equal(m.buttons[0].icon, '↩');
  assert.equal(m.buttons[0].enabled, true);
  assert.equal(m.buttons[0].title, 'Undo');
  assert.equal(m.buttons[0].showLabel, false);
  assert.equal(m.buttons[0].kind, undefined);
  assert.deepEqual(m.tabs, [{ id: 'home', label: 'Home' }]);
  assert.equal(m.activeTab, 'home');
});

test('set() passes showLabel true, kind text, and align left', () => {
  const ctx = boot();
  ctx.HubTitleBar.set({
    buttons: [
      { id: 'home', icon: '🏠', label: 'Home', title: 'Start Page', showLabel: true },
      { id: 'count', kind: 'text', label: '42 words', title: '42 words' }
    ],
    align: 'left'
  });
  const m = lastBar(ctx);
  assert.equal(m.align, 'left');
  assert.equal(m.buttons[0].showLabel, true);
  assert.equal(m.buttons[0].kind, undefined);
  assert.equal(m.buttons[1].kind, 'text');
  assert.equal(m.buttons[1].label, '42 words');
  assert.equal(m.buttons[1].showLabel, false);
});

test('set() does not send align unless it is left, and ignores other kinds', () => {
  const ctx = boot();
  ctx.HubTitleBar.set({
    buttons: [{ id: 'open', label: 'Open', kind: 'button', showLabel: false }],
    align: 'right'
  });
  let m = lastBar(ctx);
  assert.equal(m.align, undefined);
  assert.equal(m.buttons[0].kind, undefined);
  assert.equal(m.buttons[0].showLabel, false);

  ctx.HubTitleBar.set({
    buttons: [{ id: 'open', label: 'Open', kind: 'status' }],
    align: 'centre'
  });
  m = lastBar(ctx);
  assert.equal(m.align, undefined);
  assert.equal(m.buttons[0].kind, undefined);
});

test('update() passes showLabel and kind only when given', () => {
  const ctx = boot();
  ctx.HubTitleBar.update({ buttons: [{ id: 'download', enabled: false }] });
  let m = lastBar(ctx);
  assert.equal(m.op, 'update');
  assert.deepEqual(m.buttons, [{ id: 'download', enabled: false }]);
  assert.equal(m.align, undefined);

  ctx.HubTitleBar.update({
    buttons: [{ id: 'home', showLabel: true, kind: 'text', label: 'Home' }]
  });
  m = lastBar(ctx);
  assert.equal(m.op, 'update');
  assert.equal(m.buttons[0].id, 'home');
  assert.equal(m.buttons[0].showLabel, true);
  assert.equal(m.buttons[0].kind, 'text');
  assert.equal(m.buttons[0].label, 'Home');
  assert.equal(m.buttons[0].enabled, undefined);
});
