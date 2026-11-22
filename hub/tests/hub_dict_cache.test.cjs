// H173: Dictionary data uses its own versioned cache (DICT), not RUNTIME.
// Static source checks plus a small in-memory Cache Storage mock (no browser).
// Run: node --test hub/tests/hub_dict_cache.test.cjs
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SW = path.join(ROOT, 'hub/update/hub_sw.js');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function dictBranch(sw) {
  const i = sw.indexOf("path.includes('/apps/learn/dictionary/data/')");
  assert.ok(i > 0, 'dictionary data branch is present');
  const end = sw.indexOf('return;', i);
  return sw.slice(i, end + 'return;'.length);
}

function activateBlock(sw) {
  const i = sw.indexOf("addEventListener('activate'");
  const j = sw.indexOf("addEventListener('message'");
  assert.ok(i > 0 && j > i, 'activate listener is present');
  return sw.slice(i, j);
}

test('H173: DICT is a versioned hub-dict-* cache, separate from RUNTIME', () => {
  const sw = read('hub/update/hub_sw.js');
  const m = sw.match(/^const DICT = '(hub-dict-\d+)';/m);
  assert.ok(m, 'const DICT exists');
  assert.equal(m[1].startsWith('hub-dict-'), true);
  assert.equal(m[1], 'hub-dict-1');
  assert.match(sw, /^const CACHE = 'hub-shell-v\d+';/m);
  assert.match(sw, /^const RUNTIME = 'hub-rt-1';/m);
  assert.match(sw, /^const META = 'hub-meta';/m);
});

