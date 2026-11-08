/* AG37: Agent's own provider runtime (app/api/) — isolation from the Hub, upstream alignment, routing, page.
   Real files only: app/api/host.js + app/api/hub/* (Hub Builder 1 copies) + Agent modules, in a VM with a HOSTILE
   window.top (throws on any property) and a spy localStorage pre-seeded with a dummy Hub record that must never be read,
   written or removed. All HTTP is mocked; every key is an obvious dummy. No network, no paid calls. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const base = path.resolve(__dirname, '..');
const root = path.resolve(base, '../../..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');
const J = v => JSON.parse(JSON.stringify(v));
const HUB_REC = JSON.stringify({ v: 1, keys: { tavily: 'dummy-HUB-tavily', gemini: 'dummy-HUB-gemini' }, providers: [{ id: 'svc_hubonly1', label: 'Groq', type: 'openai', key: 'dummy-HUB-groq', endpoint: 'https://api.groq.com/openai/v1', created: 1 }], undo: null });
const VENDOR = [['hub/core/hub_credentials.js', 'hub_credentials.js'], ['hub/core/hub_keys.js', 'hub_keys.js'], ['hub/core/hub_providers.js', 'hub_providers.js'],
  ['hub/core/hub_embeddings.js', 'hub_embeddings.js'], ['hub/core/hub_api.js', 'hub_api.js'], ['apps/system/api-keys/api-keys.js', 'api-keys.js'], ['apps/system/api-keys/api-keys.css', 'api-keys.css']];
const OPEN = '(function (window, localStorage) {   /* AG37 wrapper: Agent namespace, not the Hub */\n', MARK = '/* ---- upstream below, unchanged ---- */\n', CLOSE = '\n})(HR.apiHost.window, HR.apiHost.storage);\n';

function env(o = {}) {
  const data = new Map([['sites-hub.credentials', HUB_REC]].concat(o.seed || [])), touched = [], topHits = [], requests = [], opened = [], winEv = {};
  const ls = { getItem: k => { touched.push(['get', k]); return data.has(k) ? data.get(k) : null; }, setItem: (k, v) => { touched.push(['set', k]); data.set(k, String(v)); },
    removeItem: k => { touched.push(['rm', k]); data.delete(k); }, key: () => null, get length() { return data.size; } };
  const hostile = new Proxy({}, { get(t, k) { topHits.push(String(k)); throw new Error('window.top.' + String(k) + ' touched'); }, set(t, k) { topHits.push('set ' + String(k)); throw new Error('write to top'); } });
  const fetch = async (url, opt = {}) => { requests.push({ url: String(url), opt, body: opt.body && typeof opt.body === 'string' ? JSON.parse(opt.body) : null }); if (!o.fetcher) throw new Error('unexpected fetch ' + url); return o.fetcher(String(url), opt); };
  const ctx = { console, URL, TextDecoder, TextEncoder, DOMException, Blob, atob, AbortController, setTimeout, clearTimeout, Uint8Array, performance, Response,
    crypto: crypto.webcrypto, localStorage: ls, fetch, location: { href: 'https://site.test/apps/lab/agent/agent.html', pathname: '/apps/lab/agent/agent.html', hash: '', origin: 'https://site.test', protocol: 'https:' },
    document: { currentScript: { src: 'https://site.test/apps/lab/agent/app/api/host.js' }, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null },
    addEventListener: (t, f) => (winEv[t] ||= []).push(f), removeEventListener() {}, open: (...a) => { opened.push(a); return null; }, confirm: () => true };
  ctx.window = ctx; ctx.top = o.standalone ? ctx : hostile; ctx.self = ctx;
  if (o.decoy) { ctx.HubAPI = { chatAdvanced() { throw new Error('page HubAPI used'); } }; ctx.HubKeys = { get() { throw new Error('page HubKeys used'); } }; ctx.HubProviders = { list() { throw new Error('page HubProviders used'); } }; }
  vm.createContext(ctx); vm.runInContext('window.HR = {};', ctx);
  const files = ['app/gui/settings.js', 'app/api/host.js', 'app/api/hub/hub_credentials.js', 'app/api/hub/hub_keys.js', 'app/api/hub/hub_providers.js', 'app/api/hub/hub_embeddings.js', 'app/api/hub/hub_api.js', 'app/api/legacy.js',
    'app/core/hubkeys.js', 'app/models/net.js', 'app/core/hubapi.js', 'app/models/registry.js', 'app/models/ollama.js', 'app/models/presets.js', 'app/models/openai.js', 'app/models/gemini.js', 'app/core/cachemeta.js', 'app/storage/usage.js', 'app/core/assist.js'];
  for (const f of files) vm.runInContext(read(f), ctx, { filename: f });
  const H = ctx.HR; H.tools = { register: () => {} }; H.view = { infoCard: () => {} }; H.fs = { ready: () => false };
  vm.runInContext(read('app/tools/web.js'), ctx, { filename: 'web.js' });
  H.usage.credits = () => {};
  const W = H.apiHost.window;
  const storage = (key, nv) => { (winEv.storage || []).forEach(f => f({ key, newValue: nv, storageArea: ls })); };
  const hubUntouched = () => { assert.equal(data.get('sites-hub.credentials'), HUB_REC); assert.deepEqual(touched.filter(t => !/^agent[.]/.test(t[1])), [], 'only agent.* storage keys'); };
  return { H, W, ctx, data, touched, topHits, requests, opened, storage, hubUntouched };
}
const sse = (...js) => new Response(js.map(j => 'data: ' + JSON.stringify(j) + '\n\n').join('') + 'data: [DONE]\n\n');
const json = (j, s = 200) => new Response(JSON.stringify(j), { status: s });

