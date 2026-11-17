// H152: Settings search box (apps/system/settings/settings.js startSearch, shared/search/, search_items.js).
// Offline Node checks (no browser, no network); the page smoke runs only when jsdom is installed (global or local).
// Run: node --test hub/tests/hub_settings_search.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SET = path.join(ROOT, 'apps/system/settings');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const C = require(path.join(ROOT, 'shared/search/search_core.js'));

function items() { const w = {}; vm.runInNewContext(read('apps/system/search/search_items.js'), { window: w }); return w.HUB_SEARCH_ITEMS; }
/** Section ids + titles from every sec_*.js (Settings.add({ id: '…', title: '…' })). */
function sectionIds() {
  const out = [];
  fs.readdirSync(SET).filter((f) => /^sec_.*\.js$/.test(f)).forEach((f) => {
    const src = fs.readFileSync(path.join(SET, f), 'utf8');
    const re = /Settings\.add\(\{\s*id:\s*'([^']+)',\s*title:\s*'([^']+)'/g;
    let m; while ((m = re.exec(src))) out.push({ id: m[1], title: m[2] });
  });
  return out;
}
/** settings.js with a tiny fake page: only the pure search helpers are used. */
function settingsApi() {
  const node = () => ({ appendChild() {}, querySelectorAll: () => [], addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} } });
  const w = { matchMedia: () => ({ matches: false }) };
  vm.runInNewContext(read('apps/system/settings/settings.js'), { window: w, document: { getElementById: () => node(), createElement: () => node() }, location: { hash: '' }, history: {} });
  return w.Settings;
}

test('every Settings hash in search_items.js opens a real Settings section', () => {
  const ids = sectionIds().map((s) => s.id);
  assert.ok(ids.length >= 12, 'sections: ' + ids.join(','));
  items().settings.forEach((s) => assert.ok(ids.includes(String(s.hash).split('/')[0]), s.name + ' → #' + s.hash));
});

test('the new H152 items are found by their words', () => {
  const S = settingsApi();
  const rows = S.search.rows(items().settings, sectionIds());
  const top = (q) => S.search.groups(rows, C.words(q), C).flatMap((g) => g[1]).map((r) => r.name);
  const has = (q, name) => assert.ok(top(q).includes(name), q + ' → ' + top(q).join(' | '));
  has('pin', 'Lock PIN (set / change)');
  has('fingerprint', 'Unlock with PIN / Fingerprint / Both');
  has('fingerprint', 'Fingerprint phones (Add phone)');
  has('drives', 'Network drive thumbnails');
  has('disturb', 'Do Not Disturb');
  has('close', 'Ask before closing the Hub');
  has('fullscreen', 'Show fullscreen button in taskbar');
  has('break', 'Computer break');
  assert.equal(top('zzzz').length, 0);
  assert.equal(S.search.groups(rows, [], C).length, 0);
});

test('results are grouped by section title, best group first; pages are marked Page', () => {
  const S = settingsApi();
  const rows = S.search.rows(items().settings, sectionIds());
  const g = S.search.groups(rows, C.words('screen lock'), C);
  assert.equal(g[0][0], 'Screen lock');
  const page = rows.find((r) => r.name === 'Screen lock');
  assert.equal(page.sub, 'Page');
  assert.equal(rows.find((r) => r.name === 'Activate screen lock').sub, 'Screen lock');
  // a hash to a missing section is dropped, not shown
  assert.equal(S.search.rows([{ name: 'X', hash: 'nope', where: 'Settings' }], sectionIds()).length, 0);
});

test('Settings index.html loads the shared search files before settings.js', () => {
  const html = read('apps/system/settings/index.html');
  const at = (s) => html.indexOf('<script src="' + s + '"');
  const core = at('../../../shared/search/search_core.js'), src = at('../../../shared/search/search_sources.js');
  const bar = at('../../../shared/search/search_bar.js'), it = at('../search/search_items.js'), app = at('settings.js');
  assert.ok(core > 0 && src > core && bar > src && it > bar && app > it, [core, src, bar, it, app].join(','));
  assert.ok(html.includes('href="../../../shared/search/search_bar.css"'));
});

function jsdom() {
  try { return require('jsdom'); } catch (_) { /* not local */ }
  try { return require(path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'jsdom')); } catch (_) { return null; }
}

test('page smoke (jsdom): type, open with Enter, the switch flashes, Esc brings the list back', async (t) => {
  const J = jsdom();
  if (!J) { t.skip('jsdom not installed'); return; }
  const f = path.join(SET, 'index.html');
  const vc = new J.VirtualConsole(); const errs = [];
  vc.on('jsdomError', (e) => errs.push(String(e.message || e)));
  const dom = await J.JSDOM.fromFile(f, { url: 'file://' + f, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
      w.HTMLElement.prototype.scrollIntoView = function () {};
      const rs = w.history.replaceState.bind(w.history);   // jsdom refuses replaceState on file://; browsers allow the hash
      w.history.replaceState = (a, b, u) => { try { rs(a, b, u); } catch (_) { if (u && String(u).includes('#')) w.location.hash = String(u).split('#')[1]; } };
    } });
  const w = dom.window, d = w.document;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    await new Promise((r) => w.addEventListener('load', r)); await wait(150);
    const q = d.querySelector('.side-search .hsb-q');
    assert.ok(q, 'search box');
    q.value = 'ask before'; q.dispatchEvent(new w.Event('input')); await wait(80);
    assert.equal(d.getElementById('nav').hidden, true);
    assert.equal(d.querySelector('.side-search .res .nm').textContent, 'Ask before closing the Hub');
    q.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' })); await wait(200);
    assert.equal(w.location.hash, '#desktop');
    const hit = d.querySelector('.search-hit');
    assert.ok(hit && hit.textContent.startsWith('Ask before closing the Hub'));
    q.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(q.value, '');
    assert.equal(d.getElementById('nav').hidden, false);
    assert.deepEqual(errs, []);
  } finally { w.close(); }
});
