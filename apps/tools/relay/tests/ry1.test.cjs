/* Relay app RY1 — non-browser checks: pure helpers (relay_shared.js) plus a local /health smoke test against the real RL1 relay. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const R = require(path.join(__dirname, '..', 'relay_shared.js'));
const { startServer } = require(path.join(__dirname, '..', '..', '..', '..', 'hub', 'relay', 'hub-relay.js'));
const TOKEN = 'abcdefghijklmnop1234';

function memStore() { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; }

test('normalizeUrl keeps only the http(s) origin', () => {
  assert.equal(R.normalizeUrl('http://127.0.0.1:8787/'), 'http://127.0.0.1:8787');
  assert.equal(R.normalizeUrl('ws://127.0.0.1:8787/ws'), 'http://127.0.0.1:8787');
  assert.equal(R.normalizeUrl('wss://pc.tail.ts.net/ws?x=1'), 'https://pc.tail.ts.net');
  assert.equal(R.normalizeUrl('127.0.0.1:8787'), 'http://127.0.0.1:8787');
  assert.equal(R.normalizeUrl('ftp://x'), '');
  assert.equal(R.normalizeUrl(''), '');
});

test('hub.relay save/load round trip and token rules', () => {
  const s = memStore();
  assert.equal(R.load(s), null);
  const c = R.save(s, { url: 'http://127.0.0.1:8787/', token: TOKEN });
  assert.deepEqual(Object.keys(JSON.parse(s.m['hub.relay'])), ['url', 'token', 'savedAt']);
  assert.deepEqual(R.load(s), c);
  assert.throws(() => R.save(s, { url: 'http://x', token: 'short' }), /16 to 512/);
  assert.throws(() => R.make('nope://', ''), /relay address/);
  assert.equal(R.tokenProblem('a'.repeat(513)) !== '', true);
  assert.equal(R.parse('{bad'), null);
});

test('derived URLs match RL1 paths', () => {
  const c = { url: 'https://pc.tail.ts.net', token: TOKEN };
  assert.equal(R.healthUrl(c), 'https://pc.tail.ts.net/health');
  assert.equal(R.fetchUrl(c), 'https://pc.tail.ts.net/fetch');
  assert.equal(R.mcpUrl(c), 'https://pc.tail.ts.net/mcp/<PIN>');
  assert.equal(R.mcpUrl(c, 'abc123'), 'https://pc.tail.ts.net/mcp/abc123');
  assert.equal(R.wsUrl(c), 'wss://pc.tail.ts.net/ws?relay_token=' + TOKEN);
  assert.equal(R.wsUrl({ url: 'http://127.0.0.1:8787' }), 'ws://127.0.0.1:8787/ws');
  assert.equal(R.tcpUrl({ url: 'http://127.0.0.1:8787' }, '192.168.1.20', 22), 'ws://127.0.0.1:8787/tcp?token=192.168.1.20:22');
  assert.equal(R.tcpUrl(c, '[::1]', 5900), 'wss://pc.tail.ts.net/tcp?token=[::1]:5900&relay_token=' + TOKEN);
  assert.deepEqual(R.authHeaders(c), { Authorization: 'Bearer ' + TOKEN });
  assert.deepEqual(R.authHeaders({ url: 'x' }), {});
  assert.ok(!R.mask(R.wsUrl(c), TOKEN).includes(TOKEN));
});

test('health parsing, mixed content and status classes', () => {
  assert.deepEqual(R.parseHealth('ok\nmodules: mcp, tcp, fetch\n'), { ok: true, modules: ['mcp', 'tcp', 'fetch'] });
  assert.equal(R.parseHealth('Hub shared relay').ok, false);
  assert.equal(R.mixedContent('https:', { url: 'http://192.168.1.5:8787' }), true);
  assert.equal(R.mixedContent('https:', { url: 'http://127.0.0.1:8787' }), false);
  assert.equal(R.mixedContent('http:', { url: 'http://192.168.1.5:8787' }), false);
  assert.equal(R.classify({ status: 401 }).state, 'auth');
  assert.equal(R.classify({ status: 0 }).state, 'down');
  assert.equal(R.classify({ mixed: true }).state, 'blocked');
  assert.equal(R.classify({ status: 200, body: 'ok\nmodules: tcp\n' }).state, 'ok');
});

test('allow-list checks follow the RL1 README', () => {
  assert.deepEqual(R.checkTcp('192.168.1.20'), { ok: true, value: '192.168.1.20:22' });
  assert.equal(R.checkTcp('127.0.0.1:5900').value, '127.0.0.1:5900');
  assert.equal(R.checkTcp('192.168.1.*:22').ok, true);
  assert.equal(R.checkTcp('[::1]:5900').ok, true);
  assert.equal(R.checkTcp('host:*').ok, false);
  assert.equal(R.checkTcp('*').ok, false);
  assert.equal(R.checkTcp('host:70000').ok, false);
  assert.equal(R.checkOrigin('https://dav.example.com/').value, 'https://dav.example.com');
  assert.equal(R.checkOrigin('https://dav.example.com/folder').ok, false);
  assert.equal(R.checkOrigin('https://*.example.com').ok, false);
  assert.equal(R.checkOrigin('ftp://x.com').ok, false);
  assert.equal(R.checkHost('pc.tail.ts.net').ok, true);
  assert.equal(R.checkHost('pc.tail.ts.net:443').ok, false);
  const snip = JSON.parse(R.snippet({ tcp: ['a:22', 'a:22'], fetch: ['https://x.com'], hosts: [] }));
  assert.deepEqual(snip, { TCP_ALLOWLIST: ['a:22'], FETCH_ALLOWLIST: ['https://x.com'] });
  // The generated snippet must be accepted by the relay's own validator.
  const { validateConfig } = require(path.join(__dirname, '..', '..', '..', '..', 'hub', 'relay', 'relay_config.js'));
  assert.doesNotThrow(() => validateConfig({ ...snip, PUBLIC_HOSTS: [R.checkHost('pc.tail.ts.net').value] }));
});

test('page files exist and load the shared helper', () => {
  const dir = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(dir, 'relay.html'), 'utf8');
  assert.match(html, /relay_shared\.js/); assert.match(html, /relay_ui\.js/); assert.match(html, /hub_theme\.js/);
  assert.match(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), /location\.replace\('relay\.html'/);
  assert.ok(fs.existsSync(path.join(dir, 'relay_icon.svg')));
});

test('smoke: classify a real RL1 /health on 127.0.0.1', async () => {
  const open = await startServer({ PORT: 0 });
  try {
    const c = { url: 'http://127.0.0.1:' + open.port, token: '' };
    const res = await fetch(R.healthUrl(c), { headers: R.authHeaders(c) });
    const v = R.classify({ status: res.status, body: await res.text() });
    assert.equal(v.state, 'ok'); assert.deepEqual(v.modules, ['mcp', 'tcp', 'fetch']);
  } finally { await open.close(); }
  const locked = await startServer({ PORT: 0, TOKEN, MODULES: ['tcp'] });
  try {
    const url = 'http://127.0.0.1:' + locked.port;
    const bad = await fetch(R.healthUrl({ url }));
    assert.equal(R.classify({ status: bad.status, body: await bad.text() }).state, 'auth');
    const good = await fetch(R.healthUrl({ url }), { headers: R.authHeaders({ url, token: TOKEN }) });
    const v = R.classify({ status: good.status, body: await good.text() });
    assert.equal(v.state, 'ok'); assert.deepEqual(v.modules, ['tcp']);
  } finally { await locked.close(); }
});
