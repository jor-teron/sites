// H146: Hub catalog / appindex regen (Tables + missing CSV apps).
// Offline Node checks only (no browser, no network). Run: node --test hub/tests/h146_catalog.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');

function load(rel) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx);
  return ctx.window;
}

test('H146: catalog includes Tables with the Office CSV path and icon', () => {
  const w = load('hub/core/hub_catalog.js');
  const csv = w.SITES_CSV && w.SITES_CSV.Office;
  assert.equal(typeof csv, 'string');
  const line = String(csv).split(/\r?\n/).find((l) => /^Tables\s*,/.test(l));
  assert.ok(line, 'Office catalog must have a Tables row');
  const cells = line.split(',').map((c) => c.trim());
  assert.equal(cells[1], 'tables/');
  /* (before IC6) assert.equal(cells[2], 'tables/tables_icon.svg'); */
  assert.equal(cells[2], 'tables/tables_icon.png');
});

test('H146: appindex Tables row has Office path and png icon', () => {
  const w = load('hub/core/hub_appindex.js');
  const row = w.HUB_APP_INDEX && w.HUB_APP_INDEX.tables;
  assert.ok(Array.isArray(row), 'HUB_APP_INDEX.tables must exist');
  assert.equal(row[0], 'Office');
  assert.equal(row[1], 'apps/office/tables/');
  assert.equal(row[2], 'Tables');
  /* (before IC6) assert.equal(row[3], 'apps/office/tables/tables_icon.svg'); */
  assert.equal(row[3], 'apps/office/tables/tables_icon.png');
  assert.equal(row[4], 0);
});

test('H146: the 10 Team 2 apps plus PDF Tools are in catalog and appindex', () => {
  const cat = load('hub/core/hub_catalog.js').SITES_CSV;
  const idx = load('hub/core/hub_appindex.js').HUB_APP_INDEX;
  const apps = [
    ['video-editor', 'Video Editor', 'Media'],
    ['read-aloud', 'Read Aloud', 'Tools'],
    ['3d-builder', '3D Builder', 'Media'],
    ['password-manager', 'Password Manager', 'Tools'],
    ['numerology', 'Numerology', 'Tools'],
    ['sun-position', 'Sun Position', 'Tools'],
    ['video-player', 'Video Player', 'Media'],
    ['image-converter', 'Image Converter', 'Media'],
    /* (before MV1) ['invoice-maker', 'Invoice Maker', 'Office'], */
    ['invoice-maker', 'Invoice Maker', 'Tools'],
    /* (before MV1) ['expense-tracker', 'Expense Tracker', 'Office'], */
    ['expense-tracker', 'Expense Tracker', 'Tools'],
    ['pdf-tools', 'PDF Tools', 'Office']
  ];
  const allCsv = Object.values(cat).join('\n');
  apps.forEach(([id, name, category]) => {
    assert.match(allCsv, new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*,', 'm'), name + ' must be in the catalog CSVs');
    const row = idx[id];
    assert.ok(Array.isArray(row), 'HUB_APP_INDEX.' + id + ' must exist');
    assert.equal(row[0], category, id + ' category');
    assert.equal(row[2], name, id + ' name');
    assert.match(row[1], new RegExp('/' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/$'), id + ' entry path');
  });
});
