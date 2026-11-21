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
const DOCNAME_PATH = path.join(ROOT, 'apps/office/shared/office-docname.js');
const NEWDOC_PATH = path.join(ROOT, 'apps/office/shared/office-newdoc.js');
const HTML_PATH = path.join(ROOT, 'apps/office/hub-office/hub_office.html');

test('node --check on hub_office.js', () => {
  cp.execFileSync(process.execPath, ['--check', SCRIPT_PATH]);
});

function loadScript(customWindow = {}) {
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
  vm.runInContext(fs.readFileSync(DOCNAME_PATH, 'utf8'), context, { filename: 'office-docname.js' });
  vm.runInContext(fs.readFileSync(NEWDOC_PATH, 'utf8'), context, { filename: 'office-newdoc.js' });
  vm.runInContext(fs.readFileSync(SCRIPT_PATH, 'utf8'), context, { filename: 'hub_office.js' });
  return context.HubOffice;
}

/* (before HO13) test('VERSION is HO12b and SUITES cover all 5 office applications', () => { */
/* (before HO14) test('VERSION is HO13 and SUITES cover all 5 office applications', () => { */
test('VERSION is HO14 and SUITES cover all 5 office applications', () => {
  const HO = loadScript();
  assert.ok(HO, 'HubOffice exported');
  /* (before HO12b) assert.equal(HO.VERSION, 'HO12'); */
  /* (before HO13) assert.equal(HO.VERSION, 'HO12b'); */
  /* (before HO14) assert.equal(HO.VERSION, 'HO13'); */
  assert.equal(HO.VERSION, 'HO14');
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
  /* (before DW9) assert.deepEqual(..., ['.how', '.docx', '.odt']); */
  assert.deepEqual(JSON.parse(JSON.stringify(byId.writer.open)), ['.how', '.docx', '.odt', '.txt']);
  assert.deepEqual(JSON.parse(JSON.stringify(byId.writer.save)), ['.how']);
  assert.deepEqual(JSON.parse(JSON.stringify(byId.writer.export)), ['.docx', '.odt', '.pdf']);

  /* (before HO6 / SH27) Spreadsheet open included .tsv, which the file picker does not accept */
  assert.deepEqual(JSON.parse(JSON.stringify(byId.spreadsheet.open)), ['.hos', '.xlsx', '.xls', '.ods', '.csv']);
  assert.deepEqual(JSON.parse(JSON.stringify(byId.spreadsheet.save)), ['.hos']);
  assert.deepEqual(JSON.parse(JSON.stringify(byId.spreadsheet.export)), ['.xlsx', '.ods', '.csv']);

  /* (before PN4) assert.deepEqual(..., ['.hop', '.hslides', '.pptx', '.odp']); */
  assert.deepEqual(JSON.parse(JSON.stringify(byId.slides.open)), ['.hop', '.pptx', '.odp']);
  assert.deepEqual(JSON.parse(JSON.stringify(byId.slides.save)), ['.hop']);
  /* .pdf added after verifying File → Export PDF */
  assert.deepEqual(JSON.parse(JSON.stringify(byId.slides.export)), ['.pptx', '.odp', '.png', '.pdf']);

  /* (before BS14) assert.deepEqual(..., ['.hob', '.hbase', '.odb', '.csv', '.tsv', '.txt', '.xlsx', '.xls', '.json', '.sqlite', '.sqlite3', '.db']); */
  assert.deepEqual(JSON.parse(JSON.stringify(byId.base.open)), ['.hob', '.odb', '.csv', '.tsv', '.txt', '.xlsx', '.xls', '.json', '.sqlite', '.sqlite3', '.db']);
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
  /* (before DW9) assert.deepEqual(groups[0].formats, ['.how', '.docx', '.odt']); */
  assert.deepEqual(groups[0].formats, ['.how', '.docx', '.odt', '.txt']);
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
  /* (before DW9) assert.equal(HO.EXT_MAP.txt, 'base'); */
  assert.equal(HO.EXT_MAP.txt, 'writer');

  assert.equal(HO.EXT_MAP.hos, 'spreadsheet');
  assert.equal(HO.EXT_MAP.xlsx, 'spreadsheet');
  assert.equal(HO.EXT_MAP.xls, 'spreadsheet');
  assert.equal(HO.EXT_MAP.ods, 'spreadsheet');
  assert.equal(HO.EXT_MAP.csv, 'spreadsheet');

  assert.equal(HO.EXT_MAP.hop, 'slides');
  /* (before PN4) assert.equal(HO.EXT_MAP.hslides, 'slides'); */
  assert.equal(HO.EXT_MAP.hslides, undefined);
  assert.equal(HO.EXT_MAP.pptx, 'slides');
  assert.equal(HO.EXT_MAP.odp, 'slides');
  assert.equal(HO.EXT_MAP.ppt, undefined);

  assert.equal(HO.EXT_MAP.hot, 'tables');

  assert.equal(HO.EXT_MAP.hob, 'base');
  /* (before BS14) assert.equal(HO.EXT_MAP.hbase, 'base'); */
  assert.equal(HO.EXT_MAP.hbase, undefined);
  assert.equal(HO.EXT_MAP.odb, 'base');
  assert.equal(HO.EXT_MAP.db, 'base');
  assert.equal(HO.EXT_MAP.sqlite, 'base');
  assert.equal(HO.EXT_MAP.sqlite3, 'base');
  assert.equal(HO.EXT_MAP.json, 'base');
  assert.equal(HO.EXT_MAP.tsv, 'base');
  /* (before DW9) assert.equal(HO.EXT_MAP.txt, 'base'); */
  assert.equal(HO.EXT_MAP.md, undefined);
});