test('upstream alignment: each app copy = header + 2 wrapper lines + byte-identical upstream; header hash matches', () => {
  for (const [up, mine] of VENDOR) {
    const t = read('app/api/hub/' + mine), js = mine.endsWith('.js'), m = t.match(/upstream-sha256: ([0-9a-f]{64})/);
    assert.ok(m, mine + ' has provenance hash'); assert.match(t, new RegExp('copy of ' + up.replace(/[.]/g, '[.]')));
    let body = t.slice(t.indexOf(MARK) + MARK.length);
    if (js) { assert.ok(t.includes(OPEN + MARK), mine + ' open wrapper'); assert.ok(body.endsWith(CLOSE), mine + ' close wrapper'); body = body.slice(0, -CLOSE.length); }
    assert.equal(crypto.createHash('sha256').update(body).digest('hex'), m[1], mine + ' body hash');
    const upath = path.join(root, up);
    if (fs.existsSync(upath)) assert.equal(body, fs.readFileSync(upath, 'utf8'), mine + ' identical to upstream ' + up + ' (re-run app/api/vendor.py if the Hub changed)');
  }
});

for (const mode of ['iframe (hostile top)', 'standalone (top === window, decoy page globals)']) {
  test('isolation, ' + mode + ': blank own store, zero top/Hub-record access, own globals only', async () => {
    const e = env(mode.startsWith('standalone') ? { standalone: true, decoy: true } : {});
    await e.H.hubKeys.load();
    assert.deepEqual(J(e.W.HubKeys.list()), []); assert.deepEqual(J(e.W.HubProviders.list()), []);
    assert.equal(e.W.top, e.W); assert.notEqual(e.W.HubAPI, e.ctx.HubAPI);
    assert.equal(e.H.hubKeys.val('tavily'), ''); assert.equal(e.H.web.ready(), false);
    assert.equal(e.H.models.ready('groq'), false, 'Hub\'s Groq provider is not visible to Agent');
    assert.deepEqual(e.topHits, []); e.hubUntouched();
  });
}

test('Agent key edits never change the Hub record; Hub record changes never reach Agent', async () => {
  const e = env(); await e.H.hubKeys.load(); let fired = 0; e.H.hubKeys.onChange(() => fired++);
  e.W.HubKeys.set('tavily', 'dummy-agent-tavily'); await new Promise(r => setImmediate(r));
  assert.equal(e.H.hubKeys.val('tavily'), 'dummy-agent-tavily'); assert.ok(e.data.get('agent.api:sites-hub.credentials').includes('dummy-agent-tavily'));
  e.hubUntouched(); const before = fired;
  e.data.set('sites-hub.credentials', HUB_REC.replace('dummy-HUB-tavily', 'dummy-HUB-new')); e.storage('sites-hub.credentials', 'x');
  await new Promise(r => setImmediate(r)); assert.equal(fired, before, 'Hub storage event ignored'); assert.equal(e.H.hubKeys.val('tavily'), 'dummy-agent-tavily');
  /* another Agent tab writes Agent's store -> refresh */
  const rec = JSON.parse(e.data.get('agent.api:sites-hub.credentials')); rec.keys.gemini = 'dummy-agent-gem';
  e.data.set('agent.api:sites-hub.credentials', JSON.stringify(rec)); e.storage('agent.api:sites-hub.credentials', 'x');
  await new Promise(r => setTimeout(r, 5)); assert.equal(e.H.hubKeys.val('gemini'), 'dummy-agent-gem'); assert.ok(fired > before);
  assert.deepEqual(e.topHits, []);
});

