/* Remote RM2 — tabs state, SFTP path helpers, client message build/parse, fake relay. */
'use strict';

var path = require('path');
var fs = require('fs');
var app = path.join(__dirname, '..');

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

var C = require(path.join(app, 'rm_config.js'));
var Store = require(path.join(app, 'rm_store.js'));
var Tabs = require(path.join(app, 'rm_tabs.js'));
var Path = require(path.join(app, 'rm_sftp_path.js'));
var Client = require(path.join(app, 'rm_sftp_client.js'));

assertEq(C.RELEASE, 'RM2', 'release tag is RM2');
assertEq(C.CONNECTIONS_TAB_ID, 'connections', 'connections tab id');
assert(C.SFTP_SECURITY_NOTE && /password/.test(C.SFTP_SECURITY_NOTE), 'security note mentions password');

/* -------------------------------------------------------------------------- */
/* Path / breadcrumbs / sort                                                  */
/* -------------------------------------------------------------------------- */

assert(Path.isValidName('readme.txt'), 'ordinary name is valid');
assert(!Path.isValidName(''), 'empty name is invalid');
assert(!Path.isValidName('.'), 'dot is invalid');
assert(!Path.isValidName('..'), 'dotdot is invalid');
assert(!Path.isValidName('a/b'), 'slash in a name is invalid');

assertEq(Path.parent(['a', 'b']).join('/'), 'a', 'parent of a/b is a');
assertEq(Path.parent([]).length, 0, 'parent of root is root');
assertEq(Path.join(['docs'], 'src').join('/'), 'docs/src', 'join appends a name');
assertEq(Path.join([], '..'), 'bad name', 'join rejects dotdot');

var crumbs = Path.breadcrumbs(['home', 'pi'], '~');
assertEq(crumbs.length, 3, 'breadcrumbs include the root');
assertEq(crumbs[0].label, '~', 'first crumb is the root label');
assertEq(crumbs[0].path.join('/'), '', 'root crumb has an empty path');
assertEq(crumbs[2].label, 'pi', 'last crumb is the leaf');
assertEq(crumbs[2].path.join('/'), 'home/pi', 'leaf crumb path is the full path');
assertEq(Path.formatPath(['home', 'pi'], '/home/u'), '/home/u/home/pi', 'formatPath joins under the root');
assertEq(Path.formatPath([], '/home/u'), '/home/u', 'formatPath of root is the root label');

var sorted = Path.sortEntries([
  { name: 'zeta.txt', isDir: false, size: 1 },
  { name: 'Beta', isDir: true },
  { name: 'alpha.txt', isDir: false, size: 2 },
  { name: 'aardvark', isDir: true }
]);
assertEq(sorted.map(function (e) { return e.name; }).join(','), 'aardvark,Beta,alpha.txt,zeta.txt', 'folders first then name');
assertEq(Path.formatSize(0), '0 B', 'zero bytes');
assertEq(Path.formatSize(2048), '2.0 KB', 'kilobytes');

/* -------------------------------------------------------------------------- */
/* Message building / parsing                                                 */
/* -------------------------------------------------------------------------- */

var open = Client.buildOpen({ token: 'sekrit', host: '192.168.1.8', port: '22', user: 'pi', pass: 'pw', root: '' });
assertEq(open.op, 'open', 'open op');
assertEq(open.token, 'sekrit', 'open token');
assertEq(open.host, '192.168.1.8', 'open host');
assertEq(open.port, 22, 'open port is a number');
assertEq(open.user, 'pi', 'open user');
assertEq(open.pass, 'pw', 'open pass is only in the in-memory message');
assertEq(open.root, '', 'open root defaults empty');
assert(open.id === undefined, 'open message has no id');

var req = Client.buildRequest(3, 'list', ['docs', 'src']);
assertEq(req.id, 3, 'request id');
assertEq(req.op, 'list', 'request op');
assertEq(req.path.join('/'), 'docs/src', 'request path is an array of names');

