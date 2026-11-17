// H150: Start menu sections step (desktop/menu/hub_flyout.js): category > sections > apps.
// Offline Node checks only (no browser, no network). Run: node --test hub/tests/hub_flyout_sections.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'desktop/menu/hub_flyout.js'), 'utf8');
const TILES = fs.readFileSync(path.join(ROOT, 'shared/tiles/tiles.js'), 'utf8');
const GAMES_CSV = fs.readFileSync(path.join(ROOT, 'apps/games/games-apps.csv'), 'utf8');
// values made in the vm realm: compare as plain JSON
const plain = (x) => JSON.parse(JSON.stringify(x));
const same = (a, b, m) => assert.deepEqual(plain(a), plain(b), m);

/** window.TilesCsv from shared/tiles/tiles.js (the page part exits: no #grid). */
function tilesCsv() {
  const w = {};
  vm.runInNewContext(TILES, {
    window: w, location: { origin: 'null' },
    document: { getElementById: () => null, querySelector: () => null, addEventListener() {}, body: { dataset: {} } }
  });
  return w.TilesCsv;
}

/** Only the pure helpers: no #menu, so the rest of the file returns at once. */
function hubFlyout() {
  const w = { matchMedia: () => ({ matches: true }), fetch() {} };
  vm.runInNewContext(SRC, { window: w, document: { getElementById: () => null } });
  return w.HubFlyout;
}
function pureHelper() { return hubFlyout().sectionsOf; }

const app = (name, section) => ({ name, entryUrl: name + '/', section });
const shape = (out) => out.map((g) => g.section + ':' + g.apps.map((a) => a.name).join('|'));

test('sectionsOf: CSV order kept, counts, Other last', () => {
  const sectionsOf = pureHelper();
  const out = sectionsOf([app('a', 'Puzzle'), app('b', 'Arcade'), app('c', ''), app('d', 'Puzzle'), app('e', 'Arcade'), app('f')]);
  same(shape(out), ['Puzzle:a|d', 'Arcade:b|e', 'Other:c|f']);
  same(out.map((g) => g.apps.length), [2, 2, 2]);
});

test('sectionsOf: My favorites first, empty list, no sections', () => {
  const sectionsOf = pureHelper();
  const out = sectionsOf([app('a', 'Watch'), app('m1', 'My favorites'), app('b', 'Play'), app('m2', 'My favorites')]);
  same(shape(out), ['My favorites:m1|m2', 'Watch:a', 'Play:b']);
  same(sectionsOf([]), []);
  same(sectionsOf(null), []);
  same(shape(sectionsOf([app('x'), app('y')])), ['Other:x|y']);
  // a CSV section literally called "Other" merges with the unsectioned apps and stays last
  same(shape(sectionsOf([app('o', 'Other'), app('p', 'Play'), app('q')])), ['Play:p', 'Other:o|q']);
});

test('sectionsOf matches TilesCsv.groups on the real Games CSV', () => {
  const sectionsOf = pureHelper();
  const list = tilesCsv().parse(GAMES_CSV);
  const groups = tilesCsv().groups(list);
  assert.ok(list.length > 10);
  same(shape(sectionsOf(list)), shape(groups.map((g) => ({ section: g.section || 'Other', apps: g.apps }))));
});

