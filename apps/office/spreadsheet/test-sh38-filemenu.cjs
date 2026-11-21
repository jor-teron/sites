#!/usr/bin/env node
/* SH38: File menu Rename, Delete, and New in a new window or tab (Writer DW15).
 * Loads the classic script via vm with small stubs, no browser.
 *   node --test apps/office/spreadsheet/test-sh38-filemenu.cjs
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));

function load(extra) {
  const ctx = Object.assign({ console, Promise, Number, String, Math, isFinite, Date }, extra || {});
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(read('spreadsheet_filemenu.js'), ctx, { filename: 'spreadsheet_filemenu.js' });
  return ctx;
}
function store(init) {
  const m = Object.assign({}, init || {});
  return {
    m,
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }
  };
}

test('renamePlan and renameValue', () => {
  const M = load().SHEET_FILEMENU;
  assert.strictEqual(M.renamePlan({ destKind: 'hub', inHub: true, format: 'xlsx' }), 'hub');
  assert.strictEqual(M.renamePlan({ destKind: null, inHub: true, format: 'hos' }), 'hub');
  assert.strictEqual(M.renamePlan({ destKind: 'handle', canMove: true }), 'handle-move');
  assert.strictEqual(M.renamePlan({ destKind: 'handle', canMove: false }), 'handle-keep');
  assert.strictEqual(M.renamePlan({ destKind: null, inHub: false, format: 'hos' }), 'name-only');
  assert.strictEqual(M.renamePlan({ destKind: null, inHub: true, format: 'csv' }), 'name-only');
  assert.strictEqual(M.renamePlan({ destKind: 'hub', inHub: false, format: 'hos' }), 'name-only');
  assert.strictEqual(M.renameValue(null, 'A'), null);
  assert.strictEqual(M.renameValue('  ', 'A'), null);
  assert.strictEqual(M.renameValue(' A ', 'A'), null);
  assert.strictEqual(M.renameValue(' Budget ', 'A'), 'Budget');
});

test('deletePlan follows Writer: delete from disk only in the Hub with a file', () => {
  const M = load().SHEET_FILEMENU;
  const d = M.deletePlan({ name: 'Q1', inHub: true, canLocal: true, hasFile: true });
  assert.strictEqual(d.onDisk, true);
  assert.strictEqual(d.okLabel, 'Delete');
  assert.strictEqual(d.danger, true);
  assert.ok(d.message.indexOf('"Q1" will be deleted from Documents') === 0);
  assert.ok(M.deletePlan({ name: 'Q1', inHub: true, canLocal: true, hasFile: true, folder: 'Work' }).message.indexOf('from Work.') !== -1);
  const c = M.deletePlan({ name: 'Q1', inHub: false, canLocal: false, hasFile: false });
  assert.strictEqual(c.onDisk, false);
  assert.strictEqual(c.okLabel, 'Close');
  assert.strictEqual(M.deletePlan({ name: 'U', inHub: true, canLocal: true, hasFile: false }).onDisk, false);
});

test('newMode, hubPhone, URL helpers (Writer DW15)', () => {
  const M = load().SHEET_FILEMENU;
  assert.strictEqual(M.newMode({ inFrame: true, inHub: true, phone: true }), 'same');
  assert.strictEqual(M.newMode({ inFrame: true, inHub: true, phone: false }), 'hub-window');
  assert.strictEqual(M.newMode({ inFrame: true, inHub: true, phone: null }), 'hub-window');
  assert.strictEqual(M.newMode({ inFrame: false }), 'tab');
  assert.strictEqual(M.newMode({ inFrame: true, inHub: false }), 'same');
  assert.strictEqual(M.newMode({}), 'same');
  const w = {}; w.parent = { HubMode: { isDesktop: () => true }, HubWM: {} };
  assert.strictEqual(M.hubPhone(w), false);
  w.parent = { HubMode: { isDesktop: () => false } };
  assert.strictEqual(M.hubPhone(w), true);
  w.parent = {};
  assert.strictEqual(M.hubPhone(w), null);
  const top = {}; top.parent = top;
  assert.strictEqual(M.hubPhone(top), null);
  assert.strictEqual(M.hubSheetUrl('https://x.io/apps/office/spreadsheet/spreadsheet.html?new=1#drive=a'), 'https://x.io/apps/office/spreadsheet/');
  assert.strictEqual(M.hubSheetUrl('https://x.io/apps/office/spreadsheet/'), 'https://x.io/apps/office/spreadsheet/');
  assert.strictEqual(M.hubSheetUrl('file:///s/apps/office/spreadsheet'), 'file:///s/apps/office/spreadsheet/');
  assert.deepStrictEqual(plain(M.hubOpenMessage('https://x.io/a/spreadsheet/spreadsheet.html')),
    { type: 'hub-open-app', url: 'https://x.io/a/spreadsheet/', name: 'Spreadsheet', newInstance: true });
  assert.strictEqual(M.hubOpenTarget({ protocol: 'file:', origin: 'null' }), '*');
  assert.strictEqual(M.hubOpenTarget({ protocol: 'https:', origin: 'https://x.io' }), 'https://x.io');
  assert.strictEqual(M.newTabUrl('https://x.io/s.html#drive=a'), 'https://x.io/s.html#new');
  assert.strictEqual(M.launchIsNew({ hash: '#new' }), true);
  assert.strictEqual(M.launchIsNew({ hash: '#drive=a' }), false);
});

test('one-time sheet_open_new flag: under 30 s, always removed', () => {
  const M = load().SHEET_FILEMENU;
  assert.strictEqual(M.OPEN_NEW_KEY, 'sheet_open_new');
  const s = store();
  assert.strictEqual(M.markOpenNew(1000, s), true);
  assert.strictEqual(s.m.sheet_open_new, '1000');
  assert.strictEqual(M.takeOpenNew(5000, s), true);
  assert.strictEqual('sheet_open_new' in s.m, false);
  assert.strictEqual(M.takeOpenNew(5000, s), false);
  M.markOpenNew(1000, s);
  assert.strictEqual(M.takeOpenNew(1000 + 30000, s), false, 'too old');
  assert.strictEqual('sheet_open_new' in s.m, false);
  s.setItem('sheet_open_new', 'junk');
  assert.strictEqual(M.takeOpenNew(1, s), false);
  let replaced = null;
  const fresh = M.consumeNewLaunch(1, store(), { hash: '#new', href: 'https://x.io/s.html#new' }, { replaceState: (a, b, u) => { replaced = u; } });
  assert.strictEqual(fresh, true);
  assert.strictEqual(replaced, 'https://x.io/s.html');
});

test('requestNew: Hub window posts hub-open-app, tab opens, phone or failure stays', () => {
  const posted = [];
  const ctx = load({ SHEET_HUB: { linked: true } });
  const M = ctx.SHEET_FILEMENU;
  const ls = store();
  const win = { location: { href: 'https://x.io/a/spreadsheet/spreadsheet.html', protocol: 'https:', origin: 'https://x.io' }, localStorage: ls };
  win.parent = { postMessage: (m, t) => posted.push([m, t]), HubMode: { isDesktop: () => true }, HubWM: {} };
  assert.strictEqual(M.requestNew(win), 'hub-window');
  assert.deepStrictEqual(plain(posted), [[{ type: 'hub-open-app', url: 'https://x.io/a/spreadsheet/', name: 'Spreadsheet', newInstance: true }, 'https://x.io']]);
  assert.ok(ls.m.sheet_open_new, 'flag set for the new instance');
  win.parent.HubMode = { isDesktop: () => false };
  assert.strictEqual(M.requestNew(win), 'same', 'Hub phone clears in place');
  ctx.SHEET_HUB.linked = false;
  const opened = [];
  const solo = { location: { href: 'file:///s/spreadsheet.html' }, open: (u, t) => { opened.push([u, t]); return {}; } };
  solo.parent = solo;
  assert.strictEqual(M.requestNew(solo), 'tab');
  assert.deepStrictEqual(opened, [['file:///s/spreadsheet.html#new', '_blank']]);
  solo.open = () => null;
  assert.strictEqual(M.requestNew(solo), 'same', 'blocked popup clears in place');
});

test('wrapStart: a new instance starts empty, otherwise the old start runs', async () => {
  const M = load().SHEET_FILEMENU;
  const calls = [];
  const session = { start: () => { calls.push('start'); return Promise.resolve(true); }, newName: () => { calls.push('newName'); return Promise.resolve('Untitled 2'); } };
  const ls = store();
  const win = { localStorage: ls, location: { hash: '' }, history: {} };
  M.wrapStart(session, win);
  M.wrapStart(session, win);   /* once only */
  assert.strictEqual(await session.start(), true);
  M.markOpenNew(Date.now(), ls);
  assert.strictEqual(await session.start(), false);
  assert.strictEqual(await session.start(), true, 'flag is one-time');
  assert.deepStrictEqual(calls, ['start', 'newName', 'start']);
});

