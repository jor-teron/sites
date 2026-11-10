/* Remote RM1 — store CRUD/import/export/validation, port autofill, URL normalizer, tap toasts. */
'use strict';

var path = require('path');
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
var Url = require(path.join(app, 'rm_url.js'));
var Store = require(path.join(app, 'rm_store.js'));

assertEq(C.LS_CONNS, 'remote-conns-v1', 'storage key is remote-conns-v1');
assertEq(C.DEFAULT_PROTOCOL, 'sftp', 'default protocol is SFTP');
assertEq(C.DEFAULT_PORTS.ssh, 22, 'ssh default port 22');
assertEq(C.DEFAULT_PORTS.vnc, 5900, 'vnc default port 5900');
assertEq(C.DEFAULT_PORTS.sftp, 22, 'sftp default port 22');
assertEq(C.DEFAULT_PORTS.ftp, 21, 'ftp default port 21');
assertEq(C.HUB_THEME_KEY, 'sites-hub.theme', 'follows Hub theme key');

/* -------------------------------------------------------------------------- */
/* Memory storage                                                             */
/* -------------------------------------------------------------------------- */

function memoryStorage() {
  var mem = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
}

var tick = 1000;
function now() { tick += 1; return tick; }
var store = Store.make(memoryStorage(), now);

/* -------------------------------------------------------------------------- */
/* CRUD / validation                                                          */
/* -------------------------------------------------------------------------- */

var a = store.save({ name: 'Pi', protocol: 'sftp', host: '192.168.1.8', user: 'pi', group: 'Home', notes: 'lab' });
assert(typeof a !== 'string' && a.id, 'save returns an entry with id');
assertEq(a.protocol, 'sftp', 'saved protocol is sftp');
assertEq(a.port, '22', 'missing sftp port defaults to 22');
assertEq(a.user, 'pi', 'saved user');
assertEq(store.list().length, 1, 'list has one entry');
assertEq(store.get(a.id).name, 'Pi', 'get by id');

var badHost = store.save({ protocol: 'ssh', host: 'no spaces allowed', user: 'x' });
assert(typeof badHost === 'string' && /host/i.test(badHost), 'invalid host is a string error');

var badUser = store.save({ protocol: 'ssh', host: 'box', user: 'a@b' });
assert(typeof badUser === 'string' && /user/i.test(badUser), 'invalid user is a string error');

var badPort = store.save({ protocol: 'ftp', host: 'box', port: 70000 });
assert(typeof badPort === 'string' && /Port/i.test(badPort), 'port out of range is a string error');

var badProto = store.save({ protocol: 'rdp', host: 'box' });
assert(typeof badProto === 'string' && /protocol/i.test(badProto), 'unknown protocol is a string error');

var unnamed = store.save({ protocol: 'vnc', host: 'desk', port: 5900 });
assertEq(unnamed.name, 'desk', 'empty name defaults to host');
assertEq(unnamed.port, '5900', 'vnc port kept');

var updated = store.save({ id: a.id, name: 'Pi 5', protocol: 'sftp', host: '192.168.1.8', user: 'pi', group: 'Home' });
assertEq(updated.id, a.id, 'update keeps id');
assertEq(store.get(a.id).name, 'Pi 5', 'update changed the name');
assertEq(store.list().length, 2, 'update does not add a row');

/* Passwords must never be stored, even if a caller sends one. */
var withPass = store.save({ name: 'secret', protocol: 'ftp', host: 'files', user: 'me', password: 'nope', pass: 'nope' });
assert(withPass.password === undefined && withPass.pass === undefined, 'password fields are not stored');
assert(JSON.stringify(store.get(withPass.id)).indexOf('nope') < 0, 'password value is not in the stored entry');

/* Duplicate */
var dup = store.duplicate(a.id);
assertEq(dup.name, 'Pi 5 (copy)', 'duplicate adds a (copy) suffix');
assert(dup.id !== a.id, 'duplicate has a new id');
assertEq(dup.host, '192.168.1.8', 'duplicate keeps the host');
var dup2 = store.duplicate(a.id);
assertEq(dup2.name, 'Pi 5 (copy) 2', 'second duplicate gets a number');