test('routeByFilename maps known names and rejects unknown extensions', () => {
  const HO = loadScript();
  assert.equal(HO.routeByFilename('Letter.odt'), 'writer');
  assert.equal(HO.routeByFilename('Sales.ods'), 'spreadsheet');
  assert.equal(HO.routeByFilename('Talk.odp'), 'slides');
  assert.equal(HO.routeByFilename('Contacts.odb'), 'base');
  assert.equal(HO.routeByFilename('Notes.how'), 'writer');
  assert.equal(HO.routeByFilename('notes.txt'), 'writer');
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
  /* (before HO12) assert.equal(tab.url, '../writer/'); */
  /* (before HO12b) assert.equal(tab.url, '../writer/?new=1'); — a named tab has no Untitled number */
  assert.equal(tab.url, '../writer/?new=1');
  assert.equal(HO.openTabs.length, 2);
  assert.equal(HO.getActiveTabId(), tab.id);

  HO.switchTab('start');
  assert.equal(HO.getActiveTabId(), 'start');

  HO.switchTab(tab.id);
  assert.equal(HO.getActiveTabId(), tab.id);
});

test('createDocTab uses Untitled N per suite, or the opened file name', () => {
  const HO = loadScript();
  const w1 = HO.createDocTab('writer');
  const w2 = HO.createDocTab('writer');
  const s1 = HO.createDocTab('spreadsheet');
  assert.equal(w1.title, 'Untitled 1');
  assert.equal(w2.title, 'Untitled 2');
  assert.equal(s1.title, 'Untitled 1');
  const opened = HO.createDocTab('spreadsheet', { title: '  Documents/Budget.hos  ' });
  assert.equal(opened.title, 'Budget.hos');
  assert.equal(HO.untitledLabel(3), 'Untitled 3');
  /* (before HO12b) assert.equal(HO.displayTabLabel('Budget.hos'), 'Budget.hos');
  const long = 'Quarterly-financial-report-final-draft.hos';
  assert.equal(HO.displayTabLabel(long), long.slice(0, 39) + '\u2026'); */
  assert.equal(HO.displayTabLabel('Budget.hos'), 'Budget');
  const long = 'Quarterly-financial-report-final-draft-v2.hos';
  assert.equal(HO.displayTabLabel(long), 'Quarterly-financial-report-final-draft-v2'.slice(0, 39) + '\u2026');
});

test('applyDocName updates a tab label and ignores empty or unknown sources', () => {
  const HO = loadScript();
  const tab = HO.createDocTab('writer');
  assert.equal(tab.title, 'Untitled 1');
  assert.equal(HO.applyDocName(tab.id, 'Letter.how'), true);
  assert.equal(tab.title, 'Letter.how');
  assert.equal(HO.applyDocName(tab.id, '   '), false);
  assert.equal(tab.title, 'Letter.how');
  assert.equal(HO.applyDocName('start', 'Nope.how'), false);
  assert.equal(HO.parseDocNameMessage({ hubOfficeDocName: { v: 1, name: 'Letter.how' } }), 'Letter.how');
  assert.equal(HO.parseDocNameMessage({ type: 'hub-hello' }), null);
});

