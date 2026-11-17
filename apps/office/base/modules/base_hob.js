/* ============================================================
   FILE: modules/base_hob.js
   ROLE: BS10 native .hob Save / Save As of the current Base
         database, through ../shared/office-native.js (the same
         Documents / picker / download path Spreadsheet, Tables
         and Presentation use). The JSON format is unchanged:
         magic "hbase" version 1. Old .hbase files still open
         from a File or a Hub hash (#drive=…&file=…). Live data
         stays in IndexedDB ('office-base'). File → Backup… (the
         dated download) and Restore / Import stay as they are.
         Pictures are packed the same way Backup does
         (BasePics.exportAll). Autosave of the .hob never
         downloads on each edit.
         (before BS10) Save and Ctrl+S only flushed IndexedDB;
         a .hob file was Backup / Restore only. HOB1's readme
         claimed drag-and-drop of .hob / .hbase, but it was not
         implemented.
         BS11: a dropped .odb, or a Hub #drive=…&file=… link ending
         .odb, is imported (tables and rows) through BaseFiles.open.
   ============================================================ */
(function (root) {
  'use strict';

  var Hob = {};
  Hob.EXT = 'hob';
  Hob.LEGACY = 'hbase';
  Hob.MAGIC = 'hbase';
  Hob.VERSION = 1;
  Hob.MAX = 48 * 1024 * 1024;
  Hob.FALLBACK = 'base';

  function fail(msg) {
    var e = new Error(msg);
    e.userMessage = msg;
    throw e;
  }
  function nameOf(v) {
    var n = typeof v === 'string' ? v : (v && v.name) || '';
    return String(n || '');
  }
  function emptyDb() {
    return { schema: 8, tables: [], current: null, queries: [], reports: [], views: [] };
  }
  function copy(x) {
    return JSON.parse(JSON.stringify(x));
  }
  function logical(pk, name) {
    pk = pk || {};
    return {
      name: Hob.stem(name || Hob.FALLBACK),
      db: pk.db || emptyDb(),
      pics: pk.pics && typeof pk.pics === 'object' && !Array.isArray(pk.pics) ? pk.pics : {},
      schema: pk.schema,
      exported: pk.exported,
      version: pk.version || Hob.VERSION
    };
  }

  Hob.stem = function stem(name) {
    var s = nameOf(name).replace(/\.(hob|hbase)$/i, '');
    if (root && root.OfficeNative && root.OfficeNative.stem) return root.OfficeNative.stem(s, Hob.EXT, Hob.FALLBACK);
    s = s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) s = Hob.FALLBACK;
    if (s.length > 180) s = s.slice(0, 180).trim();
    return s;
  };
  Hob.fileName = function fileName(name) { return Hob.stem(name) + '.' + Hob.EXT; };
  Hob.acceptsName = function acceptsName(name) {
    return /\.(hob|hbase)$/i.test(nameOf(name));
  };
  Hob.isHob = function isHob(f) { return Hob.acceptsName(f); };

  /* First .hob / .hbase in a FileList, array, or DataTransfer-like { files }. */
  Hob.dropFile = function dropFile(list) {
    var files = !list ? [] : (list.files || list);
    var i, f;
    if (!files || typeof files.length !== 'number') return null;
    for (i = 0; i < files.length; i++) {
      f = files[i];
      if (Hob.acceptsName(f)) return f;
    }
    return null;
  };

  /* Hub Files hash: #drive=local&path=Documents&file=Contacts.hob (FsRef.parse shape). */
  Hob.parseHash = function parseHash(hash) {
    var raw = String(hash || '').replace(/^#/, '');
    if (!raw) return null;
    var q, drive, name, path;
    if (typeof URLSearchParams === 'function') {
      q = new URLSearchParams(raw);
      drive = q.get('drive') || '';
      name = q.get('file') || '';
      path = q.get('path') || '';
    } else {
      var got = {};
      raw.split('&').forEach(function (part) {
        var i = part.indexOf('='), k, v;
        if (i < 0) return;
        k = decodeURIComponent(part.slice(0, i).replace(/\+/g, ' '));
        v = decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' '));
        got[k] = v;
      });
      drive = got.drive || '';
      name = got.file || '';
      path = got.path || '';
    }
    if (!drive || !name || !Hob.acceptsName(name)) return null;
    return { drive: drive, path: path, name: name };
  };

  /* On-disk object. When BaseFiles is loaded, pack/parse are the real v1 helpers. */
  Hob.pack = function pack(doc) {
    doc = doc || {};
    if (root && root.BaseFiles && typeof root.BaseFiles.pack === 'function') {
      return root.BaseFiles.pack(doc.db, doc.pics);
    }
    var db = doc.db && typeof doc.db === 'object' ? copy(doc.db) : emptyDb();
    return {
      magic: Hob.MAGIC,
      version: Hob.VERSION,
      schema: db.schema || 8,
      exported: new Date().toISOString(),
      db: db,
      pics: doc.pics && typeof doc.pics === 'object' && !Array.isArray(doc.pics) ? doc.pics : {}
    };
  };
  Hob.stringify = function stringify(doc) {
    return JSON.stringify(Hob.pack(doc), null, 2);
  };

  /* Logical database for OfficeNative (db, pics, name). Throws with userMessage. */
  Hob.parse = function parse(text) {
    if (root && root.BaseFiles && typeof root.BaseFiles.parse === 'function') {
      var r = root.BaseFiles.parse(text);
      if (!r.ok) fail(r.error || 'That is not a Base backup.');
      return logical(r.pack);
    }
    if (typeof text !== 'string') fail('This is not a .hob file.');
    if (text.length > Hob.MAX) fail('This .hob file is too large.');
    var data;
    try { data = JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch (e) { fail('That file is not valid JSON.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('That is not a Base backup.');
    if (data.magic !== Hob.MAGIC) fail('That file is not a .hob backup (missing “hbase” marker).');
    if (!data.db || typeof data.db !== 'object' || !Array.isArray(data.db.tables)) fail('That backup has no tables list.');
    var pics = data.pics && typeof data.pics === 'object' && !Array.isArray(data.pics) ? data.pics : {};
    return logical({
      magic: Hob.MAGIC,
      version: data.version || 1,
      schema: data.schema,
      exported: data.exported,
      db: data.db,
      pics: pics
    });
  };

  function hobDest(dest) {
    if (!dest || !dest.name || !/\.hbase$/i.test(dest.name)) return dest;
    var next = { kind: dest.kind, name: Hob.fileName(dest.name) };
    if (dest.drive) next.drive = dest.drive;
    if (dest.path != null) next.path = dest.path;
    if (dest.handle) next.handle = dest.handle;
    return next;
  }

  /* Override isFile / openFromHash so a legacy .hbase hash or File is accepted.
     OfficeNative itself only matches the primary ext (.hob). Opening a file
     uses the existing Restore dialog (replace / add as a copy / cancel). */
  function acceptLegacy(session, hooks) {
    hooks = hooks || {};
    var pendingPics = null;

    function toast(msg) {
      if (hooks.toast) hooks.toast(msg);
      else if (root && typeof root.OfficeNotify !== 'undefined' && root.OfficeNotify.show) root.OfficeNotify.show(msg, 3500);
    }
    function flushStore() {
      if (root && root.BaseStore && typeof root.BaseStore.saveNow === 'function') root.BaseStore.saveNow();
    }
    function exportPics(cb) {
      if (root && root.BasePics && typeof root.BasePics.exportAll === 'function') {
        root.BasePics.exportAll(function (pics) { cb(pics || {}); });
      } else cb({});
    }
    function withPics(fn) {
      return new Promise(function (resolve, reject) {
        exportPics(function (pics) {
          var token = { pics: pics || {} };
          pendingPics = token;
          Promise.resolve(fn()).then(function (res) {
            if (pendingPics === token) pendingPics = null;
            resolve(res);
          }, function (err) {
            if (pendingPics === token) pendingPics = null;
            reject(err);
          });
        });
      });
    }
    session.picsOf = function () { return (pendingPics && pendingPics.pics) || {}; };
    session.saveWithPics = function saveWithPics(opts) {
      flushStore();
      return withPics(function () { return session.save(opts || {}); });
    };
    session.autosaveWithPics = function autosaveWithPics() {
      if (!session.dest) return Promise.resolve({ ok: true, wrote: false });
      flushStore();
      return withPics(function () { return session.autosave(); });
    };

    session.isFile = function (f) { return Hob.acceptsName(f); };
    session.openFile = function openFile(file, dest, opts) {
      opts = opts || {};
      if (!file) return Promise.resolve(false);
      if (file.size > session.MAX) { toast('This .hob file is too large.'); return Promise.resolve(false); }
      function readAndRestore() {
        return file.text().then(function (text) {
          var doc = Hob.parse(text);
          return new Promise(function (resolve) {
            if (!root || !root.BaseFiles || typeof root.BaseFiles.restoreDialog !== 'function') {
              toast('Could not restore that backup.');
              resolve(false);
              return;
            }
            var pk = {
              magic: Hob.MAGIC,
              version: doc.version || 1,
              schema: doc.schema,
              exported: doc.exported,
              db: doc.db,
              pics: doc.pics || {}
            };
            root.BaseFiles.restoreDialog(pk, {
              done: function (how) {
                if (how === 'replace') {
                  var bound = hobDest(dest);
                  session.dest = bound || null;
                  session.holdClash = '';
                  var stem = Hob.stem((bound && bound.name) || file.name || Hob.FALLBACK);
                  if (session.noteStem) session.noteStem(stem);
                  resolve(true);
                  return;
                }
                resolve(how === 'copy');
              }
            });
          });
        }).catch(function (e) {
          toast(e && (e.userMessage || e.message) ? (e.userMessage || e.message) : 'Could not open file');
          return false;
        });
      }
      var prior = (session.dest && !opts.skipSave) ? session.saveWithPics({}) : Promise.resolve();
      return prior.catch(function () {}).then(readAndRestore);
    };
    function parseAnyHash(hash) {
      var ref = null;
      if (typeof window !== 'undefined' && window.FsRef && typeof window.FsRef.parse === 'function') {
        ref = window.FsRef.parse(hash || (window.location && window.location.hash) || '');
      }
      if (!ref) {
        /* Reuse parseHash's field reading, but don't require .hob. */
        var raw = String(hash || '').replace(/^#/, ''), drive = '', name = '', path = '', q, got;
        if (!raw) return null;
        if (typeof URLSearchParams === 'function') {
          q = new URLSearchParams(raw);
          drive = q.get('drive') || '';
          name = q.get('file') || '';
          path = q.get('path') || '';
        } else {
          got = {};
          raw.split('&').forEach(function (part) {
            var i = part.indexOf('='), k, v;
            if (i < 0) return;
            k = decodeURIComponent(part.slice(0, i).replace(/\+/g, ' '));
            v = decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' '));
            got[k] = v;
          });
          drive = got.drive || '';
          name = got.file || '';
          path = got.path || '';
        }
        if (!drive || !name) return null;
        ref = { drive: drive, path: path, name: name };
      }
      return ref;
    }
    function openOdbFromHash(ref) {
      var key = (window.FsRef && window.FsRef.hash) ? window.FsRef.hash(ref) : (ref.drive + '|' + (ref.path || '') + '|' + ref.name);
      if (key === session.lastHash) return Promise.resolve(false);
      session.lastHash = key;
      if (!window.FsRef || typeof window.FsRef.resolve !== 'function') {
        session.lastHash = '';
        return Promise.resolve(false);
      }
      return window.FsRef.resolve(ref).then(function (got) {
        var handle = got && (got.file || got.handle || got);
        if (!handle || typeof handle.getFile !== 'function') return false;
        return handle.getFile().then(function (file) {
          if (root && root.BaseFiles && typeof root.BaseFiles.open === 'function') root.BaseFiles.open(file);
          return true;
        });
      }).then(function (ok) {
        if (!ok) session.lastHash = '';
        return !!ok;
      }).catch(function (e) {
        session.lastHash = '';
        toast((e && (e.userMessage || e.message)) || 'Could not open that .odb file.');
        return false;
      });
    }
    /* (before BS11) session.openFromHash only accepted .hob / .hbase */
    session.openFromHash = function openFromHash() {
      if (typeof window === 'undefined' || !window.location) return Promise.resolve(false);
      var ref = parseAnyHash(window.location.hash);
      if (ref && ref.name && /\.odb$/i.test(ref.name)) return openOdbFromHash(ref);
      ref = Hob.parseHash(window.location.hash);
      if (!ref) return Promise.resolve(false);
      if (window.FsRef && typeof window.FsRef.parse === 'function') {
        var parsed = window.FsRef.parse(window.location.hash);
        if (parsed) ref = parsed;
        if (!ref || !Hob.acceptsName(ref.name)) return Promise.resolve(false);
      }
      var key = (window.FsRef && window.FsRef.hash) ? window.FsRef.hash(ref) : (ref.drive + '|' + (ref.path || '') + '|' + ref.name);
      if (key === session.lastHash) return Promise.resolve(false);
      session.lastHash = key;
      if (!window.FsRef || typeof session.openRef !== 'function') {
        session.lastHash = '';
        return Promise.resolve(false);
      }
      return session.openRef(ref).then(function (ok) {
        if (!ok) session.lastHash = '';
        return !!ok;
      });
    };
    session.bindDrop = function bindDrop() {
      if (typeof document === 'undefined' || session._dropBound) return;
      session._dropBound = true;
      function odbOf(list) {
        if (root && root.BaseOdb && typeof root.BaseOdb.dropFile === 'function') return root.BaseOdb.dropFile(list);
        var files = !list ? [] : (list.files || list), i, f;
        if (!files || typeof files.length !== 'number') return null;
        for (i = 0; i < files.length; i++) {
          f = files[i];
          if (f && /\.odb$/i.test(f.name || '')) return f;
        }
        return null;
      }
      function fromEvent(e) {
        var dt = e && e.dataTransfer;
        if (!dt) return null;
        var hit = Hob.dropFile(dt.files);
        if (hit) return hit;
        hit = odbOf(dt.files);
        if (hit) return hit;
        var items = dt.items, i, it, f, ent;
        if (!items || !items.length) return null;
        for (i = 0; i < items.length; i++) {
          it = items[i];
          if (!it || it.kind !== 'file') continue;
          try { f = it.getAsFile && it.getAsFile(); } catch (err) { f = null; }
          if (f && Hob.acceptsName(f)) return f;
          if (f && /\.odb$/i.test(f.name || '')) return f;
          try { ent = it.webkitGetAsEntry && it.webkitGetAsEntry(); } catch (err2) { ent = null; }
          if (ent && ent.name && Hob.acceptsName(ent)) return { name: ent.name, _entry: ent };
          if (ent && ent.name && /\.odb$/i.test(ent.name)) return { name: ent.name, _entry: ent, _odb: true };
        }
        return null;
      }
      document.addEventListener('dragover', function (e) {
        if (fromEvent(e) || odbOf(e.dataTransfer && e.dataTransfer.files)) {
          e.preventDefault();
          try { e.dataTransfer.dropEffect = 'copy'; } catch (err) {}
        }
      });
      /* (before BS11) drop only restored .hob / .hbase */
      document.addEventListener('drop', function (e) {
        var f = fromEvent(e);
        if (!f || f._entry) {
          if (f && f._entry) return;
          f = Hob.dropFile(e.dataTransfer && e.dataTransfer.files) || odbOf(e.dataTransfer && e.dataTransfer.files);
        }
        if (!f) return;
        e.preventDefault();
        e.stopPropagation();
        if (/\.odb$/i.test(f.name || '') || f._odb) {
          if (root && root.BaseFiles && typeof root.BaseFiles.open === 'function') root.BaseFiles.open(f);
          return;
        }
        if (root && root.BaseFiles && typeof root.BaseFiles.restoreFile === 'function') root.BaseFiles.restoreFile(f);
      });
    };
    return session;
  }

  Hob.install = function install(hooks) {
    hooks = hooks || {};
    if (!root || !root.OfficeNative) return null;
    var stemName = Hob.FALLBACK;
    var session = root.OfficeNative.create({
      ext: Hob.EXT,
      label: 'Hub Office Base',
      fallback: Hob.FALLBACK,
      max: Hob.MAX,
      capture: function (s) {
        var doc = hooks.capture ? hooks.capture(s) : null;
        if (!doc || typeof doc !== 'object') {
          doc = {
            db: (root && root.BASE && root.BASE.db) ? root.BASE.db : emptyDb(),
            pics: session.picsOf ? session.picsOf() : {}
          };
        }
        if (!doc.name) doc.name = stemName;
        if (!doc.pics) doc.pics = session.picsOf ? session.picsOf() : {};
        return doc;
      },
      pack: Hob.pack,
      parse: Hob.parse,
      apply: function (doc) { if (hooks.apply) hooks.apply(doc); },
      toast: function (msg) { if (hooks.toast) hooks.toast(msg); },
      currentName: function () {
        if (hooks.currentName) return hooks.currentName() || stemName;
        return stemName;
      },
      setName: function (name) {
        stemName = Hob.stem(name);
        if (hooks.setName) hooks.setName(stemName);
      },
      noteSaved: function (res) { if (hooks.noteSaved) hooks.noteSaved(res); },
      noteFailed: function (err) { if (hooks.noteFailed) hooks.noteFailed(err); },
      clash: function (name, free) { return root.OfficeNative.clashDialog(name, free); },
      promptName: function (cur) {
        if (hooks.promptName) return hooks.promptName(cur);
        if (root && root.OfficeDialog && typeof root.OfficeDialog.prompt === 'function') {
          return root.OfficeDialog.prompt({ title: 'Save as', label: 'Name', value: cur || stemName, okLabel: 'Save' });
        }
        return Promise.resolve(cur);
      },
      isBlank: function (doc) {
        var db = doc && doc.db;
        return !db || !Array.isArray(db.tables) || db.tables.length === 0;
      }
    });
    acceptLegacy(session, hooks);
    session.stemName = function () { return stemName; };
    session.noteStem = function (name) { stemName = Hob.stem(name); };
    session.hobFileName = Hob.fileName;
    session.acceptsName = Hob.acceptsName;
    session.parseHash = Hob.parseHash;
    session.dropFile = Hob.dropFile;
    if (typeof document !== 'undefined') session.bindDrop();
    root.BaseHob = session;
    return session;
  };

  if (typeof module === 'object' && module.exports) module.exports = Hob;
  if (root) root.BaseHop = Hob;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
