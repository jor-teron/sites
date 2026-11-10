/* Web MCP MCP1 — path containment, edit_file, JSON-RPC dispatch, relay round trip. */
'use strict';

var path = require('path');
var http = require('http');
var app = path.join(__dirname, '..');
var C = require(path.join(app, 'wm_config.js'));
var P = require(path.join(app, 'wm_paths.js'));
var T = require(path.join(app, 'wm_tools.js'));
var R = require(path.join(app, 'wm_rpc.js'));
var Relay = require(path.join(app, 'relay', 'web-mcp-relay.js'));

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
/* Path containment                                                           */
/* -------------------------------------------------------------------------- */

assertEq(P.resolvePath('a/b').ok, true, 'safe path ok');
assertEq(P.resolvePath('a/b').path, 'a/b', 'safe path value');
assertEq(P.resolvePath('a/./b').path, 'a/b', 'strip dot segments');
assertEq(P.resolvePath('a/../b').path, 'b', 'dotdot pops a segment');
assertEq(P.resolvePath('../b').path, 'b', 'dotdot stops at root and keeps b');
assertEq(P.resolvePath('../../etc/passwd').path, 'etc/passwd', 'dotdot cannot escape; lands inside root');
assertEq(P.resolvePath('').isRoot, true, 'empty is root');
assertEq(P.resolvePath('.').isRoot, true, 'dot is root');
assertEq(P.resolvePath('foo/bar/').path, 'foo/bar', 'trailing slash stripped');
assertEq(P.resolvePath('/etc/passwd').ok, false, 'reject absolute');
assertEq(P.resolvePath('/etc/passwd').reason, 'absolute', 'absolute reason');
assertEq(P.resolvePath('C:\\Windows\\x').ok, false, 'reject drive');
assertEq(P.resolvePath('//server/share').ok, false, 'reject unc');
assertEq(P.resolvePath('foo\0bar').ok, false, 'reject nul');
assertEq(P.resolvePath('CON.txt').ok, false, 'reject device name');
try {
  P.requirePath('/etc/passwd');
  assert(false, 'requirePath should throw on absolute');
} catch (err) {
  assert(/outside/.test(err.message), 'requirePath throws outside');
}

/* -------------------------------------------------------------------------- */
/* applyEdit (edit_file single-match logic)                                   */
/* -------------------------------------------------------------------------- */

var one = T.applyEdit('hello world', 'world', 'there', false);
assertEq(one.text, 'hello there', 'edit one match');
assertEq(one.replacements, 1, 'edit one replacements');

try {
  T.applyEdit('hello world', 'missing', 'x', false);
  assert(false, 'edit missing should throw');
} catch (err) {
  assertEq(err.message, 'old_string not found', 'edit missing message');
}

try {
  T.applyEdit('aaa aaa', 'aaa', 'b', false);
  assert(false, 'edit ambiguous should throw');
} catch (err) {
  assert(/ambiguous \(2 matches\)/.test(err.message), 'edit ambiguous message');
}

var all = T.applyEdit('aaa aaa', 'aaa', 'b', true);
assertEq(all.text, 'b b', 'edit replace_all');
assertEq(all.replacements, 2, 'edit replace_all count');

try {
  T.applyEdit('hello', '', 'x', false);
  assert(false, 'edit empty old should throw');
} catch (err) {
  assertEq(err.message, 'old_string is required', 'edit empty old message');
}

/* Non-overlapping count, like Python str.count. */
/* 'aaa'.count('aa') is 1 in Python (non-overlapping), so this is a single match. */
var overlap = T.applyEdit('aaa', 'aa', 'b', false);
assertEq(overlap.text, 'ba', 'edit non-overlapping first match only');
assertEq(overlap.replacements, 1, 'edit aaa/aa is one match');

/* -------------------------------------------------------------------------- */
/* JSON-RPC dispatch with a fake filesystem                                   */
/* -------------------------------------------------------------------------- */

