/* Image Converter — ic_helpers.js: resize math, rename patterns, quality search, names, sizes. CI1 */
(function (root) {
  'use strict';

  var MIN_Q = 0.01;
  var MAX_Q = 1;
  var MIN_EDGE = 1;
  var MAX_EDGE = 8192;
  var IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif|bmp|svg)$/i;
  var IMAGE_TYPE = /^image\/(jpeg|png|webp|avif|gif|bmp|svg\+xml)$/i;
  var HEIC_EXT = /\.(heic|heif)$/i;
  var HEIC_TYPE = /^image\/(heic|heif|heic-sequence|heif-sequence)$/i;

  var FORMAT_MIME = {
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    avif: 'image/avif'
  };
  var FORMAT_EXT = {
    jpeg: 'jpg',
    jpg: 'jpg',
    png: 'png',
    webp: 'webp',
    avif: 'avif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif'
  };

  function clamp(n, lo, hi) {
    n = Number(n);
    if (!isFinite(n)) n = lo;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  function roundSize(n) {
    n = Math.round(Number(n));
    if (!isFinite(n) || n < MIN_EDGE) return MIN_EDGE;
    if (n > MAX_EDGE) return MAX_EDGE;
    return n;
  }

  /**
   * Output pixel size for a source image.
   * mode: 'none' | 'longest' | 'percent' | 'exact'
   * opts: { longest, percent, width, height, keepAspect, noEnlarge }
   */
  function computeSize(srcW, srcH, mode, opts) {
    var w = Math.max(1, Number(srcW) || 1);
    var h = Math.max(1, Number(srcH) || 1);
    opts = opts || {};
    var keep = opts.keepAspect !== false;
    var noEnlarge = opts.noEnlarge !== false;
    mode = mode || 'none';

    if (mode === 'none') {
      return { width: roundSize(w), height: roundSize(h) };
    }

    if (mode === 'percent') {
      var pct = Number(opts.percent);
      if (!isFinite(pct) || pct <= 0) pct = 100;
      var scale = pct / 100;
      if (noEnlarge && scale > 1) scale = 1;
      return { width: roundSize(w * scale), height: roundSize(h * scale) };
    }

    if (mode === 'longest') {
      var longest = Number(opts.longest);
      if (!isFinite(longest) || longest <= 0) longest = Math.max(w, h);
      var cur = Math.max(w, h);
      if (cur <= 0) return { width: 1, height: 1 };
      var s = longest / cur;
      if (noEnlarge && s > 1) s = 1;
      return { width: roundSize(w * s), height: roundSize(h * s) };
    }

    if (mode === 'exact') {
      var tw = Number(opts.width);
      var th = Number(opts.height);
      if (!isFinite(tw) || tw <= 0) tw = w;
      if (!isFinite(th) || th <= 0) th = h;
      if (!keep) return { width: roundSize(tw), height: roundSize(th) };
      var fit = Math.min(tw / w, th / h);
      if (noEnlarge && fit > 1) fit = 1;
      return { width: roundSize(w * fit), height: roundSize(h * fit) };
    }

    return { width: roundSize(w), height: roundSize(h) };
  }

  function formatBytes(n) {
    var b = Number(n);
    if (!isFinite(b) || b < 0) b = 0;
    if (b < 1024) return Math.round(b) + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
    return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function savedBytes(before, after) {
    var a = Number(before) || 0;
    var b = Number(after) || 0;
    return a - b;
  }

  function savedLabel(before, after) {
    var d = savedBytes(before, after);
    if (!(Number(after) > 0)) return '';
    if (d === 0) return 'same size';
    var pct = Number(before) > 0 ? Math.abs(d) / Number(before) * 100 : 0;
    var pctTxt = (pct >= 10 ? Math.round(pct) : pct.toFixed(1)) + '%';
    if (d > 0) return 'saved ' + formatBytes(d) + ' (' + pctTxt + ')';
    return 'grew ' + formatBytes(-d) + ' (' + pctTxt + ')';
  }

  function basename(name) {
    var s = String(name == null ? '' : name).replace(/\\/g, '/');
    var i = s.lastIndexOf('/');
    if (i >= 0) s = s.slice(i + 1);
    return s;
  }

  function stemOf(name) {
    var s = basename(name);
    var i = s.lastIndexOf('.');
    if (i > 0) return s.slice(0, i);
    return s || 'image';
  }

  function extOf(name) {
    var s = basename(name);
    var i = s.lastIndexOf('.');
    if (i > 0) return s.slice(i + 1).toLowerCase();
    return '';
  }

  function formatOf(value) {
    var s = String(value == null ? '' : value).toLowerCase();
    if (s === 'jpg' || s === 'jpeg' || s === 'image/jpeg') return 'jpeg';
    if (s === 'png' || s === 'image/png') return 'png';
    if (s === 'webp' || s === 'image/webp') return 'webp';
    if (s === 'avif' || s === 'image/avif') return 'avif';
    return '';
  }

  function mimeOf(format) {
    var f = formatOf(format) || format;
    return FORMAT_MIME[f] || '';
  }

  function extOfFormat(format) {
    var f = formatOf(format);
    return FORMAT_EXT[f] || FORMAT_EXT[String(format || '').toLowerCase()] || 'jpg';
  }

  function isHeicFile(file) {
    if (!file) return false;
    var name = file.name || file.path || '';
    var type = file.type || '';
    return HEIC_EXT.test(name) || HEIC_TYPE.test(type);
  }

  function isImageFile(file) {
    if (!file) return false;
    if (isHeicFile(file)) return false;
    var name = file.name || file.path || '';
    var type = file.type || '';
    if (IMAGE_TYPE.test(type)) return true;
    if (type && type.indexOf('image/') === 0 && !HEIC_TYPE.test(type)) return true;
    return IMAGE_EXT.test(name);
  }

  function sanitizeName(name) {
    var s = String(name == null ? '' : name);
    s = s.replace(/[\/\\:\0]/g, '_');
    s = s.replace(/[\x00-\x1f\x7f]/g, '');
    s = s.replace(/^\.+$/, 'image');
    s = s.replace(/\s+/g, ' ').trim();
    if (!s) s = 'image';
    if (s.length > 180) {
      var dot = s.lastIndexOf('.');
      if (dot > 0) s = s.slice(0, 160) + s.slice(dot);
      else s = s.slice(0, 180);
    }
    return s;
  }

  /**
   * Pad a 1-based index. {n} uses enough digits for `total` (at least 2).
   * width, if given, wins.
   */
  function padIndex(index, total, width) {
    var n = Math.max(1, Math.floor(Number(index) || 1));
    var t = Math.max(1, Math.floor(Number(total) || 1));
    var w = width != null ? Math.floor(Number(width)) : Math.max(2, String(t).length);
    if (!isFinite(w) || w < 1) w = 2;
    if (w > 8) w = 8;
    var s = String(n);
    while (s.length < w) s = '0' + s;
    return s;
  }

  /**
   * Apply a rename pattern.
   * Tokens: {name} stem, {n} padded index, {nn}/{nnn}/... fixed width,
   * {ext} output extension (no dot), {i} unpadded index.
   * Default pattern is '{name}_{n}'.
   */
  function applyPattern(pattern, originalName, index, total, ext) {
    var pat = String(pattern == null ? '' : pattern).trim();
    if (!pat) pat = '{name}_{n}';
    var name = stemOf(originalName);
    var outExt = String(ext == null ? '' : ext).replace(/^\./, '').toLowerCase() || 'jpg';
    var totalN = Math.max(1, Math.floor(Number(total) || 1));
    var idx = Math.max(1, Math.floor(Number(index) || 1));
    var out = pat.replace(/\{([a-z]+)\}/gi, function (_, tok) {
      tok = tok.toLowerCase();
      if (tok === 'name') return name;
      if (tok === 'ext') return outExt;
      if (tok === 'i') return String(idx);
      if (tok === 'n') return padIndex(idx, totalN);
      if (/^n+$/.test(tok)) return padIndex(idx, totalN, tok.length);
      return '';
    });
    out = sanitizeName(out);
    if (!out) out = 'image_' + padIndex(idx, totalN);
    if (!/\.[a-z0-9]+$/i.test(out)) out += '.' + outExt;
    else {
      /* If the pattern already ended in an extension, replace it with the output ext. */
      out = out.replace(/\.[a-z0-9]+$/i, '.' + outExt);
    }
    return out;
  }

  function uniqueNames(names) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < names.length; i++) {
      var n = sanitizeName(names[i] || 'image');
      var key = n.toLowerCase();
      if (seen[key]) {
        var m = n.match(/^(.*?)(\.[^.]+)?$/);
        var base = m[1];
        var e = m[2] || '';
        var k = 2;
        var cand = base + '_' + k + e;
        while (seen[cand.toLowerCase()]) {
          k += 1;
          cand = base + '_' + k + e;
        }
        n = cand;
        key = n.toLowerCase();
      }
      seen[key] = 1;
      out.push(n);
    }
    return out;
  }

  function wrapEncodeResult(value) {
    if (value && typeof value === 'object' && value.size != null) {
      return {
        size: Number(value.size) || 0,
        payload: value.payload !== undefined ? value.payload : value
      };
    }
    if (typeof value === 'number') return { size: value, payload: null };
    if (value && value.byteLength != null) return { size: value.byteLength, payload: value };
    if (value && value.length != null && typeof value.length === 'number') {
      return { size: value.length, payload: value };
    }
    return { size: 0, payload: value };
  }

  /**
   * Binary-search quality in [minQ, maxQ] so encode(q) is <= targetBytes
   * at the highest quality that still fits.
   * encode may be sync or async and may return a size, a buffer, or {size, payload}.
   * Returns Promise<{ quality, size, payload, overTarget, tries }>.
   */
  function findQuality(encode, targetBytes, opts) {
    opts = opts || {};
    var minQ = opts.minQ == null ? MIN_Q : Number(opts.minQ);
    var maxQ = opts.maxQ == null ? MAX_Q : Number(opts.maxQ);
    var maxTries = opts.maxTries == null ? 8 : Math.max(2, Number(opts.maxTries) || 8);
    if (!isFinite(minQ) || minQ < 0) minQ = MIN_Q;
    if (!isFinite(maxQ) || maxQ > 1) maxQ = MAX_Q;
    if (minQ > maxQ) {
      var tmp = minQ;
      minQ = maxQ;
      maxQ = tmp;
    }
    var target = Number(targetBytes);
    if (!isFinite(target) || target < 1) target = 1;

    function run(q) {
      q = Math.round(q * 100) / 100;
      if (q < minQ) q = minQ;
      if (q > maxQ) q = maxQ;
      return Promise.resolve().then(function () { return encode(q); }).then(function (v) {
        var r = wrapEncodeResult(v);
        r.quality = q;
        return r;
      });
    }

    return run(maxQ).then(function (hiRes) {
      var tries = 1;
      var smallest = hiRes;
      if (hiRes.size <= target) {
        return { quality: hiRes.quality, size: hiRes.size, payload: hiRes.payload, overTarget: false, tries: tries };
      }
      return run(minQ).then(function (loRes) {
        tries += 1;
        if (loRes.size < smallest.size) smallest = loRes;
        if (loRes.size > target) {
          return { quality: loRes.quality, size: loRes.size, payload: loRes.payload, overTarget: true, tries: tries };
        }
        var best = loRes;
        var lo = minQ;
        var hi = maxQ;
        function step() {
          if (tries >= maxTries || (hi - lo) <= 0.015) {
            return {
              quality: best.quality,
              size: best.size,
              payload: best.payload,
              overTarget: false,
              tries: tries
            };
          }
          var mid = Math.round(((lo + hi) / 2) * 100) / 100;
          if (mid <= lo || mid >= hi) {
            return {
              quality: best.quality,
              size: best.size,
              payload: best.payload,
              overTarget: false,
              tries: tries
            };
          }
          return run(mid).then(function (r) {
            tries += 1;
            if (r.size < smallest.size) smallest = r;
            if (r.size <= target) {
              best = r;
              lo = mid;
            } else {
              hi = mid;
            }
            return step();
          });
        }
        return step();
      });
    });
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function uid() {
    return 'ic' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function kbToBytes(kb) {
    var n = Number(kb);
    if (!isFinite(n) || n <= 0) return 1;
    return Math.round(n * 1024);
  }

  var api = {
    MIN_Q: MIN_Q,
    MAX_Q: MAX_Q,
    MIN_EDGE: MIN_EDGE,
    MAX_EDGE: MAX_EDGE,
    clamp: clamp,
    roundSize: roundSize,
    computeSize: computeSize,
    formatBytes: formatBytes,
    savedBytes: savedBytes,
    savedLabel: savedLabel,
    basename: basename,
    stemOf: stemOf,
    extOf: extOf,
    formatOf: formatOf,
    mimeOf: mimeOf,
    extOfFormat: extOfFormat,
    isHeicFile: isHeicFile,
    isImageFile: isImageFile,
    sanitizeName: sanitizeName,
    padIndex: padIndex,
    applyPattern: applyPattern,
    uniqueNames: uniqueNames,
    findQuality: findQuality,
    escapeHtml: escapeHtml,
    uid: uid,
    kbToBytes: kbToBytes
  };

  root.ICHelpers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
