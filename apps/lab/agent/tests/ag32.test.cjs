/* AG32: offline VM tests for rolling summaries (core/summary.js, messages.toApi, threads.js sidecar).
   Real storage/threads.js over a mocked folder (HR.fs); mocked Assist adapter; no network, no paid calls. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const base = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');
const tick = () => new Promise(r => setImmediate(r));

function env(opts = {}) {
  const store = {}, calls = [], folder = opts.folder || {};
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
  ctx.HR.fs = { ready: () => true, state: () => 'ready', read: async p => { if (!(p in folder)) { const e = new Error('nf'); e.name = 'NotFoundError'; throw e; } return { text: folder[p] }; },
    write: async (p, t) => { if (opts.writeFail) throw new Error('permission denied'); folder[p] = t; },
    remove: async p => { if (!(p in folder)) { const e = new Error('nf'); e.name = 'NotFoundError'; throw e; } delete folder[p]; } };
  const chat = { id: 'c1' }; ctx.HR.chats = { id: () => chat.id, dirty: () => {} };
  for (const f of ['app/storage/threads.js', 'app/core/length.js', 'app/core/assist.js', 'app/core/messages.js', 'app/core/summary.js']) vm.runInContext(read(f), ctx);
  if (!opts.off) { ctx.HR.set.put('assistProvider', 'ollama'); ctx.HR.set.put('assistModel', 'helper-m'); }
  return { HR: ctx.HR, store, calls, chat, folder, release: () => gate && gate() };
}
async function ready(e, id = 'c1') { e.chat.id = id; await e.HR.summary.open(id); }
function longChat(HR, turns = 12, extra) {
  const l = [];
  for (let i = 0; i < turns; i++) {
    l.push({ role: 'user', content: 'question ' + i + ' ' + 'u'.repeat(800) + ' TAILU' + i });
    if (i % 3 === 0) { l.push({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_file', arguments: { path: 'f' + i + '.txt' } } }] }); l.push({ role: 'tool', tool_name: 'read_file', content: 'file ' + i + ' ' + 'r'.repeat(700) + ' TAILR' + i }); }
    l.push({ role: 'assistant', content: 'answer ' + i + ' ' + 'a'.repeat(800) + ' TAILA' + i });
  }
  if (extra) extra(l);
  HR.msgs.set(l); return l;
}
const json = x => JSON.stringify(x);
const SUM = 'agent/chats/threads/c1.sum.json';

test('syntax', () => { for (const f of ['app/core/summary.js', 'app/gui/summaryview.js', 'app/storage/threads.js', 'app/core/messages.js', 'app/gui/chat.js', 'app/gui/chats.js', 'app/gui/assistset.js', 'app/main.js', 'agent_sw.js']) require('node:child_process').execFileSync(process.execPath, ['--check', path.join(base, f)]); });

test('no summary: toApi is the AG31 trimmed note', async () => {
  const e = env({ off: true }); await ready(e); longChat(e.HR);
  const a = e.HR.msgs.toApi(); assert.match(a[0].content, /^Earlier in this chat \(trimmed/); assert.equal(a.filter(m => m.role === 'system').length, 1);
});

test('one bounded call; every covered message is sent in full (tail sentinels, tool args); saved in the chat folder; originals intact', async () => {
  const e = env(); await ready(e); const l = longChat(e.HR); const before = json(l);
  assert.equal(await e.HR.summary.maybe(), true); assert.equal(e.calls.length, 1); assert.equal(e.calls[0].tools.length, 0);
  const sent = e.calls[0].messages[1].content; assert.ok(sent.length <= e.HR.summary.CHUNK + 400);
  const rec = JSON.parse(e.folder[SUM]); const p = e.HR.msgs.parts();
  assert.ok(rec.n > 0 && rec.n <= p.from); assert.equal(p.arr[rec.n].role, 'user');
  for (let i = 0; i < rec.n; i++) { const m = p.arr[i]; const tail = (m.content.match(/TAIL[URA]\d+/) || [])[0]; if (tail) assert.ok(sent.includes(tail), 'covered tail ' + tail + ' missing'); }
  assert.match(sent, /\[called read_file \{"path":"f0\.txt"\}\]/);
  assert.equal(json(e.HR.msgs.all()), before);
  const a = e.HR.msgs.toApi(); assert.match(a[0].content, /^Summary of earlier turns[\s\S]*context only[\s\S]*SUMMARY#1/);
  assert.equal(json(a.slice(-(p.arr.length - p.from))), json(p.arr.slice(p.from)));
  let n = 1; while (await e.HR.summary.maybe()) assert.ok(++n < 10);   /* rest of the older part, one call each */
  assert.equal(await e.HR.summary.maybe(), false); assert.equal(e.calls.length, n);   /* reuse: nothing new, no call */
});

