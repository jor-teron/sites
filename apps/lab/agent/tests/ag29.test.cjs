/* AG29: syntax/static + offline VM smoke for prompt templates.
   No browser, no network, no GPU, no paid API calls.
   Oracle lines are the AG28 prompt.js wording (4bac8a6d), frozen here. */
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

const NAMES = ['prompt_system.txt', 'prompt_files.txt', 'prompt_shell.txt', 'prompt_web.txt', 'prompt_memory.txt', 'prompt_settings.txt'];
const SYS = 'agent/prompts/system.md';
const DEFAULT = '# Agent system prompt\n\n' +
  'You are Agent, a helpful assistant running in the user\'s browser on a local model.\n' +
  '- Be concise and direct. Use Markdown code blocks for code.\n' +
  '- Use tools when they help. Which tools you have, and whether actions ask the user first, is listed under ' +
  '"Current settings" below — follow that, it changes with the user\'s settings.\n' +
  '- File paths are relative to the user\'s folder root. Never invent file contents; read files before editing them, and write whole files.\n' +
  '- Do not save secrets to memory.\n\n' +
  '_Edit this file (agent/prompts/system.md) to change how Agent behaves. It is read on every message._\n';
const HEAD = '## Current settings (these override anything above)';
const WRITE_AUTO = '- Files: list_dir, read_file, search and write_file. Writes are auto-approved: they happen at once, so be careful.\n- Folder layout: workspace/ for your work and projects, user/ for files the user shared (read them; change them only when asked), trash/ for removed files, agent/ is internal. Remove a file with move_to_trash (never deleted); rename_file moves or renames one file and never overwrites. Both always ask the user first.';   // AG40: + folder layout
const WRITE_ASK = '- Files: list_dir, read_file, search and write_file. Every write asks the user first.\n- Folder layout: workspace/ for your work and projects, user/ for files the user shared (read them; change them only when asked), trash/ for removed files, agent/ is internal. Remove a file with move_to_trash (never deleted); rename_file moves or renames one file and never overwrites. Both always ask the user first.';   // AG40
const READ_ONLY = '- Files: read-only (list_dir, read_file, search). Writing is turned off — do not offer to write files.';
const NO_FOLDER = '- No folder is connected: no file tools.';
const SHELL_AUTO = '- Shell: run_shell is available. Commands are auto-approved and run at once — only run safe commands.';
const SHELL_ASK = '- Shell: run_shell is available. Every command asks the user first.';
const WEB = '- Web: web_search (title, url, snippet) and web_fetch (page text, ~8k chars) are available; each call uses Tavily credits, so search only when the answer needs current or outside information and cite the URLs you used.';
const MEM_ON = '- Memory is on: memory_read / memory_append with target user (facts about the user), assistant (your notes), ' +
  'session (what this chat is working on), topic (+ name). Save short durable facts; user and assistant notes are shared by all chats, session notes belong to this chat only.';
const MEM_OFF = '- Memory is off: you have no memory tools and no saved notes.';
const BLOCK = '## Memory (newest notes; memory_read has all)\n';
const FULL = ['get_time', 'list_dir', 'read_file', 'search', 'write_file', 'run_shell', 'web_search', 'web_fetch', 'memory_read', 'memory_append'];

function grab(file, key) {
  const norm = read(file).replace(/\r\n/g, '\n');
  if (!key) return norm.slice(-1) === '\n' ? norm.slice(0, -1) : norm;
  const lines = norm.split('\n');
  let cur = null, buf = [], found = false, body = null;
  function flush() {
    if (cur == null) return;
    let text = buf.join('\n');
    if (text.slice(-1) === '\n') text = text.slice(0, -1);
    if (cur === key) { found = true; body = text; }
  }
  for (const line of lines) {
    const m = /^@@([A-Za-z0-9_]+)$/.exec(line);
    if (m) { flush(); cur = m[1]; buf = []; }
    else if (cur) buf.push(line);
  }
  flush();
  if (!found) throw new Error('missing @@' + key + ' in ' + file);
  return body;
}

