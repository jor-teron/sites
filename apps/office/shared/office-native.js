/* ============================================================
   FILE: apps/office/shared/office-native.js
   ROLE: Hub Office native-file helper (HOS1). The same Documents
         path HOW1 uses in apps/office/draftly/modules/draftly-how.js:
         save and autosave on the Hub Local drive, folder Documents
         (created if missing); outside the Hub, the save picker or a
         download; open from a File, a drive ref, or the page hash.
         Writer keeps its own copy of this path so HOW1 stays as it
         shipped. Spreadsheet (spreadsheet_hos.js) uses this helper.
         No new libraries. In-app dialogs only.
   ============================================================ */
(function (root) {
  'use strict';

  var OfficeNative = {};
  OfficeNative.DOCUMENTS = 'Documents';

  function fail(msg) {
    var e = new Error(msg);
    e.userMessage = msg;
    throw e;
  }

  /* File stem: strip one extension, drop characters a file name cannot use. */
  OfficeNative.stem = function stem(name, ext, fallback) {
    var re = new RegExp('\\.' + String(ext || 'dat').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i');
    var s = String(name || '').replace(re, '');
    s = s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) s = fallback || 'Document';
    if (s.length > 180) s = s.slice(0, 180).trim();
    return s;
  };

  OfficeNative.inHub = function inHub() {
    if (typeof window === 'undefined') return false;
    try {
      if (typeof document !== 'undefined' && document.body && document.body.classList.contains('in-hub')) return true;
      return !!(window.parent && window.parent !== window);
    } catch (e) { return true; }
  };
  OfficeNative.canLocal = function canLocal() {
    return typeof window !== 'undefined' && !!(window.FsDrives && window.FsDrives.hasLocal);
  };

  function dirFor(dest, create) {
    var drives = window.FsDrives;
    return drives.handle(dest.drive).then(function (dir) {
      if (!dir) fail('The Hub drive is not available.');
      var parts = String(dest.path || '').split('/').filter(Boolean);
      var i = 0;
      function next() {
        if (i >= parts.length) return dir;
        var part = parts[i++];
        var opts = (create && i === parts.length) ? { create: true } : null;
        var got = opts ? dir.getDirectoryHandle(part, opts) : dir.getDirectoryHandle(part);
        return got.then(function (child) { dir = child; return next(); });
      }
      return next();
    });
  }
  function exists(dir, name) {
    if (window.FsOps && window.FsOps.exists) return window.FsOps.exists(dir, name);
    return dir.getFileHandle(name).then(function () { return true; }, function () { return false; });
  }
  function writeBlob(dir, name, blob) {
    if (window.FsOps && window.FsOps.writeFile) return window.FsOps.writeFile(dir, name, blob);
    return dir.getFileHandle(name, { create: true }).then(function (fh) {
      return fh.createWritable().then(function (w) {
        return w.write(blob).then(function () { return w.close(); }, function (e) {
          return w.abort().then(function () { throw e; }, function () { throw e; });
        });
      });
    });
  }
  function writeHandle(handle, text) {
    return handle.createWritable().then(function (w) {
      return w.write(new Blob([text], { type: 'application/json' })).then(function () { return w.close(); }, function (e) {
        return w.abort().then(function () { throw e; }, function () { throw e; });
      });
    });
  }
  function download(text, name) {
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  /* Three-button name clash. Resolves 'replace' | 'use' | null. In-app only. */
  OfficeNative.clashDialog = function clashDialog(name, free) {
    return new Promise(function (resolve) {
      if (typeof document === 'undefined') { resolve('use'); return; }
      function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
      }
      var host = el('dialog', 'dlg-modal');
      var box = el('div', 'dlg');
      box.setAttribute('role', 'alertdialog');
      box.setAttribute('aria-modal', 'true');
      var t = el('div', 'dlg-title', 'Name already used');
      t.id = 'dlgTitle';
      box.setAttribute('aria-labelledby', 'dlgTitle');
      var m = el('div', 'dlg-message', 'A file named "' + name + '" already exists.');
      m.id = 'dlgMsg';
      box.setAttribute('aria-describedby', 'dlgMsg');
      var row = el('div', 'dlg-actions');
      var bc = el('button', 'dlg-btn dlg-cancel', 'Cancel');
      var br = el('button', 'dlg-btn dlg-cancel dlg-danger', 'Replace');
      var bu = el('button', 'dlg-btn dlg-ok', 'Use "' + free + '"');
      var btns = [bc, br, bu];
      btns.forEach(function (b) { b.type = 'button'; row.appendChild(b); });
      box.appendChild(t);
      box.appendChild(m);
      box.appendChild(row);
      host.appendChild(box);
      document.body.appendChild(host);
      var done = false;
      function close(v) {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey, true);
        if (host.close) { try { host.close(); } catch (e) {} }
        host.remove();
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
        else if (e.key === 'Tab') {
          e.preventDefault();
          var i = btns.indexOf(document.activeElement);
          btns[(i + (e.shiftKey ? -1 : 1) + 3) % 3].focus();
        }
      }
      document.addEventListener('keydown', onKey, true);
      bc.onclick = function () { close(null); };
      br.onclick = function () { close('replace'); };
      bu.onclick = function () { close('use'); };
      host.addEventListener('cancel', function (e) { e.preventDefault(); close(null); });
      host.addEventListener('mousedown', function (e) { if (e.target === host) close(null); });
      if (typeof host.showModal === 'function') {
        try { host.showModal(); } catch (e) { host.setAttribute('open', ''); }
      } else host.setAttribute('open', '');
      bu.focus();
    });
  };

  /**
   * One native file session.
   * spec: { ext, label, fallback, max, capture(session), pack(doc), parse(text),
   *         apply(doc), toast(msg), currentName(), setName(name), noteSaved(res),
   *         noteFailed(err), clash(name, free), promptName(current), isBlank(doc) }
   * capture() returns the logical document (pack normalises it).
   */
  OfficeNative.create = function create(spec) {
    spec = spec || {};
    var N = {};
    var ext = String(spec.ext || 'dat').replace(/^\./, '');
    var fallback = spec.fallback || 'Document';
    N.ext = ext;
    N.MAX = spec.max || (48 * 1024 * 1024);
    N.DOCUMENTS = OfficeNative.DOCUMENTS;
    N.dest = null;
    N.created = 0;
    N.lastHash = '';
    N.holdClash = '';
    N.clashOpen = false;
    N.skipWrite = false;
    N.applying = false;
    var tail = Promise.resolve();

    function enqueue(fn) {
      var run = tail.then(fn, fn);
      tail = run.then(function () {}, function () {});
      return run;
    }
    N.stem = function (name) { return OfficeNative.stem(name, ext, fallback); };
    N.fileName = function (name) { return N.stem(name) + '.' + ext; };
    N.isFile = function (f) {
      return !!f && new RegExp('\\.' + ext + '$', 'i').test(f.name || '');
    };
    N.inHub = OfficeNative.inHub;
    N.canLocal = OfficeNative.canLocal;
    N.detach = function () {
      N.dest = null;
      N.created = 0;
      N.holdClash = '';
    };

    function toast(msg) { if (spec.toast) spec.toast(msg); }
    function textOf(doc) { return JSON.stringify(spec.pack(doc), null, 2); }
    function remembered() {
      if (N.dest && N.dest.kind === 'hub') return N.stem(N.dest.name);
      return spec.currentName ? spec.currentName() : '';
    }
    function finish(dest, packed, verb) {
      var stem = N.stem(dest && dest.name ? dest.name : packed.name);
      return { ok: true, wrote: true, name: stem, verb: verb || 'Saved', dest: dest || null, created: packed.created };
    }
    function put(dir, dest, snap, old) {
      var packed = spec.pack(copyName(snap, N.stem(dest.name)));
      var blob = new Blob([JSON.stringify(packed, null, 2)], { type: 'application/json' });
      return writeBlob(dir, dest.name, blob).then(function () {
        var renaming = old && old.kind === 'hub' && old.drive === dest.drive &&
          String(old.path || '') === String(dest.path || '') && old.name !== dest.name;
        if (!renaming) return finish(dest, packed, 'Saved');
        return dir.removeEntry(old.name).then(function () { return finish(dest, packed, 'Saved'); }, function () {
          return finish(dest, packed, 'Saved');
        });
      });
    }
    function copyName(snap, name) {
      var doc = {};
      var k;
      for (k in snap) if (Object.prototype.hasOwnProperty.call(snap, k)) doc[k] = snap[k];
      doc.name = name;
      doc.updated = Date.now();
      if (!doc.created) doc.created = doc.updated;
      return doc;
    }
    function clash(dir, dest, snap, old) {
      var stem = N.stem(dest.name);
      var prev = remembered();
      if (N.holdClash === dest.name || N.clashOpen) return Promise.resolve({ ok: true, wrote: false, name: prev || stem });
      var freeP = (window.FsOps && window.FsOps.uniqueName) ? window.FsOps.uniqueName(dir, dest.name) : Promise.resolve(N.fileName(stem + ' (2)'));
      return freeP.then(function (free) {
        if (!spec.clash) {
          return put(dir, { kind: dest.kind, drive: dest.drive, path: dest.path, name: free }, snap, null);
        }
        N.clashOpen = true;
        return spec.clash(stem, N.stem(free)).then(function (pick) {
          N.clashOpen = false;
          if (pick === 'replace') return put(dir, dest, snap, old);
          if (pick === 'use') return put(dir, { kind: dest.kind, drive: dest.drive, path: dest.path, name: free }, snap, null);
          N.holdClash = dest.name;
          if (prev && spec.setName) spec.setName(prev);
          return { ok: true, wrote: false, cancelled: true, name: prev || stem };
        }, function (e) { N.clashOpen = false; throw e; });
      });
    }
    function writeHub(snap, opts) {
      var fname = N.fileName(snap.name);
      var dest;
      var old = N.dest && N.dest.kind === 'hub' ? N.dest : null;
      if (opts.saveAs || !old) dest = { kind: 'hub', drive: 'local', path: N.DOCUMENTS, name: fname };
      else dest = { kind: 'hub', drive: old.drive, path: old.path || '', name: N.stem(old.name) === N.stem(snap.name) ? old.name : fname };
      if (N.holdClash && N.holdClash !== dest.name) N.holdClash = '';
      var create = String(dest.path || '') === N.DOCUMENTS;
      return dirFor(dest, create).then(function (dir) {
        return exists(dir, dest.name).then(function (there) {
          var same = !!(old && !opts.saveAs && old.drive === dest.drive && String(old.path || '') === String(dest.path || '') && old.name === dest.name);
          if (there && !same) {
            if (opts.unique && window.FsOps && window.FsOps.uniqueName) {
              return window.FsOps.uniqueName(dir, dest.name).then(function (free) {
                return put(dir, { kind: 'hub', drive: dest.drive, path: dest.path, name: free }, snap, null);
              });
            }
            return clash(dir, dest, snap, opts.saveAs ? null : old);
          }
          return put(dir, dest, snap, opts.saveAs ? null : old);
        });
      });
    }
    function writeStandalone(snap, opts) {
      var text = textOf(snap);
      if (!opts.saveAs && N.dest && N.dest.kind === 'handle' && N.dest.handle) {
        return writeHandle(N.dest.handle, text).then(function () { return finish(N.dest, spec.pack(snap), 'Saved'); });
      }
      if (!opts.explicit && !opts.saveAs) return Promise.resolve({ ok: true, wrote: false, name: snap.name });
      if (typeof window.showSaveFilePicker === 'function') {
        var accept = {};
        accept['application/json'] = ['.' + ext];
        return window.showSaveFilePicker({
          suggestedName: N.fileName(snap.name),
          types: [{ description: spec.label || 'Hub Office', accept: accept }]
        }).then(function (handle) {
          var fname = handle.name || N.fileName(snap.name);
          var named = spec.pack(copyName(snap, N.stem(fname)));
          var dest = { kind: 'handle', handle: handle, name: fname };
          return writeHandle(handle, JSON.stringify(named, null, 2)).then(function () { return finish(dest, named, 'Saved'); });
        });
      }
      download(text, N.fileName(snap.name));
      return Promise.resolve(finish(null, spec.pack(snap), 'Downloaded'));
    }
    function askName(opts) {
      if (!opts.saveAs) return Promise.resolve();
      if (!N.inHub() && typeof window.showSaveFilePicker === 'function') return Promise.resolve();
      if (!spec.promptName) return Promise.resolve();
      var cur = spec.currentName ? spec.currentName() : '';
      return spec.promptName(cur).then(function (v) {
        if (v === null || v === undefined) { var e = new Error('cancel'); e.name = 'AbortError'; throw e; }
        if (spec.setName) spec.setName(N.stem(v));
      });
    }
    function blankSkip(snap, opts) {
      if (opts.saveAs) return false;
      if (!spec.isBlank) return false;
      return spec.isBlank(snap) && !N.dest;
    }
    function saveNow(opts) {
      opts = opts || {};
      if ((N.skipWrite || N.applying) && !opts.explicit && !opts.saveAs) {
        return Promise.resolve({ ok: true, wrote: false, name: remembered() });
      }
      return askName(opts).then(function () {
        var snap = spec.capture(N);
        if (blankSkip(snap, opts)) return { ok: true, wrote: false, name: snap.name };
        var hub = N.inHub() && N.canLocal();
        if (!hub && !opts.explicit && !opts.saveAs && !(N.dest && N.dest.kind === 'handle')) {
          return { ok: true, wrote: false, name: snap.name };
        }
        var op = hub ? writeHub(snap, opts) : writeStandalone(snap, opts);
        return Promise.resolve(op).then(function (res) { return res || { ok: true, wrote: false, name: snap.name }; });
      }).then(function (res) {
        if (res && res.wrote) {
          if (spec.setName) spec.setName(res.name);
          if (res.dest) N.dest = res.dest;
          else if (!N.inHub()) N.dest = null;
          if (res.created) N.created = res.created;
          N.holdClash = '';
          if (spec.noteSaved) spec.noteSaved(res);
        }
        return res || { ok: true, wrote: false };
      });
    }

    /* explicit: Save / Save As. unique: a free Documents name, no question.
       Autosave writes a Hub file (and creates Documents/<name>.ext on the first save)
       or continues into a file already picked. It does not download on each edit. */
    N.save = function save(opts) {
      var p = enqueue(function () {
        return saveNow(opts).catch(function (e) {
          if (e && (e.name === 'AbortError' || e.code === 20)) return { ok: true, cancelled: true, wrote: false };
          if (spec.noteFailed) spec.noteFailed(e);
          throw e;
        });
      });
      p.catch(function () {});
      return p;
    };
    N.autosave = function autosave(opts) { return N.save(opts || {}); };

    N.openFile = function openFile(file, dest, opts) {
      opts = opts || {};
      if (!file) return Promise.resolve(false);
      if (file.size > N.MAX) { toast('This .' + ext + ' file is too large.'); return Promise.resolve(false); }
      if (!opts.quiet) toast('Opening ' + (file.name || 'file') + '\u2026');
      return file.text().then(function (text) {
        var doc = spec.parse(text);
        return enqueue(function () {
          return saveNow({}).catch(function () {}).then(function () {
            N.applying = true;
            try { spec.apply(doc); }
            finally { N.applying = false; }
            N.dest = dest || null;
            N.holdClash = '';
            if (doc.created) N.created = doc.created;
            if (spec.setName) spec.setName(doc.name);
            if (!opts.quiet) toast('Opened ' + doc.name);
            return true;
          });
        });
      }).catch(function (e) {
        toast(e && (e.userMessage || e.message) ? (e.userMessage || e.message) : 'Could not open file');
        return false;
      });
    };
    N.openRef = function openRef(ref, opts) {
      if (!window.FsRef) return Promise.resolve(false);
      return window.FsRef.resolve(ref).then(function (got) {
        return got.file.getFile().then(function (file) {
          return N.openFile(file, { kind: 'hub', drive: ref.drive, path: ref.path || '', name: ref.name }, opts);
        });
      }).catch(function (e) {
        toast(e && (e.userMessage || e.message) ? (e.userMessage || e.message) : 'Could not open file');
        return false;
      });
    };
    N.openName = function openName(name, opts) {
      var file = new RegExp('\\.' + ext + '$', 'i').test(name) ? name : N.fileName(name);
      return N.openRef({ drive: 'local', path: N.DOCUMENTS, name: file }, opts);
    };
    N.openFromHash = function openFromHash() {
      if (typeof window === 'undefined' || !window.FsRef || !window.location) return Promise.resolve(false);
      var ref = window.FsRef.parse(window.location.hash);
      if (!ref || !new RegExp('\\.' + ext + '$', 'i').test(ref.name || '')) return Promise.resolve(false);
      var key = window.FsRef.hash(ref);
      if (key === N.lastHash) return Promise.resolve(false);
      N.lastHash = key;
      return N.openRef(ref).then(function (ok) {
        if (!ok) N.lastHash = '';
        return !!ok;
      });
    };
    N.list = function list() {
      if (!N.inHub() || !N.canLocal() || !window.FsOps) return Promise.resolve([]);
      return window.FsDrives.handle('local').then(function (dir) {
        if (!dir) return [];
        return dir.getDirectoryHandle(N.DOCUMENTS).then(function (docs) {
          return window.FsOps.list(docs);
        }, function () { return []; });
      }).then(function (items) {
        var re = new RegExp('\\.' + ext + '$', 'i');
        return (items || []).filter(function (e) { return e.kind === 'file' && re.test(e.name); })
          .sort(function (a, b) { return (b.modified || 0) - (a.modified || 0); });
      }).catch(function () { return []; });
    };
    N.remove = function remove(name) {
      var file = new RegExp('\\.' + ext + '$', 'i').test(name) ? name : N.fileName(name);
      var dest = (N.dest && N.dest.kind === 'hub' && (N.dest.name === file || N.stem(N.dest.name) === N.stem(file)))
        ? N.dest
        : { kind: 'hub', drive: 'local', path: N.DOCUMENTS, name: file };
      return dirFor(dest, false).then(function (dir) { return dir.removeEntry(dest.name); });
    };
    N.start = function start() {
      return N.openFromHash().then(function (opened) {
        if (opened) return true;
        if (!N.inHub() || !N.canLocal()) return false;
        return N.list().then(function (rows) {
          if (rows.length) return N.openName(rows[0].name, { quiet: true });
          return false;
        });
      }).catch(function () { return false; });
    };
    N.bind = function bind() {
      if (typeof window === 'undefined') return;
      window.addEventListener('hashchange', function () { N.openFromHash(); });
    };
    return N;
  };

  if (typeof module === 'object' && module.exports) module.exports = OfficeNative;
  if (root) root.OfficeNative = OfficeNative;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
