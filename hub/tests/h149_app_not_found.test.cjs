// H149: App not found card for an unknown app hash.
// Offline Node checks only (no browser, no network). Run: node --test hub/tests/h149_app_not_found.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const HUB_JS = path.join(ROOT, 'hub/core/hub.js');
const SEARCH_JS = path.join(ROOT, 'apps/system/search/search.js');

const CSV = [
  'CATEGORY,NAME,ENTRY_URL,ICON_URL,NEW_TAB,HIDDEN,ORDER',
  'System,Search,apps/system/search/,,0,0,0'
].join('\n');

class ClassList {
  constructor() { this.s = new Set(); }
  add(c) { String(c).split(/\s+/).filter(Boolean).forEach((x) => this.s.add(x)); }
  remove(c) { String(c).split(/\s+/).filter(Boolean).forEach((x) => this.s.delete(x)); }
  contains(c) { return this.s.has(c); }
  toggle(c, v) {
    if (v === undefined) v = !this.s.has(c);
    if (v) this.s.add(c); else this.s.delete(c);
    return v;
  }
  toString() { return [...this.s].join(' '); }
}

function ev() {
  const m = new Map();
  return {
    add(k, f, o) { if (!m.has(k)) m.set(k, []); m.get(k).push({ f, o }); },
    remove(k, f) {
      const a = m.get(k) || [];
      const i = a.findIndex((x) => x.f === f);
      if (i >= 0) a.splice(i, 1);
    },
    fire(k, e) { (m.get(k) || []).slice().forEach((x) => x.f(e)); },
    has(k) { return (m.get(k) || []).length > 0; }
  };
}

function el(tag, id) {
  const e = {
    tagName: String(tag || 'div').toUpperCase(),
    id: id || '',
    className: '',
    classList: new ClassList(),
    hidden: false,
    textContent: '',
    innerHTML: '',
    title: '',
    type: '',
    href: '',
    src: '',
    dataset: {},
    attrs: new Map(),
    children: [],
    parent: null,
    events: ev(),
    style: {},
    disabled: false,
    inert: false,
    contentWindow: null,
    contentDocument: null,
    setAttribute(k, v) {
      this.attrs.set(k, String(v));
      if (k === 'id') this.id = String(v);
      if (k === 'class') this.className = String(v);
    },
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; },
    removeAttribute(k) { this.attrs.delete(k); },
    addEventListener(k, f, o) { this.events.add(k, f, o); },
    removeEventListener(k, f) { this.events.remove(k, f); },
    appendChild(n) {
      n.parent = this;
      n._doc = this._doc;
      this.children.push(n);
      if (n.id && n._doc) n._doc._index.set(n.id, n);
      return n;
    },
    append(...nodes) { nodes.forEach((n) => this.appendChild(n)); },
    removeChild(n) {
      const i = this.children.indexOf(n);
      if (i >= 0) this.children.splice(i, 1);
      n.parent = null;
      return n;
    },
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) { return queryAll(this, sel); },
    closest() { return null; },
    matches() { return false; },
    focus() { this._focused = true; },
    click() { this.events.fire('click', { target: this, preventDefault() {}, stopPropagation() {} }); }
  };
  Object.defineProperty(e, 'textContent', {
    get() { return e._text != null ? e._text : collectText(e); },
    set(v) { e._text = String(v); e.children = []; },
    configurable: true
  });
  e._text = '';
  return e;
}

function collectText(node) {
  if (node._text != null && node.children.length === 0) return node._text;
  let t = node._text || '';
  for (const c of node.children) t += collectText(c);
  return t;
}

function queryAll(root, sel) {
  const out = [];
  function walk(n) {
    if (match(n, sel)) out.push(n);
    (n.children || []).forEach(walk);
  }
  (root.children || []).forEach(walk);
  return out;
}

