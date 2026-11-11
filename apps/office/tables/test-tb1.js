/* Node smoke tests for Tables TB1 (tables_model.js).
   Run: node test-tb1.js
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

function colByName(table, name) {
  for (var i = 0; i < table.columns.length; i++) {
    if (table.columns[i].name === name) return table.columns[i];
  }
  return null;
}

function values(table, col) {
  return table.rows.map(function (row) { return row.cells[col.id]; });
}

// ---- type validation ----
eq('text keeps words', M.validate('text', '  hello ', null), { ok: true, value: '  hello ' });
eq('text empty clears', M.validate('text', '   ', null), { ok: true, value: null });
eq('text null clears', M.validate('text', null, null), { ok: true, value: null });

eq('number 12', M.validate('number', '12', null), { ok: true, value: 12 });
eq('number decimal', M.validate('number', '12.5', null), { ok: true, value: 12.5 });
eq('number negative', M.validate('number', '-3', null), { ok: true, value: -3 });
eq('number commas', M.validate('number', '1,000', null), { ok: true, value: 1000 });
eq('number plus', M.validate('number', '+4', null), { ok: true, value: 4 });
eq('number already number', M.validate('number', 8, null), { ok: true, value: 8 });
eq('number blank', M.validate('number', '', null), { ok: true, value: null });
ok('number rejects abc', !M.validate('number', 'abc', null).ok);
ok('number rejects 12a', !M.validate('number', '12a', null).ok);
ok('number rejects two dots', !M.validate('number', '1.2.3', null).ok);
eq('number message', M.validate('number', 'nope', null).message, 'Enter a number');

eq('date iso', M.validate('date', '2026-11-11', null), { ok: true, value: '2026-11-11' });
eq('date dmy', M.validate('date', '11/11/2026', null), { ok: true, value: '2026-11-11' });
eq('date dmy dash', M.validate('date', '2-1-2026', null), { ok: true, value: '2026-01-02' });
ok('date rejects 2026-02-30', !M.validate('date', '2026-02-30', null).ok);
ok('date rejects 2026-13-01', !M.validate('date', '2026-13-01', null).ok);
ok('date leap ok', M.validate('date', '2024-02-29', null).ok);
ok('date non-leap', !M.validate('date', '2025-02-29', null).ok);
ok('date rejects slash us-looking text', !M.validate('date', 'November 11', null).ok);

eq('yes true', M.validate('yesno', true, null), { ok: true, value: true });
eq('yes word', M.validate('yesno', 'Yes', null), { ok: true, value: true });
eq('no word', M.validate('yesno', 'false', null), { ok: true, value: false });
eq('yes y', M.validate('yesno', 'y', null), { ok: true, value: true });
ok('yes rejects maybe', !M.validate('yesno', 'maybe', null).ok);
ok('yes rejects 1', !M.validate('yesno', '1', null).ok);
eq('yes blank', M.validate('yesno', '', null), { ok: true, value: null });

eq('choice match', M.validate('choice', 'Open', ['Open', 'Done']), { ok: true, value: 'Open' });
eq('choice case folds to option', M.validate('choice', 'done', ['Open', 'Done']), { ok: true, value: 'Done' });
ok('choice rejects other', !M.validate('choice', 'Later', ['Open', 'Done']).ok);
eq('choice blank', M.validate('choice', '', ['Open']), { ok: true, value: null });

eq('display yes', M.display('yesno', true), 'Yes');
eq('display no', M.display('yesno', false), 'No');
eq('display empty', M.display('number', null), '');
eq('display number', M.display('number', 1000), '1000');

// invalid input is not saved
var db = M.blankDb();
var table = M.activeTable(db);
var amount = colByName(table, 'Amount');
var row = M.addRow(table, {});
var before = row.cells[amount.id];
var bad = M.setCell(table, row.id, amount.id, 'abc');
ok('invalid setCell fails', !bad.ok);
eq('invalid setCell leaves cell', row.cells[amount.id], before == null ? null : before);
eq('invalid setCell still null', row.cells[amount.id] == null ? null : row.cells[amount.id], null);
var good = M.setCell(table, row.id, amount.id, '15.5');
ok('valid setCell', good.ok);
eq('valid setCell stores number', row.cells[amount.id], 15.5);
var cleared = M.setCell(table, row.id, amount.id, '  ');
ok('blank clears', cleared.ok && row.cells[amount.id] == null);

var done = colByName(table, 'Done');
M.setCell(table, row.id, done.id, true);
eq('checkbox true', row.cells[done.id], true);
M.setCell(table, row.id, done.id, false);
eq('checkbox false', row.cells[done.id], false);

var status = M.addColumn(table, 'Status', 'choice', ['Open', 'Done']);
var choiceBad = M.setCell(table, row.id, status.id, 'Later');
ok('choice not saved', !choiceBad.ok && (row.cells[status.id] == null));
M.setCell(table, row.id, status.id, 'Open');
eq('choice saved', row.cells[status.id], 'Open');

// ---- sort ----
function mini() {
  var t = M.createTable('Sort', [
    M.column('Name', 'text'),
    M.column('Amount', 'number'),
    M.column('When', 'date'),
    M.column('Done', 'yesno'),
    M.column('Status', 'choice', ['Low', 'High'])
  ]);
  function put(name, amount, when, doneFlag, statusValue) {
    var cells = {};
    cells[t.columns[0].id] = name;
    cells[t.columns[1].id] = amount;
    cells[t.columns[2].id] = when;
    cells[t.columns[3].id] = doneFlag;
    cells[t.columns[4].id] = statusValue;
    M.addRow(t, cells);
  }
  put('b', 10, '2026-01-02', false, 'High');
  put('A', 2, '2026-03-01', true, 'Low');
  put('c', null, '2026-01-02', null, null);
  put('a', 2, null, false, 'Low');
  return t;
}

var sortTable = mini();
var nameCol = sortTable.columns[0];
var numCol = sortTable.columns[1];
var dateCol = sortTable.columns[2];
var ynCol = sortTable.columns[3];
var originalIds = sortTable.rows.map(function (r) { return r.id; });

eq('sort text asc', M.sortRows(sortTable, sortTable.rows, nameCol.id, 'asc').map(function (r) { return r.cells[nameCol.id]; }), ['A', 'a', 'b', 'c']);
eq('sort text desc blanks last', M.sortRows(sortTable, sortTable.rows, nameCol.id, 'desc').map(function (r) { return r.cells[nameCol.id]; }), ['c', 'b', 'A', 'a']);
eq('sort number asc blanks last', M.sortRows(sortTable, sortTable.rows, numCol.id, 'asc').map(function (r) { return r.cells[numCol.id]; }), [2, 2, 10, null]);
eq('sort number desc blanks last', M.sortRows(sortTable, sortTable.rows, numCol.id, 'desc').map(function (r) { return r.cells[numCol.id]; }), [10, 2, 2, null]);
eq('sort number stable', M.sortRows(sortTable, sortTable.rows, numCol.id, 'asc').slice(0, 2).map(function (r) { return r.cells[nameCol.id]; }), ['A', 'a']);
eq('sort date asc', M.sortRows(sortTable, sortTable.rows, dateCol.id, 'asc').map(function (r) { return r.cells[dateCol.id]; }), ['2026-01-02', '2026-01-02', '2026-03-01', null]);
eq('sort yes asc unchecked first', M.sortRows(sortTable, sortTable.rows, ynCol.id, 'asc').map(function (r) { return r.cells[ynCol.id]; }), [false, false, true, null]);
eq('sort does not mutate stored order', sortTable.rows.map(function (r) { return r.id; }), originalIds);

// ---- filter and search ----
var filters = [{ colId: numCol.id, op: 'gt', value: '2' }];
eq('filter number >', M.visibleRows(sortTable, '', filters, null).map(function (r) { return r.cells[nameCol.id]; }), ['b']);
eq('filter number <', M.visibleRows(sortTable, '', [{ colId: numCol.id, op: 'lt', value: '10' }], null).map(function (r) { return r.cells[numCol.id]; }), [2, 2]);
eq('filter number equals', M.visibleRows(sortTable, '', [{ colId: numCol.id, op: 'equals', value: '2' }], null).length, 2);
eq('filter contains name', M.visibleRows(sortTable, '', [{ colId: nameCol.id, op: 'contains', value: 'A' }], null).map(function (r) { return r.cells[nameCol.id]; }), ['A', 'a']);
eq('filter equals text case', M.visibleRows(sortTable, '', [{ colId: nameCol.id, op: 'equals', value: 'a' }], null).map(function (r) { return r.cells[nameCol.id]; }), ['A', 'a']);
eq('filter date >', M.visibleRows(sortTable, '', [{ colId: dateCol.id, op: 'gt', value: '2026-01-02' }], null).map(function (r) { return r.cells[dateCol.id]; }), ['2026-03-01']);
eq('filter date < dmy', M.visibleRows(sortTable, '', [{ colId: dateCol.id, op: 'lt', value: '01/02/2026' }], null).map(function (r) { return r.cells[dateCol.id]; }), ['2026-01-02', '2026-01-02']);
eq('filter checked', M.visibleRows(sortTable, '', [{ colId: ynCol.id, op: 'checked' }], null).map(function (r) { return r.cells[nameCol.id]; }), ['A']);
eq('filter unchecked includes blank', M.visibleRows(sortTable, '', [{ colId: ynCol.id, op: 'unchecked' }], null).length, 3);
eq('empty filter value is inactive', M.visibleRows(sortTable, '', [{ colId: numCol.id, op: 'gt', value: '  ' }], null).length, 4);
eq('search case', M.visibleRows(sortTable, 'HIGH', [], null).map(function (r) { return r.cells[nameCol.id]; }), ['b']);
eq('search yes display', M.visibleRows(sortTable, 'yes', [], null).map(function (r) { return r.cells[nameCol.id]; }), ['A']);
eq('search and filter AND', M.visibleRows(sortTable, 'a', [{ colId: numCol.id, op: 'equals', value: '2' }], null).map(function (r) { return r.cells[nameCol.id]; }), ['A', 'a']);
eq('search miss', M.visibleRows(sortTable, 'zzz', [], null).length, 0);
eq('filter then sort', M.visibleRows(sortTable, '', [{ colId: numCol.id, op: 'lt', value: '100' }], { colId: nameCol.id, dir: 'asc' }).map(function (r) { return r.cells[nameCol.id]; }), ['A', 'a', 'b']);

// ---- CSV parse / export with quotes ----
var quoted = 'Name,Note\r\n"Smith, Anna","She said ""hi""\nand left"\r\nplain,ok\r\n';
var parsed = M.parseCsv(quoted);
eq('csv rows', parsed.length, 3);
eq('csv quoted comma', parsed[1][0], 'Smith, Anna');
eq('csv escaped quote and newline', parsed[1][1], 'She said "hi"\nand left');
eq('csv plain', parsed[2], ['plain', 'ok']);
eq('csv bom stripped', M.parseCsv('\uFEFFA,B\n1,2\n'), [['A', 'B'], ['1', '2']]);
eq('csv empty fields', M.parseCsv('a,,c\n,"",\n'), [['a', '', 'c'], ['', '', '']]);
eq('csv trailing newline dropped', M.parseCsv('a,b\n').length, 1);

var exportTable = M.createTable('People', [
  M.column('Name', 'text'),
  M.column('Note', 'text'),
  M.column('Amount', 'number'),
  M.column('Done', 'yesno')
]);
var cells = {};
cells[exportTable.columns[0].id] = 'Smith, Anna';
cells[exportTable.columns[1].id] = 'She said "hi"';
cells[exportTable.columns[2].id] = 12.5;
cells[exportTable.columns[3].id] = true;
M.addRow(exportTable, cells);
var csv = M.toCsv(exportTable);
ok('export quotes comma', csv.indexOf('"Smith, Anna"') !== -1);
ok('export doubles quotes', csv.indexOf('"She said ""hi"""') !== -1);
var back = M.parseCsv(csv);
eq('export round trip header', back[0], ['Name', 'Note', 'Amount', 'Done']);
eq('export round trip row', back[1], ['Smith, Anna', 'She said "hi"', '12.5', 'Yes']);

var imported = 'Item,Qty,When,Flag,Status\n' +
  'Pen,2,2026-01-05,Yes,Open\n' +
  '"Pencil, red",3,2026-02-01,No,Open\n' +
  'Pen,4,05/01/2026,yes,Done\n' +
  'Pen,1,2026-03-01,no,Open\n';
var preview = M.previewCsv(imported);
ok('preview ok', preview.ok);
eq('guess types', preview.columns.map(function (c) { return c.type; }), ['choice', 'number', 'date', 'yesno', 'choice']);
eq('guess choice options', preview.columns[0].options, ['Pen', 'Pencil, red']);
var built = M.tableFromPreview(preview, {
  name: 'Stock',
  columns: preview.columns.map(function (c) { return { name: c.name, type: c.type, options: c.options }; })
});
eq('import name', built.table.name, 'Stock');
eq('import rows', built.table.rows.length, 4);
eq('import skipped none', built.skipped, 0);
eq('import quoted name', built.table.rows[1].cells[built.table.columns[0].id], 'Pencil, red');
eq('import number', built.table.rows[1].cells[built.table.columns[1].id], 3);
eq('import date dmy', built.table.rows[2].cells[built.table.columns[2].id], '2026-01-05');
eq('import yes', built.table.rows[0].cells[built.table.columns[3].id], true);
var asText = M.tableFromPreview(preview, {
  name: 'Stock',
  columns: preview.columns.map(function (c) { return { name: c.name, type: 'text', options: [] }; })
});
eq('user can change guessed type', asText.table.columns.map(function (c) { return c.type; }), ['text', 'text', 'text', 'text', 'text']);
eq('changed type keeps text', asText.table.rows[1].cells[asText.table.columns[1].id], '3');
var messy = M.previewCsv('Qty,Name\n2,Pen\nx,"Smith, Anna"\n4,Pen\n');
var forced = M.tableFromPreview(messy, {
  name: 'Messy',
  columns: [
    { name: 'Qty', type: 'number' },
    { name: 'Name', type: 'text' }
  ]
});
eq('invalid number not saved on import', forced.skipped, 1);
eq('invalid number cell blank', forced.table.rows[1].cells[forced.table.columns[0].id], null);
eq('quoted neighbour kept', forced.table.rows[1].cells[forced.table.columns[1].id], 'Smith, Anna');

eq('guess words yesno', M.guessType(['Yes', 'no', 'True']).type, 'yesno');
eq('guess numbers not yesno', M.guessType(['0', '1', '2']).type, 'number');
eq('guess names stay text', M.guessType(['Anna', 'Ben', 'Cara']).type, 'text');
eq('choice lines keep commas', M.cleanOptions('Pen\nPencil, red\npen'), ['Pen', 'Pencil, red']);
eq('empty csv', M.previewCsv('').ok, false);

// retype clears values that no longer fit, and does not keep them
var retype = M.createTable('R', [M.column('A', 'text')]);
M.addRow(retype, (function () { var o = {}; o[retype.columns[0].id] = '12'; return o; })());
M.addRow(retype, (function () { var o = {}; o[retype.columns[0].id] = 'nope'; return o; })());
eq('count clears', M.countRetypeClears(retype, retype.columns[0].id, 'number'), 1);
var retyped = M.setColumnType(retype, retype.columns[0].id, 'number');
eq('retype cleared', retyped.cleared, 1);
eq('retype values', values(retype, retype.columns[0]), [12, null]);

// ---- save / load round trip ----
var saved = M.blankDb();
saved.theme = 'dark';
var t1 = M.activeTable(saved);
var name = colByName(t1, 'Name');
var amt = colByName(t1, 'Amount');
var when = colByName(t1, 'Date');
var flag = colByName(t1, 'Done');
var choice = M.addColumn(t1, 'Status', 'choice', ['Open', 'Done']);
var r1cells = {};
r1cells[name.id] = 'Ada';
r1cells[amt.id] = 42;
r1cells[when.id] = '2026-11-11';
r1cells[flag.id] = true;
r1cells[choice.id] = 'Open';
M.addRow(t1, r1cells);
var r2 = M.addRow(t1, {});
M.setCell(t1, r2.id, name.id, 'Lin, "Q"');
var t2 = M.addTable(saved, 'Other');
saved.activeId = t2.id;
M.renameTable(saved, t2.id, 'Notes');

var memory = {
  data: {},
  setItem: function (k, v) { this.data[k] = String(v); },
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null; }
};
M.saveTo(memory, saved);
ok('storage key tables-v1', Object.prototype.hasOwnProperty.call(memory.data, 'tables-v1'));
eq('no other keys', Object.keys(memory.data), ['tables-v1']);
var loaded = M.loadFrom(memory);
ok('load ok', !loaded.error);
eq('round trip theme', loaded.db.theme, 'dark');
eq('round trip active', loaded.db.activeId, t2.id);
eq('round trip names', loaded.db.tables.map(function (t) { return t.name; }), ['Table 1', 'Notes']);
var backTable = loaded.db.tables[0];
eq('round trip columns', backTable.columns.map(function (c) { return c.name + ':' + c.type; }), ['Name:text', 'Amount:number', 'Date:date', 'Done:yesno', 'Status:choice']);
eq('round trip options', backTable.columns[4].options, ['Open', 'Done']);
eq('round trip row 1', backTable.rows[0].cells, r1cells);
eq('round trip quoted text', backTable.rows[1].cells[name.id], 'Lin, "Q"');
eq('serialize parse same', M.load(M.serialize(saved)), loaded.db);

var damaged = {
  data: { 'tables-v1': '{not json' },
  setItem: function (k, v) { this.data[k] = v; },
  getItem: function (k) { return this.data[k]; }
};
var badLoad = M.loadFrom(damaged);
eq('damaged flagged', badLoad.error, 'damaged');
ok('damaged still gives a table', badLoad.db.tables.length === 1 && badLoad.db.tables[0].name === 'Table 1');
eq('empty storage', M.loadFrom({ getItem: function () { return null; } }).empty, true);

var dirty = M.serialize({
  version: 1,
  activeId: 't1',
  theme: 'light',
  tables: [{
    id: 't1',
    name: 'Dirty',
    columns: [{ id: 'c1', name: 'N', type: 'number' }],
    rows: [{ id: 'r1', cells: { c1: 'nope' } }, { id: 'r2', cells: { c1: 3 } }]
  }]
});
var cleaned = M.load(dirty);
eq('load drops invalid number', cleaned.tables[0].rows[0].cells.c1, null);
eq('load keeps valid number', cleaned.tables[0].rows[1].cells.c1, 3);

// tables: add / rename / delete do not need the DOM
var many = M.blankDb();
var extra = M.addTable(many, '');
eq('default new name', extra.name, 'Table 2');
ok('rename', M.renameTable(many, extra.id, 'People').ok && extra.name === 'People');
ok('rename empty refused', !M.renameTable(many, extra.id, '  ').ok && extra.name === 'People');
ok('delete', M.deleteTable(many, extra.id).ok);
eq('active falls back', many.activeId, many.tables[0].id);
ok('delete missing', !M.deleteTable(many, 'nope').ok);

if (fails.length) {
  console.error('\n' + fails.length + ' failed');
  fails.forEach(function (f) { console.error('FAIL', f); });
  process.exit(1);
}
console.log('\nAll TB1 model tests passed');
