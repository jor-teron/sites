/* HOT1: .hot round-trip. No DOM, no browser, no network.
   Run: node apps/office/tables/test-hot1-format.js */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var dir = __dirname;
var Hot = require('./tables_hot.js');
var M = require('./tables_model.js');
var Native = require('../shared/office-native.js');

var doc = {
  name: 'Jobs 2026',
  created: 1700000000000,
  updated: 1700000001000,
  activeId: 't-jobs',
  settings: { theme: 'dark', ribbonCollapsed: true },
  tables: [
    {
      id: 't-people',
      name: 'People',
      view: 'cards',
      columns: [
        { id: 'c-name', name: 'Name', type: 'text', width: 180 },
        { id: 'c-age', name: 'Age', type: 'number', width: null },
        { id: 'c-joined', name: 'Joined', type: 'date', width: 120 },
        { id: 'c-ok', name: 'Active', type: 'yesno' },
        { id: 'c-role', name: 'Role', type: 'choice', options: ['Dev', 'Design'], width: 96 }
      ],
      rows: [
        { id: 'r-ada', cells: { 'c-name': 'Ada', 'c-age': 36, 'c-joined': '2026-11-11', 'c-ok': true, 'c-role': 'Dev' } },
        { id: 'r-lin', cells: { 'c-name': 'Lin', 'c-age': 28, 'c-joined': '2020-01-02', 'c-ok': false, 'c-role': 'Design' } }
      ]
    },
    {
      id: 't-jobs',
      name: 'Jobs',
      view: 'grid',
      columns: [
        { id: 'c-title', name: 'Title', type: 'text', width: 140 },
        { id: 'c-who', name: 'Who', type: 'link', linkTable: 't-people', multiple: false, width: 160 },
        { id: 'c-team', name: 'Team', type: 'link', linkTable: 't-people', multiple: true, width: 20 }
      ],
      rows: [
        { id: 'r-job', cells: { 'c-title': 'Site', 'c-who': 'r-ada', 'c-team': ['r-ada', 'r-lin'] } }
      ]
    }
  ]
};

var text = Hot.stringify(doc);
assert.strictEqual(text.slice(0, 1), '{', 'a .hot file is a JSON object');
assert.strictEqual(text.indexOf('PK'), -1, 'not a zip');
assert.ok(text.indexOf('"format": "hot"') !== -1, 'format name hot');
assert.ok(text.indexOf('"version": 1') !== -1, 'format version 1');
assert.strictEqual(text.indexOf('"backlinks"'), -1, 'backlinks are calculated, not stored twice');
assert.strictEqual(text.indexOf('tables-v1'), -1, 'the old storage key is not in the file');
assert.strictEqual(text.indexOf('ribbonCollapsed'), -1, 'unknown settings are dropped');

var back = Hot.parse(text);
assert.strictEqual(back.format, 'hot');
assert.strictEqual(back.version, 1);
assert.strictEqual(back.name, 'Jobs 2026');
assert.strictEqual(back.created, doc.created);
assert.strictEqual(back.updated, doc.updated);
assert.strictEqual(back.activeId, 't-jobs');
assert.deepStrictEqual(back.settings, { theme: 'dark' });
assert.strictEqual(back.tables.length, 2);
assert.deepStrictEqual(back.tables.map(function (t) { return t.name; }), ['People', 'Jobs']);
assert.strictEqual(back.tables[0].view, 'cards');
assert.strictEqual(back.tables[1].view, 'grid');

var people = back.tables[0];
assert.deepStrictEqual(people.columns.map(function (c) { return c.type; }), ['text', 'number', 'date', 'yesno', 'choice']);
assert.strictEqual(people.columns[0].width, 180);
assert.strictEqual(people.columns[1].width, null);
assert.strictEqual(people.columns[2].width, 120);
assert.strictEqual(people.columns[3].width, null);
assert.strictEqual(people.columns[4].width, 96);
assert.deepStrictEqual(people.columns[4].options, ['Dev', 'Design']);
assert.strictEqual(people.rows[0].id, 'r-ada');
assert.strictEqual(people.rows[0].cells['c-name'], 'Ada');
assert.strictEqual(people.rows[0].cells['c-age'], 36);
assert.strictEqual(people.rows[0].cells['c-joined'], '2026-11-11');
assert.strictEqual(people.rows[0].cells['c-ok'], true);
assert.strictEqual(people.rows[1].cells['c-role'], 'Design');

var jobs = back.tables[1];
assert.strictEqual(jobs.columns[1].type, 'link');
assert.strictEqual(jobs.columns[1].linkTable, 't-people');
assert.strictEqual(jobs.columns[1].multiple, false);
assert.strictEqual(jobs.columns[1].width, 160);
assert.strictEqual(jobs.columns[2].multiple, true);
assert.strictEqual(jobs.columns[2].width, 72, 'widths below 72 are raised');
assert.strictEqual(jobs.rows[0].id, 'r-job');
assert.strictEqual(jobs.rows[0].cells['c-who'], 'r-ada');
assert.deepStrictEqual(jobs.rows[0].cells['c-team'], ['r-ada', 'r-lin']);

