// H151: shared search pieces (shared/search/): search_core.js matching, search_sources.js lists,
// search_bar.js loads. Offline Node checks only (no browser, no network).
// Run: node --test hub/tests/hub_shared_search.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const C = require(path.join(ROOT, 'shared/search/search_core.js'));
const plain = (x) => JSON.parse(JSON.stringify(x));

test('core: every word must match, no match = 0', () => {
  assert.ok(C.score(C.words('snake game'), 'Snake', [['Games', 30]]) > 0);
  assert.equal(C.score(C.words('snake chess'), 'Snake', [['Games', 30]]), 0);
  assert.equal(C.score(C.words('zzz'), 'Snake', []), 0);
});

test('core: name hit ranks over category / description hit', () => {
  const qw = C.words('notes');
  const byName = C.score(qw, 'Notes', [['Office', 30]]);
  const byCat = C.score(qw, 'Writer', [['Notes and docs', 30]]);
  assert.equal(byName, 100);
  assert.equal(byCat, 30);
  const out = C.filter([{ name: 'Writer', cat: 'notes' }, { name: 'Notes', cat: 'Office' }], qw, (r) => [[r.cat, 30]]);
  assert.deepEqual(out.map((r) => r.name), ['Notes', 'Writer']);
});

test('core: name score steps (exact, starts, word starts, inside)', () => {
  assert.equal(C.score(['snake'], 'Snake', []), 100);
  assert.equal(C.score(['sna'], 'Snake', []), 80);
  assert.equal(C.score(['desk'], 'Show desktop', []), 60);
  assert.equal(C.score(['esk'], 'Show desktop', []), 40);
  assert.equal(C.score(['loud'], 'App', [['Cloudy weather', 20]]), 10);   // inside other text = weight / 2
});

test('core: accents and case ignored', () => {
  assert.equal(C.norm('Café ÉCOLE'), 'cafe ecole');
  assert.deepEqual(C.words('Crème-brûlée 2'), ['creme', 'brulee', '2']);
  assert.equal(C.score(C.words('cafe'), 'Café', []), 100);
  assert.equal(C.score(C.words('CAFÉ'), 'cafe', []), 100);
});

test('core: whole query at the name start gets +50, ties A-Z', () => {
  const qw = C.words('show desk');
  const out = C.filter([{ name: 'Desk show' }, { name: 'Show desktop' }], qw);
  assert.equal(out[0].name, 'Show desktop');
  assert.equal(out[0].score, C.score(qw, 'Show desktop', []) + 50);
  assert.equal(out[1].score, C.score(qw, 'Desk show', []));
  assert.deepEqual(C.filter([{ name: 'Beta' }, { name: 'Alpha' }], ['a']).map((r) => r.name), ['Alpha', 'Beta']);
  assert.deepEqual(C.filter([{ name: 'X' }], ['y']), []);
});

test('core: hits ranges, null when nothing to mark', () => {
  assert.deepEqual(C.hits('Snake snack', ['sna']), [[0, 3], [6, 9]]);
  assert.equal(C.hits('abc', []), null);
});

test('core: marked() builds text nodes and <mark> only', () => {
  const made = [];
  const node = (tag) => ({ tag, kids: [], textContent: '', appendChild(k) { this.kids.push(k); return k; } });
  const doc = { createElement: (t) => { const n = node(t); made.push(t); return n; }, createTextNode: (t) => ({ tag: '#text', textContent: t }) };
  const span = C.marked('Show desktop', ['desk'], doc);
  assert.equal(span.tag, 'span');
  assert.deepEqual(span.kids.map((k) => k.tag + ':' + k.textContent), ['#text:Show ', 'mark:desk', '#text:top']);
  const none = C.marked('Plain', [], doc);
  assert.equal(none.textContent, 'Plain');
  assert.ok(made.every((t) => t === 'span' || t === 'mark'));
});

test('core: the browser build sets window.HubSearchCore', () => {
  const w = {};
  vm.runInNewContext(read('shared/search/search_core.js'), { window: w });
  assert.equal(typeof w.HubSearchCore.filter, 'function');
});

