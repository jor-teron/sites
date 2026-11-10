/* Web MCP MCP2.2 — modular relay core, /health modules list, start-relay.sh. */
'use strict';

var path = require('path');
var http = require('http');
var fs = require('fs');
var cp = require('child_process');
var app = path.join(__dirname, '..');
var relayDir = path.join(app, 'relay');

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    failed += 1;
    console.error('FAIL:', msg, 'got', JSON.stringify(actual), 'expected', JSON.stringify(expected));
  } else {
    console.log('ok:', msg);
  }
}

/* -------------------------------------------------------------------------- */
/* Modules load                                                               */
/* -------------------------------------------------------------------------- */

var Config = require(path.join(relayDir, 'relay_config.js'));
var Core = require(path.join(relayDir, 'relay_core.js'));
var Ws = require(path.join(relayDir, 'relay_ws.js'));
var Mcp = require(path.join(relayDir, 'mod_mcp.js'));
var Relay = require(path.join(relayDir, 'web-mcp-relay.js'));

assert(Config && Config.PORT === 8787, 'config default port is 8787');
assertEq(Config.NOT_CONNECTED, 'Web MCP tab not connected', 'config not-connected message');
assert(typeof Core.createRelay === 'function', 'core exports createRelay');
assert(typeof Core.createLimiter === 'function', 'core exports createLimiter');
assert(typeof Ws.upgradeWebSocket === 'function', 'ws exports upgradeWebSocket');
assertEq(Mcp.name, 'mcp', 'mcp module name');
assert(typeof Mcp.createMcpModule === 'function', 'mcp exports createMcpModule');
assert(typeof Relay.startServer === 'function', 'entry exports startServer');
assert(typeof Relay.pinsMatch === 'function', 'entry re-exports pinsMatch');
assert(typeof Relay.parseMcpPin === 'function', 'entry re-exports parseMcpPin');
assertEq(Relay.CONFIG.PORT, 8787, 'entry CONFIG port is 8787');
assert(Relay.validPin('Abcd2345'), 'entry validPin ok');
assert(!Relay.validPin('short'), 'entry validPin rejects short');

/* -------------------------------------------------------------------------- */
/* HTTP helpers                                                               */
/* -------------------------------------------------------------------------- */

function httpReq(port, method, urlPath, body) {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      host: '127.0.0.1',
      port: port,
      path: urlPath,
      method: method,
      headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/* -------------------------------------------------------------------------- */
/* Live relay                                                                 */
/* -------------------------------------------------------------------------- */

async function relayTests() {
  var started = await Relay.startServer({ HOST: '127.0.0.1', PORT: 0, WS_PING_MS: 0, TRUST_PROXY: 0 });
  var port = started.port;
  try {
    assert(Array.isArray(started.modules) && started.modules.indexOf('mcp') >= 0, 'startServer lists mcp in modules');

    var health = await httpReq(port, 'GET', '/health');
    assertEq(health.status, 200, 'GET /health 200');
    assert(health.body.indexOf('ok') === 0, 'GET /health starts with ok');
    assert(/modules:\s*mcp/.test(health.body), 'GET /health lists the mcp module');

    var root = await httpReq(port, 'GET', '/');
    assertEq(root.status, 200, 'GET / 200');
    assertEq(root.body, 'Web MCP relay\n', 'GET / body');

    var noTab = await httpReq(port, 'POST', '/mcp/Abcd2345', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    assertEq(noTab.status, 200, 'POST /mcp/<PIN> with no tab is HTTP 200');
    var noTabJson = JSON.parse(noTab.body);
    assertEq(noTabJson.error.message, 'Web MCP tab not connected', 'no tab returns the existing error');
    assertEq(noTabJson.id, 1, 'no tab preserves the request id');

    var wrong = await httpReq(port, 'POST', '/mcp/WrongPin99', JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
    assertEq(wrong.status, 200, 'wrong PIN is HTTP 200');
    var wrongJson = JSON.parse(wrong.body);
    assertEq(wrongJson.error.message, 'Web MCP tab not connected', 'wrong PIN is rejected with the existing error');
    assertEq(wrongJson.id, 2, 'wrong PIN preserves the request id');

    var shortPin = await httpReq(port, 'POST', '/mcp/ab', JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' }));
    assertEq(shortPin.status, 200, 'short PIN is HTTP 200');
    var shortJson = JSON.parse(shortPin.body);
    assertEq(shortJson.error.message, 'Web MCP tab not connected', 'short PIN is rejected with the existing error');

    var getMcp = await httpReq(port, 'GET', '/mcp/Abcd2345');
    assertEq(getMcp.status, 405, 'GET /mcp/<PIN> 405');
    var headMcp = await httpReq(port, 'HEAD', '/mcp/Abcd2345');
    assertEq(headMcp.status, 405, 'HEAD /mcp/<PIN> 405');
  } finally {
    await started.close();
  }
}

/* -------------------------------------------------------------------------- */
/* start-relay.sh                                                             */
/* -------------------------------------------------------------------------- */

function scriptTests() {
  var script = path.join(relayDir, 'start-relay.sh');
  assert(fs.existsSync(script), 'start-relay.sh exists');
  var st = fs.statSync(script);
  assert((st.mode & 0o100) !== 0, 'start-relay.sh is executable');

  var syntax = cp.spawnSync('bash', ['-n', script], { encoding: 'utf8' });
  assertEq(syntax.status, 0, 'bash -n start-relay.sh exits 0');
  assertEq(syntax.stderr || '', '', 'bash -n start-relay.sh has no stderr');

  var help = cp.spawnSync('bash', [script, '--help'], { encoding: 'utf8' });
  assertEq(help.status, 0, 'start-relay.sh --help exits 0');
  assert(/start-relay\.sh/.test(help.stdout), '--help mentions the script name');
  assert(/--install/.test(help.stdout) && /--uninstall/.test(help.stdout), '--help lists --install and --uninstall');
  assert(/--no-funnel/.test(help.stdout) && /--no-update/.test(help.stdout), '--help lists --no-funnel and --no-update');
  assert(/8787/.test(help.stdout), '--help mentions port 8787');
  assert(/10001/.test(help.stdout), '--help mentions that 10001 is left alone');

  var unknown = cp.spawnSync('bash', [script, '--not-a-flag'], { encoding: 'utf8' });
  assert(unknown.status !== 0, 'unknown option exits non-zero');
}

scriptTests();

relayTests()
  .then(function () {
    if (failed) {
      console.error(failed + ' failed');
      process.exit(1);
    }
    console.log('All tests passed');
  })
  .catch(function (err) {
    console.error('ERROR:', err && err.stack ? err.stack : err);
    process.exit(1);
  });
