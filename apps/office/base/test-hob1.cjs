#!/usr/bin/env node
/* HOB1: Base backup file names — export .hob, import .hob.
   BS14: .hbase is no longer accepted (rename to .hob to open).
   (before BS14) import .hob and .hbase.
   Run: node --test apps/office/base/test-hob1.cjs
   No DOM, no browser, no network. Loads base-files.js in a vm (same pattern as test-hop1.cjs). */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadBaseFiles() {
  const src = fs.readFileSync(path.join(__dirname, 'modules/base-files.js'), 'utf8');
  const ctx = { window: {}, module: { exports: {} }, exports: {} };
  ctx.module.exports = ctx.exports;
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.BaseFiles || ctx.module.exports;
}

test('backupName writes a .hob export name', () => {
  const BaseFiles = loadBaseFiles();
  assert.equal(BaseFiles.backupName('2026-11-17'), 'base-backup-2026-11-17.hob');
  assert.ok(BaseFiles.backupName('2026-11-17').endsWith('.hob'));
  assert.equal(BaseFiles.backupName('stamp').slice(-4), '.hob');
});

test('.hob is accepted, .hbase and other extensions are rejected', () => {
  const BaseFiles = loadBaseFiles();
  assert.equal(BaseFiles.isBackupName('base-backup-2026-11-17.hob'), true);
  assert.equal(BaseFiles.isBackupName('base-backup-2026-11-17.HOB'), true);
  /* (before BS14) assert.equal(BaseFiles.isBackupName('base-backup-2026-11-17.hbase'), true); */
  /* (before BS14) assert.equal(BaseFiles.isBackupName('old.HBASE'), true); */
  assert.equal(BaseFiles.isBackupName('base-backup-2026-11-17.hbase'), false);
  assert.equal(BaseFiles.isBackupName('old.HBASE'), false);
  assert.equal(BaseFiles.isBackupName({ name: 'data.hob' }), true);
  /* (before BS14) assert.equal(BaseFiles.isBackupName({ name: 'data.hbase' }), true); */
  assert.equal(BaseFiles.isBackupName({ name: 'data.hbase' }), false);
  assert.equal(BaseFiles.isBackupName('data.json'), false);
  assert.equal(BaseFiles.isBackupName('data.xlsx'), false);
  assert.equal(BaseFiles.isBackupName('data.csv'), false);
  assert.equal(BaseFiles.isBackupName('data.how'), false);
  assert.equal(BaseFiles.isBackupName('data.hot'), false);
  assert.equal(BaseFiles.isBackupName('data'), false);
  assert.equal(BaseFiles.isBackupName(''), false);
});

test('JSON magic stays hbase version 1', () => {
  const src = fs.readFileSync(path.join(__dirname, 'modules/base-files.js'), 'utf8');
  assert.ok(src.indexOf('MAGIC = "hbase"') !== -1);
  assert.ok(/VERSION\s*=\s*1/.test(src));
  const BaseFiles = loadBaseFiles();
  const packed = BaseFiles.pack({ schema: 8, tables: [] }, {});
  assert.equal(packed.magic, 'hbase');
  assert.equal(packed.version, 1);
});