var again = Hot.parse(Hot.stringify(back));
assert.strictEqual(again.activeId, back.activeId);
assert.strictEqual(again.tables[0].rows[0].id, 'r-ada');
assert.strictEqual(again.tables[1].rows[0].cells['c-who'], 'r-ada');
assert.deepStrictEqual(again.tables[1].rows[0].cells['c-team'], ['r-ada', 'r-lin']);
assert.strictEqual(again.tables[0].view, 'cards');
assert.strictEqual(again.tables[0].columns[0].width, 180);
assert.strictEqual(again.settings.theme, 'dark');
assert.strictEqual(again.created, back.created);
assert.deepStrictEqual(again.tables.map(function (t) { return t.id; }), ['t-people', 't-jobs']);

var built = Hot.toDb(back);
var adaLinks = M.backlinks(built.db, 't-people', 'r-ada');
assert.strictEqual(adaLinks.length, 2, 'Who and Team both point at Ada');
assert.ok(adaLinks.every(function (link) { return link.tableId === 't-jobs' && link.rowId === 'r-job'; }));
var linLinks = M.backlinks(built.db, 't-people', 'r-lin');
assert.strictEqual(linLinks.length, 1);
assert.strictEqual(linLinks[0].columnId, 'c-team');
assert.strictEqual(built.views['t-people'], 'cards');
assert.strictEqual(built.views['t-jobs'], 'grid');
assert.strictEqual(built.db.theme, 'dark');
assert.strictEqual(built.db.activeId, 't-jobs');
assert.strictEqual(M.display('link', 'r-ada', built.db.tables[1].columns[1], built.db), 'Ada');

var wide = Hot.parse(Hot.stringify({
  name: 'Wide',
  tables: [{ id: 't', name: 'T', columns: [{ id: 'c', name: 'C', type: 'text', width: 900 }], rows: [] }]
}));
assert.strictEqual(wide.tables[0].columns[0].width, 480);

function rejects(raw, label) {
  assert.throws(function () { Hot.parse(raw); }, function (e) {
    assert.ok(e.userMessage, label);
    return true;
  }, label);
}
rejects('{"version":1,"activeId":"t1","theme":"dark","tables":[{"id":"t1","name":"Table 1","columns":[],"rows":[]}]}', 'tables-v1 record');
rejects('{"format":"hot","version":2,"tables":[]}', 'newer version');
rejects('{"format":"hos","version":1,"sheets":[{"name":"A"}]}', 'spreadsheet file');
rejects('{"format":"how","version":1,"html":"<p></p>"}', 'writer file');
rejects('not json', 'not json');
rejects('{"format":"hot","version":1}', 'no tables array');

assert.strictEqual(Hot.fileName('Jobs 2026'), 'Jobs 2026.hot');
assert.strictEqual(Hot.fileName('Jobs 2026.hot'), 'Jobs 2026.hot');
assert.strictEqual(Hot.fileName('Q?.hot'), 'Q.hot');
assert.strictEqual(Hot.fileName(''), 'Tables.hot');
assert.strictEqual(Hot.isHot({ name: 'Jobs.hot' }), true);
assert.strictEqual(Hot.isHot({ name: 'Jobs.csv' }), false);
assert.strictEqual(Hot.FORMAT, 'hot');
assert.strictEqual(Hot.VERSION, 1);
assert.strictEqual(Native.stem('Q?.hot', 'hot', 'Tables'), Hot.stem('Q?.hot'));
assert.strictEqual(Native.stem('Jobs 2026', 'hot', 'Tables'), 'Jobs 2026');

var blank = M.blankDb();
assert.strictEqual(Hot.isBlank({
  settings: { theme: blank.theme },
  tables: [{ id: blank.tables[0].id, name: blank.tables[0].name, view: 'grid', columns: blank.tables[0].columns, rows: [] }]
}), true);
assert.strictEqual(Hot.isBlank({
  settings: { theme: 'dark' },
  tables: [{ id: 't', name: 'Table 1', view: 'grid', columns: blank.tables[0].columns, rows: [] }]
}), false);
assert.strictEqual(Hot.isBlank({
  settings: { theme: 'auto' },
  tables: [{ id: 't', name: 'Table 1', view: 'cards', columns: blank.tables[0].columns, rows: [] }]
}), false);

function read(rel) { return fs.readFileSync(path.join(dir, rel), 'utf8'); }
function live(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');
}

