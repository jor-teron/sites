#!/usr/bin/env node
/* HO13: Settings tile, a single Settings tab right after Home, Close button.
 * Run with: node --test apps/office/hub-office/tests/ho13-settings.test.cjs
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '../../../..');
const SCRIPT_PATH = path.join(ROOT, 'apps/office/hub-office/hub_office.js');
const DOCNAME_PATH = path.join(ROOT, 'apps/office/shared/office-docname.js');
const NEWDOC_PATH = path.join(ROOT, 'apps/office/shared/office-newdoc.js');
const HTML_PATH = path.join(ROOT, 'apps/office/hub-office/hub_office.html');
const CSS_PATH = path.join(ROOT, 'apps/office/hub-office/hub_office.css');

/* Tiny fake DOM: enough for createDocTab / openSettingsTab / closeTab. */
function fakeEl(tag) {
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    children: [],
    dataset: {},
    attrs: {},
    listeners: {},
    id: '',
    className: '',
    textContent: '',
    innerHTML: '',
    parent: null,
    classList: { toggle() {}, add() {}, remove() {} },
    get firstChild() { return this.children[0] || null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    appendChild(c) { c.parent = this; this.children.push(c); return c; },
    append(...cs) { cs.forEach((c) => this.appendChild(c)); },
    insertBefore(c, ref) {
      c.parent = this;
      const i = this.children.indexOf(ref);
      if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
      return c;
    },
    remove() {
      if (this.parent) {
        const i = this.parent.children.indexOf(this);
        if (i >= 0) this.parent.children.splice(i, 1);
      }
      this.removed = true;
    },
    querySelector() { return null; },
    click() { (this.listeners.click || []).forEach((fn) => fn({ stopPropagation() {}, preventDefault() {} })); }
  };
  return el;
}

function loadScript(withDom) {
  let doc = {
    readyState: 'complete',
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {}
  };
  let tabsList = null;
  let views = null;
  let settingsView = null;
  if (withDom) {
    tabsList = fakeEl('div'); tabsList.id = 'ho-tabs-list';
    views = fakeEl('div'); views.id = 'ho-views-container';
    settingsView = fakeEl('div'); settingsView.id = 'view-settings';
    views.appendChild(settingsView);
    const find = (node, id) => {
      if (node.id === id) return node;
      for (const c of node.children) { const r = find(c, id); if (r) return r; }
      return null;
    };
    doc = {
      readyState: 'loading', /* skip init(); only the functions are used */
      createElement: (t) => fakeEl(t),
      getElementById: (id) => find(tabsList, id) || find(views, id),
      querySelectorAll: () => [],
      addEventListener: () => {}
    };
  }
  const context = {
    document: doc,
    location: { href: 'https://hub.test/apps/office/hub-office/hub_office.html', origin: 'https://hub.test' },
    URL: URL,
    localStorage: { getItem: () => null, setItem: () => {} },
    addEventListener: () => {},
    alert: () => {}
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(DOCNAME_PATH, 'utf8'), context, { filename: 'office-docname.js' });
  vm.runInContext(fs.readFileSync(NEWDOC_PATH, 'utf8'), context, { filename: 'office-newdoc.js' });
  vm.runInContext(fs.readFileSync(SCRIPT_PATH, 'utf8'), context, { filename: 'hub_office.js' });
  return { HO: context.HubOffice, tabsList, views, settingsView };
}

const ids = (tabs) => JSON.parse(JSON.stringify(tabs.map((t) => t.id)));
const live = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

test('settingsTabInsertIndex puts Settings right after Home', () => {
  const { HO } = loadScript();
  assert.equal(HO.SETTINGS_TAB_ID, 'settings');
  assert.equal(HO.settingsTabInsertIndex([{ id: 'start' }]), 1);
  assert.equal(HO.settingsTabInsertIndex([{ id: 'start' }, { id: 'doc-1' }, { id: 'doc-2' }]), 1);
  assert.equal(HO.settingsTabInsertIndex([]), 0);
  assert.equal(HO.settingsTabInsertIndex(null), 0);
  assert.equal(HO.settingsTabInsertIndex([{ id: 'doc-1' }]), 0);
});

test('planOpenSettings creates once, then only switches', () => {
  const { HO } = loadScript();
  const p1 = HO.planOpenSettings([{ id: 'start' }, { id: 'doc-1', type: 'doc' }]);
  assert.equal(p1.action, 'create');
  assert.equal(p1.index, 1);
  assert.equal(p1.id, 'settings');
  const p2 = HO.planOpenSettings([{ id: 'start' }, { id: 'settings', type: 'settings' }, { id: 'doc-1', type: 'doc' }]);
  assert.equal(p2.action, 'switch');
  assert.equal(p2.index, 1);
  assert.equal(HO.planOpenSettings(undefined).action, 'create');
});