test('service CRUD (upstream HubProviders): stable id on rename, blank key keeps, null removes, refresh events, no key in metadata', async () => {
  const e = env(); await e.H.hubKeys.load(); const seen = []; e.H.hubKeys.onChange(n => seen.push(n));
  const id = e.W.HubProviders.add({ label: 'Groq', type: 'openai', endpoint: 'https://api.groq.com/openai/v1', key: 'dummy-groq' });
  assert.equal(e.H.models.ready('groq'), true); assert.equal(e.H.models.service('groq', e.H.models.base('groq')).id, id);
  e.W.HubProviders.update(id, { label: 'Groq', key: '' }); assert.equal(e.W.HubProviders.info(id).hasKey, true);
  e.W.HubProviders.update(id, { key: null }); assert.equal(e.W.HubProviders.info(id).hasKey, false);
  e.W.HubProviders.update(id, { label: 'My Groq' }); assert.ok(e.W.HubProviders.has(id)); assert.equal(e.H.models.service('groq', e.H.models.base('groq')), null, 'renamed row no longer claims the Groq tab');
  assert.ok(!JSON.stringify(e.W.HubProviders.list()).includes('dummy')); assert.ok(e.W.HubProviders.remove(id)); assert.equal(e.W.HubProviders.has(id), false);
  await new Promise(r => setImmediate(r)); assert.ok(seen.length >= 3); e.hubUntouched();
});

test('routing: chat (tools, thinking, usage, cache), models, Assist and web all go through Agent runtime with own keys', async () => {
  const e = env({ fetcher: url => {
    if (url.endsWith('/models')) return json({ data: [{ id: 'm1' }] });
    if (url.includes('tavily')) return json({ results: [{ title: 'T', url: 'https://x.test', content: 'snip' }], usage: { credits: 1 } });
    return sse({ choices: [{ delta: { content: 'hi', reasoning_content: 'th', tool_calls: [{ index: 0, id: 'c1', function: { name: 'clock', arguments: '{}' } }] } }] },
      { choices: [], usage: { prompt_tokens: 50, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 20 } } }); } });
  await e.H.hubKeys.load();
  e.W.HubProviders.add({ label: 'Groq', type: 'openai', endpoint: 'https://api.groq.com/openai/v1', key: 'dummy-groq' }); e.W.HubKeys.set('tavily', 'dummy-tav');
  const a = e.H.models.all().find(x => x.id === 'groq'), deltas = [];
  const r = await a.chat({ cfg: { provider: 'groq', base: e.H.models.base('groq'), key: '' }, model: 'm1', messages: [{ role: 'user', content: 'q' }], tools: [{ type: 'function', function: { name: 'clock', parameters: { type: 'object', properties: {} } } }], think: 'auto', signal: new AbortController().signal, onDelta: (c, t) => deltas.push([c, t]) });
  assert.equal(e.requests[0].url, 'https://api.groq.com/openai/v1/chat/completions'); assert.equal(e.requests[0].opt.headers.Authorization, 'Bearer dummy-groq');
  assert.equal(r.tool_calls[0].function.name, 'clock'); assert.ok(deltas.some(d => d[1] === 'th')); assert.equal(e.H.cacheMeta.read(r).cached, 20);
  assert.equal((await a.models({ provider: 'groq', base: e.H.models.base('groq'), key: '' }))[0].name, 'm1');
  e.H.set.put('assistProvider', 'groq'); e.H.set.put('assistModel', 'm1');
  const as = await e.H.assist.ask({ prompt: 'x' }); assert.equal(as.text, 'hi'); assert.equal(as.usage.c, 20);
  const w = await e.H.web.search({ query: 'x' }, {}); assert.equal(w.results[0].snippet, 'snip');
  assert.equal(e.requests.filter(q => q.url.includes('tavily'))[0].opt.headers.Authorization, 'Bearer dummy-tav');
  assert.ok(e.requests.every(q => !JSON.stringify(q).includes('dummy-HUB'))); assert.deepEqual(e.topHits, []); e.hubUntouched();
});

