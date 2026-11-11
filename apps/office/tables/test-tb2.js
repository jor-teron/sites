/* Node tests for Tables TB2 (tables_model.js).
   Run: node test-tb2.js
   No DOM, no jsdom, no browser. */
'use strict';

var M = require('./tables_model.js');
var fails = [];

function eq(name, a, b) {
  var sa = JSON.stringify(a);
  var sb = JSON.stringify(b);
  if (sa !== sb) fails.push(name + '\n  got ' + sa + '\n  expected ' + sb);
  else console.log('ok', name);
}

function ok(name, cond, detail) {
  if (cond) console.log('ok', name);
  else fails.push(name + (detail ? ' ' + detail : ''));
}

function ids(rows) {
  return rows.map(function (row) { return row.id; });
}

function memory() {
  return {
    data: {},
    setItem: function (k, v) { this.data[k] = String(v); },
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null; }
  };
}

// ---- row ids and migration from TB1 data ----
eq('storage key stays tables-v1', M.STORAGE_KEY, 'tables-v1');

var legacy = {
  version: 1,
  activeId: 't1',
  theme: 'light',
  tables: [{
    id: 't1',
    name: 'People',
    columns: [{ id: 'c1', name: 'Name', type: 'text' }],
    rows: [
      { id: 'r-stable', cells: { c1: 'Ada' } },
      { cells: { c1: 'Bea' } },
      { cells: { c1: 'Cio' } }
    ]
  }]
};

var migrated = M.migrate(legacy);
eq('migrate keeps theme', migrated.theme, 'light');
eq('migrate keeps table', migrated.tables[0].name, 'People');
eq('migrate keeps existing row id', migrated.tables[0].rows[0].id, 'r-stable');
eq('migrate keeps existing cell', migrated.tables[0].rows[0].cells.c1, 'Ada');
ok('migrate assigns missing row id', !!migrated.tables[0].rows[1].id && migrated.tables[0].rows[1].id !== 'r-stable');
ok('migrate assigns a second distinct id', migrated.tables[0].rows[2].id && migrated.tables[0].rows[2].id !== migrated.tables[0].rows[1].id);
eq('migrate keeps the value on a row that had no id', migrated.tables[0].rows[1].cells.c1, 'Bea');

var again = M.migrate(JSON.parse(M.serialize(migrated)));
eq('migrate is stable for the new id', again.tables[0].rows[1].id, migrated.tables[0].rows[1].id);
eq('migrate is stable for the old id', again.tables[0].rows[0].id, 'r-stable');

var made = M.blankDb();
var madeTable = M.activeTable(made);
var madeRow = M.addRow(madeTable, {});
M.setCell(madeTable, madeRow.id, madeTable.columns[0].id, 'From TB1');
var tb1Json = M.serialize(made);
var fromTb1 = M.migrate(JSON.parse(tb1Json));
eq('TB1 save keeps its row id', fromTb1.tables[0].rows[0].id, madeRow.id);
eq('TB1 save keeps its text', fromTb1.tables[0].rows[0].cells[madeTable.columns[0].id], 'From TB1');

var store = memory();
store.setItem('tables-v1', JSON.stringify(legacy));
var loadedLegacy = M.loadFrom(store);
ok('loadFrom reads tables-v1', !loadedLegacy.error);
eq('loadFrom keeps stable id', loadedLegacy.db.tables[0].rows[0].id, 'r-stable');
ok('loadFrom fills a missing id', !!loadedLegacy.db.tables[0].rows[1].id);
M.saveTo(store, loadedLegacy.db);
eq('save still uses only tables-v1', Object.keys(store.data), ['tables-v1']);
ok('old key still holds the rows', store.data['tables-v1'].indexOf('r-stable') !== -1);
ok('no tables-v2 key', !Object.prototype.hasOwnProperty.call(store.data, 'tables-v2'));

// ---- links: set, display, search, multi, backlinks ----
var db = M.blankDb();
var people = M.activeTable(db);
people.name = 'People';
var personName = people.columns[0];
var ada = M.addRow(people, {});
var lin = M.addRow(people, {});
var noName = M.addRow(people, {});
M.setCell(people, ada.id, personName.id, 'Ada');
M.setCell(people, lin.id, personName.id, 'Lin');

var orders = M.addTable(db, 'Orders');
var title = orders.columns[0];
title.name = 'Title';
var who = M.addColumn(orders, 'Who', 'link', null, { linkTable: people.id, multiple: false });
var team = M.addColumn(orders, 'Team', 'link', null, { linkTable: people.id, multiple: true });
eq('link column points at people', who.linkTable, people.id);
eq('single link is not multiple', who.multiple, false);
eq('team allows several', team.multiple, true);

var orderA = M.addRow(orders, {});
var orderB = M.addRow(orders, {});
M.setCell(orders, orderA.id, title.id, 'Alpha');
M.setCell(orders, orderB.id, title.id, 'Beta');

