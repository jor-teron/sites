/*
 * base-pics.js  (BS5)
 * Picture field blobs, kept in an IndexedDB 'pics' store (same 'office-base' database as the
 * main record) or in memory when storage is unavailable. Values in a row are a short key
 * (pic_…); the blob itself is never written into BASE.db, so undo snapshots stay small.
 * On insert the image is resized so the long side is at most 800 px, then saved as WebP
 * (or JPEG if the browser cannot make WebP).
 * API: BasePics.ingest(file, cb), .url(key, cb), .remove unused via .gc(), .revoke(key),
 *      .exportAll(cb), .importAll(map, cb), .clearAll(cb), .getBlob(key, cb), .putBlob(key, blob, cb)
 */
var BasePics = (function () {
  var MAX = 800, cache = {}, gcT = null;
  function toast(m) { try { if (typeof OfficeNotify !== "undefined") OfficeNotify.show(m, 2500); } catch (e) {} }
  function uid() { return "pic_" + (typeof BaseStore !== "undefined" ? BaseStore.uid() : Math.random().toString(36).slice(2, 9)); }
  function idb() { try { return typeof BaseStore !== "undefined" && BaseStore.idb() && !BASE.memOnly ? BaseStore.idb() : null; } catch (e) { return null; } }

  function putBlob(key, blob, cb) {
    cache[key] = { blob: blob, url: "" };
    var db = idb();
    if (!db) { if (cb) cb(true); return; }
    try {
      var tx = db.transaction("pics", "readwrite");
      tx.oncomplete = function () { if (cb) cb(true); };
      tx.onabort = tx.onerror = function () { if (cb) cb(true); }; /* memory cache still has it */
      tx.objectStore("pics").put(blob, key);
    } catch (e) { if (cb) cb(true); }
  }
  function getBlob(key, cb) {
    if (cache[key] && cache[key].blob) { cb(cache[key].blob); return; }
    var db = idb();
    if (!db) { cb(null); return; }
    try {
      var g = db.transaction("pics").objectStore("pics").get(key);
      g.onsuccess = function () { var b = g.result || null; if (b) cache[key] = { blob: b, url: (cache[key] && cache[key].url) || "" }; cb(b); };
      g.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  function delKeys(keys, cb) {
    keys.forEach(function (k) {
      if (cache[k] && cache[k].url) { try { URL.revokeObjectURL(cache[k].url); } catch (e) {} }
      delete cache[k];
    });
    var db = idb();
    if (!db || !keys.length) { if (cb) cb(); return; }
    try {
      var tx = db.transaction("pics", "readwrite");
      tx.oncomplete = function () { if (cb) cb(); };
      tx.onabort = tx.onerror = function () { if (cb) cb(); };
      var st = tx.objectStore("pics");
      keys.forEach(function (k) { try { st.delete(k); } catch (e) {} });
    } catch (e) { if (cb) cb(); }
  }

  function usedKeys() {
    var keys = {};
    function walk(db) {
      if (!db || !db.tables) return;
      db.tables.forEach(function (t) {
        (t.fields || []).forEach(function (f) {
          if (f.type !== "picture") return;
          (t.rows || []).forEach(function (r) {
            var v = r.v && r.v[f.id];
            if (v) keys[v] = 1;
          });
        });
      });
    }
    walk(typeof BASE !== "undefined" ? BASE.db : null);
    try { if (typeof BaseHistory !== "undefined") BaseHistory.eachSnap(function (s) { walk(s && s.db); }); } catch (e) {}
    return keys;
  }

  function gc() {
    clearTimeout(gcT);
    gcT = setTimeout(function () {
      var keep = usedKeys();
      var drop = [];
      Object.keys(cache).forEach(function (k) { if (!keep[k]) drop.push(k); });
      var db = idb();
      if (!db) { if (drop.length) delKeys(drop); return; }
      try {
        var req = db.transaction("pics").objectStore("pics").getAllKeys();
        req.onsuccess = function () {
          (req.result || []).forEach(function (k) { if (!keep[k] && drop.indexOf(k) < 0) drop.push(k); });
          if (drop.length) delKeys(drop);
        };
      } catch (e) {
        /* getAllKeys may be missing: just drop known unused cache entries */
        if (drop.length) delKeys(drop);
      }
    }, 400);
  }

  function url(key, cb) {
    if (!key) { if (cb) cb(""); return ""; }
    var c = cache[key];
    if (c && c.url) { if (cb) cb(c.url); return c.url; }
    getBlob(key, function (blob) {
      if (!blob) { if (cb) cb(""); return; }
      if (!cache[key]) cache[key] = { blob: blob, url: "" };
      if (!cache[key].url) {
        try { cache[key].url = URL.createObjectURL(blob); } catch (e) { cache[key].url = ""; }
      }
      if (cb) cb(cache[key].url);
    });
    return (cache[key] && cache[key].url) || "";
  }

  function canvasToBlob(canvas, cb) {
    function tryType(type, q, next) {
      try {
        if (typeof canvas.toBlob === "function") {
          canvas.toBlob(function (b) {
            if (b && b.size > 0 && (!b.type || b.type === type || type === "image/jpeg")) cb(b);
            else next();
          }, type, q);
          return;
        }
        var du = canvas.toDataURL(type, q);
        if (!du || du.indexOf("data:" + type) !== 0) return next();
        var bin = atob(du.split(",")[1] || ""), arr = new Uint8Array(bin.length), i;
        for (i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        cb(new Blob([arr], { type: type }));
      } catch (e) { next(); }
    }
    tryType("image/webp", 0.8, function () {
      tryType("image/jpeg", 0.85, function () { cb(null); });
    });
  }

  function resize(file, cb) {
    var src;
    try { src = URL.createObjectURL(file); } catch (e) { cb(null); return; }
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      var scale = Math.min(1, MAX / Math.max(w, h, 1));
      var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
      var c = document.createElement("canvas");
      c.width = cw; c.height = ch;
      try {
        var ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        if (ctx.imageSmoothingQuality) ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, cw, ch);
      } catch (e) { URL.revokeObjectURL(src); cb(null); return; }
      URL.revokeObjectURL(src);
      canvasToBlob(c, function (b) { cb(b); });
    };
    img.onerror = function () { URL.revokeObjectURL(src); cb(null); };
    img.src = src;
  }

  function ingest(file, cb) {
    if (!file) { if (cb) cb(null); return; }
    if (!/^image\//i.test(file.type || "") && !/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name || "")) {
      toast("Please choose a picture file"); if (cb) cb(null); return;
    }
    resize(file, function (blob) {
      if (!blob) { toast("That picture could not be read"); if (cb) cb(null); return; }
      var key = uid();
      putBlob(key, blob, function () { if (cb) cb(key); });
    });
  }

  function blobToB64(blob, cb) {
    var rd = new FileReader();
    rd.onload = function () {
      var s = String(rd.result || ""), i = s.indexOf(",");
      cb(i >= 0 ? s.slice(i + 1) : s, blob.type || "application/octet-stream");
    };
    rd.onerror = function () { cb("", blob.type || ""); };
    rd.readAsDataURL(blob);
  }
  function b64ToBlob(data, type) {
    try {
      var bin = atob(data || ""), arr = new Uint8Array(bin.length), i;
      for (i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new Blob([arr], { type: type || "application/octet-stream" });
    } catch (e) { return null; }
  }
  function exportAll(cb) {
    var keys = Object.keys(usedKeys()), out = {};
    function next(i) {
      if (i >= keys.length) { if (cb) cb(out); return; }
      getBlob(keys[i], function (blob) {
        if (!blob) return next(i + 1);
        blobToB64(blob, function (b64, type) {
          if (b64) out[keys[i]] = { type: type, data: b64 };
          next(i + 1);
        });
      });
    }
    next(0);
  }
  function importAll(map, cb) {
    var keys = Object.keys(map || {}), i = 0;
    function next() {
      if (i >= keys.length) { if (cb) cb(); return; }
      var k = keys[i++], rec = map[k], blob = rec && rec.data ? b64ToBlob(rec.data, rec.type) : null;
      if (!blob) return next();
      putBlob(k, blob, function () { next(); });
    }
    next();
  }
  function clearAll(cb) {
    Object.keys(cache).forEach(function (k) {
      if (cache[k] && cache[k].url) { try { URL.revokeObjectURL(cache[k].url); } catch (e) {} }
    });
    cache = {};
    var db = idb();
    if (!db) { if (cb) cb(); return; }
    try {
      var tx = db.transaction("pics", "readwrite");
      tx.oncomplete = function () { if (cb) cb(); };
      tx.onabort = tx.onerror = function () { if (cb) cb(); };
      tx.objectStore("pics").clear();
    } catch (e) { if (cb) cb(); }
  }

  function thumb(key, cls, size) {
    var img = document.createElement("img");
    img.className = cls || "base-thumb";
    img.alt = "";
    if (size) { img.width = size; img.height = size; }
    img.decoding = "async";
    url(key, function (u) { if (u) img.src = u; });
    return img;
  }

  return { ingest: ingest, url: url, gc: gc, thumb: thumb, MAX: MAX, usedKeys: usedKeys,
    getBlob: getBlob, putBlob: putBlob, exportAll: exportAll, importAll: importAll, clearAll: clearAll, blobToB64: blobToB64, b64ToBlob: b64ToBlob };
})();
