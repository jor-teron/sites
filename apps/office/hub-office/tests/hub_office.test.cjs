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
const HTML_PATH = path.join(ROOT, 'apps/office/hub-office/hub_office.html');

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

test('VERSION is HO7 and SUITES cover all 5 office applications', () => {
  const HO = loadScript();
  assert.ok(HO, 'HubOffice exported');
  assert.equal(HO.VERSION, 'HO7');
  assert.equal(HO.SUITES.length, 5);

  const ids = JSON.parse(JSON.stringify(HO.SUITES.map((s) => s.id)));
  assert.deepEqual(ids, ['writer', 'spreadsheet', 'slides', 'base', 'tables']);

  HO.SUITES.forEach((suite) => {
    assert.ok(suite.name, 'suite has name');
    assert.ok(suite.url, 'suite has url');
    assert.ok(suite.icon, 'suite has icon');
    assert.ok(suite.desc, 'suite has a short description');
  });

  const slides = HO.SUITES.find((s) => s.id === 'slides');
  assert.equal(slides.name, 'Presentation');
});

test('FORMAT_TABLE lists truthful open, save and export formats', () => {
  const HO = loadScript();
  assert.ok(Array.isArray(HO.FORMAT_TABLE));
  assert.equal(HO.FORMAT_TABLE.length, 5);

  const byId = Object.fromEntries(HO.FORMAT_TABLE.map((row) => [row.id, row]));

  /* (before HO6) Writer formats: ['.how', '.docx', '.odt', '.txt'] — .txt/.md are not opened */
  assert.deepEqual(JSON.parse(JSON.stringify(byId.writer.open)), ['.how', '.docx', '.odt']);
  assert.deepEqual(JSON.parse(JSON.stringify(byId.writer.save)), ['.how']);
  assert.deepEqual(JSON.parse(JSON.stringify(byId.writer.export)), ['.docx', '.odt', '.pdf']);

  /* (before HO6 / SH27) Spreadsheet open included .tsv, which the file picker does not accept */
  assert.deepEqual(JSON.parse(JSON.stringify(byId.spreadsheet.open)), ['.hos', '.xlsx', '.xls', '.ods', '.csv']);
  assert.deepEqual(JSON.parse(JSON.stringify(byId.spreadsheet.save)), ['.hos']);
  assert.deepEqual(JSON.parse(JSON.stringify(byId.spreadsheet.export)), ['.xlsx', '.ods', '.csv']);

  assert.deepEqual(JSON.parse(JSON.stringify(byId.slides.open)), ['.hop', '.hslides', '.pptx', '.odp']);
  assert.deepEqual(JSON.parse(JSON.stringify(byId.slides.save)), ['.hop']);
  /* .pdf added after verifying File → Export PDF */
  assert.deepEqual(JSON.parse(JSON.stringify(byId.slides.export)), ['.pptx', '.odp', '.png', '.pdf']);

  assert.deepEqual(JSON.parse(JSON.stringify(byId.base.open)), ['.hob', '.hbase', '.odb', '.csv', '.tsv', '.txt', '.xlsx', '.xls', '.json', '.sqlite', '.sqlite3', '.db']);
  assert.deepEqual(JSON.parse(JSON.stringify(byId.base.save)), ['.hob']);
  assert.deepEqual(JSON.parse(JSON.stringify(byId.base.export)), ['.odb', '.xlsx', '.csv']);

  assert.deepEqual(JSON.parse(JSON.stringify(byId.tables.open)), ['.hot', '.csv']);
  assert.deepEqual(JSON.parse(JSON.stringify(byId.tables.save)), ['.hot']);
  assert.deepEqual(JSON.parse(JSON.stringify(byId.tables.export)), ['.csv']);
});


