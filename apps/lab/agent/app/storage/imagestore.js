/* Agent — app/storage/imagestore.js: AG14 gallery store for the Image page, kept apart from chats.
   IndexedDB 'agent-images' (v1), store 'images' {id (auto), blob (≤1024 px JPEG), prompt, model, time}.
   HR.imgstore.add(rec) -> id, list() -> newest first, del(id). Browser-only (not in the folder). */
HR.imgstore = (function () {
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (ok, no) {
      var r = indexedDB.open('agent-images', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('images', { keyPath: 'id', autoIncrement: true }); };
      r.onsuccess = function () { ok(r.result); }; r.onerror = function () { dbp = null; no(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) { return new Promise(function (ok, no) {
      var t = d.transaction('images', mode), s = t.objectStore('images'), out = fn(s);
      t.oncomplete = function () { ok(out && 'result' in out ? out.result : undefined); }; t.onerror = function () { no(t.error); };
    }); });
  }
  function add(rec) { return tx('readwrite', function (s) { return s.add(rec); }); }
  function list() { return tx('readonly', function (s) { return s.getAll(); }).then(function (l) { return (l || []).sort(function (a, b) { return b.time - a.time; }); }); }
  function del(id) { return tx('readwrite', function (s) { s.delete(id); }); }
  return { add: add, list: list, del: del };
})();