/** search_sources.js in a fake window with the real Hub data files. */
function sources(extra) {
  const w = Object.assign({ location: { protocol: 'file:' } }, extra || {});
  const ctx = { window: w, location: w.location, console };
  vm.createContext(ctx);
  ['hub/core/hub_config.js', 'hub/core/hub_apps.js', 'hub/core/hub_appindex.js'].forEach((f) => {
    // these files set window.* (or top-level consts); run each with window = w
    vm.runInContext(read(f), ctx, { filename: f });
  });
  vm.runInContext(read('apps/system/search/search_items.js'), ctx);
  vm.runInContext(read('shared/search/search_sources.js'), ctx);
  return w;
}

test('sources: app index, categories and Settings items load', () => {
  const w = sources();
  const S = w.HubSearchSources;
  const store = S.apps({ root: '../../../', isFile: true });
  store.fromIndex();
  assert.ok(store.map.size > 50, 'apps from hub_appindex.js: ' + store.map.size);
  const a = store.list()[0];
  assert.ok(a.name && a.entryUrl && 'cat' in a);
  const cats = plain(S.categories());
  assert.ok(cats.length >= 5, 'categories: ' + cats.length);
  assert.ok(!cats.some((c) => c.name === 'Favorite'));
  assert.ok(cats.every((c, i) => !i || cats[i - 1].order <= c.order));
  const items = S.settingsItems();
  assert.ok(items.settings.length > 10 && items.actions.length >= 1);
  assert.equal(S.joinPath('apps/games/', 'snake'), 'apps/games/snake/');
  assert.equal(S.joinPath('apps/games/', '../tools/x.html'), 'apps/tools/x.html');
});

test('sources: Favorite keeps the real category, fills section / description', () => {
  const w = { location: { protocol: 'file:' } };
  vm.runInNewContext(read('shared/search/search_sources.js'), { window: w, location: w.location });
  const st = w.HubSearchSources.apps({ root: '', isFile: true });
  st.put({ name: 'A', entryUrl: 'apps/x/a/', cat: 'Favorite', section: '', icon: '', desc: '' });
  st.put({ name: 'A', entryUrl: 'apps/x/a/', cat: 'Tools', section: 'Text', icon: 'i.png', desc: 'does a' });
  assert.deepEqual(plain(st.list()), [{ name: 'A', entryUrl: 'apps/x/a/', cat: 'Tools', section: 'Text', icon: 'i.png', desc: 'does a' }]);
});

test('sources: CSVs read through TilesCsv on file:// (SITES_CSV)', async () => {
  const tw = {};
  vm.runInNewContext(read('shared/tiles/tiles.js'), {
    window: tw, location: { origin: 'null' },
    document: { getElementById: () => null, querySelector: () => null, addEventListener() {}, body: { dataset: {} } }
  });
  const w = { location: { protocol: 'file:' }, TilesCsv: tw.TilesCsv,
    HUB_CAT_CSV: { Games: 'apps/games/games-apps.csv' },
    SITES_CSV: { Games: read('apps/games/games-apps.csv') } };
  vm.runInNewContext(read('shared/search/search_sources.js'), { window: w, location: w.location });
  const st = w.HubSearchSources.apps({ root: '', isFile: true });
  await st.fromCsvs();
  assert.ok(st.map.size > 3, 'games: ' + st.map.size);
  assert.ok(st.list().every((a) => a.cat === 'Games' && a.entryUrl.startsWith('apps/')));
});

test('bar: search_bar.js loads and exposes list / create', () => {
  const w = {};
  vm.runInNewContext(read('shared/search/search_bar.js'), { window: w, document: {} });
  assert.equal(typeof w.HubSearchBar.list, 'function');
  assert.equal(typeof w.HubSearchBar.create, 'function');
});

test('Search app loads the shared files before search.js', () => {
  const html = read('apps/system/search/index.html');
  const at = (s) => html.indexOf('<script src="' + s + '"');
  const core = at('../../../shared/search/search_core.js'), src = at('../../../shared/search/search_sources.js');
  const bar = at('../../../shared/search/search_bar.js'), app = at('search.js');
  assert.ok(core > 0 && src > core && bar > src && app > bar);
  const js = read('apps/system/search/search.js');
  assert.match(js, /window\.HubSearchBar\.list\(/);
  assert.match(js, /window\.HubSearchSources/);
  assert.match(js, /window\.HubSearchCore/);
});
