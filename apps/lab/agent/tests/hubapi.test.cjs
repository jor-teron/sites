/* AG23: syntax/static + isolated VM smoke tests; every HTTP call is stubbed. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const base = path.resolve(__dirname, '..');
const root = path.resolve(base, '../../..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');
const plain = v => JSON.parse(JSON.stringify(v));
function env({hub = {}, api, real = false, crossOrigin = false, fetcher, services = []} = {}) {
  const values = {provider: 'ollama', baseUrl: 'http://localhost:11434', allowWeb: 'on'};
  const requests = [], cards = [], credits = [], adapters = {}, keyReads = [], opened = [], listeners = [];
  const storage = {};
  const allowed = ['gemini', 'tavily', 'ollama_url'];
  const get = async k => { keyReads.push(k); assert.ok(allowed.includes(k), 'forbidden Hub slot: ' + k); return hub[k] || ''; };
  const providers = {
    list: () => services.map(({id, label, type}) => ({id, label, type})),
    info: id => {const s = services.find(s => s.id === id); return s && {id, label: s.label, type: s.type, endpoint: s.endpoint, hasKey: !!s.key};},
    has: id => services.some(s => s.id === id),
    open: id => opened.push(id), onChange: f => listeners.push(f),
    secret: () => {throw new Error('Agent must not read provider secrets');}
  };
  const fetch = async (url, options = {}) => {
    requests.push({url, options, body: options.body && JSON.parse(options.body)});
    if (!fetcher) throw new Error('Unexpected fetch: ' + url);
    return fetcher(url, options);
  };
  const w = {};
  if (crossOrigin) Object.defineProperty(w, 'top', {get() { throw new Error('cross origin'); }});
  else w.top = {HubAPI: api, HubProviders: services.length ? providers : undefined,
    HubKeys: Object.keys(hub).length ? {get, open: id => opened.push(id), onChange: () => {}} : undefined};
  const HR = {
    set: {get: k => values[k]},
    tools: {register: () => {}}, usage: {credits: (p, n) => credits.push([p, n])},
    view: {infoCard: (...a) => cards.push(a)}
  };
  const c = vm.createContext({window: w, HR, URL, performance, TextDecoder, DOMException, console,
    localStorage: {getItem: k => storage[k] || null, setItem: (k,v) => {storage[k] = v;}}, fetch});
  if (real) {
    const hw = {HubKeys: {get, open: () => {}}, HubProviders: Object.assign({}, providers, {secret: async id => services.find(s => s.id === id) || null})}; hw.top = hw;
    const hc = vm.createContext({window: hw, URL, performance, TextDecoder, DOMException, Blob, atob, fetch});
    vm.runInContext(fs.readFileSync(path.join(root, 'hub/core/hub_api.js'), 'utf8'), hc);
    w.top.HubAPI = hw.HubAPI;
  }
  for (const f of ['models/net', 'models/presets', 'core/hubkeys', 'core/hubapi', 'models/registry', 'models/ollama', 'models/openai', 'models/gemini', 'tools/web']) {
    vm.runInContext(read('app/' + f + '.js'), c, {filename: f});
  }
  HR.hubKeys.val = k => {assert.ok(allowed.includes(k), 'forbidden Hub slot: ' + k); return hub[k] || '';};
  HR.models.all().forEach(a => { adapters[a.id] = a; });
  return {HR, w, c, adapters, values, requests, cards, credits, services, providers, keyReads, opened, listeners, storage};
}
function cfg(provider, base, key = '') { return {provider, base, key}; }
function options(c) {
  return {cfg: c, model: 'model', messages: [{role: 'user', content: 'hello', images: ['aGVsbG8=']}],
    tools: [{type: 'function', function: {name: 'clock', parameters: {type: 'object', properties: {}}}}],
    think: false, signal: new AbortController().signal, onDelta: () => {}};
}
function json(j, status = 200) { return new Response(JSON.stringify(j), {status}); }
function sse(j) { return new Response('data: ' + JSON.stringify(j) + '\n\ndata: [DONE]\n\n'); }

test('all non-vendor Agent JS passes syntax checks', () => {
  let n = 0;
  function walk(dir) { for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    if (e.name === 'vendor') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.(js|cjs)$/.test(e.name)) { execFileSync(process.execPath, ['--check', f]); n++; }
  }}
  walk(base); assert.ok(n > 50); console.log('Syntax checked ' + n + ' files');
});
test('HTML parses, local links/required ids exist, no new duplicate ids/version queries', () => {
  // Python HTMLParser also checks inline script syntax with Node below.
  execFileSync('python3', ['-c', `
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import subprocess
base=Path(${JSON.stringify(base)})
class Check(HTMLParser):
 def __init__(self):
  super().__init__(convert_charrefs=True); self.ids={}; self.inline=False; self.script=[]
 def handle_starttag(self, tag, attrs):
  a=dict(attrs)
  if 'id' in a:
   self.ids[a['id']]=self.ids.get(a['id'],0)+1
  for k in ('src','href'):
   if k not in a: continue
   u=urlsplit(a[k]); assert not ('v=' in u.query), a[k]
   if u.scheme or u.netloc or not u.path or u.path.startswith('/'): continue
   assert (base/unquote(u.path)).exists(), a[k]
  if tag=='script': self.inline='src' not in a; self.script=[]
 def handle_data(self, data):
  if self.inline: self.script.append(data)
 def handle_endtag(self, tag):
  if tag=='script' and self.inline:
   subprocess.run(['node','--check'],input=''.join(self.script),text=True,check=True)
   self.inline=False
for p in base.glob('*.html'):
 c=Check(); c.feed(p.read_text()); c.close()
 duplicates={k:v for k,v in c.ids.items() if v>1}
 assert duplicates == ({'btnPick':2} if p.name=='agent.html' else {}), (p.name,duplicates)
 print(p.name, len(c.ids), 'ids; links and inline syntax OK; known baseline duplicates:', duplicates)
`], {stdio: 'pipe'});
  const html = read('agent.html');
  assert.ok(html.indexOf('app/core/hubapi.js') < html.indexOf('app/models/registry.js'));
  for (const id of ['barFav', 'barModel', 'barProv']) assert.match(html, new RegExp('id="' + id + '"'));
  assert.match(read('agent_sw.js'), /VER = 'agent-ag27'/);
  assert.match(read('agent_sw.js'), /agent-files/);
});

test('bridge passes every Agent-compatible field and keeps result identity', async () => {
  let received;
  const result = {text: 'ok', thinking: 'why', tool_calls: [{id: 'c1', function: {name: 'clock', arguments: {}}, thoughtSignature: 'sig'}],
    usage: {prompt_tokens: 12}, eval_count: 3, prompt_eval_count: 12, eval_duration: 1e9, done_reason: 'stop'};
  const e = env({hub: {gemini: 'key'}, api: {chatAdvanced: async o => { received = o; o.onDelta('ok', 'why'); return result; }}});
  const o = options(cfg('gemini', 'https://generativelanguage.googleapis.com/v1beta', 'key'));
  let delta; o.onDelta = (...x) => { delta = x; };
  assert.equal(await e.adapters.gemini.chat(o), result);
  for (const k of ['model', 'messages', 'tools', 'signal', 'onDelta']) assert.equal(received[k], o[k]);
  assert.equal(received.thinking, false); assert.equal(received.provider, 'gemini');
  assert.deepEqual(delta, ['ok', 'why']); assert.equal(e.requests.length, 0);
});
for (const id of ['openai', 'groq', 'openrouter', 'deepseek', 'deepinfra', 'xai']) {
  test(id + ' uses visible matching svc id; no secret or hidden key lookup', async () => {
    let got;
    const e = env({services: [], api: {chatAdvanced: async o => {got = o; return {};}, models: async o => {got = o; return [{name: 'm', ctx: 42}];}}});
    const pr = e.HR.presets.get(id);
    e.services.push({id: 'svc_company123', label: pr.label.toUpperCase(), type: 'openai', endpoint: pr.base + '///', key: 'fake'});
    e.w.top.HubProviders = e.providers;
    const c = cfg(id, pr.base, 'local-key');
    await e.adapters[id].chat(options(c)); assert.equal(got.provider, 'svc_company123'); assert.equal(got.key, undefined);
    assert.equal((await e.adapters[id].models(c))[0].ctx, 42); assert.equal(got.provider, 'svc_company123');
    assert.equal(e.HR.models.getKey(id, pr.base), ''); // never return a Hub service secret
    assert.equal(e.HR.models.ready(id), true);
    e.services.length = 0; await e.adapters[id].chat(options(c));
    assert.equal(got.provider, 'custom'); assert.equal(got.key, 'local-key'); assert.equal(got.endpoint, c.base);
  });
}
test('nonmatching endpoint/label/type and duplicate services do not select an account', () => {
  const e = env({services: [{id: 'svc_wrong123', label: 'OpenAI', type: 'openai', endpoint: 'https://wrong.test'}]});
  assert.equal(e.HR.models.service('openai', e.HR.models.base('openai')), null);
  e.services[0].endpoint = e.HR.models.base('openai'); e.services[0].label = 'Wrong';
  assert.equal(e.HR.models.service('openai', e.HR.models.base('openai')), null);
  e.services[0].label = 'OpenAI'; e.services[0].type = 'gemini';
  assert.equal(e.HR.models.service('openai', e.HR.models.base('openai')), null);
  e.services[0].type = 'openai'; e.services.push({...e.services[0], id: 'svc_other123'});
  assert.equal(e.HR.models.service('openai', e.HR.models.base('openai')), null);
});
test('Custom endpoint permits no key and uses HubAPI models', async () => {
  let got;
  const e = env({api: {models: async o => {got = o; return [];}, chatAdvanced: async o => {got = o; return {};}}});
  const c = cfg('custom', 'http://localhost:1234/v1');
  await e.adapters.custom.models(c); assert.deepEqual(plain(got), {provider: 'custom', endpoint: c.base, key: ''});
  await e.adapters.custom.chat(options(c)); assert.equal(got.provider, 'custom');
});
for (const kind of ['http', 'key', 'abort', 'unreachable', 'input']) {
  test('Hub ' + kind + ' failure is preserved and never retried', async () => {
    const error = Object.assign(new Error('model not found'), {kind, status: 404, keyName: 'gemini', openSettings: () => {}});
    const e = env({hub: {gemini: 'k'}, api: {chatAdvanced: async () => {throw error;}, models: async () => {throw error;}}});
    const c = cfg('gemini', 'https://generativelanguage.googleapis.com/v1beta', 'k');
    await assert.rejects(e.adapters.gemini.chat(options(c)), x => x === error);
    await assert.rejects(e.adapters.gemini.models(c), x => x === error);
    assert.equal(e.requests.length, 0);
  });
}
for (const context of ['standalone', 'old-hub', 'cross-origin']) {
  test(context + ' keeps legacy chat and model lists', async () => {
    const e = env({api: context === 'old-hub' ? {chat: () => {throw new Error('old API');}} : undefined,
      crossOrigin: context === 'cross-origin', fetcher: url => url.endsWith('/models') ? json({data: [{id: 'a'}]}) : sse({choices: [{delta: {content: 'hi'}, finish_reason: 'stop'}]})});
    const c = cfg('custom', 'http://local.test/v1', 'local');
    assert.equal((await e.adapters.custom.models(c))[0].name, 'a');
    assert.equal((await e.adapters.custom.chat(options(c))).done_reason, 'stop');
    assert.equal(e.requests[1].options.headers.Authorization, 'Bearer local');
  });
}
test('standalone window.HubAPI is detected and Browser adapter is unchanged', () => {
  const e = env({crossOrigin: true}); e.w.HubAPI = {models: () => []};
  assert.equal(e.HR.hubAPI.api('models'), e.w.HubAPI);
  const browser = {id: 'browser', chat: () => {}};
  e.HR.models.register(browser); assert.equal(e.HR.models.all().find(a => a.id === 'browser'), browser);
});
test('Gemini local key falls back rather than sending wrong Hub credentials', async () => {
  const e = env({hub: {gemini: 'hub'}, api: {chatAdvanced: () => {throw new Error('must not use');}},
    fetcher: () => sse({candidates: [{content: {parts: [{text: 'hi'}]}, finishReason: 'STOP'}]})});
  await e.adapters.gemini.chat(options(cfg('gemini', 'https://generativelanguage.googleapis.com/v1beta', 'local')));
  assert.equal(e.requests[0].options.headers['x-goog-api-key'], 'local');
});
test('Ollama Hub chat/model list keeps metadata and ctx; local URL fallback', async () => {
  let calls = 0;
  const e = env({hub: {ollama_url: 'http://hub.test:11434/'}, api: {
    chatAdvanced: async o => {calls++; assert.equal(o.provider, 'ollama'); return {eval_count: 4};},
    models: async () => [{name: 'm', label: 'm', ctx: 0}]
  }, fetcher: url => url.endsWith('/api/show') ? json({model_info: {'llama.context_length': 4096}, parameters: 'num_ctx 2048'})
    : url.endsWith('/api/tags') ? json({models: [{name: 'm', size: 2147483648, details: {parameter_size: '3B'}}]})
    : new Response(JSON.stringify({done: true, eval_count: 2}) + '\n')});
  const c = cfg('ollama', 'http://hub.test:11434');
  assert.equal((await e.adapters.ollama.chat(options(c))).eval_count, 4);
  assert.match((await e.adapters.ollama.models(c))[0].label, /3B.*2.0 GB/);
  assert.equal(await e.HR.ollama.ctx(c.base, 'm'), 2048);
  assert.equal((await e.adapters.ollama.chat(options(cfg('ollama', 'http://local.test')))).eval_count, 2);
  assert.equal(calls, 1);
});
test('Ollama metadata failure leaves Hub model list usable', async () => {
  const e = env({hub: {ollama_url: 'http://hub.test'}, api: {models: async () => [{name: 'm', label: 'm'}]}});
  assert.equal((await e.adapters.ollama.models(cfg('ollama', 'http://hub.test')))[0].name, 'm');
});

test('web search/extract adapt depth, limits, snippets, credits, page length and Stop', async () => {
  const seen = [];
  const e = env({hub: {tavily: 'hub-key'}, api: {
    search: async o => {seen.push(o); return {results: [{title: 'T', url: 'https://x', snippet: 'abc'}], credits: 0};},
    fetchPage: async o => {seen.push(o); return {url: 'https://redirect', text: 'z'.repeat(8000), length: 9000, credits: 2};}
  }});
  e.values.webDepth = 'advanced'; const signal = new AbortController().signal;
  const s = await e.HR.web.search({query: ' q ', max_results: 50}, {signal});
  assert.equal(s.results[0].snippet, 'abc'); assert.equal(s.query, 'q');
  assert.equal(seen[0].count, 10); assert.equal(seen[0].depth, 'advanced'); assert.equal(seen[0].signal, signal);
  const text = await e.HR.web.extract({url: 'https://x'}, {signal});
  assert.match(text, /^URL: https:\/\/redirect/); assert.match(text, /trimmed, 9000 chars total/);
  assert.equal(seen[1].maxChars, 8000); assert.equal(seen[1].signal, signal);
  assert.deepEqual(e.credits, [['tavily', 0], ['tavily', 2]]); assert.equal(e.requests.length, 0);
});
for (const status of [401, 403, 429, 432, 433, 500]) {
  test('web keeps ' + status + ' error card, no fallback network call', async () => {
    const fail = async () => {throw Object.assign(new Error('provider failed'), {status});};
    const e = env({hub: {tavily: 'k'}, api: {search: fail, fetchPage: fail}});
    await assert.rejects(e.HR.web.search({query: 'x'}, {}));
    await assert.rejects(e.HR.web.extract({url: 'https://x'}, {}));
    assert.equal(e.cards.length, 2); assert.equal(e.requests.length, 0);
    assert.match(e.cards[0][0], new RegExp(String(status)));
  });
}
test('web abort has no error card; input validation avoids calls; Allow web still gates tools', async () => {
  const error = new DOMException('stopped', 'AbortError');
  const e = env({hub: {tavily: 'k'}, api: {search: async () => {throw error;}}});
  await assert.rejects(e.HR.web.search({query: 'x'}, {}), x => x === error);
  await assert.rejects(e.HR.web.search({query: ' '}, {}), /query is required/);
  await assert.rejects(e.HR.web.extract({url: 'file:///x'}, {}), /http/);
  assert.equal(e.cards.length, 0); assert.equal(e.HR.web.ready(), true);
  e.values.allowWeb = 'off'; assert.equal(e.HR.web.ready(), false);
});
test('web local key remains usable without a Hub key, even with HubAPI present', async () => {
  const e = env({api: {search: () => {throw new Error('not expected');}}, fetcher: () => json({results: [{title: 'T', url: 'https://x', content: 'legacy'}], usage: {credits: 1}})});
  e.values.tavilyKey = 'local';
  assert.equal((await e.HR.web.search({query: 'x'}, {})).results[0].snippet, 'legacy');
  assert.equal(e.requests[0].options.headers.Authorization, 'Bearer local');
});

// Real H134c + fake transport checks conversions, not just the bridge stubs.
test('actual HubAPI OpenAI wire: images, tool ids/results, thinking, usage and split tools', async () => {
  const e = env({real: true, services: [{id: 'svc_groq123', label: 'Groq', type: 'openai', endpoint: 'https://api.groq.com/openai/v1', key: 'fake-key'}], fetcher: () => new Response([
    {choices: [{delta: {content: 'answer', reasoning_content: 'reason', tool_calls: [{index: 0, id: 'new', function: {name: 'clock', arguments: '{"x":'}}]}}]},
    {choices: [{delta: {tool_calls: [{index: 0, function: {arguments: '1}'}}]}, finish_reason: 'tool_calls'}], usage: {prompt_tokens: 7, completion_tokens: 3}}
  ].map(j => 'data: ' + JSON.stringify(j) + '\n\n').join('') + 'data: [DONE]\n\n')});
  const o = options(cfg('groq', 'https://api.groq.com/openai/v1', 'fake-key')); let delta;
  o.onDelta = (...d) => {delta = d;};
  o.messages.push({role: 'assistant', content: '', tool_calls: [{id: 'old', function: {name: 'clock', arguments: {}}}]}, {role: 'tool', tool_call_id: 'old', tool_name: 'clock', content: 'time'});
  const r = await e.adapters.groq.chat(o), b = e.requests[0].body;
  assert.equal(b.stream, true); assert.equal(b.stream_options.include_usage, true);
  assert.equal(b.messages[0].content[1].image_url.url, 'data:image/jpeg;base64,aGVsbG8=');
  assert.equal(b.messages[1].tool_calls[0].id, 'old'); assert.equal(b.messages[2].tool_call_id, 'old');
  assert.deepEqual(delta, ['answer', 'reason']); assert.equal(r.eval_count, 3); assert.equal(r.prompt_eval_count, 7);
  assert.equal(r.tool_calls[0].function.arguments.x, 1); assert.equal(r.done_reason, 'tool_calls');
});
test('actual HubAPI Gemini wire: photos, thinking=false, function signature/results and usage', async () => {
  const e = env({real: true, hub: {gemini: 'fake-key'}, fetcher: () => sse({
    candidates: [{content: {parts: [{text: 'thought', thought: true}, {functionCall: {id: 'new', name: 'clock', args: {x: 1}}, thoughtSignature: 'new-sig'}]}, finishReason: 'STOP'}],
    usageMetadata: {promptTokenCount: 4, candidatesTokenCount: 2, thoughtsTokenCount: 1}
  })});
  const o = options(cfg('gemini', 'https://generativelanguage.googleapis.com/v1beta', 'fake-key'));
  o.messages.unshift({role: 'system', content: 'system'});
  o.messages.push({role: 'assistant', content: '', tool_calls: [{id: 'old', function: {name: 'clock', arguments: {}}, thoughtSignature: 'old-sig'}]}, {role: 'tool', tool_call_id: 'old', tool_name: 'clock', content: 'time'});
  const r = await e.adapters.gemini.chat(o), b = e.requests[0].body;
  assert.equal(b.systemInstruction.parts[0].text, 'system');
  assert.equal(b.generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.equal(b.contents[0].parts[1].inlineData.data, 'aGVsbG8=');
  assert.equal(b.contents[1].parts[0].thoughtSignature, 'old-sig');
  assert.equal(b.contents[2].parts[0].functionResponse.id, 'old');
  assert.equal(r.tool_calls[0].thoughtSignature, 'new-sig'); assert.equal(r.eval_count, 3); assert.equal(r.thinking, 'thought');
});
test('actual HubAPI Ollama stream keeps final performance stats and model lists', async () => {
  const e = env({real: true, hub: {ollama_url: 'http://hub.test'}, fetcher: url => url.endsWith('/api/tags') ? json({models: [{name: 'm', size: 1, details: {parameter_size: '3B'}}]}) : new Response([
    {message: {content: 'ok', thinking: 'why', tool_calls: [{function: {name: 'clock', arguments: {}}}]}},
    {done: true, eval_count: 5, prompt_eval_count: 2, eval_duration: 1e9, total_duration: 2e9, done_reason: 'stop'}
  ].map(JSON.stringify).join('\n') + '\n')});
  const c = cfg('ollama', 'http://hub.test'), r = await e.adapters.ollama.chat(options(c));
  assert.equal(e.requests[0].body.think, false); assert.equal(r.eval_count, 5); assert.equal(r.eval_duration, 1e9);
  assert.equal(r.total_duration, 2e9); assert.equal(r.tool_calls[0].function.name, 'clock');
  assert.match((await e.adapters.ollama.models(c))[0].label, /3B/);
});
test('actual HubAPI model conversions and HTTP error card compatibility', async () => {
  const e = env({real: true, hub: {gemini: 'fake', tavily: 'fake'}, fetcher: url => url.includes('tavily') ? json({}, 432) : json({models: [
    {name: 'models/g', displayName: 'Gem', inputTokenLimit: 8192, supportedGenerationMethods: ['generateContent']},
    {name: 'models/embed', supportedGenerationMethods: ['embedContent']}
  ]})});
  const list = await e.adapters.gemini.models(cfg('gemini', 'https://generativelanguage.googleapis.com/v1beta', 'fake'));
  assert.equal(list.length, 1); assert.equal(list[0].name, 'g'); assert.equal(list[0].ctx, 8192);
  await assert.rejects(e.HR.web.search({query: 'x'}, {}), /credits used up/); assert.equal(e.cards.length, 1);
});

for (const think of [true, undefined]) {
  test('actual HubAPI Gemini thinking=' + think + ' preserves On/Auto', async () => {
    const e = env({real: true, hub: {gemini: 'fake'}, fetcher: () => sse({candidates: []})});
    const o = options(cfg('gemini', 'https://generativelanguage.googleapis.com/v1beta', 'fake')); o.think = think;
    await e.adapters.gemini.chat(o);
    const b = e.requests[0].body;
    if (think) assert.equal(b.generationConfig.thinkingConfig.includeThoughts, true);
    else assert.equal(b.generationConfig, undefined);
    assert.equal(typeof e.adapters.gemini.toG, 'function');
  });
}
test('actual HubAPI custom model list keeps key, endpoint and context, sorted', async () => {
  const e = env({real: true, fetcher: () => json({data: [{id: 'z', context_length: 123}, {id: 'a', context_window: 456}]})});
  const list = await e.adapters.custom.models(cfg('custom', 'http://local.test/v1', 'local-key'));
  assert.equal(e.requests[0].url, 'http://local.test/v1/models');
  assert.equal(e.requests[0].options.headers.Authorization, 'Bearer local-key');
  assert.deepEqual(plain(list).map(m => [m.name, m.ctx]), [['a', 456], ['z', 123]]);
  assert.equal(typeof e.adapters.custom.toOA, 'function');
});
test('actual HubAPI web success preserves transport body, fallback credits and extract trimming', async () => {
  const e = env({real: true, hub: {tavily: 'fake'}, fetcher: url => url.endsWith('/search')
    ? json({results: [{title: 'T', url: 'https://x', content: 'snippet'}]})
    : json({results: [{url: 'https://x', raw_content: 'a'.repeat(9001)}], usage: {credits: 0.5}})});
  e.values.webDepth = 'advanced';
  assert.equal((await e.HR.web.search({query: 'x', max_results: 2}, {})).results[0].snippet, 'snippet');
  assert.equal(e.requests[0].body.search_depth, 'advanced'); assert.equal(e.requests[0].body.max_results, 2);
  assert.match(await e.HR.web.extract({url: 'https://x'}, {}), /trimmed, 9001 chars total/);
  assert.deepEqual(e.credits, [['tavily', 2], ['tavily', 0.5]]);
});
test('actual HubAPI provider HTTP errors preserve kind/status with secrets masked', async () => {
  const e = env({real: true, fetcher: () => json({error: {message: 'bad model key private-test-key'}}, 404)});
  await assert.rejects(e.adapters.custom.chat(options(cfg('custom', 'http://local.test/v1', 'private-test-key'))), x => {
    assert.equal(x.kind, 'http'); assert.equal(x.status, 404);
    assert.match(x.message, /bad model/); assert.doesNotMatch(x.message, /private-test-key/); return true;
  });
  assert.equal(e.requests.length, 1);
});
test('actual HubAPI cancellation propagates Stop without direct retry', async () => {
  const e = env({real: true, fetcher: () => {throw new DOMException('stopped', 'AbortError');}});
  const o = options(cfg('custom', 'http://local.test/v1'));
  const controller = new AbortController(); controller.abort(); o.signal = controller.signal;
  await assert.rejects(e.adapters.custom.chat(o), x => x.kind === 'abort');
  assert.equal(e.requests.length, 1);
});

test('actual key loader reads only three permitted slots; services events refresh subscribers', async () => {
  const e = env({hub: {gemini: 'fake', tavily: 'fake', ollama_url: 'http://local.test'},
    services: [{id: 'svc_groq123', label: 'Groq', type: 'openai', endpoint: 'https://api.groq.com/openai/v1'}]});
  let changed = 0; e.HR.hubKeys.onChange(() => changed++);
  await e.HR.hubKeys.load(); await e.HR.hubKeys.load();
  assert.deepEqual([...new Set(e.keyReads)].sort(), ['gemini', 'ollama_url', 'tavily']);
  assert.equal(e.listeners.length, 1); e.listeners[0]({id: 'svc_groq123'}); assert.equal(changed, 1);
  e.HR.hubKeys.open('company-that-is-not-a-slot'); assert.deepEqual(e.opened, ['']);
  e.HR.hubKeys.open('svc_groq123'); e.HR.hubKeys.open('gemini');
  assert.deepEqual(e.opened, ['', 'svc_groq123', 'gemini']);
});
test('Custom never inherits Hub base; matches visible services by normalized explicit endpoint', () => {
  const e = env({services: [{id: 'svc_local123', label: 'My inference server', type: 'openai', endpoint: 'http://local.test/v1///'}]});
  assert.equal(e.HR.models.base('custom'), ''); assert.equal(e.HR.models.service('custom', ''), null);
  e.values.customBase = 'http://local.test/v1/'; e.values.provider = 'custom';
  assert.equal(e.HR.models.cfg().service, 'svc_local123'); assert.equal(e.HR.models.cfg().key, '');
  assert.equal(e.HR.models.hubName('custom', e.values.customBase), 'svc_local123');
});
test('generic Add provider row opens provider root; matching service opens visible row', () => {
  const e = env({hub: {gemini: 'fake'}}); e.values.provider = 'groq';
  const nodes = {};
  function el() {return {children: [], append(...x) {this.children.push(...x);}, set innerHTML(x) {this.children = [];}};}
  e.c.document = {getElementById: id => nodes[id] || (nodes[id] = el()), createElement: el, querySelectorAll: () => []};
  vm.runInContext(read('app/gui/hubrows.js'), e.c);
  e.HR.hubRows.paint(); let row = nodes.hubModelLine;
  assert.equal(row.hidden, false); assert.equal(row.children[1].textContent, 'Add provider');
  row.children[1].onclick(); assert.equal(e.opened.pop(), '');
  e.services.push({id: 'svc_groq123', label: 'gRoQ', type: 'openai', endpoint: e.HR.models.base('groq')});
  e.w.top.HubProviders = e.providers; e.HR.hubRows.paint();
  row.children[1].onclick(); assert.equal(e.opened.pop(), 'svc_groq123');
});
for (const id of ['openrouter', 'deepinfra']) {
  test(id + ' images never access service secrets; own local image key still works', async () => {
    const endpoint = id === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.deepinfra.com/v1/openai';
    const e = env({services: [{id: 'svc_image123', label: id, type: 'openai', endpoint, key: 'service-secret'}], fetcher: url => {
      if (url.startsWith('data:')) return new Response('image bytes', {headers: {'Content-Type': 'image/png'}});
      return json(id === 'openrouter' ? {choices: [{message: {images: [{image_url: {url: 'data:image/png;base64,aGVsbG8='}}]}}]}
        : {images: ['aGVsbG8=']});
    }});
    e.w.HR = e.HR;
    vm.runInContext(read('app/models/img_' + id + '.js'), e.c);
    const image = e.HR.imgProviders[id];
    assert.equal(image.ready(), false); // No image API in this older-Hub fixture.
    await assert.rejects(image.generate({model: 'image', prompt: 'x'}), x => x.kind === 'nokey');
    assert.equal(e.requests.length, 0);
    e.HR.models.setKey(id, endpoint, 'local-image-key'); assert.equal(image.ready(), true);
    const out = await image.generate({model: 'image', prompt: 'x', width: 512, height: 768, steps: 4, ratio: '2:3'});
    assert.ok(out.blob); assert.equal(e.requests[0].options.headers.Authorization, 'Bearer local-image-key');
    if (id === 'deepinfra') assert.equal(e.requests[0].body.num_inference_steps, 4);
    else assert.equal(e.requests[0].body.image_config.aspect_ratio, '2:3');
  });
}
test('runtime source has no retired base/key slots or provider secret/storage reads', () => {
  const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(d,e.name)) : [path.join(d,e.name)]);
  const code = walk(path.join(base, 'app')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(f,'utf8')).join('\n');
  assert.doesNotMatch(code, /openai_(?:base|key)|\.secret\s*\(|sites-hub\.providers|forProvider|pr\.hub/);
  assert.deepEqual(plain(env().HR.hubKeys.NAMES), ['tavily', 'gemini', 'ollama_url']);
  assert.match(read('app/gui/model.js'), /!c\.key && !c\.service/);
});

function imageEnv(id, extra = {}) {
  const endpoint = id === 'deepinfra' ? 'https://api.deepinfra.com/v1/openai' : 'https://openrouter.ai/api/v1';
  const e = env(Object.assign(id === 'gemini' ? {hub: {gemini: 'fake-image-key'}}
    : {services: [{id: 'svc_image123', label: id.toUpperCase(), type: 'openai', endpoint: endpoint + '/', key: 'fake-image-key'}]}, extra));
  e.w.HR = e.HR;
  vm.runInContext(read('app/models/img_' + id + '.js'), e.c);
  e.image = e.HR.imgProviders[id]; return e;
}
for (const id of ['gemini', 'deepinfra', 'openrouter']) {
  test(id + ' image bridge uses correct id, passes every input, preserves Blob result and metadata', async () => {
    const calls = [], result = {blob: new Blob(['hello'], {type: 'image/png'})};
    const list = [{name: 'image', label: 'Friendly image', price: '1¢', steps: {min: 1, max: 30, default: 12}, size: 'px', multiple: 64, max: 1536}];
    const e = imageEnv(id, {api: {generateImage: async o => {calls.push(o); return result;},
      imageModels: async o => {calls.push(o); return list;}, imageCapabilities: () => {throw new Error('must use cached metadata');}}});
    assert.equal(e.image.ready(), true);
    const o = {model: 'image', prompt: 'draw', width: 512, height: 768, ratio: '2:3', steps: 12, signal: new AbortController().signal};
    assert.equal(await e.image.models({signal:o.signal}), list);
    assert.equal(calls[0].signal, o.signal);
    assert.equal((await e.image.capabilities('image')).label, 'Friendly image');
    if (id === 'deepinfra') {assert.equal(e.image.steps.max('image'), 30); assert.equal(e.image.steps.def('image'), 12);}
    assert.equal(await e.image.generate(o), result);
    const sent = calls[1]; assert.equal(sent.provider, id === 'gemini' ? 'gemini' : 'svc_image123');
    for (const k of Object.keys(o)) assert.equal(sent[k], o[k]);
    assert.equal(sent.key, undefined); assert.equal(e.requests.length, 0);
    if (id === 'gemini' || id === 'openrouter') assert.equal(e.image.size, 'ratio');
  });
}
test('uncached imageCapabilities uses svc id and feeds DeepInfra default/max controls', async () => {
  let sent;
  const e = imageEnv('deepinfra', {api: {imageModels: async () => [], imageCapabilities: async o => {
    sent = o; return {name: o.model, steps: {min: 1, max: 10, default: 4}, size: 'px', multiple: 64, max: 1536};
  }}});
  const signal = new AbortController().signal;
  await e.image.capabilities('custom-image', signal);
  assert.equal(sent.provider, 'svc_image123'); assert.equal(sent.signal, signal);
  assert.equal(e.image.steps.def('custom-image'), 4); assert.equal(e.image.steps.max('custom-image'), 10);
});
for (const [kind, status, expected] of [['key', 401, 'nokey'], ['key', 403, 'nokey'], ['http',402,'nocredit'],
  ['http',429,'quota'], ['http',500,'http'], ['noimage',undefined,'noimage'], ['unreachable',undefined,'unreachable'], ['abort',undefined,'abort']]) {
  test('image errors ' + kind + '/' + status + ' map to ' + expected + ', keep settings callback, never retry', async () => {
    let calls = 0; const openSettings = () => {};
    const error = Object.assign(new Error('friendly provider message'), {kind, status, openSettings, keyName:'svc_image123'});
    const fail = async () => {calls++; throw error;};
    const e = imageEnv('deepinfra', {api: {generateImage: fail, imageModels: fail, imageCapabilities: fail}});
    for (const fn of [() => e.image.generate({model:'image',prompt:'draw'}), () => e.image.models(), () => e.image.capabilities('image')]) {
      await assert.rejects(fn(), x => x.kind === expected && x.status === status && x.openSettings === openSettings && x.message === error.message);
    }
    assert.equal(calls, 3); assert.equal(e.requests.length, 0);
  });
}
test('image AbortError name maps even when provider omits kind', async () => {
  const e = imageEnv('gemini', {api: {generateImage: async () => {throw new DOMException('Stopped','AbortError');}}});
  await assert.rejects(e.image.generate({model:'image',prompt:'draw'}), x => x.kind === 'abort');
});
for (const mode of ['standalone', 'unmatched']) {
  test('Gemini ' + mode + ' retains local-key image adapter', async () => {
    const e = imageEnv('gemini', {hub:{}, services:[], api: mode === 'unmatched' ? {generateImage: () => {throw new Error('must not route');}} : undefined,
      fetcher: url => url.startsWith('data:') ? new Response('image') : json({predictions:[{bytesBase64Encoded:'aGVsbG8=',mimeType:'image/png'}]})});
    e.HR.models.setKey('gemini', e.HR.models.base('gemini'), 'local');
    const out = await e.image.generate({model:'imagen-3',prompt:'draw',ratio:'16:9'});
    assert.ok(out.blob); assert.equal(e.requests[0].options.headers['x-goog-api-key'], 'local');
    assert.equal(e.requests[0].body.parameters.aspectRatio,'16:9');
  });
}

test('real H134f DeepInfra list preserves prices/defaults and generation size/steps/Blob', async () => {
  const e = imageEnv('deepinfra', {real:true, fetcher: url => url.endsWith('/models/list')
    ? json([{model_name:'custom-model',type:'text-to-image',default_iterations:17,pricing:{short:'$0.01'}}])
    : json({images:['aGVsbG8=']})});
  const list = await e.image.models(); assert.equal(list[0].price,'$0.01');
  assert.equal(e.image.steps.def('custom-model'),17); assert.equal(e.image.steps.max('custom-model'),50);
  const out = await e.image.generate({model:'custom-model',prompt:'draw',width:512,height:768,steps:17,ratio:'2:3'});
  assert.equal(await out.blob.text(),'hello'); assert.equal(out.blob.type,'image/png');
  assert.equal(e.requests[1].body.num_inference_steps,17); assert.equal(e.requests[1].body.height,768);
});
test('real H134f DeepInfra native unsupported fallback stays inside Hub only', async () => {
  const e = imageEnv('deepinfra', {real:true, fetcher: url => url.includes('/inference/') ? json({error:'unsupported'},404) : json({data:[{b64_json:'aGVsbG8='}]})});
  assert.equal(await (await e.image.generate({model:'image',prompt:'draw',width:512,height:768})).blob.text(),'hello');
  assert.equal(e.requests.length,2); assert.equal(e.requests[1].body.size,'512x768');
});
test('real H134f OpenRouter labels/prices/filtering/ratio and data URL Blob', async () => {
  const e = imageEnv('openrouter', {real:true, fetcher: url => url.endsWith('/models')
    ? json({data:[{id:'image',name:'Pretty',architecture:{output_modalities:['image']},pricing:{completion:'0.000001'}},{id:'text',architecture:{output_modalities:['text']}}]})
    : json({choices:[{message:{images:[{image_url:{url:'data:image/webp;base64,aGVsbG8='}}]}}]})});
  const list = await e.image.models(); assert.equal(list.length,1); assert.equal(list[0].label,'Pretty'); assert.equal(list[0].price,'$1/M out');
  const out = await e.image.generate({model:'image',prompt:'draw',ratio:'16:9',steps:0});
  assert.equal(out.blob.type,'image/webp'); assert.equal(await out.blob.text(),'hello');
  assert.equal(e.requests[1].body.image_config.aspect_ratio,'16:9');
});
for (const model of ['gemini-2.5-flash-image', 'imagen-3']) {
  test('real H134f Gemini ' + model + ' list and ratio/generation', async () => {
    const e = imageEnv('gemini', {real:true, fetcher: url => url.includes('pageSize') ? json({models:[{name:'models/'+model,supportedGenerationMethods:[model.startsWith('imagen')?'predict':'generateContent']}]})
      : json(model.startsWith('imagen') ? {predictions:[{bytesBase64Encoded:'aGVsbG8=',mimeType:'image/png'}]}
        : {candidates:[{content:{parts:[{inlineData:{data:'aGVsbG8=',mimeType:'image/jpeg'}}]}}]})});
    assert.equal((await e.image.models())[0].name,model);
    const out = await e.image.generate({model,prompt:'draw',ratio:'9:16'});
    assert.equal(await out.blob.text(),'hello');
    const b=e.requests[1].body; assert.equal(model.startsWith('imagen')?b.parameters.aspectRatio:b.generationConfig.imageConfig.aspectRatio,'9:16');
  });
}
for (const status of [401,402,429,500]) {
  test('real H134f HTTP '+status+' reaches Agent friendly image kind without retry', async () => {
    const e=imageEnv('openrouter',{real:true,fetcher:()=>json({error:{message:'provider failed'}},status)});
    await assert.rejects(e.image.generate({model:'image',prompt:'draw'}), x=>x.kind===({401:'nokey',402:'nocredit',429:'quota',500:'http'})[status]);
    assert.equal(e.requests.length,1);
  });
}
test('AG26 Gemini differing Agent-local key overrides Hub for models and generate', async () => {
  let hubCalls = 0;
  const e = imageEnv('gemini', {hub: {gemini: 'hub-key'}, api: {
    generateImage: async () => {hubCalls++; throw new Error('must not use Hub');},
    imageModels: async () => {hubCalls++; throw new Error('must not use Hub');}
  }, fetcher: url => url.includes('pageSize') ? json({models:[{name:'models/imagen-3',supportedGenerationMethods:['predict']}]})
    : url.startsWith('data:') ? new Response('image')
    : json({predictions:[{bytesBase64Encoded:'aGVsbG8=',mimeType:'image/png'}]})});
  e.HR.models.setKey('gemini', e.HR.models.base('gemini'), 'local-key');
  assert.equal(e.image.ready(), true);
  assert.equal((await e.image.models())[0].name, 'imagen-3');
  assert.match(e.requests[0].url, /key=local-key/);
  const out = await e.image.generate({model:'imagen-3',prompt:'draw',ratio:'1:1'});
  assert.ok(out.blob);
  assert.equal(e.requests[1].options.headers['x-goog-api-key'], 'local-key');
  assert.equal(hubCalls, 0);
});
test('AG26 matching Agent-local Gemini key still uses Hub image bridge', async () => {
  let got;
  const e = imageEnv('gemini', {hub: {gemini: 'same-key'}, api: {
    generateImage: async o => {got = o; return {blob: new Blob(['x'])};},
    imageModels: async () => [{name:'image',label:'image'}]
  }});
  e.HR.models.setKey('gemini', e.HR.models.base('gemini'), 'same-key');
  assert.equal((await e.image.models())[0].name, 'image');
  await e.image.generate({model:'image',prompt:'draw',ratio:'1:1'});
  assert.equal(got.provider, 'gemini'); assert.equal(e.requests.length, 0);
});
test('AG26 Hub settingsError shape (no kind, keyName, openSettings) maps to nokey without retry', async () => {
  let calls = 0; const openSettings = () => {};
  // Mirrors hub_api.js settingsError: plain Error + keyName + openSettings, no kind.
  const fail = async () => {calls++; const e = new Error('No Gemini key saved. Add it in Settings > API Keys.'); e.keyName = 'gemini'; e.openSettings = openSettings; throw e;};
  const e = imageEnv('gemini', {api: {generateImage: fail, imageModels: fail}});
  await assert.rejects(e.image.generate({model:'image',prompt:'draw'}), x => x.kind === 'nokey' && x.openSettings === openSettings && x.keyName === 'gemini');
  await assert.rejects(e.image.models(), x => x.kind === 'nokey' && x.openSettings === openSettings);
  assert.equal(calls, 2); assert.equal(e.requests.length, 0);
});
test('AG26 Hub requiredText plain Error maps to input without retry', async () => {
  let calls = 0;
  // Mirrors hub_api.js requiredText: plain Error, message contains "must be", no kind.
  const fail = async () => {calls++; throw new Error('model must be a non-empty string.');};
  const e = imageEnv('deepinfra', {api: {generateImage: fail, imageModels: fail}});
  await assert.rejects(e.image.generate({model:'image',prompt:'draw'}), x => x.kind === 'input' && /must be/.test(x.message));
  await assert.rejects(e.image.models(), x => x.kind === 'input');
  assert.equal(calls, 2); assert.equal(e.requests.length, 0);
});
test('AG26 static SW VER and readme note', () => {
  assert.match(read('agent_sw.js'), /VER = 'agent-ag27'/);
  assert.match(read('agent_readme.md'), /## AG26/);
  assert.match(read('app/core/hubapi.js'), /differing Agent-local key/);
});

test('AG25 static bridge load order, click-only settings action and no stale limitation UI', () => {
  const html=read('image.html'); assert.ok(html.indexOf('app/core/hubapi.js')<html.indexOf('app/models/img_gemini.js'));
  assert.match(read('app/gui/imagepage.js'),/settings.onclick = function \(\) \{ e.openSettings\(\); \}/);
  for (const f of ['app/gui/imagepage.js','app/gui/provider.js','agent_readme.md']) assert.doesNotMatch(read(f),/HubAPI has no image-generation|Hub image generation is not available yet|AG24 implementation concern/);
});

test('real H134f remote image download uses Stop signal and never forwards provider credentials', async () => {
  const signal=new AbortController().signal;
  const e=imageEnv('openrouter',{real:true,fetcher:url=>url==='https://images.test/result.png'
    ? new Response('image bytes',{headers:{'Content-Type':'image/png'}})
    : json({choices:[{message:{images:[{image_url:{url:'https://images.test/result.png'}}]}}]})});
  const out=await e.image.generate({model:'image',prompt:'draw',signal});
  assert.equal(await out.blob.text(),'image bytes');
  assert.equal(e.requests[1].options.signal,signal); assert.equal(e.requests[1].options.headers,undefined);
});
test('real H134f already-cancelled generation stops before paid transport', async () => {
  const e=imageEnv('deepinfra',{real:true}); const c=new AbortController(); c.abort();
  await assert.rejects(e.image.generate({model:'image',prompt:'draw',signal:c.signal}),x=>x.kind==='abort');
  assert.equal(e.requests.length,0);
});
test('real H134f text-only output retains friendly noimage error', async () => {
  const e=imageEnv('gemini',{real:true,fetcher:()=>json({candidates:[{content:{parts:[{text:'no picture'}]}}]})});
  await assert.rejects(e.image.generate({model:'gemini-image',prompt:'draw'}),x=>x.kind==='noimage');
  assert.equal(e.requests.length,1);
});
