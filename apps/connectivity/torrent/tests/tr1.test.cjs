/* Torrent — tests/tr1.test.cjs: helpers for TR1–TR5 (magnet, queue, persist, throttle, media). */
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
});

test('TR1 isTorrentFileName', () => {
  assert.equal(H.isTorrentFileName('a.torrent'), true);
  assert.equal(H.isTorrentFileName('a.txt'), false);
});

test('TR1 formatBytes / speed / pct / eta', () => {
  assert.equal(H.formatBytes(1024), '1.00 KB');
  assert.equal(H.formatSpeed(2048), '2.00 KB/s');
  assert.equal(H.formatPct(0.5), '50%');
  assert.equal(H.formatEta(1000, 100), '10s');
  assert.equal(H.formatEta(1000, 0), '—');
});

test('TR1 uniqueFileName never overwrites', () => {
  assert.equal(H.uniqueFileName('a.txt', ['a.txt']), 'a (1).txt');
  assert.equal(H.uniqueFileName('a.txt', ['a.txt', 'a (1).txt']), 'a (2).txt');
});

test('TR1 splitRelPath drops .. and keeps folders', () => {
  assert.deepEqual(H.splitRelPath('folder/sub/file.bin'), { dirs: ['folder', 'sub'], file: 'file.bin' });
  assert.deepEqual(H.splitRelPath('../x/./y.txt'), { dirs: ['x'], file: 'y.txt' });
});

test('TR3 reconcileQueue caps active at 2', () => {
  const entries = [
    { id: 'a', userPaused: false, done: false },
    { id: 'b', userPaused: false, done: false },
    { id: 'c', userPaused: false, done: false },
    { id: 'd', userPaused: true, done: false },
    { id: 'e', userPaused: false, done: true }
  ];
  const slots = H.reconcileQueue(entries, 2);
  assert.equal(slots.a, 'active');
  assert.equal(slots.b, 'active');
  assert.equal(slots.c, 'queued');
  assert.equal(slots.d, 'paused');
  assert.equal(slots.e, 'done');
});

test('TR3 reconcileQueue promotes when an active is paused', () => {
  const entries = [
    { id: 'a', userPaused: true, done: false },
    { id: 'b', userPaused: false, done: false },
    { id: 'c', userPaused: false, done: false },
    { id: 'd', userPaused: false, done: false }
  ];
  const slots = H.reconcileQueue(entries, 2);
  assert.equal(slots.a, 'paused');
  assert.equal(slots.b, 'active');
  assert.equal(slots.c, 'active');
  assert.equal(slots.d, 'queued');
});

test('TR3 serializeState + restoreState round-trip (restore forces paused)', () => {
  const raw = H.serializeState([
    {
      id: 't1',
      magnet: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
      infoHash: '0123456789abcdef0123456789abcdef01234567',
      name: 'Demo',
      userPaused: false,
      done: false,
      seed: true,
      selectedPaths: ['a/b.mp4'],
      addedAt: 42
    }
  ], { uploadLimitKBs: 100, downloadLimitKBs: -1, seedDefault: false });

  assert.equal(raw.version, H.STORE_VERSION);
  assert.equal(raw.torrents.length, 1);
  assert.equal(raw.settings.uploadLimitKBs, 100);

  const restored = H.restoreState(raw);
  assert.equal(restored.torrents.length, 1);
  assert.equal(restored.torrents[0].name, 'Demo');
  assert.equal(restored.torrents[0].userPaused, true); // forced on restore
  assert.deepEqual(restored.torrents[0].selectedPaths, ['a/b.mp4']);
  assert.equal(restored.settings.seedDefault, false);
  assert.equal(restored.settings.downloadLimitKBs, -1);
});

test('TR5 parseThrottleKBs', () => {
  assert.deepEqual(H.parseThrottleKBs(''), { ok: true, kBs: -1, bytesPerSec: -1 });
  assert.deepEqual(H.parseThrottleKBs('unlimited'), { ok: true, kBs: -1, bytesPerSec: -1 });
  assert.deepEqual(H.parseThrottleKBs(-1), { ok: true, kBs: -1, bytesPerSec: -1 });
  assert.deepEqual(H.parseThrottleKBs('100'), { ok: true, kBs: 100, bytesPerSec: 100 * 1024 });
  assert.deepEqual(H.parseThrottleKBs(50), { ok: true, kBs: 50, bytesPerSec: 50 * 1024 });
  assert.equal(H.parseThrottleKBs('nope').ok, false);
});

test('TR5 formatRatio', () => {
  assert.equal(H.formatRatio(100, 50), '2.00');
  assert.equal(H.formatRatio(0, 0), '0.00');
  assert.equal(H.formatRatio(10, 0), '∞');
});

test('TR4 media helpers', () => {
  assert.equal(H.isPlayableMediaName('clip.mp4'), true);
  assert.equal(H.isAudioName('track.mp3'), true);
  assert.equal(H.mayNotPlay('movie.mkv'), true);
  assert.equal(H.mayNotPlay('film.hevc.mp4'), true);
  assert.equal(H.mayNotPlay('ok.mp4'), false);
});
