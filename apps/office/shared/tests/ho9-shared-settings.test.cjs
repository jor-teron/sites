#!/usr/bin/env node
/* HO9: office-shared-settings.js normalizes, loads and saves Hub Office defaults.
 * Run with: node --test apps/office/shared/tests/ho9-shared-settings.test.cjs
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '../../../..');
const SCRIPT_PATH = path.join(ROOT, 'apps/office/shared/office-shared-settings.js');
const S = require(SCRIPT_PATH);

test('node --check on office-shared-settings.js', () => {
  cp.execFileSync(process.execPath, ['--check', SCRIPT_PATH]);
});

function memStore(map) {
  map = map || Object.create(null);
  return {
    data: map,
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null;
    },
    setItem: function (k, v) { map[k] = String(v); },
    removeItem: function (k) { delete map[k]; }
  };
}

test('DEFAULTS has the HO9 shape', () => {
  assert.deepEqual(S.DEFAULTS, {
    v: 1,
    font: 'Times New Roman',
    fontSize: 12,
    paper: 'A4',
    units: 'cm',
    dateFormat: 'dmy',
    numberLocale: 'en-IN',
    autosave: true,
    saveLocation: 'documents',
    author: ''
  });
  assert.equal(S.KEY, 'hubOffice.settings');
  assert.deepEqual(S.FONTS, ['Times New Roman', 'Tinos']);
  assert.deepEqual(S.PAPERS, ['A4', 'Letter']);
  assert.deepEqual(S.UNITS, ['cm', 'in']);
  assert.deepEqual(S.DATE_FORMATS, ['dmy', 'ymd', 'mdy']);
  assert.deepEqual(S.NUMBER_LOCALES, ['en-IN', 'en-US', 'en-GB']);
  assert.deepEqual(S.SAVE_LOCATIONS, ['documents', 'ask']);
  assert.equal(S.FONT_SIZE_MIN, 6);
  assert.equal(S.FONT_SIZE_MAX, 72);
  assert.equal(S.AUTHOR_MAX, 60);
});

test('normalize keeps valid values and drops unknown fields', () => {
  const src = {
    v: 1,
    font: 'Tinos',
    fontSize: 18,
    paper: 'Letter',
    units: 'in',
    dateFormat: 'mdy',
    numberLocale: 'en-US',
    autosave: false,
    saveLocation: 'ask',
    author: '  Jor Teron  ',
    extra: 'nope',
    theme: 'dark'
  };
  const out = S.normalize(src);
  assert.deepEqual(out, {
    v: 1,
    font: 'Tinos',
    fontSize: 18,
    paper: 'Letter',
    units: 'in',
    dateFormat: 'mdy',
    numberLocale: 'en-US',
    autosave: false,
    saveLocation: 'ask',
    author: 'Jor Teron'
  });
  assert.equal('extra' in out, false);
  assert.equal('theme' in out, false);
  assert.notEqual(out, src);
});

test('normalize falls back to defaults for invalid or missing fields', () => {
  const out = S.normalize({
    v: 2,
    font: 'Arial',
    fontSize: 5,
    paper: 'letter',
    units: 'inches',
    dateFormat: 'DMY',
    numberLocale: 'en',
    autosave: 'true',
    saveLocation: 'hub',
    author: 123
  });
  assert.deepEqual(out, S.DEFAULTS);

  const empty = S.normalize(null);
  assert.deepEqual(empty, S.DEFAULTS);
  assert.deepEqual(S.normalize(undefined), S.DEFAULTS);
  assert.deepEqual(S.normalize('nope'), S.DEFAULTS);

  assert.equal(S.normalize({ fontSize: 6 }).fontSize, 6);
  assert.equal(S.normalize({ fontSize: 72 }).fontSize, 72);
  assert.equal(S.normalize({ fontSize: 73 }).fontSize, 12);
  assert.equal(S.normalize({ fontSize: 12.5 }).fontSize, 12);
  assert.equal(S.normalize({ fontSize: '14' }).fontSize, 14);
  assert.equal(S.normalize({ fontSize: 'abc' }).fontSize, 12);
  assert.equal(S.normalize({ font: 'Tinos', paper: 'A4' }).font, 'Tinos');
  assert.equal(S.normalize({ dateFormat: 'ymd' }).dateFormat, 'ymd');
  assert.equal(S.normalize({ numberLocale: 'en-GB' }).numberLocale, 'en-GB');
  assert.equal(S.normalize({ autosave: false }).autosave, false);
});

test('normalize trims author and caps it at 60 characters', () => {
  assert.equal(S.normalize({ author: '  Ada  ' }).author, 'Ada');
  assert.equal(S.normalize({ author: '' }).author, '');
  const long = 'x'.repeat(80);
  assert.equal(S.normalize({ author: long }).author, 'x'.repeat(60));
  assert.equal(S.normalize({ author: '  ' + 'y'.repeat(60) + '  ' }).author, 'y'.repeat(60));
});

test('load returns defaults when storage is missing or JSON is corrupt', () => {
  assert.deepEqual(S.load(null), S.DEFAULTS);
  assert.deepEqual(S.load(undefined), S.DEFAULTS);
  assert.deepEqual(S.load({}), S.DEFAULTS);
  assert.deepEqual(S.load(memStore()), S.DEFAULTS);

  const bad = memStore();
  bad.setItem(S.KEY, '{not json');
  assert.deepEqual(S.load(bad), S.DEFAULTS);

  const notObj = memStore();
  notObj.setItem(S.KEY, 'true');
  assert.deepEqual(S.load(notObj), S.DEFAULTS);

  const throwing = {
    getItem: function () { throw new Error('blocked'); }
  };
  assert.deepEqual(S.load(throwing), S.DEFAULTS);
});

test('load normalizes a partial stored object', () => {
  const store = memStore();
  store.setItem(S.KEY, JSON.stringify({ font: 'Tinos', fontSize: 99, leftover: 1 }));
  const out = S.load(store);
  assert.equal(out.font, 'Tinos');
  assert.equal(out.fontSize, 12);
  assert.equal(out.paper, 'A4');
  assert.equal(out.v, 1);
  assert.equal('leftover' in out, false);
});

test('save round-trips through a fake storage and returns the normalized object', () => {
  const store = memStore();
  const saved = S.save(store, {
    font: 'Tinos',
    fontSize: 20,
    paper: 'Letter',
    units: 'in',
    dateFormat: 'ymd',
    numberLocale: 'en-GB',
    autosave: false,
    saveLocation: 'ask',
    author: '  Hub Office  ',
    junk: true
  });
  assert.equal(saved.font, 'Tinos');
  assert.equal(saved.author, 'Hub Office');
  assert.equal('junk' in saved, false);
  assert.equal(store.getItem(S.KEY), JSON.stringify(saved));
  assert.deepEqual(S.load(store), saved);

  const invalid = S.save(store, { font: 'Comic Sans', fontSize: 3, autosave: 'no' });
  assert.equal(invalid.font, 'Times New Roman');
  assert.equal(invalid.fontSize, 12);
  assert.equal(invalid.autosave, true);
  assert.deepEqual(S.load(store), invalid);

  const noStore = S.save(null, { font: 'Tinos' });
  assert.equal(noStore.font, 'Tinos');
  assert.equal(noStore.paper, 'A4');
});

test('subscribe is notified on save, and onStorage handles the window storage event', () => {
  const seen = [];
  const off = S.subscribe(function (s) { seen.push(s); });
  const store = memStore();
  S.save(store, { font: 'Tinos' });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].font, 'Tinos');

  S.onStorage({ key: 'other.key', newValue: JSON.stringify({ font: 'Tinos' }) });
  assert.equal(seen.length, 1);

  S.onStorage({ key: S.KEY, newValue: JSON.stringify({ font: 'Tinos', fontSize: 16 }) });
  assert.equal(seen.length, 2);
  assert.equal(seen[1].font, 'Tinos');
  assert.equal(seen[1].fontSize, 16);

  S.onStorage({ key: S.KEY, newValue: '{bad' });
  assert.equal(seen.length, 3);
  assert.deepEqual(seen[3 - 1], S.DEFAULTS);

  off();
  S.save(store, { font: 'Times New Roman' });
  assert.equal(seen.length, 3);
});

test('UMD attaches to window and listens for the storage event', () => {
  const listeners = [];
  const ctx = {
    addEventListener: function (type, fn) { listeners.push({ type: type, fn: fn }); }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(SCRIPT_PATH, 'utf8'), ctx, { filename: 'office-shared-settings.js' });
  assert.ok(ctx.OfficeSharedSettings, 'window.OfficeSharedSettings');
  assert.equal(ctx.OfficeSharedSettings.KEY, 'hubOffice.settings');
  assert.equal(listeners.length, 1);
  assert.equal(listeners[0].type, 'storage');

  const seen = [];
  ctx.OfficeSharedSettings.subscribe(function (s) { seen.push(s); });
  listeners[0].fn({ key: 'hubOffice.settings', newValue: JSON.stringify({ units: 'in' }) });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].units, 'in');
  assert.equal(seen[0].font, 'Times New Roman');
});
