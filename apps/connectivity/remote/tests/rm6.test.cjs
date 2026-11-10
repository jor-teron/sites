/* Remote RM6 — SSH tap action, relay URL, known hosts, font size, key sequences, standalone sources. */
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

/* In-memory storage used by the known-hosts tests. */
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
var Known = require(path.join(app, 'rm_ssh_known.js'));
var Client = require(path.join(app, 'rm_ssh_client.js'));
var Term = require(path.join(app, 'rm_ssh_term.js'));

assertEq(C.RELEASE, 'RM6', 'release tag is RM6');
assertEq(C.LS_SSH_KNOWN, 'remote-known-hosts-v1', 'known hosts use Remote\'s own key');
assertEq(C.LS_SSH_FONT, 'remote-ssh-font-v1', 'font uses Remote\'s own key');
assert(C.SSH_SECURITY_NOTE && /encrypted/.test(C.SSH_SECURITY_NOTE), 'SSH security note mentions encrypted bytes');
assert(C.SSH_ERR_REACH_RELAY.indexOf('8022') >= 0, 'reach-relay error mentions port 8022');
assert(C.SSH_ERR_ALLOW.indexOf('allowlist') >= 0, 'allowlist error is clear');
assertEq(C.SSH_FONT_DEFAULT, 15, 'default font 15');
assertEq(C.DEFAULT_PORTS.ssh, 22, 'ssh default port still 22');

/* -------------------------------------------------------------------------- */
/* Tap actions                                                                */
/* -------------------------------------------------------------------------- */

assertEq(Store.tapAction({ protocol: 'ssh' }).action, 'ssh', 'ssh row opens a terminal');
assert(Store.tapAction({ protocol: 'ssh' }).message === undefined, 'ssh row is not a toast');
assertEq(Store.tapAction({ protocol: 'sftp' }).action, 'sftp', 'sftp row still opens browse');
assertEq(Store.tapAction({ protocol: 'vnc' }).action, 'toast', 'vnc row is still a toast');
assertEq(Store.tapAction({ protocol: 'vnc' }).message, C.TOAST_VIEWER_LATER, 'vnc toast text');
assertEq(Store.tapAction({ protocol: 'ftp' }).action, 'toast', 'ftp row is still a toast');
assertEq(Store.tapAction({ protocol: 'webdav' }).action, 'toast', 'unknown protocol is a toast');

/* -------------------------------------------------------------------------- */
/* Relay URL / token                                                          */
/* -------------------------------------------------------------------------- */

assertEq(Client.targetToken('192.168.1.8', 22), '192.168.1.8:22', 'target token for IPv4');
assertEq(Client.targetToken('192.168.1.8', '22'), '192.168.1.8:22', 'target token accepts a string port');
assertEq(Client.targetToken('box', ''), 'box:22', 'missing port defaults to 22');
assertEq(Client.targetToken('2001:db8::1', 22), '[2001:db8::1]:22', 'target token brackets IPv6');
assertEq(Client.targetToken('[2001:db8::1]', 2222), '[2001:db8::1]:2222', 'already-bracketed IPv6 is normalized');

var empty = Client.buildRelayUrl('', 'box', 22);
assert(!empty.ok, 'empty relay is rejected');
assertEq(empty.code, 'bad-relay', 'empty relay code is bad-relay');

var bad = Client.buildRelayUrl('ftp://box:8022', 'h', 22);
assert(!bad.ok, 'ftp relay is rejected');

var ws = Client.buildRelayUrl('ws://192.168.1.8:8022', 'pi.local', 22);
assert(ws.ok, 'ws relay is accepted');
assert(ws.url.indexOf('ws://192.168.1.8:8022') === 0, 'ws host and port are kept');
assert(ws.url.indexOf('token=pi.local%3A22') >= 0 || ws.url.indexOf('token=pi.local:22') >= 0, 'token query is host:port');

var http = Client.buildRelayUrl('http://192.168.1.8:8022', 'box', 22);
assert(http.ok && http.url.indexOf('ws://192.168.1.8:8022') === 0, 'http:// becomes ws://');

var https = Client.buildRelayUrl('https://relay.example.ts.net:8022', 'box', 22);
assert(https.ok && https.url.indexOf('wss://relay.example.ts.net:8022') === 0, 'https:// becomes wss://');

var v6 = Client.buildRelayUrl('wss://r:8022', '2001:db8::1', 22);
assert(v6.ok, 'wss + IPv6 target is accepted');
assert(/token=.*2001/.test(v6.url), 'IPv6 target is in the token query');

