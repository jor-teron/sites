/* DB Browser DB1+DB2 — pure helper tests + optional sql.js smoke (no browser). */
'use strict';

var path = require('path');
var fs = require('fs');
var H = require(path.join(__dirname, '..', 'db_helpers.js'));

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

// formatBytes
assert(H.formatBytes(0) === '0 B', 'formatBytes 0');
assert(H.formatBytes(512) === '512 B', 'formatBytes bytes');
assert(/KB/.test(H.formatBytes(2048)), 'formatBytes KB');
assert(/MB/.test(H.formatBytes(2 * 1024 * 1024)), 'formatBytes MB');

// quoteIdent
assert(H.quoteIdent('users') === '"users"', 'quoteIdent plain');
assert(H.quoteIdent('a"b') === '"a""b"', 'quoteIdent escape');
assert(H.quoteIdent('') === '""', 'quoteIdent empty');

// csvCell / rowsToCsv
assert(H.csvCell(null) === '', 'csvCell null');
assert(H.csvCell('hi') === 'hi', 'csvCell plain');
assert(H.csvCell('a,b') === '"a,b"', 'csvCell comma');
assert(H.csvCell('say "hi"') === '"say ""hi"""', 'csvCell quotes');
assert(H.csvCell('a\nb') === '"a\nb"', 'csvCell newline');
var csv = H.rowsToCsv(['name', 'age'], [['Ada', 36], ['Bob, Jr', null]]);
assert(csv.indexOf('name,age') === 0, 'csv header');
assert(/Ada,36/.test(csv), 'csv row plain');
assert(/"Bob, Jr",/.test(csv), 'csv row quoted');

// pageInfo
var p0 = H.pageInfo(0, 1, 50);
assert(p0.totalPages === 1 && p0.from === 0 && p0.to === 0, 'pageInfo empty');
var p1 = H.pageInfo(120, 1, 50);
assert(p1.page === 1 && p1.offset === 0 && p1.from === 1 && p1.to === 50 && p1.totalPages === 3, 'pageInfo first');
var p2 = H.pageInfo(120, 3, 50);
assert(p2.page === 3 && p2.offset === 100 && p2.from === 101 && p2.to === 120, 'pageInfo last');
var pClamp = H.pageInfo(120, 99, 50);
assert(pClamp.page === 3, 'pageInfo clamp high');
var pLow = H.pageInfo(120, 0, 50);
assert(pLow.page === 1, 'pageInfo clamp low');

// file size warn
assert(H.shouldWarnFileSize(50 * 1024 * 1024) === false, 'warn under 100MB');
assert(H.shouldWarnFileSize(100 * 1024 * 1024 + 1) === true, 'warn over 100MB');
assert(H.SIZE_WARN_BYTES === 100 * 1024 * 1024, 'SIZE_WARN_BYTES');

// file name helpers
assert(H.isDbFileName('x.db') === true, 'isDb .db');
assert(H.isDbFileName('x.sqlite') === true, 'isDb .sqlite');
assert(H.isDbFileName('x.sqlite3') === true, 'isDb .sqlite3');
assert(H.isDbFileName('x.txt') === false, 'isDb false');
assert(H.ensureDbExt('out') === 'out.db', 'ensureDbExt adds');
assert(H.ensureDbExt('out.SQLite') === 'out.SQLite', 'ensureDbExt keeps');
assert(H.suggestSaveName('data.db') === 'data-copy.db', 'suggestSaveName');
assert(H.suggestSaveName('') === 'database-copy.db', 'suggestSaveName default');

// friendly errors
assert(/no table/i.test(H.friendlySqlError(new Error('no such table: foo'))), 'friendly no table');
assert(/no column/i.test(H.friendlySqlError(new Error('no such column: bar'))), 'friendly no column');
assert(/not understand/i.test(H.friendlySqlError(new Error('near "SELCT": syntax error'))), 'friendly syntax');

// constants
assert(H.PAGE_SIZE === 50, 'PAGE_SIZE');
assert(H.QUERY_ROW_CAP === 1000, 'QUERY_ROW_CAP');

if (failed) {
  console.error(failed + ' helper tests failed');
  process.exit(1);
}
console.log('Helper tests passed');

// Optional sql.js smoke (Node): load wasm, create table, query
(async function smoke() {
  var wasmJs = path.join(__dirname, '..', 'vendor', 'sqljs', 'sql-wasm.js');
  var wasmBin = path.join(__dirname, '..', 'vendor', 'sqljs', 'sql-wasm.wasm');
  if (!fs.existsSync(wasmJs) || !fs.existsSync(wasmBin)) {
    console.log('skip: sql.js vendor missing');
    return;
  }
  try {
    var initSqlJs = require(wasmJs);
    var SQL = await initSqlJs({
      locateFile: function () { return wasmBin; }
    });
    var db = new SQL.Database();
    db.run('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    db.run('INSERT INTO t (name) VALUES (?), (?)', ['Ada', 'Bob']);
    var res = db.exec('SELECT name FROM t ORDER BY id');
    assert(res.length === 1, 'smoke has result');
    assert(res[0].values.length === 2, 'smoke 2 rows');
    assert(res[0].values[0][0] === 'Ada', 'smoke Ada');
    var exported = db.export();
    assert(exported instanceof Uint8Array && exported.length > 0, 'smoke export');
    db.close();
    var db2 = new SQL.Database(exported);
    var n = db2.exec('SELECT COUNT(*) FROM t')[0].values[0][0];
    assert(n === 2, 'smoke reopen count');
    db2.close();
    console.log('sql.js smoke passed');
  } catch (err) {
    console.error('sql.js smoke failed:', err && err.message || err);
    process.exit(1);
  }
  if (failed) {
    console.error(failed + ' failed');
    process.exit(1);
  }
  console.log('All tests passed');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