var ok = Client.parseReply(JSON.stringify({ id: 3, ok: true, entries: [{ name: 'a', isDir: true, size: 0, mtime: 1 }] }));
assert(ok.ok && ok.entries.length === 1 && ok.entries[0].isDir, 'parse list reply');
var err = Client.parseReply(JSON.stringify({ id: 0, ok: false, code: 'token', error: 'wrong relay token' }));
assertEq(err.code, 'token', 'parse error code');
assert(Client.parseReply(new ArrayBuffer(4)).binary, 'non-text frames are marked binary');
assertEq(Client.parseReply('not-json').code, 'bad', 'invalid JSON is a bad reply');

assert(/token/.test(Client.explainError('token')), 'token error text');
assert(/allowlist/.test(Client.explainError('allow')), 'allow error mentions allowlist');
assert(/password/.test(Client.explainError('auth')), 'auth error mentions password');
assert(/README/.test(Client.explainError('reach')), 'reach error points at the README');
assert(/README/.test(Client.explainError('hostkey', 'the server host key changed')), 'hostkey error points at the README');

/* -------------------------------------------------------------------------- */
/* Fake WebSocket relay                                                       */
/* -------------------------------------------------------------------------- */

function fakeRelay(spec) {
  spec = spec || {};
  function WS(url) {
    this.url = url;
    this.readyState = 0;
    this.binaryType = 'arraybuffer';
    this._self = this;
    var self = this;
    setTimeout(function () {
      if (spec.noOpen) {
        self.readyState = 3;
        if (self.onclose) self.onclose({});
        return;
      }
      self.readyState = 1;
      if (self.onopen) self.onopen();
    }, 0);
  }
  WS.prototype.send = function (text) {
    var self = this;
    var m;
    try { m = JSON.parse(text); } catch (e) { return; }
    setTimeout(function () {
      if (self.readyState !== 1) return;
      var reply;
      if (m.op === 'open') {
        if (spec.token && m.token !== spec.token) {
          reply = { id: 0, ok: false, code: 'token', error: 'wrong relay token' };
        } else if (spec.allow && spec.allow.indexOf(m.host + ':' + m.port) < 0) {
          reply = { id: 0, ok: false, code: 'allow', error: m.host + ':' + m.port + ' is not in the relay allowlist (allowlist.txt)' };
        } else if (spec.pass != null && m.pass !== spec.pass) {
          reply = { id: 0, ok: false, code: 'auth', error: 'wrong user or password' };
        } else {
          self.opened = m;
          reply = { id: 0, ok: true, root: spec.root || '/home/pi', max: 104857600 };
        }
      } else if (m.op === 'list') {
        var key = (m.path || []).join('/');
        var entries = (spec.files && spec.files[key]) || [
          { name: 'src', isDir: true, size: 0, mtime: 1700000000000 },
          { name: 'readme.txt', isDir: false, size: 12, mtime: 1700000001000 }
        ];
        reply = { id: m.id, ok: true, entries: entries };
      } else if (m.op === 'stat') {
        reply = { id: m.id, ok: true, isDir: false, size: 12, mtime: 1700000001000 };
      } else if (m.op === 'ping') {
        reply = { id: m.id, ok: true };
      } else {
        reply = { id: m.id, ok: false, code: 'bad', error: 'unknown op' };
      }
      if (self.onmessage) self.onmessage({ data: JSON.stringify(reply) });
    }, 0);
  };
  WS.prototype.close = function () {
    this.readyState = 3;
    if (this.onclose) this.onclose({});
  };
  return WS;
}