test('routing: embeddings and images use the runtime and own config; unresolved ids stay unresolved', async () => {
  const e = env({ fetcher: url => url.endsWith('/embeddings') ? json({ data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }], model: 'emb' })
    : url.endsWith('/models') ? json({ data: [{ id: 'img', name: 'Img', architecture: { output_modalities: ['image'] } }] })
    : json({ choices: [{ message: { images: [{ image_url: { url: 'data:image/png;base64,aGVsbG8=' } }] } }] }) });
  await e.H.hubKeys.load();
  const sid = e.W.HubProviders.add({ label: 'OpenRouter', type: 'openai', endpoint: 'https://openrouter.ai/api/v1', key: 'dummy-or' });
  const v = await e.H.hubAPI.api('embed').embed({ provider: sid, model: 'emb', input: ['a'] }); assert.equal(v.vectors[0].length, 3);
  assert.equal(e.requests[0].opt.headers.Authorization, 'Bearer dummy-or');
  e.ctx.HR = e.H; vm.runInContext(read('app/models/img_openrouter.js'), e.ctx);
  const img = e.H.imgProviders.openrouter; assert.equal(img.ready(), true);
  const out = await img.generate({ model: 'img', prompt: 'p', ratio: '1:1' }); assert.ok(out.blob);
  assert.ok(e.requests.some(q => q.url === 'https://openrouter.ai/api/v1/chat/completions' && q.opt.headers.Authorization === 'Bearer dummy-or'));
  /* old Hub svc id selected in Agent settings: stays as typed, unresolved, nothing sent */
  e.H.set.put('assistProvider', 'deepseek'); e.H.set.put('assistModel', 'x'); await assert.rejects(e.H.assist.ask({ prompt: 'x' }), x => x.kind === 'notready');
  assert.equal(e.H.set.get('assistModel'), 'x'); assert.equal(e.W.HubProviders.info('svc_hubonly1'), null); e.hubUntouched();
});