test('HO12b: switchTab focuses the document frame, not for the Start Page', () => {
  const frames = {};
  const focused = [];
  function frame(id) {
    if (!frames[id]) {
      frames[id] = {
        title: '',
        contentWindow: { focus: () => focused.push('win:' + id) },
        focus: () => focused.push('frame:' + id)
      };
    }
    return frames[id];
  }
  const HO = loadScript({
    document: {
      readyState: 'complete',
      getElementById: (id) => (id.indexOf('view-') === 0 ? { querySelector: () => frame(id.slice(5)) } : null),
      querySelectorAll: () => [],
      addEventListener: () => {}
    }
  });
  const a = HO.createDocTab('writer');
  const b = HO.createDocTab('writer');
  assert.deepEqual(focused.slice(-2), ['win:' + b.id, 'frame:' + b.id], 'new tab gets focus');
  focused.length = 0;
  HO.switchTab(a.id);
  assert.deepEqual(focused, ['win:' + a.id, 'frame:' + a.id]);
  focused.length = 0;
  HO.switchTab('start');
  assert.deepEqual(focused, [], 'Start Page does not steal focus');
  assert.equal(HO.focusTabFrame('start'), false);
  /* a frame that throws on focus does not break the switch */
  frames[a.id].contentWindow = { focus: () => { throw new Error('x'); } };
  HO.switchTab(a.id);
  assert.equal(HO.getActiveTabId(), a.id);
});

