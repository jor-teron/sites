/* Agent — app/storage/fs.js: granted folder via the File System Access API (HR3). No OPFS fallback.
   HR.fs: supported, state() 'unsupported'|'none'|'need'|'ready', name(), init() (handle from IndexedDB 'agent'/'kv'/'root',
   queryPermission; AG1: falls back once to the old 'harness' db), pick(), reconnect() (requestPermission; needs a tap), ready(), onChange(fn).
   AG4: remove(path) deletes one file (chat delete).
   Paths are relative to the folder root: '/', '\', 'C:' and '..' are rejected (norm). list(path), read(path) -> {text,size},
   write(path, text), append(path, text), stat(path), walk(path, fn) — all stay inside the folder. */
HR.fs = (function () {
  var supported = typeof window.showDirectoryPicker === 'function', root = null, st = supported ? 'none' : 'unsupported', subs = [];
  function idb(mode, fn) {
    return new Promise(function (ok, no) {
      var r = indexedDB.open('agent', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
      r.onerror = function () { no(r.error); };
      r.onsuccess = function () { var db = r.result, tx = db.transaction('kv', mode), q = fn(tx.objectStore('kv'));
        tx.oncomplete = function () { db.close(); ok(q && q.result); }; tx.onerror = function () { db.close(); no(tx.error); }; };
    });
  }
  function set(s) { st = s; subs.forEach(function (f) { try { f(st); } catch (e) {} }); }
  function onChange(f) { subs.push(f); }
  async function init() {
    if (!supported) return st;
    try { root = await idb('readonly', function (s) { return s.get('root'); }); } catch (e) { root = null; }
    if (!root && HR.migrate) { root = await HR.migrate.oldRoot(); if (root) await idb('readwrite', function (s) { return s.put(root, 'root'); }).catch(function () {}); }
    if (!root) { set('none'); return st; }
    var p = await root.queryPermission({ mode: 'readwrite' }); set(p === 'granted' ? 'ready' : 'need'); return st;
  }
  async function pick() {
    if (!supported) throw new Error('Folder access is not supported in this browser');
    var h = await window.showDirectoryPicker({ id: 'agent', mode: 'readwrite' });
    root = h; await idb('readwrite', function (s) { return s.put(h, 'root'); }); set('ready'); return h.name;
  }
  async function reconnect() {
    if (!root) return pick();
    var p = await root.requestPermission({ mode: 'readwrite' }); set(p === 'granted' ? 'ready' : 'need'); return st;
  }
  function norm(path) {
    var p = String(path == null ? '' : path).trim().replace(/\\/g, '/');
    if (/^\//.test(p) || /^[a-z]:/i.test(p) || /^[a-z]+:\/\//i.test(p)) throw new Error('Absolute paths are not allowed; use a path relative to the folder');
    var parts = p.split('/').filter(function (x) { return x && x !== '.'; });
    if (parts.some(function (x) { return x === '..'; })) throw new Error("'..' is not allowed; paths must stay inside the folder");
    return parts;
  }
  function need() { if (st !== 'ready') throw new Error('No folder connected'); }
  async function dir(parts, create) { var d = root; for (var i = 0; i < parts.length; i++) d = await d.getDirectoryHandle(parts[i], { create: !!create }); return d; }
  async function fileH(path, create) {
    need(); var parts = norm(path); if (!parts.length) throw new Error('A file path is needed');
    var d = await dir(parts.slice(0, -1), create); return d.getFileHandle(parts[parts.length - 1], { create: !!create });
  }
  async function list(path) {
    need(); var d = await dir(norm(path)), out = [];
    for await (var e of d.values()) out.push({ name: e.name, kind: e.kind });
    return out.sort(function (a, b) { return a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1; });
  }
  async function stat(path) { try { var f = await (await fileH(path)).getFile(); return { size: f.size, exists: true }; } catch (e) { return { size: 0, exists: false }; } }
  async function read(path) { var f = await (await fileH(path)).getFile(); return { text: await f.text(), size: f.size }; }
  async function write(path, text) { var w = await (await fileH(path, true)).createWritable(); await w.write(text); await w.close(); }
  async function remove(path) { var parts = norm(path); need(); var d = await dir(parts.slice(0, -1)); await d.removeEntry(parts[parts.length - 1]); }
  async function append(path, text) {
    var h = await fileH(path, true), size = (await h.getFile()).size, w = await h.createWritable({ keepExistingData: true });
    await w.seek(size); await w.write(text); await w.close();
  }
  /* walk(path, fn(relPath, handle) -> false to stop); skips .git / node_modules */
  async function walk(path, fn) {
    need(); var start = norm(path), stack = [[start.join('/'), await dir(start)]];
    while (stack.length) {
      var top = stack.pop();
      for await (var e of top[1].values()) {
        var rel = top[0] ? top[0] + '/' + e.name : e.name;
        if (e.kind === 'directory') { if (e.name !== '.git' && e.name !== 'node_modules') stack.push([rel, e]); }
        else if (await fn(rel, e) === false) return;
      }
    }
  }
  return { supported: supported, state: function () { return st; }, name: function () { return root ? root.name : ''; }, ready: function () { return st === 'ready'; },
    init: init, pick: pick, reconnect: reconnect, onChange: onChange, norm: norm, list: list, stat: stat, read: read, write: write, append: append, remove: remove, walk: walk };
})();
