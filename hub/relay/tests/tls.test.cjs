/* Test-only generated self-signed certificate; never uses the user's keys. */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { startServer } = require('../hub-relay.js');
const { request, openWs } = require('./helpers.cjs');
test('optional HTTPS/WSS: health and unchanged MCP hello over TLS', async t => {
  const available = spawnSync('openssl', ['version']);
  if (available.error) { t.skip('openssl needed only to generate a test certificate'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rl1-tls-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const key = path.join(dir, 'test-key.pem'), cert = path.join(dir, 'test-cert.pem');
  const generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-keyout', key, '-out', cert], { encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr);
  const relay = await startServer({ PORT: 0, MODULES: ['mcp'], TLS_CERT: cert, TLS_KEY: key, WS_PING_MS: 0 });
  t.after(() => relay.close());
  assert.equal((await request(relay.port, '/health', { tls: true })).status, 200);
  const ws = await openWs(relay.port, '/ws', { tls: true }); t.after(() => ws.close());
  assert.equal(ws.status, 101); ws.json({ type: 'hello', pin: 'TLS_123' });
  assert.equal(JSON.parse((await ws.next()).text).type, 'hello-ok');
  assert.equal((await openWs(relay.port, '/ws', { tls: true, origin: 'https://evil.example' })).status, 403);
});