function legacy(o) {
  const tools = o.tools || FULL;
  const folder = o.folder !== false;
  const set = Object.assign({ tools: 'on', autoWrite: 'off', autoShell: 'off', memory: 'on' }, o.settings || {});
  const have = {};
  tools.forEach(n => { have[n] = 1; });
  let st = '';
  if (set.tools !== 'off' && tools.length) {
    const L = [HEAD];
    L.push(folder ? (have.write_file ? (set.autoWrite === 'on' ? WRITE_AUTO : WRITE_ASK) : READ_ONLY) : NO_FOLDER);
    if (have.run_shell) L.push(set.autoShell === 'on' ? SHELL_AUTO : SHELL_ASK);
    if (have.web_search) L.push(WEB);
    L.push(have.memory_read ? MEM_ON : MEM_OFF);
    st = L.join('\n');
  }
  if (!folder) return st;
  const s = String(o.user).trim();
  const mem = set.memory === 'off' ? '' : (o.mem || '');
  const block = mem ? BLOCK + mem : '';
  return [s, st, block].filter(Boolean).join('\n\n');
}

function boot(o) {
  o = o || {};
  const mode = o.mode || 'network';
  const disk = Object.assign({}, o.disk || {});
  const writes = [], notes = [], reads = [], fetchLog = [], cacheLog = [];
  const settings = Object.assign({ tools: 'on', allowWrite: 'on', allowShell: 'on', allowWeb: 'on', memory: 'on', autoWrite: 'off', autoShell: 'off' }, o.settings || {});
  const toolNames = (o.tools || FULL).slice();
  const folder = o.folder !== false;
  const protocol = o.protocol || (mode === 'embedded' ? 'file:' : 'https:');
  const href = o.href || (protocol === 'file:' ? 'file:///opt/agent/agent.html' : 'https://hub.example/apps/lab/agent/agent.html');
  function bodyFor(url) {
    const name = String(url).split('/').pop().split('?')[0];
    if (o.bodies && Object.prototype.hasOwnProperty.call(o.bodies, name)) return o.bodies[name];
    const file = path.join(base, 'prompts', name);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  }
  function fetch(url) {
    fetchLog.push(String(url));
    if (mode === 'fail' || mode === 'cache' || mode === 'embedded') return Promise.reject(new Error('offline'));
    if (mode === 'http-error') return Promise.resolve({ ok: false, status: 404, text: async () => '' });
    const body = bodyFor(url);
    if (body == null) return Promise.resolve({ ok: false, status: 404, text: async () => '' });
    return Promise.resolve({ ok: true, status: 200, text: async () => body });
  }
  const cacheStore = new Map();
  if (mode === 'cache') {
    for (const n of NAMES) cacheStore.set(new URL('prompts/' + n, href).href, fs.readFileSync(path.join(base, 'prompts', n), 'utf8'));
  }
  let caches;
  if (mode !== 'embedded' && mode !== 'fail' && !o.noCache) {
    caches = {
      open: async (name) => {
        cacheLog.push(name);
        return { match: async (url) => {
          const hit = cacheStore.get(String(url));
          if (hit == null) return undefined;
          return { ok: true, status: 200, text: async () => hit };
        } };
      }
    };
  }
  const HR = {
    set: { get: (k) => settings[k] },
    perms: {
      auto: (kind) => settings[kind === 'shell' ? 'autoShell' : 'autoWrite'] === 'on',
      memory: () => settings.memory !== 'off'
    },
    tools: { list: () => toolNames.map(n => ({ name: n })) },
    fs: {
      ready: () => folder,
      read: async (p) => { reads.push(p); if (!Object.prototype.hasOwnProperty.call(disk, p)) throw new Error('missing'); return { text: disk[p], size: String(disk[p]).length }; },
      write: (p, text) => {
        writes.push({ path: p, text });
        if (o.write) return o.write(p, text, disk);
        disk[p] = text;
        return Promise.resolve();
      }
    },
    mem: { block: async () => (o.mem == null ? '' : o.mem) },
    chats: { id: () => 'c1' },
    chat: { note: (t) => { notes.push(t); } }
  };
  const location = { protocol, href };
  const context = { HR, window: { HR, location }, location, fetch, URL, Promise, console };
  if (caches) context.caches = caches;
  vm.createContext(context);
  vm.runInContext(read('prompts/prompt_fallback.js'), context, { filename: 'prompt_fallback.js' });
  if (o.embedded === null) context.HR.promptFiles = {};
  else if (o.embedded) context.HR.promptFiles = o.embedded;
  vm.runInContext(read('app/core/prompt.js'), context, { filename: 'prompt.js' });
  return { HR, disk, writes, notes, reads, fetchLog, cacheLog, settings, toolNames, href };
}