function fakeFs() {
  /* Each fake filesystem gets its own isolated store so tests cannot leak into each other. */
  var files = {
    'readme.txt': 'hello world\nhello again\n',
    'src/app.js': 'const x = 1;\n'
  };
  var ready = true;
  return {
    files: files,
    isReady: function () { return ready; },
    setReady: function (v) { ready = v; },
    readFile: async function (rel, opts) {
      if (!Object.prototype.hasOwnProperty.call(files, rel.path)) throw new Error('path does not exist');
      var content = files[rel.path];
      var maxBytes = (opts && opts.maxBytes) || C.MAX_READ_BYTES;
      var truncated = content.length > maxBytes;
      return { path: rel.path, content: truncated ? content.slice(0, maxBytes) : content, truncated: truncated };
    },
    writeFile: async function (rel, content) {
      files[rel.path] = content;
      return { path: rel.path, bytes: Buffer.byteLength(content, 'utf8') };
    },
    listDir: async function (rel) {
      var prefix = rel.isRoot ? '' : rel.path + '/';
      var entries = [];
      Object.keys(files).forEach(function (p) {
        if (prefix && p.indexOf(prefix) !== 0) return;
        if (!prefix && p.indexOf('/') >= 0) return;
        var name = prefix ? p.slice(prefix.length) : p;
        if (name.indexOf('/') >= 0) return;
        entries.push({ name: name, path: p, type: 'file', size: files[p].length, depth: 1 });
      });
      return { path: rel.path, entries: entries, truncated: false };
    },
    deletePath: async function (rel) {
      if (!Object.prototype.hasOwnProperty.call(files, rel.path)) throw new Error('path does not exist');
      delete files[rel.path];
      return { path: rel.path, deleted: true };
    },
    movePath: async function (src, dest) {
      if (!Object.prototype.hasOwnProperty.call(files, src.path)) throw new Error('path does not exist');
      files[dest.path] = files[src.path];
      delete files[src.path];
      return { src: src.path, dest: dest.path };
    }
  };
}

