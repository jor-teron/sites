/* H138b: Node VM/DOM fixtures only. No browser, network or viewport testing. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const source = (file) => fs.readFileSync(path.join(root, file), 'utf8');
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.className = ''; this.id = ''; this.dataset = {}; this.value = ''; this.events = {}; this.attrs = {}; this.parent = null; this.textContent = ''; this.disabled = false; }
  get isConnected() { return this.parent ? this.parent.isConnected : this.connected === true; }
  get classList() {
    return { add: (c) => { if (!this.className.split(' ').includes(c)) this.className += ' ' + c; },
      toggle: (c, on) => { const a = this.className.split(' ').filter(Boolean); const yes = on ?? !a.includes(c); this.className = a.filter((x) => x !== c).concat(yes ? [c] : []).join(' '); } };
  }
  append(...items) { for (const item of items) { const n = typeof item === 'string' ? Object.assign(new Element('text'), { textContent: item }) : item; n.parent = this; this.children.push(n); if (this.tagName === 'select' && this.children.length === 1) this.value = n.value; } }
  appendChild(n) { this.append(n); return n; }
  replaceChildren(...items) { for (const n of this.children) n.parent = null; this.children = []; this.append(...items); }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(type, cb) { (this.events[type] ||= []).push(cb); }
  dispatchEvent(e) { return Promise.all((this.events[e.type] || []).map((cb) => cb(e))); }
  querySelectorAll(sel) {
    const matches = (n) => sel.startsWith('#') ? n.id === sel.slice(1) : sel.startsWith('.') ? n.className.split(' ').includes(sel.slice(1)) : n.tagName === sel;
    const out = [];
    const walk = (n) => { for (const c of n.children) { if (matches(c)) out.push(c); walk(c); } }; walk(this); return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolled = true; }
}
function fixture(opts = {}) {
  const data = new Map(), events = {}, opened = [], replaced = [], calls = [];
  const pane = new Element('main'); pane.connected = true; pane.id = 'keys-pane';
  const document = { createElement: (tag) => new Element(tag), getElementById: () => pane,
    currentScript: { src: 'https://hub.test/hub/core/hub_keys.js' } };
  const location = { href: opts.href || 'https://hub.test/apps/system/api-keys/', hash: opts.hash || '', protocol: 'https:', replace: (url) => replaced.push(url) };
  const ctx = vm.createContext({ document, location, URL, Set, Uint8Array, crypto: require('node:crypto').webcrypto,
    CSS: { escape: (s) => s }, Event: class { constructor(type) { this.type = type; } },
    AbortController, setTimeout, clearTimeout, requestAnimationFrame: (cb) => cb(),
    localStorage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) },
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ data: [{ id: 'synthetic' }] }) }; },
    addEventListener: (name, cb) => (events[name] ||= []).push(cb),
    open: (...args) => { opened.push(args); return null; },
    console: { warn() { throw Error('Unexpected log'); } },
  });
  ctx.window = ctx; ctx.top = ctx;
  ctx.UiDialog = { confirm: async () => true };
  const load = (file) => vm.runInContext(source(file), ctx, { filename: file });
  for (const n of ['credentials', 'keys', 'providers']) load(`hub/core/hub_${n}.js`);
  return { ctx, pane, data, calls, opened, replaced, load, events,
    hash(hash) { location.hash = hash; (events.hashchange || []).forEach((cb) => cb()); } };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
const click = (e) => e.dispatchEvent({ type: 'click', preventDefault() {} });
const input = (e, value) => { e.value = value; return e.dispatchEvent({ type: 'input' }); };

test('standalone render does not fetch/test; named services save and delete through central API', async () => {
  const b = fixture(); b.load('apps/system/api-keys/api-keys.js'); await settle();
  assert.equal(b.calls.length, 0); assert.equal(b.pane.querySelectorAll('.key-row').length, 5);
  const row = b.pane.querySelector('#key-gemini'), field = row.querySelector('.key-input');
  assert.equal(field.type, 'password');
  await input(field, 'placeholder-service'); await click(row.querySelector('.key-save')); await settle();
  assert.equal(await b.ctx.HubKeys.get('gemini'), 'placeholder-service');
  await click(row.querySelector('.key-del')); await settle();
  assert.equal(await b.ctx.HubKeys.get('gemini'), null); assert.equal(b.calls.length, 0);
  assert.deepEqual([...b.data.keys()], ['sites-hub.credentials']);
});

test('provider add/edit/test/delete preserves blank saved key and never autofetches', async () => {
  const b = fixture(); b.load('apps/system/api-keys/api-keys.js'); await settle();
  const add = b.pane.querySelector('.prov-add');
  await input(add.querySelector('.prov-label'), 'Synthetic');
  await input(add.querySelector('.prov-endpoint'), 'https://provider.invalid/v1');
  await input(add.querySelector('.prov-key'), 'placeholder-provider');
  await click(add.querySelector('.key-save')); await settle();
  const id = b.ctx.HubProviders.list()[0].id, row = b.pane.querySelector('#prov-' + id);
  assert.equal(row.querySelector('.prov-key').value, '');
  assert.equal(row.querySelector('.prov-key').type, 'password');
  await input(row.querySelector('.prov-label'), 'Renamed');
  await click(row.querySelector('.key-save')); await settle();
  assert.equal((await b.ctx.HubProviders.secret(id)).key, 'placeholder-provider');
  assert.equal(b.calls.length, 0);
  const testButton = row.querySelectorAll('.key-btn').find((n) => n.textContent === 'Test model list');
  await click(testButton); assert.equal(b.calls.length, 1);
  assert.equal(b.calls[0].url, 'https://provider.invalid/v1/models');
  assert.match(row.querySelector('.key-out').textContent, /^Model list received/);
  await click(row.querySelector('.key-del')); assert.equal(b.ctx.HubProviders.list().length, 0);
});

test('service/provider deep links focus correct rows and rerenders dispose listeners', async () => {
  const b = fixture({ hash: '#keys/gemini' });
  const id = b.ctx.HubProviders.add({ label: 'Synthetic', type: 'openai', endpoint: 'https://provider.invalid/v1' });
  let subscriptions = 0;
  for (const api of [b.ctx.HubKeys, { ...b.ctx.HubProviders }]) {
    const original = api.onChange;
    api.onChange = (fn) => { subscriptions++; const off = original(fn); return () => { subscriptions--; off(); }; };
    if (api.list === b.ctx.HubProviders.list) b.ctx.HubProviders = api;
  }
  b.load('apps/system/api-keys/api-keys.js'); await settle();
  assert.ok(b.pane.querySelector('#key-gemini').querySelector('.key-input').focused);
  const count = subscriptions;
  b.hash('#keys/' + id); await settle();
  assert.ok(b.pane.querySelector('#prov-' + id).querySelector('.key-input').focused);
  b.hash('#keys/gvision'); b.hash('#keys'); await settle();
  assert.equal(subscriptions, count); assert.equal(b.calls.length, 0);
});

test('Settings legacy root and named routes navigate the same standalone frame, no popup loop', () => {
  for (const sub of ['', 'gemini', 'svc_synthetic123']) {
    const b = fixture({ href: 'https://hub.test/apps/system/settings/index.html' }); let section;
    b.ctx.Settings = { ui: { el: (tag, cls, text) => Object.assign(new Element(tag), { className: cls, textContent: text }), note: (t) => Object.assign(new Element('p'), { textContent: t }) }, add: (s) => section = s };
    b.load('apps/system/settings/sec_keys.js'); section.render(b.pane, sub);
    assert.equal(b.replaced.length, 1); assert.ok(b.replaced[0].endsWith('/api-keys/#keys' + (sub ? '/' + sub : '')));
    assert.equal(b.opened.length, 0); assert.equal(b.calls.length, 0);
  }
});

test('Settings embedded bridge and HubKeys.open use the host app path', () => {
  const b = fixture({ href: 'https://hub.test/apps/system/settings/' }); const hostCalls = [];
  b.ctx.top = { __hubOpenApp: (...args) => { hostCalls.push(args); return true; } };
  let section;
  b.ctx.Settings = { ui: { el: (tag) => new Element(tag), note: () => new Element('p') }, add: (s) => section = s };
  b.load('apps/system/settings/sec_keys.js'); section.render(b.pane, 'gemini');
  b.ctx.HubKeys.open('gvision');
  assert.equal(hostCalls.length, 2); assert.ok(hostCalls.every((c) => c[0] === 'apps/system/api-keys/'));
  assert.equal(hostCalls[0][1].hash, 'keys/gemini'); assert.equal(hostCalls[1][1].hash, 'keys/gvision');
  assert.equal(b.replaced.length, 0); assert.equal(b.opened.length, 0);
});

test('opener already in editor changes only hash; cross-origin host fails safely to standalone', () => {
  const b = fixture(); b.ctx.HubKeys.open('gemini');
  assert.equal(b.ctx.location.hash, 'keys/gemini'); assert.equal(b.opened.length, 0);
  const c = fixture({ href: 'https://hub.test/apps/other/' });
  Object.defineProperty(c.ctx, 'top', { get() { throw Error('cross-origin'); } });
  assert.equal(c.ctx.HubKeys.open('tavily'), true);
  assert.ok(c.opened[0][0].endsWith('/api-keys/#keys/tavily'));
});

test('System catalog/index, local dependencies, CSS and offline shell register the app', () => {
  const html = source('apps/system/api-keys/index.html');
  for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    assert.ok(!m[1].includes('?v='));
    assert.ok(fs.existsSync(path.resolve(root, 'apps/system/api-keys', m[1])), m[1]);
  }
  assert.ok(html.indexOf('hub_credentials.js') < html.indexOf('hub_keys.js'));
  const cat = {}, idx = {}; vm.runInNewContext(source('hub/core/hub_catalog.js'), { window: cat }); vm.runInNewContext(source('hub/core/hub_appindex.js'), { window: idx });
  assert.equal(cat.SITES_CSV.System, source('apps/system/system-apps.csv'));
  assert.ok(Object.values(idx.HUB_APP_INDEX).some((v) => v[1] === 'apps/system/api-keys/' && v[2] === 'API Keys'));
  const shell = source('hub/update/hub_sw.js');
  for (const file of ['index.html', 'api-keys.js', 'api-keys.css', 'api-keys_icon.png']) assert.ok(shell.includes("'apps/system/api-keys/" + file + "'"));
  assert.ok(!source('apps/system/settings/sec_keys.js').includes('HubProviders.secret'));
  assert.ok(!source('apps/system/settings/settings.css').includes('.prov-row'));
  assert.ok(source('apps/system/settings/settings.css').includes('.key-input')); // shared consumers
  assert.ok(source('apps/system/api-keys/api-keys.css').includes(':focus-visible'));
});

test('opening existing central credentials neither rewrites nor reveals a saved provider key', async () => {
  const b = fixture(); b.ctx.HubKeys.set('tavily', 'placeholder-search');
  const id = b.ctx.HubProviders.add({label:'Synthetic',type:'openai',key:'placeholder-private',endpoint:'https://provider.invalid/v1'});
  const before = b.data.get('sites-hub.credentials');
  b.load('apps/system/api-keys/api-keys.js'); await settle();
  assert.equal(b.data.get('sites-hub.credentials'), before);
  assert.equal(b.pane.querySelector('#key-tavily').querySelector('.key-input').value, 'placeholder-search');
  assert.equal(b.pane.querySelector('#prov-' + id).querySelector('.prov-key').value, '');
  assert.equal(b.calls.length, 0);
});

test('cross-origin Settings legacy bridge navigates only its own frame', () => {
  const b = fixture({href:'https://hub.test/apps/system/settings/'}); let section;
  Object.defineProperty(b.ctx,'top',{get(){throw Error('cross-origin');}});
  b.ctx.Settings = {ui:{el:(tag)=>new Element(tag),note:()=>new Element('p')},add:(s)=>section=s};
  b.load('apps/system/settings/sec_keys.js');section.render(b.pane,'svc_synthetic123');
  assert.equal(b.replaced.length,1); assert.equal(b.opened.length,0);
  assert.ok(b.replaced[0].endsWith('/api-keys/#keys/svc_synthetic123'));
});

// H138c: model-list diagnostics/preset tests; synthetic placeholders and mocked fetch only.
function providerTestFixture(endpoint = 'https://integrate.api.nvidia.com/v1') {
  const b = fixture();
  const id = b.ctx.HubProviders.add({ label: 'NVIDIA', type: 'openai', key: 'placeholder-private-key', endpoint });
  b.load('apps/system/api-keys/api-keys.js');
  const row = b.pane.querySelector('#prov-' + id);
  const button = row.querySelectorAll('.key-btn').find((n) => n.textContent === 'Test model list');
  return { ...b, id, row, button, result: () => row.querySelector('.key-out').textContent };
}

test('NVIDIA preset fills type/base only, preserves typed key, persists only on explicit Add', async () => {
  const b = fixture(); b.load('apps/system/api-keys/api-keys.js');
  const add = b.pane.querySelector('.prov-add');
  await input(add.querySelector('.prov-key'), 'placeholder-private-key');
  await click(add.querySelector('.prov-nvidia'));
  assert.equal(add.querySelector('.prov-label').value, 'NVIDIA');
  assert.equal(add.querySelector('.prov-type').value, 'openai');
  assert.equal(add.querySelector('.prov-endpoint').value, 'https://integrate.api.nvidia.com/v1');
  assert.equal(add.querySelector('.prov-key').value, 'placeholder-private-key');
  assert.equal(b.ctx.HubProviders.list().length, 0); assert.equal(b.calls.length, 0);
  assert.equal(add.querySelector('.prov-nvidia').attrs['aria-describedby'], 'nvidia-guide');
  await click(add.querySelector('.key-save')); await settle();
  const id = b.ctx.HubProviders.list()[0].id;
  assert.equal(b.ctx.HubProviders.info(id).type, 'openai');
  assert.equal(b.ctx.HubProviders.info(id).endpoint, 'https://integrate.api.nvidia.com/v1');
  assert.equal((await b.ctx.HubProviders.secret(id)).key, 'placeholder-private-key');
  assert.equal(b.pane.querySelector('#prov-' + id).querySelector('.prov-key').value, '');
  assert.equal(b.calls.length, 0);
});

for (const endpoint of ['https://integrate.api.nvidia.com/v1/chat/completions', 'https://integrate.api.nvidia.com/v1/chat/completions/', 'https://integrate.api.nvidia.com/v1/models', 'https://provider.invalid/v1?key=placeholder-private-key', 'https://user:placeholder-private-key@provider.invalid/v1', 'not a URL']) {
  test('base validation refuses unsafe/full request URL without fetching: ' + endpoint.replace(/placeholder-private-key/g, '[synthetic]'), async () => {
    const b = fixture(); b.load('apps/system/api-keys/api-keys.js'); const add = b.pane.querySelector('.prov-add');
    await input(add.querySelector('.prov-label'), 'Synthetic'); await input(add.querySelector('.prov-endpoint'), endpoint);
    await input(add.querySelector('.prov-key'), 'placeholder-private-key'); await click(add.querySelector('.key-save'));
    assert.equal(b.ctx.HubProviders.list().length, 0); assert.equal(b.calls.length, 0);
    const text = add.querySelector('.key-out').textContent;
    assert.ok(text.length > 0); assert.ok(!text.includes('placeholder-private-key'));
  });
}

test('arbitrary compatible base remains intact apart from whitespace/trailing slash normalization', async () => {
  const b = fixture(); b.load('apps/system/api-keys/api-keys.js'); const add = b.pane.querySelector('.prov-add');
  await input(add.querySelector('.prov-label'), 'Custom');
  await input(add.querySelector('.prov-endpoint'), ' https://provider.invalid/proxy/custom/v4/// ');
  await click(add.querySelector('.key-save')); await settle();
  const id = b.ctx.HubProviders.list()[0].id;
  assert.equal(b.ctx.HubProviders.info(id).endpoint, 'https://provider.invalid/proxy/custom/v4');
  assert.equal(b.calls.length, 0);
});

test('old saved full request URL is not silently rewritten or requested with a duplicate suffix', async () => {
  const b = providerTestFixture('https://integrate.api.nvidia.com/v1/chat/completions'); await click(b.button);
  assert.equal(b.calls.length, 0); assert.match(b.result(), /base URL, not the full/);
  assert.equal(b.ctx.HubProviders.info(b.id).endpoint, 'https://integrate.api.nvidia.com/v1/chat/completions');
});

for (const [status, expected] of [[400, /request refused.*does not prove the key is invalid/], [401, /Authentication failed/], [403, /Access denied.*does not prove the key is invalid/], [404, /not found.*may not support model listing/], [429, /Rate limit or quota/], [500, /Provider server error/]]) {
  test('model-list HTTP ' + status + ' uses safe status-based diagnostics, never upstream body', async () => {
    const b = providerTestFixture(); let bodyReads = 0;
    b.ctx.fetch = async (url, options) => { b.calls.push({ url, options }); return { ok: false, status, json: async () => { bodyReads++; return { error: 'placeholder-private-key' }; } }; };
    await click(b.button);
    assert.match(b.result(), expected); assert.match(b.result(), /Inference was not tested/);
    assert.ok(!b.result().includes('placeholder-private-key')); assert.equal(bodyReads, 0);
    assert.equal(b.calls.length, 1); assert.equal(b.calls[0].url, 'https://integrate.api.nvidia.com/v1/models');
    assert.equal(b.button.disabled, false);
  });
}

for (const [description, payload] of [['object without model array', { error: 'placeholder-private-key' }], ['array root', []], ['error with misleading data', {error:'placeholder-private-key',data:[{id:'synthetic'}]}], ['non-array data', { data: { length: 3 } }], ['invalid entry', { data: [{ id: '' }] }]]) {
  test('malformed model list: ' + description, async () => {
    const b = providerTestFixture(); b.ctx.fetch = async () => ({ ok: true, json: async () => payload });
    await click(b.button); assert.match(b.result(), /unexpected format/); assert.match(b.result(), /Inference was not tested/);
    assert.ok(!b.result().includes('placeholder-private-key'));
  });
}

test('invalid JSON is not reported as success and parser text cannot leak a key', async () => {
  const b = providerTestFixture(); b.ctx.fetch = async () => ({ ok: true, json: async () => { throw Error('placeholder-private-key'); } });
  await click(b.button); assert.match(b.result(), /not valid JSON/); assert.ok(!b.result().includes('placeholder-private-key'));
});

test('successful model listing never claims authentication/inference verified or prints model ids', async () => {
  const b = providerTestFixture(); b.ctx.fetch = async () => ({ ok: true, json: async () => ({ data: [{ id: 'placeholder-private-key' }] }) });
  await click(b.button); assert.equal(b.result(), 'Model list received · 1 model. Inference was not tested.');
  assert.ok(!b.result().includes('placeholder-private-key'));
});

test('network error retains ambiguity and never displays upstream exception text', async () => {
  const b = providerTestFixture(); b.ctx.fetch = async () => { throw TypeError('CORS blocked placeholder-private-key'); };
  await click(b.button); assert.match(b.result(), /Network, endpoint or browser restrictions \(possibly CORS\)/);
  assert.match(b.result(), /key has not been verified/); assert.ok(!b.result().includes('placeholder-private-key'));
});

test('real fetchT abort path is reported as timeout, not invalid credentials', async () => {
  const b = providerTestFixture(); let abort;
  b.ctx.setTimeout = (cb) => { abort = cb; return 1; }; b.ctx.clearTimeout = () => {};
  b.ctx.fetch = async (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(Object.assign(Error('placeholder-private-key'), { name: 'AbortError' })));
    queueMicrotask(abort);
  });
  await click(b.button); assert.equal(b.result(), 'Model-list request timed out. Inference was not tested.');
  assert.equal(b.button.disabled, false);
});

test('NVIDIA row edit keeps provider id and blank-key preservation; save does not test', async () => {
  const b = providerTestFixture(); await settle();
  await input(b.row.querySelector('.prov-label'), 'Renamed NVIDIA');
  await click(b.row.querySelector('.key-save')); await settle();
  assert.equal(b.ctx.HubProviders.list()[0].id, b.id);
  assert.equal((await b.ctx.HubProviders.secret(b.id)).key, 'placeholder-private-key');
  assert.equal(b.calls.length, 0);
});

test('Gemini custom provider defaults and model-list format remain supported', async () => {
  const b = fixture(); const id = b.ctx.HubProviders.add({label:'Synthetic Gemini',type:'gemini',key:'placeholder-private-key',endpoint:''});
  b.load('apps/system/api-keys/api-keys.js');
  b.ctx.fetch = async (url, options) => { b.calls.push({url,options}); return {ok:true,json:async()=>({models:[{name:'models/synthetic'}]})}; };
  const row=b.pane.querySelector('#prov-'+id); await click(row.querySelectorAll('.key-btn').find((n)=>n.textContent==='Test model list'));
  assert.equal(b.calls[0].url,'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000');
  assert.match(row.querySelector('.key-out').textContent,/Model list received/);
});
