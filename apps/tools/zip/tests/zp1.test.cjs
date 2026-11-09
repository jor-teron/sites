/* Zip ZP1+ZP2 — pure helper tests (no browser). */
'use strict';

var path = require('path');
var H = require(path.join(__dirname, '..', 'zp_helpers.js'));

var failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

// formatBytes
assert(H.formatBytes(0) === '0 B', 'formatBytes 0');
assert(H.formatBytes(512) === '512 B', 'formatBytes bytes');
assert(/KB/.test(H.formatBytes(2048)), 'formatBytes KB');
assert(/MB/.test(H.formatBytes(2 * 1024 * 1024)), 'formatBytes MB');

// uniqueFileName
assert(H.uniqueFileName('a.txt', []) === 'a.txt', 'unique free');
assert(H.uniqueFileName('a.txt', ['a.txt']) === 'a (1).txt', 'unique conflict');
assert(H.uniqueFileName('a.txt', ['a.txt', 'a (1).txt']) === 'a (2).txt', 'unique second');
assert(H.uniqueFileName('readme', ['readme']) === 'readme (1)', 'unique no ext');

// sanitizeZipPath / zip-slip
assert(H.sanitizeZipPath('ok/file.txt').ok === true, 'safe path ok');
assert(H.sanitizeZipPath('ok/file.txt').path === 'ok/file.txt', 'safe path value');
assert(H.sanitizeZipPath('../etc/passwd').ok === false, 'reject ../');
assert(H.sanitizeZipPath('foo/../../x').ok === false, 'reject nested ../');
assert(H.sanitizeZipPath('/abs/file').ok === false, 'reject absolute');
assert(H.sanitizeZipPath('C:\\windows\\x').ok === false, 'reject drive');
assert(H.sanitizeZipPath('').ok === false, 'reject empty');
assert(H.sanitizeZipPath('a/./b').path === 'a/b', 'strip dot segments');
assert(H.sanitizeZipPath('CON.txt').ok === false, 'reject device name');

// splitRelPath
var sp = H.splitRelPath('dir/sub/file.bin');
assert(sp.dirs.join('/') === 'dir/sub' && sp.file === 'file.bin', 'splitRelPath');

// buildEntryTree
var tree = H.buildEntryTree([
  { filename: 'a/b.txt', uncompressedSize: 10, encrypted: false },
  { filename: 'a/', directory: true },
  { filename: '../evil.txt', uncompressedSize: 1 },
  { filename: 'secret.bin', uncompressedSize: 3, encrypted: true }
]);
assert(tree.some(function (r) { return r.isDir && r.path === 'a'; }), 'tree has dir a');
assert(tree.some(function (r) { return r.path === 'a/b.txt' && !r.isDir; }), 'tree has file');
assert(tree.some(function (r) { return r.unsafe; }), 'tree marks zip-slip unsafe');
assert(tree.some(function (r) { return r.path === 'secret.bin' && r.encrypted; }), 'tree encrypted flag');

// suggest / ensure zip name
assert(H.suggestZipName([{ name: 'photo.jpg' }]) === 'photo.zip', 'suggestZipName');
assert(H.ensureZipExt('out') === 'out.zip', 'ensureZipExt adds');
assert(H.ensureZipExt('out.ZIP') === 'out.ZIP', 'ensureZipExt keeps');
assert(H.isZipFileName('x.zip') === true, 'isZipFileName');
assert(H.isZipFileName('x.txt') === false, 'isZipFileName false');

// password error detect
assert(H.isPasswordError(new Error('ERR_INVALID_PASSWORD')) === true, 'password err');
assert(H.isPasswordError(new Error('nope')) === false, 'not password err');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('All tests passed');
