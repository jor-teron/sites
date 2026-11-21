#!/usr/bin/env node
/* HO14: closing a document never jumps to Settings; Home leaves Settings open.
 * Run with: node --test apps/office/hub-office/tests/ho14-tabs.test.cjs
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

/* Fake element with a working classList, so active states can be read. */
function fakeEl(tag, id) {
  const classes = new Set();
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: id || '',
    children: [],
    dataset: {},
    attrs: {},
    listeners: {},
    className: '',
    textContent: '',
    innerHTML: '',
    parent: null,
    classList: {
      toggle(c, on) { if (on === undefined) on = !classes.has(c); if (on) classes.add(c); else classes.delete(c); return on; },
      add(c) { classes.add(c); },
      remove(c) { classes.delete(c); },
      contains(c) { return classes.has(c) || String(el.className).split(/\s+/).includes(c); }
    },
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
    },
    querySelector() { return null; }
  };
  return el;
}

function all(node, out) {
  out = out || [];
  out.push(node);
  node.children.forEach((c) => all(c, out));
  return out;
}

function loadWithDom() {
  const root = fakeEl('div', 'root');
  const bar = fakeEl('header', 'ho-tab-bar');
  const home = fakeEl('button', 'btn-home');
  const tabsList = fakeEl('div', 'ho-tabs-list');
  const views = fakeEl('div', 'ho-views-container');
  const viewStart = fakeEl('div', 'view-start'); viewStart.className = 'ho-view';
  const viewSettings = fakeEl('div', 'view-settings'); viewSettings.className = 'ho-view';
  bar.append(home, tabsList);
  views.append(viewStart, viewSettings);
  root.append(bar, views);
  const hasClass = (n, c) => String(n.className).split(/\s+/).includes(c);
  const doc = {
    readyState: 'loading', /* skip init(); call functions directly */
    createElement: (t) => fakeEl(t),
    getElementById: (id) => all(root).find((n) => n.id === id) || null,
    querySelectorAll: (sel) => {
      const cls = String(sel).replace(/^\./, '');
      return all(root).filter((n) => hasClass(n, cls));
    },
    addEventListener: () => {}
  };
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
  return { HO: context.HubOffice, doc, home, viewStart, viewSettings };
}

function load() { return loadWithDom().HO; }

const T = (id, type) => ({ id: id, type: type });
const ids = (tabs) => JSON.parse(JSON.stringify(tabs.map((t) => t.id)));

test('VERSION is HO14 and the page cache tokens match', () => {
  const HO = load();
  assert.equal(HO.VERSION, 'HO14');
  const html = fs.readFileSync(HTML_PATH, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(html.includes('content="HO14"'));
  assert.ok(html.includes('hub_office.js?v=HO14'));
  assert.ok(html.includes('hub_office.css?v=HO14'));
  assert.ok(html.includes('<title>Hub Office HO14</title>'));
});

test('nextTabAfterClose: [start, settings, doc-1] close doc-1 -> start', () => {
  const HO = load();
  const tabs = [T('start', 'start'), T('settings', 'settings'), T('doc-1', 'doc')];
  assert.equal(HO.nextTabAfterClose(tabs, 'doc-1'), 'start');
});

test('nextTabAfterClose: [start, settings, doc-1, doc-2] close doc-2 -> doc-1, close doc-1 -> start', () => {
  const HO = load();
  const tabs = [T('start', 'start'), T('settings', 'settings'), T('doc-1', 'doc'), T('doc-2', 'doc')];
  assert.equal(HO.nextTabAfterClose(tabs, 'doc-2'), 'doc-1');
  assert.equal(HO.nextTabAfterClose(tabs, 'doc-1'), 'start', 'no document on the left');
});

test('nextTabAfterClose: [start, doc-1, doc-2] close doc-1 -> start', () => {
  const HO = load();
  const tabs = [T('start', 'start'), T('doc-1', 'doc'), T('doc-2', 'doc')];
  assert.equal(HO.nextTabAfterClose(tabs, 'doc-1'), 'start');
  assert.equal(HO.nextTabAfterClose(tabs, 'doc-2'), 'doc-1');
});

test('nextTabAfterClose: closing Settings -> start', () => {
  const HO = load();
  assert.equal(HO.nextTabAfterClose([T('start', 'start'), T('settings', 'settings')], 'settings'), 'start');
  assert.equal(HO.nextTabAfterClose([T('start', 'start'), T('settings', 'settings'), T('doc-1', 'doc')], 'settings'), 'start');
});

test('nextTabAfterClose never returns settings for a closed document', () => {
  const HO = load();
  const tabs = [T('start', 'start'), T('settings', 'settings'), T('doc-1', 'doc'), T('doc-2', 'doc'), T('doc-3', 'doc')];
  ['doc-1', 'doc-2', 'doc-3'].forEach((id) => {
    assert.notEqual(HO.nextTabAfterClose(tabs, id), 'settings', id);
  });
  assert.equal(HO.nextTabAfterClose(tabs, 'doc-3'), 'doc-2');
  assert.equal(HO.nextTabAfterClose(tabs, 'missing'), 'start');
  assert.equal(HO.nextTabAfterClose(null, 'doc-1'), 'start');
});

test('closeTab on the first document after Settings goes Home, not Settings', () => {
  const HO = load();
  HO.openSettingsTab();
  const d1 = HO.createDocTab('writer');
  assert.deepEqual(ids(HO.openTabs), ['start', 'settings', d1.id]);
  HO.closeTab(d1.id);
  assert.equal(HO.getActiveTabId(), 'start');
  assert.deepEqual(ids(HO.openTabs), ['start', 'settings'], 'Settings stays open');
});

test('Home after opening Settings: Home active, Settings kept but not active', () => {
  const { HO, doc, home, viewStart, viewSettings } = loadWithDom();
  HO.openSettingsTab();
  const settingsBtn = doc.getElementById('tab-btn-settings');
  assert.ok(settingsBtn, 'Settings tab button exists');
  settingsBtn.className = 'ho-tab ho-tab-settings';
  assert.equal(HO.getActiveTabId(), 'settings');
  assert.ok(viewSettings.classList.contains('active'));

  HO.switchTab('start'); /* what both Home buttons call */
  assert.equal(HO.getActiveTabId(), 'start');
  assert.ok(ids(HO.openTabs).includes('settings'), 'Settings remains in openTabs');
  assert.ok(viewStart.classList.contains('active'), '#view-start is active');
  assert.ok(!viewSettings.classList.contains('active'), '#view-settings is not active');
  assert.ok(!settingsBtn.classList.contains('active'), 'Settings tab is not active');
  assert.equal(settingsBtn.attrs['aria-selected'], 'false');
  assert.ok(doc.getElementById('tab-btn-settings'), 'Settings tab button is still in the strip');
  assert.equal(home.attrs['aria-pressed'], 'true', 'Home button is pressed');
  assert.ok(home.classList.contains('active'), 'Home button is active');
});
