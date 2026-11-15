// H153: App Hub search box (apps/system/apphub/apphub.js startSearch, shared/search/).
// Offline Node checks (no browser, no network); the page smoke runs only when jsdom is installed (global or local).
// Run: node --test hub/tests/hub_apphub_search.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const HUB = path.join(ROOT, 'apps/system/apphub');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const C = require(path.join(ROOT, 'shared/search/search_core.js'));
const names = (list) => JSON.parse(JSON.stringify(list.map((a) => a.name)));   // vm-realm arrays → plain

/** apphub.js in a tiny fake page with no shared search files: only the pure helpers are used. */
function pure() {
  const node = () => ({ appendChild() {}, setAttribute() {}, removeAttribute() {}, focus() {}, dataset: {}, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, classList: { add() {}, remove() {} }, set textContent(_) {} });
  const w = { parent: null, addEventListener() {} };
  w.parent = w;
  const doc = { getElementById: () => node(), createElement: () => node(), querySelector: () => null, addEventListener() {}, activeElement: null, title: '' };
  vm.runInNewContext(read('apps/system/apphub/apphub.js'), { window: w, document: doc, location: { protocol: 'file:', hash: '', pathname: '/', search: '' }, history: { replaceState() {} }, CSS: { escape: (s) => s } });
  return w.AppHubSearch;
}
const app = (name, cat, section, desc) => ({ name, cat, section: section || '', desc: desc || '', entryUrl: 'apps/' + cat.toLowerCase() + '/' + name.toLowerCase() + '/', icon: '', newTab: false });
const cats = [{ name: 'Games' }, { name: 'Tools' }];
const lists = { Games: [app('Snake', 'Games', 'Arcade'), app('Chess', 'Games', 'Board', 'play chess')], Tools: [app('Snake Timer', 'Tools', 'Time'), app('Calculator', 'Tools')], Favorite: [app('Chess', 'Games')] };

test('scope: home = every category once, a category = only its apps', () => {
  const A = pure();
  assert.deepEqual(names(A.scopeApps('', cats, lists)), ['Snake', 'Chess', 'Snake Timer', 'Calculator']);
  assert.deepEqual(names(A.scopeApps('Tools', cats, lists)), ['Snake Timer', 'Calculator']);
  assert.equal(A.scopeApps('Media', cats, lists).length, 0);
  const dup = { Games: [app('X', 'Games')], Tools: [Object.assign(app('X', 'Games'), { cat: 'Tools' })] };
  assert.equal(A.scopeApps('', cats, dup).length, 1);
});

test('groups: home finds across categories, category page only inside it; rows keep the app to open', () => {
  const A = pure();
  const home = A.searchGroups(C.words('snake'), '', A.scopeApps('', cats, lists), C);
  assert.equal(home.length, 1);
  assert.equal(home[0][0], 'Apps');
  assert.deepEqual(names(home[0][1]), ['Snake', 'Snake Timer']);
  assert.equal(home[0][1][0].sub, 'Games \u203A Arcade');
  assert.equal(home[0][1][0].app, lists.Games[0]);
  const inTools = A.searchGroups(C.words('snake'), 'Tools', A.scopeApps('Tools', cats, lists), C);
  assert.equal(inTools[0][0], 'Apps in Tools');
  assert.deepEqual(names(inTools[0][1]), ['Snake Timer']);
  assert.equal(inTools[0][1][0].sub, 'Time');
  assert.equal(A.searchGroups(C.words('play'), '', A.scopeApps('', cats, lists), C)[0][1][0].name, 'Chess');   // description
  assert.equal(A.searchGroups(C.words('zzz'), '', A.scopeApps('', cats, lists), C).length, 0);
  assert.equal(A.searchGroups([], '', A.scopeApps('', cats, lists), C).length, 0);
});