var replaced = Client.buildRelayUrl('ws://r:8022/?token=other:1', 'box', 22);
assert(replaced.url.indexOf('other:1') < 0, 'a previous token query is replaced by the target');
assert(replaced.url.indexOf('box') >= 0, 'the new token is the SSH target');

/* -------------------------------------------------------------------------- */
/* Handshake error text                                                       */
/* -------------------------------------------------------------------------- */

var ed = Client.explainHandshake('Failed PublicKey negotiation: Server (ssh-ed25519)');
assert(ed && ed.code === 'ed25519', 'ed25519 host key becomes a clear error');
assert(/Ed25519/i.test(ed.message), 'ed25519 host-key message names Ed25519');

var kex = Client.explainHandshake('Failed KeyExchange negotiation: Server (curve25519-sha256)');
assert(kex && kex.code === 'ed25519', 'curve25519 kex becomes a clear error');
assert(/curve25519/i.test(kex.message), 'kex message names curve25519');

assertEq(Client.explainHandshake('some other failure'), null, 'unrelated handshake text is left alone');

/* -------------------------------------------------------------------------- */
/* Known hosts + font                                                         */
/* -------------------------------------------------------------------------- */

assertEq(Known.hostId('Box.LAN', 22), 'box.lan:22', 'host id is lower-cased');
assertEq(Known.hostId('[2001:db8::1]', '22'), '[2001:db8::1]:22', 'host id brackets IPv6');
assertEq(Known.hostId('box'), 'box:22', 'host id defaults the port to 22');

var clock = 1000;
var kh = Known.make(memoryStorage(), function () { return clock; });
var info = { alg: 'ecdsa-sha2-nistp256', fp: 'SHA256:' + 'A'.repeat(43) };
var id = Known.hostId('pi.local', 22);
var first = kh.check(id, info);
assertEq(first.status, 'new', 'unknown host is new');
assertEq(first.entry, null, 'new host has no saved entry');

var saved = kh.trust(id, info);
assertEq(saved.fp, info.fp, 'trusted fingerprint is stored');
assertEq(saved.first, 1000, 'first-seen time is recorded');
clock = 2000;
var again = kh.check(id, info);
assertEq(again.status, 'known', 'matching fingerprint is known');
kh.seen(id);
assertEq(kh.list()[0].last, 2000, 'seen() updates last');
assertEq(kh.list()[0].first, 1000, 'first-seen is kept');

clock = 3000;
var changed = kh.check(id, { alg: info.alg, fp: 'SHA256:' + 'B'.repeat(43) });
assertEq(changed.status, 'changed', 'a different fingerprint is a change');
assertEq(changed.entry.fp, info.fp, 'changed check still returns the saved entry');

kh.trust(id, { alg: info.alg, fp: 'SHA256:' + 'B'.repeat(43) });
assertEq(kh.list()[0].fp.indexOf('B'), 7, 'trust replaces a changed key');
assertEq(kh.list()[0].first, 3000, 'replaced key gets a new first-seen time');

kh.forget(id);
assertEq(kh.check(id, info).status, 'new', 'forgotten key is asked again');
kh.trust(id, info);
kh.forgetAll();
assertEq(kh.list().length, 0, 'forgetAll clears every key');

assert(kh.list && JSON.stringify(kh.list()).indexOf('password') < 0, 'known-hosts list has no password field');

assertEq(Known.clampFont(15), 15, 'default font is in range');
assertEq(Known.clampFont(1), C.SSH_FONT_MIN, 'font is clamped up');
assertEq(Known.clampFont(99), C.SSH_FONT_MAX, 'font is clamped down');
assertEq(Known.clampFont('nope'), C.SSH_FONT_DEFAULT, 'bad font falls back to the default');
assertEq(kh.getFont(), C.SSH_FONT_DEFAULT, 'unsaved font is the default');
assertEq(kh.setFont(18), 18, 'font 18 is saved');
assertEq(kh.setFont(3), C.SSH_FONT_MIN, 'saved font is clamped');
assertEq(kh.getFont(), C.SSH_FONT_MIN, 'clamped font is what getFont returns');

/* The store uses Remote's key, not the SSH app's. */
var rawStore = memoryStorage();
var kh2 = Known.make(rawStore, function () { return 1; });
kh2.trust('h:22', info);
assert(rawStore.getItem(C.LS_SSH_KNOWN), 'fingerprints are written under Remote\'s key');
assertEq(rawStore.getItem('ssh-known-hosts-v1'), null, 'the SSH app known-hosts key is never written');
kh2.setFont(16);
assert(rawStore.getItem(C.LS_SSH_FONT), 'font is written under Remote\'s key');

/* -------------------------------------------------------------------------- */
/* Special keys                                                               */
/* -------------------------------------------------------------------------- */