async function rpcTests() {
  var fs = fakeFs();
  var files = fs.files;
  var tools = T.createTools(fs);

  var init = await R.dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, tools);
  assertEq(init.reply.result.protocolVersion, '2025-03-26', 'initialize echoes 2025-03-26');
  assertEq(init.reply.result.serverInfo.name, 'web-mcp', 'initialize serverInfo.name');
  assert(init.reply.result.capabilities && init.reply.result.capabilities.tools, 'initialize capabilities.tools');

  var unknownVer = await R.dispatch({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: 'nope' } }, tools);
  assertEq(unknownVer.reply.result.protocolVersion, C.DEFAULT_PROTOCOL_VERSION, 'initialize falls back');

  var ping = await R.dispatch({ jsonrpc: '2.0', id: 3, method: 'ping' }, tools);
  assert(ping.reply.result && Object.keys(ping.reply.result).length === 0, 'ping result is {}');

  var inited = await R.dispatch({ jsonrpc: '2.0', method: 'notifications/initialized' }, tools);
  assertEq(inited.notification, true, 'initialized is a notification');
  assertEq(inited.reply, null, 'initialized has no body');

  var listed = await R.dispatch({ jsonrpc: '2.0', id: 4, method: 'tools/list' }, tools);
  var names = listed.reply.result.tools.map(function (t) { return t.name; }).sort();
  assertEq(names.join(','), 'delete_path,edit_file,list_dir,move_path,read_file,run_command,write_file', 'tools/list names');
  assert(names.indexOf('run_command') >= 0, 'tools/list includes run_command');

  var read = await R.dispatch({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'read_file', arguments: { path: 'readme.txt' } } }, tools);
  assertEq(read.reply.result.isError, false, 'read_file ok');
  assert(/hello world/.test(read.reply.result.content[0].text), 'read_file content');
  assertEq(read.log.ok, true, 'read_file log ok');
  assertEq(read.log.name, 'read_file', 'read_file log name');
  assertEq(read.log.path, 'readme.txt', 'read_file log path');

  var edit = await R.dispatch({
    jsonrpc: '2.0', id: 6, method: 'tools/call',
    params: { name: 'edit_file', arguments: { path: 'readme.txt', old_string: 'hello world', new_string: 'hi world' } }
  }, tools);
  assertEq(edit.reply.result.isError, false, 'edit_file ok');
  assertEq(files['readme.txt'].indexOf('hi world') >= 0, true, 'edit_file applied');

  var amb = await R.dispatch({
    jsonrpc: '2.0', id: 7, method: 'tools/call',
    params: { name: 'edit_file', arguments: { path: 'readme.txt', old_string: 'hi', new_string: 'x' } }
  }, tools);
  /* 'hi world\nhello again\n' after the first edit has one 'hi' — use a file with two matches instead. */
  files['dup.txt'] = 'foo foo';
  var amb2 = await R.dispatch({
    jsonrpc: '2.0', id: 8, method: 'tools/call',
    params: { name: 'edit_file', arguments: { path: 'dup.txt', old_string: 'foo', new_string: 'bar' } }
  }, tools);
  assertEq(amb2.reply.result.isError, true, 'edit_file ambiguous isError');
  assert(/ambiguous/.test(amb2.reply.result.content[0].text), 'edit_file ambiguous text');

  fs.setReady(false);
  var denied = await R.dispatch({
    jsonrpc: '2.0', id: 9, method: 'tools/call',
    params: { name: 'list_dir', arguments: { path: '.' } }
  }, tools);
  assertEq(denied.reply.result.isError, true, 'permission needed isError');
  assertEq(denied.reply.result.content[0].text, 'Error: ' + C.PERMISSION_ERROR, 'permission needed text');
  fs.setReady(true);

  var escaped = await R.dispatch({
    jsonrpc: '2.0', id: 10, method: 'tools/call',
    params: { name: 'read_file', arguments: { path: '/etc/passwd' } }
  }, tools);
  assertEq(escaped.reply.result.isError, true, 'absolute path isError');
  assert(/outside/.test(escaped.reply.result.content[0].text), 'absolute path message');

  var listedDir = await R.dispatch({
    jsonrpc: '2.0', id: 11, method: 'tools/call',
    params: { name: 'list_dir', arguments: { path: '.' } }
  }, tools);
  assertEq(listedDir.reply.result.isError, false, 'list_dir ok');
  assert(/readme\.txt/.test(listedDir.reply.result.content[0].text), 'list_dir has readme');

  var moved = await R.dispatch({
    jsonrpc: '2.0', id: 12, method: 'tools/call',
    params: { name: 'move_path', arguments: { src: 'src/app.js', dest: 'src/main.js' } }
  }, tools);
  assertEq(moved.reply.result.isError, false, 'move_path ok');
  assert(files['src/main.js'] && !files['src/app.js'], 'move_path swapped keys');

  var wrote = await R.dispatch({
    jsonrpc: '2.0', id: 13, method: 'tools/call',
    params: { name: 'write_file', arguments: { path: 'new/file.txt', content: 'fresh' } }
  }, tools);
  assertEq(wrote.reply.result.isError, false, 'write_file ok');
  assertEq(files['new/file.txt'], 'fresh', 'write_file stored');

  var missing = await R.dispatch({ jsonrpc: '2.0', id: 14, method: 'nope' }, tools);
  assertEq(missing.reply.error.code, -32601, 'method not found');

  void amb;
}

/* -------------------------------------------------------------------------- */
/* Relay: start on a random port, fake tab, POST tools/list                   */
/* -------------------------------------------------------------------------- */

