#!/usr/bin/env node
/* HO10: Hub Office relays the active document's title-bar buttons.
 * Run with: node --test apps/office/hub-office/tests/ho10-titlebar.test.cjs
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '../../../..');
const SCRIPT_PATH = path.join(ROOT, 'apps/office/hub-office/hub_office.js');
const QUICK_CSS = path.join(ROOT, 'apps/office/shared/office-quick.css');

test('node --check on hub_office.js', () => {
  cp.execFileSync(process.execPath, ['--check', SCRIPT_PATH]);
});

function loadScript() {
  const code = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const context = {
    window: {},
    document: {
      readyState: 'complete',
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    location: { href: 'https://hub.test/apps/office/hub-office/hub_office.html', origin: 'https://hub.test' },
    URL: URL,
    localStorage: { getItem: () => null, setItem: () => {} },
    addEventListener: () => {},
    alert: () => {}
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.HubOffice;
}

function home(HO) {
  return HO.homeTitleBarButton();
}

function quickButtons(extra) {
  const base = [
    { id: 'undo', label: 'Undo', icon: '↶', enabled: false, title: 'Undo (Ctrl+Z)' },
    { id: 'redo', label: 'Redo', icon: '↷', enabled: false, title: 'Redo (Ctrl+Y)' },
    { id: 'save', label: 'Save', icon: '💾', enabled: true, title: 'Save (Ctrl+S)' },
    { id: 'print', label: 'Print', icon: '🖨', enabled: true, title: 'Print (Ctrl+P)' }
  ];
  return extra ? base.concat(extra) : base;
}

function writerTabs() {
  return [
    { id: 'file', label: 'File' },
    { id: 'home', label: 'Home' },
    { id: 'insert', label: 'Insert' },
    { id: 'page', label: 'Page' }
  ];
}

test('prefix and unprefix use d: and reject unprefixed ids', () => {
  const HO = loadScript();
  assert.equal(HO.TITLE_BAR_PREFIX, 'd:');
  assert.equal(HO.TITLE_BAR_MAX, 8);
  assert.equal(HO.prefixTitleBarId('undo'), 'd:undo');
  assert.equal(HO.unprefixTitleBarId('d:undo'), 'undo');
  assert.equal(HO.unprefixTitleBarId('d:file'), 'file');
  assert.equal(HO.unprefixTitleBarId('home'), null);
  assert.equal(HO.unprefixTitleBarId('undo'), null);
  assert.equal(HO.unprefixTitleBarId(''), null);
});

test('fileButtonFromTabs promotes only the File tab', () => {
  const HO = loadScript();
  const file = HO.fileButtonFromTabs(writerTabs());
  assert.equal(file.id, 'file');
  assert.equal(file.label, 'File');
  assert.equal(file.showLabel, true);
  assert.equal(file.enabled, true);
  assert.equal(HO.fileButtonFromTabs([{ id: 'home', label: 'Home' }]), null);
  assert.equal(HO.fileButtonFromTabs([]), null);
  assert.equal(HO.fileButtonFromTabs(null), null);
});

test('composeTitleBarButtons on the Start Page is Home only', () => {
  const HO = loadScript();
  const buttons = HO.composeTitleBarButtons(home(HO), null, HO.TITLE_BAR_MAX);
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].id, 'home');
  assert.equal(buttons[0].showLabel, true);
  assert.deepEqual(HO.composeTitleBarButtons(home(HO), undefined), buttons);
});

test('composeTitleBarButtons prefixes quick buttons and File, and drops ribbon tabs', () => {
  const HO = loadScript();
  const state = { buttons: quickButtons(), tabs: writerTabs() };
  const buttons = HO.composeTitleBarButtons(home(HO), state, HO.TITLE_BAR_MAX);
  const ids = JSON.parse(JSON.stringify(buttons.map((b) => b.id)));
  assert.deepEqual(ids, ['home', 'd:undo', 'd:redo', 'd:save', 'd:print', 'd:file']);
  assert.equal(buttons[0].showLabel, true);
  const file = buttons[buttons.length - 1];
  assert.equal(file.label, 'File');
  assert.equal(file.showLabel, true);
  assert.ok(!ids.includes('d:home') && !ids.includes('d:insert') && !ids.includes('d:page'),
    'ribbon tabs other than File are not relayed');
});

test('composeTitleBarButtons caps at 8 including Home and does not duplicate File', () => {
  const HO = loadScript();
  const many = [];
  for (let i = 0; i < 10; i++) many.push({ id: 'b' + i, label: 'B' + i, enabled: true });
  let buttons = HO.composeTitleBarButtons(home(HO), { buttons: many, tabs: writerTabs() }, 8);
  assert.equal(buttons.length, 8);
  assert.equal(buttons[0].id, 'home');
  assert.ok(buttons.every((b, i) => i === 0 || String(b.id).indexOf('d:') === 0));

  const already = quickButtons([{ id: 'file', label: 'File', icon: '📁', enabled: true }]);
  buttons = HO.composeTitleBarButtons(home(HO), { buttons: already, tabs: writerTabs() }, 8);
  const fileIds = buttons.filter((b) => b.id === 'd:file');
  assert.equal(fileIds.length, 1);
});

test('applyButtonPatch merges by id and leaves other buttons alone', () => {
  const HO = loadScript();
  const next = HO.applyButtonPatch(quickButtons(), [{ id: 'undo', enabled: true }, { id: 'save', label: '✓ Saved' }]);
  assert.equal(next[0].enabled, true);
  assert.equal(next[0].label, 'Undo');
  assert.equal(next[2].label, '✓ Saved');
  assert.equal(next[1].enabled, false);
  const added = HO.applyButtonPatch([], [{ id: 'open', label: 'Open', enabled: true }]);
  assert.equal(added.length, 1);
  assert.equal(added[0].id, 'open');
});

test('planTitleBarRelay stores inactive updates, publishes set for the active doc, and updates without flicker', () => {
  const HO = loadScript();
  const bodySet = { op: 'set', buttons: quickButtons(), tabs: writerTabs() };

  const inactive = HO.planTitleBarRelay(null, bodySet, false, home(HO), 8);
  assert.equal(inactive.publish, null);
  assert.equal(inactive.state.buttons.length, 4);
  assert.equal(inactive.state.clickKinds.file, 'tab');
  assert.equal(inactive.state.clickKinds.undo, 'button');

  const active = HO.planTitleBarRelay(null, bodySet, true, home(HO), 8);
  assert.equal(active.publish, 'set');
  assert.deepEqual(JSON.parse(JSON.stringify(active.buttons.map((b) => b.id))), ['home', 'd:undo', 'd:redo', 'd:save', 'd:print', 'd:file']);

  const patched = HO.planTitleBarRelay(active.state, { op: 'update', buttons: [{ id: 'undo', enabled: true }] }, true, home(HO), 8);
  assert.equal(patched.publish, 'update');
  assert.deepEqual(JSON.parse(JSON.stringify(patched.updateButtons)), [{ id: 'd:undo', enabled: true }]);
  assert.equal(patched.state.buttons[0].enabled, true);

  const ignored = HO.planTitleBarRelay(active.state, { op: 'update', buttons: [{ id: 'undo', enabled: true }] }, false, home(HO), 8);
  assert.equal(ignored.publish, null);
  assert.equal(ignored.state.buttons[0].enabled, true);

  const cleared = HO.planTitleBarRelay(active.state, { op: 'clear' }, true, home(HO), 8);
  assert.equal(cleared.publish, 'set');
  assert.equal(cleared.state, null);
  assert.deepEqual(JSON.parse(JSON.stringify(cleared.buttons.map((b) => b.id))), ['home']);

  const clearedBg = HO.planTitleBarRelay(active.state, { op: 'clear' }, false, home(HO), 8);
  assert.equal(clearedBg.publish, null);
  assert.equal(clearedBg.state, null);
});

test('clickKindForRelay sends File as a tab and the rest as buttons', () => {
  const HO = loadScript();
  const state = HO.planTitleBarRelay(null, {
    op: 'set', buttons: quickButtons(), tabs: writerTabs()
  }, false, home(HO), 8).state;
  assert.equal(HO.clickKindForRelay(state, 'undo'), 'button');
  assert.equal(HO.clickKindForRelay(state, 'save'), 'button');
  assert.equal(HO.clickKindForRelay(state, 'file'), 'tab');
  assert.equal(HO.clickKindForRelay(null, 'undo'), 'button');
});

test('office-quick.css hides the in-app File button only in title-bar mode', () => {
  const css = fs.readFileSync(QUICK_CSS, 'utf8');
  assert.ok(css.includes('body.hub-titlebar .of-quick'), 'quick row still hides after hello');
  assert.ok(css.includes('body.hub-titlebar .of-file-btn'), 'shared File button hides after hello');
  assert.ok(css.includes('body.hub-titlebar #fileBtn'), "Writer's File button hides after hello");
  assert.ok(!/body\.hub-titlebar[^{]*\.of-tab/.test(css) && !/body\.hub-titlebar[^{]*\.of-tabs/.test(css),
    'ribbon tabs are not hidden by this rule');
});
