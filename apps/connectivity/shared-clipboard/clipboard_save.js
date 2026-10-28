/* Shared Clipboard CB1 — the one save module.
   History: IndexedDB 'clipboard-v1' / store 'items' (keyPath id). Item:
   {id, ts, kind:'text'|'image', text?, img? (data URL ≤1600 px), from ('me' or peer id), name, to? (peer id when sent to one device), pinned}.
   Kept: every pinned item + the newest 50 others. Also: copy to the system clipboard (text, or an image as PNG
   via ClipboardItem; fallbacks: hidden-textarea select + execCommand, image download) and image download. */
(function () {
  'use strict';
  var DB = 'clipboard-v1', ST = 'items', MAX = 50, dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no IndexedDB'));
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(ST, { keyPath: 'id' }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res) {
        var t = d.transaction(ST, mode), out = fn(t.objectStore(ST));
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
  window.CBSave = { all: all, put: put, del: del, trim: trim, clearUnpinned: clearUnpinned, copy: copy, download: download, MAX: MAX };
})();