function httpPost(port, urlPath, body) {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      host: '127.0.0.1',
      port: port,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpGet(port, urlPath) {
  return new Promise(function (resolve, reject) {
    var req = http.request({
      host: '127.0.0.1',
      port: port,
      path: urlPath,
      method: 'GET'
    }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function relayTests() {
  assertEq(Relay.parseMcpPin('/mcp/Abcd2345'), 'Abcd2345', 'parseMcpPin');
  assertEq(Relay.parseMcpPin('/mcp/Abcd2345/'), 'Abcd2345', 'parseMcpPin trailing slash');
  assertEq(Relay.parseMcpPin('/ws'), null, 'parseMcpPin rejects /ws');
  assert(Relay.pinsMatch('secret1', 'secret1'), 'pinsMatch equal');
  assert(!Relay.pinsMatch('secret1', 'secret2'), 'pinsMatch unequal');
  assert(Relay.validPin('Abcd2345'), 'validPin ok');
  assert(Relay.validPin('123456'), 'validPin numeric');
  assert(!Relay.validPin('short'), 'validPin short');

  var started = await Relay.startServer({ HOST: '127.0.0.1', PORT: 0, WS_PING_MS: 0, TRUST_PROXY: 0 });
  var port = started.port;
  try {
    var health = await httpGet(port, '/health');
    assertEq(health.status, 200, 'GET /health 200');
    assertEq(health.body, 'ok\n', 'GET /health body');

    var noTab = await httpPost(port, '/mcp/Abcd2345', JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    assertEq(noTab.status, 200, 'missing tab HTTP 200');
    var noTabJson = JSON.parse(noTab.body);
    assertEq(noTabJson.error.message, 'Web MCP tab not connected', 'missing tab message');

    var getMcp = await httpGet(port, '/mcp/Abcd2345');
    assertEq(getMcp.status, 405, 'GET /mcp/<PIN> 405');

    var pin = 'Abcd2345';
    var ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
    await new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('ws timeout')); }, 5000);
      ws.addEventListener('error', function (ev) {
        clearTimeout(timer);
        reject(ev.error || new Error('ws error'));
      });
      ws.addEventListener('open', function () {
        ws.send(JSON.stringify({ type: 'hello', pin: pin }));
      });
      ws.addEventListener('message', function (ev) {
        var msg = JSON.parse(ev.data);
        if (msg.type === 'hello-ok') {
          clearTimeout(timer);
          resolve();
        } else if (msg.type === 'hello-error') {
          clearTimeout(timer);
          reject(new Error(msg.error || 'hello-error'));
        }
      });
    });

    /* The fake tab dispatches with a fake fs through the real RPC module. */
    var tabFs = fakeFs();
    var tabTools = T.createTools(tabFs);
    ws.addEventListener('message', function (ev) {
      var msg = JSON.parse(ev.data);
      if (msg.type !== 'rpc') return;
      R.dispatch(msg.payload, tabTools).then(function (result) {
        if (result.notification) return;
        ws.send(JSON.stringify({ type: 'rpc-result', id: msg.id, payload: result.reply }));
      });
    });

    var listed = await httpPost(port, '/mcp/' + pin, JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list' }));
    assertEq(listed.status, 200, 'POST tools/list 200');
    var listedJson = JSON.parse(listed.body);
    assertEq(listedJson.id, 7, 'tools/list preserves id');
    var toolNames = listedJson.result.tools.map(function (t) { return t.name; });
    assert(toolNames.indexOf('read_file') >= 0, 'round trip tools/list has read_file');
    assertEq(toolNames.length, 7, 'round trip tools/list has 7 tools');
    assert(toolNames.indexOf('run_command') >= 0, 'round trip tools/list has run_command');

    var read = await httpPost(port, '/mcp/' + pin, JSON.stringify({
      jsonrpc: '2.0', id: 8, method: 'tools/call',
      params: { name: 'read_file', arguments: { path: 'readme.txt' } }
    }));
    var readJson = JSON.parse(read.body);
    assertEq(readJson.result.isError, false, 'round trip read_file ok');
    assert(/hello world/.test(readJson.result.content[0].text), 'round trip read_file content');

    var notified = await httpPost(port, '/mcp/' + pin, JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    assertEq(notified.status, 202, 'notification returns 202');

    /* A newer tab with the same PIN replaces the older one. */
    var ws2 = new WebSocket('ws://127.0.0.1:' + port + '/ws');
    var replaced = false;
    ws.addEventListener('message', function (ev) {
      var msg = JSON.parse(ev.data);
      if (msg.type === 'replaced') replaced = true;
    });
    await new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error('second tab timeout')); }, 5000);
      ws2.addEventListener('error', function (ev) {
        clearTimeout(timer);
        reject(ev.error || new Error('ws2 error'));
      });
      ws2.addEventListener('open', function () {
        ws2.send(JSON.stringify({ type: 'hello', pin: pin }));
      });
      ws2.addEventListener('message', function (ev) {
        var msg = JSON.parse(ev.data);
        if (msg.type === 'hello-ok') {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    /* Give the first tab a tick to receive 'replaced'. */
    await new Promise(function (r) { setTimeout(r, 50); });
    assert(replaced, 'older tab is told it was replaced');

    ws.close();
    ws2.close();
  } finally {
    await started.close();
  }
}

rpcTests()
  .then(relayTests)
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