var linked = M.setCell(orders, orderA.id, who.id, ada.id, db);
ok('set single link', linked.ok);
eq('single link stores the row id', orderA.cells[who.id], ada.id);
eq('single link displays the first column', M.display('link', orderA.cells[who.id], who, db), 'Ada');

var rejected = M.setCell(orders, orderA.id, who.id, 'missing-row', db);
ok('unknown link is rejected', !rejected.ok);
eq('rejected link keeps the previous id', orderA.cells[who.id], ada.id);
ok('two ids do not fit a single link', !M.setCell(orders, orderA.id, who.id, [ada.id, lin.id], db).ok);
eq('single link unchanged after a multi attempt', orderA.cells[who.id], ada.id);

var multi = M.setCell(orders, orderA.id, team.id, [ada.id, lin.id, ada.id], db);
ok('set multi link', multi.ok);
eq('multi link stores each id once', orderA.cells[team.id], [ada.id, lin.id]);
eq('multi link display joins names', M.display('link', orderA.cells[team.id], team, db), 'Ada, Lin');
ok('bad id in a multi link is rejected', !M.setCell(orders, orderA.id, team.id, [ada.id, 'nope'], db).ok);
eq('rejected multi link keeps the previous ids', orderA.cells[team.id], [ada.id, lin.id]);

M.setCell(orders, orderB.id, who.id, noName.id, db);
eq('blank display field still shows a link', M.display('link', orderB.cells[who.id], who, db), '(blank)');

eq('search uses the link display', ids(M.visibleRows(orders, 'ada', [], null, db)), [orderA.id]);
eq('search is case insensitive on links', ids(M.visibleRows(orders, 'LIN', [], null, db)), [orderA.id]);
eq('search miss on links', M.visibleRows(orders, 'zzz', [], null, db).length, 0);
eq('filter link contains', ids(M.visibleRows(orders, '', [{ colId: who.id, op: 'contains', value: 'ad' }], null, db)), [orderA.id]);
eq('filter link equals the display', ids(M.visibleRows(orders, '', [{ colId: team.id, op: 'equals', value: 'Ada, Lin' }], null, db)), [orderA.id]);
eq('filter link equals is not the raw id', M.visibleRows(orders, '', [{ colId: who.id, op: 'equals', value: ada.id }], null, db).length, 0);

var backs = M.backlinks(db, people.id, ada.id);
eq('backlink count', backs.length, 2);
eq('backlink tables', backs.map(function (item) { return item.tableName; }), ['Orders', 'Orders']);
eq('backlink columns', backs.map(function (item) { return item.columnName; }).sort(), ['Team', 'Who']);
eq('backlink rows', backs.map(function (item) { return item.rowId; }), [orderA.id, orderA.id]);
eq('links pointing at Ada', M.linksPointingAt(db, people.id, [ada.id]), 2);
eq('Lin is on the team only', M.backlinks(db, people.id, lin.id).map(function (item) { return item.columnName; }), ['Team']);

var self = M.addColumn(people, 'Pal', 'link', null, { linkTable: people.id, multiple: false });
M.setCell(people, lin.id, self.id, ada.id, db);
eq('same-table link is not a backlink from another table', M.backlinks(db, people.id, ada.id).length, 2);

var choices = M.linkChoices(db, who, 'ad');
eq('link choices search the display', choices.map(function (item) { return item.label; }), ['Ada']);
eq('link choice id', choices[0].id, ada.id);

// ---- delete target clears links; rename keeps them ----
var csv = M.toCsv(orders, db);
ok('csv export writes the display text', csv.indexOf('Ada, Lin') !== -1 && csv.indexOf('Ada') !== -1);
ok('csv export does not write the row id', csv.indexOf(ada.id) === -1 && csv.indexOf(lin.id) === -1);

eq('clears before delete', M.linksPointingAt(db, people.id, [ada.id]), 3);
eq('delete note counts a same-table link too', M.linksPointingAt(db, people.id, [ada.id]), M.backlinks(db, people.id, ada.id).length + 1);
var removed = M.deleteRows(people, [ada.id], db);
eq('deleted one person', removed, 1);
eq('single link to Ada is cleared', orderA.cells[who.id], null);
eq('same-table link to Ada is cleared', lin.cells[self.id], null);
eq('multi link drops Ada and keeps Lin', orderA.cells[team.id], [lin.id]);
eq('other link is untouched', orderB.cells[who.id], noName.id);
eq('no backlinks left for Ada', M.backlinks(db, people.id, ada.id).length, 0);
eq('Lin backlink remains', M.backlinks(db, people.id, lin.id).length, 1);
eq('display after delete is Lin', M.display('link', orderA.cells[team.id], team, db), 'Lin');

