/* RL1 integration tests. No internet or real SSH/VNC services. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer } = require('../hub-relay.js');
const { loadConfig, validateConfig } = require('../relay_config.js');
const { createRelay, createLimiter } = require('../relay_core.js');
const { parseTarget, tcpAllowed, fetchTarget, websocketUrl } = require('../relay_security.js');
const { request, frame, openWs, listen, closeServer } = require('./helpers.cjs');
const ORIGIN = 'https://jor-teron.github.io';
async function relay(t, cfg = {}) {
  const started = await startServer({ PORT: 0, WS_PING_MS: 0, ...cfg });
  t.after(() => started.close()); return started;
}
function temp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl1-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir;
}
const post = (port, endpoint, value, headers) => request(port, endpoint, { method: 'POST', headers, body: JSON.stringify(value) });
test('config defaults, module switches and file/env/flag precedence', t => {
  const cfg = loadConfig([], {});
  assert.equal(cfg.HOST, '127.0.0.1'); assert.equal(cfg.PORT, 8787);
  assert.deepEqual(cfg.MODULES, ['mcp', 'tcp', 'fetch']);
  assert.deepEqual(cfg.TCP_ALLOWLIST, []); assert.deepEqual(cfg.FETCH_ALLOWLIST, []);
  assert.equal(cfg.TRUST_PROXY, false); assert.equal(cfg.CORS_ORIGINS.includes('*'), false);
  assert.deepEqual(loadConfig(['--modules', 'mcp,tcp', '--no-tcp'], {}).MODULES, ['mcp']);
  const file = path.join(temp(t), 'relay.json');
  fs.writeFileSync(file, JSON.stringify({ PORT: 8788, TCP_ALLOWLIST_FILE: 'targets.txt' }));
  assert.equal(loadConfig(['--config', file], { HUB_RELAY_PORT: '8789' }).PORT, 8789);
  assert.equal(loadConfig(['--config', file, '--port', '8790'], { HUB_RELAY_PORT: '8789' }).PORT, 8790);
  assert.equal(loadConfig(['--config', file], {}).TCP_ALLOWLIST_FILE, path.join(path.dirname(file), 'targets.txt'));
});
test('invalid options, modules, public binds, TLS and allowlists fail before listen', t => {
  for (const cfg of [{ MODULES: ['../mod_mcp'] }, { PORT: '12oops' }, { PORT: 65536 },
    { HOST: '0.0.0.0' }, { TOKEN: 'short' }, { TLS_CERT: 'cert' }, { MAX_BODY: -1 },
    { CORS_ORIGINS: ['*'] }, { CORS_ORIGINS: ['null'] }, { FETCH_ALLOWLIST: ['https://example.com/path'] },
    { FETCH_ALLOWLIST: ['https://user:password@example.com'] }, { PUBLIC_HOSTS: ['foo:80'] }]) assert.throws(() => validateConfig(cfg));
  assert.throws(() => loadConfig(['--oops'], {})); assert.throws(() => loadConfig(['--port'], {}));
  const file = path.join(temp(t), 'relay.json'); fs.writeFileSync(file, '{"TYPO":1}');
  assert.throws(() => loadConfig(['--config', file], {})); assert.deepEqual(loadConfig(['--help'], {}), { HELP: true });
});
test('TCP allowlist: exact ports, host globs, IPv6, comments, live file edits, fail closed', t => {
  assert.deepEqual(parseTarget('[::1]:5900'), { host: '::1', port: 5900 });
  for (const bad of ['localhost', 'localhost:0', 'localhost:65536', 'a:22/path', 'user@host:22', 'http://x:22', '[bad]:22']) assert.equal(parseTarget(bad), null);
  const cfg = validateConfig({ TCP_ALLOWLIST: ['192.168.1.*:22', '[::1]:5900', 'PI.local'] });
  for (const value of ['192.168.1.2:22', '[::1]:5900', 'pi.local:22']) assert.ok(tcpAllowed(parseTarget(value), cfg));
  for (const value of ['192.168.1.2:23', '192.168.2.2:22', 'piXlocal:22', '[::1]:22']) assert.equal(tcpAllowed(parseTarget(value), cfg), false);
  const file = path.join(temp(t), 'targets.txt'), withFile = validateConfig({ TCP_ALLOWLIST_FILE: file });
  assert.equal(tcpAllowed(parseTarget('localhost:22'), withFile), false);
  fs.writeFileSync(file, '# note\nlocalhost # port 22\n'); assert.ok(tcpAllowed(parseTarget('localhost:22'), withFile));
  fs.writeFileSync(file, 'localhost:5900\n'); assert.equal(tcpAllowed(parseTarget('localhost:22'), withFile), false);
  assert.ok(tcpAllowed(parseTarget('localhost:5900'), withFile));
  assert.equal(tcpAllowed(parseTarget('localhost:22'), validateConfig({ TCP_ALLOWLIST: ['localhost:*'] })), false);
});
test('exact fetch origins and scheme-safe HTTP/WS URL conversion', () => {
  const cfg = validateConfig({ FETCH_ALLOWLIST: ['https://example.com'] });
  assert.ok(fetchTarget('https://example.com/dav?q=1', cfg));
  for (const value of ['http://example.com', 'https://example.com:8443', 'https://example.com.evil',
    'https://user:pass@example.com/', 'file:///etc/passwd', 'https://example.com/#fragment']) assert.equal(fetchTarget(value, cfg), null);
  assert.equal(websocketUrl('https://example.com:8787', '/tcp'), 'wss://example.com:8787/tcp');
  assert.equal(websocketUrl('wss://example.com/ws'), 'wss://example.com/ws');
  assert.equal(websocketUrl('http://127.0.0.1:8787', '/ws'), 'ws://127.0.0.1:8787/ws');
  assert.throws(() => websocketUrl('ftp://example.com'));
});
test('module loading, health and disabled paths; invalid/duplicate registrations', async t => {
  const started = await relay(t); assert.deepEqual(started.modules, ['mcp', 'tcp', 'fetch']);
  assert.match((await request(started.port)).text, /ok\nmodules: mcp, tcp, fetch/);
  const only = await relay(t, { MODULES: [] }); assert.deepEqual(only.modules, []);
  assert.equal((await post(only.port, '/fetch', {})).status, 404);
  assert.equal((await openWs(only.port)).status, 404);
  assert.equal((await openWs(only.port, '/tcp?token=localhost:22')).status, 404);
  const core = createRelay({ PORT: 0 }); assert.throws(() => core.register({}));
  core.register({ name: 'custom', register() {} }); assert.throws(() => core.register({ name: 'custom', register() {} }));
});
test('HTTP and WS enforce Origin/Host, allow CLI origin omission and CORS preflight', async t => {
  const started = await relay(t);
  const allowed = await request(started.port, '/health', { headers: { Origin: ORIGIN } });
  assert.equal(allowed.status, 200); assert.equal(allowed.headers['access-control-allow-origin'], ORIGIN);
  for (const origin of ['https://evil.example', 'null', ORIGIN + '.evil']) {
    assert.equal((await request(started.port, '/health', { headers: { Origin: origin } })).status, 403);
    assert.equal((await openWs(started.port, '/ws', { origin })).status, 403);
  }
  assert.equal((await request(started.port, '/health', { headers: { Host: 'evil.example' } })).status, 403);
  assert.equal((await openWs(started.port, '/ws', { headers: { Host: 'evil.example' } })).status, 403);
  const preflight = await request(started.port, '/fetch', { method: 'OPTIONS', headers: { Origin: ORIGIN } });
  assert.equal(preflight.status, 204); assert.equal(preflight.headers['access-control-allow-private-network'], 'true');
  const cli = await openWs(started.port, '/ws', { origin: null }); assert.equal(cli.status, 101); cli.close();
});
test('token gates: HTTP bearer/header, WS query, separate TCP target; no HTTP query auth', async t => {
  const TOKEN = 'test-only-relay-token-123456', started = await relay(t, { TOKEN });
  assert.equal((await request(started.port)).status, 401);
  assert.equal((await request(started.port, '/health?relay_token=' + TOKEN)).status, 401);
  assert.equal((await request(started.port, '/health', { headers: { Authorization: 'Bearer ' + TOKEN } })).status, 200);
  assert.equal((await request(started.port, '/health', { headers: { 'X-Relay-Token': TOKEN } })).status, 200);
  assert.equal((await openWs(started.port)).status, 401);
  assert.equal((await openWs(started.port, '/ws?relay_token=wrong')).status, 401);
  const ws = await openWs(started.port, '/ws?relay_token=' + TOKEN); ws.json({ type: 'hello', pin: 'Abc123' });
  assert.equal(JSON.parse((await ws.next()).text).type, 'hello-ok'); ws.close();
  assert.equal((await openWs(started.port, '/tcp?token=localhost:22&relay_token=' + TOKEN)).status, 403);
});
test('rate limits ignore forged forwarded IPs', async t => {
  const started = await relay(t, { MODULES: [], RATE_MAX: 2 });
  assert.equal((await request(started.port)).status, 200); assert.equal((await request(started.port)).status, 200);
  assert.equal((await request(started.port, '/health', { headers: { 'X-Forwarded-For': '1.2.3.4' } })).status, 429);
  const limiter = createLimiter(1, 1000); assert.ok(limiter.check('a')); assert.equal(limiter.check('a'), false); assert.ok(limiter.check('b'));
});
test('MCP unchanged wire protocol: hello, round trip, notifications, replacement, missing PIN', async t => {
  const started = await relay(t, { MODULES: ['mcp'] }), ws = await openWs(started.port); t.after(() => ws.close());
  ws.json({ type: 'hello', pin: 'Tab_123' }); assert.deepEqual(JSON.parse((await ws.next()).text), { type: 'hello-ok' });
  const pending = post(started.port, '/mcp/Tab_123', { jsonrpc: '2.0', id: 42, method: 'tools/list' });
  const rpc = JSON.parse((await ws.next()).text); assert.equal(rpc.type, 'rpc'); assert.equal(rpc.payload.id, 42);
  ws.json({ type: 'rpc-result', id: rpc.id, payload: { jsonrpc: '2.0', id: 42, result: { tools: [] } } });
  assert.deepEqual((await pending).json().result, { tools: [] });
  assert.equal((await post(started.port, '/mcp/Tab_123', { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202);
  assert.equal(JSON.parse((await ws.next()).text).payload.method, 'notifications/initialized');
  const missing = await post(started.port, '/mcp/Wrong_1', { jsonrpc: '2.0', id: 7, method: 'ping' });
  assert.equal(missing.status, 200); assert.equal(missing.json().error.message, 'Web MCP tab not connected'); assert.equal(missing.json().id, 7);
  assert.equal((await request(started.port, '/mcp/Tab_123')).status, 405);
  const replacement = await openWs(started.port); t.after(() => replacement.close()); replacement.json({ type: 'hello', pin: 'Tab_123' });
  assert.equal(JSON.parse((await replacement.next()).text).type, 'hello-ok'); assert.equal(JSON.parse((await ws.next()).text).type, 'replaced');
});
test('MCP invalid hello, coalesced early hello, deadline and pending-request cap', async t => {
  const started = await relay(t, { MODULES: ['mcp'], RPC_TIMEOUT_MS: 100, RPC_MAX_PENDING: 1 });
  const invalid = await openWs(started.port); t.after(() => invalid.close()); invalid.json({ type: 'hello', pin: 'bad' });
  assert.equal(JSON.parse((await invalid.next()).text).type, 'hello-error');
  const ws = await openWs(started.port, '/ws', { early: frame(1, JSON.stringify({ type: 'hello', pin: 'Early_1' })) }); t.after(() => ws.close());
  assert.equal(JSON.parse((await ws.next()).text).type, 'hello-ok');
  const pending = post(started.port, '/mcp/Early_1', { id: 1, method: 'ping' }); await ws.next();
  assert.match((await post(started.port, '/mcp/Early_1', { id: 2, method: 'ping' })).json().error.message, /too many pending/);
  assert.match((await pending).json().error.message, /timed out/);
});
test('TCP: empty allowlist denies; binary subprotocol/stream across SSH and VNC paths', async t => {
  const echo = net.createServer(socket => socket.pipe(socket)), port = await listen(echo); t.after(() => closeServer(echo));
  const denied = await relay(t, { MODULES: ['tcp'] }); assert.equal((await openWs(denied.port, '/?token=127.0.0.1:' + port)).status, 403);
  const started = await relay(t, { MODULES: ['tcp'], TCP_ALLOWLIST: ['127.0.0.1:' + port] });
  for (const endpoint of ['/', '/tcp', '/websockify']) {
    const ws = await openWs(started.port, endpoint + '?token=127.0.0.1:' + port, { protocols: 'binary' });
    assert.equal(ws.status, 101); assert.equal(ws.headers['sec-websocket-protocol'], 'binary');
    const bytes = Buffer.from(Array.from({ length: 256 }, (_, i) => i)); ws.send(bytes);
    const result = await ws.next(); assert.equal(result.opcode, 2); assert.deepEqual(result.data, bytes); ws.close();
  }
  assert.equal((await openWs(started.port, '/tcp?token=127.0.0.1:' + port, { protocols: 'base64' })).status, 400);
  assert.equal((await openWs(started.port, '/tcp?token=127.0.0.1:1')).status, 403);
});
test('TCP: large binary/fragmented messages with ping preserve bytes; text is refused', async t => {
  const echo = net.createServer(socket => socket.pipe(socket)), port = await listen(echo); t.after(() => closeServer(echo));
  const started = await relay(t, { MODULES: ['tcp'], TCP_ALLOWLIST: ['127.0.0.1:' + port] });
  const ws = await openWs(started.port, '/tcp?target=127.0.0.1:' + port); t.after(() => ws.close());
  const data = Buffer.alloc(70000, 123); ws.send(data); const received = [];
  while (Buffer.concat(received).length < data.length) received.push((await ws.next()).data);
  assert.deepEqual(Buffer.concat(received), data);
  ws.socket.write(Buffer.concat([frame(2, 'ab', { fin: false }), frame(9, 'hi'), frame(0, 'cd')]));
  const pong = await ws.next(); assert.equal(pong.opcode, 10); assert.equal(pong.text, 'hi'); assert.equal((await ws.next()).text, 'abcd');
  ws.send('text'); const close = await ws.next(); assert.equal(close.opcode, 8); assert.equal(close.data.readUInt16BE(), 1003);
});
test('WS rejects bad version, masks, RSV, UTF8, oversized frames, control frames and orphan fragments', async t => {
  const started = await relay(t, { MODULES: ['mcp'], MAX_FRAME: 256 });
  assert.equal((await openWs(started.port, '/ws', { version: '12' })).status, 400);
  for (const [bytes, expected] of [[frame(1, '{}', { masked: false }), 1002], [Buffer.from([0xc1, 0x80, 0, 0, 0, 0]), 1002],
    [frame(1, Buffer.from([0xff])), 1007], [frame(1, Buffer.alloc(257)), 1009], [frame(9, Buffer.alloc(126)), 1002], [frame(0, 'orphan'), 1002]]) {
    const ws = await openWs(started.port); t.after(() => ws.close()); ws.socket.write(bytes);
    const close = await ws.next(); assert.equal(close.opcode, 8); assert.equal(close.data.readUInt16BE(), expected); ws.close();
  }
});
test('MCP hello deadline closes tabs that never said hello', async t => {
  const started = await relay(t, { MODULES: ['mcp'], WS_HELLO_MS: 25 }), ws = await openWs(started.port); t.after(() => ws.close());
  assert.equal((await ws.next()).data.readUInt16BE(), 1008);
});
test('fetch default deny, exact origins, DAV methods, binary bodies and browser-header stripping', async t => {
  let hits = 0, seen;
  const server = http.createServer((req, res) => {
    hits++; const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => {
      seen = { method: req.method, headers: req.headers, body: Buffer.concat(chunks) };
      res.writeHead(207, { 'Content-Type': 'application/octet-stream', 'Set-Cookie': 'upstream=secret' }); res.end(Buffer.from([0, 255, 1, 128]));
    });
  });
  const port = await listen(server); t.after(() => closeServer(server)); const url = 'http://127.0.0.1:' + port;
  const denied = await relay(t, { MODULES: ['fetch'] }); assert.equal((await post(denied.port, '/fetch', { url })).status, 403); assert.equal(hits, 0);
  const started = await relay(t, { MODULES: ['fetch'], FETCH_ALLOWLIST: [url] });
  assert.equal((await post(started.port, '/fetch', { url: url.replace('127.0.0.1', 'localhost') })).status, 403);
  const result = await post(started.port, '/fetch', { url: url + '/dav', method: 'PROPFIND', body: '<propfind/>', headers: {
    Depth: '1', Authorization: 'Basic upstream-test-only', Cookie: 'bad=1', Host: 'evil', 'X-Relay-Token': 'do-not-leak',
    Origin: 'https://evil.example', CONNECTION: 'X-Hop', 'X-Hop': 'remove' } });
  assert.equal(result.status, 200); const data = result.json(); assert.equal(data.status, 207);
  assert.deepEqual(Buffer.from(data.bodyBase64, 'base64'), Buffer.from([0, 255, 1, 128])); assert.equal(data.headers['set-cookie'], undefined);
  assert.equal(seen.method, 'PROPFIND'); assert.equal(seen.body.toString(), '<propfind/>'); assert.equal(seen.headers.depth, '1');
  assert.equal(seen.headers.authorization, 'Basic upstream-test-only');
  for (const key of ['cookie', 'x-relay-token', 'origin', 'x-hop']) assert.equal(seen.headers[key], undefined);
  assert.equal(seen.headers.host, '127.0.0.1:' + port);
  await post(started.port, '/fetch', { url, method: 'PUT', bodyBase64: 'AP8=' }); assert.deepEqual(seen.body, Buffer.from([0, 255]));
});
test('fetch redirects are returned, never followed even to disallowed targets', async t => {
  let hits = 0; const server = http.createServer((req, res) => { hits++; res.writeHead(302, { Location: 'http://127.0.0.1:1/private' }); res.end(); });
  const port = await listen(server); t.after(() => closeServer(server)); const url = 'http://127.0.0.1:' + port;
  const started = await relay(t, { FETCH_ALLOWLIST: [url] }), result = await post(started.port, '/fetch', { url });
  assert.equal(result.status, 200); assert.equal(result.json().status, 302); assert.equal(hits, 1);
});
test('fetch invalid input, request caps, upstream size and whole-response deadlines', async t => {
  const server = http.createServer((req, res) => { if (req.url !== '/slow') res.end(Buffer.alloc(2048)); });
  const port = await listen(server); t.after(() => { server.closeAllConnections(); return closeServer(server); }); const url = 'http://127.0.0.1:' + port;
  const started = await relay(t, { MODULES: ['fetch'], FETCH_ALLOWLIST: [url], MAX_BODY: 1024, UPSTREAM_TIMEOUT_MS: 30 });
  for (const input of [{ url, method: 'CONNECT' }, { url, bodyBase64: '???' }, { url, body: 'get with body' },
    { url, method: 'PUT', body: 'a', bodyBase64: 'YQ==' }, { url, headers: { Bad: 'injected\r\nheader' } },
    { url, method: 'COPY', headers: { Destination: 'http://not-allowed.example/file' } }]) assert.equal((await post(started.port, '/fetch', input)).status, 400);
  assert.equal((await request(started.port, '/fetch')).status, 405);
  assert.equal((await request(started.port, '/fetch', { method: 'POST', body: '{' })).status, 400);
  assert.equal((await post(started.port, '/fetch', { url, body: 'x'.repeat(2048) })).status, 413);
  assert.equal((await post(started.port, '/fetch', { url })).status, 502);
  assert.equal((await post(started.port, '/fetch', { url: url + '/slow' })).status, 502);
});

test('all three modules share one authenticated port without leaking outer relay auth', async t => {
  let auth;
  const service = http.createServer((req, res) => { auth = req.headers.authorization; res.end('fetch-ok'); });
  const httpPort = await listen(service); t.after(() => closeServer(service));
  const echo = net.createServer(socket => socket.pipe(socket)), tcpPort = await listen(echo); t.after(() => closeServer(echo));
  const TOKEN = 'test-only-combined-token', base = 'http://127.0.0.1:' + httpPort;
  const started = await relay(t, { TOKEN, TCP_ALLOWLIST: ['127.0.0.1:' + tcpPort], FETCH_ALLOWLIST: [base] });
  const mcp = await openWs(started.port, '/ws?relay_token=' + TOKEN); t.after(() => mcp.close());
  mcp.json({ type: 'hello', pin: 'Shared_1' }); assert.equal(JSON.parse((await mcp.next()).text).type, 'hello-ok');
  const tcp = await openWs(started.port, '/?token=127.0.0.1:' + tcpPort + '&relay_token=' + TOKEN, { protocols: 'binary' }); t.after(() => tcp.close());
  tcp.send(Buffer.from('SSH/VNC bytes')); assert.equal((await tcp.next()).text, 'SSH/VNC bytes');
  const fetched = await post(started.port, '/fetch', { url: base }, { Authorization: 'Bearer ' + TOKEN });
  assert.equal(Buffer.from(fetched.json().bodyBase64, 'base64').toString(), 'fetch-ok'); assert.equal(auth, undefined);
  const pending = post(started.port, '/mcp/Shared_1', { id: 8, method: 'ping' }, { Authorization: 'Bearer ' + TOKEN });
  const rpc = JSON.parse((await mcp.next()).text); mcp.json({ type: 'rpc-result', id: rpc.id, payload: { id: 8, result: {} } });
  assert.deepEqual((await pending).json(), { id: 8, result: {} });
  tcp.close(); mcp.close();
});
test('client connection cap also includes upgraded sockets', async t => {
  const started = await relay(t, { MAX_CONNECTIONS: 1 }), ws = await openWs(started.port); t.after(() => ws.close());
  assert.equal(ws.status, 101); await assert.rejects(request(started.port), /hang up|reset/i);
});