test('index.html: shared files before apphub.js, css linked; SW shell has them', () => {
  const html = read('apps/system/apphub/index.html');
  const at = (s) => html.indexOf('<script src="' + s + '"');
  const core = at('../../../shared/search/search_core.js'), bar = at('../../../shared/search/search_bar.js'), app = at('apphub.js');
  assert.ok(core > 0 && bar > core && app > bar, [core, bar, app].join(','));
  assert.ok(html.includes('href="../../../shared/search/search_bar.css"'));
  const sw = read('hub/update/hub_sw.js');
  ['shared/search/search_core.js', 'shared/search/search_bar.js', 'shared/search/search_bar.css'].forEach((f) => assert.ok(sw.includes("'" + f + "'"), f));
});

test('without the shared files apphub.js still runs (no box)', () => {
  assert.equal(typeof pure().scopeApps, 'function');
});

function jsdom() {
  try { return require('jsdom'); } catch (_) { /* not local */ }
  try { return require(path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'jsdom')); } catch (_) { return null; }
}
async function page(J, hash, opened) {
  const f = path.join(HUB, 'index.html');
  const vc = new J.VirtualConsole(); const errs = [];
  vc.on('jsdomError', (e) => errs.push(String(e.message || e)));
  const dom = await J.JSDOM.fromFile(f, { url: 'file://' + f + (hash || ''), runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.HTMLElement.prototype.scrollIntoView = function () {};
      // a fake same-origin Hub, so a result opens the way a tile does (parent.__hubFly.openFromCat)
      const hub = { __hubFly: { openFromCat: (cat, entry, name, newTab, o) => opened.push([cat, entry, name, !!(o && o.newInstance)]) } };
      Object.defineProperty(w, 'parent', { value: hub, configurable: true });
    } });
  const w = dom.window;
  await new Promise((r) => w.addEventListener('load', r));
  await new Promise((r) => setTimeout(r, 200));
  return { w, d: w.document, errs };
}

test('page smoke (jsdom): home searches all apps, category scope, Enter opens like a tile, Esc restores', async (t) => {
  const J = jsdom();
  if (!J) { t.skip('jsdom not installed'); return; }
  const opened = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const { w, d, errs } = await page(J, '', opened);
  try {
    const q = d.querySelector('.top-search .hsb-q');
    assert.ok(q, 'search box');
    assert.equal(q.placeholder, 'Search apps');
    const type = async (v) => { q.value = v; q.dispatchEvent(new w.Event('input')); await wait(120); };
    await type('snake');
    assert.equal(d.getElementById('view').hidden, true);
    const names = [...d.querySelectorAll('.search-out .res .nm')].map((e) => e.textContent);
    assert.ok(names.length >= 1 && names[0].toLowerCase().includes('snake'), names.join('|'));
    q.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter' }));
    q.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
    assert.equal(opened.length, 2);
    assert.equal(opened[0][2], names[0]);
    assert.equal(opened[0][3], false);
    assert.equal(opened[1][3], true);
    q.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.equal(q.value, '');
    assert.equal(d.getElementById('view').hidden, false);
    assert.equal(d.querySelector('.search-out').hidden, true);
    // a category page: placeholder and scope follow; going home clears the box
    w.location.hash = 'cat=Games'; await wait(250);
    assert.equal(q.placeholder, 'Search in Games');
    await type('a');
    const cats = [...d.querySelectorAll('.search-out .res .sub')].map((e) => e.textContent);
    const gamesApps = new Set([...d.querySelectorAll('#view .card.app')].map((e) => e.dataset.entry));
    assert.ok(gamesApps.size > 0);
    assert.ok(d.querySelector('.search-out h2').textContent.startsWith('Apps in Games'));
    assert.ok(!cats.some((s) => s.includes('\u203A')), 'category scope shows sections only');
    w.location.hash = ''; await wait(250);
    assert.equal(q.value, '');
    assert.equal(q.placeholder, 'Search apps');
    assert.equal(d.getElementById('view').hidden, false);
    assert.deepEqual(errs, []);
  } finally { w.close(); }
});