// ---------- tiny fake DOM for the flyout itself ----------
class ClassList {
  constructor(el) { this.el = el; this.s = new Set(); }
  add(c) { this.s.add(c); } remove(c) { this.s.delete(c); } contains(c) { return this.s.has(c); }
  toggle(c, v) { if (v === undefined) v = !this.s.has(c); if (v) this.s.add(c); else this.s.delete(c); return v; }
}
class El {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.parent = null; this.classList = new ClassList(this);
    this.dataset = {}; this.style = {}; this.attrs = {}; this.events = {}; this.hidden = false; this._text = '';
    this.id = ''; this.scrollTop = 0; this.clientHeight = 100; this.scrollHeight = 100;
    this.offsetHeight = 200; this.offsetWidth = 250; this.rect = { left: 0, right: 0, top: 0, bottom: 0 };
  }
  set className(v) { this.classList.s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return Array.from(this.classList.s).join(' '); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(' '); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(k, f) { (this.events[k] = this.events[k] || []).push(f); }
  fire(k, e) { (this.events[k] || []).slice().forEach((f) => f(Object.assign({ target: this, stopPropagation() {}, preventDefault() {} }, e))); }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.appendChild(c)); }
  replaceChildren(...cs) { this.children = []; this.append(...cs); }
  replaceWith(n) { if (!this.parent) return; const p = this.parent; p.children[p.children.indexOf(this)] = n; n.parent = p; }
  contains(n) { while (n) { if (n === this) return true; n = n.parent; } return false; }
  matches(sel) { return sel.split(',').map((x) => x.trim()).some((x) => (x[0] === '#' ? this.id === x.slice(1) : x[0] === '.' ? this.classList.contains(x.slice(1)) : x.split('.')[0].toLowerCase() === this.tagName && this.classList.contains(x.split('.')[1]))); }
  closest(sel) { let n = this; while (n) { if (n.matches && n.matches(sel)) return n; n = n.parent; } return null; }
  querySelectorAll(sel) { const out = []; const walk = (n) => n.children.forEach((c) => { if (c.matches(sel)) out.push(c); walk(c); }); walk(this); return out; }
  get parentElement() { return this.parent; }
  getBoundingClientRect() { return this.rect; }
}

function load(opts) {
  const o = opts || {};
  const timers = []; let now = 0;
  const setTimeout = (fn, ms) => { const t = { fn, at: now + (ms || 0), id: timers.length + 1 }; timers.push(t); return t.id; };
  const clearTimeout = (id) => { const t = timers.find((x) => x.id === id); if (t) t.fn = null; };
  const advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.fn && t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      now = due.at; const f = due.fn; due.fn = null; f();
    }
    now = end;
  };
  const els = {};
  const document = {
    readyState: 'loading',
    getElementById: (id) => els[id] || null,
    createElement: (t) => new El(t),
    addEventListener: (k, f) => { (document.events[k] = document.events[k] || []).push(f); },
    events: {}
  };
  const host = new El('div'); host.className = 'header-left';
  const menu = new El('div'); menu.id = 'menu'; menu.className = 'menu open'; els.menu = menu;
  host.appendChild(menu);
  menu.rect = { left: 0, right: 200, top: 50, bottom: 600 };
  const rows = {};
  const catNames = ['Games', 'Favorite'].concat(o.extraCats || []);
  catNames.forEach((cat, i) => {
    const r = new El('button'); r.className = 'menu-cat'; r.dataset.cat = cat;
    r.rect = { left: 0, right: 200, top: 60 + i * 46, bottom: 106 + i * 46 };
    menu.appendChild(r); rows[cat] = r;
  });
  const store = new Map(o.store || []);
  const opened = [];
  const window = {
    matchMedia: () => ({ matches: true }),
    fetch: (u) => Promise.resolve({ ok: true, text: () => {
      const texts = Object.assign({
        'apps/games/games-apps.csv': GAMES_CSV,
        'apps/favorite/favorite-apps.csv': (o.favCsv !== undefined ? o.favCsv : 'Tetris,../games/tetris/,,,Watch\n')
      }, o.csvTexts || {});
      const hit = Object.keys(texts).find((p) => u === p || u.endsWith(p) || u.includes(p));
      return Promise.resolve(hit ? texts[hit] : (u.includes('favorite') ? texts['apps/favorite/favorite-apps.csv'] : GAMES_CSV));
    } }),
    HUB_CAT_CSV: Object.assign({ Games: 'apps/games/games-apps.csv', Favorite: 'apps/favorite/favorite-apps.csv' }, o.HUB_CAT_CSV || {}),
    HUB_APPS_CSV: 'x',
    TilesCsv: tilesCsv(),
    HubFavorites: { list: () => (o.favs !== undefined ? o.favs : [{ name: 'Mine', path: 'apps/tools/mine/' }]) },
    __hubFly: { openFromCat: (...a) => opened.push(a) },
    innerHeight: 800, innerWidth: 1200,
    addEventListener() {}, dispatchEvent() {}
  };
  const ctx = {
    window, document, setTimeout, clearTimeout, localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v))
    },
    location: { protocol: 'http:' }, fetch: window.fetch,
    CustomEvent: class { constructor(t, d) { this.type = t; this.detail = d && d.detail; } },
    Event: class { constructor(t) { this.type = t; } },
    MutationObserver: class { observe() {} }
  };
  vm.runInNewContext(SRC, ctx);
  const fly = host.children.find((c) => c.id === 'menu-fly');
  const appsCol = host.children.find((c) => c.id === 'menu-fly-apps');
  fly.rect = { left: 204, right: 454, top: 50, bottom: 600 };
  appsCol.rect = { left: 458, right: 708, top: 50, bottom: 600 };
  const tick = () => new Promise((r) => setImmediate(r));
  const mouse = (el, target, x, y, extra) => el.fire('pointermove', Object.assign({ pointerType: 'mouse', target, clientX: x || 0, clientY: y || 0 }, extra));
  return { window, document, menu, rows, fly, appsCol, store, opened, advance, tick, mouse };
}