/* Search and groups */
assert(store.search('home').some(function (x) { return x.id === a.id; }), 'search matches group');
assert(store.search('Pi 5').length >= 1, 'search matches name');
assertEq(store.search('zzzz').length, 0, 'search miss is empty');

var groups = store.grouped();
assert(groups.length >= 2, 'grouped returns Home and Ungrouped');
assertEq(groups[0].label, 'Home', 'named group comes first');
assertEq(groups[groups.length - 1].label, 'Ungrouped', 'ungrouped comes last when a named group exists');

var only = Store.make(memoryStorage(), now);
only.save({ name: 'A', protocol: 'ssh', host: 'a' });
only.save({ name: 'B', protocol: 'ssh', host: 'b' });
assertEq(only.grouped()[0].label, '', 'no group heading when every row is ungrouped');

/* Delete */
store.remove(withPass.id);
assertEq(store.get(withPass.id), null, 'removed entry is gone');

/* Export / import */
var json = store.exportJSON();
assert(json.indexOf('password') < 0, 'export JSON has no password field');
var parsed = JSON.parse(json);
assert(Array.isArray(parsed) && parsed.length === store.list().length, 'export is an array of the list');

var other = Store.make(memoryStorage(), now);
var imp = other.importJSON(json);
assertEq(imp.added, parsed.length, 'import adds every valid row');
assertEq(imp.skipped, 0, 'import skips none of a clean export');
assertEq(other.list().length, parsed.length, 'imported store size matches');

var wrapped = other.importJSON(JSON.stringify({
  connections: [
    { name: 'NAS', protocol: 'ftp', host: 'nas', port: 21, password: 'secret' },
    { protocol: 'ssh', host: 'bad host' }
  ]
}));
assertEq(wrapped.added, 1, 'object wrapper import adds the valid row');
assertEq(wrapped.skipped, 1, 'object wrapper import skips the invalid row');
assert(other.list().every(function (x) { return !x.password && JSON.stringify(x).indexOf('secret') < 0; }), 'imported passwords are dropped');

assert(typeof other.importJSON('{not json') === 'string', 'bad JSON is a string error');
assert(typeof other.importJSON('{"no":"list"}') === 'string', 'object without connections is a string error');

