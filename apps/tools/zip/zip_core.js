/*
 * ZIP ZP1 — local archive helpers. Uses the vendored JSZip (not a parser of our own).
 * Paths are checked before a name is stored or a file is inflated. Limits are byte caps.
 */
(function (root) {
  'use strict';

  var LIMITS = {
    maxFiles: 200,
    maxEntryBytes: 32 * 1024 * 1024,
    maxTotalBytes: 64 * 1024 * 1024,
    maxArchiveBytes: 48 * 1024 * 1024,
    maxRatio: 80,
    ratioFloor: 1024 * 1024,
    maxSegment: 80,
    maxPath: 180,
    maxDepth: 8
  };

  var RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/;
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256), n, c, k;
    for (n = 0; n < 256; n++) {
      c = n;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function limitsOf(extra) {
    var o = {}, k;
    for (k in LIMITS) o[k] = LIMITS[k];
    if (extra) for (k in extra) if (Object.prototype.hasOwnProperty.call(extra, k) && extra[k] != null) o[k] = extra[k];
    return o;
  }

  function formatBytes(n) {
    n = n >>> 0;
    if (n < 1024) return n + ' B';
    var units = ['KB', 'MB', 'GB'], i = -1, v = n;
    do { v /= 1024; i++; } while (v >= 1024 && i < units.length - 1);
    return (v >= 10 ? v.toFixed(0) : v.toFixed(1)) + ' ' + units[i];
  }

  function crc32(bytes) {
    var c = 0xffffffff, i;
    for (i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function safePath(raw) {
    if (typeof raw !== 'string' || !raw) return { ok: false, reason: 'missing name' };
    if (/[\x00-\x1f\x7f]/.test(raw)) return { ok: false, reason: 'control character' };
    var s = raw.replace(/\\/g, '/');
    if (s.charAt(0) === '/' || /^[a-zA-Z]:/.test(s)) return { ok: false, reason: 'absolute path' };
    var parts = s.split('/'), out = [], i, p, base, dir = s.charAt(s.length - 1) === '/';
    for (i = 0; i < parts.length; i++) {
      p = parts[i];
      if (p === '' || p === '.') continue;
      if (p === '..') return { ok: false, reason: 'parent path' };
      if (p.length > LIMITS.maxSegment) return { ok: false, reason: 'name too long' };
      if (/[<>:"|?*]/.test(p) || /[. ]$/.test(p)) return { ok: false, reason: 'illegal character' };
      base = p.split('.')[0].toUpperCase();
      if (RESERVED.test(base)) return { ok: false, reason: 'reserved name' };
      out.push(p);
    }
    if (!out.length) return { ok: false, reason: 'empty name' };
    if (out.length > LIMITS.maxDepth) return { ok: false, reason: 'path too deep' };
    var path = out.join('/');
    if (dir) path += '/';
    if (path.length > LIMITS.maxPath) return { ok: false, reason: 'name too long' };
    return { ok: true, path: path, dir: dir };
  }

  function uniqueName(path, seen) {
    var slash = path.lastIndexOf('/');
    var dot = path.lastIndexOf('.');
    var base, ext;
    if (dot > slash) { base = path.slice(0, dot); ext = path.slice(dot); }
    else { base = path; ext = ''; }
    var n = 2, cand = path;
    while (seen[cand]) {
      cand = base + ' (' + n + ')' + ext;
      n++;
      if (n > 999) return '';
    }
    return cand;
  }

function isPromise(v) { return !!v && typeof v.then === 'function'; }

/* JSZip keeps normal entries as compressed objects. A real empty file (and a folder)
   is stored as a Promise of an empty payload, with no sizes. Only a 0-byte result is accepted. */
function sizesOf(file) {
  var d = file && file._data;
  if (!d || typeof d.uncompressedSize !== 'number' || typeof d.compressedSize !== 'number') {
    return { known: false, empty: isPromise(d), uncompressed: -1, compressed: 0 };
  }
  if (d.uncompressedSize < 0 || d.compressedSize < 0) return { known: false, empty: false, uncompressed: -1, compressed: 0 };
  return { known: true, empty: false, uncompressed: d.uncompressedSize, compressed: d.compressedSize };
}

async function readEmpty(file) {
  if (!isPromise(file._data)) throw new Error('Unsupported size.');
  var data = await file._data;
  var len = data && (data.byteLength != null ? data.byteLength : data.length) || 0;
  if (len !== 0) throw new Error('Unsupported size.');
  return new Uint8Array(0);
}

  function entryPath(rel, file) {
    var original = file.unsafeOriginalName || rel;
    var sp = safePath(original);
    if (!sp.ok) return sp;
    var key = safePath(rel);
    if (!key.ok) return key;
    if (file.unsafeOriginalName && !file.dir && key.path !== sp.path) return { ok: false, reason: 'path mismatch' };
    sp.dir = sp.dir || !!file.dir;
    if (sp.dir && sp.path.charAt(sp.path.length - 1) !== '/') sp.path += '/';
    return sp;
  }

  function ratioTooHigh(sz, lim) {
    return sz.compressed > 0 && sz.uncompressed > lim.ratioFloor && (sz.uncompressed / sz.compressed) > lim.maxRatio;
  }

  function inspectZip(zip, limits) {
    var lim = limitsOf(limits);
    var entries = [], skipped = [], seen = Object.create(null), total = 0, count = 0, dirs = 0;
    zip.forEach(function (rel, file) {
      var sp = entryPath(rel, file);
      var label = sp.ok ? sp.path : String(file.unsafeOriginalName || rel).replace(/[\x00-\x1f]/g, '').slice(0, 80);
      if (!sp.ok) { skipped.push({ name: label || '(unnamed)', reason: sp.reason }); return; }
      if (seen[sp.path]) { skipped.push({ name: sp.path, reason: 'duplicate path' }); return; }
      if (sp.dir) {
        if (dirs >= lim.maxFiles) { skipped.push({ name: sp.path, reason: 'too many files' }); return; }
        dirs++;
        seen[sp.path] = 1;
        entries.push({ path: sp.path, dir: true, size: 0, compressed: 0 });
        return;
      }
      var sz = sizesOf(file);
      if (!sz.known) {
        if (sz.empty) {
          if (count >= lim.maxFiles) { skipped.push({ name: sp.path, reason: 'too many files' }); return; }
          seen[sp.path] = 1;
          count++;
          entries.push({ path: sp.path, dir: false, size: 0, compressed: 0 });
          return;
        }
        skipped.push({ name: sp.path, reason: 'unsupported size' });
        return;
      }
      if (sz.uncompressed > lim.maxEntryBytes) { skipped.push({ name: sp.path, reason: 'file too large' }); return; }
      if (ratioTooHigh(sz, lim)) { skipped.push({ name: sp.path, reason: 'compression ratio too high' }); return; }
      if (count >= lim.maxFiles || total + sz.uncompressed > lim.maxTotalBytes) {
        skipped.push({ name: sp.path, reason: count >= lim.maxFiles ? 'too many files' : 'uncompressed total too large' });
        return;
      }
      seen[sp.path] = 1;
      total += sz.uncompressed;
      count++;
      entries.push({ path: sp.path, dir: false, size: sz.uncompressed, compressed: sz.compressed });
    });
    return { entries: entries, skipped: skipped, total: total };
  }

  function findFile(zip, path) {
    var found = null;
    zip.forEach(function (rel, file) {
      if (found || file.dir) return;
      var sp = entryPath(rel, file);
      if (sp.ok && !sp.dir && sp.path === path) found = file;
    });
    return found;
  }

  function classifyError(e) {
    var m = e && e.message ? String(e.message) : 'Could not read this ZIP.';
    if (/encrypt/i.test(m)) return 'This ZIP is encrypted. ZP1 does not open password-protected archives.';
    if (/multi-volume/i.test(m)) return 'Split or multi-volume ZIPs are not supported.';
    if (/compression/i.test(m) && /unknown|not a valid/i.test(m)) return 'This ZIP uses a compression method that is not supported.';
    if (/CRC|checksum/i.test(m)) return 'This file is damaged (the checksum does not match).';
    if (/Corrupted|end of central|not a zip|Can't find|unexpected signature|invalid/i.test(m)) return 'This file is not a valid ZIP, or it is damaged.';
    if (m.length < 160) return m;
    return 'Could not read this ZIP.';
  }

  async function openArchive(data, JSZip, limits) {
    if (typeof JSZip !== 'function') throw new Error('ZIP library is missing.');
    var lim = limitsOf(limits);
    var len = data && (data.byteLength != null ? data.byteLength : data.length) || 0;
    if (!len) throw new Error('This file is empty.');
    if (len > lim.maxArchiveBytes) throw new Error('This ZIP is larger than ' + formatBytes(lim.maxArchiveBytes) + '.');
    try {
      var zip = await JSZip.loadAsync(data);
      return { zip: zip, view: inspectZip(zip, lim) };
    } catch (e) {
      throw new Error(classifyError(e));
    }
  }

  async function readEntry(zip, path, limits, used) {
    var lim = limitsOf(limits);
    used = used || 0;
    var sp = safePath(path);
    if (!sp.ok || sp.dir) throw new Error('Unsafe path.');
    var file = findFile(zip, sp.path);
    if (!file) throw new Error('That file is not available to extract.');
    var sz = sizesOf(file);
    if (!sz.known) {
      if (sz.empty) return readEmpty(file);
      throw new Error('Unsupported size.');
    }
    if (sz.uncompressed > lim.maxEntryBytes) throw new Error('File too large.');
    if (ratioTooHigh(sz, lim)) throw new Error('Compression ratio too high.');
    if (used + sz.uncompressed > lim.maxTotalBytes) throw new Error('Uncompressed total too large.');
    var out;
    try { out = await file.async('uint8array'); }
    catch (e) { throw new Error(classifyError(e)); }
    if (out.length !== sz.uncompressed || out.length > lim.maxEntryBytes || used + out.length > lim.maxTotalBytes) {
      throw new Error('Uncompressed data exceeds the limit.');
    }
    if (typeof file._data.crc32 === 'number' && crc32(out) !== (file._data.crc32 >>> 0)) {
      throw new Error('CRC mismatch.');
    }
    return out;
  }

  async function buildArchive(files, JSZip, limits) {
    if (typeof JSZip !== 'function') throw new Error('ZIP library is missing.');
    var lim = limitsOf(limits);
    if (!files || !files.length) throw new Error('Nothing to zip.');
    if (files.length > lim.maxFiles) throw new Error('Too many files.');
    var zip = new JSZip();
    var seen = Object.create(null), names = [], total = 0, i, f, sp, data, len, path;
    for (i = 0; i < files.length; i++) {
      f = files[i];
      sp = safePath(f.name);
      if (!sp.ok || sp.dir) throw new Error('Unsafe name.');
      data = f.data;
      len = data ? (data.byteLength || data.length || 0) : 0;
      if (len > lim.maxEntryBytes) throw new Error('File too large.');
      if (total + len > lim.maxTotalBytes) throw new Error('Uncompressed total too large.');
      path = sp.path;
      if (seen[path]) {
        path = uniqueName(path, seen);
        if (!path || !safePath(path).ok) throw new Error('Could not keep a unique name.');
      }
      seen[path] = 1;
      total += len;
      zip.file(path, data);
      names.push(path);
    }
    var bytes;
    try {
      bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    } catch (e) {
      throw new Error(classifyError(e));
    }
    if (bytes.length > lim.maxArchiveBytes) throw new Error('The ZIP is larger than ' + formatBytes(lim.maxArchiveBytes) + '.');
    return { bytes: bytes, names: names, total: total };
  }

  var api = {
    LIMITS: LIMITS,
    formatBytes: formatBytes,
    safePath: safePath,
    uniqueName: uniqueName,
    inspectZip: inspectZip,
    openArchive: openArchive,
    readEntry: readEntry,
    buildArchive: buildArchive,
    classifyError: classifyError,
    crc32: crc32
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ZipCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
