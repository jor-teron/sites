/* Remote RM4 — VNC tap action, relay URL, quality/compression, error text, standalone sources. */
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

/* In-memory storage used by the store tests. */
function memoryStorage() {
  var mem = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; }
  };
}

var C = require(path.join(app, 'rm_config.js'));
var Store = require(path.join(app, 'rm_store.js'));
var Client = require(path.join(app, 'rm_vnc_client.js'));

assert(/^RM\d+$/.test(C.RELEASE), 'release tag is RMn');
/* (before RM7) assertEq(C.RELEASE, 'RM4', 'this release is tagged RM4'); */
assertEq(C.RELEASE, 'RM7', 'this release is tagged RM7');
assert(C.PROTOCOLS.indexOf('vnc') >= 0, 'vnc is in the protocol list');
assertEq(C.DEFAULT_PORTS.vnc, 5900, 'vnc default port is 5900');
assertEq(C.PROTOCOL_LABELS.vnc, 'VNC', 'vnc label');
assertEq(Store.tapAction({ protocol: 'vnc' }).action, 'vnc', 'vnc row opens a viewer tab');
assert(Store.tapAction({ protocol: 'vnc' }).message === undefined, 'vnc row is not a toast');
assertEq(Store.tapAction({ protocol: 'sftp' }).action, 'sftp', 'sftp row still opens browse');
assertEq(Store.tapAction({ protocol: 'ssh' }).action, 'ssh', 'ssh row still opens a terminal');
assertEq(Store.tapAction({ protocol: 'webdav' }).action, 'webdav', 'webdav row still opens files');
assertEq(Store.tapAction({ protocol: 'ftp' }).message, 'parked', 'ftp row is still parked');
assertEq(Store.tapAction({ protocol: 'spice' }).action, 'toast', 'unknown protocol is a toast');
assert(C.VNC_SECURITY_NOTE.indexOf('plain bytes') >= 0, 'security note mentions the relay can see the session');
assertEq(C.VNC_QUALITY_DEFAULT, 6, 'default quality is 6');
assertEq(C.VNC_COMPRESSION_DEFAULT, 2, 'default compression is 2');
assertEq(C.VNC_QUALITY_LOW, 0, 'low-bandwidth quality is 0');
assertEq(C.VNC_COMPRESSION_LOW, 9, 'low-bandwidth compression is 9');

/* Relay URL and token */
assertEq(Client.targetToken('192.168.1.8', 5900), '192.168.1.8:5900', 'token is host:port');
assertEq(Client.targetToken('192.168.1.8', ''), '192.168.1.8:5900', 'empty port defaults to 5900');
assertEq(Client.targetToken('2001:db8::1', 5901), '[2001:db8::1]:5901', 'IPv6 token uses brackets');
assertEq(Client.targetToken('[2001:db8::1]', 5900), '[2001:db8::1]:5900', 'existing brackets are not doubled');

var empty = Client.buildRelayUrl('', 'h', 5900);
assert(!empty.ok, 'empty relay is rejected');
assertEq(empty.code, 'bad-relay', 'empty relay code is bad-relay');

var bad = Client.buildRelayUrl('not a url', 'h', 5900);
assert(!bad.ok, 'invalid relay is rejected');

var ws = Client.buildRelayUrl('ws://192.168.1.8:8022', '10.0.0.5', 5900);
assert(ws.ok, 'ws relay is accepted');
assert(ws.url.indexOf('ws://192.168.1.8:8022') === 0, 'ws scheme is kept');
assert(ws.url.indexOf('token=10.0.0.5%3A5900') >= 0 || ws.url.indexOf('token=10.0.0.5:5900') >= 0, 'token is on the query');

var http = Client.buildRelayUrl('http://box:8022', 'h', 5900);
assert(http.ok && http.url.indexOf('ws://box:8022') === 0, 'http becomes ws');

var https = Client.buildRelayUrl('https://box:8022', 'h', 5901);
assert(https.ok && https.url.indexOf('wss://box:8022') === 0, 'https becomes wss');
assert(/token=h%3A5901|token=h:5901/.test(https.url), 'non-default port is in the token');

var ftp = Client.buildRelayUrl('ftp://box', 'h', 5900);
assert(!ftp.ok, 'ftp relay is rejected');

/* Quality / compression */
assertEq(Client.clampLevel(undefined, 6), 6, 'missing level uses the default');
assertEq(Client.clampLevel('3', 6), 3, 'numeric string is parsed');
assertEq(Client.clampLevel(-2, 6), 0, 'below 0 clamps to 0');
assertEq(Client.clampLevel(15, 6), 9, 'above 9 clamps to 9');
assertEq(Client.qualityOf({}), 6, 'qualityOf default');
assertEq(Client.compressionOf({}), 2, 'compressionOf default');
assertEq(Client.qualityOf({ quality: 1 }), 1, 'qualityOf stored value');
assertEq(Client.lowBandwidth().quality, 0, 'low-bandwidth quality');
assertEq(Client.lowBandwidth().compression, 9, 'low-bandwidth compression');

