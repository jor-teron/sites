/* AG35 stage 2: provider-reported cache reads. Real Hub H141 hub_api.js (read-only from the Hub builder checkout when
   present, else those wire tests skip) with mocked fetch; Agent HR.cacheMeta, HR.usage storage, Usage page text, Assist. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');
const H141 = ['/workspace/sites-h138a-hub-builder-b/hub/core/hub_api.js', path.resolve(base, '../../../hub/core/hub_api.js')].find(f => fs.existsSync(f) && /H141/.test(fs.readFileSync(f, 'utf8')));

function hub(fetcher) {
  const services = [{ id: 'svc_oa12345', label: 'OA', type: 'openai', endpoint: 'https://api.example/v1', key: 'k' }];
  const providers = { list: () => services.map(({ id, label, type }) => ({ id, label, type })), info: id => { const s = services.find(x => x.id === id); return s && { id, label: s.label, type: s.type, endpoint: s.endpoint, hasKey: true }; },
    has: id => services.some(s => s.id === id), onChange: () => {}, secret: async id => services.find(s => s.id === id) };
  const hw = { HubKeys: { get: async k => k === 'gemini' ? 'gk' : '', open: () => {} }, HubProviders: providers }; hw.top = hw;
  const hc = vm.createContext({ window: hw, URL, performance, TextDecoder, TextEncoder, DOMException, Blob, atob, AbortController, setTimeout, clearTimeout, fetch: async (u, o) => fetcher(u, o) });
  vm.runInContext(fs.readFileSync(H141, 'utf8'), hc); return hw.HubAPI;
}
const sse = (...js) => new Response(js.map(j => 'data: ' + JSON.stringify(j) + '\n\n').join('') + 'data: [DONE]\n\n');
function agentCtx(extra = {}) {
  const store = {}, F = {};
  const ctx = vm.createContext(Object.assign({ console, AbortController, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } } }, extra));
  ctx.window = ctx; vm.runInContext('window.HR = {};', ctx);
  ctx.HR.fs = { ready: () => true, read: async p => { if (!(p in F)) throw new Error('nf'); return { text: F[p] }; }, write: async (p, t) => { F[p] = t; }, list: async () => [] };
  for (const f of ['app/gui/settings.js', 'app/core/cachemeta.js', 'app/storage/usage.js']) vm.runInContext(read(f), ctx);
  return { HR: ctx.HR, F, ctx };
}
const { HR: U } = agentCtx();
const chatOA = (api, usage) => api.chatAdvanced({ provider: 'svc_oa12345', model: 'm', messages: [{ role: 'user', content: 'hi' }], onDelta: () => {} });

test('syntax', () => { for (const f of ['app/core/cachemeta.js', 'app/storage/usage.js', 'app/gui/usageview.js', 'app/gui/chat.js', 'app/gui/steps.js', 'app/core/assist.js']) require('node:child_process').execFileSync(process.execPath, ['--check', path.join(base, f)]); });

test('actual H141 Hub replies -> HR.cacheMeta: positive, explicit 0, missing, DeepSeek, Groq, Gemini', { skip: !H141 && 'H141 hub_api.js not available' }, async () => {
  const cases = [
    [{ prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 64 } }, 64, 'usage.prompt_tokens_details.cached_tokens'],
    [{ prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 0 } }, 0, 'usage.prompt_tokens_details.cached_tokens'],
    [{ prompt_tokens: 100, completion_tokens: 5 }, null],
    [{ prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 500 } }, null],
    [{ prompt_tokens: 100, completion_tokens: 5, prompt_cache_hit_tokens: 40, prompt_cache_miss_tokens: 60 }, 40, 'usage.prompt_cache_hit_tokens']];
  for (const [u, want, src] of cases) {
    const r = await chatOA(hub(() => sse({ choices: [{ delta: { content: 'x' } }] }, { choices: [], usage: u })));
    const m = U.cacheMeta.read(r);
    if (want == null) assert.equal(m, null, JSON.stringify(u)); else { assert.equal(m.cached, want); assert.equal(m.source, src); assert.equal(m.prompt, 100); }
    assert.equal(r.prompt_eval_count, 100);   /* totals untouched */
  }
  const g = hub(() => sse({ x_groq: { usage: { prompt_tokens: 50, completion_tokens: 2, prompt_tokens_details: { cached_tokens: 10 } } }, choices: [{ delta: { content: 'y' } }] }));
  const rg = await chatOA(g); const mg = U.cacheMeta.read(rg); assert.equal(mg.cached, 10); assert.equal(mg.source, 'x_groq.usage.prompt_tokens_details.cached_tokens');
  const gem = hub(() => sse({ candidates: [{ content: { parts: [{ text: 'z' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 3, cachedContentTokenCount: 32 } }));
  const rm = await gem.chatAdvanced({ provider: 'gemini', model: 'g', messages: [{ role: 'user', content: 'hi' }], onDelta: () => {} });
  const mm = U.cacheMeta.read(rm); assert.equal(mm.cached, 32); assert.equal(mm.source, 'usageMetadata.cachedContentTokenCount');
});

test('cacheMeta rejects malformed / unknown source / no real prompt count', () => {
  const ok = { prompt_eval_count: 10, usage: { cache: { cached_input_tokens: 4, source: 'usage.prompt_tokens_details.cached_tokens' } } };
  assert.equal(U.cacheMeta.read(ok).cached, 4);
  for (const bad of [{}, { usage: {} }, { prompt_eval_count: 10, usage: { cache: { cached_input_tokens: -1, source: ok.usage.cache.source } } },
    { prompt_eval_count: 10, usage: { cache: { cached_input_tokens: 1.5, source: ok.usage.cache.source } } }, { prompt_eval_count: 10, usage: { cache: { cached_input_tokens: '4', source: ok.usage.cache.source } } },
    { prompt_eval_count: 10, usage: { cache: { cached_input_tokens: 4, source: '<img onerror=x>' } } }, { usage: { cache: ok.usage.cache } }, { prompt_eval_count: 3, usage: { cache: ok.usage.cache } }])
    assert.equal(U.cacheMeta.read(bad), null, JSON.stringify(bad));
});

test('usage storage: cache beside totals, no double counting, unknown stays unknown, reload, legacy rows', async () => {
  const { HR, F } = agentCtx(); const src = 'usage.prompt_tokens_details.cached_tokens';
  await HR.usage.record('p', 'm', 100, 5, false, { cached: 60, prompt: 100, source: src });
  await HR.usage.record('p', 'm', 50, 5, false, null);
  await HR.usage.record('p', 'm', 40, 5, false, { cached: 0, prompt: 40, source: src });
  await HR.usage.record('p', 'm', 30, 5, true, { cached: 10, prompt: 99, source: src });   /* estimated / mismatched prompt -> ignored */
  const j = JSON.parse(Object.values(F)[0]); const r = Object.values(j.days)[0]['p|m'];
  assert.equal(r.p, 220); assert.equal(r.o, 20); assert.equal(r.n, 4); assert.equal(r.c, 60); assert.equal(r.k, 2); assert.equal(r.kp, 140);
  const again = agentCtx(); Object.assign(again.F, F); const m = await again.HR.usage.month(); assert.equal(Object.values(m.days)[0]['p|m'].c, 60);
});

test('Usage page text: reported subset only, partial coverage, unknown, unreadable; rollup keeps totals', () => {
  const doc = { days: { '2026-11-08': { 'p|m': { p: 220, o: 20, n: 4, e: 0, c: 60, k: 2, kp: 140 }, 'p|old': { p: 10, o: 1, n: 1, e: 0 }, 'p|bad': { p: 10, o: 1, n: 1, e: 0, c: 50, k: 1, kp: 10 } } } };
  const store = {}; const ctx = vm.createContext({ console, localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } }, document: { getElementById: () => null } }); ctx.window = ctx;
  vm.runInContext('window.HR = {};', ctx); for (const f of ['app/gui/settings.js', 'app/storage/usage.js', 'app/gui/usageview.js']) vm.runInContext(read(f), ctx);
  const V = ctx.HR.usageView, rows = V.rollup([{ doc }], 'month').rows;
  assert.equal(rows['p|m'].p, 220); assert.equal(V.cacheText(rows['p|m']), '60 of 140 input (43%) · 2 of 4 calls reported');
  assert.equal(V.cacheText(rows['p|old']), 'unknown'); assert.equal(V.cacheText(rows['p|bad']), 'unreadable');
  rows['p|m'].k = 4; assert.equal(V.cacheText(rows['p|m']), '60 of 140 input (43%)');
});

