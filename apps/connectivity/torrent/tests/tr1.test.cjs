/* Torrent — tests/tr1.test.cjs: magnet/info-hash, size/ETA, unique filenames. TR1+TR2 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const H = require(path.join(__dirname, '..', 'tr_helpers.js'));

test('TR1 parseTorrentInput accepts magnet with btih', () => {
  const m = H.parseTorrentInput('magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=x');
  assert.ok(m.startsWith('magnet:'));
});

test('TR1 parseTorrentInput accepts 40-char hex info-hash', () => {
  const m = H.parseTorrentInput('0123456789ABCDEF0123456789ABCDEF01234567');
  assert.equal(m, 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567');
});

test('TR1 parseTorrentInput accepts 32-char base32 info-hash', () => {
  const m = H.parseTorrentInput('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567');
  assert.equal(m, 'magnet:?xt=urn:btih:ABCDEFGHIJKLMNOPQRSTUVWXYZ234567');
});

test('TR1 parseTorrentInput rejects junk', () => {
  assert.equal(H.parseTorrentInput(''), null);
  assert.equal(H.parseTorrentInput('hello'), null);
  assert.equal(H.parseTorrentInput('magnet:?dn=only'), null);
  assert.equal(H.parseTorrentInput('abcd'), null);
});

test('TR1 isTorrentFileName', () => {
  assert.equal(H.isTorrentFileName('a.torrent'), true);
  assert.equal(H.isTorrentFileName('A.TORRENT'), true);
  assert.equal(H.isTorrentFileName('a.txt'), false);
});

test('TR1 formatBytes', () => {
  assert.equal(H.formatBytes(0), '0 B');
  assert.equal(H.formatBytes(500), '500 B');
  assert.equal(H.formatBytes(1024), '1.00 KB');
  assert.equal(H.formatBytes(1024 * 1024), '1.00 MB');
  assert.equal(H.formatBytes(1536), '1.50 KB');
});

test('TR1 formatSpeed and formatPct', () => {
  assert.equal(H.formatSpeed(2048), '2.00 KB/s');
  assert.equal(H.formatPct(0), '0%');
  assert.equal(H.formatPct(0.5), '50%');
  assert.equal(H.formatPct(1), '100%');
  assert.equal(H.formatPct(1.5), '100%');
});

test('TR1 formatEta', () => {
  assert.equal(H.formatEta(0, 100), 'Done');
  assert.equal(H.formatEta(1000, 0), '—');
  assert.equal(H.formatEta(1000, 10), '—'); // below 32 B/s floor
  assert.equal(H.formatEta(1000, 100), '10s');
  assert.equal(H.formatEta(120 * 100, 100), '2m 0s');
  assert.equal(H.formatEta(3600 * 50, 50), '1h 0m');
});

test('TR1 uniqueFileName never overwrites', () => {
  assert.equal(H.uniqueFileName('a.txt', []), 'a.txt');
  assert.equal(H.uniqueFileName('a.txt', ['a.txt']), 'a (1).txt');
  assert.equal(H.uniqueFileName('a.txt', ['a.txt', 'a (1).txt']), 'a (2).txt');
  assert.equal(H.uniqueFileName('README', new Set(['README'])), 'README (1)');
  assert.equal(H.uniqueFileName('archive.tar.gz', ['archive.tar.gz']), 'archive.tar (1).gz');
});

test('TR1 splitRelPath drops .. and keeps folders', () => {
  assert.deepEqual(H.splitRelPath('folder/sub/file.bin'), { dirs: ['folder', 'sub'], file: 'file.bin' });
  assert.deepEqual(H.splitRelPath('../x/./y.txt'), { dirs: ['x'], file: 'y.txt' });
  assert.deepEqual(H.splitRelPath(''), { dirs: [], file: 'file' });
});
