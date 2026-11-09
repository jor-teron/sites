/* Torrent — tr_helpers.js: magnet/info-hash checks, size/ETA text, unique filenames. TR1+TR2 */
(function (root) {
  'use strict';

  var INFO_HASH_RE = /^[a-fA-F0-9]{40}$/;
  var INFO_HASH_B32_RE = /^[a-zA-Z2-7]{32}$/;

  function trim(s) {
    return String(s == null ? '' : s).trim();
  }

  /** Normalize pasted text into a magnet URI, or null if invalid. Accepts magnet: or raw info-hash. */
  function parseTorrentInput(raw) {
    var s = trim(raw);
    if (!s) return null;
    if (/^magnet:\?/i.test(s)) {
      if (/[?&]xt=urn:btih:[a-zA-Z0-9]+/i.test(s)) return s;
      return null;
    }
    if (INFO_HASH_RE.test(s)) {
      return 'magnet:?xt=urn:btih:' + s.toLowerCase();
    }
    if (INFO_HASH_B32_RE.test(s)) {
      return 'magnet:?xt=urn:btih:' + s.toUpperCase();
    }
    return null;
  }

  function isTorrentFileName(name) {
    return /\.torrent$/i.test(String(name || ''));
  }

  function formatBytes(n) {
    var v = Number(n);
    if (!isFinite(v) || v < 0) v = 0;
    if (v < 1024) return Math.round(v) + ' B';
    var u = ['KB', 'MB', 'GB', 'TB'];
    var i = -1;
    do {
      v /= 1024;
      i++;
    } while (v >= 1024 && i < u.length - 1);
    var digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return v.toFixed(digits) + ' ' + u[i];
  }

  function formatSpeed(bytesPerSec) {
    return formatBytes(bytesPerSec) + '/s';
  }

  /** Human ETA from remaining bytes and download speed (B/s). */
  function formatEta(remainingBytes, speed) {
    var rem = Number(remainingBytes);
    var spd = Number(speed);
    if (!isFinite(rem) || rem <= 0) return 'Done';
    if (!isFinite(spd) || spd < 32) return '—';
    var sec = Math.round(rem / spd);
    if (sec < 60) return sec + 's';
    if (sec < 3600) {
      var m = Math.floor(sec / 60);
      var s = sec % 60;
      return m + 'm ' + s + 's';
    }
    if (sec < 86400) {
      var h = Math.floor(sec / 3600);
      var hm = Math.floor((sec % 3600) / 60);
      return h + 'h ' + hm + 'm';
    }
    var d = Math.floor(sec / 86400);
    return d + 'd+';
  }

  function formatPct(ratio) {
    var r = Number(ratio);
    if (!isFinite(r) || r < 0) r = 0;
    if (r > 1) r = 1;
    return Math.floor(r * 100) + '%';
  }

  /**
   * Collision-free file name: "a.txt" -> "a (1).txt" -> "a (2).txt".
   * existing is a Set (or array) of names already taken in that folder.
   */
  function uniqueFileName(name, existing) {
    var taken = existing;
    if (Array.isArray(existing)) {
      taken = new Set(existing);
    } else if (!existing || typeof existing.has !== 'function') {
      taken = new Set();
    }
    var base = String(name == null ? 'file' : name);
    if (!taken.has(base)) return base;
    var dot = base.lastIndexOf('.');
    var stem = dot > 0 ? base.slice(0, dot) : base;
    var ext = dot > 0 ? base.slice(dot) : '';
    var n = 1;
    var candidate;
    do {
      candidate = stem + ' (' + n + ')' + ext;
      n++;
    } while (taken.has(candidate) && n < 10000);
    return candidate;
  }

  /** Split a torrent-relative path into safe folder parts + file name (no ".."). */
  function splitRelPath(relPath) {
    var p = String(relPath == null ? '' : relPath).replace(/\\/g, '/');
    var parts = p.split('/').filter(function (x) {
      return x && x !== '.' && x !== '..';
    });
    if (!parts.length) return { dirs: [], file: 'file' };
    return { dirs: parts.slice(0, -1), file: parts[parts.length - 1] };
  }

  var api = {
    parseTorrentInput: parseTorrentInput,
    isTorrentFileName: isTorrentFileName,
    formatBytes: formatBytes,
    formatSpeed: formatSpeed,
    formatEta: formatEta,
    formatPct: formatPct,
    uniqueFileName: uniqueFileName,
    splitRelPath: splitRelPath
  };

  root.TRHelpers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