var store = Store.make(memoryStorage());
var saved = store.save({
  name: 'desk',
  protocol: 'vnc',
  host: '192.168.1.20',
  port: 5900,
  relay: 'ws://192.168.1.8:8022',
  quality: 15,
  compression: -1,
  password: 'secret'
});
assert(typeof saved !== 'string', 'vnc connection saves: ' + saved);
assertEq(saved.quality, 9, 'saved quality is clamped to 9');
assertEq(saved.compression, 0, 'saved compression is clamped to 0');
assert(saved.password === undefined, 'vnc password is not stored');
assertEq(saved.port, '5900', 'vnc port is stored');

var def = store.save({ protocol: 'vnc', host: 'desk', relay: 'wss://relay:8022' });
assertEq(def.quality, 6, 'missing quality uses the default');
assertEq(def.compression, 2, 'missing compression uses the default');

var copy = store.duplicate(saved.id);
assert(typeof copy !== 'string' && copy.quality === 9 && copy.compression === 0, 'duplicate keeps quality and compression');

/* Errors */
var reach = Client.explainClose({ clean: false }, 'connecting');
assertEq(reach.code, 'relay-down', 'failed open is relay-down');
assert(reach.message.toLowerCase().indexOf('relay') >= 0, 'relay-down mentions the relay');

var allow = Client.explainClose({ reason: 'host is not in the allowlist' }, 'connecting');
assertEq(allow.code, 'allow', 'allowlist wording is detected');
assert(allow.message.indexOf('allowlist') >= 0, 'allow error mentions allowlist');

var auth = Client.explainClose({}, 'authfail');
assertEq(auth.code, 'auth', 'authfail state is auth');
assert(auth.message.toLowerCase().indexOf('password') >= 0, 'auth error mentions password');

var lost = Client.explainClose({ clean: false }, 'connected');
assertEq(lost.code, 'closed', 'drop after connect is closed');
assert(lost.message.toLowerCase().indexOf('lost') >= 0, 'unclean close says lost');

var bye = Client.explainClose({ clean: true }, 'connected');
assertEq(bye.code, 'closed', 'clean close is closed');
assertEq(bye.message, C.VNC_ERR_CLOSED_CLEAN, 'clean close uses the disconnected text');

var sec = Client.explainAuth({ reason: 'wrong password' });
assertEq(sec.code, 'auth', 'securityfailure is auth');
assert(sec.message.indexOf('wrong password') >= 0, 'securityfailure includes the server reason');

/* Standalone sources and vendor copy */
var files = [
  'rm_store.js', 'rm_ui.js', 'rm_main.js', 'rm_config.js', 'rm_tabs.js',
  'rm_vnc_client.js', 'rm_vnc_view.js', 'remote.html'
];
var src = files.map(function (f) { return fs.readFileSync(path.join(app, f), 'utf8'); }).join('\n');
assert(src.indexOf('../ssh/') < 0 && src.indexOf('../vnc/') < 0, 'RM4 sources do not link to ../ssh/ or ../vnc/');
assert(src.indexOf('ssh-hosts-v1') < 0 && src.indexOf('vnc-hosts-v1') < 0, 'RM4 sources do not reference SSH or VNC host-list keys');
assert(src.indexOf('ssh-known-hosts-v1') < 0, 'RM4 sources do not reference the SSH app known-hosts key');
assert(src.indexOf('ssh-settings-v1') < 0, 'RM4 sources do not reference the SSH app settings key');
assert(src.indexOf('vendor/novnc/core/rfb.js') >= 0, 'the client loads Remote\'s own noVNC copy');
assert(src.indexOf('rm_vnc_view.js') >= 0, 'the page loads the VNC view');
assert(src.indexOf('id="view-vnc"') >= 0, 'the page has a VNC pane');
assert(src.indexOf('id="f-quality"') >= 0, 'the editor has a quality field');
assert(src.indexOf('id="btn-vnc-lowbw"') >= 0, 'the editor has a Low bandwidth button');
assert(src.indexOf('id="vnc-menu"') >= 0, 'the page has a VNC overflow menu');
assert(src.indexOf('Ctrl+Alt+Del') >= 0, 'the menu includes Ctrl+Alt+Del');

var vendor = [
  'novnc/LICENSE.txt', 'novnc/VERSION', 'novnc/core/rfb.js',
  'novnc/vendor/pako/LICENSE', 'README.md'
];
vendor.forEach(function (f) {
  var fp = path.join(app, 'vendor', f);
  assert(fs.existsSync(fp) && fs.statSync(fp).size > 0, 'vendor/' + f + ' is present');
});
assertEq(fs.readFileSync(path.join(app, 'vendor/novnc/VERSION'), 'utf8').trim(), 'v1.7.0', 'noVNC version is 1.7.0');
var vreadme = fs.readFileSync(path.join(app, 'vendor', 'README.md'), 'utf8');
assert(/1\.7\.0/.test(vreadme) && /MPL/.test(vreadme), 'vendor README records noVNC version and licence');
assert(vreadme.indexOf('../vnc/') < 0, 'vendor README does not link to the VNC app');

var html = fs.readFileSync(path.join(app, 'remote.html'), 'utf8');
assert(/RM\d+/.test(html), 'the page has an RM tag');
assert(html.indexOf('view-vnc') >= 0, 'the page includes the VNC pane id');

if (failed) {
  console.error(failed + ' test(s) failed');
  process.exit(1);
}
console.log('All RM4 tests passed.');