test('oversized single group: sent in parts, coverage only after the last part, tail present', async () => {
  const e = env(); await ready(e);
  longChat(e.HR, 10, l => { l[0].content = 'huge ' + 'h'.repeat(30000) + ' HUGETAIL'; });
  const total = e.HR.summary.ser(e.HR.msgs.parts().arr[0]).length; let steps = 0;
  while (true) { assert.equal(await e.HR.summary.maybe(), true); steps++; const r = JSON.parse(e.folder[SUM]); if (!r.part) break; assert.equal(r.n, 0); assert.equal(e.HR.summary.state().ok, false); }
  assert.ok(total > 2 * e.HR.summary.CHUNK && steps >= 3);
  assert.ok(e.calls.some(c => c.messages[1].content.includes('HUGETAIL')));
  const r = JSON.parse(e.folder[SUM]); assert.ok(r.n >= 1); assert.match(e.calls[1].messages[1].content, /Previous summary:\nSUMMARY#1/);
});

test('incremental: previous summary + only new old turns', async () => {
  const e = env(); await ready(e); const l = longChat(e.HR, 20); await e.HR.summary.maybe();
  const n1 = JSON.parse(e.folder[SUM]).n;
  for (let i = 0; i < 8; i++) { l.push({ role: 'user', content: 'more ' + i + 'x'.repeat(900) }); l.push({ role: 'assistant', content: 'ok ' + 'y'.repeat(900) }); }
  assert.equal(await e.HR.summary.maybe(), true);
  assert.match(e.calls[1].messages[1].content, /Previous summary:\nSUMMARY#1/);
  assert.ok(!e.calls[1].messages[1].content.includes('TAILU0'));
  assert.ok(JSON.parse(e.folder[SUM]).n > n1);
});

test('reload from the folder, edit + reset persist, delete removes the sidecar', async () => {
  const e1 = env(); await ready(e1); longChat(e1.HR); await e1.HR.summary.edit('My own summary');
  assert.equal(JSON.parse(e1.folder[SUM]).edited, true);
  const e2 = env({ folder: e1.folder }); longChat(e2.HR); await ready(e2);
  assert.match(e2.HR.msgs.toApi()[0].content, /My own summary/); assert.equal(e2.HR.summary.state().where, 'folder');
  await e2.HR.summary.reset(); assert.equal(e1.folder[SUM], undefined); assert.equal(e2.HR.msgs.all().length > 0, true);
  await e2.HR.summary.edit('again'); assert.ok(e1.folder[SUM]);
  e2.folder['agent/chats/threads/index.json'] = JSON.stringify({ v: 1, chats: [{ id: 'c1' }] });
  await e2.HR.threads.remove('c1'); assert.equal(e1.folder[SUM], undefined);
});

test('edit of an early turn makes it stale (ignored)', async () => {
  const e = env(); await ready(e); const l = longChat(e.HR); await e.HR.summary.maybe();
  l[0].content = 'changed'; assert.equal(e.HR.summary.state().ok, false); assert.match(e.HR.msgs.toApi()[0].content, /^Earlier in this chat/);
});

test('switch during a run: result discarded, no cross-chat record, old summary kept; late load ignored', async () => {
  const e = env({ hold: true }); await ready(e); longChat(e.HR); await e.HR.summary.edit('old one');
  const p = e.HR.summary.now(); await tick();
  e.chat.id = 'c2'; e.HR.summary.cancel(); await e.HR.summary.open('c2'); e.release(); assert.equal(await p, false);
  assert.equal(e.folder['agent/chats/threads/c2.sum.json'], undefined); assert.equal(JSON.parse(e.folder[SUM]).text, 'old one');
  await ready(e, 'c1'); assert.equal(e.HR.summary.state().ok, true);
  const slow = e.HR.summary.open('c1'); e.chat.id = 'c2'; const fast = e.HR.summary.open('c2'); await Promise.all([slow, fast]);
  assert.equal(e.HR.summary.load('c1'), null); assert.equal(e.HR.summary.state().id, 'c2');
});

test('edit/reset while a run is pending wins over the late result', async () => {
  const e = env({ hold: true }); await ready(e); longChat(e.HR);
  const p = e.HR.summary.now(); await tick(); await e.HR.summary.edit('user text'); e.release(); await p;
  assert.equal(JSON.parse(e.folder[SUM]).text, 'user text');
});

test('Off, provider failure and save failure', async () => {
  const off = env({ off: true }); await ready(off); longChat(off.HR); assert.equal(await off.HR.summary.maybe(), false); assert.equal(off.calls.length, 0);
  await off.HR.summary.now(); assert.match(off.HR.summary.state().status, /Off/);
  const bad = env({ fail: true }); await ready(bad); const l = longChat(bad.HR); const b4 = json(l);
  assert.equal(await bad.HR.summary.maybe(), false); assert.equal(bad.calls.length, 1); assert.equal(bad.folder[SUM], undefined);
  assert.match(bad.HR.summary.state().status, /failed/); assert.match(bad.HR.msgs.toApi()[0].content, /^Earlier in this chat/); assert.equal(json(bad.HR.msgs.all()), b4);
  const wf = env({ writeFail: true }); await ready(wf); longChat(wf.HR); await wf.HR.summary.maybe();
  assert.match(wf.HR.summary.state().status, /not saved \(permission denied\); kept for this session only/); assert.equal(wf.HR.summary.state().ok, true);
});

test('old AG32 localStorage record is moved into the folder once', async () => {
  const e = env(); longChat(e.HR); const p = e.HR.msgs.parts();
  e.store['agent.sum.c1'] = JSON.stringify({ v: 1, text: 'legacy', n: 3, hash: e.HR.summary.hashOf(p.arr, 3), edited: true });
  await ready(e); await e.HR.summary.idle(); assert.equal(JSON.parse(e.folder[SUM]).text, 'legacy'); assert.equal(e.store['agent.sum.c1'], undefined);
});

test('wiring', () => {
  const chat = read('app/gui/chat.js'), chats = read('app/gui/chats.js');
  assert.match(chat, /HR\.summary\.maybe\(\)/); assert.match(chat, /ctrl\.abort\(\); if \(HR\.summary\) HR\.summary\.cancel\(\)/);
  assert.match(chats, /HR\.summary\.cancel\(\); HR\.summary\.open\(meta \? meta\.id : ''\)/); assert.match(chats, /HR\.summary\.drop\(c\.id\)/);
  assert.match(read('app/gui/assistset.js'), /HR\.summary\.cancel\(\); HR\.set\.put\('assistProvider'/);
  assert.match(read('app/storage/threads.js'), /\.sum\.json/); assert.match(read('agent_sw.js'), /VER = 'agent-ag32'/);
  assert.doesNotMatch(read('app/core/summary.js'), /LINE = 600/);
});
