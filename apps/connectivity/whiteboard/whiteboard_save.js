/* Whiteboard WB1 — the one save module.
   Autosave: IndexedDB 'whiteboard-v1' / store 'boards', key = Hub code (or 'local' with no code),
   value {items, clr, ts}. PNG: everything on the board, cropped to the drawing + 40 px, ≤ 4096 px a side,
   current theme + background pattern, downloaded as whiteboard-YYYYMMDD-HHMM.png. */
(function () {
  'use strict';
  var DB = 'whiteboard-v1', ST = 'boards', dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no IndexedDB'));
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(ST); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function load(key) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var q = d.transaction(ST, 'readonly').objectStore(ST).get(key);
        q.onsuccess = function () { res(q.result || null); }; q.onerror = function () { res(null); };
      });
    }).catch(function () { return null; });
  }
  function store(key, data) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var tx = d.transaction(ST, 'readwrite'); tx.objectStore(ST).put(data, key);
        tx.oncomplete = function () { res(true); }; tx.onerror = function () { res(false); };
      });
    }).catch(function () { return false; });
  }
  function stamp() { var d = new Date(), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()); }
  function png(items, bg, dark) {
    return new Promise(function (res, rej) {
      if (!items.length) return rej(new Error('The board is empty.'));
      var a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
      items.forEach(function (it) { var bb = WBBoard.bbox(it); a = Math.min(a, bb[0]); b = Math.min(b, bb[1]); c = Math.max(c, bb[2]); d = Math.max(d, bb[3]); });
      a -= 40; b -= 40; c += 40; d += 40;
      var w = c - a, h = d - b, s = Math.min(2, 4096 / Math.max(w, h));
      var cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
      var g = cv.getContext('2d'), C = WBBoard.colors;
      g.fillStyle = dark ? C.BG_D : C.BG_L; g.fillRect(0, 0, cv.width, cv.height);
      WBBoard.drawBg(g, cv.width, cv.height, { x: -a * s, y: -b * s, z: s }, bg, dark);
      g.setTransform(s, 0, 0, s, -a * s, -b * s);
      items.forEach(function (it) { WBBoard.drawItem(g, it, dark); });
      cv.toBlob(function (blob) {
        if (!blob) return rej(new Error('Could not make the PNG.'));
        var url = URL.createObjectURL(blob), el = document.createElement('a');
        el.href = url; el.download = 'whiteboard-' + stamp() + '.png'; document.body.appendChild(el); el.click(); el.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        res(el.download);
      }, 'image/png');
    });
  }
  window.WBSave = { load: load, store: store, png: png };
})();