/* Relay validation through clean / save */
var badRelay = store.save({ name: 'x', protocol: 'ssh', host: 'box', relay: 'ftp://nope' });
assert(typeof badRelay === 'string' && /ws:\/\//i.test(badRelay), 'ftp relay is rejected');
var okRelay = store.save({ name: 'y', protocol: 'ssh', host: 'box', relay: 'wss://debian.example.ts.net/ws' });
assertEq(okRelay.relay, 'wss://debian.example.ts.net/ws', 'wss relay is stored');
var bareRelay = store.save({ name: 'z', protocol: 'ssh', host: 'box', relay: '192.168.1.5:8787/ws' });
assertEq(bareRelay.relay, '192.168.1.5:8787/ws', 'bare relay host is stored as typed');

/* -------------------------------------------------------------------------- */
/* Port autofill                                                              */
/* -------------------------------------------------------------------------- */

assertEq(Store.defaultPort('ssh'), 22, 'defaultPort ssh');
assertEq(Store.defaultPort('vnc'), 5900, 'defaultPort vnc');
assertEq(Store.defaultPort('sftp'), 22, 'defaultPort sftp');
assertEq(Store.defaultPort('ftp'), 21, 'defaultPort ftp');

assertEq(Store.portAfterProtocolChange('vnc', 22, 'sftp'), 5900, 'sftp 22 -> vnc fills 5900');
assertEq(Store.portAfterProtocolChange('ftp', 22, 'ssh'), 21, 'ssh 22 -> ftp fills 21');
assertEq(Store.portAfterProtocolChange('sftp', 5900, 'vnc'), 22, 'vnc 5900 -> sftp fills 22');
assertEq(Store.portAfterProtocolChange('ftp', 2222, 'ssh'), 2222, 'edited port is kept when protocol changes');
assertEq(Store.portAfterProtocolChange('vnc', '', 'sftp'), 5900, 'empty port fills the new default');

/* -------------------------------------------------------------------------- */
/* URL / relay normalizer                                                     */
/* -------------------------------------------------------------------------- */

var httpsBare = Url.normalizeRelay('debian.tail94ffdb.ts.net/ws', 'https:');
assert(httpsBare.ok, 'https bare host is ok');
assertEq(httpsBare.url, 'wss://debian.tail94ffdb.ts.net/ws', 'https bare host becomes wss://');
assertEq(httpsBare.insecure, false, 'wss on https is not insecure');

var httpBare = Url.normalizeRelay('192.168.1.8:8787/ws', 'http:');
assertEq(httpBare.url, 'ws://192.168.1.8:8787/ws', 'http bare host becomes ws://');

var keepWss = Url.normalizeRelay('wss://debian.example.ts.net/ws', 'http:');
assertEq(keepWss.url, 'wss://debian.example.ts.net/ws', 'typed wss:// is kept on an http page');

var keepWs = Url.normalizeRelay('ws://192.168.1.8:8787/ws', 'http:');
assertEq(keepWs.url, 'ws://192.168.1.8:8787/ws', 'typed ws:// is kept on an http page');

var warn = Url.normalizeRelay('ws://192.168.1.8:8787/ws', 'https:');
assert(warn.ok && warn.insecure, 'ws:// on https is ok but insecure');
assert(warn.warn && /wss:\/\//.test(warn.warn), 'https page warns that ws:// will not work');

var fromHttp = Url.normalizeRelay('http://192.168.1.8:8787/ws', 'https:');
assertEq(fromHttp.url, 'ws://192.168.1.8:8787/ws', 'http:// becomes ws://');
assert(fromHttp.insecure, 'converted http:// is insecure on https');

var fromHttps = Url.normalizeRelay('https://debian.example.ts.net/ws', 'https:');
assertEq(fromHttps.url, 'wss://debian.example.ts.net/ws', 'https:// becomes wss://');

var empty = Url.normalizeRelay('  ', 'https:');
assert(empty.ok && empty.url === '', 'empty relay is ok');

var otherScheme = Url.normalizeRelay('tcp://box:22', 'https:');
assert(!otherScheme.ok, 'tcp:// relay is rejected');

var noHost = Url.normalizeRelay('wss://', 'https:');
assert(!noHost.ok, 'scheme without a host is rejected');

/* -------------------------------------------------------------------------- */
/* Tap actions (no links to ../ssh/ or ../vnc/)                               */
/* -------------------------------------------------------------------------- */

assertEq(Store.tapAction({ protocol: 'ssh' }).message, 'viewer coming in a later RM release', 'ssh toast');
assertEq(Store.tapAction({ protocol: 'vnc' }).message, 'viewer coming in a later RM release', 'vnc toast');
assertEq(Store.tapAction({ protocol: 'sftp' }).message, 'coming in RM2', 'sftp toast');
assertEq(Store.tapAction({ protocol: 'ftp' }).message, 'coming in RM4', 'ftp toast');
assertEq(Store.tapAction({ protocol: 'ssh' }).action, 'toast', 'ssh action is toast not navigate');
assertEq(Store.tapAction({ protocol: 'vnc' }).action, 'toast', 'vnc action is toast not navigate');

var src = require('fs').readFileSync(path.join(app, 'rm_store.js'), 'utf8')
  + require('fs').readFileSync(path.join(app, 'rm_ui.js'), 'utf8')
  + require('fs').readFileSync(path.join(app, 'rm_main.js'), 'utf8')
  + require('fs').readFileSync(path.join(app, 'rm_config.js'), 'utf8')
  + require('fs').readFileSync(path.join(app, 'remote.html'), 'utf8');
assert(src.indexOf('../ssh/') < 0 && src.indexOf('../vnc/') < 0, 'app sources do not link to ../ssh/ or ../vnc/');
assert(src.indexOf('ssh-hosts-v1') < 0 && src.indexOf('vnc-hosts-v1') < 0, 'app sources do not reference SSH or VNC storage keys');

/* -------------------------------------------------------------------------- */

if (failed) {
  console.error(failed + ' test(s) failed');
  process.exit(1);
}
console.log('All RM1 tests passed.');