test('semantic index identity is Agent-namespaced: Hub-era idents never match; same svc id with new endpoint invalidates', () => {
  const s = read('app/core/semantic.js');
  assert.match(s, /return 'ao' \+ fnv\(/); assert.match(s, /return 'as' \+ fnv\(i\.type/); assert.doesNotMatch(s.replace(/\/\*[\s\S]*?\*\//g, ''), /window\.top/);
});

test('legacy: Agent-owned old keys move once into the own store and leave the old places; Hub record untouched', async () => {
  const e = env({ seed: [['agent.keys', JSON.stringify({ 'api.groq.com': 'dummy-old-groq', gemini: 'dummy-old-gem', 'unknown.test': 'dummy-keep' })],
    ['agent.settings', JSON.stringify({ tavilyKey: 'dummy-old-tav', baseUrl: 'http://box.local:11434' })]] });
  await e.H.hubKeys.load();
  assert.equal(e.H.hubKeys.val('gemini'), 'dummy-old-gem'); assert.equal(e.H.hubKeys.val('tavily'), 'dummy-old-tav'); assert.equal(e.H.hubKeys.val('ollama_url'), 'http://box.local:11434');
  assert.equal(e.H.models.ready('groq'), true); assert.equal(e.H.set.get('tavilyKey'), '');
  assert.deepEqual(JSON.parse(e.data.get('agent.keys')), { 'unknown.test': 'dummy-keep' }); assert.equal(e.data.get('agent.api.legacyMoved'), 'ag37');
  const n = e.W.HubProviders.list().length; e.H.apiLegacy.run(); assert.equal(e.W.HubProviders.list().length, n, 'idempotent'); e.hubUntouched();
});

test('opening the key page goes to Agent providers.html, never Hub › API Keys', async () => {
  const e = env(); await e.H.hubKeys.load(); e.H.hubKeys.open('tavily'); e.H.hubKeys.open('');
  assert.equal(e.opened[0][0], 'https://site.test/apps/lab/agent/providers.html#keys/tavily'); assert.match(e.opened[1][0], /providers\.html#keys$/);
  assert.deepEqual(e.topHits, []);
});

/* Upstream editor (api-keys.js copy) rendered in Agent's namespace with a tiny DOM, like hub/tests/hub_api_keys_app.test.cjs */
class El { constructor(t) { Object.assign(this, { tagName: t, children: [], className: '', id: '', dataset: {}, value: '', events: {}, attrs: {}, parent: null, textContent: '', disabled: false }); }
  get isConnected() { return this.parent ? this.parent.isConnected : this.connected === true; }
  get classList() { return { add: c => { if (!this.className.split(' ').includes(c)) this.className += ' ' + c; }, toggle: (c, on) => { const a = this.className.split(' ').filter(Boolean); const y = on ?? !a.includes(c); this.className = a.filter(x => x !== c).concat(y ? [c] : []).join(' '); }, remove: c => { this.className = this.className.split(' ').filter(x => x !== c).join(' '); } }; }
  append(...xs) { for (const x of xs) { const n = typeof x === 'string' ? Object.assign(new El('text'), { textContent: x }) : x; n.parent = this; this.children.push(n); if (this.tagName === 'select' && this.children.length === 1) this.value = n.value; } }
  appendChild(n) { this.append(n); return n; } replaceChildren(...xs) { this.children = []; this.append(...xs); } remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  setAttribute(k, v) { this.attrs[k] = String(v); } addEventListener(t, cb) { (this.events[t] ||= []).push(cb); } dispatchEvent(e) { return Promise.all((this.events[e.type] || []).map(cb => cb(e))); }
  querySelectorAll(sel) { const m = n => sel.startsWith('#') ? n.id === sel.slice(1) : sel.startsWith('.') ? n.className.split(' ').includes(sel.slice(1)) : n.tagName === sel; const out = []; const w = n => { for (const c of n.children) { if (m(c)) out.push(c); w(c); } }; w(this); return out; }
  querySelector(s) { return this.querySelectorAll(s)[0] || null; } focus() {} scrollIntoView() {} }
test('API & Providers page: upstream editor saves to Agent store only, masked fields, explicit delete confirm, no fetch on render', async () => {
  const e = env(); const pane = new El('main'); pane.connected = true; pane.id = 'keys-pane'; let asked = 0;
  Object.assign(e.ctx.document, { createElement: t => new El(t), getElementById: () => pane }); e.ctx.CSS = { escape: s => s }; e.ctx.requestAnimationFrame = cb => cb();
  e.ctx.Event = class { constructor(t) { this.type = t; } }; e.ctx.UiDialog = { confirm: async () => { asked++; return true; } };
  e.ctx.location.pathname = '/apps/lab/agent/providers.html';
  vm.runInContext(read('app/api/hub/api-keys.js'), e.ctx); await new Promise(r => setImmediate(r));
  assert.equal(e.requests.length, 0); assert.ok(pane.querySelectorAll('.key-row').length >= 11);
  const row = pane.querySelector('#key-gemini'), field = row.querySelector('.key-input'); assert.equal(field.type, 'password');
  field.value = 'dummy-page-gem'; await field.dispatchEvent({ type: 'input' }); await row.querySelector('.key-save').dispatchEvent({ type: 'click', preventDefault() {} }); await new Promise(r => setImmediate(r));
  assert.equal(await e.W.HubKeys.get('gemini'), 'dummy-page-gem');
  await row.querySelector('.key-del').dispatchEvent({ type: 'click', preventDefault() {} }); await new Promise(r => setImmediate(r));
  assert.ok(asked >= 1); assert.equal(await e.W.HubKeys.get('gemini'), null);
  const groq = pane.querySelector('#key-groq'); groq.querySelector('.key-input').value = 'dummy-page-groq';
  await groq.querySelector('.key-save').dispatchEvent({ type: 'click', preventDefault() {} });
  assert.equal(e.W.HubProviders.list()[0].label, 'Groq'); e.hubUntouched(); assert.deepEqual(e.topHits, []);
});

test('pages, service worker and wiring: runtime loaded before consumers; providers.html precached; Settings link', () => {
  const a = read('agent.html'), im = read('image.html'), p = read('providers.html'), sw = read('agent_sw.js');
  const at = (h, f) => h.indexOf('<script src="' + f + '"');
  for (const h of [a, im]) { const i = at(h, 'app/api/host.js'), j = at(h, 'app/api/hub/hub_api.js'), k = at(h, 'app/core/hubkeys.js'); assert.ok(i > 0 && i < j && j < k, 'order'); }
  assert.match(p, /app\/api\/hub\/api-keys\.js/); assert.match(p, /href="agent\.html"/); assert.match(p, /not encrypted/); assert.doesNotMatch(p, /hub\/core\//);
  assert.match(a, /href="providers\.html"/); assert.match(read('ui/providers.css'), /#keys-pane \.key-eye\{display:none\}/); assert.match(sw, /'providers\.html'/); assert.match(sw, /agent-ag37/);
  for (const f of ['app/core/hubkeys.js', 'app/core/hubapi.js', 'app/core/semantic.js', 'app/api/host.js', 'app/api/legacy.js']) assert.doesNotMatch(read(f).replace(/\/\*[\s\S]*?\*\//g, ''), /window\.top|\.secret\s*\(|sites-hub\.credentials'/, f);
});
