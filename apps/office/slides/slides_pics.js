/* Hub Office Slides SL3 — pictures (SLPics): read, downscale, re-encode, keep, show.
   - fromFile(file): decode, downscale so the long side is at most 1920 px, re-encode as WebP (JPEG where the browser
     has no WebP encoder); pictures with real transparency stay PNG. When the original file is already small enough and
     smaller than the re-encode, the original bytes are kept. Result: a data URL (the form stored in .hslides files).
   - Storage: a picture's data URL lives in IndexedDB 'hub-slides-pics' (store 'pics', key = content hash), so the
     deck record in localStorage ('slides-deck-v1:<id>') only holds { key, x, y, w, h, ... } and stays small. Same picture
     twice = stored once. When IndexedDB is missing or fails, the data URL is kept inline in the deck record (pic.inl).
   - hydrate(deck): fills pic.src from IndexedDB (async, once per key, cached in memory).
   - url(pic): a blob: URL for the picture (made once per key), so the editor, thumbnails and Present all show the same
     decoded image and re-rendering a thumbnail never re-parses a long data URL.
   - gc(keys): at start-up, drops stored pictures no deck uses any more (older than one day, so a picture another tab
     has just added is never touched). */
(function () {
  'use strict';
  var MAX_SIDE = 1920, MAX_FILE = 40 * 1024 * 1024, DBN = 'hub-slides-pics', ST = 'pics', DAY = 864e5;
  var cache = {}, urls = {}, dbp = null;
  var SRC_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]/;

  /* cyrb53: a fast 53-bit string hash (content key; same picture = same key) */
  function hash(s) {
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0, c; i < s.length; i++) { c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  function keyOf(src) { return 'p' + hash(src).toString(36) + '-' + src.length.toString(36); }
  function validSrc(s) { return typeof s === 'string' && s.length < 16 * 1024 * 1024 && SRC_RE.test(s.slice(0, 64)); }

  /* ---------- IndexedDB (guarded: any failure = inline fallback) ---------- */
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res) {
      try {
        if (!window.indexedDB) return res(null);
        var r = indexedDB.open(DBN, 1);
        r.onupgradeneeded = function () { try { r.result.createObjectStore(ST); } catch (_) { /* */ } };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { res(null); };
        r.onblocked = function () { res(null); };
      } catch (_) { res(null); }
    });
    return dbp;
  }
  /* store a data URL; resolves to its key, or '' when it could not be stored (then keep it inline) */
  function put(src) {
    var k = keyOf(src); cache[k] = src;
    return db().then(function (d) {
      if (!d) return '';
      return new Promise(function (res) {
        try {
          var tx = d.transaction(ST, 'readwrite');
          tx.objectStore(ST).put({ src: src, at: Date.now() }, k);
          tx.oncomplete = function () { res(k); };
          tx.onerror = tx.onabort = function () { res(''); };
        } catch (_) { res(''); }
      });
    }, function () { return ''; });
  }
  function getMany(keys) {
    var out = {};
    if (!keys.length) return Promise.resolve(out);
    return db().then(function (d) {
      if (!d) return out;
      return new Promise(function (res) {
        try {
          var tx = d.transaction(ST, 'readonly'), os = tx.objectStore(ST);
          keys.forEach(function (k) { var r = os.get(k); r.onsuccess = function () { var v = r.result; if (v && validSrc(v.src)) out[k] = v.src; }; });
          tx.oncomplete = function () { res(out); };
          tx.onerror = tx.onabort = function () { res(out); };
        } catch (_) { res(out); }
      });
    }, function () { return out; });
  }
  /* fill pic.src for every picture of the deck that only has a key; resolves when done (never rejects) */
  function hydrate(deck) {
    if (!deck) return Promise.resolve();
    var need = {};
    deck.slides.forEach(function (s) { (s.pics || []).forEach(function (p) {
      if (p.src || !p.key) return;
      if (cache[p.key]) p.src = cache[p.key]; else need[p.key] = 1;
    }); });
    var keys = Object.keys(need);
    if (!keys.length) return Promise.resolve();
    return getMany(keys).then(function (got) {
      Object.keys(got).forEach(function (k) { cache[k] = got[k]; });
      deck.slides.forEach(function (s) { (s.pics || []).forEach(function (p) {
        if (!p.src && p.key) { if (cache[p.key]) { p.src = cache[p.key]; p.miss = false; } else p.miss = true; }
      }); });
    });
  }
  /* store every inline picture of a list of slides (import); sets key, inl */
  function storeAll(slides) {
    var jobs = [];
    slides.forEach(function (s) { (s.pics || []).forEach(function (p) {
      if (!p.src) return;
      jobs.push(put(p.src).then(function (k) { if (k) { p.key = k; p.inl = false; } else { p.key = keyOf(p.src); p.inl = true; } }));
    }); });
    return Promise.all(jobs);
  }
  function gc(keep) {
    return db().then(function (d) {
      if (!d) return 0;
      return new Promise(function (res) {
        var n = 0;
        try {
          var tx = d.transaction(ST, 'readwrite'), cur = tx.objectStore(ST).openCursor(), now = Date.now();
          cur.onsuccess = function () {
            var c = cur.result; if (!c) return;
            var v = c.value || {};
            if (!keep[c.key] && !(c.key in cache) && now - (+v.at || 0) > DAY) { c.delete(); n++; }
            c.continue();
          };
          tx.oncomplete = function () { res(n); };
          tx.onerror = tx.onabort = function () { res(n); };
        } catch (_) { res(n); }
      });
    }, function () { return 0; });
  }

  /* ---------- display: one blob: URL per picture ---------- */
  function toBlob(src) {
    var i = src.indexOf(','), type = src.slice(5, i).split(';')[0], bin = atob(src.slice(i + 1)), u = new Uint8Array(bin.length);
    for (var j = 0; j < bin.length; j++) u[j] = bin.charCodeAt(j);
    return new Blob([u], { type: type });
  }
  function url(p) {
    if (!p || !p.src) return '';
    var k = p.key || (p.key = keyOf(p.src));
    if (!urls[k]) { try { urls[k] = URL.createObjectURL(toBlob(p.src)); } catch (_) { return p.src; } }
    return urls[k];
  }

  /* ---------- reading a picture file: downscale + re-encode ---------- */
  function readURL(blob) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(String(r.result || '')); }; r.onerror = rej; r.readAsDataURL(blob); });
  }
  function loadImg(blob) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(blob), im = new Image();
      im.onload = function () { res({ im: im, u: u }); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('decode')); };
      im.src = u;
    });
  }
  function hasAlpha(ctx, w, h) {
    var d; try { d = ctx.getImageData(0, 0, w, h).data; } catch (_) { return false; }
    for (var i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
    return false;
  }
  /* resolves { src, w, h, type, scaled } or { error } (never rejects) */
  function fromFile(file) {
    if (!file || !/^image\//.test(file.type || '')) return Promise.resolve({ error: 'That is not a picture.' });
    if (file.size > MAX_FILE) return Promise.resolve({ error: 'The picture is too big (over 40 MB).' });
    return loadImg(file).then(function (o) {
      var im = o.im, iw = im.naturalWidth, ih = im.naturalHeight;
      if (!iw || !ih) { URL.revokeObjectURL(o.u); return { error: 'Could not read that picture.' }; }
      var s = Math.min(1, MAX_SIDE / Math.max(iw, ih)), w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s));
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(im, 0, 0, w, h);
      URL.revokeObjectURL(o.u);
      var alpha = file.type !== 'image/jpeg' && hasAlpha(ctx, w, h), src, type;
      if (alpha) { src = cv.toDataURL('image/png'); type = 'image/png'; }
      else {
        src = cv.toDataURL('image/webp', 0.82); type = 'image/webp';
        if (src.indexOf('data:image/webp') !== 0) { src = cv.toDataURL('image/jpeg', 0.85); type = 'image/jpeg'; }
      }
      cv.width = cv.height = 0;   /* free the canvas memory now (4 GB machines) */
      /* the original is already small enough: keep it when it is smaller and the same kind (no alpha lost) */
      var keepOrig = s === 1 && file.size * 1.37 < src.length &&
        (alpha ? file.type === 'image/png' : (file.type === 'image/jpeg' || file.type === 'image/webp'));
      if (!keepOrig) return { src: src, w: w, h: h, type: type, scaled: s < 1 };
      return readURL(file).then(function (o2) { return validSrc(o2) ? { src: o2, w: w, h: h, type: file.type, scaled: false } : { src: src, w: w, h: h, type: type, scaled: false }; },
        function () { return { src: src, w: w, h: h, type: type, scaled: false }; });
    }, function () { return { error: 'Could not read that picture.' }; });
  }

  window.SLPics = { MAX_SIDE: MAX_SIDE, fromFile: fromFile, put: put, hydrate: hydrate, storeAll: storeAll, gc: gc, url: url,
    keyOf: keyOf, validSrc: validSrc, cached: function (k) { return cache[k] || ''; } };
})();