assertEq(Term.keySeq('esc'), '\x1b', 'esc is ESC');
assertEq(Term.keySeq('tab'), '\t', 'tab is TAB');
assertEq(Term.keySeq('up'), '\x1b[A', 'up arrow');
assertEq(Term.keySeq('down'), '\x1b[B', 'down arrow');
assertEq(Term.keySeq('right'), '\x1b[C', 'right arrow');
assertEq(Term.keySeq('left'), '\x1b[D', 'left arrow');
assertEq(Term.keySeq('|'), '|', 'pipe');
assertEq(Term.keySeq('/'), '/', 'slash');
assertEq(Term.keySeq('-'), '-', 'minus');

var ctrlC = Term.applyModifiers('c', true, false);
assertEq(ctrlC.text, '\x03', 'sticky Ctrl+C is ^C');
assertEq(ctrlC.ctrl, false, 'Ctrl clears after use');

var altX = Term.applyModifiers('x', false, true);
assertEq(altX.text, '\x1bx', 'sticky Alt+x is ESC x');
assertEq(altX.alt, false, 'Alt clears after use');

var both = Term.applyModifiers('c', true, true);
assertEq(both.text, '\x1b\x03', 'Ctrl+Alt+C is ESC then ^C');
assert(!both.ctrl && !both.alt, 'both modifiers clear');

var plain = Term.applyModifiers('a', false, false);
assertEq(plain.text, 'a', 'plain key is unchanged');

/* -------------------------------------------------------------------------- */
/* Standalone sources and vendor copies                                       */
/* -------------------------------------------------------------------------- */

var files = [
  'rm_store.js', 'rm_ui.js', 'rm_main.js', 'rm_config.js', 'rm_tabs.js',
  'rm_sftp_client.js', 'rm_sftp_view.js', 'rm_sftp_path.js',
  'rm_ssh_known.js', 'rm_ssh_client.js', 'rm_ssh_term.js', 'rm_ssh_view.js',
  'remote.html'
];
var src = files.map(function (f) { return fs.readFileSync(path.join(app, f), 'utf8'); }).join('\n');
assert(src.indexOf('../ssh/') < 0 && src.indexOf('../vnc/') < 0, 'RM6 sources do not link to ../ssh/ or ../vnc/');
assert(src.indexOf('ssh-hosts-v1') < 0 && src.indexOf('vnc-hosts-v1') < 0, 'RM6 sources do not reference SSH or VNC host-list keys');
assert(src.indexOf('ssh-known-hosts-v1') < 0, 'RM6 sources do not reference the SSH app known-hosts key');
assert(src.indexOf('ssh-settings-v1') < 0, 'RM6 sources do not reference the SSH app settings key');
assert(src.indexOf('vendor/xterm.min.js') >= 0, 'the page loads Remote\'s own xterm copy');
assert(src.indexOf('vendor/ssh-lib.min.js') >= 0, 'the page loads Remote\'s own SSH library copy');
assert(src.indexOf('rm_ssh_view.js') >= 0, 'the page loads the SSH view');
assert(src.indexOf('id="view-ssh"') >= 0, 'the page has an SSH pane');
assert(src.indexOf('data-k="alt"') >= 0, 'the key bar includes Alt');
assert(src.indexOf('id="hostkey"') >= 0, 'the page has a host-key dialog');

var vendor = [
  'xterm.min.js', 'xterm.css', 'xterm-addon-fit.min.js', 'ssh-lib.min.js',
  'LICENSE-xterm.txt', 'LICENSE-dev-tunnels-ssh.txt', 'THIRD_PARTY_NOTICES.txt', 'README.md'
];
vendor.forEach(function (f) {
  var fp = path.join(app, 'vendor', f);
  assert(fs.existsSync(fp) && fs.statSync(fp).size > 0, 'vendor/' + f + ' is present');
});
assert(!fs.existsSync(path.join(app, 'vendor', 'build')), 'vendor/ does not include the leftover build sources');

var vreadme = fs.readFileSync(path.join(app, 'vendor', 'README.md'), 'utf8');
assert(/6\.0\.0/.test(vreadme) && /3\.12\.42/.test(vreadme), 'vendor README records versions');
assert(/MIT/.test(vreadme), 'vendor README records licences');

var html = fs.readFileSync(path.join(app, 'remote.html'), 'utf8');
assert(html.indexOf('RM6') >= 0, 'the page tag is RM6');
assert(html.indexOf('connect-token-wrap') >= 0, 'the connect sheet can hide the SFTP token fields');

if (failed) {
  console.error(failed + ' test(s) failed');
  process.exit(1);
}
console.log('All RM6 tests passed.');
