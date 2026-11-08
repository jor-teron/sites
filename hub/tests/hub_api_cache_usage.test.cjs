/* H141: non-browser VM + synthetic SSE/NDJSON only. No provider calls or cache creation. */
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..'), read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
async function run(frames, { provider = 'oa', split = false, raw } = {}) {
  const calls = [], deltas = [], encoder = new TextEncoder();
  const wire = raw || frames.map((f) => (provider === 'ollama' ? '' : 'data: ') + JSON.stringify(f) + '\n' + (provider === 'ollama' ? '' : '\n')).join('');
  const ctx = vm.createContext({ URL, TextDecoder, AbortController, DOMException, performance: { now: () => 1 },
    HubKeys: { get: async (name) => name === 'ollama_url' ? 'http://ollama.invalid:11434' : 'synthetic-private-key' },
    HubProviders: { list: () => [{ id: 'svc_cachetest123', label: 'raw-upstream', type: 'openai' }],
      info: () => ({ label: 'raw-upstream' }), secret: async () => ({ type: 'openai', endpoint: 'https://provider.invalid/v1', key: 'synthetic-private-key' }) },
    fetch: async (url, init) => {
      calls.push({ url, init }); const bytes = encoder.encode(wire);
      return new Response(new ReadableStream({ start(c) {
        if (split) for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); else c.enqueue(bytes);
        c.close();
      } }));
    }, console: { warn() { throw Error('Unexpected log'); } },
  });
  ctx.window = ctx; ctx.top = ctx;
  vm.runInContext(read('hub/core/hub_api.js'), ctx);
  const result = plain(await ctx.HubAPI.chatAdvanced({ provider: provider === 'oa' ? 'svc_cachetest123' : provider,
    model: 'synthetic-model', messages: [{ role: 'user', content: 'private-input' }], onDelta: (text, thinking) => deltas.push([text, thinking]) }));
  return { result, calls, deltas };
}
const oa = (usage) => ({ choices: [], usage });
const gem = (usageMetadata) => ({ usageMetadata });
const expectUnknown = (out) => assert.equal(out.usage && out.usage.cache, undefined);
const mapping = [
  ['OA', (n, prompt = 10) => oa({ prompt_tokens: prompt, prompt_tokens_details: { cached_tokens: n } }), 'usage.prompt_tokens_details.cached_tokens', 'oa'],
  ['DeepSeek', (n, prompt = 10) => oa({ prompt_tokens: prompt, prompt_cache_hit_tokens: n }), 'usage.prompt_cache_hit_tokens', 'oa'],
  ['Gemini', (n, prompt = 10) => gem({ promptTokenCount: prompt, cachedContentTokenCount: n }), 'usageMetadata.cachedContentTokenCount', 'gemini'],
  ['Groq', (n, prompt = 10) => ({ choices: [], x_groq: { usage: { prompt_tokens: prompt, prompt_tokens_details: { cached_tokens: n } } } }), 'x_groq.usage.prompt_tokens_details.cached_tokens', 'oa'],
];
for (const [name, frame, source, provider] of mapping) {
  for (const cached of [0, 4, 10]) test(name + ' preserves reported cache read ' + cached + ' without increasing prompt/total', async () => {
    const { result, calls } = await run([frame(cached)], { provider, split: true });
    assert.deepEqual(result.usage.cache, { cached_input_tokens: cached, source });
    assert.equal(result.prompt_eval_count, 10); assert.equal(result.usage.prompt_tokens, 10);
    assert.equal(result.usage.total_tokens, provider === 'gemini' ? 0 : 10); assert.equal(calls.length, 1);
    const request = JSON.parse(calls[0].init.body); assert.equal(request.stream, provider === 'gemini' ? undefined : true);
    assert.ok(!Object.keys(request).some((key) => key.startsWith('prompt_cache')));
  });
  for (const value of [-1, 1.5, '4', null, true, Number.MAX_SAFE_INTEGER + 1, 11]) test(name + ' omits invalid/excess cached count ' + String(value), async () => {
    expectUnknown((await run([frame(value)], { provider })).result);
  });
  for (const prompt of [-1, 1.5, '10', null, Number.MAX_SAFE_INTEGER + 1]) test(name + ' never validates cache against invalid raw prompt ' + String(prompt), async () => {
    expectUnknown((await run([frame(0, prompt)], { provider })).result);
  });
  test(name + ' accepts explicitly reported zero prompt/cache and rejects missing prompt despite legacy zero fallback', async () => {
    assert.equal((await run([frame(0, 0)], { provider })).result.usage.cache.cached_input_tokens, 0);
    const f = frame(0); const u = f.usage || f.usageMetadata || f.x_groq.usage;
    delete u.prompt_tokens; delete u.promptTokenCount;
    const out = (await run([f], { provider })).result; expectUnknown(out); assert.equal(out.usage.prompt_tokens, 0);
  });
}

