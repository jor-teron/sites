/* AG27: syntax/static + offline VM smoke for chat rename. No browser, no network. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');

const base = path.resolve(__dirname, '..');
const root = path.resolve(base, '../../..');
const read = f => fs.readFileSync(path.join(base, f), 'utf8');

function liveSource(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(line => !/^\s*\/\//.test(line)).join('\n');
}
function plain(v) { return JSON.parse(JSON.stringify(v)); }

test('AG27 rename source keeps the old prompt as a comment and does not call it', () => {
  execFileSync(process.execPath, ['--check', path.join(base, 'app/gui/chats.js')]);
  const src = read('app/gui/chats.js');
  const live = liveSource(src);
  assert.match(src, /AG27 Legacy: var t = prompt\('Rename chat', c\.title \|\| ''\)/);
  assert.doesNotMatch(live, /\bprompt\s*\(/);
  assert.doesNotMatch(live, /window\.prompt/);
  assert.match(live, /D\.ask\('Rename chat', value \|\| '', 'Rename'\)/);
  assert.match(live, /t\.replace\(\/\\s\+\/g, ' '\)\.trim\(\)\.slice\(0, 80\)/);
  assert.match(live, /if \(t == null\) return/);
  assert.match(live, /if \(!t\) return/);
  assert.match(src, /confirm\('Delete chat/);
  const html = read('agent.html');
  assert.ok(html.indexOf('shared/dialog/dialog.js') < html.indexOf('app/gui/chats.js'));
  assert.match(html, /shared\/dialog\/dialog\.css/);
  assert.doesNotMatch(html, /dialog\.(js|css)\?[^"]*v=/);
  assert.match(read('agent_sw.js'), /VER = 'agent-ag28'/);
  assert.match(read('agent_sw.js'), /AG27: VER agent-ag27/);
  assert.match(read('agent_readme.md'), /## AG27 — Hub dialog for chat rename/);
  assert.match(read('agent_readme.md'), /### Legacy code notes — AG27/);
  assert.ok(fs.existsSync(path.join(root, 'shared/dialog/dialog.js')));
});

function element(tag) {
  const node = {
    tagName: String(tag || '').toUpperCase(), className: '', textContent: '', type: '', value: '',
    spellcheck: true, children: [], attrs: {}, listeners: {}, parent: null, style: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(ch) { ch.parent = this; this.children.push(ch); return ch; },
    append(...xs) { xs.forEach(x => this.appendChild(x)); },
    addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.removed = true; },
    querySelector(sel) { return find(this, n => sel === 'input[type=text]' && n.tagName === 'INPUT' && n.type === 'text'); },
    focus() { this.focused = true; },
    setSelectionRange() {},
    click() { (this.listeners.click || []).forEach(fn => fn({})); }
  };
  return node;
}
function find(node, pred, acc) {
  if (!acc) { const hit = find(node, pred, []); return hit && hit[0]; }
  if (pred(node)) acc.push(node);
  (node.children || []).forEach(ch => find(ch, pred, acc));
  return acc;
}

function boot(opts = {}) {
  const saves = [];
  const loads = opts.loads || {};
  const lists = (opts.lists || [[]]).slice();
  const prompts = [];
  const messages = [];
  const posted = [];
  const replies = (opts.replies || []).slice();
  const listeners = [];
  const prompt = () => { prompts.push('prompt'); throw new Error('window.prompt must not be used'); };
  const confirm = () => { prompts.push('confirm'); return false; };
  const document = opts.document || {
    listeners: {},
    body: element('body'),
    createElement: tag => element(tag),
    addEventListener(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); },
    removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); },
    getElementById: () => element('div')
  };
  const location = { origin: opts.origin || 'https://hub.example' };
  const window = {
    document, location, prompt, confirm, UiDialog: opts.ui,
    addEventListener(type, fn) { if (type === 'message') listeners.push(fn); },
    removeEventListener(type, fn) { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }
  };
  window.parent = window;
  if (opts.hub) {
    window.parent = {
      __hubDialogHost: true,
      postMessage(data, origin) {
        posted.push({ data, origin });
        const value = replies.shift();
        const send = msg => listeners.slice().forEach(fn => fn({ source: window.parent, origin: location.origin, data: msg }));
        send({ type: 'hub-dialog-ack', id: data.id });
        send({ type: 'hub-dialog-result', id: data.id, value });
      }
    };
  }
  const HR = {
    threads: {
      newId: () => 'new', DIR: 'agent/chats/threads',
      list: async () => (lists.length > 1 ? lists.shift() : lists[0] || []),
      load: async id => (Object.prototype.hasOwnProperty.call(loads, id) ? loads[id] : null),
      save: async (m, l) => { saves.push({ m, l }); },
      remove: async () => {}, pin: async () => {}, waiting: () => false, pendingCount: async () => 0, merge: async () => {}
    },
    models: { chosen: () => 'ollama', id: () => 'ollama', setChat() {}, fallen: () => false, chatModel: () => 'm' },
    model: { current: () => 'm', load() {} },
    msgs: { all: () => messages, set(l) { messages.splice(0, messages.length, ...l); }, legacy: () => [] },
    chat: { busy: () => false, render() {}, note() {} },
    migrate: { legacy: p => p },
    fs: { ready: () => false, name: () => '', onChange() {} },
    set: { get: () => 'on' },
    steps: { clear() {}, note() {} },
    chatSearch: { active: () => false, run() {} }
  };
  const storage = { getItem: () => null, setItem() {} };
  const context = {
    window, document, location, HR, prompt, confirm, localStorage: storage,
    matchMedia: () => ({ matches: true }), addEventListener() {},
    setTimeout, clearTimeout, console,
    BroadcastChannel: class { postMessage() {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  if (opts.realDialog) vm.runInContext(fs.readFileSync(path.join(root, 'shared/dialog/dialog.js'), 'utf8'), context, { filename: 'dialog.js' });
  vm.runInContext(read('app/gui/chats.js'), context, { filename: 'chats.js' });
  return { HR, window, document, saves, prompts, messages, posted, location };
}

const turns = [{ role: 'user', content: 'hello' }];

async function renamed(env, chat, act) {
  const pending = env.HR.chats.rename(chat);
  if (act) act(env);
  await pending;
  return env;
}

test('AG27 confirm prefills the name, normalizes whitespace, caps at 80, saves and refreshes the list', async () => {
  let asked;
  const ui = { ask(title, value, ok) { asked = { title, value, ok }; return Promise.resolve('  Hello   world  ' + 'x'.repeat(80)); } };
  const env = boot({ ui, loads: { c1: turns }, lists: [[{ id: 'c1', title: 'Hello world', updated: 'u' }]] });
  await renamed(env, { id: 'c1', title: 'Old title', provider: 'ollama', model: 'm' });
  assert.deepEqual(asked, { title: 'Rename chat', value: 'Old title', ok: 'Rename' });
  assert.equal(env.prompts.length, 0);
  assert.equal(env.saves.length, 1);
  assert.equal(env.saves[0].m.id, 'c1');
  assert.equal(env.saves[0].m.provider, 'ollama');
  assert.equal(env.saves[0].m.title, ('Hello world ' + 'x'.repeat(80)).replace(/\s+/g, ' ').trim().slice(0, 80));
  assert.equal(env.saves[0].m.title.length, 80);
  assert.deepEqual(env.saves[0].l, turns);
  assert.equal(env.HR.chats.rows()[0].title, 'Hello world');
});

test('AG27 cancel, empty and whitespace-only names do not save', async () => {
  const answers = [null, '', '   \n\t  '];
  for (const value of answers) {
    const env = boot({ ui: { ask: () => Promise.resolve(value) }, loads: { c1: turns }, lists: [[{ id: 'c1', title: 'Old' }]] });
    await renamed(env, { id: 'c1', title: 'Old' });
    assert.equal(env.saves.length, 0, 'saved on ' + JSON.stringify(value));
    assert.equal(env.HR.chats.rows().length, 0);
    assert.equal(env.prompts.length, 0);
  }
});

test('AG27 a missing chat file does not write a new title', async () => {
  const env = boot({ ui: { ask: () => Promise.resolve('Kept') }, loads: {} });
  await renamed(env, { id: 'gone', title: 'Old' });
  assert.equal(env.saves.length, 0);
});

test('AG27 the open chat keeps the new title through flush and the list updates', async () => {
  const env = boot({
    ui: { ask: () => Promise.resolve('  Renamed   chat  ') },
    loads: { c1: turns },
    lists: [[], [{ id: 'c1', title: 'Renamed chat', updated: 'u2' }]]
  });
  await env.HR.chats.open('c1');
  assert.equal(env.HR.chats.id(), 'c1');
  await renamed(env, { id: 'c1', title: 'Old title', provider: 'ollama' });
  assert.equal(env.saves.length, 1);
  assert.equal(env.saves[0].m.id, 'c1');
  assert.equal(env.saves[0].m.title, 'Renamed chat');
  assert.deepEqual(env.saves[0].l.map(m => m.content), ['hello']);
  assert.equal(env.HR.chats.rows()[0].title, 'Renamed chat');
  assert.equal(env.prompts.length, 0);
});

test('AG27 Hub ask posts hub-dialog and applies the async result', async () => {
  const env = boot({
    hub: true, realDialog: true, origin: 'https://hub.example',
    loads: { c1: turns },
    lists: [[{ id: 'c1', title: 'From Hub' }]],
    replies: ['  From   Hub  ']
  });
  env.document.createElement = () => { throw new Error('Hub path must not draw a local dialog'); };
  await renamed(env, { id: 'c1', title: 'Prefilled' });
  assert.equal(env.posted.length, 1);
  assert.equal(env.posted[0].origin, 'https://hub.example');
  assert.equal(env.posted[0].data.type, 'hub-dialog');
  assert.equal(env.posted[0].data.method, 'ask');
  assert.deepEqual(plain(env.posted[0].data.args), ['Rename chat', 'Prefilled', 'Rename']);
  assert.equal(env.saves[0].m.title, 'From Hub');
  assert.equal(env.prompts.length, 0);
});

test('AG27 Hub cancel result does not save', async () => {
  const env = boot({ hub: true, realDialog: true, loads: { c1: turns }, replies: [null] });
  env.document.createElement = () => { throw new Error('Hub cancel must not draw locally'); };
  await renamed(env, { id: 'c1', title: 'Prefilled' });
  assert.equal(env.posted[0].data.method, 'ask');
  assert.deepEqual(plain(env.posted[0].data.args), ['Rename chat', 'Prefilled', 'Rename']);
  assert.equal(env.saves.length, 0);
  assert.equal(env.prompts.length, 0);
});

function dialogBox(document) {
  return find(document.body, n => n.className === 'uid-back');
}
function buttonNamed(document, name) {
  const all = find(document.body, () => true, []) || [];
  return all.find(n => n.tagName === 'BUTTON' && n.textContent === name);
}

test('AG27 standalone and file:// use the real in-app dialog, prefilled, with confirm and cancel', async () => {
  async function run(origin, value, click) {
    const env = boot({ realDialog: true, origin, loads: { c1: turns }, lists: [[{ id: 'c1', title: 'Saved' }]] });
    assert.equal(env.window.parent, env.window);
    const pending = env.HR.chats.rename({ id: 'c1', title: 'File title' });
    const input = find(env.document.body, n => n.tagName === 'INPUT');
    assert.equal(input.value, 'File title');
    assert.ok(dialogBox(env.document));
    input.value = value;
    buttonNamed(env.document, click).click();
    await pending;
    return env;
  }
  const ok = await run('null', '  file   name  ', 'Rename');
  assert.equal(ok.saves[0].m.title, 'file name');
  assert.equal(ok.prompts.length, 0);
  const cancel = await run('https://agent.example', 'ignored', 'Cancel');
  assert.equal(cancel.saves.length, 0);
  const empty = await run('null', '   ', 'Rename');
  assert.equal(empty.saves.length, 0);
});

test('AG27 missing UiDialog uses the in-app fallback, never the browser prompt', async () => {
  const env = boot({ loads: { c1: turns }, lists: [[{ id: 'c1', title: 'Fallback' }]] });
  assert.equal(env.window.UiDialog, undefined);
  const pending = env.HR.chats.rename({ id: 'c1', title: 'Box title' });
  const back = env.document.body.children[0];
  const box = back.children[0];
  const input = box.children[0], cancel = box.children[1], ok = box.children[2];
  assert.equal(back.attrs['aria-label'], 'Rename chat');
  assert.equal(input.value, 'Box title');
  assert.equal(cancel.textContent, 'Cancel');
  assert.equal(ok.textContent, 'Rename');
  input.value = '  fallback   name ';
  env.document.listeners.keydown[0]({ key: 'Enter', target: input, preventDefault() {} });
  await pending;
  assert.equal(env.saves[0].m.title, 'fallback name');
  assert.equal(env.prompts.length, 0);

  async function dismiss(how) {
    const e = boot({ loads: { c1: turns } });
    const p = e.HR.chats.rename({ id: 'c1', title: 'Box title' });
    how(e);
    await p;
    assert.equal(e.saves.length, 0);
    assert.equal(e.prompts.length, 0);
  }
  await dismiss(e => e.document.body.children[0].children[0].children[1].onclick());
  await dismiss(e => e.document.listeners.keydown[0]({ key: 'Escape', target: e.document.body, preventDefault() {} }));
  await dismiss(e => {
    const back = e.document.body.children[0];
    back.listeners.pointerdown[0]({ target: back });
  });
  await dismiss(e => {
    const input = e.document.body.children[0].children[0].children[0];
    input.value = ' \n ';
    e.document.body.children[0].children[0].children[2].onclick();
  });
});
