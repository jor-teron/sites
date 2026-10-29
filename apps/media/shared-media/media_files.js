/* Shared media files module (apps/media/shared-media/media_files.js), first used by Music Player MP1.
   Reusable by Video Player (VP1) and Gallery. No libraries, nothing decoded here.
   window.MediaFiles = {
     EXT: {audio:[...], video:[...], image:[...]}, kindOf(name) -> 'audio'|'video'|'image'|'',
     canPickFolder,                         true when showDirectoryPicker exists (Chromium desktop)
     pickFolder(appId, {kinds, depth})      -> Promise<{name, files:[entry], handle|null}|null>  (null = cancelled)
     pickFiles({kinds, multiple})           -> Promise<{name:'', files:[entry]}|null>
     savedFolder(appId)                     -> Promise<{name}|null>   (a folder handle remembered in IndexedDB)
     reopen(appId, {kinds, depth, ask})     -> Promise<{name, files, handle}|null>  ask:true must run in a user gesture
     forget(appId)                          -> Promise
     fromDrop(dataTransfer, {kinds})        -> Promise<{name:'', files}>
     key(entry) / sameFile(a, b), positions(ns) -> {get, set, clear, all}
   }
   entry = {name, path, size, lastModified, kind, type, file}; path = "<folder>/<sub>/<name>" (the picked folder's
   name first, the same for showDirectoryPicker and <input webkitdirectory>), or just the name for loose files.
   Storage (separate from each app's own save module, because it is shared):
     IndexedDB 'shared-media-v1' store 'handles' : key appId -> FileSystemDirectoryHandle
     localStorage 'shared-media-pos-v1'          : {ns: {key: [seconds, duration, savedAt]}} (newest 300 per ns) */