Promise.resolve().then(function () {
  return Client.connect({
    relay: 'ws://127.0.0.1:8023',
    token: 'tok',
    host: '192.168.1.8',
    port: 22,
    user: 'pi',
    pass: 'secret',
    WebSocket: fakeRelay({ token: 'tok', pass: 'secret', root: '/home/pi' })
  });
}).then(function (c) {
  assert(c && c.root === '/home/pi', 'fake relay open returns the account root');
  assertEq(c.max, 104857600, 'fake relay open returns max');
  assert(c.isOpen(), 'client is open');
  return c.list([]).then(function (entries) {
    assert(entries.length === 2, 'list returns entries');
    assert(entries.some(function (e) { return e.name === 'src' && e.isDir; }), 'list includes a folder');
    assert(entries.some(function (e) { return e.name === 'readme.txt' && e.size === 12; }), 'list includes a file with size');
    return c.stat(['readme.txt']);
  }).then(function (st) {
    assert(st.ok === true && st.size === 12 && st.isDir === false, 'stat returns size and isDir');
    c.close();
    assert(!c.isOpen(), 'close disconnects');
  });
}).then(function () {
  return Client.connect({
    relay: 'ws://127.0.0.1:8023',
    token: 'nope',
    host: 'h',
    port: 22,
    user: 'u',
    pass: 'p',
    WebSocket: fakeRelay({ token: 'tok' })
  }).then(function () {
    assert(false, 'wrong token should fail');
  }, function (e) {
    assert(e.sftp === 'token' && /token/i.test(e.message) && /README/.test(e.message), 'wrong token is explained');
  });
}).then(function () {
  return Client.connect({
    relay: 'ws://127.0.0.1:8023',
    token: 'tok',
    host: 'blocked.example',
    port: 22,
    user: 'u',
    pass: 'p',
    WebSocket: fakeRelay({ token: 'tok', allow: ['192.168.1.8:22'] })
  }).then(function () {
    assert(false, 'allow miss should fail');
  }, function (e) {
    assert(e.sftp === 'allow' && /allowlist/.test(e.message), 'allow miss is explained');
  });
}).then(function () {
  return Client.connect({
    relay: 'ws://127.0.0.1:8023',
    token: 'tok',
    host: '192.168.1.8',
    port: 22,
    user: 'u',
    pass: 'wrong',
    WebSocket: fakeRelay({ token: 'tok', pass: 'right' })
  }).then(function () {
    assert(false, 'bad password should fail');
  }, function (e) {
    assert(e.sftp === 'auth' && /password/.test(e.message), 'auth fail is explained');
  });
}).then(function () {
  return Client.connect({
    relay: 'ws://127.0.0.1:8023',
    token: 'tok',
    host: 'h',
    port: 22,
    WebSocket: fakeRelay({ noOpen: true })
  }).then(function () {
    assert(false, 'unreachable relay should fail');
  }, function (e) {
    assert(e.sftp === 'reach' && /README/.test(e.message), 'unreachable relay is explained');
  });
}).then(function () {

  /* -------------------------------------------------------------------------- */
  /* Tabs                                                                       */
  /* -------------------------------------------------------------------------- */

  var closed = 0;
  var fakeClient = { close: function () { closed += 1; }, isBusy: function () { return false; } };
  var tabs = Tabs.make();
  assertEq(tabs.list().length, 1, 'starts with the Connections tab');
  assertEq(tabs.list()[0].id, 'connections', 'first tab is Connections');
  assert(tabs.isConnections(), 'Connections is active at first');
  assertEq(tabs.close('connections').reason, 'fixed', 'Connections tab cannot be closed');

  var t1 = tabs.openSession({ connId: 'a', name: 'Pi', protocol: 'sftp', client: fakeClient, root: '/home/pi' });
  assertEq(t1.name, 'Pi', 'openSession uses the connection name');
  assertEq(t1.protocol, 'sftp', 'session tab has a protocol');
  assert(!tabs.isConnections(), 'opening a session selects it');
  assertEq(tabs.current().id, t1.id, 'current tab is the new session');
  assertEq(tabs.list().length, 2, 'Connections plus one session');

  tabs.select('connections');
  assert(tabs.isConnections(), 'select returns to Connections');
  assert(!!tabs.findByConn('a').client, 'switching away keeps the session client alive');

  var again = tabs.openSession({ connId: 'a', name: 'Pi', protocol: 'sftp' });
  assertEq(again.id, t1.id, 'opening the same connection focuses the existing tab');
  assertEq(tabs.list().length, 2, 'the same connection does not add a second tab');

  var busyClient = { close: function () { closed += 1; }, isBusy: function () { return true; } };
  var t2 = tabs.openSession({ connId: 'b', name: 'NAS', protocol: 'sftp', client: busyClient });
  assertEq(tabs.list().length, 3, 'a second session is added');
  var busy = tabs.close(t2.id);
  assertEq(busy.reason, 'busy', 'close of a busy tab needs confirm');
  assertEq(tabs.list().length, 3, 'busy tab stays open without confirm');
  var done = tabs.close(t2.id, { confirmed: true });
  assert(done.ok, 'confirmed close of a busy tab succeeds');
  assertEq(tabs.list().length, 2, 'busy tab is gone after confirm');

  var before = closed;
  var r = tabs.close(t1.id);
  assert(r.ok, 'idle tab closes');
  assertEq(closed, before + 1, 'closing a tab disconnects its client');
  assert(tabs.isConnections(), 'after the last session, Connections is shown');

  /* Token is stored only when passed; passwords never are. */
  function memoryStorage() {
    var mem = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; }
    };
  }
  var store = Store.make(memoryStorage(), function () { return 1; });
  var saved = store.save({ name: 'Pi', protocol: 'sftp', host: '192.168.1.8', user: 'pi', token: 'abc', password: 'nope' });
  assertEq(saved.token, 'abc', 'relay token can be saved on the connection');
  assert(saved.password === undefined && JSON.stringify(saved).indexOf('nope') < 0, 'password is still not stored');
  var noTok = store.save({ name: 'Other', protocol: 'sftp', host: 'box' });
  assert(noTok.token === undefined, 'token is omitted when it was not given');
  var other = Store.make(memoryStorage(), function () { return 2; });
  other.importJSON(JSON.stringify([{ name: 'X', protocol: 'sftp', host: 'h', token: 'kept', password: 'secret' }]));
  var row = other.list()[0];
  assertEq(row.token, 'kept', 'imported token is kept');
  assert(JSON.stringify(row).indexOf('secret') < 0, 'imported password is dropped');

  /* Sources stay standalone. */
  var src = ['rm_store.js', 'rm_ui.js', 'rm_main.js', 'rm_config.js', 'rm_tabs.js', 'rm_sftp_client.js', 'rm_sftp_view.js', 'rm_sftp_path.js', 'remote.html']
    .map(function (f) { return fs.readFileSync(path.join(app, f), 'utf8'); })
    .join('\n');
  assert(src.indexOf('../ssh/') < 0 && src.indexOf('../vnc/') < 0, 'RM2 sources do not link to ../ssh/ or ../vnc/');
  assert(src.indexOf('ssh-hosts-v1') < 0 && src.indexOf('vnc-hosts-v1') < 0, 'RM2 sources do not reference SSH or VNC storage keys');
  assert(src.indexOf("require('../") < 0 || src.indexOf('shared/fs') < 0, 'SFTP client does not import shared/fs');
  assert(!/from ['"].*shared\/fs/.test(src) && src.indexOf('SftpFs') < 0, 'no shared/fs SftpFs import');
  assert(/sftp_relay\.py/.test(fs.readFileSync(path.join(app, 'rm_sftp_client.js'), 'utf8')), 'client notes the protocol source');

  if (failed) {
    console.error(failed + ' test(s) failed');
    process.exit(1);
  }
  console.log('All RM2 tests passed.');
}).catch(function (e) {
  console.error('FAIL: unhandled', e && e.stack || e);
  process.exit(1);
});
