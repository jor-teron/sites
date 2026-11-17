#!/usr/bin/env node
/* BS11: Base imports LibreOffice .odb files (modules/base_odb.js).
   Feeds the pure parser a file map (no zip, no DOM).
   Run: node --test apps/office/base/test-bs11.cjs */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;

function load() {
  const ctx = {
    window: {},
    console: console,
    Uint8Array: Uint8Array,
    ArrayBuffer: ArrayBuffer,
    TextDecoder: TextDecoder,
    TextEncoder: TextEncoder,
    Buffer: Buffer
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'modules/base_odb.js'), 'utf8'), ctx);
  return { Odb: ctx.BaseOdb, ctx: ctx };
}

function plain(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

function scriptFiles(script, extra) {
  return Object.assign({
    mimetype: 'application/vnd.oasis.opendocument.base',
    'database/properties': 'hsqldb.default_table_type=cached\nversion=1.8.0\nmodified=no\n',
    'database/script': script
  }, extra || {});
}

const TWO_TABLES = [
  'CREATE CACHED TABLE "People"("ID" INTEGER NOT NULL, "Name" VARCHAR(50), "Age" INTEGER, CONSTRAINT "PK_People" PRIMARY KEY("ID"))',
  'CREATE MEMORY TABLE "My Notes"("Title" VARCHAR(100),"Body" LONGVARCHAR,"Done" BOOLEAN,"When" DATE)',
  'INSERT INTO "People" VALUES(1,\'Ada\',36)',
  'INSERT INTO "People" VALUES(2,NULL,NULL)',
  'INSERT INTO "My Notes" VALUES(\'It\'\'s on\',\'caf\\u00e9\',TRUE,\'2020-01-15\')'
].join('\n');

test('parses an HSQLDB script with two tables, quotes, NULLs, booleans, a date and a unicode escape', () => {
  const { Odb } = load();
  const got = plain(Odb.parse(scriptFiles(TWO_TABLES)));
  assert.equal(got.tables.length, 2);
  assert.deepEqual(got.warnings, []);

  const people = got.tables[0];
  assert.equal(people.name, 'People');
  assert.deepEqual(people.columns, [
    { name: 'ID', type: 'number' },
    { name: 'Name', type: 'text' },
    { name: 'Age', type: 'number' }
  ]);
  assert.deepEqual(people.rows, [
    [1, 'Ada', 36],
    [2, null, null]
  ]);

  const notes = got.tables[1];
  assert.equal(notes.name, 'My Notes');
  assert.deepEqual(notes.columns, [
    { name: 'Title', type: 'text' },
    { name: 'Body', type: 'text' },
    { name: 'Done', type: 'bool' },
    { name: 'When', type: 'date' }
  ]);
  assert.equal(notes.rows.length, 1);
  assert.equal(notes.rows[0][0], "It's on");
  assert.equal(notes.rows[0][1], 'café');
  assert.equal(notes.rows[0][2], true);
  assert.equal(notes.rows[0][3], '2020-01-15');
});

test('Firebird .odb is rejected with a typed error and the documented message', () => {
  const { Odb } = load();
  let err;
  try {
    Odb.parse({
      mimetype: 'application/vnd.oasis.opendocument.base',
      'database/firebird.fbk': new Uint8Array([1, 2, 3]),
      'database/properties': 'engine=firebird\n'
    });
  } catch (e) { err = e; }
  assert.ok(err, 'expected an error');
  assert.equal(err.code, 'firebird');
  assert.match(err.message, /Firebird engine/i);
  assert.match(err.message, /export each table to CSV/i);
  assert.equal(err.userMessage, err.message);
});

test('an .odb with no database folder is treated as an external link', () => {
  const { Odb } = load();
  let err;
  try {
    Odb.parse({
      mimetype: 'application/vnd.oasis.opendocument.base',
      'content.xml': '<office:document-content><db:connection-data/></office:document-content>'
    });
  } catch (e) { err = e; }
  assert.ok(err, 'expected an error');
  assert.equal(err.code, 'external');
  assert.match(err.message, /external database/i);
});

test('a CACHED table with no INSERT rows is created and warned about', () => {
  const { Odb } = load();
  const script = 'CREATE CACHED TABLE "Orders"("Id" INTEGER PRIMARY KEY,"Item" VARCHAR(50))\n';
  const got = plain(Odb.parse(scriptFiles(script, { 'database/data': new Uint8Array([0, 1, 2]) })));
  assert.equal(got.tables.length, 1);
  assert.equal(got.tables[0].name, 'Orders');
  assert.deepEqual(got.tables[0].columns, [
    { name: 'Id', type: 'number' },
    { name: 'Item', type: 'text' }
  ]);
  assert.deepEqual(got.tables[0].rows, []);
  assert.equal(got.warnings.length, 1);
  assert.match(got.warnings[0], /Rows of 1 table could not be read/);
});

test('maps HSQLDB types, skips binary columns, and accepts schema-qualified names', () => {
  const { Odb } = load();
  assert.equal(Odb.mapType('INTEGER'), 'number');
  assert.equal(Odb.mapType('BIGINT'), 'number');
  assert.equal(Odb.mapType('VARCHAR_IGNORECASE'), 'text');
  assert.equal(Odb.mapType('LONGVARCHAR'), 'text');
  assert.equal(Odb.mapType('BOOLEAN'), 'bool');
  assert.equal(Odb.mapType('TIMESTAMP'), 'date');
  assert.equal(Odb.mapType('LONGVARBINARY'), 'binary');
  const script = [
    'CREATE TABLE PUBLIC.STOCK("Code" VARCHAR(8),"Qty" DECIMAL(10,2),"Bin" LONGVARBINARY)',
    "INSERT INTO PUBLIC.STOCK VALUES('A1',4.5,X'00FF')"
  ].join('\n');
  const got = plain(Odb.parse(scriptFiles(script)));
  assert.equal(got.tables[0].name, 'STOCK');
  assert.deepEqual(got.tables[0].columns, [
    { name: 'Code', type: 'text' },
    { name: 'Qty', type: 'number' }
  ]);
  assert.deepEqual(got.tables[0].rows, [['A1', 4.5]]);
});

test('encrypted properties or a binary script throw a typed encrypted error', () => {
  const { Odb } = load();
  let err;
  try {
    Odb.parse(scriptFiles('CREATE CACHED TABLE "T"("A" INTEGER)', {
      'database/properties': 'hsqldb.crypt_type=AES\nhsqldb.crypt_key=ABCDEF\n'
    }));
  } catch (e) { err = e; }
  assert.ok(err, 'expected an error');
  assert.equal(err.code, 'encrypted');
  assert.match(err.message, /password protected/i);

  err = null;
  try {
    Odb.parse({
      'database/script': new Uint8Array([0, 1, 2, 3, 4, 5, 0, 0, 0, 7])
    });
  } catch (e) { err = e; }
  assert.ok(err, 'expected an error for a binary script');
  assert.equal(err.code, 'encrypted');
});

test('acceptsName and dropFile recognise .odb and ignore other files', () => {
  const { Odb } = load();
  assert.equal(Odb.acceptsName('contacts.odb'), true);
  assert.equal(Odb.acceptsName('contacts.ODB'), true);
  assert.equal(Odb.acceptsName({ name: 'contacts.odb' }), true);
  assert.equal(Odb.acceptsName('contacts.hob'), false);
  assert.equal(Odb.acceptsName('contacts.xlsx'), false);
  const odb = { name: 'Library.odb' };
  const hob = { name: 'Library.hob' };
  assert.equal(Odb.dropFile([hob, odb]), odb);
  assert.equal(Odb.dropFile({ files: [hob] }), null);
  assert.equal(Odb.dropFile([]), null);
  assert.equal(Odb.dropFile(null), null);
});

test('an empty or invalid map is rejected', () => {
  const { Odb } = load();
  let err;
  try { Odb.parse(null); } catch (e) { err = e; }
  assert.equal(err.code, 'invalid');
  err = null;
  try {
    Odb.parse({
      mimetype: 'application/vnd.oasis.opendocument.base',
      'database/properties': 'version=1.8.0\n'
    });
  } catch (e) { err = e; }
  assert.equal(err.code, 'invalid');
});
