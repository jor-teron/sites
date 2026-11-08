/* H138a: no network; all credentials below are synthetic placeholders. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const STORE = 'sites-hub.credentials';
const OLD = ['sites-hub.keys', 'sites-hub.providers', 'sites-hub.keysUndo'];
function browser(shared = new Map(), options = {}) {
  const reads = [], writes = [], events = {}, logs = [], opened = [];
  class Storage {
    get length() { return shared.size; }
    key(i) { return [...shared.keys()][i] || null; }
    getItem(k) { reads.push(k); if (OLD.includes(k)) throw Error('Forbidden legacy read'); return shared.get(k) ?? null; }
    setItem(k, v) { if (options.blocked) throw Error('Storage blocked'); writes.push(k); shared.set(k, String(v)); }
    removeItem(k) { if (options.blocked) throw Error('Storage blocked'); shared.delete(k); }
  }
  const localStorage = new Storage();
  const c = vm.createContext({ localStorage, Storage, URL, Date, Math, Set, Map, Uint8Array,
    TextDecoder, TextEncoder, AbortController, DOMException, crypto: require('node:crypto').webcrypto,
    document: { currentScript: { src: 'https://hub.test/hub/core/hub_keys.js' }, readyState: 'loading' },
    location: { href: 'https://hub.test/desktop/desktop.html', hash: '' }, navigator: { userAgent: 'Test' },
    console: { warn: (...a) => logs.push(a), log: (...a) => logs.push(a) },
    setTimeout: () => 1, clearTimeout() {},
    fetch: async () => { throw Error('Unexpected network'); },
    addEventListener: (type, cb) => (events[type] ||= []).push(cb),
    open: (...a) => opened.push(a),
  });
  c.window = c; c.top = c;
  function load(file) { vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file }); }
  function init() { ['credentials', 'keys', 'providers'].forEach((n) => load(`hub/core/hub_${n}.js`)); }
  function storage(key = STORE) { (events.storage || []).forEach((fn) => fn({ key, storageArea: localStorage, oldValue: 'before', newValue: 'after' })); }
  return { c, shared, reads, writes, logs, opened, load, init, storage, options };
}
const plain = (x) => JSON.parse(JSON.stringify(x));
function provider(b) { return b.c.HubProviders.add({ label: 'Synthetic provider', type: 'openai', key: 'placeholder-provider', endpoint: 'https://provider.invalid/v1' }); }

test('cold start deletes exact legacy records without reads or migration; unrelated data survives', async () => {
  const data = new Map(OLD.map((k) => [k, 'do-not-read-placeholder']));
  data.set('sites-hub.webdav.accounts', 'unrelated-placeholder');
  data.set('ocr-settings', 'unrelated-placeholder');
  const b = browser(data); b.init();
  assert.equal(await b.c.HubKeys.get('gemini'), null);
  assert.equal(b.c.HubProviders.list().length, 0);
  assert.ok(OLD.every((k) => !data.has(k)));
  assert.equal(data.get('ocr-settings'), 'unrelated-placeholder');
  assert.equal(data.get('sites-hub.webdav.accounts'), 'unrelated-placeholder');
  assert.equal(data.has(STORE), false);
  assert.ok(b.reads.every((k) => !OLD.includes(k)));
});

test('new service/provider CRUD shares one record, preserves sections and stable ids', async () => {
  const b = browser(); b.init(); const K = b.c.HubKeys, P = b.c.HubProviders;
  assert.equal(K.set(' Gemini ', ' placeholder-service '), true);
  const id = provider(b); assert.match(id, /^svc_[a-z0-9]+$/);
  assert.equal(await K.get('gemini'), 'placeholder-service');
  P.update(id, { label: 'Renamed', key: '' });
  assert.equal(P.info(id).id, id);
  assert.equal((await P.secret(id)).key, 'placeholder-provider');
  assert.ok(!JSON.stringify(P.list()).includes('placeholder-provider'));
  assert.ok(!JSON.stringify(P.info(id)).includes('placeholder-provider'));
  K.set('tavily', 'placeholder-search'); assert.equal(P.has(id), true);
  P.update(id, { key: null }); assert.equal((await P.secret(id)).key, '');
  assert.equal(K.remove('gemini'), true); assert.equal(await K.get('gemini'), null);
  assert.equal(P.remove(id), true); assert.equal(P.remove(id), false);
  assert.ok(b.writes.every((k) => k === STORE));
  assert.equal(b.shared.size, 1);
});

test('same-tab and cross-tab events keep public metadata shape and detect clears', () => {
  const data = new Map(), a = browser(data), b = browser(data); a.init(); b.init();
  const keys = [], providers = [], remoteKeys = [], remoteProviders = [];
  a.c.HubKeys.onChange((e) => keys.push(plain(e)));
  a.c.HubProviders.onChange((e) => providers.push(plain(e)));
  b.c.HubKeys.onChange((e) => remoteKeys.push(plain(e)));
  b.c.HubProviders.onChange((e) => remoteProviders.push(plain(e)));
  a.c.HubKeys.set('gemini', 'placeholder-service'); b.storage();
  assert.deepEqual(keys, [{ name: 'gemini', present: true }]);
  assert.deepEqual(remoteKeys, keys); assert.equal(providers.length, 0);
  const id = provider(a); b.storage();
  assert.deepEqual(providers, [{ id }]); assert.deepEqual(remoteProviders, providers);
  b.c.HubKeys.set('tavily', 'placeholder-search'); a.storage();
  assert.equal(a.c.HubProviders.has(id), true);
  data.clear(); a.storage(null); b.storage(null);
  assert.equal(a.c.HubKeys.list().length, 0); assert.equal(b.c.HubProviders.list().length, 0);
  assert.deepEqual(providers.at(-1), { id });
  assert.ok(!JSON.stringify([keys, providers, remoteKeys]).includes('placeholder'));
});

test('initializing another context cleans only legacy data and never clears new credentials', async () => {
  const a = browser(); a.init(); a.c.HubKeys.set('gemini', 'placeholder-service'); const id = provider(a);
  a.shared.set(OLD[0], 'legacy-reappeared-placeholder');
  const b = browser(a.shared); b.init();
  assert.equal(await b.c.HubKeys.get('gemini'), 'placeholder-service');
  assert.equal(b.c.HubProviders.has(id), true);
  assert.equal(a.shared.has(OLD[0]), false);
});

test('sync backup/restore is inside central record and preserves providers', async () => {
  const b = browser(); b.init(); const K = b.c.HubKeys; const id = provider(b);
  K.set('gemini', 'placeholder-before');
  assert.equal(K.backupKeys(['gemini', 'tavily']), 2);
  assert.deepEqual(plain(K.backupInfo()).names, ['gemini', 'tavily']);
  K.set('gemini', 'placeholder-after'); K.set('tavily', 'placeholder-new');
  assert.equal(K.restoreBackup(), 2);
  assert.equal(await K.get('gemini'), 'placeholder-before'); assert.equal(await K.get('tavily'), null);
  assert.equal(K.backupInfo(), null); assert.equal(b.c.HubProviders.has(id), true);
  assert.ok(b.writes.every((k) => k === STORE));
});

test('storage failures fail closed and emit nothing; malformed data has no legacy fallback', () => {
  const b = browser(new Map([[STORE, '{broken']]), { blocked: true }); b.init();
  const seen = []; b.c.HubKeys.onChange((e) => seen.push(e));
  assert.equal(b.c.HubKeys.set('gemini', 'placeholder-service'), false);
  assert.throws(() => provider(b), /Could not save/);
  assert.equal(b.c.HubKeys.backupKeys(['gemini']), -1);
  assert.equal(seen.length, 0); assert.equal(b.logs.length, 0);
  const c = browser(); assert.throws(() => c.load('hub/core/hub_keys.js'), /requires/);
  assert.throws(() => c.load('hub/core/hub_providers.js'), /requires/);
});

test('listener failures never leak synthetic secrets to logs', () => {
  const b = browser(); b.init();
  b.c.HubKeys.onChange(() => { throw Error('placeholder-service'); });
  b.c.HubProviders.onChange(() => { throw Error('placeholder-provider'); });
  b.c.HubCredentials.onChange(() => { throw Error('placeholder-central'); });
  b.c.HubKeys.set('gemini', 'placeholder-service'); provider(b);
  assert.equal(b.logs.length, 0);
});

test('API Keys opener retains row deep-link contract', () => {
  const b = browser(); b.init();
  b.c.HubKeys.open('gemini'); assert.match(b.opened[0][0], /api-keys\/#keys\/gemini$/);
  const id = provider(b); b.c.HubProviders.open(id);
  assert.ok(b.opened[1][0].endsWith('#keys/' + id));
});

test('HubAPI models reads newly reentered provider credential, no old record access', async () => {
  const b = browser(); b.init(); b.load('hub/core/hub_api.js'); const id = provider(b);
  let request;
  b.c.fetch = async (url, opts) => { request = { url, opts }; return { ok: true, json: async () => ({ data: [{ id: 'synthetic-model' }] }) }; };
  await b.c.HubAPI.models({ provider: id });
  assert.equal(request.url, 'https://provider.invalid/v1/models');
  assert.equal(request.opts.headers.Authorization, 'Bearer placeholder-provider');
  assert.ok(b.reads.every((k) => !OLD.includes(k)));
});

test('profile export excludes entire credential record; explicit keys export/import and sync undo still work', async () => {
  const b = browser(); b.init(); b.load('hub/core/hub_profile.js');
  b.c.HubKeys.set('gemini', 'placeholder-service'); const id = provider(b);
  const H = b.c.HubProfile;
  const out = H.exportData({ keys: false });
  assert.ok(!JSON.stringify(out).includes('placeholder-service'));
  assert.ok(!JSON.stringify(out).includes('placeholder-provider'));
  assert.ok(!Object.hasOwn(H.collect(), 'credentials'));
  const explicit = H.exportData({ keys: true });
  assert.equal(explicit.keys.gemini, 'placeholder-service');
  assert.ok(!JSON.stringify(explicit).includes('placeholder-provider'));
  const imported = await H.importData({ version: 1, hub: {}, keys: { gemini: 'placeholder-imported' } });
  assert.equal(await b.c.HubKeys.get('gemini'), 'placeholder-imported');
  assert.equal(b.c.HubProviders.has(id), true);
  const applied = H.applyItems([{ scope: 'key', key: 'gemini', value: 'placeholder-synced' }], { backup: { from: 'Synthetic device' } });
  assert.ok(applied);
  assert.equal(await b.c.HubKeys.get('gemini'), 'placeholder-synced');
  assert.equal(H.undoSync().ok, true);
  assert.equal(await b.c.HubKeys.get('gemini'), 'placeholder-imported');
  assert.ok(b.reads.every((k) => !OLD.includes(k)));
  assert.ok(!b.writes.some((k) => OLD.includes(k)));
  assert.ok(imported);
});

test('profile fails closed without HubKeys and never writes a legacy fallback', async () => {
  const b = browser(); b.init(); b.load('hub/core/hub_profile.js');
  b.c.HubKeys = undefined;
  assert.equal(b.c.HubProfile.applyItems([{ scope: 'key', key: 'gemini', value: 'placeholder-incoming' }]), 0);
  await b.c.HubProfile.importData({ version: 1, hub: { credentials: '{"v":1}' }, keys: { gemini: 'placeholder-incoming' } });
  assert.equal(b.c.HubCredentials.read().keys.gemini, undefined);
  assert.ok(!b.writes.some((k) => OLD.includes(k)));
});

test('load ordering and shell cover central runtime; no duplicate secret persistence in adapters', () => {
  const core = fs.readFileSync(path.join(root, 'hub/core/hub_core.js'), 'utf8');
  const settings = fs.readFileSync(path.join(root, 'apps/system/settings/index.html'), 'utf8');
  assert.ok(core.indexOf("link: ['hub/core/hub_credentials.js', 'hub/core/hub_keys.js'") > 0);
  assert.ok(settings.indexOf('src="../../../hub/core/hub_credentials.js"') < settings.indexOf('src="../../../hub/core/hub_keys.js"'));
  assert.ok(fs.readFileSync(path.join(root, 'hub/update/hub_sw.js'), 'utf8').includes("'hub/core/hub_credentials.js'"));
  for (const file of ['hub_keys.js', 'hub_providers.js']) {
    assert.ok(!/localStorage\.(getItem|setItem|removeItem)/.test(fs.readFileSync(path.join(root, 'hub/core', file), 'utf8')));
  }
});