test('missing cache details, null details, missing usage and unknown field names remain unknown', async () => {
  for (const frame of [oa({ prompt_tokens: 10 }), oa({ prompt_tokens: 10, prompt_tokens_details: null }), oa({ prompt_tokens: 10, prompt_tokens_details: {} }), oa(null),
    oa({ prompt_tokens: 10, cached_tokens: 4, cache_write_tokens: 7, prompt_cache_miss_tokens: 6 }), gem({ promptTokenCount: 10 }), { choices: [] }]) {
    expectUnknown((await run([frame])).result);
  }
});
for (const alternate of [3, -1, null, '4', 1.5, Number.MAX_SAFE_INTEGER + 1]) test('valid OA candidate cannot hide conflicting/invalid present alternate ' + String(alternate), async () => {
  const u = { prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 4 }, prompt_cache_hit_tokens: alternate };
  expectUnknown((await run([oa(u)])).result);
});
for (const standard of [null, '4', -1, 1.5]) test('valid DeepSeek alternate cannot hide invalid present standard ' + String(standard), async () => {
  expectUnknown((await run([oa({ prompt_tokens: 10, prompt_tokens_details: { cached_tokens: standard }, prompt_cache_hit_tokens: 4 })])).result);
});
test('equal cache-read fields prefer standard OA source; misses/writes are never derived or exposed', async () => {
  const { result } = await run([oa({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, prompt_tokens_details: { cached_tokens: 4, cache_write_tokens: 3 }, prompt_cache_hit_tokens: 4, prompt_cache_miss_tokens: 6 })]);
  assert.deepEqual(result.usage, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cache: { cached_input_tokens: 4, source: mapping[0][2] } });
});
test('no numeric coercion/reconciliation: inconsistent provider totals stay backward compatible', async () => {
  const { result } = await run([oa({ prompt_tokens: 10, completion_tokens: 7, total_tokens: 99, prompt_tokens_details: { cached_tokens: 4 } })]);
  assert.equal(result.usage.total_tokens, 99); assert.equal(result.eval_count, 7); assert.equal(result.usage.cache.cached_input_tokens, 4);
});
for (const [provider, first, last] of [
  ['oa', mapping[0][1](4), oa({ prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 })],
  ['gemini', mapping[2][1](4), gem({ promptTokenCount: 10, candidatesTokenCount: 2, totalTokenCount: 12 })],
]) test(provider + ' repeated/final usage snapshots replace rather than sum or carry stale cache', async () => {
  const repeat = (await run([first, first], { provider })).result; assert.equal(repeat.usage.cache.cached_input_tokens, 4);
  const final = (await run([first, first, last], { provider })).result; expectUnknown(final); assert.equal(final.usage.total_tokens, 12);
  const latest = (await run([first, last, first], { provider })).result; assert.equal(latest.usage.cache.cached_input_tokens, 4);
});
test('null usage deltas preserve last actual usage snapshot but never create one', async () => {
  assert.equal((await run([mapping[0][1](4), oa(null), { choices: [] }])).result.usage.cache.cached_input_tokens, 4);
  expectUnknown((await run([oa(null)])).result);
});
test('Groq uses only its existing standard mapping; primary usage retains existing envelope precedence', async () => {
  const out = (await run([{ usage: { prompt_tokens: 10 }, x_groq: { usage: { prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 4 } } } }])).result;
  expectUnknown(out);
  expectUnknown((await run([{ x_groq: { usage: { prompt_tokens: 10, prompt_cache_hit_tokens: 4 } } }])).result);
});
test('Ollama native terminal counts/durations stay unchanged; reported foreign fields never imply hits', async () => {
  const { result } = await run([{ message: { content: 'ok' } }, { done: true, done_reason: 'stop', prompt_eval_count: 10, eval_count: 3, eval_duration: 123, total_duration: 456,
    prompt_cache_hit_tokens: 4, usage: { prompt_tokens_details: { cached_tokens: 4 } } }], { provider: 'ollama', split: true });
  assert.deepEqual(result, { done_reason: 'stop', prompt_eval_count: 10, eval_count: 3, eval_duration: 123, total_duration: 456,
    usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 }, text: 'ok', tool_calls: [], provider: 'ollama' });
});
test('OA text/thinking/tool assembly/callbacks and old token contract remain unchanged', async () => {
  const frames = [{ choices: [{ delta: { content: 'Hi', reasoning_content: 'why', tool_calls: [{ index: 0, id: 'call_1', function: { name: 'clock', arguments: '{"x":' } }] } }] },
    { choices: [{ delta: { content: '!', tool_calls: [{ index: 0, function: { arguments: '1}' } }] }, finish_reason: 'tool_calls' }] },
    oa({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, completion_tokens_details: { reasoning_tokens: 2 }, prompt_tokens_details: { cached_tokens: 4 } })];
  const { result, deltas } = await run(frames, { split: true });
  assert.deepEqual(deltas, [['Hi', 'why'], ['!', '']]); assert.equal(result.text, 'Hi!'); assert.equal(result.thinking, 'why');
  assert.deepEqual(result.tool_calls, [{ id: 'call_1', function: { name: 'clock', arguments: { x: 1 } } }]); assert.equal(result.done_reason, 'tool_calls');
  assert.equal(result.eval_count, 5); assert.equal(result.prompt_eval_count, 10); assert.equal(result.usage.thoughts_tokens, 2);
  assert.equal(result.usage.total_tokens, 15);
});
test('Gemini thought/tool signature assembly and completion/total counts remain unchanged', async () => {
  const { result } = await run([{ candidates: [{ content: { parts: [{ text: 'why', thought: true }, { text: 'ok' }, { functionCall: { name: 'clock', args: {} }, thoughtSignature: 'sig' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3, thoughtsTokenCount: 2, totalTokenCount: 15, cachedContentTokenCount: 4 } }], { provider: 'gemini' });
  assert.equal(result.eval_count, 5); assert.equal(result.usage.completion_tokens, 3); assert.equal(result.usage.thoughts_tokens, 2); assert.equal(result.usage.total_tokens, 15);
  assert.equal(result.tool_calls[0].thoughtSignature, 'sig'); assert.equal(result.text, 'ok'); assert.equal(result.thinking, 'why');
});
test('sources are hardcoded field paths; raw metadata/key/input are never copied into normalized usage', async () => {
  const { result } = await run([oa({ prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 4, source: 'private-input' }, source: 'synthetic-private-key', raw: 'raw-upstream' })]);
  assert.deepEqual(result.usage.cache, { cached_input_tokens: 4, source: mapping[0][2] });
  const serialized = JSON.stringify(result); for (const secret of ['private-input', 'synthetic-private-key', 'raw-upstream']) assert.ok(!serialized.includes(secret));
});
test('overflow scalar parsed from valid JSON is omitted rather than exposed as a cache count', async () => {
  expectUnknown((await run([], { raw: 'data: {"choices":[],"usage":{"prompt_tokens":10,"prompt_tokens_details":{"cached_tokens":1e400}}}\n\n' })).result);
});
test('matching worker versions are updated without new runtime dependencies', () => {
  const version = /const V = '([^']+)'/.exec(read('hub/update/hub_sw.js'))[1]; assert.ok(read('sw.js').includes('hub_sw.js?v=' + version));
});