(function () {
  'use strict';
  var EXT = {
    audio: ['mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'wav', 'flac', 'weba', 'webm', 'mp4a', 'm4b'],
    video: ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'ogv', '3gp'],
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg']
  };
  var MAX_DEPTH = 6, MAX_FILES = 20000;
  function ext(n) { var i = String(n).lastIndexOf('.'); return i < 0 ? '' : String(n).slice(i + 1).toLowerCase(); }
  /* webm can be audio or video: the MIME type decides when there is one, else the asked kinds decide */
  function kindOf(name, type, kinds) {
    var e = ext(name), t = String(type || '');
    if (t.indexOf('audio/') === 0) return 'audio';
    if (t.indexOf('video/') === 0 && e !== 'weba') return (kinds && kinds.indexOf('video') < 0 && kinds.indexOf('audio') >= 0 && e === 'webm') ? 'audio' : 'video';
    if (t.indexOf('image/') === 0) return 'image';
    var order = kinds && kinds.length ? kinds : ['audio', 'video', 'image'];
    for (var i = 0; i < order.length; i++) if (EXT[order[i]] && EXT[order[i]].indexOf(e) >= 0) return order[i];
    for (var k in EXT) if (EXT[k].indexOf(e) >= 0) return k;
    return '';
  }
  function want(kinds, k) { return !!k && (!kinds || !kinds.length || kinds.indexOf(k) >= 0); }
  function entry(file, path, kinds) {
    return { name: file.name, path: path || file.name, size: file.size, lastModified: file.lastModified || 0,
      kind: kindOf(file.name, file.type, kinds), type: file.type || '', file: file };
  }
  function byPath(a, b) { return a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }); }

  /* ---------- IndexedDB (handles) ---------- */
  var hasIDB = typeof indexedDB !== 'undefined';
  function db() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open('shared-media-v1', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('handles'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
  }
  function idb(mode, fn) {
    if (!hasIDB) return Promise.resolve(null);
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('handles', mode), r = fn(t.objectStore('handles'));
        t.oncomplete = function () { d.close(); res(r && r.result); }; t.onerror = function () { d.close(); rej(t.error); };
      });
    }).catch(function () { return null; });
  }
  var canPickFolder = typeof window.showDirectoryPicker === 'function';

  /* ---------- walking a directory handle (no file is read, only listed) ---------- */
  async function walk(dir, prefix, depth, kinds, out) {
    if (out.length >= MAX_FILES) return;
    var subs = [];
    for await (var h of dir.values()) {
      if (h.kind === 'directory') { if (depth > 0 && h.name.charAt(0) !== '.') subs.push(h); continue; }
      var k = kindOf(h.name, '', kinds); if (!want(kinds, k)) continue;
      try { var f = await h.getFile(); out.push(entry(f, prefix + '/' + f.name, kinds)); } catch (_) { /* unreadable */ }
      if (out.length >= MAX_FILES) return;
    }
    for (var i = 0; i < subs.length; i++) await walk(subs[i], prefix + '/' + subs[i].name, depth - 1, kinds, out);
  }
  async function listHandle(h, o) {
    var out = []; await walk(h, h.name, o.depth == null ? MAX_DEPTH : o.depth, o.kinds, out);
    out.sort(byPath); return { name: h.name, files: out, handle: h };
  }

  /* ---------- <input> fallback ---------- */
  function input(dir, multiple, kinds) {
    return new Promise(function (res) {
      var i = document.createElement('input'); i.type = 'file'; i.hidden = true; i.multiple = multiple !== false;
      if (dir) { i.webkitdirectory = true; i.setAttribute('webkitdirectory', ''); }
      else if (kinds && kinds.length) i.accept = kinds.map(function (k) { return k + '/*'; }).concat([].concat.apply([], kinds.map(function (k) { return (EXT[k] || []).map(function (e) { return '.' + e; }); }))).join(',');
      var done = false;
      function fin(v) { if (done) return; done = true; i.remove(); res(v); }
      i.addEventListener('change', function () { fin(Array.prototype.slice.call(i.files || [])); });
      i.addEventListener('cancel', function () { fin(null); });
      document.body.appendChild(i); i.click();
    });
  }
  function fromList(list, kinds) {
    var out = [], name = '';
    for (var j = 0; j < list.length && out.length < MAX_FILES; j++) {
      var f = list[j], p = f.webkitRelativePath || f.name;
      if (!name && f.webkitRelativePath) name = p.split('/')[0];
      var e = entry(f, p, kinds); if (want(kinds, e.kind)) out.push(e);
    }
    out.sort(byPath); return { name: name, files: out, handle: null };
  }

  async function pickFolder(appId, o) {
    o = o || {};
    if (canPickFolder && !o.noHandle) {
      var h;
      try { h = await window.showDirectoryPicker({ id: String(appId || 'media').replace(/[^\w-]/g, '').slice(0, 32) || 'media', mode: 'read' }); }
      catch (e) { if (e && e.name === 'AbortError') return null; h = null; }
      if (h) { idb('readwrite', function (s) { return s.put(h, appId); }); return listHandle(h, o); }
    }
    var l = await input(true, true, o.kinds); return l ? fromList(l, o.kinds) : null;
  }
  async function pickFiles(o) {
    o = o || {}; var l = await input(false, o.multiple, o.kinds); if (!l) return null;
    var r = fromList(l, o.kinds); r.name = ''; return r;
  }
  async function savedFolder(appId) {
    if (!canPickFolder) return null;
    var h = await idb('readonly', function (s) { return s.get(appId); });
    return h && h.name ? { name: h.name } : null;
  }
  async function reopen(appId, o) {
    o = o || {};
    if (!canPickFolder) return null;
    var h = await idb('readonly', function (s) { return s.get(appId); }); if (!h) return null;
    try {
      var q = { mode: 'read' }, p = await h.queryPermission(q);
      if (p !== 'granted' && o.ask) p = await h.requestPermission(q);
      if (p !== 'granted') return null;
      return await listHandle(h, o);
    } catch (_) { return null; }
  }
  function forget(appId) { return idb('readwrite', function (s) { return s.delete(appId); }); }

  async function fromDrop(dt, o) {
    o = o || {}; var out = [], items = dt && dt.items ? Array.prototype.slice.call(dt.items) : [];
    var hs = [];
    if (items.length && items[0].getAsFileSystemHandle) {
      for (var i = 0; i < items.length; i++) { if (items[i].kind === 'file') hs.push(items[i].getAsFileSystemHandle()); }
      hs = (await Promise.all(hs)).filter(Boolean);
      for (var j = 0; j < hs.length; j++) {
        if (hs[j].kind === 'directory') { var r = await listHandle(hs[j], o); out = out.concat(r.files); }
        else { var f = await hs[j].getFile(); var e = entry(f, f.name, o.kinds); if (want(o.kinds, e.kind)) out.push(e); }
      }
      out.sort(byPath); return { name: '', files: out, handle: null };
    }
    return fromList(Array.prototype.slice.call((dt && dt.files) || []), o.kinds);
  }

  /* ---------- identity + remembered positions ---------- */
  function key(e) { return e ? String(e.path || e.name) + '|' + (e.size || 0) : ''; }
  function sameFile(a, b) { return !!a && !!b && (a.path === b.path || (a.name === b.name && (!a.size || !b.size || a.size === b.size))); }
  var PKEY = 'shared-media-pos-v1', CAP = 300;
  function rd() { try { var v = JSON.parse(localStorage.getItem(PKEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } }
  function wr(v) { try { localStorage.setItem(PKEY, JSON.stringify(v)); } catch (_) { /* full or blocked */ } }
  function positions(ns) {
    ns = String(ns || 'media');
    return {
      get: function (k) { var a = (rd()[ns] || {})[k]; return a ? { pos: +a[0] || 0, dur: +a[1] || 0, at: +a[2] || 0 } : null; },
      set: function (k, pos, dur) {
        if (!k) return; var all = rd(), m = all[ns] || (all[ns] = {});
        m[k] = [Math.round((+pos || 0) * 10) / 10, Math.round(+dur || 0), Date.now()];
        var ks = Object.keys(m); if (ks.length > CAP) ks.sort(function (a, b) { return m[a][2] - m[b][2]; }).slice(0, ks.length - CAP).forEach(function (x) { delete m[x]; });
        wr(all);
      },
      clear: function (k) { var all = rd(); if (all[ns]) { if (k) delete all[ns][k]; else delete all[ns]; wr(all); } },
      all: function () { return rd()[ns] || {}; }
    };
  }

  window.MediaFiles = { VERSION: 'MP1', EXT: EXT, ext: ext, kindOf: kindOf, canPickFolder: canPickFolder,
    pickFolder: pickFolder, pickFiles: pickFiles, savedFolder: savedFolder, reopen: reopen, forget: forget,
    fromDrop: fromDrop, fromList: fromList, key: key, sameFile: sameFile, positions: positions };
})();
