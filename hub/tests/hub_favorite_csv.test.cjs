// H155: Favourites (apps/favorite/favorite-apps.csv): one flat list, TV + My Day - News - Agent - Globe - LandCraft.
// Offline Node checks only (no browser, no network). Run: node --test hub/tests/hub_favorite_csv.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const DIR = path.join(ROOT, 'apps/favorite');
const CSV = fs.readFileSync(path.join(DIR, 'favorite-apps.csv'), 'utf8');
function tilesCsv() {
  const w = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'shared/tiles/tiles.js'), 'utf8'), {
    window: w, location: { origin: 'null' },
    document: { getElementById: () => null, querySelector: () => null, addEventListener() {}, body: { dataset: {} } }
  });
  return w.TilesCsv;
}
const T = tilesCsv();
const rows = JSON.parse(JSON.stringify(T.parse(CSV)));

test('six rows in order, one flat list (no sections)', () => {
  assert.deepEqual(rows.map((r) => r.name), ['TV', 'My Day', 'News', 'Agent', 'Globe', 'LandCraft']);
  assert.ok(rows.every((r) => r.section === ''), 'no section headings');
  const g = JSON.parse(JSON.stringify(T.groups(T.parse(CSV))));
  assert.equal(g.length, 1);
  assert.equal(g[0].section, '');
});

test('every path is an existing app folder with index.html, every icon exists', () => {
  rows.forEach((r) => {
    assert.ok(r.path.endsWith('/'), r.name + ' path is a folder');
    const dir = path.join(DIR, r.path);
    assert.ok(fs.existsSync(path.join(dir, 'index.html')), r.name + ': ' + r.path + 'index.html');
    const icon = r.icon || T.defaultIcon(r.path);
    assert.ok(fs.existsSync(path.join(DIR, icon)), r.name + ' icon ' + icon);
  });
});

test('rows match their own category CSV (newtab, description) and descriptions have no commas', () => {
  const own = { 'My Day': 'apps/tools/tools-apps.csv', News: 'apps/media/media-apps.csv', Agent: 'apps/lab/lab-apps.csv', LandCraft: 'apps/games/games-apps.csv' };
  Object.keys(own).forEach((name) => {
    const src = JSON.parse(JSON.stringify(T.parse(fs.readFileSync(path.join(ROOT, own[name]), 'utf8')))).find((r) => r.name === name);
    const fav = rows.find((r) => r.name === name);
    assert.ok(src, name + ' in ' + own[name]);
    assert.equal(fav.newTab, src.newTab, name + ' newtab');
    assert.equal(fav.description, src.description, name + ' description');
    assert.equal(path.normalize(path.join('apps/favorite', fav.path)), path.normalize(path.join(path.dirname(own[name]), src.path)), name + ' same folder');
  });
  rows.forEach((r) => { assert.ok(r.description && r.description.length < 100, r.name + ' description'); });
  CSV.split(/\r?\n/).filter((l) => l.trim() && l.trim()[0] !== '#').forEach((l) => assert.ok(l.split(',').length <= 6, 'max 6 columns: ' + l));
});