test('nextTabAfterClose: Settings goes Home, documents keep the old rule', () => {
  const { HO } = loadScript();
  const tabs = [{ id: 'start' }, { id: 'settings' }, { id: 'doc-1' }, { id: 'doc-2' }];
  assert.equal(HO.nextTabAfterClose(tabs, 'settings'), 'start');
  assert.equal(HO.nextTabAfterClose([{ id: 'start' }, { id: 'settings' }], 'settings'), 'start');
  assert.equal(HO.nextTabAfterClose(tabs, 'doc-2'), 'doc-1');
  /* (before HO14) assert.equal(HO.nextTabAfterClose(tabs, 'doc-1'), 'settings'); */
  assert.equal(HO.nextTabAfterClose(tabs, 'doc-1'), 'start', 'HO14: a closed document never lands on Settings');
  assert.equal(HO.nextTabAfterClose([{ id: 'start' }, { id: 'doc-1' }], 'doc-1'), 'start');
  assert.equal(HO.nextTabAfterClose([{ id: 'start' }, { id: 'doc-1' }, { id: 'doc-2' }], 'doc-1'), 'start');
  assert.equal(HO.nextTabAfterClose(tabs, 'missing'), 'start');
  assert.equal(HO.nextTabAfterClose([], 'doc-1'), 'start');
});

test('shouldShowTabBar shows the row for Settings as well as documents', () => {
  const { HO } = loadScript();
  assert.equal(HO.shouldShowTabBar([{ id: 'start', type: 'start' }]), false);
  assert.equal(HO.shouldShowTabBar([{ id: 'start', type: 'start' }, { id: 'settings', type: 'settings' }]), true);
  assert.equal(HO.shouldShowTabBar([{ id: 'start', type: 'start' }, { id: 'doc-1', type: 'doc' }]), true);
});

test('isDocTabActive is false for Home and Settings (title bar shows Home only)', () => {
  const { HO } = loadScript();
  const tabs = [{ id: 'start', type: 'start' }, { id: 'settings', type: 'settings' }, { id: 'doc-1', type: 'doc' }];
  assert.equal(HO.isDocTabActive(tabs, 'start'), false);
  assert.equal(HO.isDocTabActive(tabs, 'settings'), false);
  assert.equal(HO.isDocTabActive(tabs, 'doc-1'), true);
  assert.equal(HO.isDocTabActive(tabs, 'doc-9'), false);
  assert.equal(HO.isDocTabActive(tabs, ''), false);
  /* With no document state, compose gives Home alone. */
  const btns = HO.composeTitleBarButtons(HO.homeTitleBarButton(), null, HO.TITLE_BAR_MAX);
  assert.equal(btns.length, 1);
  assert.equal(btns[0].id, 'home');
});

test('openSettingsTab: one tab, right after Home, before documents; close returns Home', () => {
  const { HO } = loadScript();
  const d1 = HO.createDocTab('writer');
  const d2 = HO.createDocTab('spreadsheet');
  const s = HO.openSettingsTab();
  assert.equal(s.type, 'settings');
  assert.equal(s.title, 'Settings');
  assert.deepEqual(ids(HO.openTabs), ['start', 'settings', d1.id, d2.id]);
  assert.equal(HO.getActiveTabId(), 'settings');

  HO.switchTab(d2.id);
  HO.openSettingsTab();
  assert.deepEqual(ids(HO.openTabs), ['start', 'settings', d1.id, d2.id], 'no second Settings tab');
  assert.equal(HO.getActiveTabId(), 'settings');

  HO.closeSettingsTab();
  assert.deepEqual(ids(HO.openTabs), ['start', d1.id, d2.id]);
  assert.equal(HO.getActiveTabId(), 'start');

  /* Documents opened after Settings still go after it. */
  HO.openSettingsTab();
  const d3 = HO.createDocTab('writer');
  assert.deepEqual(ids(HO.openTabs), ['start', 'settings', d1.id, d2.id, d3.id]);
  HO.closeTab(d3.id);
  assert.equal(HO.getActiveTabId(), d2.id, 'closing a document still goes to the tab before it');
  HO.closeTab('settings');
  assert.equal(HO.getActiveTabId(), d2.id, 'closing Settings in the background keeps the document active');
});

