/* Node tests for Tables TB4 (tables_model.js).
   Run: node test-tb4.js
   No DOM, no jsdom, no browser.
   Date rules follow Spreadsheet fxParseDate / formatCellValue fmt "date"
   (YYYY-MM-DD), plus day month-name year ("11 Nov 2026").
   Year 0001 is never stored. That was the native <input type="date"> bug:
   the year segment showed 07/05/0001 and the value was not saved. */
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

function saved(raw) {
  return M.validate('date', raw, null);
}

function colByName(table, name) {
  for (var i = 0; i < table.columns.length; i++) {
    if (table.columns[i].name === name) return table.columns[i];
  }
  return null;
}

eq('storage key stays tables-v1', M.STORAGE_KEY, 'tables-v1');

/* Spreadsheet string forms. Display is the Date format YYYY-MM-DD. */
eq('iso', saved('2026-11-11'), { ok: true, value: '2026-11-11' });
eq('iso single digits', saved('2026-1-2'), { ok: true, value: '2026-01-02' });
eq('dmy slash', saved('11/11/2026'), { ok: true, value: '2026-11-11' });
eq('dmy dash', saved('2-1-2026'), { ok: true, value: '2026-01-02' });
eq('dmy dot', saved('11.11.2026'), { ok: true, value: '2026-11-11' });
eq('dmy swap when month is past 12', saved('11/13/2026'), { ok: true, value: '2026-11-13' });
eq('dmy day 13 stays', saved('13/11/2026'), { ok: true, value: '2026-11-13' });
eq('iso with time keeps the date', saved('2026-11-11 14:05'), { ok: true, value: '2026-11-11' });
eq('screenshot real date 07/05/2026', saved('07/05/2026'), { ok: true, value: '2026-05-07' });

/* Month names. Spreadsheet's fxParseDate does not read these; TB4 does. */
eq('11 Nov 2026', saved('11 Nov 2026'), { ok: true, value: '2026-11-11' });
eq('11 November 2026', saved('11 November 2026'), { ok: true, value: '2026-11-11' });
eq('7 May 2026', saved('7 May 2026'), { ok: true, value: '2026-05-07' });
eq('Nov 11, 2026', saved('Nov 11, 2026'), { ok: true, value: '2026-11-11' });
eq('11-Nov-2026', saved('11-Nov-2026'), { ok: true, value: '2026-11-11' });

/* Excel serial, same as Spreadsheet (2026-11-10 is serial 46336). */
eq('excel serial 46336', saved(46336), { ok: true, value: '2026-11-10' });
eq('excel serial typed as text', saved('46336'), { ok: true, value: '2026-11-10' });

eq('display iso', M.display('date', '2026-11-11'), '2026-11-11');
eq('format dmy as iso', M.formatDate('11/11/2026'), '2026-11-11');
eq('format month name as iso', M.formatDate('11 Nov 2026'), '2026-11-11');
eq('format 7 May as iso', M.formatDate('7 May 2026'), '2026-05-07');
ok('display is not 07/05/0001', M.display('date', '2026-05-07') !== '07/05/0001');
ok('format of the screenshot text is not year 0001', M.formatDate('07/05/2026') === '2026-05-07');

/* The screenshot: 07/05/0001 must not be saved, and must not become 1901. */
var bad = saved('07/05/0001');
ok('07/05/0001 is not saved', !bad.ok);
ok('07/05/0001 has no value', bad.value == null);
ok('07/05/0001 is not stored as 0001-05-07', bad.value !== '0001-05-07');
ok('07/05/0001 is not rewritten to 1901', bad.value !== '1901-05-07');
var badIso = saved('0001-05-07');
ok('0001-05-07 is not saved', !badIso.ok);
ok('0001-05-07 is not a stored iso year', !badIso.value || String(badIso.value).indexOf('0001') !== 0);

ok('february 30 rejected', !saved('2026-02-30').ok);
ok('month 13 rejected', !saved('2026-13-01').ok);
ok('November 11 without a year rejected', !saved('November 11').ok);
eq('blank date clears', saved(''), { ok: true, value: null });

