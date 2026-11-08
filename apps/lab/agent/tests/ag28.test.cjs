/* AG28: syntax/static + offline VM smoke for step limit and context size.
   No browser, no network, no paid API calls. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');

const base = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');
function liveSource(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
}
function check(rel) { execFileSync(process.execPath, ['--check', path.join(base, rel)]); }

test('AG28 source keeps the old cap as comments and points the loop at the saved value', () => {
  for (const f of ['app/gui/settings.js', 'app/core/loop.js', 'app/gui/meter.js', 'app/gui/chat.js', 'agent_sw.js']) check(f);
  const settings = read('app/gui/settings.js');
  const liveSettings = liveSource(settings);
  const loop = read('app/core/loop.js');
  const liveLoop = liveSource(loop);
  const html = read('agent.html');
  assert.match(settings, /AG28 Legacy: function maxSteps\(\)/);
  assert.match(settings, /Math\.min\(30/);
  assert.match(settings, /ctxMax default was 8192/);
  assert.match(liveSettings, /maxSteps: 8/);
  assert.match(liveSettings, /ctxMax: 128000/);
  assert.doesNotMatch(liveSettings, /Math\.min\(30/);
  assert.doesNotMatch(liveSettings, /ctxMax: 8192/);
  assert.doesNotMatch(liveSettings, /\|\| 8\)/);
  assert.match(loop, /AG28 Legacy: if \(calls >= o\.maxSteps\)/);
  assert.match(liveLoop, /o\.maxSteps > 0 && calls >= o\.maxSteps/);
  assert.doesNotMatch(liveLoop, /Math\.min\(30/);
  assert.match(liveLoop, /does not support tools/);
  assert.match(read('app/gui/chat.js'), /maxSteps: HR\.set\.maxSteps\(\)/);
  assert.match(read('app/gui/chat.js'), /opts\.maxSteps = 1/);
  assert.match(html, /id="setSteps" class="inp num" type="number" min="0" step="1"/);
  assert.doesNotMatch(html, /max="30"/);
  assert.equal(html.match(/id="setSteps"/g).length, 1);
  assert.equal(html.match(/id="setCtx"/g).length, 1);
  assert.ok(html.indexOf('id="setSteps"') < html.indexOf('id="setCtx"'));
  assert.match(html, /AG28:/);
  assert.match(read('agent_sw.js'), /VER = 'agent-ag28'/);
  assert.match(read('agent_sw.js'), /AG27: VER agent-ag27/);
  assert.match(read('agent_sw.js'), /AG28: VER agent-ag28/);
  assert.match(read('agent_readme.md'), /## AG28 — step limit and context default/);
  assert.match(read('agent_readme.md'), /### Legacy code notes — AG28/);
  assert.match(read('app/gui/meter.js'), /return HR\.set\.ctxMax\(\)/);
});

function element() {
  const node = {
    value: '', hidden: false, disabled: false, textContent: '', title: '', innerHTML: '',
    style: {}, className: '', children: [], attrs: {}, listeners: {}, open: false,
    classList: { on: {}, toggle(name, force) { this.on[name] = !!force; } },
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(ch) { this.children.push(ch); return ch; },
    addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); },
    click() { (this.listeners.click || []).forEach(fn => fn()); },
    showModal() { this.open = true; },
    close() { this.open = false; (this.listeners.close || []).forEach(fn => fn()); }
  };
  node.parentNode = { querySelector: () => null };
  return node;
}
function MutationObserver() {}
MutationObserver.prototype.observe = function () {};
MutationObserver.prototype.disconnect = function () {};

function bootSettings(initial) {
  const store = Object.assign({}, initial || {});
  const localStorage = {
    getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
    setItem: (k, v) => { store[k] = String(v); }
  };
  const ids = {};
  const byId = id => ids[id] || (ids[id] = element());
  const document = {
    body: element(), documentElement: { dataset: {} },
    getElementById: byId, querySelectorAll: () => [], querySelector: () => null,
    createElement: () => element()
  };
  const location = { origin: 'https://hub.example' };
  const window = { document, location, matchMedia: () => ({ matches: true }) };
  const HR = {
    models: { all: () => [] },
    model: { current: () => '', load() {} },
    hubRows: { paint() {} },
    helper: { test() {} }
  };
  const context = vm.createContext({ window, document, localStorage, location, MutationObserver, HR, console, matchMedia: window.matchMedia });
  vm.runInContext(read('app/gui/settings.js'), context, { filename: 'settings.js' });
  HR.set.init();
  return {
    HR, store, ids, context,
    fire(id) { (ids[id].listeners.change || []).forEach(fn => fn()); },
    saved() { return store['agent.settings'] ? JSON.parse(store['agent.settings']) : null; },
    reload() { return bootSettings({ 'agent.settings': store['agent.settings'] }); }
  };
}

test('step limit accepts 99, 999 and 0, rejects bad input, and persists including zero', () => {
  const fresh = bootSettings();
  assert.equal(fresh.HR.set.maxSteps(), 8);
  assert.equal(fresh.saved(), null);
  fresh.ids.setSteps.value = '99'; fresh.fire('setSteps');
  assert.equal(fresh.HR.set.maxSteps(), 99);
  fresh.ids.setSteps.value = '999'; fresh.fire('setSteps');
  assert.equal(fresh.HR.set.maxSteps(), 999);
  assert.equal(fresh.saved().maxSteps, 999);
  fresh.ids.setSteps.value = '0'; fresh.fire('setSteps');
  assert.equal(fresh.HR.set.maxSteps(), 0);
  assert.equal(fresh.saved().maxSteps, 0);
  assert.equal(fresh.ids.setSteps.value, 0);
  for (const bad of ['-1', '-0', '1.5', '99.0', 'NaN', 'Infinity', '', '  ', '+99', '08', '1e2', '9007199254740993']) {
    fresh.ids.setSteps.value = bad; fresh.fire('setSteps');
    assert.equal(fresh.HR.set.maxSteps(), 0, bad);
    assert.equal(fresh.saved().maxSteps, 0, bad);
    assert.equal(fresh.ids.setSteps.value, 0, bad);
  }
  fresh.ids.setSteps.value = '31'; fresh.fire('setSteps');
  assert.equal(fresh.HR.set.maxSteps(), 31);
  fresh.ids.setSteps.value = String(Number.MAX_SAFE_INTEGER); fresh.fire('setSteps');
  assert.equal(fresh.HR.set.maxSteps(), Number.MAX_SAFE_INTEGER);
  const again = fresh.reload();
  assert.equal(again.HR.set.maxSteps(), Number.MAX_SAFE_INTEGER);
  again.ids.setSteps.value = '0'; again.fire('setSteps');
  again.HR.set.put('theme', 'light');
  const third = again.reload();
  assert.equal(third.HR.set.maxSteps(), 0);
  assert.equal(third.HR.set.get('theme'), 'light');
  assert.equal(third.saved().maxSteps, 0);

  const above = bootSettings({ 'agent.settings': JSON.stringify({ maxSteps: 40 }) });
  assert.equal(above.HR.set.maxSteps(), 40);
  const zero = bootSettings({ 'agent.settings': JSON.stringify({ maxSteps: 0, theme: 'dark' }) });
  assert.equal(zero.HR.set.maxSteps(), 0);
  zero.HR.set.redraw();
  assert.equal(zero.ids.setSteps.value, 0);
  const junk = bootSettings({ 'agent.settings': JSON.stringify({ maxSteps: -4 }) });
  assert.equal(junk.HR.set.maxSteps(), 8);
  assert.equal(junk.saved().maxSteps, -4);
  const frac = bootSettings({ 'agent.settings': JSON.stringify({ maxSteps: 99.5 }) });
  assert.equal(frac.HR.set.maxSteps(), 8);
  const broken = bootSettings({ 'agent.settings': '{' });
  assert.equal(broken.HR.set.maxSteps(), 8);
});

test('missing context size defaults to 128000 and a saved size is kept', () => {
  const fresh = bootSettings();
  assert.equal(fresh.HR.set.ctxMax(), 128000);
  fresh.HR.set.redraw();
  assert.equal(fresh.ids.setCtx.value, 128000);
  assert.equal(fresh.saved(), null);
  const other = bootSettings({ 'agent.settings': JSON.stringify({ theme: 'light', maxSteps: 12 }) });
  assert.equal(other.HR.set.ctxMax(), 128000);
  assert.equal(other.HR.set.maxSteps(), 12);
  const old = bootSettings({ 'agent.settings': JSON.stringify({ ctxMax: 8192, maxSteps: 8 }) });
  assert.equal(old.HR.set.ctxMax(), 8192);
  old.HR.set.redraw();
  assert.equal(old.ids.setCtx.value, 8192);
  old.HR.set.put('theme', 'dark');
  assert.equal(old.reload().HR.set.ctxMax(), 8192);
  const picked = bootSettings({ 'agent.settings': JSON.stringify({ ctxMax: 32000 }) });
  assert.equal(picked.HR.set.ctxMax(), 32000);
  picked.ids.setCtx.value = '64000'; picked.fire('setCtx');
  assert.equal(picked.HR.set.ctxMax(), 64000);
  assert.equal(picked.reload().HR.set.ctxMax(), 64000);
  picked.ids.setCtx.value = '100'; picked.fire('setCtx');
  assert.equal(picked.HR.set.ctxMax(), 512);
  picked.ids.setCtx.value = '3000000'; picked.fire('setCtx');
  assert.equal(picked.HR.set.ctxMax(), 2000000);
  picked.ids.setCtx.value = ''; picked.fire('setCtx');
  assert.equal(picked.HR.set.ctxMax(), 128000);
  const empty = bootSettings({ 'agent.settings': JSON.stringify({ ctxMax: '' }) });
  assert.equal(empty.HR.set.ctxMax(), 128000);
});

function loadLoop() {
  const HR = {
    tools: {
      schemas() { return [{ function: { name: 'get_time' } }]; },
      run: async () => '12:00'
    },
    msgs: {
      toApi() { return [{ role: 'user', content: 'hi' }]; },
      all() { return [{ role: 'user', content: 'hi' }]; },
      add() {}
    }
  };
  const context = vm.createContext({ HR, performance: { now: () => 1 }, console });
  vm.runInContext(read('app/core/loop.js'), context, { filename: 'loop.js' });
  return HR;
}
function toolCall() { return { tool_calls: [{ function: { name: 'get_time', arguments: {} } }] }; }
function httpErr(msg) { const e = new Error(msg); e.kind = 'http'; return e; }
function abortErr() { const e = new Error('Stopped'); e.kind = 'abort'; return e; }
async function runLoop(HR, maxSteps, chat, signal) {
  const notes = [];
  let calls = 0;
  const seenTools = [];
  const ac = signal || new AbortController();
  const result = await HR.loop.run({
    adapter: {
      id: 'openai', label: 'OpenAI',
      chat: async (o) => { calls++; seenTools.push((o.tools || []).length); return chat(calls, o, ac); }
    },
    cfg: { base: 'https://example.invalid', provider: 'openai' },
    model: 'm', think: 'off', signal: ac.signal, maxSteps, useTools: true,
    system: async () => '',
    ui: {
      modelStart() { return { delta() {}, done() { return { role: 'assistant', content: 'ok' }; }, stopped() { return null; }, fail() {} }; },
      toolStart() { return { done() {}, live() {} }; },
      note(t) { notes.push(t); },
      approve: async () => true
    }
  });
  return { result, notes, calls, seenTools };
}

test('the loop stops at 99 and 999, leaves 0 unlimited until Stop, and still halts on abort or a provider error', async () => {
  const HR = loadLoop();
  const always = () => toolCall();
  for (const n of [31, 99, 999]) {
    const r = await runLoop(HR, n, always);
    assert.equal(r.result.status, 'limit');
    assert.equal(r.calls, n);
    assert.match(r.notes.join('\n'), new RegExp('Step limit reached \\(' + n + ' model calls\\)'));
  }
  const early = await runLoop(HR, 99, n => n === 2 ? { tool_calls: [] } : toolCall());
  assert.equal(early.result.status, 'ok');
  assert.equal(early.calls, 2);
  assert.equal(early.notes.length, 0);

  const settings = bootSettings();
  settings.ids.setSteps.value = '0'; settings.fire('setSteps');
  assert.equal(settings.HR.set.maxSteps(), 0);
  const unlimited = await runLoop(HR, settings.HR.set.maxSteps(), n => {
    if (n === 40) throw abortErr();
    return toolCall();
  });
  assert.equal(unlimited.result.status, 'stop');
  assert.equal(unlimited.calls, 40);
  assert.equal(unlimited.notes.some(t => /Step limit/.test(t)), false);

  const finished = await runLoop(HR, 0, n => n === 5 ? { tool_calls: [] } : toolCall());
  assert.equal(finished.result.status, 'ok');
  assert.equal(finished.calls, 5);

  const already = new AbortController(); already.abort();
  const stopped = await runLoop(HR, 0, always, already);
  assert.equal(stopped.result.status, 'stop');
  assert.equal(stopped.calls, 0);

  await assert.rejects(runLoop(HR, 999, () => { throw httpErr('overloaded'); }), e => e.kind === 'http' && e.message === 'overloaded');
  let paid = 0;
  await assert.rejects(runLoop(HR, 0, () => { paid++; throw httpErr('quota'); }), e => e.kind === 'http');
  assert.equal(paid, 1);

  const retry = await runLoop(HR, 8, (n, o) => {
    if (n === 1) throw httpErr('model does not support tools');
    assert.equal((o.tools || []).length, 0);
    return { tool_calls: [] };
  });
  assert.equal(retry.result.status, 'ok');
  assert.equal(retry.calls, 2);
  assert.equal(retry.seenTools[0] > 0, true);
  assert.equal(retry.seenTools[1], 0);
  assert.match(retry.notes.join('\n'), /retrying without tools/);
});

function bootMeter(initial) {
  const ui = bootSettings(initial);
  const state = {
    id: 'openai', model: 'm', info: null,
    messages: [{ role: 'assistant', content: 'hi', usage: { p: 10000, o: 0 } }]
  };
  ui.HR.models = { id: () => state.id, base: () => 'https://api.openai.com/v1', all: () => [] };
  ui.HR.model = { current: () => state.model, info: () => state.info, load() {} };
  ui.HR.msgs = { all: () => state.messages, toApi: () => state.messages };
  ui.context.document.getElementById('meter');
  ui.context.document.getElementById('meterFill');
  ui.context.document.getElementById('meterText');
  vm.runInContext(read('app/gui/meter.js'), ui.context, { filename: 'meter.js' });
  ui.HR.meter.init();
  return { ui, state, box: ui.ids.meter, text: ui.ids.meterText };
}

test('context size changes the meter fallback and a provider window still wins', () => {
  const open = bootMeter();
  open.ui.HR.meter.update();
  assert.match(open.text.textContent, /10k \/ 128k tokens · 8%/);
  assert.match(open.box.title, /context 128000 tokens/);
  assert.equal(open.box.classList.on.amber, false);
  assert.equal(open.box.classList.on.red, false);
  open.ui.ids.setCtx.value = '32000'; open.ui.fire('setCtx');
  open.ui.HR.meter.update();
  assert.match(open.text.textContent, /10k \/ 32k tokens · 31%/);
  assert.equal(open.ui.reload().HR.set.ctxMax(), 32000);

  open.state.info = { name: 'm', ctx: 8000 };
  open.ui.HR.meter.update();
  assert.match(open.text.textContent, /10k \/ 8\.0k tokens · 100%/);
  assert.equal(open.box.classList.on.red, true);
  assert.doesNotMatch(open.text.textContent, /128k|32k/);
  open.state.info = null;
  open.ui.HR.meter.update();
  assert.match(open.text.textContent, /32k/);

  const kept = bootMeter({ 'agent.settings': JSON.stringify({ ctxMax: 8192 }) });
  kept.state.messages[0].usage.p = 7000;
  kept.ui.HR.meter.update();
  assert.match(kept.text.textContent, /7\.0k \/ 8\.2k tokens · 85%/);
  assert.equal(kept.box.classList.on.amber, true);
  assert.equal(kept.ui.HR.set.ctxMax(), 8192);
});
