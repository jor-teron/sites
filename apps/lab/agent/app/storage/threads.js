/* Agent — app/storage/threads.js: where chats live (AG4). HR.threads: list(), load(id), save(meta, msgs), remove(id), newId().
   Folder connected: agent/chats/threads/<id>.md (HR.threadfmt Markdown) + agent/chats/threads/index.json
   ({v:1, chats:[{id,title,provider,model,created,updated}]}). No folder: the same text in IndexedDB 'agent-chats'/'kv'
   ('index', 't:<id>'); Settings → Save chats Off also keeps them there. When a folder becomes ready, chats only in IndexedDB are copied into it (IndexedDB copy kept).
   The daily diary agent/chats/YYYY_MM/YYYY_MM_DD.md (HR.logs) is separate and unchanged. */
HR.threads = (function () {
  var DIR = 'agent/chats/threads/', IDX = DIR + 'index.json';
  function db(mode, fn) {
    return new Promise(function (ok, no) {
      var r = indexedDB.open('agent-chats', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onerror = function () { no(r.error); };
      r.onsuccess = function () { var d = r.result, tx = d.transaction('kv', mode), q = fn(tx.objectStore('kv'));
        tx.oncomplete = function () { d.close(); ok(q && q.result); }; tx.onerror = function () { d.close(); no(tx.error); }; };
    });
  }
  var idb = {
    get: function (k) { return db('readonly', function (s) { return s.get(k); }).catch(function () { return null; }); },
    put: function (k, v) { return db('readwrite', function (s) { return s.put(v, k); }); },
    del: function (k) { return db('readwrite', function (s) { return s.delete(k); }); }
  };
  function onDisk() { return HR.fs.ready() && HR.set.get('saveChats') !== 'off'; }   /* Save chats off -> browser only */
  function safe(id) { return String(id).replace(/[^A-Za-z0-9_-]/g, ''); }
  async function readIdx(disk) {
    try { var t = disk ? (await HR.fs.read(IDX)).text : await idb.get('index'); var o = JSON.parse(t || '{}'); return Array.isArray(o.chats) ? o.chats : []; }
    catch (e) { return []; }
  }
  function writeIdx(disk, arr) { var t = JSON.stringify({ v: 1, chats: arr }, null, 1); return disk ? HR.fs.write(IDX, t) : idb.put('index', t); }
  function sort(arr) { return arr.sort(function (a, b) { return String(b.updated).localeCompare(String(a.updated)); }); }
  async function list() { return sort(await readIdx(onDisk())); }
  async function load(id) {
    var t = null, disk = onDisk();
    try { t = disk ? (await HR.fs.read(DIR + safe(id) + '.md')).text : await idb.get('t:' + safe(id)); } catch (e) { t = null; }
    if (t == null && disk) t = await idb.get('t:' + safe(id));
    return t == null ? null : HR.threadfmt.parse(t).list;
  }
  async function save(meta, msgs) {
    var disk = onDisk(), text = HR.threadfmt.toMd(meta, msgs), id = safe(meta.id);
    if (disk) await HR.fs.write(DIR + id + '.md', text); else await idb.put('t:' + id, text);
    var arr = await readIdx(disk), i = arr.findIndex(function (c) { return c.id === id; }), row = {
      id: id, title: meta.title || 'New chat', provider: meta.provider || '', model: meta.model || '', created: meta.created || meta.updated, updated: meta.updated };
    if (i < 0) arr.push(row); else arr[i] = row;
    await writeIdx(disk, sort(arr));
  }
  async function remove(id) {
    var disk = onDisk(); id = safe(id);
    var arr = (await readIdx(disk)).filter(function (c) { return c.id !== id; }); await writeIdx(disk, arr);
    if (disk) await HR.fs.remove(DIR + id + '.md').catch(function () {});
    await idb.del('t:' + id).catch(function () {});
    var ia = (await readIdx(false)).filter(function (c) { return c.id !== id; }); await writeIdx(false, ia).catch(function () {});
  }
  /* Folder just became ready: copy IndexedDB-only chats into it */
  async function merge() {
    var mine = onDisk() ? await readIdx(false) : []; if (!mine.length) return 0;
    var disk = await readIdx(true), have = {}, n = 0; disk.forEach(function (c) { have[c.id] = 1; });
    for (var i = 0; i < mine.length; i++) {
      var c = mine[i], t = await idb.get('t:' + c.id); if (have[c.id] || t == null) continue;
      await HR.fs.write(DIR + c.id + '.md', t); disk.push(c); n++;
    }
    if (n) await writeIdx(true, sort(disk));
    return n;
  }
  function newId() { var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '-' + Math.random().toString(36).slice(2, 6); }
  return { list: list, load: load, save: save, remove: remove, merge: merge, newId: newId, DIR: DIR };
})();