function match(n, sel) {
  if (!n || !sel) return false;
  if (sel[0] === '#') return n.id === sel.slice(1);
  const attr = sel.match(/^\[data-act(?:="([^"]*)")?\]$/);
  if (attr) return attr[1] ? n.dataset.act === attr[1] : !!n.dataset.act;
  if (sel === 'button.app') return n.tagName === 'BUTTON' && n.classList.contains('app');
  if (sel === 'button') return n.tagName === 'BUTTON';
  if (sel === 'span') return n.tagName === 'SPAN';
  if (sel.includes('.')) {
    const [tag, ...cls] = sel.split('.');
    if (tag && n.tagName !== tag.toUpperCase()) return false;
    return cls.every((c) => n.classList.contains(c) || n.className.split(/\s+/).includes(c));
  }
  return n.tagName === sel.toUpperCase();
}

function loadHub(opts) {
  const o = opts || {};
  const wev = ev();
  const dev = ev();
  const store = new Map(o.store || []);
  const byId = new Map();
  const body = el('body');
  body.classList = new ClassList();
  const docEl = el('html');
  docEl.classList = new ClassList();

  const frameEv = ev();
  const frameLoc = { href: 'about:blank', hash: '', protocol: 'https:', pathname: '/', replace(u) { frameLoc.href = String(u); } };
  const frame = el('iframe', 'app-frame');
  frame.dataset = {};
  frame.contentWindow = {
    location: frameLoc,
    focus() {},
    document: { title: '', addEventListener() {}, removeEventListener() {} },
    addEventListener(k, f, o) { frameEv.add(k, f, o); },
    removeEventListener(k, f) { frameEv.remove(k, f); }
  };
  frame.contentDocument = frame.contentWindow.document;
  frame.focus = () => {};

  const ids = {
    'cat-btn': el('button', 'cat-btn'),
    'cat-label': el('span', 'cat-label'),
    menu: el('div', 'menu'),
    'app-frame': frame,
    empty: el('div', 'empty'),
    'lab-label': el('div', 'lab-label'),
    'lab-label-name': el('span', 'lab-label-name'),
    gamebar: null,
    'empty-text': el('div', 'empty-text'),
    tiles: el('div', 'tiles'),
    'frame-wrap': el('div', 'frame-wrap'),
    'ctrl-popover': el('div', 'ctrl-popover')
  };
  ids['ctrl-popover'].hidden = true;
  ids.empty.classList.add('hidden'); // start as if... actually home is not hidden at first
  ids.empty.classList.remove('hidden');

  const doc = {
    documentElement: docEl,
    body,
    readyState: 'complete',
    title: 'Hub',
    baseURI: 'https://example.test/sites/desktop/desktop.html',
    _index: byId,
    getElementById(id) { return byId.get(id) || ids[id] || null; },
    createElement(tag) { const n = el(tag); n._doc = doc; return n; },
    createTextNode(t) { const n = el('#text'); n._text = String(t); return n; },
    addEventListener(k, f, opt) { dev.add(k, f, opt); },
    removeEventListener(k, f) { dev.remove(k, f); },
    activeElement: body
  };
  Object.values(ids).forEach((n) => { if (n) { n._doc = doc; if (n.id) byId.set(n.id, n); } });

  const loc = {
    protocol: 'https:',
    href: 'https://example.test/sites/desktop/desktop.html' + (o.hash ? '#' + o.hash : ''),
    pathname: '/sites/desktop/desktop.html',
    search: '',
    hash: o.hash ? '#' + o.hash : '',
    origin: 'https://example.test'
  };
  function applyUrl(url) {
    const u = new URL(url, loc.origin);
    loc.pathname = u.pathname;
    loc.search = u.search;
    loc.hash = u.hash;
    loc.href = u.origin + u.pathname + u.search + u.hash;
  }

  const ctx = {
    window: null,
    document: doc,
    location: loc,
    history: {
      replaceState(_s, _t, url) { applyUrl(url); },
      pushState(_s, _t, url) { applyUrl(url); }
    },
    localStorage: {
      getItem(k) { return store.has(k) ? store.get(k) : null; },
      setItem(k, v) { store.set(k, String(v)); },
      removeItem(k) { store.delete(k); }
    },
    URL,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    clearTimeout,
    console,
    qrcode: undefined,
    MutationObserver: function () { return { observe() {}, disconnect() {} }; },
    CustomEvent: function (type, init) { return { type, detail: init && init.detail }; },
    addEventListener(k, f, opt) { wev.add(k, f, opt); },
    removeEventListener(k, f) { wev.remove(k, f); },
    dispatchEvent(e) { wev.fire(e.type, e); return true; }
  };
  ctx.window = ctx;
  ctx.global = ctx;
  ctx.window.HUB_MENU_LABEL = 'Home';
  ctx.window.HUB_APPS_CSV = CSV;
  ctx.window.HUB_TILES = [];
  ctx.window.HUB_CAT_CSV = { System: 'apps/system/system-apps.csv' };
  // All lists "cached" (empty) so start() calls applyHash(true) immediately, no 4 s wait.
  ctx.window.HubStartList = {
    cached() { return []; },
    load() { return Promise.resolve([]); }
  };

  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(HUB_JS, 'utf8'), ctx, { filename: 'hub.js' });
  // primeFrame waits for iframe load before replaceFrame of the pending app url
  frame.events.fire('load', { type: 'load' });

  return {
    ctx,
    loc,
    store,
    doc,
    frame,
    frameLoc,
    wev,
    dev,
    card() { return doc.getElementById('hub-app-missing'); },
    cardText() {
      const c = doc.getElementById('hub-app-missing');
      return c ? collectText(c) : '';
    },
    cardOpen() {
      const c = doc.getElementById('hub-app-missing');
      return !!(c && !c.hidden && c.classList.contains('open'));
    },
    fireHashchange() { wev.fire('hashchange', { type: 'hashchange' }); },
    setHash(id) {
      loc.hash = id ? '#' + id : '';
      loc.href = 'https://example.test/sites/desktop/desktop.html' + loc.hash;
    },
    click(act) {
      const c = doc.getElementById('hub-app-missing');
      const btn = c && c.querySelector('[data-act="' + act + '"]');
      assert.ok(btn, 'button ' + act);
      btn.click();
    }
  };
}

