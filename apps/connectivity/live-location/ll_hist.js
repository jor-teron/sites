/* Live Location LL2 — position history in IndexedDB (works with no server).
   DB 'live-location-history' v1:
     'pts'  keyPath ['k','at'] = {k, at, lat, lon, acc}   one point; k = member key (dev id, or 'n:'+name for LL1 senders)
            index 'at' (retention prune). The [k, at] key de-duplicates the same point coming from live, the server or an upload.
     'who'  keyPath 'k' = {k, n, at, lat, lon, acc}       the newest point + name per member (last-seen markers, throttle seed).
   Throttle (live points, mine included): store only when moved >= 15 m OR >= 60 s since the last STORED point of that member.
   Merged points (history server) skip the throttle (the server stores with the same rule). Points older than the keep window are dropped.
   Light: one small write per stored point; ranges read by primary key bounds; no polling. */
(function () {
  'use strict';
  var DB = 'live-location-history', MIN_M = 15, MIN_MS = 60000, DAY = 86400000;
  var dbp = null, last = {};
  function req(r) { return new Promise(function (res, rej) { r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); }
  function done(tx) { return new Promise(function (res, rej) { tx.oncomplete = function () { res(); }; tx.onerror = tx.onabort = function () { rej(tx.error); }; }); }
  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) { rej(new Error('no IndexedDB')); return; }
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains('pts')) db.createObjectStore('pts', { keyPath: ['k', 'at'] }).createIndex('at', 'at');
        if (!db.objectStoreNames.contains('who')) db.createObjectStore('who', { keyPath: 'k' });
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    }).then(function (db) {
      return req(db.transaction('who').objectStore('who').getAll()).then(function (list) { list.forEach(function (w) { last[w.k] = w; }); return db; });
    });
    dbp.catch(function (e) { console.warn('ll hist', e); });
    return dbp;
  }
  function keepPoint(prev, p) {
    if (!prev) return true;
    if (p.at <= prev.at) return false;
    return p.at - prev.at >= MIN_MS || LLGeo.dist(prev, p) >= MIN_M;
  }
  function clean(k, n, p) {
    var o = { k: String(k).slice(0, 64), at: Math.round(+p.at), lat: +p.lat, lon: +p.lon, acc: Math.round(+p.acc || 0) };
    if (!o.k || !isFinite(o.at) || !isFinite(o.lat) || !isFinite(o.lon) || Math.abs(o.lat) > 90 || Math.abs(o.lon) > 180) return null;
    o.n = String(n || 'Device').slice(0, 40);
    return o;
  }
  function cutoff(now) { return (now || Date.now()) - LLStore.keep() * DAY; }
  function write(db, list) {
    var tx = db.transaction(['pts', 'who'], 'readwrite'), P = tx.objectStore('pts'), W = tx.objectStore('who');
    list.forEach(function (o) {
      P.put({ k: o.k, at: o.at, lat: o.lat, lon: o.lon, acc: o.acc });
      var w = last[o.k];
      if (!w || o.at >= w.at) { last[o.k] = { k: o.k, n: o.n, at: o.at, lat: o.lat, lon: o.lon, acc: o.acc }; W.put(last[o.k]); }
    });
    return done(tx);
  }
  /* live point: throttled */
  function add(k, n, p) {
    return open().then(function (db) {
      var o = clean(k, n, p); if (!o || o.at < cutoff()) return false;
      if (!keepPoint(last[o.k], o)) {
        if (last[o.k] && o.n !== last[o.k].n) { last[o.k].n = o.n; db.transaction('who', 'readwrite').objectStore('who').put(last[o.k]); }
        return false;
      }
      return write(db, [o]).then(function () { return true; });
    }).catch(function () { return false; });
  }
  /* points from the history server: [{k, n, lat, lon, acc, at}] (no throttle; duplicates overwrite) */
  function merge(list) {
    return open().then(function (db) {
      var c = cutoff(), ok = [];
      (list || []).forEach(function (p) { var o = clean(p.k, p.n, p); if (o && o.at >= c) ok.push(o); });
      if (!ok.length) return 0;
      return write(db, ok).then(function () { return ok.length; });
    }).catch(function () { return 0; });
  }
  function range(k, from, to) {
    return open().then(function (db) {
      return req(db.transaction('pts').objectStore('pts').getAll(IDBKeyRange.bound([k, from || 0], [k, to || Number.MAX_SAFE_INTEGER])));
    }).catch(function () { return []; });
  }
  function who() { return open().then(function () { return Object.keys(last).map(function (k) { return last[k]; }); }).catch(function () { return []; }); }
  function prune(days, now) {
    return open().then(function (db) {
      var c = (now || Date.now()) - (days || LLStore.keep()) * DAY, n = 0;
      var tx = db.transaction(['pts', 'who'], 'readwrite'), W = tx.objectStore('who');
      tx.objectStore('pts').index('at').openCursor(IDBKeyRange.upperBound(c, true)).onsuccess = function (e) {
        var cur = e.target.result; if (cur) { cur.delete(); n++; cur.continue(); }
      };
      Object.keys(last).forEach(function (k) { if (last[k].at < c) { W.delete(k); delete last[k]; } });
      return done(tx).then(function () { return n; });
    }).catch(function () { return 0; });
  }
  function clear() {
    return open().then(function (db) {
      var tx = db.transaction(['pts', 'who'], 'readwrite'); tx.objectStore('pts').clear(); tx.objectStore('who').clear(); last = {};
      return done(tx);
    });
  }
  function count() { return open().then(function (db) { return req(db.transaction('pts').objectStore('pts').count()); }).catch(function () { return 0; }); }
  window.LLHist = { open: open, add: add, merge: merge, range: range, who: who, prune: prune, clear: clear, count: count,
    keepPoint: keepPoint, MIN_M: MIN_M, MIN_MS: MIN_MS, DAY: DAY, _last: function () { return last; } };
})();