test('hover category → section rows only; hover section → its apps column', async () => {
  const h = load();
  h.mouse(h.menu, h.rows.Games, 100, 80);
  h.advance(100); await h.tick(); await h.tick(); await h.tick();
  assert.equal(h.fly.hidden, false);
  assert.equal(h.fly.querySelectorAll('.fly-app').length, 0, 'no apps in the section column');
  const secs = h.fly.querySelectorAll('.fly-row');
  const groups = h.window.TilesCsv.groups(h.window.TilesCsv.parse(GAMES_CSV));
  same(secs.map((r) => r.dataset.sec), groups.map((g) => g.section || 'Other'));
  assert.equal(secs[0].children[1].textContent, '(' + groups[0].apps.length + ')');
  assert.equal(h.appsCol.hidden, true);

  secs.forEach((r, i) => { r.rect = { left: 204, right: 454, top: 60 + i * 40, bottom: 100 + i * 40 }; });
  h.mouse(h.fly, secs[0].children[0], 300, 80);   // over the name span inside the row
  h.advance(99);
  assert.equal(h.appsCol.hidden, true, 'waits the open delay');
  h.advance(1);
  assert.equal(h.appsCol.hidden, false);
  const apps = h.appsCol.querySelectorAll('.fly-app');
  assert.equal(apps.length, groups[0].apps.length);
  assert.ok(secs[0].classList.contains('fly-on'));

  // diagonal grace zone: heading from section 0 towards the apps column over section 1 keeps section 0
  h.mouse(h.fly, secs[1], 440, 105);
  h.advance(100);
  assert.ok(secs[0].classList.contains('fly-on'), 'grace zone keeps the open section');
  h.advance(600);   // gave up heading there (GRACE_MAX) → section 1 opens
  assert.ok(secs[1].classList.contains('fly-on'));
  assert.equal(h.appsCol.querySelectorAll('.fly-app').length, groups[1].apps.length);

  // click a section = open it at once, menu stays open
  secs[2].fire('click', {});
  assert.ok(secs[2].classList.contains('fly-on'));
  assert.equal(h.appsCol.querySelectorAll('.fly-app').length, groups[2].apps.length);
  assert.equal(h.fly.hidden, false);

  // an app opens like before (openFromCat; Shift = new window), everything closes
  const first = h.appsCol.querySelectorAll('.fly-app')[0];
  first.fire('click', { shiftKey: true });
  assert.equal(h.opened.length, 1);
  assert.equal(h.opened[0][0], 'Games');
  assert.equal(h.opened[0][1], first.dataset.entryUrl);
  assert.equal(h.opened[0][2], groups[2].apps[0].name);
  assert.match(h.opened[0][1], /^apps\//);
  same(h.opened[0][4], { newInstance: true });
  assert.equal(h.fly.hidden, true);
  assert.equal(h.appsCol.hidden, true);
});

test('Favorite: My favorites first; startList cache + HubStartList unchanged; keys hide', async () => {
  const h = load();
  h.mouse(h.menu, h.rows.Favorite, 100, 120);
  h.advance(100); await h.tick(); await h.tick(); await h.tick();
  const secs = h.fly.querySelectorAll('.fly-row').map((r) => r.dataset.sec);
  same(secs, ['My favorites', 'Watch']);
  const saved = JSON.parse(h.store.get('sites-hub.startList'));
  assert.ok(saved.cats.Favorite.list.length === 1);
  assert.equal(h.window.HubStartList.cached('Favorite')[0].name, 'Tetris');
  assert.equal(typeof h.window.HubStartList.load, 'function');

  const row = h.fly.querySelectorAll('.fly-row')[0];
  row.fire('click', {});
  assert.equal(h.appsCol.hidden, false);
  // back to another category row: switches and closes the apps column
  h.mouse(h.menu, h.rows.Games, 100, 80);
  h.advance(100); await h.tick(); await h.tick(); await h.tick();
  assert.equal(h.appsCol.hidden, true);
  assert.equal(h.fly.querySelectorAll('.fly-row')[0].dataset.sec, h.window.TilesCsv.groups(h.window.TilesCsv.parse(GAMES_CSV))[0].section);
  // any key hides both columns
  h.fly.querySelectorAll('.fly-row')[0].fire('click', {});
  assert.equal(h.appsCol.hidden, false);
  h.document.events.keydown.forEach((f) => f({ key: 'ArrowDown' }));
  assert.equal(h.fly.hidden, true);
  assert.equal(h.appsCol.hidden, true);
});

test('touch / pen pointers do nothing', async () => {
  const h = load();
  h.mouse(h.menu, h.rows.Games, 100, 80, { pointerType: 'touch' });
  h.advance(500); await h.tick();
  assert.equal(h.fly.hidden, true);
  assert.equal(h.appsCol.hidden, true);
});

test('leaving menu + both columns closes after the close delay', async () => {
  const h = load();
  h.mouse(h.menu, h.rows.Games, 100, 80);
  h.advance(100); await h.tick(); await h.tick(); await h.tick();
  h.fly.querySelectorAll('.fly-row')[0].fire('click', {});
  // moving from the apps column into the section column is not a leave
  h.appsCol.fire('pointerleave', { pointerType: 'mouse', relatedTarget: h.fly });
  h.advance(1000);
  assert.equal(h.appsCol.hidden, false);
  h.appsCol.fire('pointerleave', { pointerType: 'mouse', relatedTarget: null });
  h.advance(349);
  assert.equal(h.appsCol.hidden, false);
  h.advance(1);
  assert.equal(h.fly.hidden, true);
  assert.equal(h.appsCol.hidden, true);
});

// ---------- H156: skip the section step when a category has only one section ----------
test('H156 skipSectionStep: one section skips, two or more and empty do not', () => {
  const F = hubFlyout();
  assert.equal(F.skipSectionStep(F.sectionsOf([app('x'), app('y')])), true);
  assert.equal(F.skipSectionStep(F.sectionsOf([app('a', 'Puzzle'), app('b', 'Puzzle')])), true);
  assert.equal(F.skipSectionStep(F.sectionsOf([app('a', 'Puzzle'), app('b', 'Arcade')])), false);
  assert.equal(F.skipSectionStep(F.sectionsOf([])), false);
  assert.equal(F.skipSectionStep(F.sectionsOf(null)), false);
  assert.equal(F.skipSectionStep(null), false);
});

test('H156: one-section category shows apps directly; no section rows; click opens', async () => {
  const h = load({
    extraCats: ['Tools'],
    HUB_CAT_CSV: { Tools: 'apps/tools/tools-apps.csv' },
    csvTexts: { 'apps/tools/tools-apps.csv': 'Calc,../tools/calc/,,,\nClock,../tools/clock/,,,\n' }
  });
  h.mouse(h.menu, h.rows.Tools, 100, 160);
  h.advance(100); await h.tick(); await h.tick(); await h.tick();
  assert.equal(h.fly.hidden, false);
  assert.equal(h.fly.querySelectorAll('.fly-row').length, 0, 'no section rows');
  const apps = h.fly.querySelectorAll('.fly-app');
  assert.equal(apps.length, 2);
  same(apps.map((a) => a.textContent.replace(/\s+/g, ' ').trim()), ['Calc', 'Clock']);
  assert.equal(h.appsCol.hidden, true, 'apps stay in the first column');
  apps[0].fire('click', {});
  assert.equal(h.opened.length, 1);
  assert.equal(h.opened[0][0], 'Tools');
  assert.match(h.opened[0][1], /tools\/calc/);
  assert.equal(h.opened[0][2], 'Calc');
  assert.equal(h.fly.hidden, true);
  assert.equal(h.appsCol.hidden, true);
});

test('H156: Favourites with empty sections and no personal favs shows apps directly', async () => {
  const h = load({ favCsv: 'TV,../../tv/,,,\nNews,../media/news/,,,\n', favs: [] });
  h.mouse(h.menu, h.rows.Favorite, 100, 120);
  h.advance(100); await h.tick(); await h.tick(); await h.tick();
  assert.equal(h.fly.hidden, false);
  assert.equal(h.fly.querySelectorAll('.fly-row').length, 0, 'no lone Other row');
  const apps = h.fly.querySelectorAll('.fly-app');
  assert.equal(apps.length, 2);
  same(apps.map((a) => a.textContent.replace(/\s+/g, ' ').trim()), ['TV', 'News']);
  assert.equal(h.appsCol.hidden, true);
  // keyboard still hides the flyout
  h.document.events.keydown.forEach((f) => f({ key: 'ArrowDown' }));
  assert.equal(h.fly.hidden, true);
  assert.equal(h.appsCol.hidden, true);
});

test('H156: Favourites with personal favs and unsectioned CSV still uses two sections', async () => {
  const h = load({ favCsv: 'TV,../../tv/,,,\n' });
  h.mouse(h.menu, h.rows.Favorite, 100, 120);
  h.advance(100); await h.tick(); await h.tick(); await h.tick();
  same(h.fly.querySelectorAll('.fly-row').map((r) => r.dataset.sec), ['My favorites', 'Other']);
  assert.equal(h.fly.querySelectorAll('.fly-app').length, 0, 'apps stay in the third column');
  assert.equal(h.appsCol.hidden, true);
});

test('H156: Games (many sections) still opens the section column, not apps', async () => {
  const h = load();
  h.mouse(h.menu, h.rows.Games, 100, 80);
  h.advance(100); await h.tick(); await h.tick(); await h.tick();
  assert.equal(h.fly.hidden, false);
  assert.ok(h.fly.querySelectorAll('.fly-row').length >= 2);
  assert.equal(h.fly.querySelectorAll('.fly-app').length, 0);
  assert.equal(h.appsCol.hidden, true);
});

test('H156: touch / pen still does nothing on a one-section category', async () => {
  const h = load({
    extraCats: ['Tools'],
    HUB_CAT_CSV: { Tools: 'apps/tools/tools-apps.csv' },
    csvTexts: { 'apps/tools/tools-apps.csv': 'Calc,../tools/calc/,,,\n' }
  });
  h.mouse(h.menu, h.rows.Tools, 100, 160, { pointerType: 'touch' });
  h.advance(500); await h.tick();
  assert.equal(h.fly.hidden, true);
  assert.equal(h.appsCol.hidden, true);
});