test('formatChipGroups builds Open, Save and Export groups and marks native', () => {
  const HO = loadScript();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const writer = HO.FORMAT_TABLE.find((row) => row.id === 'writer');
  const groups = clone(HO.formatChipGroups(writer));
  assert.deepEqual(groups.map((g) => g.label), ['Open', 'Save', 'Export']);
  assert.deepEqual(groups[0].formats, ['.how', '.docx', '.odt']);
  assert.deepEqual(groups[1].formats, ['.how']);
  assert.deepEqual(groups[2].formats, ['.docx', '.odt', '.pdf']);
  groups.forEach((g) => {
    assert.equal(g.native, '.how');
  });

  assert.deepEqual(clone(HO.formatChipGroups({})), []);
  const saveOnly = clone(HO.formatChipGroups({ save: ['.hot'] }));
  assert.equal(saveOnly.length, 1);
  assert.equal(saveOnly[0].label, 'Save');
  assert.equal(saveOnly[0].native, '.hot');
});

test('EXT_MAP routes all expected extensions to matching suites', () => {
  const HO = loadScript();
  assert.equal(HO.EXT_MAP.how, 'writer');
  assert.equal(HO.EXT_MAP.docx, 'writer');
  assert.equal(HO.EXT_MAP.odt, 'writer');

  assert.equal(HO.EXT_MAP.hos, 'spreadsheet');
  assert.equal(HO.EXT_MAP.xlsx, 'spreadsheet');
  assert.equal(HO.EXT_MAP.xls, 'spreadsheet');
  assert.equal(HO.EXT_MAP.ods, 'spreadsheet');
  assert.equal(HO.EXT_MAP.csv, 'spreadsheet');

  assert.equal(HO.EXT_MAP.hop, 'slides');
  assert.equal(HO.EXT_MAP.hslides, 'slides');
  assert.equal(HO.EXT_MAP.pptx, 'slides');
  assert.equal(HO.EXT_MAP.odp, 'slides');
  assert.equal(HO.EXT_MAP.ppt, undefined);

  assert.equal(HO.EXT_MAP.hot, 'tables');

  assert.equal(HO.EXT_MAP.hob, 'base');
  assert.equal(HO.EXT_MAP.hbase, 'base');
  assert.equal(HO.EXT_MAP.odb, 'base');
  assert.equal(HO.EXT_MAP.db, 'base');
  assert.equal(HO.EXT_MAP.sqlite, 'base');
  assert.equal(HO.EXT_MAP.sqlite3, 'base');
  assert.equal(HO.EXT_MAP.json, 'base');
  assert.equal(HO.EXT_MAP.tsv, 'base');
  assert.equal(HO.EXT_MAP.txt, 'base');
  assert.equal(HO.EXT_MAP.md, undefined);
});

test('routeByFilename maps known names and rejects unknown extensions', () => {
  const HO = loadScript();
  assert.equal(HO.routeByFilename('Letter.odt'), 'writer');
  assert.equal(HO.routeByFilename('Sales.ods'), 'spreadsheet');
  assert.equal(HO.routeByFilename('Talk.odp'), 'slides');
  assert.equal(HO.routeByFilename('Contacts.odb'), 'base');
  assert.equal(HO.routeByFilename('Notes.how'), 'writer');
  assert.equal(HO.routeByFilename('budget.HOS'), 'spreadsheet');
  assert.equal(HO.routeByFilename('deck.ppt'), null);
  assert.equal(HO.routeByFilename('readme.md'), null);
  assert.equal(HO.routeByFilename('noext'), null);
});

test('EXT_MAP stays in sync with FORMAT_TABLE open lists', () => {
  const HO = loadScript();
  const openExts = new Set();
  HO.FORMAT_TABLE.forEach((row) => {
    row.open.forEach((fmt) => openExts.add(fmt.replace(/^\./, '')));
  });

  Object.keys(HO.EXT_MAP).forEach((ext) => {
    assert.ok(openExts.has(ext), 'EXT_MAP.' + ext + ' is in some FORMAT_TABLE open list');
  });

  openExts.forEach((ext) => {
    assert.ok(HO.EXT_MAP[ext], 'open format .' + ext + ' has an EXT_MAP entry');
  });
});

test('file-input accept list matches FORMAT_TABLE open formats', () => {
  const HO = loadScript();
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const m = /id="file-input"[^>]*accept="([^"]+)"/.exec(html) || /accept="([^"]+)"[^>]*id="file-input"/.exec(html);
  assert.ok(m, 'file-input has an accept attribute');
  const fromHtml = m[1].split(',').map((s) => s.trim()).filter(Boolean).sort();
  const fromTable = JSON.parse(JSON.stringify(HO.openAcceptList())).sort();
  assert.deepEqual(fromHtml, fromTable);
});

