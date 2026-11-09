/* Zip — zp_helpers.js: path sanitize / zip-slip, unique names, size format, tree build. ZP1+ZP2 */
(function (root) {
  'use strict';

  function trim(s) {
    return String(s == null ? '' : s).trim();
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

  /**
   * Sanitize a zip entry path. Rejects zip-slip (../), absolute, drive letters,
   * null/control chars. Returns { ok, path, dirs, file, reason } with a relative
   * forward-slash path, or ok:false.
   */
  function sanitizeZipPath(raw) {
    var s = String(raw == null ? '' : raw);
    if (!s) return { ok: false, path: '', dirs: [], file: '', reason: 'empty' };
    if (/[\0-\x1f\x7f]/.test(s)) {
      return { ok: false, path: '', dirs: [], file: '', reason: 'control' };
    }
    s = s.replace(/\\/g, '/');
    if (s.charAt(0) === '/' || s.charAt(0) === '\\') {
      return { ok: false, path: '', dirs: [], file: '', reason: 'absolute' };
    }
    if (/^[a-zA-Z]:/.test(s)) {
      return { ok: false, path: '', dirs: [], file: '', reason: 'drive' };
    }
    var parts = s.split('/');
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (!p || p === '.') continue;
      if (p === '..') {
        return { ok: false, path: '', dirs: [], file: '', reason: 'zip-slip' };
      }
      // Windows device names (CON, PRN, AUX, NUL, COM1.., LPT1..)
      var stem = p.split('.')[0].toUpperCase();
      if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) {
        return { ok: false, path: '', dirs: [], file: '', reason: 'device' };
      }
      if (/[<>:"|?*]/.test(p)) {
        return { ok: false, path: '', dirs: [], file: '', reason: 'illegal' };
      }
      out.push(p);
    }
    if (!out.length) return { ok: false, path: '', dirs: [], file: '', reason: 'empty' };
    if (out.length > 32) {
      return { ok: false, path: '', dirs: [], file: '', reason: 'depth' };
    }
    var file = out[out.length - 1];
    var dirs = out.slice(0, -1);
    var path = out.join('/');
    return { ok: true, path: path, dirs: dirs, file: file, reason: '' };
  }

  function splitRelPath(relPath) {
    var clean = sanitizeZipPath(relPath);
    if (!clean.ok) return { dirs: [], file: 'file' };
    return { dirs: clean.dirs, file: clean.file };
  }

  /**
   * Build a flat display list from zip entries (directories + files).
   * Each item: { path, name, depth, isDir, size, encrypted, raw }
   */
  function buildEntryTree(entries) {
    var list = Array.isArray(entries) ? entries : [];
    var rows = [];
    var seenDirs = new Set();
    for (var i = 0; i < list.length; i++) {
      var e = list[i] || {};
      var filename = e.filename != null ? e.filename : e.name;
      var isDir = !!(e.directory || (typeof filename === 'string' && /\/$/.test(filename)));
      var clean = sanitizeZipPath(String(filename || '').replace(/\/$/, ''));
      if (!clean.ok) {
        rows.push({
          path: String(filename || ''),
          name: String(filename || '(bad path)'),
          depth: 0,
          isDir: false,
          size: 0,
          encrypted: !!e.encrypted,
          unsafe: true,
          reason: clean.reason,
          raw: e
        });
        continue;
      }
      // Ensure parent dirs appear once
      var acc = [];
      for (var d = 0; d < clean.dirs.length; d++) {
        acc.push(clean.dirs[d]);
        var dirPath = acc.join('/');
        if (!seenDirs.has(dirPath)) {
          seenDirs.add(dirPath);
          rows.push({
            path: dirPath,
            name: clean.dirs[d],
            depth: d,
            isDir: true,
            size: 0,
            encrypted: false,
            unsafe: false,
            reason: '',
            raw: null
          });
        }
      }
      if (isDir) {
        if (!seenDirs.has(clean.path)) {
          seenDirs.add(clean.path);
          rows.push({
            path: clean.path,
            name: clean.file,
            depth: clean.dirs.length,
            isDir: true,
            size: 0,
            encrypted: false,
            unsafe: false,
            reason: '',
            raw: e
          });
        }
      } else {
        rows.push({
          path: clean.path,
          name: clean.file,
          depth: clean.dirs.length,
          isDir: false,
          size: Number(e.uncompressedSize) || 0,
          encrypted: !!e.encrypted,
          unsafe: false,
          reason: '',
          raw: e
        });
      }
    }
    rows.sort(function (a, b) {
      return a.path.localeCompare(b.path);
    });
    return rows;
  }

  /** Suggest a .zip name from the first file or "archive.zip". */
  function suggestZipName(files) {
    var list = Array.isArray(files) ? files : [];
    if (!list.length) return 'archive.zip';
    var first = list[0];
    var n = (first && (first.relPath || first.name)) || 'archive';
    n = String(n).replace(/\\/g, '/').split('/').pop() || 'archive';
    var dot = n.lastIndexOf('.');
    var stem = dot > 0 ? n.slice(0, dot) : n;
    stem = stem.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 80) || 'archive';
    return stem + '.zip';
  }

  function ensureZipExt(name) {
    var s = trim(name) || 'archive.zip';
    if (!/\.zip$/i.test(s)) s += '.zip';
    return s;
  }

  function isZipFileName(name) {
    return /\.zip$/i.test(String(name || ''));
  }

  function isPasswordError(err) {
    var msg = String((err && (err.message || err)) || '');
    return /password|ERR_INVALID_PASSWORD|ERR_ENCRYPTED/i.test(msg);
  }

  function newId() {
    return 'z-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  var api = {
    trim: trim,
    formatBytes: formatBytes,
    uniqueFileName: uniqueFileName,
    sanitizeZipPath: sanitizeZipPath,
    splitRelPath: splitRelPath,
    buildEntryTree: buildEntryTree,
    suggestZipName: suggestZipName,
    ensureZipExt: ensureZipExt,
    isZipFileName: isZipFileName,
    isPasswordError: isPasswordError,
    newId: newId
  };

  root.ZPHelpers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