var whoTable = who.linkTable;
var whoValue = orderB.cells[who.id];
ok('rename table', M.renameTable(db, people.id, 'Folks').ok);
ok('rename display column', M.renameColumn(people, personName.id, 'Full name').ok);
ok('rename link column', M.renameColumn(orders, who.id, 'Person').ok);
eq('rename keeps the link target id', who.linkTable, whoTable);
eq('rename keeps the stored row id', orderB.cells[who.id], whoValue);
eq('rename keeps the team ids', orderA.cells[team.id], [lin.id]);
eq('display still uses the first column value', M.display('link', orderA.cells[team.id], team, db), 'Lin');
eq('backlink uses the new table name', M.backlinks(db, people.id, lin.id)[0].tableName, 'Orders');
eq('backlink uses the renamed column', M.backlinks(db, people.id, noName.id)[0].columnName, 'Person');

ok('delete the people table', M.deleteTable(db, people.id).ok);
eq('deleting the target table clears links', orderA.cells[team.id], null);
eq('deleting the target table clears the other link', orderB.cells[who.id], null);
ok('orders table is still there', !!M.findTable(db, orders.id));

// ---- cards use the same filter and sort ----
var fresh = M.blankDb();
var folks = M.activeTable(fresh);
folks.name = 'Folks';
var folkName = folks.columns[0];
function person(name) {
  var row = M.addRow(folks, {});
  M.setCell(folks, row.id, folkName.id, name);
  return row;
}
var pAda = person('Ada');
var pLin = person('Lin');
var pBea = person('Bea');
var jobs = M.addTable(fresh, 'Jobs');
var jobName = jobs.columns[0];
var owner = M.addColumn(jobs, 'Owner', 'link', null, { linkTable: folks.id, multiple: false });
function job(name, ownerRow) {
  var row = M.addRow(jobs, {});
  M.setCell(jobs, row.id, jobName.id, name);
  if (ownerRow) M.setCell(jobs, row.id, owner.id, ownerRow.id, fresh);
  return row;
}
var jLin = job('Paint', pLin);
var jAda = job('Bake', pAda);
var jNone = job('Wait', null);
var jBea = job('Mend', pBea);

var sort = { colId: owner.id, dir: 'asc' };
var filtered = [{ colId: owner.id, op: 'contains', value: 'a' }];
eq('card rows match visible rows', ids(M.cardRows(jobs, '', [], sort, fresh)), ids(M.visibleRows(jobs, '', [], sort, fresh)));
eq('card sort is by display, blanks last', ids(M.cardRows(jobs, '', [], sort, fresh)), [jAda.id, jBea.id, jLin.id, jNone.id]);
eq('card sort desc blanks last', ids(M.cardRows(jobs, '', [], { colId: owner.id, dir: 'desc' }, fresh)), [jLin.id, jBea.id, jAda.id, jNone.id]);
eq('card filter matches visible rows', ids(M.cardRows(jobs, '', filtered, sort, fresh)), ids(M.visibleRows(jobs, '', filtered, sort, fresh)));
eq('card filter uses link display', ids(M.cardRows(jobs, '', filtered, null, fresh)), [jAda.id, jBea.id]);
eq('card search and sort together', ids(M.cardRows(jobs, 'e', [], { colId: jobName.id, dir: 'asc' }, fresh)), ids(M.visibleRows(jobs, 'e', [], { colId: jobName.id, dir: 'asc' }, fresh)));
eq('card search and sort order', ids(M.cardRows(jobs, 'e', [], { colId: jobName.id, dir: 'asc' }, fresh)), [jAda.id, jBea.id]);

// ---- CSV import never creates a Link column ----
var preview = M.previewCsv('Name,Who\nAda,Lin\nAda,Bea\nAda,Lin\nAda,Bea\n');
ok('preview ok', preview.ok);
ok('guess never returns link', preview.columns.every(function (col) { return col.type !== 'link'; }));
eq('guess words stay off link', M.guessType(['Ada', 'Lin', 'Ada', 'Bea']).type === 'link', false);
var forced = M.tableFromPreview(preview, {
  name: 'Imported',
  columns: [
    { name: 'Name', type: 'link' },
    { name: 'Who', type: 'link', linkTable: 'nope', multiple: true }
  ]
});
eq('import coerces link types to text', forced.table.columns.map(function (col) { return col.type; }), ['text', 'text']);
eq('import keeps the text', forced.table.rows[0].cells[forced.table.columns[1].id], 'Lin');
ok('import did not keep link metadata', !forced.table.columns[0].linkTable && !forced.table.columns[1].multiple);

var round = memory();
M.saveTo(round, fresh);
var back = M.loadFrom(round);
ok('link round trip', !back.error);
var backJobs = back.db.tables[1];
var backOwner = backJobs.columns.filter(function (col) { return col.name === 'Owner'; })[0];
eq('saved link type', backOwner.type, 'link');
eq('saved link target', backOwner.linkTable, folks.id);
eq('saved link value', backJobs.rows[0].cells[backOwner.id], pLin.id);
eq('only tables-v1 after a link save', Object.keys(round.data), ['tables-v1']);

if (fails.length) {
  console.error('\n' + fails.length + ' failed');
  fails.forEach(function (f) { console.error('FAIL', f); });
  process.exit(1);
}
console.log('\nAll TB2 model tests passed');
