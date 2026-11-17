#!/usr/bin/env node
/* Hub Office Start Center tests.
 * Run with: node --test apps/office/hub-office/tests/hub_office.test.cjs
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

test('node --check on hub_office.js', () => {
  cp.execFileSync(process.execPath, ['--check', SCRIPT_PATH]);
});

function loadScript(customWindow = {}) {
  const code = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const context = {
    window: customWindow,
    document: customWindow.document || {
      readyState: 'complete',
      getElementById: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    location: { href: 'https://hub.test/apps/office/hub-office/hub_office.html', origin: 'https://hub.test' },
    URL: URL,
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    },
    addEventListener: () => {},
    alert: () => {},
    ...customWindow
  };
  context.window = context;
  context.globalThis = context;
  if (!context.addEventListener) context.addEventListener = () => {};
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.HubOffice;
}

test('SUITES definitions cover all 5 office applications with clean action labels', () => {
  const HO = loadScript();
  assert.ok(HO, 'HubOffice exported');
  assert.equal(HO.SUITES.length, 5);

  const ids = JSON.parse(JSON.stringify(HO.SUITES.map((s) => s.id)));
  assert.deepEqual(ids, ['writer', 'spreadsheet', 'slides', 'base', 'tables']);

  HO.SUITES.forEach((suite) => {
    assert.ok(suite.name, 'suite has name');
    assert.ok(suite.url, 'suite has url');
    assert.ok(suite.icon, 'suite has icon');
    assert.ok(suite.btnLabel, 'suite has clean button label');
    assert.ok(Array.isArray(suite.formats) && suite.formats.length > 0, 'suite has formats');
  });

  const slides = HO.SUITES.find((s) => s.id === 'slides');
  assert.equal(slides.name, 'Presentation');
  assert.equal(slides.btnLabel, 'Open Presentation');
  assert.deepEqual(JSON.parse(JSON.stringify(slides.formats)), ['.hop', '.hslides', '.pptx']);

  const base = HO.SUITES.find((s) => s.id === 'base');
  assert.deepEqual(JSON.parse(JSON.stringify(base.formats)), ['.hob', 'Tables', 'Forms', 'Queries']);
});

test('EXT_MAP routes all expected extensions to matching suites', () => {
  const HO = loadScript();
  assert.equal(HO.EXT_MAP.how, 'writer');
  assert.equal(HO.EXT_MAP.docx, 'writer');
  assert.equal(HO.EXT_MAP.odt, 'writer');
  assert.equal(HO.EXT_MAP.txt, 'writer');
  assert.equal(HO.EXT_MAP.md, 'writer');

  assert.equal(HO.EXT_MAP.hos, 'spreadsheet');
  assert.equal(HO.EXT_MAP.xlsx, 'spreadsheet');
  assert.equal(HO.EXT_MAP.csv, 'spreadsheet');

  assert.equal(HO.EXT_MAP.hop, 'slides');
  assert.equal(HO.EXT_MAP.hslides, 'slides');
  assert.equal(HO.EXT_MAP.pptx, 'slides');

  assert.equal(HO.EXT_MAP.hot, 'tables');

  assert.equal(HO.EXT_MAP.hob, 'base');
  assert.equal(HO.EXT_MAP.hbase, 'base');
  assert.equal(HO.EXT_MAP.db, 'base');
  assert.equal(HO.EXT_MAP.base, 'base');
});

test('getExt extracts lowercase extension', () => {
  const HO = loadScript();
  assert.equal(HO.getExt('Report.HOW'), 'how');
  assert.equal(HO.getExt('budget.2026.hos'), 'hos');
  assert.equal(HO.getExt('talk.hop'), 'hop');
  assert.equal(HO.getExt('presentation.hslides'), 'hslides');
  assert.equal(HO.getExt('inventory.HOT'), 'hot');
  assert.equal(HO.getExt('backup.hob'), 'hob');
  assert.equal(HO.getExt('old.hbase'), 'hbase');
  assert.equal(HO.getExt('noext'), '');
});

test('Persistent Start Page tab is initialized by default', () => {
  const HO = loadScript();
  assert.equal(HO.openTabs.length, 1);
  assert.equal(HO.openTabs[0].id, 'start');
  assert.equal(HO.openTabs[0].title, 'Start Page');
  assert.equal(HO.getActiveTabId(), 'start');
});

test('createDocTab opens new tab and switches active view', () => {
  const HO = loadScript();
  const tab = HO.createDocTab('writer', { title: 'Draft Notes' });

  assert.ok(tab);
  assert.equal(tab.title, 'Draft Notes');
  assert.equal(tab.appId, 'writer');
  assert.equal(tab.url, '../writer/');
  assert.equal(HO.openTabs.length, 2);
  assert.equal(HO.getActiveTabId(), tab.id);

  // Switch back to start page
  HO.switchTab('start');
  assert.equal(HO.getActiveTabId(), 'start');

  // Switch back to writer tab
  HO.switchTab(tab.id);
  assert.equal(HO.getActiveTabId(), tab.id);
});

test('closeTab closes document tab and refuses to close Start tab', () => {
  const HO = loadScript();
  const tab1 = HO.createDocTab('writer');
  const tab2 = HO.createDocTab('spreadsheet');
  assert.equal(HO.openTabs.length, 3);
  assert.equal(HO.getActiveTabId(), tab2.id);

  // Close tab2 -> should activate previous tab1
  HO.closeTab(tab2.id);
  assert.equal(HO.openTabs.length, 2);
  assert.equal(HO.getActiveTabId(), tab1.id);

  // Close tab1 -> should fallback to 'start'
  HO.closeTab(tab1.id);
  assert.equal(HO.openTabs.length, 1);
  assert.equal(HO.getActiveTabId(), 'start');

  // Attempting to close 'start' tab does nothing (pinned)
  HO.closeTab('start');
  assert.equal(HO.openTabs.length, 1);
  assert.equal(HO.getActiveTabId(), 'start');
});

test('formatTime and formatSize return expected readable strings', () => {
  const HO = loadScript();
  assert.equal(HO.formatSize(500), '500 B');
  assert.equal(HO.formatSize(2048), '2.0 KB');
  assert.equal(HO.formatSize(1048576 * 3.5), '3.5 MB');

  const now = Date.now();
  assert.equal(HO.formatTime(now - 10000), 'Just now');
  assert.equal(HO.formatTime(now - 120000), '2m ago');
  assert.equal(HO.formatTime(now - 3600000 * 2), '2h ago');
});

test('index.html redirects to hub_office.html', () => {
  const html = fs.readFileSync(path.join(ROOT, 'apps/office/hub-office/index.html'), 'utf8');
  assert.ok(html.includes('hub_office.html'), 'contains redirect target hub_office.html');
});