test('openSettingsTab DOM: tab button is first in the strip, view is kept on close', () => {
  const { HO, tabsList, views, settingsView } = loadScript(true);
  const d1 = HO.createDocTab('writer');
  assert.equal(tabsList.children.length, 1);
  HO.openSettingsTab();
  assert.equal(tabsList.children.length, 2);
  const btn = tabsList.children[0];
  assert.equal(btn.id, 'tab-btn-settings');
  assert.equal(btn.attrs.role, 'tab');
  assert.equal(settingsView.attrs['aria-labelledby'], 'tab-btn-settings');
  const close = btn.children.find((c) => c.className === 'ho-tab-close');
  assert.ok(close, 'Settings tab has the usual ✕');
  assert.equal(close.attrs['aria-label'], 'Close Settings');

  HO.openSettingsTab();
  assert.equal(tabsList.children.length, 2, 'still one Settings tab button');

  close.click();
  assert.equal(HO.getActiveTabId(), 'start');
  assert.ok(!tabsList.children.includes(btn), 'tab button removed');
  assert.ok(views.children.includes(settingsView), 'static Settings view stays in the page');
  assert.equal(tabsList.children[0].id, 'tab-btn-' + d1.id);

  HO.openSettingsTab();
  assert.equal(tabsList.children[0].id, 'tab-btn-settings', 'reopens in the first slot');
});

test('Settings tile is not a suite (no formats, routing or recents)', () => {
  const { HO } = loadScript();
  const suiteIds = JSON.parse(JSON.stringify(HO.SUITES.map((s) => s.id)));
  assert.ok(!suiteIds.includes('settings'));
  assert.ok(!HO.FORMAT_TABLE.some((r) => r.id === 'settings'));
  assert.equal(HO.routeByFilename('x.settings'), null);
  const js = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const render = js.slice(js.indexOf('function renderSuites()'), js.indexOf('async function renderRecents()'));
  assert.ok(render.indexOf('renderSettingsTile(grid)') > render.indexOf('SUITES.forEach'), 'tile is drawn after the suite cards');
  assert.ok(render.includes("'⚙️'"), 'gear icon');
  assert.ok(render.includes("e.key === 'Enter' || e.key === ' '"), 'Enter / Space open it');
});

test('HTML: Settings page holds every setting, with Close; Start Page has none live', () => {
  const raw = fs.readFileSync(HTML_PATH, 'utf8');
  const html = live(raw);
  assert.ok(raw.includes('(before HO13)'), 'old markup is commented with a (before HO13) marker');
  /* (before HO14) assert.ok(html.includes('content="HO13"') && html.includes('hub_office.js?v=HO13') && html.includes('hub_office.css?v=HO13')); */
  assert.ok(html.includes('content="HO14"') && html.includes('hub_office.js?v=HO14') && html.includes('hub_office.css?v=HO14'));
  const startAt = html.indexOf('id="view-start"');
  const settingsAt = html.indexOf('id="view-settings"');
  assert.ok(startAt > 0 && settingsAt > startAt, 'Settings view exists after the Start Page');
  const startBlock = html.slice(startAt, settingsAt);
  assert.ok(!startBlock.includes('id="ho-settings"'), 'no live settings on the Start Page');
  const view = html.slice(settingsAt);
  assert.ok(/role="tabpanel"/.test(html.slice(settingsAt - 80, settingsAt + 80)), 'Settings view is a tabpanel');
  assert.ok(view.includes('>Settings</h1>'), 'Settings heading');
  assert.ok(view.includes('id="btn-settings-close"'), 'Close button');
  assert.ok(view.includes('Close</span>'), 'Close is labelled');
  ['ho-settings', 'set-font', 'set-font-size', 'set-paper', 'set-units', 'set-date-format',
    'set-number-locale', 'set-autosave', 'set-save-location', 'set-author'].forEach((id) => {
    const n = html.split('id="' + id + '"').length - 1;
    assert.equal(n, 1, '#' + id + ' appears once, live');
    assert.ok(view.includes('id="' + id + '"'), '#' + id + ' is on the Settings page');
  });
  assert.ok(view.includes("Defaults for new documents. Each app's own settings still win."), 'note moved too');
});

test('CSS styles the Settings page and tile', () => {
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  assert.ok(css.includes('.ho-settings-page'));
  assert.ok(css.includes('.ho-settings-close'));
  assert.ok(css.includes('.ho-card-emoji'));
});