function fileStubs(o) {
  const log = [];
  const hos = {
    dest: o.hosDest || null, skipWrite: false, DOCUMENTS: 'Documents',
    stemName: () => 'Old', detach() { log.push('detach'); hos.dest = null; },
    autosave: () => { log.push('autosave'); return Promise.resolve({ wrote: true }); },
    save: (opts) => { log.push(['save', opts]); return Promise.resolve({ wrote: true }); },
    prepareNew: () => { log.push('prepareNew'); return Promise.resolve('Untitled 1'); }
  };
  const fmt = {
    format: o.format || 'hos', dest: o.fmtDest || null, savedSig: 'x', DOCUMENTS: 'Documents',
    inHub: () => !!o.inHub, canLocal: () => !!o.inHub,
    currentName: () => 'Old',
    setName: (n) => { log.push(['setName', n]); return n; },
    fileName: (n, f) => n + '.' + f
  };
  const removed = [];
  const ctx = load({
    SHEET_HOS: hos, SHEET_SAVEFMT: fmt,
    OfficeDialog: { prompt: () => Promise.resolve(o.answer), confirm: () => Promise.resolve(o.confirm !== false) },
    FsDrives: { handle: () => Promise.resolve({
      getDirectoryHandle: (n) => Promise.resolve({ removeEntry: (x) => { removed.push(n + '/' + x); return Promise.resolve(); } }),
      removeEntry: (x) => { removed.push(x); return Promise.resolve(); } }) },
    emptyWorkbook: () => log.push('emptyWorkbook'),
    undoRecord: (k) => log.push(['undo', k]),
    afterChange: () => log.push('afterChange'),
    setStatus: (m) => log.push(['status', m])
  });
  return { ctx, M: ctx.SHEET_FILEMENU, log, hos, fmt, removed };
}

