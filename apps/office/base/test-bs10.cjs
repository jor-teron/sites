#!/usr/bin/env node
/* BS10: Base Save / Save As of a .hob file (OfficeNative).
   Run: node --test apps/office/base/test-bs10.cjs
   No DOM, no browser, no network. Loads office-native.js and modules/base_hob.js
   in a vm (same pattern as test-sl11.cjs / test-hob1.cjs). */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = __dirname;
const shared = path.join(dir, '../shared');

function loadHob() {
  const ctx = { window: {}, console: console, URLSearchParams: URLSearchParams };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(shared, 'office-native.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(dir, 'modules/base_hob.js'), 'utf8'), ctx);
  return { Hop: ctx.BaseHop, OfficeNative: ctx.OfficeNative, ctx: ctx };
}

/* parseHash objects are created in the vm, so their Object prototype is not this realm's. */
function plain(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

test('fileName writes a .hob name and only strips .hob', () => {
  const { Hop } = loadHob();
  assert.equal(Hop.fileName('Contacts'), 'Contacts.hob');
  assert.equal(Hop.fileName('Contacts.hob'), 'Contacts.hob');
  /* (before BS14) assert.equal(Hop.fileName('Contacts.hbase'), 'Contacts.hob'); */
  assert.equal(Hop.fileName('Contacts.hbase'), 'Contacts.hbase.hob');
  assert.equal(Hop.fileName('Q?.hob'), 'Q.hob');
  assert.equal(Hop.fileName(''), 'base.hob');
  assert.ok(Hop.fileName('base-backup-2026-11-17').endsWith('.hob'));
});

test('.hob is accepted, .hbase and other extensions are rejected', () => {
  const { Hop } = loadHob();
  assert.equal(Hop.acceptsName('data.hob'), true);
  assert.equal(Hop.acceptsName('data.HOB'), true);
  /* (before BS14) assert.equal(Hop.acceptsName('data.hbase'), true); */
  /* (before BS14) assert.equal(Hop.acceptsName('data.HBASE'), true); */
  assert.equal(Hop.acceptsName('data.hbase'), false);
  assert.equal(Hop.acceptsName('data.HBASE'), false);
  assert.equal(Hop.acceptsName({ name: 'data.hob' }), true);
  /* (before BS14) assert.equal(Hop.acceptsName({ name: 'data.hbase' }), true); */
  assert.equal(Hop.acceptsName({ name: 'data.hbase' }), false);
  assert.equal(Hop.acceptsName('data.json'), false);
  assert.equal(Hop.acceptsName('data.xlsx'), false);
  assert.equal(Hop.acceptsName('data.csv'), false);
  assert.equal(Hop.acceptsName('data.how'), false);
  assert.equal(Hop.acceptsName('data.hot'), false);
  assert.equal(Hop.acceptsName('data.hop'), false);
  assert.equal(Hop.acceptsName('data'), false);
  assert.equal(Hop.acceptsName(''), false);
});

test('drop-file filter keeps .hob and ignores .hbase and other files', () => {
  const { Hop } = loadHob();
  const hob = { name: 'Contacts.hob' };
  const old = { name: 'old.hbase' };
  const csv = { name: 'rows.csv' };
  assert.equal(Hop.dropFile([hob, csv]), hob);
  /* (before BS14) assert.equal(Hop.dropFile([csv, old]), old); */
  assert.equal(Hop.dropFile([csv, old]), null);
  assert.equal(Hop.dropFile({ files: [csv, hob] }), hob);
  assert.equal(Hop.dropFile([csv, { name: 'pic.png' }]), null);
  assert.equal(Hop.dropFile([]), null);
  assert.equal(Hop.dropFile(null), null);
  assert.equal(Hop.dropFile({ files: [] }), null);
});

test('OfficeNative session is configured for .hob', () => {
  const { Hop, OfficeNative } = loadHob();
  const session = OfficeNative.create({
    ext: Hop.EXT,
    label: 'Hub Office Base',
    fallback: Hop.FALLBACK,
    max: Hop.MAX,
    capture: function () {
      return { name: 'Contacts', db: { schema: 8, tables: [], current: null }, pics: {} };
    },
    pack: Hop.pack,
    parse: Hop.parse,
    apply: function () {},
    currentName: function () { return 'Contacts'; }
  });
  assert.equal(session.ext, 'hob');
  assert.equal(session.fileName('Contacts'), 'Contacts.hob');
  assert.equal(session.fileName('Contacts.hob'), 'Contacts.hob');
  assert.equal(session.isFile({ name: 'data.hob' }), true);
  assert.equal(session.isFile({ name: 'data.HOB' }), true);
  /* default OfficeNative matcher is the primary ext only; install() widens this */
  assert.equal(session.isFile({ name: 'data.hbase' }), false);
  const installed = Hop.install({
    capture: function () {
      return { name: 'Contacts', db: { schema: 8, tables: [], current: null }, pics: {} };
    },
    apply: function () {},
    currentName: function () { return 'Contacts'; }
  });
  assert.ok(installed);
  assert.equal(installed.ext, 'hob');
  assert.equal(installed.isFile({ name: 'data.hob' }), true);
  /* (before BS14) assert.equal(installed.isFile({ name: 'data.hbase' }), true); */
  assert.equal(installed.isFile({ name: 'data.hbase' }), false);
  assert.equal(installed.isFile({ name: 'data.csv' }), false);
});

test('pack / parse round-trips through the OfficeNative serialize/deserialize config', () => {
  const { Hop, OfficeNative } = loadHob();
  const src = {
    name: 'Contacts',
    db: {
      schema: 8,
      tables: [{ id: 't1', name: 'People', fields: [{ id: 'f1', name: 'Name', type: 'text' }], rows: [{ id: 'r1', v: { f1: 'Ada' } }] }],
      current: 't1',
      queries: [],
      reports: [],
      views: []
    },
    pics: { pic_1: { type: 'image/webp', data: 'YWJj' } }
  };
  /* The same pack / parse functions OfficeNative.create uses to serialize and deserialize. */
  const session = OfficeNative.create({
    ext: Hop.EXT,
    label: 'Hub Office Base',
    fallback: Hop.FALLBACK,
    max: Hop.MAX,
    capture: function () { return src; },
    pack: Hop.pack,
    parse: Hop.parse,
    apply: function () {},
    currentName: function () { return 'Contacts'; }
  });
  assert.equal(session.ext, 'hob');
  const packed = Hop.pack(src);
  assert.equal(packed.magic, 'hbase');
  assert.equal(packed.version, 1);
  assert.equal(packed.schema, 8);
  assert.ok(typeof packed.exported === 'string' && packed.exported.indexOf('T') !== -1);
  assert.ok(Array.isArray(packed.db.tables) && packed.db.tables.length === 1);
  assert.equal(packed.db.tables[0].name, 'People');
  assert.equal(packed.pics.pic_1.data, 'YWJj');
  assert.equal('name' in packed, false); /* stem is the file name, not a JSON field */
  const text = Hop.stringify(src);
  assert.ok(text.indexOf('"magic": "hbase"') !== -1);
  assert.ok(text.indexOf('.hob') === -1);
  const doc = Hop.parse(text);
  assert.ok(doc.db && doc.db.tables && doc.db.tables[0].name === 'People');
  assert.equal(doc.db.tables[0].rows[0].v.f1, 'Ada');
  assert.equal(doc.pics.pic_1.type, 'image/webp');
  assert.equal(doc.pics.pic_1.data, 'YWJj');
  const packed2 = Hop.pack(doc);
  assert.equal(packed2.magic, 'hbase');
  assert.equal(packed2.version, 1);
  assert.equal(packed2.db.tables[0].name, 'People');
  assert.equal(packed2.pics.pic_1.data, 'YWJj');
});

test('parse refuses a non hob / missing tables list', () => {
  const { Hop } = loadHob();
  assert.throws(() => Hop.parse('{'), { message: /not valid JSON/ });
  assert.throws(() => Hop.parse(JSON.stringify({ magic: 'hos', version: 1, db: { tables: [] } })), { message: /hbase/ });
  assert.throws(() => Hop.parse(JSON.stringify({ magic: 'hbase', version: 1 })), { message: /no tables list/ });
  assert.throws(() => Hop.parse(JSON.stringify({ magic: 'hbase', version: 1, db: {} })), { message: /no tables list/ });
});

test('parseHash accepts .hob and rejects .hbase and other files', () => {
  const { Hop } = loadHob();
  assert.deepEqual(plain(Hop.parseHash('#drive=local&path=Documents&file=Contacts.hob')), {
    drive: 'local', path: 'Documents', name: 'Contacts.hob'
  });
  /* (before BS14) parseHash('drive=local&file=old.hbase') returned { drive: 'local', path: '', name: 'old.hbase' } */
  assert.equal(Hop.parseHash('drive=local&file=old.hbase'), null);
  assert.deepEqual(plain(Hop.parseHash('#drive=local&path=A%2FB&file=Q.HOB')), {
    drive: 'local', path: 'A/B', name: 'Q.HOB'
  });
  assert.equal(Hop.parseHash('#drive=local&file=talk.hop'), null);
  assert.equal(Hop.parseHash('#drive=local&file=data.how'), null);
  assert.equal(Hop.parseHash('#drive=local&file=data.json'), null);
  assert.equal(Hop.parseHash('#file=data.hob'), null); /* no drive */
  assert.equal(Hop.parseHash('#drive=local'), null);
  assert.equal(Hop.parseHash(''), null);
  assert.equal(Hop.parseHash(null), null);
});
