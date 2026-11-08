/* H139a: isolated VM, synthetic credentials and bounded mock streams only; no live providers. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..'), src = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
const response = (v, status = 200, headers) => new Response(JSON.stringify(v), { status, headers });
const vector = (n = 1) => ({ data: Array.from({ length: n }, (_, index) => ({ index, embedding: [index + 1, 0.5] })) });
const settle = () => new Promise((resolve) => setImmediate(resolve));
function fixture({ helper = true } = {}) {
  const storage = new Map(), calls = [], timers = new Map();
  let handler = () => response(vector());
  const ctx = vm.createContext({ URL, TextEncoder, TextDecoder, Uint8Array, AbortController, DOMException, Blob, atob,
    Set, WeakSet, performance, crypto: require('node:crypto').webcrypto,
    document: { currentScript: { src: 'https://hub.invalid/hub/core/hub_keys.js' } },
    addEventListener() {},
    localStorage: { getItem: (k) => storage.get(k) || null, setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
    setTimeout(fn, ms) { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); clearTimeout(id); },
    fetch(url, init) { calls.push({ url, ...init }); return Promise.resolve().then(() => handler(url, init)); },
    console: { warn() { throw Error('Unexpected log'); }, log() { throw Error('Unexpected log'); } },
  });
  ctx.window = ctx; ctx.top = ctx;
  const load = (f) => vm.runInContext(src(f), ctx, { filename: f });
  for (const f of ['credentials', 'keys', 'providers']) load('hub/core/hub_' + f + '.js');
  if (helper) load('hub/core/hub_embeddings.js');
  load('hub/core/hub_api.js');
  ctx.HubKeys.set('ollama_url', 'http://localhost:11434');
  const id = ctx.HubProviders.add({ label: 'Synthetic provider', type: 'openai', endpoint: 'https://provider.invalid/v1/', key: 'synthetic-central-key' });
  return { ctx, api: ctx.HubAPI, id, calls, timers, storage, load, handle(fn) { handler = fn; },
    runTimeout() { const timer = [...timers.values()][0]; assert.ok(timer); timer.fn(); return timer.ms; } };
}
const args = (b, input = [' exact text ']) => ({ provider: b.id, model: 'manual-model', input });
function safe(e, kind) {
  assert.equal(e.kind, kind);
  for (const secret of ['synthetic-central-key', 'private-input', 'provider.invalid', 'raw-upstream']) assert.ok(!e.message.includes(secret), e.message);
  return true;
}

test('public methods fail safely without helper while existing chat API remains available', async () => {
  const b = fixture({ helper: false }); assert.equal(typeof b.api.chat, 'function'); assert.equal(typeof b.api.generateImage, 'function');
  await assert.rejects(b.api.embed(args(b)), (e) => safe(e, 'unreachable'));
  await assert.rejects(b.api.embeddingModels({ provider: b.id }), (e) => safe(e, 'unreachable'));
  assert.equal(b.calls.length, 0); b.load('hub/core/hub_embeddings.js'); await b.api.embed(args(b)); assert.equal(b.calls.length, 1);
});

test('OpenAI discovery returns empty without paid/name-based probes; manual embeddings use central credentials and reorder indices', async () => {
  const b = fixture(); assert.deepEqual(plain(await b.api.embeddingModels({ provider: b.id })), []); assert.equal(b.calls.length, 0);
  b.handle(() => response({ data: [{ index: 1, embedding: [3, 4] }, { index: 0, embedding: [1, 2] }], model: 'raw-upstream', usage: { prompt_tokens: 4, total_tokens: 4, secret: 'raw-upstream', completion_tokens: 6 } }));
  const input = ['  private-input\n', 'नमस्ते 😀'], frozen = Object.freeze(input.slice());
  const out = await b.api.embed(args(b, frozen));
  assert.deepEqual(plain(out), { vectors: [[1, 2], [3, 4]], dims: 2, model: 'manual-model', usage: { prompt_tokens: 4, total_tokens: 4 } });
  const call = b.calls[0]; assert.equal(call.url, 'https://provider.invalid/v1/embeddings');
  assert.equal(call.method, 'POST'); assert.equal(call.headers.Authorization, 'Bearer synthetic-central-key');
  assert.equal(call.headers['Content-Type'], 'application/json'); assert.equal(call.credentials, 'omit'); assert.equal(call.redirect, 'error');
  assert.deepEqual(JSON.parse(call.body), { model: 'manual-model', input, encoding_format: 'float' });
  assert.deepEqual(frozen, input); assert.equal(b.timers.size, 0);
});

test('Ollama discovery requires explicit capabilities, deduplicates and tolerates unestablished per-model capability', async () => {
  const b = fixture(); b.handle((url, init) => {
    if (url.endsWith('/api/tags')) return response({ models: [{ name: 'chat-with-embedding-name' }, { name: 'neutral' }, { name: 'neutral' }, { name: 'missing' }, { name: 'unknown' }, {}] });
    const name = JSON.parse(init.body).model;
    if (name === 'missing') return response({ error: 'raw-upstream' }, 404);
    return response({ capabilities: name === 'neutral' ? ['embedding'] : name === 'unknown' ? undefined : ['completion'], model_info: { 'fake.embedding_length': 8192 } });
  });
  assert.deepEqual(plain(await b.api.embeddingModels({ provider: 'OLLAMA' })), [{ name: 'neutral', label: 'neutral' }]);
  assert.equal(b.calls.length, 5); assert.equal(b.calls[0].url, 'http://localhost:11434/api/tags'); assert.equal(b.calls[0].method, 'GET');
  assert.ok(b.calls.slice(1).every((c) => c.url.endsWith('/api/show') && c.method === 'POST' && !c.headers.Authorization));
  assert.equal(b.timers.size, 0);
});

test('Ollama embed preserves input exactly, disables truncation and filters usage', async () => {
  const b = fixture(); b.handle(() => response({ embeddings: [[1, 2], [3, 4]], prompt_eval_count: 3, eval_count: 8, raw: 'raw-upstream' }));
  const input = [' x\n', ' y '], out = await b.api.embed({ ...args(b, input), provider: 'Ollama' });
  assert.deepEqual(plain(out), { vectors: [[1, 2], [3, 4]], dims: 2, model: 'manual-model', usage: { prompt_tokens: 3 } });
  assert.equal(b.calls[0].url, 'http://localhost:11434/api/embed');
  assert.deepEqual(JSON.parse(b.calls[0].body), { model: 'manual-model', input, truncate: false });
  assert.equal(b.calls.length, 1);
});

for (const provider of ['custom', 'gemini', 'openai', 'nvidia', 'svc_bad', '', null]) test('reject unsupported provider without network: ' + provider, async () => {
  const b = fixture(); await assert.rejects(b.api.embed({ ...args(b), provider }), (e) => safe(e, 'input')); assert.equal(b.calls.length, 0);
});
for (const option of ['endpoint', 'key', 'base', 'truncate', 'input_type', 'dimensions']) test('reject app-owned/unsupported override: ' + option, async () => {
  const b = fixture(); await assert.rejects(b.api.embed({ ...args(b), [option]: 'private-input' }), (e) => safe(e, 'input'));
  await assert.rejects(b.api.embeddingModels({ provider: b.id, [option]: 'private-input' }), (e) => safe(e, 'input')); assert.equal(b.calls.length, 0);
});

test('missing/unsupported saved credentials fail safely; no direct storage fallback or cached stale provider data', async () => {
  const b = fixture(), P = b.ctx.HubProviders;
  const gemini = P.add({ label: 'raw-upstream', type: 'gemini', key: 'synthetic-central-key' });
  await assert.rejects(b.api.embed({ ...args(b), provider: gemini }), (e) => safe(e, 'input'));
  P.remove(b.id); await assert.rejects(b.api.embed(args(b)), (e) => safe(e, 'key'));
  assert.equal(b.calls.length, 0);
  b.ctx.HubKeys.remove('ollama_url'); await assert.rejects(b.api.embed({ ...args(b), provider: 'ollama' }), (e) => safe(e, 'key'));
  assert.equal(b.calls.length, 0);
});

for (const input of [[], [''], [' \n\t'], [3], Array(1), Array(33).fill('x'), ['😀'.repeat(2049)], ['x'.repeat(8193)], ['"'.repeat(8192), '"'.repeat(8192), '"'.repeat(8192), '"'.repeat(8192)]]) {
  test('invalid/oversized input is rejected before any request: case ' + JSON.stringify(input).length, async () => {
    const b = fixture(); await assert.rejects(b.api.embed(args(b, input)), (e) => safe(e, 'input')); assert.equal(b.calls.length, 0); assert.equal(b.timers.size, 0);
  });
}
for (const provider of ['ollama', 'saved']) test('exact 64 KiB actual serialized request boundary: ' + provider, async () => {
  const b = fixture(), inputs = Array(8).fill('x'.repeat(8000)), o = { ...args(b, inputs), provider: provider === 'ollama' ? 'ollama' : b.id };
  const shape = provider === 'ollama' ? { model: o.model, input: inputs, truncate: false } : { model: o.model, input: inputs, encoding_format: 'float' };
  const remaining = 65536 - Buffer.byteLength(JSON.stringify(shape));
  // Distribute remaining bytes without violating the independent per-string cap.
  for (let i = 0, left = remaining; left > 0; i++) { const n = Math.min(8192 - inputs[i].length, left); inputs[i] += 'x'.repeat(n); left -= n; }
  b.handle(() => response(provider === 'ollama' ? { embeddings: Array(8).fill([1]) } : vector(8)));
  await b.api.embed(o); assert.equal(Buffer.byteLength(b.calls[0].body), 65536);
  const before = b.calls.length; inputs[7] += 'x'; await assert.rejects(b.api.embed(o), (e) => safe(e, 'input')); assert.equal(b.calls.length, before);
});

test('per-string UTF-8 boundary and 32-string boundary are accepted without trimming', async () => {
  const b = fixture(); await b.api.embed(args(b, ['😀'.repeat(2048)])); assert.equal(JSON.parse(b.calls[0].body).input[0].length, 4096);
  b.handle(() => response(vector(32))); await b.api.embed(args(b, Array(32).fill(' x '))); assert.equal(b.calls.length, 2);
});

const badResponses = [
  {}, { data: [] }, { data: [{ index: 0, embedding: [] }] }, { data: [{ embedding: [1] }] },
  { data: [{ index: -1, embedding: [1] }] }, { data: [{ index: 1, embedding: [1] }] }, { data: [{ index: 0.1, embedding: [1] }] },
  { data: [{ index: '0', embedding: [1] }] }, { data: [{ index: 0, embedding: ['1'] }] }, { data: [{ index: 0, embedding: null }] },
  { data: [{ index: 0, embedding: Array(4097).fill(0) }] }, { error: 'raw-upstream', data: [{ index: 0, embedding: [1] }] },
];
badResponses.forEach((data, i) => test('reject malformed/oversized embedding output: ' + i, async () => {
  const b = fixture(); b.handle(() => response(data)); await assert.rejects(b.api.embed(args(b)), (e) => safe(e, 'unreachable')); assert.equal(b.calls.length, 1);
}));
for (const data of [
  [{ index: 0, embedding: [1] }, { index: 0, embedding: [2] }],
  [{ index: 0, embedding: [1] }, { index: 1, embedding: [2, 3] }],
  [{ index: 0, embedding: [1] }, { index: 2, embedding: [2] }],
]) test('reject duplicate/missing indices or nonuniform dimensions', async () => {
  const b = fixture(); b.handle(() => response({ data })); await assert.rejects(b.api.embed(args(b, ['a', 'b'])), (e) => safe(e, 'unreachable'));
});
for (const number of ['1e400', '-1e400', 'NaN', 'Infinity']) test('reject non-finite/malformed scalar ' + number, async () => {
  const b = fixture(); b.handle(() => new Response('{"data":[{"index":0,"embedding":[' + number + ']}]}'));
  await assert.rejects(b.api.embed(args(b)), (e) => safe(e, 'unreachable'));
});

test('response byte limits reject declared and chunked overflows without unbounded json/text readers', async () => {
  const b = fixture(); b.handle(() => new Response('{}', { headers: { 'Content-Length': String(4 * 1024 * 1024 + 1) } }));
  await assert.rejects(b.api.embed(args(b)), (e) => safe(e, 'unreachable'));
  let cancelled = 0;
  b.handle(() => ({ ok: true, headers: new Headers(), json() { throw Error('Unbounded json'); }, text() { throw Error('Unbounded text'); },
    body: new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); }, cancel() { cancelled++; } }) }));
  await assert.rejects(b.api.embed(args(b)), (e) => safe(e, 'unreachable')); assert.equal(cancelled, 1); assert.equal(b.timers.size, 0);
  b.handle(() => ({ ok: true, headers: new Headers(), json() { throw Error('Unbounded json'); } }));
  await assert.rejects(b.api.embed(args(b)), (e) => safe(e, 'unreachable'));
});

for (const [status, kind] of [[400, 'http'], [401, 'key'], [403, 'key'], [402, 'nocredit'], [429, 'quota'], [500, 'http']]) test('safe status/kind without upstream echo or retries: ' + status, async () => {
  const b = fixture(); b.handle(() => response({ error: 'synthetic-central-key private-input raw-upstream' }, status));
  await assert.rejects(b.api.embed(args(b, ['private-input'])), (e) => safe(e, kind) && e.status === status); assert.equal(b.calls.length, 1);
});
test('transport errors cannot smuggle raw upstream messages even with forged error kind', async () => {
  const b = fixture(); b.handle(() => { throw Object.assign(Error('synthetic-central-key private-input raw-upstream'), { kind: 'http' }); });
  await assert.rejects(b.api.embed(args(b)), (e) => safe(e, 'unreachable')); assert.equal(b.calls.length, 1);
});

test('discovery show fan-out bounded to 16, never embeds/downloads and does not cache metadata', async () => {
  const b = fixture(); let phase = 0;
  b.handle((url) => url.endsWith('/api/tags') ? response({ models: Array.from({ length: 128 }, (_, i) => ({ name: 'model-' + i })) }) : response({ capabilities: phase ? [] : ['embedding'] }));
  assert.equal((await b.api.embeddingModels({ provider: 'ollama' })).length, 16); assert.equal(b.calls.length, 17);
  phase = 1; assert.equal((await b.api.embeddingModels({ provider: 'ollama' })).length, 0); assert.equal(b.calls.length, 34);
  assert.ok(b.calls.every((c) => /\/api\/(tags|show)$/.test(c.url)));
});
for (const payload of [{}, { models: Array(129).fill({ name: 'x' }) }, { models: 'raw-upstream' }]) test('discovery rejects malformed/oversized tag list', async () => {
  const b = fixture(); b.handle(() => response(payload)); await assert.rejects(b.api.embeddingModels({ provider: 'ollama' }), (e) => safe(e, 'unreachable')); assert.equal(b.calls.length, 1);
});

test('already aborted calls never fetch or resolve credentials', async () => {
  const b = fixture(), ac = new AbortController(); ac.abort(); let reads = 0;
  b.ctx.HubProviders = { ...b.ctx.HubProviders, secret() { reads++; throw Error('must not resolve'); } };
  await assert.rejects(b.api.embed({ ...args(b), signal: ac.signal }), (e) => safe(e, 'abort') && e.name === 'AbortError');
  await assert.rejects(b.api.embeddingModels({ provider: 'ollama', signal: ac.signal }), (e) => safe(e, 'abort'));
  assert.equal(b.calls.length, 0); assert.equal(reads, 0); assert.equal(b.timers.size, 0);
});
for (const discovery of [true, false]) test('bounded deadline covers stalled resolution and cleans external listeners: ' + discovery, async () => {
  const b = fixture(), ac = new AbortController(); let active = 0;
  const signal = { get aborted() { return ac.signal.aborted; }, addEventListener(...v) { active++; ac.signal.addEventListener(...v); }, removeEventListener(...v) { active--; ac.signal.removeEventListener(...v); } };
  let release; b.ctx.HubProviders = { ...b.ctx.HubProviders, secret() { return new Promise((resolve) => { release = resolve; }); } };
  const pending = discovery ? b.api.embeddingModels({ provider: b.id, signal }) : b.api.embed({ ...args(b), signal });
  await settle(); assert.equal(b.runTimeout(), discovery ? 15000 : 60000);
  await assert.rejects(pending, (e) => safe(e, 'unreachable')); assert.equal(active, 0); assert.equal(b.timers.size, 0);
  release({ type: 'openai', endpoint: 'https://provider.invalid/v1', key: 'synthetic-central-key' }); await settle(); assert.equal(b.calls.length, 0);
});

test('abort during discovery stops further show requests and abort during body read cancels the reader', async () => {
  const b = fixture(), ac = new AbortController();
  b.handle((url) => { if (url.endsWith('/api/tags')) return response({ models: [{ name: 'a' }, { name: 'b' }] }); ac.abort(); return response({ capabilities: ['embedding'] }); });
  await assert.rejects(b.api.embeddingModels({ provider: 'ollama', signal: ac.signal }), (e) => safe(e, 'abort')); assert.equal(b.calls.length, 2); assert.equal(b.timers.size, 0);
  const c = fixture(), bc = new AbortController(); let cancelled = 0;
  c.handle(() => new Response(new ReadableStream({ cancel() { cancelled++; } })));
  const pending = c.api.embed({ ...args(c), signal: bc.signal }); await settle(); bc.abort();
  await assert.rejects(pending, (e) => safe(e, 'abort')); await settle(); assert.equal(cancelled, 1); assert.equal(c.timers.size, 0);
});

test('runtime load order, offline shell and matching cache versions include helper without consumer edits', () => {
  const core = src('hub/core/hub_core.js'), shell = src('hub/update/hub_sw.js');
  const link = core.split("\n").find((s) => /^    link:/.test(s));
  assert.ok(link.indexOf("'hub/core/hub_embeddings.js'") < link.indexOf("'hub/core/hub_api.js'"));
  assert.ok(shell.includes("'hub/core/hub_embeddings.js'"));
  const version = /const V = '([^']+)'/.exec(shell)[1]; assert.ok(src('sw.js').includes('hub_sw.js?v=' + version));
  assert.ok(!src('hub/core/hub_embeddings.js').includes('localStorage'));
});

for (const value of [null, [], 'raw-upstream', { provider: 'ollama', signal: {} }]) test('invalid option object/signal fails safely', async () => {
  const b = fixture(); await assert.rejects(b.api.embeddingModels(value), (e) => safe(e, 'input')); assert.equal(b.calls.length, 0);
});
for (const model of ['', '  ', null, 'x'.repeat(513), '😀'.repeat(129)]) test('invalid or overlong manual model name is rejected before fetch', async () => {
  const b = fixture(); await assert.rejects(b.api.embed({ ...args(b), model }), (e) => safe(e, 'input')); assert.equal(b.calls.length, 0);
});
for (const embeddings of [[], [[]], [null], [[1, null]], [[1], [2]], [[false]], [Array(4097).fill(0)]]) test('Ollama enforces the same exact count, dimension and scalar contract', async () => {
  const b = fixture(); b.handle(() => response({ embeddings }));
  await assert.rejects(b.api.embed({ ...args(b), provider: 'ollama' }), (e) => safe(e, 'unreachable')); assert.equal(b.calls.length, 1);
});
test('maximum vector width is valid; invalid/raw usage is omitted rather than coerced', async () => {
  const b = fixture(); b.handle(() => response({ data: [{ index: 0, embedding: Array(4096).fill(0) }], usage: { prompt_tokens: -1, total_tokens: '3', other: 'raw-upstream' } }));
  const out = await b.api.embed(args(b)); assert.equal(out.dims, 4096); assert.equal(out.vectors[0].length, 4096); assert.equal(out.usage, undefined);
});
test('changes to saved provider endpoint/key take effect on next call without cached credentials', async () => {
  const b = fixture(); await b.api.embed(args(b));
  b.ctx.HubProviders.update(b.id, { endpoint: 'https://changed.invalid/v2', key: 'synthetic-new-key' }); await b.api.embed(args(b));
  assert.equal(b.calls[1].url, 'https://changed.invalid/v2/embeddings'); assert.equal(b.calls[1].headers.Authorization, 'Bearer synthetic-new-key');
});
test('caller mutations during asynchronous credential resolution cannot change model/input/provider request snapshot', async () => {
  const b = fixture(), o = args(b, [' original ']); const secret = await b.ctx.HubProviders.secret(b.id); let release;
  b.ctx.HubProviders = { ...b.ctx.HubProviders, secret: () => new Promise((resolve) => { release = resolve; }) };
  const pending = b.api.embed(o); await settle(); o.provider = 'custom'; o.model = 'changed'; o.input[0] = 'changed';
  release(secret); await pending;
  assert.deepEqual(JSON.parse(b.calls[0].body), { model: 'manual-model', input: [' original '], encoding_format: 'float' });
});
test('success and transport failure clean external signal listeners and timers without retry', async () => {
  const b = fixture(), ac = new AbortController(); let active = 0;
  const signal = { get aborted() { return ac.signal.aborted; }, addEventListener(...a) { active++; ac.signal.addEventListener(...a); }, removeEventListener(...a) { active--; ac.signal.removeEventListener(...a); } };
  await b.api.embed({ ...args(b), signal }); assert.equal(active, 0); assert.equal(b.timers.size, 0);
  b.handle(() => { throw Error('raw-upstream'); }); await assert.rejects(b.api.embed({ ...args(b), signal }), (e) => safe(e, 'unreachable'));
  assert.equal(active, 0); assert.equal(b.timers.size, 0); assert.equal(b.calls.length, 2);
});
test('full request deadline also bounds stalled transport and stalled response readers', async () => {
  for (const stalledBody of [false, true]) {
    const b = fixture(); let cancels = 0;
    b.handle(() => stalledBody ? new Response(new ReadableStream({ cancel() { cancels++; } })) : new Promise(() => {}));
    const pending = b.api.embed(args(b)); await settle(); assert.equal(b.runTimeout(), 60000);
    await assert.rejects(pending, (e) => safe(e, 'unreachable')); await settle();
    assert.equal(b.timers.size, 0); assert.equal(b.calls.length, 1); if (stalledBody) assert.equal(cancels, 1);
  }
});

test('bounded reader accepts exactly 4 MiB and rejects endless empty/tiny chunk overhead', async () => {
  const b = fixture(), valid = JSON.stringify(vector());
  b.handle(() => new Response(valid + ' '.repeat(4 * 1024 * 1024 - Buffer.byteLength(valid))));
  assert.equal((await b.api.embed(args(b))).dims, 2);
  let cancelled = 0;
  b.handle(() => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(0)); }, cancel() { cancelled++; } })));
  await assert.rejects(b.api.embed(args(b)), (e) => safe(e, 'unreachable')); assert.equal(cancelled, 1); assert.equal(b.timers.size, 0);
});