test('AG29 files, service worker, page and readme point at the shipped prompts', () => {
  for (const f of ['app/core/prompt.js', 'agent_sw.js', 'prompts/prompt_fallback.js', 'prompts/gen_fallback.cjs']) check(f);
  const sw = read('agent_sw.js'), liveSw = liveSource(sw), html = read('agent.html'), readme = read('agent_readme.md');
  const livePrompt = liveSource(read('app/core/prompt.js'));
  assert.match(sw, /AG29: VER agent-ag29/);
  assert.equal(liveSw.includes("VER = 'agent-ag28'"), false);
  assert.match(sw, /AG29 Legacy: VER = 'agent-ag28'/);
  assert.match(sw, /var FILES = 'agent-files'/);
  for (const n of NAMES) assert.match(sw, new RegExp(n.replace('.', '\\.')));
  assert.match(sw, /prompts\/prompt_fallback\.js/);
  const fallbackTag = html.indexOf('<script src="prompts/prompt_fallback.js">');
  const promptTag = html.indexOf('<script src="app/core/prompt.js">');
  const migrateTag = html.indexOf('<script src="app/core/migrate.js">');
  assert.equal(fallbackTag > migrateTag && fallbackTag < promptTag, true);
  assert.match(html, /AG29:/);
  assert.match(readme, /## AG29 — prompt text in files/);
  assert.match(readme, /### Legacy code notes — AG29/);
  assert.match(read('app/core/prompt.js'), /AG29 Legacy:/);
  assert.equal(livePrompt.includes('Writes are auto-approved'), false);
  assert.equal(livePrompt.includes('Do not save secrets'), false);
  assert.equal(livePrompt.includes('web_fetch (page text'), false);
  assert.equal(livePrompt.includes('Memory is off'), false);
  assert.match(livePrompt, /agent\/prompts\/system\.md/);
  assert.equal(livePrompt.includes('maxSteps'), false);
  assert.match(read('app/core/loop.js'), /o\.maxSteps > 0 && calls >= o\.maxSteps/);
  const shipped = fs.readdirSync(path.join(base, 'prompts')).filter(n => n.startsWith('prompt_') && n.endsWith('.txt')).sort();
  assert.deepEqual(shipped, NAMES.slice().sort());
});

test('prompt_fallback.js is generated from the txt files and matches them byte for byte', () => {
  execFileSync(process.execPath, ['prompts/gen_fallback.cjs', '--check'], { cwd: base });
  const bag = {};
  NAMES.forEach(n => { bag[n] = read('prompts/' + n); });
  const expected = '/* Generated by prompts/gen_fallback.cjs from prompts/prompt_*.txt. Do not edit by hand. */\n' +
    'HR.promptFiles = ' + JSON.stringify(bag, null, 2) + ';\n';
  assert.equal(read('prompts/prompt_fallback.js'), expected);
  const stdout = execFileSync(process.execPath, ['prompts/gen_fallback.cjs', '--stdout'], { cwd: base, encoding: 'utf8' });
  assert.equal(stdout, expected);
  const HR = {};
  vm.runInContext(read('prompts/prompt_fallback.js'), vm.createContext({ HR }), { filename: 'prompt_fallback.js' });
  for (const n of NAMES) assert.equal(HR.promptFiles[n], read('prompts/' + n), n);
});

test('shipped templates hold the AG28 sentences under the section keys', () => {
  assert.equal(read('prompts/prompt_system.txt'), DEFAULT);
  assert.equal(grab('prompts/prompt_settings.txt'), HEAD);
  assert.equal(grab('prompts/prompt_web.txt'), WEB);
  assert.equal(grab('prompts/prompt_files.txt', 'write_auto'), WRITE_AUTO);
  assert.equal(grab('prompts/prompt_files.txt', 'write_ask'), WRITE_ASK);
  assert.equal(grab('prompts/prompt_files.txt', 'read_only'), READ_ONLY);
  assert.equal(grab('prompts/prompt_files.txt', 'no_folder'), NO_FOLDER);
  assert.equal(grab('prompts/prompt_shell.txt', 'auto'), SHELL_AUTO);
  assert.equal(grab('prompts/prompt_shell.txt', 'ask'), SHELL_ASK);
  assert.equal(grab('prompts/prompt_memory.txt', 'on'), MEM_ON);
  assert.equal(grab('prompts/prompt_memory.txt', 'off'), MEM_OFF);
  assert.equal(grab('prompts/prompt_memory.txt', 'block') + '\n', BLOCK);
});

test('assembled prompts match AG28 across permissions, tools, memory and folder', async () => {
  const notes = '### About the user (memory/user.md)\n- likes tea';
  const cases = [
    { label: 'ask write, ask shell, web, memory', user: DEFAULT, mem: notes },
    { label: 'auto write and auto shell', user: DEFAULT, mem: notes, settings: { autoWrite: 'on', autoShell: 'on' } },
    { label: 'read only', user: DEFAULT, mem: notes, tools: ['get_time', 'list_dir', 'read_file', 'search', 'run_shell', 'web_search', 'memory_read'] },
    { label: 'no shell', user: DEFAULT, mem: notes, tools: FULL.filter(n => n !== 'run_shell') },
    { label: 'no web', user: DEFAULT, mem: notes, tools: FULL.filter(n => n !== 'web_search' && n !== 'web_fetch') },
    { label: 'web_fetch without web_search', user: DEFAULT, tools: ['get_time', 'list_dir', 'read_file', 'search', 'write_file', 'web_fetch', 'memory_read'] },
    { label: 'memory off', user: DEFAULT, mem: notes, settings: { memory: 'off' }, tools: FULL.filter(n => n !== 'memory_read' && n !== 'memory_append') },
    { label: 'memory permission on but memory_read not listed', user: DEFAULT, mem: notes, tools: ['get_time', 'write_file'] },
    { label: 'no folder, shell and web', folder: false, tools: ['get_time', 'run_shell', 'web_search', 'web_fetch'] },
    { label: 'no folder, write_file listed still says no file tools', folder: false, tools: ['write_file', 'get_time'] },
    { label: 'no folder, tools off', folder: false, settings: { tools: 'off' } },
    { label: 'no folder, no tools listed', folder: false, tools: [] },
    { label: 'folder, tools off, memory notes', user: '# Custom\n\nStay.\n', mem: notes, settings: { tools: 'off' } },
    { label: 'folder, tools off, memory off', user: '# Custom\n\nStay.\n', mem: notes, settings: { tools: 'off', memory: 'off' } },
    { label: 'folder, no tools listed', user: DEFAULT, tools: [] },
    { label: 'empty user file is kept', user: '' },
    { label: 'whitespace inside a custom prompt', user: '# Title\n\n  keep  \n\n', mem: '' }
  ];
  for (const c of cases) {
    const folder = c.folder !== false;
    const disk = {};
    if (folder) disk[SYS] = c.user;
    const api = boot({ mode: 'network', folder, disk, tools: c.tools, settings: c.settings, mem: c.mem, noCache: true });
    assert.equal(api.HR.prompt.SYS, SYS);
    const got = await api.HR.prompt.system();
    assert.equal(got, legacy(c), c.label);
    assert.equal(api.writes.length, 0, c.label);
    if (!folder) assert.equal(api.reads.length, 0, c.label);
  }
});

test('an existing custom system.md is kept and a missing one is created from prompt_system.txt', async () => {
  const custom = '# My prompt\n\nDo the thing.\n\nNot the shipped default.\n';
  const kept = boot({ mode: 'network', disk: { [SYS]: custom }, mem: 'note', noCache: true });
  const got = await kept.HR.prompt.system();
  assert.equal(got.startsWith(custom.trim()), true);
  assert.equal(got.includes('Do not save secrets to memory.'), false);
  assert.equal(kept.writes.length, 0);
  assert.deepEqual(kept.reads, [SYS]);
  const again = await kept.HR.prompt.system();
  assert.equal(again, got);
  assert.equal(kept.writes.length, 0);
  assert.equal(kept.disk[SYS], custom);

  const first = boot({ mode: 'network', disk: {}, noCache: true });
  const created = await first.HR.prompt.system();
  assert.equal(first.writes.length, 1);
  assert.equal(first.writes[0].path, SYS);
  assert.equal(first.writes[0].text, DEFAULT);
  assert.equal(first.disk[SYS], read('prompts/prompt_system.txt'));
  assert.equal(created.startsWith(DEFAULT.trim()), true);
  assert.deepEqual(first.notes, ['Created ' + SYS + ' — edit it to change the system prompt.']);
  const second = await first.HR.prompt.system();
  assert.equal(second, created);
  assert.equal(first.writes.length, 1);

  let release, writes = 0;
  const gate = new Promise(r => { release = r; });
  const race = boot({
    mode: 'network', disk: {}, noCache: true,
    write: (p, text, disk) => { writes += 1; return gate.then(() => { disk[p] = text; }); }
  });
  const p1 = race.HR.prompt.system(), p2 = race.HR.prompt.system();
  release();
  const [a, b] = await Promise.all([p1, p2]);
  assert.equal(a, b);
  assert.equal(writes, 1);
  assert.equal(a.startsWith(DEFAULT.trim()), true);
});

test('a failed write still uses the shipped default and does not send an empty prompt', async () => {
  const api = boot({
    mode: 'network', disk: {}, noCache: true,
    write: () => Promise.reject(new Error('disk full'))
  });
  const got = await api.HR.prompt.system();
  assert.equal(got.startsWith(DEFAULT.trim()), true);
  assert.equal(api.writes.length, 1);
  const again = await api.HR.prompt.system();
  assert.equal(again, got);
  assert.equal(api.writes.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(api.disk, SYS), false);
});

test('settings are rebuilt on every call while template files stay cached', async () => {
  const api = boot({ mode: 'network', disk: { [SYS]: DEFAULT }, noCache: true, mem: '### Session\n- open' });
  const ask = await api.HR.prompt.system();
  const fetches = api.fetchLog.length;
  assert.equal(fetches > 0, true);
  assert.equal(ask.includes(WRITE_ASK), true);
  assert.equal(ask.includes(SHELL_ASK), true);
  api.settings.autoWrite = 'on';
  api.settings.autoShell = 'on';
  const auto = await api.HR.prompt.system();
  assert.equal(api.fetchLog.length, fetches);
  assert.equal(auto.includes(WRITE_AUTO), true);
  assert.equal(auto.includes(SHELL_AUTO), true);
  assert.equal(auto.includes(WRITE_ASK), false);
  api.toolNames.splice(0, api.toolNames.length, 'get_time');
  const bare = await api.HR.prompt.system();
  assert.equal(api.fetchLog.length, fetches);
  assert.equal(bare.includes(NO_FOLDER), false);
  assert.equal(bare.includes(READ_ONLY), true);
  assert.equal(bare.includes('Shell:'), false);
  assert.equal(bare.includes('Web:'), false);
  assert.equal(bare.includes(MEM_OFF), true);
  assert.equal(api.cacheLog.length, 0);
  for (const u of api.fetchLog) assert.equal(u.startsWith('https://hub.example/apps/lab/agent/prompts/'), true);
});

test('hosted fetch wins, offline cache is used when fetch fails, file:// uses the generated copy', async () => {
  const disk = { [SYS]: DEFAULT };
  const hosted = boot({
    mode: 'network', disk, noCache: true,
    embedded: { 'prompt_files.txt': '@@write_ask\nWRONG LINE\n@@write_auto\nWRONG\n@@read_only\nWRONG\n@@no_folder\nWRONG\n' }
  });
  const hostedGot = await hosted.HR.prompt.system();
  assert.equal(hostedGot.includes(WRITE_ASK), true);
  assert.equal(hostedGot.includes('WRONG'), false);

  const offline = boot({ mode: 'cache', disk, embedded: null });
  const offGot = await offline.HR.prompt.system();
  assert.equal(offGot, hostedGot);
  assert.equal(offline.fetchLog.length > 0, true);
  assert.equal(offline.cacheLog.length, offline.fetchLog.length);
  assert.equal(offline.cacheLog.every(name => name === 'agent-files'), true);
  const cachedFetches = offline.fetchLog.length;
  await offline.HR.prompt.system();
  assert.equal(offline.fetchLog.length, cachedFetches);

  const file = boot({ mode: 'embedded', protocol: 'file:', href: 'file:///opt/agent/agent.html', disk });
  const fileGot = await file.HR.prompt.system();
  assert.equal(fileGot, hostedGot);
  assert.equal(file.fetchLog.every(u => u.startsWith('file:///opt/agent/prompts/')), true);
  assert.equal(file.cacheLog.length, 0);

  const missing = boot({ mode: 'http-error', disk, noCache: true });
  assert.equal(await missing.HR.prompt.system(), hostedGot);

  const crlf = boot({
    mode: 'network', disk, noCache: true,
    bodies: { 'prompt_settings.txt': HEAD + '\r\n' }
  });
  const crlfGot = await crlf.HR.prompt.system();
  assert.equal(crlfGot, hostedGot);
  assert.equal(crlfGot.includes('\r'), false);
});

test('a bad or missing safety section is recovered, and a total asset failure is not an empty prompt', async () => {
  const disk = { [SYS]: DEFAULT };
  const bad = boot({
    mode: 'network', disk, noCache: true,
    bodies: { 'prompt_shell.txt': 'not a section\n' }
  });
  const got = await bad.HR.prompt.system();
  assert.equal(got.includes(SHELL_ASK), true);
  assert.equal(got.includes('not a section'), false);

  const dead = boot({ mode: 'fail', disk, embedded: null });
  await assert.rejects(dead.HR.prompt.system(), (e) => {
    assert.equal(e.promptAsset, true);
    assert.match(e.message, /Agent prompt asset missing/);
    return true;
  });
  assert.equal(dead.writes.length, 0);

  const noDefault = boot({ mode: 'fail', disk: {}, embedded: null, settings: { tools: 'off' }, mem: '' });
  await assert.rejects(noDefault.HR.prompt.system(), /Agent prompt asset missing/);
  assert.equal(noDefault.writes.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(noDefault.disk, SYS), false);

  const plain = boot({ mode: 'fail', embedded: null, settings: { tools: 'off', memory: 'off' }, disk: { [SYS]: '# Just chat\n' }, noCache: true });
  assert.equal(await plain.HR.prompt.system(), '# Just chat');
  assert.equal(plain.fetchLog.length, 0);
  assert.equal(plain.writes.length, 0);
});

test('service worker install precaches the prompt txt files and the generated fallback', async () => {
  const root = 'https://hub.example/apps/lab/agent/';
  const store = new Map();
  const listeners = {};
  const self = {
    location: { href: root + 'agent_sw.js' },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve() }
  };
  function fetch(url) {
    const rel = String(url).startsWith(root) ? String(url).slice(root.length).split('?')[0] : '';
    const file = path.join(base, rel);
    const prompt = rel.startsWith('prompts/') && fs.existsSync(file);
    const page = rel === 'agent.html' || rel === 'image.html';
    if (prompt || page) {
      const text = fs.readFileSync(file, 'utf8');
      return Promise.resolve({ ok: true, status: 200, text: async () => text, clone() { return this; } });
    }
    if (rel && fs.existsSync(file) && fs.statSync(file).isFile()) return Promise.resolve({ ok: true, status: 200, text: async () => '', clone() { return this; } });
    return Promise.resolve({ ok: false, status: 404, text: async () => '', clone() { return this; } });
  }
  const caches = { open: async (name) => {
    assert.equal(name, 'agent-files');
    return { put: (url, res) => { store.set(url, res); return Promise.resolve(); } };
  } };
  const context = { self, caches, fetch, URL, Promise, console };
  vm.createContext(context);
  vm.runInContext(read('agent_sw.js'), context, { filename: 'agent_sw.js' });
  let done;
  listeners.install({ waitUntil: (p) => { done = p; } });
  await done;
  for (const n of NAMES.concat(['prompt_fallback.js'])) {
    const url = root + 'prompts/' + n;
    assert.equal(store.has(url), true, url);
    assert.equal(await store.get(url).text(), read('prompts/' + n), n);
  }
  assert.equal(store.has(root + 'agent.html'), true);
  assert.equal(store.has(root + 'image.html'), true);
});