test('HO12b: Untitled N skips open tabs with that number and is passed as &untitled=N', () => {
  const HO = loadScript();
  const w1 = HO.createDocTab('writer');
  const w2 = HO.createDocTab('writer');
  assert.equal(w1.url, '../writer/?new=1&untitled=1');
  assert.equal(w2.url, '../writer/?new=1&untitled=2');
  HO.closeTab(w1.id);
  const w3 = HO.createDocTab('writer');
  assert.equal(w3.title, 'Untitled 1', 'a closed number is reused');
  /* the suite renamed a tab: its number is now taken */
  HO.applyDocName(w3.id, 'Untitled 4');
  const w4 = HO.createDocTab('writer');
  assert.equal(w4.title, 'Untitled 1');
  assert.equal(HO.nextUntitledNumber('writer'), 3);
  assert.equal(HO.nextUntitledNumber('tables'), 1);
  assert.equal(HO.stripDocExt('Letter.how'), 'Letter');
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

test('shouldShowTabBar is true only when a document tab is open', () => {
  const HO = loadScript();
  assert.equal(HO.shouldShowTabBar(HO.openTabs), false);
  assert.equal(HO.shouldShowTabBar([]), false);
  assert.equal(HO.shouldShowTabBar([{ id: 'start', type: 'start' }]), false);
  const tab = HO.createDocTab('writer');
  assert.equal(HO.shouldShowTabBar(HO.openTabs), true);
  HO.closeTab(tab.id);
  assert.equal(HO.shouldShowTabBar(HO.openTabs), false);
});

test('homeTitleBarButton is a single Home button and JS wires H49 without sending doc tabs', () => {
  const HO = loadScript();
  const btn = HO.homeTitleBarButton();
  assert.equal(btn.id, 'home');
  assert.equal(btn.label, 'Home');
  assert.equal(btn.icon, '🏠');
  assert.equal(btn.title, 'Start Page');
  assert.equal(btn.enabled, true);
  assert.equal(btn.showLabel, true);

  const js = fs.readFileSync(SCRIPT_PATH, 'utf8');
  /* (before HO10) set() sent only [homeTitleBarButton()] */
  assert.ok(js.includes('composeTitleBarButtons(homeTitleBarButton()'), 'set() composes Home plus the active document buttons');
  assert.ok(js.includes("align: 'left'"), 'title-bar buttons sit on the left');
  assert.ok(js.includes("if (kind === 'button' && id === 'home')"), 'title-bar Home click shows the Start Page');
  assert.ok(js.includes('HubTitleBar.onHello'), 'replies after hubTitleBarHello');
  assert.ok(js.includes('hubTitleBarHello'), 'says hello to suite iframes once linked');
  assert.ok(js.includes('hubTitleBarClick'), 'forwards title-bar clicks to the active suite');
  assert.ok(!/HubTitleBar\.set\([^)]*tabs:/.test(js), 'document tabs and ribbon tabs are not sent to the title bar');
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

test('Start Page HTML is the HO12 layout and keeps cache tokens', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  assert.ok(html.includes('Hub Office HO12'), 'title includes HO12');
  assert.ok(html.includes('content="HO12"'), 'version meta is HO12');
  assert.ok(html.includes('hub_office.css?v=HO12'), 'css cache token is HO12');
  assert.ok(html.includes('hub_office.js?v=HO12'), 'js cache token is HO12');
  assert.ok(html.includes('../shared/office-docname.js'), 'loads the document-name helper');
  assert.ok(html.includes('../shared/office-newdoc.js'), 'loads the new-document helper');
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
  /* (before HO13) const settingsAt = html.indexOf('id="section-settings"');
  assert.ok(settingsAt > recentAt, 'Settings comes after Recent'); */
  /* HO13: the settings live on the Settings page, after the Start Page view. */
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!live.includes('id="section-settings"'), 'Start Page Settings section is commented out');
  assert.ok(live.indexOf('id="view-settings"') > live.indexOf('id="section-recent"'), 'Settings page comes after the Start Page');
  assert.ok(html.includes('../shared/office-shared-settings.js'), 'loads the shared settings helper');
  assert.ok(html.includes('Defaults for new documents. Each app\'s own settings still win.'), 'has the settings note');
  assert.ok(!html.includes('id="btn-formats"'), 'Supported formats link is gone');
  assert.ok(!html.includes('id="formats-backdrop"'), 'formats panel is gone');
  assert.ok(!html.includes('id="new-row"'), 'HO6 New row is gone');
  assert.ok(!/Supported:\s*\.how/.test(html), 'long Supported: line is gone');
  assert.ok(!html.includes('id="ho-sidebar"'), 'sidebar is gone');
  assert.ok(!html.includes('id="ho-search"'), 'search box is gone');
  assert.ok(!/<button[^>]*id="tab-btn-start"/.test(html), 'Start Page tab is gone from the strip');
  assert.ok(html.includes('id="btn-home"'), 'standalone Home button is in the tab row');
  assert.ok(html.includes('../shared/office-hubbar.js'), 'loads the H49 HubTitleBar helper');
  assert.ok(html.includes('id="ho-tabs-list"'), 'document tabs list stays in the row');
  assert.ok(html.includes('id="view-start"'), 'Start Page view is still in the content area');
});


test('Settings section lists each HO9 control in one labelled row', () => {
  /* (before HO13) const html = fs.readFileSync(HTML_PATH, 'utf8');
  const start = html.indexOf('id="section-settings"'); */
  /* HO13: check the live block on the Settings page (comments stripped). */
  const html = fs.readFileSync(HTML_PATH, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const start = html.indexOf('id="section-settings-page"');
  const end = html.indexOf('</section>', start);
  assert.ok(start > 0 && end > start, 'settings section is present');
  const block = html.slice(start, end);
  const ids = [
    'set-font', 'set-font-size', 'set-paper', 'set-units',
    'set-date-format', 'set-number-locale', 'set-autosave',
    'set-save-location', 'set-author'
  ];
  ids.forEach((id) => {
    assert.ok(block.includes('id="' + id + '"'), 'has #' + id);
  });
  assert.ok(block.includes('value="Times New Roman"') && block.includes('value="Tinos"'), 'font list is Writer fonts');
  assert.ok(block.includes('value="A4"') && block.includes('value="Letter"'), 'paper is A4 or Letter');
  assert.ok(block.includes('value="cm"') && block.includes('value="in"'), 'units are cm or in');
  assert.ok(block.includes('31/12/2026') && block.includes('2026-12-31') && block.includes('12/31/2026'), 'date format examples');
  assert.ok(block.includes('1,00,000 Indian') && block.includes('100,000 US') && block.includes('100,000 UK'), 'number style examples');
  assert.ok(block.includes('Hub Documents') && block.includes('Ask each time'), 'save-location labels');
  assert.ok(block.includes('Your name'), 'has Your name');
  assert.ok(block.includes('Autosave'), 'has Autosave');
  assert.ok(!/alert\(|confirm\(|prompt\(/.test(block), 'no native dialogs in the settings markup');
});

test('CSS hides the empty tab row and the in-row Home button after Hub hello', () => {
  const css = fs.readFileSync(path.join(ROOT, 'apps/office/hub-office/hub_office.css'), 'utf8');
  assert.ok(css.includes('.ho-tab-bar.ho-tab-bar-empty'), 'empty tab row can hide');
  assert.ok(css.includes('body.hub-titlebar .ho-home-btn'), 'in-row Home hides once the title-bar hook is linked');
  assert.ok(css.includes('.ho-settings'), 'has Settings section styles');
  assert.ok(css.includes('.ho-set-row'), 'settings rows are styled');
});

test('index.html redirects to hub_office.html', () => {
  const html = fs.readFileSync(path.join(ROOT, 'apps/office/hub-office/index.html'), 'utf8');
  assert.ok(html.includes('hub_office.html'), 'contains redirect target hub_office.html');
});