test('H149: unknown id shows the card, clears the hash, and has no 404 text', () => {
  const h = loadHub({ hash: 'no-such-app' });
  assert.equal(h.cardOpen(), true);
  assert.equal(h.loc.hash, '', 'stale hash must be cleared');
  const text = h.cardText();
  assert.match(text, /App not found/);
  assert.match(text, /no-such-app/);
  assert.match(text, /We couldn't find/);
  assert.match(text, /may have moved or been removed/);
  assert.match(text, /Go home/);
  assert.match(text, /Search apps/);
  assert.doesNotMatch(text, /404/i);
  assert.doesNotMatch(h.doc.title, /404/i);
});

test('H149: known id opens the app and does not show the card', () => {
  const h = loadHub({ hash: 'search' });
  assert.equal(h.cardOpen(), false);
  assert.equal(h.loc.hash, '#search');
  assert.match(h.frameLoc.href, /apps\/system\/search/);
  assert.doesNotMatch(h.doc.title, /App not found/);
  const c = h.card();
  const text = c ? collectText(c) : '';
  assert.doesNotMatch(text, /404/i);
});

test('H149: empty hash stays on home and does not show the card', () => {
  const h = loadHub({ hash: '' });
  assert.equal(h.cardOpen(), false);
  assert.equal(h.loc.hash, '');
  assert.equal(h.doc.getElementById('empty').classList.contains('hidden'), false);
  assert.doesNotMatch(h.doc.title, /App not found/);
});

test('H149: hashchange to an unknown id shows the card and clears the hash', () => {
  const h = loadHub({ hash: 'search' });
  assert.equal(h.cardOpen(), false);
  h.setHash('missing-game');
  h.fireHashchange();
  assert.equal(h.cardOpen(), true);
  assert.equal(h.loc.hash, '');
  assert.match(h.cardText(), /missing-game/);
  assert.doesNotMatch(h.cardText(), /404/i);
});

test('H149: a saved last-opened id that is gone is cleared silently, no card', () => {
  const h = loadHub({ hash: '', store: [['sites-hub.lastApp', 'vanished-app']] });
  assert.equal(h.cardOpen(), false);
  assert.equal(h.store.has('sites-hub.lastApp'), false);
  assert.equal(h.loc.hash, '');
});

test('H149: long ids are truncated in the card, full id kept for Search', () => {
  const long = 'this-is-a-very-long-unknown-app-id-that-should-be-truncated-after-sixty';
  const h = loadHub({ hash: long });
  const shown = h.doc.getElementById('hub-missing-id').textContent;
  assert.ok(shown.length <= 61, 'truncated to about 60 chars');
  assert.ok(shown.endsWith('\u2026'));
  assert.equal(h.card().dataset.id, long);
});

test('H149: Search apps opens System Search with ?q= prefilled', () => {
  const h = loadHub({ hash: 'no-such-app' });
  assert.equal(h.cardOpen(), true);
  h.click('search');
  assert.equal(h.cardOpen(), false);
  assert.match(h.frameLoc.href, /apps\/system\/search\//);
  assert.match(h.frameLoc.href, /[?&]q=no-such-app/);
});

test('H149: search.js still reads ?q= to prefill the box', () => {
  const src = fs.readFileSync(SEARCH_JS, 'utf8');
  assert.match(src, /URLSearchParams\(location\.search\)\.get\('q'\)/);
});