var app = read('tables.js');
var appLive = live(app);
assert.ok(app.indexOf('(before HOT1)') !== -1, 'old save path kept');
assert.strictEqual(appLive.indexOf('tables-v1'), -1);
assert.strictEqual(appLive.indexOf('localStorage.setItem'), -1);
assert.strictEqual(appLive.indexOf('M.loadFrom'), -1);
assert.strictEqual(appLive.indexOf('M.saveTo'), -1);
assert.ok(appLive.indexOf('function exportCsv') !== -1);
assert.ok(appLive.indexOf('function openImport') !== -1);
assert.ok(appLive.indexOf('M.toCsv') !== -1);
assert.ok(appLive.indexOf('M.previewCsv') !== -1);

var html = read('tables.html');
var htmlLive = live(html);
assert.ok(html.indexOf('(before HOT1)') !== -1);
assert.strictEqual(htmlLive.indexOf('tables-v1'), -1);
assert.ok(html.indexOf('id="btn-open-hot"') !== -1);
assert.ok(html.indexOf('id="btn-save"') !== -1);
assert.ok(html.indexOf('id="btn-save-as"') !== -1);
assert.ok(html.indexOf('id="hot-file"') !== -1);
assert.ok(html.indexOf('id="btn-import"') !== -1);
assert.ok(html.indexOf('id="btn-export"') !== -1);
assert.ok(html.indexOf('tables_hot.js') !== -1);
assert.ok(html.indexOf('office-native.js') !== -1);
assert.ok(html.indexOf('fs_drives.js') !== -1);
assert.ok(html.indexOf('fs_ops.js') !== -1);
assert.ok(html.indexOf('fs_ref.js') !== -1);
assert.strictEqual(html.indexOf('?v='), -1);
assert.ok(html.indexOf('<title>Tables</title>') !== -1);

var model = read('tables_model.js');
var modelLive = live(model);
assert.ok(modelLive.indexOf('function saveTo') !== -1, 'TB tests still round-trip tables-v1');
assert.ok(modelLive.indexOf('function loadFrom') !== -1);
assert.ok(modelLive.indexOf("STORAGE_KEY = 'tables-v1'") !== -1 || modelLive.indexOf('STORAGE_KEY = "tables-v1"') !== -1);

var typesSrc = fs.readFileSync(path.join(dir, '../../../shared/fs/filetypes.js'), 'utf8');
var typesCtx = { window: {} };
vm.createContext(typesCtx);
vm.runInContext(typesSrc, typesCtx);
var opened = typesCtx.window.FileTypes.apps('Jobs.hot');
assert.strictEqual(opened[0].id, 'tables');
assert.strictEqual(opened[0].name, 'Tables');
assert.strictEqual(opened[0].file, true);
assert.strictEqual(opened[0].url, 'apps/office/tables/');
var howApps = typesCtx.window.FileTypes.apps('Letter.how');
/* (before DF25) assert.strictEqual(howApps[0].id, 'draftly'); */
assert.strictEqual(howApps[0].id, 'writer');   /* DF25: Writer's Hub id */
assert.strictEqual(typesCtx.window.FileTypes.app('draftly').id, 'writer');   /* DF25: old id is an alias */
var hosApps = typesCtx.window.FileTypes.apps('Budget.hos');
assert.strictEqual(hosApps[0].id, 'spreadsheet');
var jsonApps = typesCtx.window.FileTypes.apps('notes.json');
assert.strictEqual(jsonApps[0].id, 'notely', '.json stays with Notely');
var csvApps = typesCtx.window.FileTypes.apps('rows.csv');
assert.strictEqual(csvApps[0].id, 'notely', '.csv association is unchanged');
var pngApps = typesCtx.window.FileTypes.apps('cat.png');
assert.strictEqual(pngApps[0].id, 'viewer');

var desc = 'Simple spreadsheet-style database: native .hot files - CSV import or export';
assert.ok(desc.length < 90, desc.length);
assert.strictEqual(desc.indexOf(','), -1);
var csv = fs.readFileSync(path.join(dir, '../office-apps.csv'), 'utf8');
assert.ok(csv.indexOf(desc) !== -1);
assert.ok(csv.indexOf('(before HOT1)') !== -1);
var index = fs.readFileSync(path.join(dir, '../../../hub/core/hub_appindex.js'), 'utf8');
assert.ok(index.indexOf(desc) !== -1);
assert.ok(index.indexOf('"tables":') !== -1);
assert.ok(index.indexOf('apps/office/tables/tables_icon.svg') !== -1);
var catalog = fs.readFileSync(path.join(dir, '../../../hub/core/hub_catalog.js'), 'utf8');
assert.ok(catalog.indexOf(desc) !== -1);

var actions = fs.readFileSync(path.join(dir, '../../system/files/files_actions.js'), 'utf8');
assert.ok(actions.indexOf('HOT1') !== -1);
assert.ok(live(actions).indexOf('FsRef.openIn') !== -1);

console.log('hot1 format checks passed');