test('rename: Hub .hos writes under the new name (autosave), Hub title via setName', async () => {
  const t = fileStubs({ inHub: true, answer: 'Budget', hosDest: { kind: 'hub', drive: 'local', path: 'Documents', name: 'Old.hos' } });
  assert.strictEqual(await t.M.rename(), true);
  assert.deepStrictEqual(plain(t.log), [['setName', 'Budget'], 'autosave', ['status', 'Renamed to Budget']]);
});

test('rename: opened .xlsx in the Hub saves through SHEET_SAVEFMT; a picked file is moved when possible', async () => {
  let t = fileStubs({ inHub: true, answer: 'Q2', format: 'xlsx', fmtDest: { kind: 'hub', drive: 'local', path: 'Work', name: 'Old.xlsx' } });
  await t.M.rename();
  assert.deepStrictEqual(plain(t.log.slice(0, 2)), [['setName', 'Q2'], ['save', { explicit: true }]]);
  const moved = [];
  const dest = { kind: 'handle', name: 'Old.csv', handle: { move: (n) => { moved.push(n); return Promise.resolve(); } } };
  t = fileStubs({ inHub: false, answer: 'Q3', format: 'csv', fmtDest: dest });
  await t.M.rename();
  assert.deepStrictEqual(moved, ['Q3.csv']);
  assert.strictEqual(dest.name, 'Q3.csv');
  assert.deepStrictEqual(plain(t.log[1]), ['save', { explicit: true }]);
});

test('rename: no file yet only changes the name; cancel or same name does nothing', async () => {
  let t = fileStubs({ inHub: false, answer: 'Plan' });
  await t.M.rename();
  assert.deepStrictEqual(plain(t.log), [['setName', 'Plan'], ['status', 'Renamed to Plan']]);
  t = fileStubs({ inHub: false, answer: null });
  assert.strictEqual(await t.M.rename(), false);
  t = fileStubs({ inHub: false, answer: 'Old' });
  assert.strictEqual(await t.M.rename(), false);
  assert.deepStrictEqual(t.log, []);
});

