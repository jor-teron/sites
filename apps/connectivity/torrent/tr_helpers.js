/* Torrent — tr_helpers.js: magnet checks, size/ETA, unique names, queue/cap, throttle parse, media hints. TR1–TR5 */
(function (root) {
  'use strict';

  var INFO_HASH_RE = /^[a-fA-F0-9]{40}$/;
  var INFO_HASH_B32_RE = /^[a-zA-Z2-7]{32}$/;
  var MAX_ACTIVE = 2;
  var STORE_VERSION = 1;

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

  function formatRatio(uploaded, downloaded) {
    var up = Number(uploaded);
    var down = Number(downloaded);
    if (!isFinite(up) || up < 0) up = 0;
    if (!isFinite(down) || down <= 0) {
      return up > 0 ? '∞' : '0.00';
    }
    return (up / down).toFixed(2);
  }

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

  function splitRelPath(relPath) {
    var p = String(relPath == null ? '' : relPath).replace(/\\/g, '/');
    var parts = p.split('/').filter(function (x) {
      return x && x !== '.' && x !== '..';
    });
    if (!parts.length) return { dirs: [], file: 'file' };
    return { dirs: parts.slice(0, -1), file: parts[parts.length - 1] };
  }

  /**
   * Cap active downloads. entries: [{ id, userPaused, done }...] in display order.
   * Returns { [id]: 'active'|'queued'|'paused'|'done' }.
   */
  function reconcileQueue(entries, maxActive) {
    var max = Number(maxActive);
    if (!isFinite(max) || max < 1) max = MAX_ACTIVE;
    var out = {};
    var list = Array.isArray(entries) ? entries : [];
    var used = 0;
    for (var i = 0; i < list.length; i++) {
      var e = list[i] || {};
      var id = e.id;
      if (id == null) continue;
      if (e.done) {
        out[id] = 'done';
      } else if (e.userPaused) {
        out[id] = 'paused';
      } else if (used < max) {
        out[id] = 'active';
        used++;
      } else {
        out[id] = 'queued';
      }
    }
    return out;
  }

  /** Serialize list + settings for localStorage. */
  function serializeState(torrents, settings) {
    return {
      version: STORE_VERSION,
      torrents: (torrents || []).map(function (t) {
        return {
          id: t.id,
          magnet: t.magnet || '',
          infoHash: t.infoHash || '',
          name: t.name || '',
          userPaused: !!t.userPaused,
          done: !!t.done,
          seed: t.seed !== false,
          selectedPaths: Array.isArray(t.selectedPaths) ? t.selectedPaths.slice() : null,
          addedAt: t.addedAt || 0
        };
      }),
      settings: {
        uploadLimitKBs: settings && settings.uploadLimitKBs != null ? settings.uploadLimitKBs : -1,
        downloadLimitKBs: settings && settings.downloadLimitKBs != null ? settings.downloadLimitKBs : -1,
        seedDefault: !settings || settings.seedDefault !== false
      }
    };
  }

  function restoreState(raw) {
    var empty = { torrents: [], settings: { uploadLimitKBs: -1, downloadLimitKBs: -1, seedDefault: true } };
    if (!raw || typeof raw !== 'object') return empty;
    var torrents = Array.isArray(raw.torrents) ? raw.torrents : [];
    var cleaned = [];
    for (var i = 0; i < torrents.length; i++) {
      var t = torrents[i] || {};
      var magnet = t.magnet || (t.infoHash ? ('magnet:?xt=urn:btih:' + t.infoHash) : '');
      if (!magnet && !t.infoHash) continue;
      cleaned.push({
        id: t.id || ('t-' + i + '-' + (t.infoHash || i)),
        magnet: magnet,
        infoHash: t.infoHash || '',
        name: t.name || '',
        userPaused: t.userPaused !== false, // restore paused until user resumes
        done: !!t.done,
        seed: t.seed !== false,
        selectedPaths: Array.isArray(t.selectedPaths) ? t.selectedPaths.slice() : null,
        addedAt: t.addedAt || 0
      });
    }
    // Force paused on restore (brief: re-adding paused until user resumes)
    cleaned.forEach(function (t) { t.userPaused = true; });
    var s = raw.settings || {};
    return {
      torrents: cleaned,
      settings: {
        uploadLimitKBs: parseThrottleKBs(s.uploadLimitKBs).kBs,
        downloadLimitKBs: parseThrottleKBs(s.downloadLimitKBs).kBs,
        seedDefault: s.seedDefault !== false
      }
    };
  }

  /**
   * Parse a throttle field. Accepts number or string: "", "unlimited", "-1", "0" => unlimited (-1).
   * Positive number = KB/s. Returns { ok, kBs, bytesPerSec }.
   */
  function parseThrottleKBs(raw) {
    if (raw == null || raw === '') return { ok: true, kBs: -1, bytesPerSec: -1 };
    if (typeof raw === 'number') {
      if (!isFinite(raw) || raw < -1) return { ok: false, kBs: -1, bytesPerSec: -1 };
      if (raw < 0) return { ok: true, kBs: -1, bytesPerSec: -1 };
      return { ok: true, kBs: raw, bytesPerSec: Math.round(raw * 1024) };
    }
    var s = trim(raw).toLowerCase();
    if (!s || s === 'unlimited' || s === 'none' || s === 'off' || s === '-1') {
      return { ok: true, kBs: -1, bytesPerSec: -1 };
    }
    var n = Number(s);
    if (!isFinite(n) || n < -1) return { ok: false, kBs: -1, bytesPerSec: -1 };
    if (n < 0) return { ok: true, kBs: -1, bytesPerSec: -1 };
    return { ok: true, kBs: n, bytesPerSec: Math.round(n * 1024) };
  }

  function isVideoName(name) {
    return /\.(mp4|webm|ogg|ogv|m4v|mov)$/i.test(String(name || ''));
  }

  function isAudioName(name) {
    return /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)$/i.test(String(name || ''));
  }

  function isPlayableMediaName(name) {
    return isVideoName(name) || isAudioName(name);
  }

  /** Codecs/containers browsers often cannot play natively. */
  function mayNotPlay(name) {
    return /\.(mkv|avi|wmv|flv|hevc|h265|m2ts|ts)$/i.test(String(name || '')) ||
      /[._-](hevc|h265|x265)[._-]/i.test(String(name || ''));
  }

  function newId() {
    return 't-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  var api = {
    MAX_ACTIVE: MAX_ACTIVE,
    STORE_VERSION: STORE_VERSION,
    parseTorrentInput: parseTorrentInput,
    isTorrentFileName: isTorrentFileName,
    formatBytes: formatBytes,
    formatSpeed: formatSpeed,
    formatEta: formatEta,
    formatPct: formatPct,
    formatRatio: formatRatio,
    uniqueFileName: uniqueFileName,
    splitRelPath: splitRelPath,
    reconcileQueue: reconcileQueue,
    serializeState: serializeState,
    restoreState: restoreState,
    parseThrottleKBs: parseThrottleKBs,
    isVideoName: isVideoName,
    isAudioName: isAudioName,
    isPlayableMediaName: isPlayableMediaName,
    mayNotPlay: mayNotPlay,
    newId: newId
  };

  root.TRHelpers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