test('getExt extracts lowercase extension', () => {
  const HO = loadScript();
  assert.equal(HO.getExt('Report.HOW'), 'how');
  assert.equal(HO.getExt('budget.2026.hos'), 'hos');
  assert.equal(HO.getExt('Sales.ods'), 'ods');
  assert.equal(HO.getExt('talk.hop'), 'hop');
  assert.equal(HO.getExt('presentation.hslides'), 'hslides');
  assert.equal(HO.getExt('inventory.HOT'), 'hot');
  assert.equal(HO.getExt('backup.hob'), 'hob');
  assert.equal(HO.getExt('old.hbase'), 'hbase');
  assert.equal(HO.getExt('data.odb'), 'odb');
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

  HO.switchTab('start');
  assert.equal(HO.getActiveTabId(), 'start');

  HO.switchTab(tab.id);
  assert.equal(HO.getActiveTabId(), tab.id);
});

test('closeTab closes document tab and refuses to close Start tab', () => {
  const HO = loadScript();
  const tab1 = HO.createDocTab('writer');
  const tab2 = HO.createDocTab('spreadsheet');
  assert.equal(HO.openTabs.length, 3);
  assert.equal(HO.getActiveTabId(), tab2.id);

  HO.closeTab(tab2.id);
  assert.equal(HO.openTabs.length, 2);
  assert.equal(HO.getActiveTabId(), tab1.id);

  HO.closeTab(tab1.id);
  assert.equal(HO.openTabs.length, 1);
  assert.equal(HO.getActiveTabId(), 'start');

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
  assert.equal(HO.formatTime(now - 10000, now), 'Just now');
  /* (before HO6) '2m ago' / '2h ago' */
  assert.equal(HO.formatTime(now - 120000, now), '2 m ago');
  assert.equal(HO.formatTime(now - 3600000 * 2, now), '2 h ago');
});

test('Start Page HTML is the HO7 layout and keeps cache tokens', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.ok(html.includes('Hub Office HO7'), 'title includes HO7');
  assert.ok(html.includes('content="HO7"'), 'version meta is HO7');
  assert.ok(html.includes('hub_office.css?v=HO7'), 'css cache token is HO7');
  assert.ok(html.includes('hub_office.js?v=HO7'), 'js cache token is HO7');
  assert.ok(html.includes('Hub Office</h1>') || html.includes('>Hub Office</h1>'), 'has Hub Office heading');
  assert.ok(html.includes('Write, calculate, present and organise. Files save on this device.'), 'has the one-line description');
  assert.ok(html.includes('id="suites-grid"'), 'has suite cards grid');
  assert.ok(html.includes('id="btn-open-file"'), 'has Open file button');
  assert.ok(/Open file/.test(html), 'Open file label is present');
  assert.ok(html.includes('id="section-open"'), 'Open/drop sits in its own section');
  const openAt = html.indexOf('id="section-open"');
  const suitesAt = html.indexOf('id="suites-grid"');
  const recentAt = html.indexOf('id="section-recent"');
  assert.ok(suitesAt > 0 && openAt > suitesAt, 'Open/drop comes after the suite cards');
  assert.ok(recentAt > openAt, 'Recent comes after Open/drop');
  assert.ok(html.includes('id="recent-list"'), 'has recent list');
  assert.ok(!html.includes('id="btn-formats"'), 'Supported formats link is gone');
  assert.ok(!html.includes('id="formats-backdrop"'), 'formats panel is gone');
  assert.ok(!html.includes('id="new-row"'), 'HO6 New row is gone');
  assert.ok(!/Supported:\s*\.how/.test(html), 'long Supported: line is gone');
  assert.ok(!html.includes('id="ho-sidebar"'), 'sidebar is gone');
  assert.ok(!html.includes('id="ho-search"'), 'search box is gone');
});

test('index.html redirects to hub_office.html', () => {
  const html = fs.readFileSync(path.join(ROOT, 'apps/office/hub-office/index.html'), 'utf8');
  assert.ok(html.includes('hub_office.html'), 'contains redirect target hub_office.html');
});