test('delete: Hub file is removed from its folder, then a new empty Untitled workbook', async () => {
  const t = fileStubs({ inHub: true, format: 'xlsx', fmtDest: { kind: 'hub', drive: 'local', path: 'Work', name: 'Old.xlsx' } });
  assert.strictEqual(await t.M.deleteCurrent(), true);
  assert.deepStrictEqual(t.removed, ['Work/Old.xlsx']);
  assert.strictEqual(t.fmt.dest, null);
  assert.strictEqual(t.hos.skipWrite, false);
  const names = t.log.map((x) => (Array.isArray(x) ? x[0] : x));
  assert.ok(names.indexOf('detach') < names.indexOf('emptyWorkbook'));
  assert.ok(names.indexOf('prepareNew') > names.indexOf('emptyWorkbook'));
  assert.deepStrictEqual(plain(t.log[t.log.length - 1]), ['status', 'Deleted Old']);
});

test('delete: outside the Hub only closes; cancel keeps everything', async () => {
  let t = fileStubs({ inHub: false, fmtDest: null, hosDest: { kind: 'handle', name: 'Old.hos', handle: {} } });
  await t.M.deleteCurrent();
  assert.deepStrictEqual(t.removed, []);
  assert.deepStrictEqual(plain(t.log[t.log.length - 1]), ['status', 'Closed Old']);
  t = fileStubs({ inHub: true, confirm: false, hosDest: { kind: 'hub', drive: 'local', path: 'Documents', name: 'Old.hos' } });
  assert.strictEqual(await t.M.deleteCurrent(), false);
  assert.deepStrictEqual(t.removed, []);
  assert.deepStrictEqual(t.log, []);
});

test('html: Rename and Delete fill the SH37 slots; wiring SH38', () => {
  const M = load().SHEET_FILEMENU;
  const html = read('spreadsheet.html');
  const live = html.replace(/<!--[\s\S]*?-->/g, '');
  const menu = live.slice(live.indexOf('id="of-file-menu"'), live.indexOf('id="sheet-export-menu"'));
  const ids = [];
  menu.replace(/<button[^>]*\bid="([^"]+)"/g, (m, id) => { ids.push(id); return m; });
  assert.deepStrictEqual(ids, Array.from(M.ORDER));
  /* (before SH40) assert.deepStrictEqual(ids, ['btn-clear', 'btn-open', 'btn-rename', 'btn-save', 'btn-save-as', 'btn-print', 'btn-delete', 'btn-export-menu', 'settingsMenuBtn']); */
  assert.deepStrictEqual(ids, ['btn-clear', 'btn-open', 'btn-rename', 'btn-save', 'btn-save-as', 'btn-print', 'btn-close', 'btn-delete', 'btn-export-menu', 'settingsMenuBtn']);   // SH40 Close
  assert.ok(menu.indexOf('<span>Rename</span>') !== -1 && menu.indexOf('<span>Delete</span>') !== -1);
  assert.ok(html.indexOf('<title>Spreadsheet SH38</title>') !== -1);
  assert.ok(html.indexOf('<!-- (before SH38) <title>Spreadsheet SH37</title> -->') !== -1);
  assert.ok(read('spreadsheet_settings.js').indexOf('var SHEET_VERSION = "SH38";') !== -1);
  /* (before SH40) assert.ok(live.indexOf('spreadsheet_filemenu.js?v=SH38') !== -1); */
  assert.ok(live.indexOf('spreadsheet_filemenu.js?v=SH38') !== -1 || live.indexOf('spreadsheet_filemenu.js?v=SH40') !== -1);
  /* (before SH39) assert.ok(live.indexOf('spreadsheet_settings.js?v=SH38') !== -1); */
  /* (before SH40) assert.ok(live.indexOf('spreadsheet_settings.js?v=SH38') !== -1 || live.indexOf('spreadsheet_settings.js?v=SH39') !== -1); */
  /* (before SH41) assert.ok(/spreadsheet_settings\.js\?v=SH(38|39|40)/.test(live)); */
  /* (before SH42) assert.ok(/spreadsheet_settings\.js\?v=SH(38|39|40|41)/.test(live)); */
  /* (before SH44) assert.ok(/spreadsheet_settings\.js\?v=SH(38|39|40|41|42)/.test(live)); */
  assert.ok(/spreadsheet_settings\.js\?v=SH(38|39|40|41|42|44)/.test(live));
  /* The old clear handler is kept for phone / fallback. */
  assert.ok(read('spreadsheet_toolbar.js').indexOf('onBtn("btn-clear"') !== -1);
  assert.ok(read('spreadsheet_readme.md').indexOf('## SH38') !== -1);
});
