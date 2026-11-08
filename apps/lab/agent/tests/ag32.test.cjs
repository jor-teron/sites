/* AG32: offline VM tests for rolling summaries (core/summary.js + messages.toApi). Mocked Assist adapter, no network. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');

function env(opts = {}) {
  const store = {}, calls = [];
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const ctx = { localStorage, console, AbortController, document: { querySelector: () => null }, setTimeout, clearTimeout };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext('window.HR = {};', ctx);
  vm.runInContext(read('app/gui/settings.js'), ctx);
  let gate = null;
  const ad = { id: 'ollama', label: 'Ollama', models: async () => [],
    chat: async o => { calls.push(o); if (opts.fail) throw Object.assign(new Error('HTTP 500'), { kind: 'http' });
      if (opts.hold) await new Promise(r => { gate = r; });
      if (o.signal.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
      o.onDelta('SUMMARY#' + calls.length, ''); return { prompt_eval_count: 5, eval_count: 2 }; } };
  ctx.HR.models = { all: () => [ad], ready: () => true, base: () => 'http://x', service: () => null, getKey: () => '' };
  ctx.HR.usage = { record: () => {} };
  const chat = { id: 'c1' }; ctx.HR.chats = { id: () => chat.id, dirty: () => {} };
  for (const f of ['app/core/length.js', 'app/core/assist.js', 'app/core/messages.js', 'app/core/summary.js']) vm.runInContext(read(f), ctx);
  if (!opts.off) { ctx.HR.set.put('assistProvider', 'ollama'); ctx.HR.set.put('assistModel', 'helper-m'); }
  return { HR: ctx.HR, store, calls, chat, release: () => gate && gate() };
}
function longChat(HR, turns = 12) {
  const l = [];
  for (let i = 0; i < turns; i++) {
    l.push({ role: 'user', content: 'question ' + i + ' ' + 'u'.repeat(800) });
    if (i % 3 === 0) { l.push({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_file', arguments: {} } }] }); l.push({ role: 'tool', tool_name: 'read_file', content: 'file ' + i }); }
    l.push({ role: 'assistant', content: 'answer ' + i + ' ' + 'a'.repeat(800) });
  }
  HR.msgs.set(l); return l;
}
const json = x => JSON.stringify(x);

test('syntax', () => { for (const f of ['app/core/summary.js', 'app/gui/summaryview.js', 'app/core/messages.js', 'app/gui/chat.js', 'app/gui/chats.js', 'app/main.js', 'agent_sw.js']) require('node:child_process').execFileSync(process.execPath, ['--check', path.join(base, f)]); });

test('no summary: toApi is the AG31 trimmed note', () => {
  const { HR } = env({ off: true }); longChat(HR);
  const a = HR.msgs.toApi(); assert.match(a[0].content, /^Earlier in this chat \(trimmed/); assert.equal(a.filter(m => m.role === 'system').length, 1);
});

test('long chat: one bounded Assist call, summary replaces covered turns, originals intact, recent window kept', async () => {
  const { HR, calls, store } = env(); const l = longChat(HR); const before = json(l);
  assert.equal(await HR.summary.maybe(), true); assert.equal(calls.length, 1);
  assert.equal(calls[0].tools.length, 0); assert.ok(calls[0].messages[1].content.length < 14000);
  assert.equal(json(HR.msgs.all()), before);
  const rec = JSON.parse(store['agent.sum.c1']); const p = HR.msgs.parts();
  assert.ok(rec.n > 0 && rec.n <= p.from); assert.equal(p.arr[rec.n] ? p.arr[rec.n].role : 'user', 'user');
  const a = HR.msgs.toApi();
  assert.match(a[0].content, /^Summary of earlier turns[\s\S]*context only[\s\S]*SUMMARY#1/);
  assert.equal(json(a.slice(-(p.arr.length - p.from))), json(p.arr.slice(p.from)));
  assert.ok(!a.some(m => m.role !== 'system' && /question 0 /.test(m.content)));
  // reuse: nothing new old enough -> no second call
  assert.equal(await HR.summary.maybe(), false); assert.equal(calls.length, 1);
});

test('tool call/result pairs never split at the coverage boundary', async () => {
  const { HR, store } = env(); longChat(HR, 20); await HR.summary.maybe();
  const rec = JSON.parse(store['agent.sum.c1']), p = HR.msgs.parts();
  assert.notEqual(p.arr[rec.n].role, 'tool'); assert.equal(p.arr[rec.n].role, 'user');
});

test('incremental: second call gets previous summary + only new old turns', async () => {
  const { HR, calls, store } = env(); const l = longChat(HR, 20); await HR.summary.maybe();
  const n1 = JSON.parse(store['agent.sum.c1']).n;
  for (let i = 0; i < 8; i++) { l.push({ role: 'user', content: 'more ' + i + 'x'.repeat(900) }); l.push({ role: 'assistant', content: 'ok ' + 'y'.repeat(900) }); }
  assert.equal(await HR.summary.maybe(), true);
  assert.match(calls[1].messages[1].content, /Previous summary:\nSUMMARY#1/);
  assert.ok(JSON.parse(store['agent.sum.c1']).n > n1);
});

test('edit of an early turn makes the summary stale (ignored), reset clears it, chat kept', async () => {
  const { HR, store } = env(); const l = longChat(HR); await HR.summary.maybe();
  l[0].content = 'changed'; assert.equal(HR.summary.state().ok, false);
  assert.match(HR.msgs.toApi()[0].content, /^Earlier in this chat/);
  HR.summary.reset(); assert.equal(store['agent.sum.c1'], undefined); assert.equal(HR.msgs.all().length, l.length);
});

test('manual edit saves and persists across reload', async () => {
  const e1 = env(); longChat(e1.HR); e1.HR.summary.edit('My own summary');
  const rec = JSON.parse(e1.store['agent.sum.c1']); assert.equal(rec.edited, true); assert.equal(rec.text, 'My own summary');
  const e2 = env(); Object.assign(e2.store, e1.store); longChat(e2.HR);
  assert.match(e2.HR.msgs.toApi()[0].content, /My own summary/);
});

test('chat isolation and stale-result discard on switch; abort keeps the old summary', async () => {
  const e = env({ hold: true }); longChat(e.HR); e.HR.summary.edit('old one');
  const p = e.HR.summary.now(); await new Promise(r => setImmediate(r));
  e.chat.id = 'c2'; e.HR.summary.cancel(); e.release(); assert.equal(await p, false);
  assert.equal(e.store['agent.sum.c2'], undefined); assert.equal(JSON.parse(e.store['agent.sum.c1']).text, 'old one');
  e.chat.id = 'c1'; assert.equal(e.HR.summary.state().ok, true);
});

test('Off and failure: no save, trimmed history still used, status explains', async () => {
  const off = env({ off: true }); longChat(off.HR); assert.equal(await off.HR.summary.maybe(), false); assert.equal(off.calls.length, 0);
  await off.HR.summary.now(); assert.match(off.HR.summary.state().status, /Off/);
  const bad = env({ fail: true }); longChat(bad.HR); assert.equal(await bad.HR.summary.maybe(), false);
  assert.equal(bad.calls.length, 1); assert.equal(bad.store['agent.sum.c1'], undefined);
  assert.match(bad.HR.summary.state().status, /failed/); assert.match(bad.HR.msgs.toApi()[0].content, /^Earlier in this chat/);
});

test('wiring: chat.js calls maybe once after a run, Stop and chat switch cancel, delete drops', () => {
  assert.match(read('app/gui/chat.js'), /HR\.summary\.maybe\(\)/); assert.match(read('app/gui/chat.js'), /ctrl\.abort\(\); if \(HR\.summary\) HR\.summary\.cancel\(\)/);
  assert.match(read('app/gui/chats.js'), /function show\(\) \{ if \(HR\.summary\) HR\.summary\.cancel\(\)/); assert.match(read('app/gui/chats.js'), /HR\.summary\.drop\(c\.id\)/);
  assert.match(read('agent_sw.js'), /VER = 'agent-ag32'/);
});
