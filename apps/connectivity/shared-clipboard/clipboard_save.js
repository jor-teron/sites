/* Shared Clipboard CB1/CB2 — the one save module.
   CB2: kind 'file' items {fname, mime, size, blob} (Blob in IndexedDB, all files ≤ 200 MB total, oldest unpinned dropped first),
   and the save folder (showDirectoryPicker handle in store 'kv', key 'dir'; ' (1)' names, never overwrite; else <a download>).
   History: IndexedDB 'clipboard-v1' / store 'items' (keyPath id). Item:
   {id, ts, kind:'text'|'image', text?, img? (data URL ≤1600 px), from ('me' or peer id), name, to? (peer id when sent to one device), pinned}.
   Kept: every pinned item + the newest 50 others. Also: copy to the system clipboard (text, or an image as PNG
   via ClipboardItem; fallbacks: hidden-textarea select + execCommand, image download) and image download. */
(function () {
  'use strict';
  var DB = 'clipboard-v1', ST = 'items', KV = 'kv', MAX = 50, FCAP = 200 * 1024 * 1024, dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no IndexedDB'));
      // var r = indexedDB.open(DB, 1);   (CB1)
      // r.onupgradeneeded = function () { r.result.createObjectStore(ST, { keyPath: 'id' }); };
      var r = indexedDB.open(DB, 2);   // CB2: + 'kv' store (save-folder handle)
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(ST)) d.createObjectStore(ST, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV);
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn, store) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var t = d.transaction(store || ST, mode), out = fn(t.objectStore(store || ST));
        t.oncomplete = function () { res(out && 'result' in out ? out.result : true); };
        t.onerror = t.onabort = function () { res(null); };
      });
    }).catch(function () { return null; });
  }
  function all() { return tx('readonly', function (s) { return s.getAll(); }).then(function (l) { return (l || []).sort(function (a, b) { return b.ts - a.ts; }); }); }
  function put(it) { return tx('readwrite', function (s) { s.put(it); }); }
  function del(id) { return tx('readwrite', function (s) { s.delete(id); }); }
  /* list newest first → returns ids that were dropped */
  function trim(list) {
    var n = 0, drop = [];
    list.forEach(function (it) { if (it.pinned) return; n++; if (n > MAX) drop.push(it.id); });
    if (drop.length) tx('readwrite', function (s) { drop.forEach(function (id) { s.delete(id); }); });
    return drop;
  }
  function clearUnpinned(list) { var ids = list.filter(function (i) { return !i.pinned; }).map(function (i) { return i.id; }); return tx('readwrite', function (s) { ids.forEach(function (id) { s.delete(id); }); }).then(function () { return ids; }); }

  /* CB2: file blobs total ≤ 200 MB. list newest first → ids of the oldest unpinned file items dropped to fit */
  function capFiles(list) {
    var tot = 0, drop = [];
    list.forEach(function (it) { if (it.kind === 'file') tot += it.size || 0; });
    for (var i = list.length - 1; i >= 0 && tot > FCAP; i--) { var it = list[i]; if (it.kind === 'file' && !it.pinned) { tot -= it.size || 0; drop.push(it.id); } }
    if (drop.length) tx('readwrite', function (s) { drop.forEach(function (id) { s.delete(id); }); });
    return drop;
  }

  /* ---- CB2: save folder (File System Access API; Chrome/Edge desktop). Handle kept in 'kv'/'dir'. ---- */
  var canFolder = typeof window.showDirectoryPicker === 'function' && window.isSecureContext !== false;
  function getDir() { return tx('readonly', function (s) { return s.get('dir'); }, KV); }
  function pickFolder() {
    return window.showDirectoryPicker({ id: 'shared-clipboard', mode: 'readwrite' }).then(function (h) { return tx('readwrite', function (s) { s.put(h, 'dir'); }, KV).then(function () { return h; }); });
  }
  function forgetFolder() { return tx('readwrite', function (s) { s.delete('dir'); }, KV); }
  function perm(h) {
    var o = { mode: 'readwrite' };
    if (!h.queryPermission) return Promise.resolve(true);
    return h.queryPermission(o).then(function (p) { return p === 'granted' || h.requestPermission(o).then(function (q) { return q === 'granted'; }); }).catch(function () { return false; });
  }
  function exists(dir, n) { return dir.getFileHandle(n).then(function () { return true; }, function () { return false; }); }
  function freeName(dir, n) {
    var m = n.match(/^(.*?)(\.[^.]{1,10})?$/), base = m[1] || 'file', ext = m[2] || '', k = 0;
    function next() { var c = k ? base + ' (' + k + ')' + ext : n; return exists(dir, c).then(function (e) { if (!e) return c; k++; return next(); }); }
    return next();
  }
  function safeName(n) { return String(n || 'file').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 180) || 'file'; }
  function aDownload(blob, n) {
    var u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = n;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 30000);
    return Promise.resolve({ how: 'download', name: n });
  }
  /* resolves {how:'folder'|'download', name}. Only ever called from a Save tap (never auto). */
  function saveFile(it) {
    var n = safeName(it.fname), blob = it.blob;
    if (!canFolder) return aDownload(blob, n);
    return getDir().then(function (dir) {
      if (!dir) return aDownload(blob, n);
      return perm(dir).then(function (ok) {
        if (!ok) return aDownload(blob, n);
        return freeName(dir, n).then(function (fn) {
          return dir.getFileHandle(fn, { create: true }).then(function (fh) { return fh.createWritable(); })
            .then(function (w) { return w.write(blob).then(function () { return w.close(); }); })
            .then(function () { return { how: 'folder', name: fn, dir: dir.name }; });
        }).catch(function () { return aDownload(blob, n); });
      });
    });
  }

  /* ---- system clipboard ---- */
  function fallbackText(t) {
    var a = document.createElement('textarea'); a.value = t; a.setAttribute('readonly', ''); a.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(a); a.select(); a.setSelectionRange(0, t.length);
    var ok = false; try { ok = document.execCommand('copy'); } catch (_) { /* */ }
    a.remove(); return ok;
  }
  function toPng(dataUrl) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { var c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); c.toBlob(function (b) { b ? res(b) : rej(new Error('png')); }, 'image/png'); };
      im.onerror = function () { rej(new Error('bad image')); }; im.src = dataUrl;
    });
  }
  /* resolves 'copied' | 'downloaded' (image fallback); rejects when text copy is impossible */
  function copy(it) {
    if (it.kind === 'image') {
      if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
        // pass a promise so Safari keeps the user gesture
        return navigator.clipboard.write([new ClipboardItem({ 'image/png': toPng(it.img) })]).then(function () { return 'copied'; })
          .catch(function () { return download(it).then(function () { return 'downloaded'; }); });
      }
      return download(it).then(function () { return 'downloaded'; });
    }
    var t = it.text || '';
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(function () { return 'copied'; }).catch(function () { if (fallbackText(t)) return 'copied'; throw new Error('Copy was blocked. Select the text and copy it by hand.'); });
    }
    return fallbackText(t) ? Promise.resolve('copied') : Promise.reject(new Error('Copy was blocked. Select the text and copy it by hand.'));
  }
  function stamp(ts) { var d = new Date(ts || Date.now()), p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); }
  function download(it) {
    return new Promise(function (res) {
      var a = document.createElement('a'), ext = /^data:image\/png/.test(it.img) ? 'png' : 'jpg';
      a.href = it.img; a.download = 'clipboard-' + stamp(it.ts) + '.' + ext; document.body.appendChild(a); a.click(); a.remove(); res(a.download);
    });
  }
  window.CBSave = { all: all, put: put, del: del, trim: trim, clearUnpinned: clearUnpinned, copy: copy, download: download, MAX: MAX,
    capFiles: capFiles, FCAP: FCAP, canFolder: canFolder, getDir: getDir, pickFolder: pickFolder, forgetFolder: forgetFolder, saveFile: saveFile };
})();