test('Assist calls record reported cache without touching the main model', async () => {
  const { HR, ctx } = agentCtx({ TextEncoder });
  const rec = []; HR.usage.record = (...a) => rec.push(a);
  HR.models = { all: () => [{ id: 'ollama', label: 'O', models: async () => [], chat: async o => { o.onDelta('sum', ''); return { prompt_eval_count: 20, eval_count: 2, usage: { cache: { cached_input_tokens: 8, source: 'usage.prompt_tokens_details.cached_tokens' } } }; } }], ready: () => true, base: () => 'x', service: () => null, getKey: () => '' };
  vm.runInContext(read('app/core/assist.js'), ctx);
  HR.set.put('provider', 'gemini'); HR.set.put('assistProvider', 'ollama'); HR.set.put('assistModel', 'h');
  const r = await HR.assist.ask({ prompt: 'x' }); assert.equal(r.usage.c, 8); assert.equal(rec[0][5].cached, 8); assert.equal(HR.set.get('provider'), 'gemini');
});

test('wiring: chat.js reads cacheMeta into usage + step row; no cache toggle', () => {
  const c = read('app/gui/chat.js'); assert.match(c, /HR\.cacheMeta\.read\(s\)/); assert.match(c, /a\.usage\.c = cm\.cached/);
  assert.match(read('app/gui/steps.js'), /cached input \(provider\)/); assert.doesNotMatch(read('agent.html'), /cache on|setCache/i);
  assert.match(read('agent.html'), /app\/core\/cachemeta\.js/);
});
