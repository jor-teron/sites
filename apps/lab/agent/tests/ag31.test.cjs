/* AG31: offline VM tests for the Assist model (core/assist.js) and answer length (core/length.js).
   Mocked adapters stand in for HubAPI/provider chat; no browser, no network, no paid API calls. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');

function env() {
  const store = {}, calls = [], usage = [];
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const mk = (id, reply) => ({ id, label: id, models: async () => [{ name: id + '-m1' }, { name: id + '-m2' }],
    chat: async o => { calls.push({ id, model: o.model, cfg: o.cfg, messages: o.messages, tools: o.tools, signal: o.signal });
      if (o.signal && o.signal.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
      if (reply instanceof Error) throw reply; o.onDelta(reply, ''); return { prompt_eval_count: 11, eval_count: 3 }; } });
  const ctx = { localStorage, console, document: { querySelector: () => null }, matchMedia: () => ({ matches: true }) };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext('window.HR = {};', ctx);
  vm.runInContext(read('app/gui/settings.js'), ctx);
  const regs = { ollama: mk('ollama', 'summary text'), openrouter: mk('openrouter', 'urgent'), bad: mk('bad', Object.assign(new Error('HTTP 500'), { kind: 'http' })), browser: mk('browser', 'x') };
  ctx.HR.models = { all: () => Object.values(regs), ready: p => p !== 'unset', base: p => 'https://' + p, service: () => null, getKey: p => 'k-' + p,
    setChat: () => { throw new Error('assist must not change the main chat'); } };
  ctx.HR.usage = { record: (...a) => usage.push(a) };
  vm.runInContext(read('app/core/length.js'), ctx);
  vm.runInContext(read('app/core/assist.js'), ctx);
  return { HR: ctx.HR, store, calls, usage };
}

test('syntax', () => { for (const f of ['app/core/length.js', 'app/core/assist.js', 'app/gui/assistset.js', 'app/gui/chat.js', 'app/gui/settings.js', 'app/main.js', 'agent_sw.js']) require('node:child_process').execFileSync(process.execPath, ['--check', path.join(base, f)]); });

test('Off by default: rejects, no model call, no fallback to the main model', async () => {
  const { HR, calls } = env(); HR.set.put('provider', 'ollama'); HR.set.put('model', 'main-model');
  await assert.rejects(HR.assist.ask({ prompt: 'hi' }), e => e.kind === 'off');
  HR.set.put('assistProvider', 'openrouter');
  await assert.rejects(HR.assist.ask({ prompt: 'hi' }), e => e.kind === 'nomodel');
  assert.equal(calls.length, 0);
});

test('uses the chosen provider + model, no tools, main settings untouched, usage recorded', async () => {
  const { HR, calls, usage } = env(); HR.set.put('provider', 'ollama'); HR.set.put('model', 'main-model');
  HR.set.put('assistProvider', 'openrouter'); HR.set.put('assistModel', 'openrouter-m2');
  const r = await HR.assist.ask({ system: 'Summarise', prompt: 'long text' });
  assert.equal(r.text, 'urgent'); assert.equal(calls.length, 1);
  assert.equal(calls[0].id, 'openrouter'); assert.equal(calls[0].model, 'openrouter-m2'); assert.equal(calls[0].cfg.key, 'k-openrouter');
  assert.equal(calls[0].tools.length, 0); assert.equal(calls[0].messages[0].role, 'system');
  assert.equal(HR.set.get('provider'), 'ollama'); assert.equal(HR.set.get('model'), 'main-model');
  assert.deepEqual(usage[0].slice(0, 4), ['openrouter', 'openrouter-m2', 11, 3]);
  const c = await HR.assist.classify('server down', ['urgent', 'normal']); assert.equal(c.label, 'urgent');
});

test('failure and not-set-up providers reject without trying another model', async () => {
  const { HR, calls } = env();
  HR.set.put('assistProvider', 'bad'); HR.set.put('assistModel', 'x');
  await assert.rejects(HR.assist.ask({ prompt: 'a' }), /HTTP 500/); assert.equal(calls.length, 1);
  HR.set.put('assistProvider', 'unset'); await assert.rejects(HR.assist.ask({ prompt: 'a' }), e => e.kind === 'notready');
  HR.set.put('assistProvider', 'browser'); await assert.rejects(HR.assist.ask({ prompt: 'a' }), e => e.kind === 'notready');
  assert.equal(calls.length, 1);
  assert.ok(!HR.assist.choices().some(a => a.id === 'browser'));
});

test('Stop: abort rejects as abort', async () => {
  const { HR, calls } = env(); HR.set.put('assistProvider', 'ollama'); HR.set.put('assistModel', 'ollama-m1');
  const c = new AbortController(); c.abort();
  await assert.rejects(HR.assist.ask({ prompt: 'a', signal: c.signal }), e => e.kind === 'abort'); assert.equal(calls.length, 0);
});

test('answer length: Normal adds nothing, Short/Detailed reach the system prompt, saved in agent.settings', () => {
  const { HR, store } = env();
  assert.equal(HR.length.get(), 'normal'); assert.equal(HR.length.addTo('SYS'), 'SYS');
  HR.set.put('answerLength', 'short'); assert.match(HR.length.addTo('SYS'), /^SYS\n\nAnswer length: Short[\s\S]*complete/);
  HR.set.put('answerLength', 'detailed'); assert.match(HR.length.addTo(''), /Detailed/);
  assert.equal(JSON.parse(store['agent.settings']).answerLength, 'detailed');
  HR.set.put('answerLength', 'weird'); assert.equal(HR.length.get(), 'normal');
});

test('loop path: chat.js system() runs addTo, so every loop step (tool follow-ups too) carries it', () => {
  assert.match(read('app/gui/chat.js'), /system: function \(\) \{ return HR\.prompt\.system\(\)\.then\(HR\.length\.addTo\)/);
  assert.match(read('app/core/loop.js'), /var sys = o\.system \? await o\.system\(\) : ''/);
  const html = read('agent.html');
  for (const f of ['app/core/length.js', 'app/core/assist.js', 'app/gui/assistset.js']) assert.ok(html.includes('src="' + f + '"'));
  assert.match(read('agent_sw.js'), /VER = 'agent-ag3[1-9]'/);
});