test('H173: dictionary data branch looks up and stores only in DICT', () => {
  const sw = read('hub/update/hub_sw.js');
  const block = dictBranch(sw);
  const live = strip(block);
  assert.match(live, /caches\.open\(\s*DICT\s*\)/);
  assert.match(live, /put\(\s*DICT\s*,\s*bare/);
  assert.equal(/\bRUNTIME\b/.test(live), false, 'live dictionary branch does not use RUNTIME');
  assert.equal(/caches\.match\(\s*req/.test(live), false, 'does not search all caches');
  assert.match(block, /\/\/ \(before H173\).*caches\.match\(req.*put\(RUNTIME/);
  assert.match(sw, /staleWhileRevalidate/);
  assert.match(strip(sw), /networkFirst\(\s*req\s*,\s*CACHE/);
  assert.match(strip(sw), /networkFirst\(\s*req\s*,\s*RUNTIME/);
});

test('H173: activate deletes stale hub-dict-* caches and purges dictionary data from RUNTIME', () => {
  const sw = read('hub/update/hub_sw.js');
  const act = activateBlock(sw);
  const live = strip(act);
  assert.match(live, /k\.startsWith\('hub-dict-'\)\s*&&\s*k !== DICT/);
  assert.match(live, /k\.startsWith\('hub-shell-'\)\s*&&\s*k !== CACHE/);
  assert.match(live, /k\.startsWith\('hub-rt-'\)\s*&&\s*k !== RUNTIME/);
  assert.match(act, /\/\/ \(before H173\).*hub-shell-.*hub-rt-/);
  assert.match(live, /caches\.open\(\s*RUNTIME\s*\)/);
  assert.match(live, /\/apps\/learn\/dictionary\/data\//);
  assert.match(live, /clients\.claim\s*\(/);
  assert.match(act, /hub-meta/);
  assert.match(act, /try\s*\{/);
  assert.equal(/caches\.delete\(\s*META\s*\)/.test(live), false, 'activate does not delete hub-meta');
});

// --- in-memory Cache Storage mock, so activate + fetch can run without a browser ---

function keyOf(req, ignoreSearch) {
  const url = typeof req === 'string' ? req : req.url;
  return ignoreSearch ? url.split('?')[0] : url;
}

function makeCaches() {
  const stores = new Map();
  function store(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    const map = stores.get(name);
    return {
      async match(req, opts = {}) {
        const want = keyOf(req, !!opts.ignoreSearch);
        if (opts.ignoreSearch) {
          for (const [u, r] of map) { if (u.split('?')[0] === want) return r; }
          return undefined;
        }
        return map.get(want);
      },
      async put(req, res) { map.set(typeof req === 'string' ? req : req.url, res); },
      async delete(req) { return map.delete(typeof req === 'string' ? req : req.url); },
      async keys() { return [...map.keys()].map((u) => new Request(u)); },
      _map: map,
    };
  }
  return {
    stores,
    open: async (name) => store(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (req, opts) => {
      for (const name of stores.keys()) {
        const hit = await store(name).match(req, opts);
        if (hit) return hit;
      }
    },
  };
}

function basicRes(body) {
  return { status: 200, type: 'basic', ok: true, body, clone() { return basicRes(body); } };
}

function loadSw(caches, fetchImpl) {
  const listeners = { install: [], activate: [], message: [], fetch: [] };
  const origin = 'https://hub.test/';
  const self = {
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    registration: { scope: origin, active: true },
    location: { origin: 'https://hub.test' },
    clients: { claim: async () => { self._claimed = true; } },
    skipWaiting: async () => {},
    _claimed: false,
  };
  const ctx = vm.createContext({
    self, caches, fetch: fetchImpl, URL, Request, Response, console,
    Promise, Set, JSON, Date, Uint8Array,
  });
  // The SW refers to unqualified self / caches / fetch / URL as globals, and also `self`.
  ctx.caches = caches;
  vm.runInContext(fs.readFileSync(SW, 'utf8') + '\nthis.__HUB = { V, CACHE, RUNTIME, DICT, META };', ctx, { filename: 'hub_sw.js' });
  return { self, ctx, listeners };
}

async function fire(listeners, type, event) {
  for (const fn of listeners[type]) fn(event);
  if (event._wait) await event._wait;
  return event;
}

function extendable() {
  const e = { _wait: Promise.resolve() };
  e.waitUntil = (p) => { e._wait = Promise.all([e._wait, Promise.resolve(p)]); };
  e.respondWith = (p) => { e._resp = Promise.resolve(p); e.waitUntil(e._resp); };
  return e;
}

test('H173: activate drops stale hub-dict-* and dictionary RUNTIME entries, keeps the rest', async () => {
  const caches = makeCaches();
  const { ctx, listeners, self } = loadSw(caches, async () => { throw new Error('no network in activate test'); });
  const { CACHE, RUNTIME, DICT, META } = ctx.__HUB;
  assert.equal(DICT, 'hub-dict-1');
  await caches.open('hub-shell-v188');
  await caches.open(CACHE);
  await caches.open('hub-rt-0');
  const rt = await caches.open(RUNTIME);
  const staleDict = await caches.open('hub-dict-0');
  const dict = await caches.open(DICT);
  const meta = await caches.open(META);
  const other = 'https://hub.test/apps/learn/dictionary/index.html';
  const letter = 'https://hub.test/apps/learn/dictionary/data/a.json';
  const image = 'https://hub.test/apps/system/settings/settings_icon.png';
  await rt.put(letter, basicRes('old-rt'));
  await rt.put(other, basicRes('keep-app'));
  await rt.put(image, basicRes('keep-img'));
  await staleDict.put(letter, basicRes('old-dict'));
  await dict.put(letter, basicRes('fresh-dict'));
  await meta.put('https://hub.test/__hub_failed__', basicRes('[]'));

  const ev = extendable();
  await fire(listeners, 'activate', ev);

  const names = new Set(await caches.keys());
  assert.equal(names.has('hub-shell-v188'), false);
  assert.equal(names.has('hub-rt-0'), false);
  assert.equal(names.has('hub-dict-0'), false);
  assert.equal(names.has(CACHE), true);
  assert.equal(names.has(RUNTIME), true);
  assert.equal(names.has(DICT), true);
  assert.equal(names.has(META), true);
  assert.equal(self._claimed, true);

  const rtKeys = [...(await caches.open(RUNTIME))._map.keys()];
  assert.equal(rtKeys.includes(letter), false, 'dictionary data purged from RUNTIME');
  assert.equal(rtKeys.includes(other), true, 'other RUNTIME app pages kept');
  assert.equal(rtKeys.includes(image), true, 'other RUNTIME images kept');
  assert.equal((await dict.match(letter)).body, 'fresh-dict');
  assert.equal((await meta.match('https://hub.test/__hub_failed__')).body, '[]');
});

test('H173: dictionary fetch is cache-first in DICT and ignores stale RUNTIME copies', async () => {
  const caches = makeCaches();
  let fetches = 0;
  const fetchImpl = async (req) => {
    fetches += 1;
    return basicRes('network-fresh');
  };
  const { ctx, listeners } = loadSw(caches, fetchImpl);
  const { RUNTIME, DICT } = ctx.__HUB;
  const bare = 'https://hub.test/apps/learn/dictionary/data/b.json';
  const withV = bare + '?v=old';
  const rt = await caches.open(RUNTIME);
  await rt.put(bare, basicRes('stale-runtime'));

  const ev1 = extendable();
  ev1.request = new Request(withV);
  await fire(listeners, 'fetch', ev1);
  const res1 = await ev1._resp;
  assert.equal(res1.body, 'network-fresh', 'stale RUNTIME copy is not used');
  assert.equal(fetches, 1);
  const dict = await caches.open(DICT);
  assert.equal((await dict.match(bare)).body, 'network-fresh', 'stored in DICT under the bare URL');
  assert.equal((await rt.match(bare)).body, 'stale-runtime', 'RUNTIME copy is left untouched on fetch');

  const ev2 = extendable();
  ev2.request = new Request(withV);
  await fire(listeners, 'fetch', ev2);
  const res2 = await ev2._resp;
  assert.equal(res2.body, 'network-fresh', 'second request is cache-first from DICT (ignoreSearch)');
  assert.equal(fetches, 1, 'no extra network fetch when DICT has the letter');
});
