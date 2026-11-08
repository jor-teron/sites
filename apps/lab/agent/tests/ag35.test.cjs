/* AG35: stable prompt prefix. Captures the real requests HR.loop sends through a mocked adapter (no network) and checks
   that the system prompt front stays byte-identical across turns, the memory block is last, the length line sits before it,
   and static edits change the prefix. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');

function env() {
  const store = {}, F = { 'agent/prompts/system.md': 'You are Agent. Be careful.', 'agent/memory/user.md': '# About the user\n\n- likes tea' };
  const localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  const ctx = { localStorage, console, AbortController, TextEncoder, performance: { now: () => 0 }, document: { querySelector: () => null }, fetch: async () => { throw new Error('offline'); }, location: { protocol: 'file:' } };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext('window.HR = {};', ctx);
  const nf = () => Object.assign(new Error('nf'), { name: 'NotFoundError' });
  ctx.HR.fs = { ready: () => true, state: () => 'ready', name: () => 'mock', onChange: () => {},
    stat: async p => p in F ? { exists: true, size: F[p].length } : { exists: false, size: 0 }, read: async p => { if (!(p in F)) throw nf(); return { text: F[p] }; },
    write: async (p, t) => { F[p] = t; }, append: async (p, t) => { F[p] = (F[p] || '') + t; }, remove: async p => { delete F[p]; },
    list: async d => { d = d.replace(/\/?$/, '/'); const l = Object.keys(F).filter(k => k.startsWith(d)).map(k => ({ name: k.slice(d.length).split('/')[0], kind: 'file' })); if (!l.length) throw nf(); return l; } };
  ctx.HR.chats = { id: () => 'c1', dirty: () => {} };
  for (const f of ['app/gui/settings.js', 'app/core/perms.js', 'app/core/tools.js', 'app/core/length.js', 'app/core/memory.js', 'app/core/messages.js', 'app/core/loop.js', 'app/tools/time.js', 'app/tools/memory.js', 'prompts/prompt_fallback.js', 'app/core/prompt.js']) vm.runInContext(read(f), ctx);
  ctx.localStorage.setItem('agent.memMigrated.mock', '1');
  const reqs = []; let script = [];
  const adapter = { id: 'mock', label: 'Mock', chat: async o => { reqs.push(JSON.parse(JSON.stringify({ messages: o.messages, tools: o.tools }))); const r = script.shift() || {}; if (r.content) o.onDelta(r.content, ''); return Object.assign({ prompt_eval_count: 10, eval_count: 2 }, r); } };
  const ui = { modelStart: () => ({ delta: () => {}, done: res => ({ role: 'assistant', content: res.content || '', tool_calls: res.tool_calls }), stopped: () => null, fail: () => {} }),
    toolStart: () => ({ done: () => {}, live: null }), note: () => {}, approve: async () => true };
  async function turn(text, s) {
    script = s || [{ content: 'ok' }]; ctx.HR.msgs.add({ role: 'user', content: text });
    await ctx.HR.loop.run({ adapter, cfg: {}, model: 'm', think: 'auto', signal: new AbortController().signal, maxSteps: 8, useTools: true, system: () => ctx.HR.prompt.system(), ui });
  }
  return { HR: ctx.HR, F, reqs, turn };
}
const sys = r => r.messages[0].role === 'system' ? r.messages[0].content : '';
const memAt = s => s.indexOf('## Memory');

test('syntax', () => { for (const f of ['app/core/prompt.js', 'app/gui/chat.js', 'app/core/length.js', 'agent_sw.js']) require('node:child_process').execFileSync(process.execPath, ['--check', path.join(base, f)]); });

test('system prompt identical across turns and tool follow-ups; tools stay in the same order', async () => {
  const e = env();
  await e.turn('hello');
  await e.turn('what time is it', [{ content: '', tool_calls: [{ id: 't1', function: { name: 'get_time', arguments: {} } }] }, { content: 'noon' }]);
  await e.turn('thanks');
  assert.equal(e.reqs.length, 4);
  const s0 = sys(e.reqs[0]); assert.ok(s0.length > 50);
  for (const r of e.reqs) { assert.equal(sys(r), s0); assert.equal(JSON.stringify(r.tools), JSON.stringify(e.reqs[0].tools)); }
  assert.ok(e.reqs[2].messages.some(m => m.role === 'tool' && m.tool_name === 'get_time'));   /* tool loop intact */
  assert.ok(!/\d{1,2}:\d{2}/.test(s0.replace(/- \d{4}-\d{2}-\d{2} \d{2}:\d{2}/g, '')));   /* no clock in the prompt (memory note stamps aside) */
});

test('memory block is last; a new note only changes the tail', async () => {
  const e = env(); await e.turn('a');
  await e.HR.mem.append('user', 'prefers green tea'); await e.turn('b');
  const a = sys(e.reqs[0]), b = sys(e.reqs[1]), cut = memAt(a);
  assert.ok(cut > 0 && memAt(b) === cut); assert.equal(a.slice(0, cut), b.slice(0, cut)); assert.notEqual(a, b);
  assert.match(b.slice(cut), /green tea/);
});

test('answer length sits before memory; Normal adds nothing (default unchanged); static edits change the prefix', async () => {
  const e = env(); await e.turn('a');
  e.HR.set.put('answerLength', 'short'); await e.turn('b');
  const n = sys(e.reqs[0]), s = sys(e.reqs[1]);
  assert.doesNotMatch(n, /Answer length/); const li = s.indexOf('Answer length: Short'); assert.ok(li > 0 && li < memAt(s));
  e.HR.set.put('answerLength', 'normal'); await e.turn('c'); assert.equal(sys(e.reqs[2]), n);
  e.F['agent/prompts/system.md'] = 'You are Agent v2.'; await e.turn('d'); assert.notEqual(sys(e.reqs[3]).slice(0, 20), n.slice(0, 20));
  e.HR.set.put('allowShell', 'off'); e.HR.set.put('memory', 'off'); await e.turn('e'); assert.doesNotMatch(sys(e.reqs[4]), /## Memory/);
});

test('no folder: settings + length only, no memory', async () => {
  const e = env(); e.HR.fs.ready = () => false; e.HR.set.put('answerLength', 'detailed');
  const t = await e.HR.prompt.system(); assert.match(t, /Answer length: Detailed/); assert.doesNotMatch(t, /## Memory/);
});
