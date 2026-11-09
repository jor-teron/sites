/* Zip — zp_save.js: Choose folder (File System Access), IndexedDB handle, stream writes, download fallback. ZP2 */
(function (root) {
  'use strict';

  var H = root.ZPHelpers;
  var DB_NAME = 'zip-zp';
  var DB_VER = 1;
  var STORE = 'kv';
  var KEY_ROOT = 'root';

  var supported = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
  var rootHandle = null;
  var state = supported ? 'none' : 'unsupported';
  var listeners = [];

  function emit() {
    listeners.forEach(function (fn) {
      try { fn(state, rootHandle ? rootHandle.name : ''); } catch (e) { /* ignore */ }
    });
  }

  function setState(s) {
    state = s;
    emit();
  }

  function idb(mode, fn) {
    return new Promise(function (ok, no) {
      if (!root.indexedDB) return no(new Error('IndexedDB is not available'));
      var r = indexedDB.open(DB_NAME, DB_VER);
      r.onupgradeneeded = function () {
        var db = r.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      r.onerror = function () { no(r.error || new Error('IndexedDB failed')); };
      r.onsuccess = function () {
        var db = r.result;
        var tx = db.transaction(STORE, mode);
        var req = fn(tx.objectStore(STORE));
        tx.oncomplete = function () {
          db.close();
          ok(req && 'result' in req ? req.result : undefined);
        };
        tx.onerror = function () { db.close(); no(tx.error || new Error('IndexedDB error')); };
      };
    });
  }

  async function init() {
    if (!supported) {
      setState('unsupported');
      return state;
    }
    try {
      rootHandle = await idb('readonly', function (s) { return s.get(KEY_ROOT); });
    } catch (e) {
      rootHandle = null;
    }
    if (!rootHandle) {
      setState('none');
      return state;
    }
    try {
      var p = await rootHandle.queryPermission({ mode: 'readwrite' });
      setState(p === 'granted' ? 'ready' : 'need');
    } catch (e) {
      setState('need');
    }
    return state;
  }

  async function pick() {
    if (!supported) throw new Error('Folder access is not supported in this browser');
    var h = await window.showDirectoryPicker({ id: 'zip-zp', mode: 'readwrite' });
    rootHandle = h;
    await idb('readwrite', function (s) { return s.put(h, KEY_ROOT); });
    setState('ready');
    return h.name;
  }

  async function reconnect() {
    if (!supported) throw new Error('Folder access is not supported in this browser');
    if (!rootHandle) return pick();
    var p = await rootHandle.requestPermission({ mode: 'readwrite' });
    setState(p === 'granted' ? 'ready' : 'need');
    return state;
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  function folderName() {
    return rootHandle ? rootHandle.name : '';
  }

  function isReady() {
    return state === 'ready' && !!rootHandle;
  }

  async function ensureDir(parts) {
    var d = rootHandle;
    for (var i = 0; i < parts.length; i++) {
      d = await d.getDirectoryHandle(parts[i], { create: true });
    }
    return d;
  }

  async function listNames(dirHandle) {
    var names = [];
    for await (var entry of dirHandle.values()) {
      names.push(entry.name);
    }
    return names;
  }

  async function openUniqueWritable(relPath) {
    if (!isReady()) throw new Error('No folder ready');
    var split = H.splitRelPath(relPath);
    var dir = await ensureDir(split.dirs);
    var existing = await listNames(dir);
    var name = H.uniqueFileName(split.file, existing);
    var fh = await dir.getFileHandle(name, { create: true });
    var writable = await fh.createWritable();
    var savedPath = split.dirs.length ? split.dirs.join('/') + '/' + name : name;
    return { writable: writable, savedPath: savedPath, fileName: name };
  }

  /** Stream a ReadableStream into the chosen folder. */
  async function streamToFolder(relPath, readable) {
    var opened = await openUniqueWritable(relPath);
    var writable = opened.writable;
    try {
      if (readable && typeof readable.getReader === 'function') {
        var reader = readable.getReader();
        for (;;) {
          var step = await reader.read();
          if (step.done) break;
          await writable.write(step.value);
        }
      } else if (readable instanceof Blob) {
        await writable.write(readable);
      } else {
        await writable.write(readable);
      }
      await writable.close();
      return opened.savedPath;
    } catch (err) {
      try { await writable.abort(); } catch (e) { /* ignore */ }
      throw err;
    }
  }

  function downloadBlob(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'download';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60_000);
    return fileName || 'download';
  }

  root.ZPSave = {
    supported: supported,
    state: function () { return state; },
    folderName: folderName,
    ready: isReady,
    init: init,
    pick: pick,
    reconnect: reconnect,
    onChange: onChange,
    openUniqueWritable: openUniqueWritable,
    streamToFolder: streamToFolder,
    downloadBlob: downloadBlob
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