var db = M.blankDb();
var table = M.activeTable(db);
var dateCol = colByName(table, 'Date');
var row = M.addRow(table, {});
var rejected = M.setCell(table, row.id, dateCol.id, '07/05/0001');
ok('setCell rejects 07/05/0001', !rejected.ok);
ok('cell stays empty after year 0001', row.cells[dateCol.id] == null);
ok('setCell does not return year 0001', rejected.value !== '0001-05-07' && rejected.value !== '1901-05-07');
var kept = M.setCell(table, row.id, dateCol.id, '07/05/2026');
eq('setCell stores 07/05/2026 as iso', kept, { ok: true, value: '2026-05-07' });
eq('cell holds iso', row.cells[dateCol.id], '2026-05-07');
eq('grid display is iso not 07/05/0001', M.display('date', row.cells[dateCol.id]), '2026-05-07');
var again = M.setCell(table, row.id, dateCol.id, '07/05/0001');
ok('a later 0001 does not replace the date', !again.ok);
eq('previous iso kept', row.cells[dateCol.id], '2026-05-07');

M.setCell(table, row.id, dateCol.id, '11 Nov 2026');
var rowB = M.addRow(table, {});
M.setCell(table, rowB.id, dateCol.id, '2026-01-02');
var rowC = M.addRow(table, {});
M.setCell(table, rowC.id, dateCol.id, '7 May 2026');
var rowD = M.addRow(table, {});

eq('sort dates asc', M.sortRows(table, table.rows, dateCol.id, 'asc').map(function (r) {
  return r.cells[dateCol.id];
}), ['2026-01-02', '2026-05-07', '2026-11-11', null]);

eq('filter equals month name', M.visibleRows(table, '', [{ colId: dateCol.id, op: 'equals', value: '11 Nov 2026' }]).map(function (r) {
  return r.cells[dateCol.id];
}), ['2026-11-11']);
eq('filter greater than dmy', M.visibleRows(table, '', [{ colId: dateCol.id, op: 'gt', value: '07/05/2026' }]).map(function (r) {
  return r.cells[dateCol.id];
}), ['2026-11-11']);
eq('filter less than iso', M.visibleRows(table, '', [{ colId: dateCol.id, op: 'lt', value: '2026-05-07' }]).map(function (r) {
  return r.cells[dateCol.id];
}), ['2026-01-02']);
ok('blank row stays in the table', rowD.cells[dateCol.id] == null);

/* Old tables-v1 save: ISO dates load unchanged. No new key. */
var old = JSON.stringify({
  version: 1,
  activeId: 't-old',
  theme: 'dark',
  tables: [{
    id: 't-old',
    name: 'Jobs',
    columns: [
      { id: 'c-name', name: 'date', type: 'date' },
      { id: 'c-due', name: 'Due', type: 'date' }
    ],
    rows: [
      { id: 'r-old', cells: { 'c-name': '2026-05-07', 'c-due': '2026-11-11' } },
      { cells: { 'c-name': '11/11/2026', 'c-due': '11 Nov 2026' } }
    ]
  }]
});
var loaded = M.load(old);
eq('old save version stays 1', loaded.version, 1);
eq('old iso date loads', loaded.tables[0].rows[0].cells['c-name'], '2026-05-07');
eq('old second iso loads', loaded.tables[0].rows[0].cells['c-due'], '2026-11-11');
eq('old dmy text becomes iso on load', loaded.tables[0].rows[1].cells['c-name'], '2026-11-11');
eq('old month name becomes iso on load', loaded.tables[0].rows[1].cells['c-due'], '2026-11-11');
ok('row missing an id is given one', !!loaded.tables[0].rows[1].id);
eq('resave still version 1', JSON.parse(M.serialize(loaded)).version, 1);
eq('resave keeps tables-v1 shape', JSON.parse(M.serialize(loaded)).tables[0].rows[0].cells['c-name'], '2026-05-07');

eq('guess month names as dates', M.guessType(['11 Nov 2026', '7 May 2026', '1 Jan 2026']).type, 'date');
eq('guess plain numbers stay numbers', M.guessType(['2', '3', '4']).type, 'number');

eq('header date (Date)', M.headerLabel('date', 'date'), 'date (Date)');
eq('header Due (Date)', M.headerLabel({ name: 'Due', type: 'date' }), 'Due (Date)');
eq('header Done (Yes/No)', M.headerLabel('Done', 'yesno'), 'Done (Yes/No)');
eq('header Name (Text)', M.headerLabel('Name', 'text'), 'Name (Text)');

if (fails.length) {
  console.error('\n' + fails.length + ' failed\n' + fails.join('\n'));
  process.exit(1);
}
console.log('\nAll TB4 model tests passed');
