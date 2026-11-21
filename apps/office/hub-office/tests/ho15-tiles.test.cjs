#!/usr/bin/env node
/* HO15: tiles open on tap; no duplicate Open buttons and no tab-bar +.
 * Run with: node --test apps/office/hub-office/tests/ho15-tiles.test.cjs
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

function fakeEl(tag, id) {
  const classes = new Set();
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: id || '',
    children: [],
    dataset: {},
    attrs: {},
    listeners: {},
    style: {},
    className: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
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
    querySelector() { return null; },
    querySelectorAll() { return []; },
    fire(ev, extra) {
      const e = Object.assign({ key: '', preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} }, extra || {});
      (this.listeners[ev] || []).forEach((fn) => fn(e));
      return e;
    }
  };
  /* renderSuites clears the grid with innerHTML = '' */
  let html = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return html; },
    set(v) { html = v; if (v === '') el.children.length = 0; }
  });
  return el;
}

function all(node, out) {
  out = out || [];
  out.push(node);
  node.children.forEach((c) => all(c, out));
  return out;
}

/* Run the real init() against a small fake page. */
function loadPage() {
  const root = fakeEl('div', 'root');
  const bar = fakeEl('header', 'ho-tab-bar');
  const home = fakeEl('button', 'btn-home');
  const tabsList = fakeEl('div', 'ho-tabs-list');
  const views = fakeEl('div', 'ho-views-container');
  const viewStart = fakeEl('div', 'view-start'); viewStart.className = 'ho-view active';
  const grid = fakeEl('div', 'suites-grid');
  const recent = fakeEl('div', 'recent-list');
  const viewSettings = fakeEl('div', 'view-settings'); viewSettings.className = 'ho-view';
  bar.append(home, tabsList);
  viewStart.append(grid, recent);
  views.append(viewStart, viewSettings);
  root.append(bar, views);
  const hasClass = (n, c) => String(n.className).split(/\s+/).includes(c);
  const doc = {
    readyState: 'complete',
    createElement: (t) => fakeEl(t),
    getElementById: (id) => all(root).find((n) => n.id === id) || null,
    querySelectorAll: (sel) => {
      const cls = String(sel).replace(/^[a-z]*\./, '');
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
    alert: () => {},
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    Promise: Promise
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(DOCNAME_PATH, 'utf8'), context, { filename: 'office-docname.js' });
  vm.runInContext(fs.readFileSync(NEWDOC_PATH, 'utf8'), context, { filename: 'office-newdoc.js' });
  vm.runInContext(fs.readFileSync(SCRIPT_PATH, 'utf8'), context, { filename: 'hub_office.js' });
  return { HO: context.HubOffice, grid, tabsList, root };
}

const ids = (tabs) => JSON.parse(JSON.stringify(tabs.map((t) => t.id)));
const live = (s) => s.replace(/<!--[\s\S]*?-->/g, '');

test('VERSION is HO15 and the page cache tokens match', () => {
  const { HO } = loadPage();
  assert.equal(HO.VERSION, 'HO15');
  const html = live(fs.readFileSync(HTML_PATH, 'utf8'));
  assert.ok(html.includes('content="HO15"'));
  assert.ok(html.includes('hub_office.js?v=HO15'));
  assert.ok(html.includes('hub_office.css?v=HO15'));
  assert.ok(html.includes('<title>Hub Office HO15</title>'));
});

test('six tiles (five suites + Settings), none with an Open button', () => {
  const { grid, root } = loadPage();
  const cards = grid.children;
  assert.deepEqual(cards.map((c) => c.dataset.id), ['writer', 'spreadsheet', 'slides', 'base', 'tables', 'settings']);
  all(root).forEach((n) => {
    assert.ok(!String(n.className).split(/\s+/).includes('ho-btn-new'), 'no .ho-btn-new');
    assert.ok(!String(n.className).split(/\s+/).includes('ho-card-actions'), 'no .ho-card-actions');
  });
  cards.forEach((c) => {
    assert.equal(c.attrs.role, 'button');
    assert.equal(c.tabIndex, 0);
    assert.ok(/^Open /.test(c.attrs['aria-label']), 'aria-label kept: ' + c.attrs['aria-label']);
    assert.ok(!all(c).some((n) => n.tagName === 'BUTTON'), 'no nested button in ' + c.dataset.id);
  });
});

test('no tab-bar + button (#btn-add-tab) in live markup', () => {
  const raw = fs.readFileSync(HTML_PATH, 'utf8');
  assert.ok(!live(raw).includes('id="btn-add-tab"'));
  assert.ok(raw.includes('(before HO15)'), 'old markup is commented with a (before HO15) marker');
  const css = fs.readFileSync(CSS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!css.includes('.ho-tab-add'), '.ho-tab-add rules are commented out');
  assert.ok(!css.includes('.ho-btn-new'), '.ho-btn-new rules are commented out');
  assert.ok(/\.ho-card:active/.test(css), 'tile has a pressed state');
  assert.ok(/\.ho-card:focus-visible/.test(css), 'tile has a focus ring');
  assert.ok(/\.ho-card\s*\{[^}]*cursor:\s*pointer/.test(css), 'tile shows a pointer');
});

test('clicking a suite tile opens that suite in a new tab', () => {
  const { HO, grid } = loadPage();
  const sheet = grid.children.find((c) => c.dataset.id === 'spreadsheet');
  sheet.fire('click');
  const t = HO.openTabs[HO.openTabs.length - 1];
  assert.equal(t.type, 'doc');
  assert.equal(t.appId, 'spreadsheet');
  assert.equal(HO.getActiveTabId(), t.id);
});

test('Enter and Space on a tile open it; other keys do nothing', () => {
  const { HO, grid } = loadPage();
  const writer = grid.children.find((c) => c.dataset.id === 'writer');
  const e1 = writer.fire('keydown', { key: 'Enter' });
  assert.ok(e1.defaultPrevented);
  assert.equal(HO.openTabs.filter((t) => t.type === 'doc' && t.appId === 'writer').length, 1);
  writer.fire('keydown', { key: ' ' });
  assert.equal(HO.openTabs.filter((t) => t.type === 'doc' && t.appId === 'writer').length, 2);
  writer.fire('keydown', { key: 'a' });
  assert.equal(HO.openTabs.filter((t) => t.type === 'doc').length, 2);
});

test('Settings tile opens the single Settings tab (click and Enter)', () => {
  const { HO, grid } = loadPage();
  const s = grid.children.find((c) => c.dataset.id === 'settings');
  s.fire('click');
  assert.equal(HO.getActiveTabId(), 'settings');
  HO.switchTab('start');
  s.fire('keydown', { key: 'Enter' });
  assert.equal(HO.getActiveTabId(), 'settings');
  assert.deepEqual(ids(HO.openTabs), ['start', 'settings']);
});
