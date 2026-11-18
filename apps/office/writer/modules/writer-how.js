/* ============================================================
   FILE: modules/writer-how.js
   DF25: was modules/draftly-how.js (global Draftly is now Writer).
   PROJECT: Writer (Writer)
   ROLE: HOW1 native .how file. One UTF-8 JSON document:
         content and formatting (HTML, images as data URLs),
         header/footer, page setup, and metadata format "how"
         version 1. No new libraries.
         In the Hub, Save, Save As and autosave write the Local
         drive Documents folder (shared/fs, the Files app disk).
         Standalone Save uses the file-system picker when the
         browser has it, otherwise a download.
         (before HOW1) the native copy was IndexedDB via
         Draftly.storage.save. That function is kept and renamed
         saveLegacy; this file replaces Draftly.storage.save.
         DW12: Save can also write .docx or .odt (How.format), like
         LibreOffice: an opened .docx / .odt saves back to that same
         file in that format (no .how copy), and Save As picks Writer
         document (.how), Word (.docx) or OpenDocument Text (.odt).
         No warning about the format. The typing timer never writes a
         .docx / .odt; it is written on Save, and when leaving / opening
         another document only if the content changed (see saveNow).
   DEPENDS: config, storage, pages, editor, hf, breaks, ui, dialog,
            export (DW12, for .docx / .odt)
   ============================================================ */
(function (root) {
  'use strict';

  var How = {};
  How.FORMAT = 'how';
  How.VERSION = 1;
  How.DOCUMENTS = 'Documents';
  How.MAX = 48 * 1024 * 1024;
  How.dest = null;
  How.created = 0;
  How.lastHash = '';
  How.holdClash = '';
  How.clashOpen = false;
  /* Set while a deleted document is still on screen, so the flush does not write it back. */
  How.skipWrite = false;
  /* DW12: the format Save writes ('how', 'docx' or 'odt') and what was last written / opened. */
  How.format = 'how';
  How.savedSig = '';
  How.FORMATS = {
    how: { ext: '.how', mime: 'application/json', label: 'Writer document (.how)' },
    docx: { ext: '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', label: 'Word (.docx)' },
    odt: { ext: '.odt', mime: 'application/vnd.oasis.opendocument.text', label: 'OpenDocument Text (.odt)' }
  };
  How.FORMAT_ORDER = ['how', 'docx', 'odt'];
  var tail = Promise.resolve();

  function fail(msg) {
    var e = new Error(msg);
    e.userMessage = msg;
    throw e;
  }
  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function enqueue(fn) {
    var run = tail.then(fn, fn);
    tail = run.then(function () {}, function () {});
    return run;
  }

  How.stem = function stem(name) {
    /* (before DW12) var s = String(name || '').replace(/\.how$/i, ''); */
    var s = String(name || '').replace(/\.(how|docx|odt)$/i, '');
    s = s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) s = 'Document';
    if (s.length > 180) s = s.slice(0, 180).trim();
    return s;
  };
  /* HO12b: "Untitled N" for a new document: the lowest N not used by the
     .how rows (case and extension ignored); pref (the Hub Office tab's N) when free. */
  How.untitledFor = function untitledFor(rows, pref) {
    var names = (rows || []).map(function (r) { return r && typeof r === 'object' ? r.name : r; });
    var D = root && root.OfficeDocName;
    if (D && D.untitled) return D.untitled(names, pref || 0);
    var used = {};
    names.forEach(function (n) { var m = /^untitled\s+(\d+)$/i.exec(How.stem(n)); if (m) used[+m[1]] = true; });
    var k = (pref >= 1 && !used[pref]) ? pref : 1;
    if (k !== pref) while (used[k]) k++;
    return 'Untitled ' + k;
  };
  function isAuto(name) {
    var st = root && root.Writer && root.Writer.storage;
    return !!(st && st.isAutoName && st.isAutoName(name));
  }
  function setAuto(name) {
    var st = root && root.Writer && root.Writer.storage;
    if (st) st.autoName = name || '';
  }
  /* (before DW12) How.fileName = function fileName(name) {
    return How.stem(name) + '.how';
  }; */
  How.fileName = function fileName(name, fmt) {
    var f = How.FORMATS[fmt] || How.FORMATS.how;
    return How.stem(name) + f.ext;
  };
  /* DW12: 'docx' / 'odt' / 'how' from a file name's extension, '' when it is none of them. */
  How.extFormat = function extFormat(name) {
    var m = /\.(how|docx|odt)$/i.exec(String(name || ''));
    return m ? m[1].toLowerCase() : '';
  };
  /* DW12: the format Save keeps for an opened file: .docx -> docx, .odt -> odt,
     anything else (.how, .txt, no extension) -> how. */
  How.formatOf = function formatOf(name) {
    return How.extFormat(name) || 'how';
  };
  How.mimeOf = function mimeOf(fmt) {
    return (How.FORMATS[fmt] || How.FORMATS.how).mime;
  };
  /* DW12: Save As name: the stem plus the new format's extension. */
  How.targetName = function targetName(name, fmt) {
    return How.fileName(name, fmt);
  };
  /* DW12: which generator writes a format (the save router). */
  How.generatorFor = function generatorFor(fmt) {
    if (fmt === 'docx') return 'docx';
    if (fmt === 'odt') return 'odt';
    return 'how';
  };
  /* DW12: Blob of the open document as .docx or .odt, through the same code as
     File > Export DOCX / Export ODT (writer-export.js: writer-docxgen.js / writer-odtgen.js).
     X: Writer.export (a stub in tests). Resolves a Blob. */
  How.blobFor = function blobFor(fmt, X) {
    X = X || (root && root.Writer && root.Writer.export);
    var gen = How.generatorFor(fmt);
    return new Promise(function (resolve) {
      if (!X || gen === 'how') fail('This format cannot be written here.');
      if (gen === 'docx') resolve(X.withDocx(function () { return X.makeDocxBlob(X.docxHtml()); }));
      else resolve(X.makeOdtBlob(X.combinedHtml()));
    }).then(function (blob) {
      if (!blob) fail('Could not build the ' + How.FORMATS[gen].ext + ' file.');
      return blob;
    });
  };
  /* DW12: a cheap fingerprint of a capture, to skip rewriting an unchanged .docx / .odt. */
  How.sig = function sig(snap) {
    if (!snap) return '';
    return [snap.name, snap.html, JSON.stringify(snap.hf || null), JSON.stringify(snap.page || null)].join('\u0001');
  };
  How.isHow = function isHow(f) {
    return !!f && /\.how$/i.test(f.name || '');
  };

  function cm(v, d) {
    var n = Number(v);
    if (!isFinite(n)) n = d;
    if (n < 0.5) n = 0.5;
    if (n > 5) n = 5;
    return Math.round(n * 10) / 10;
  }
  How.pageOf = function pageOf(p) {
    p = p || {};
    var custom = p.custom || {};
    var size = p.size === 'Legal' ? 'Legal' : 'A4';
    var margins = (p.margins === 'narrow' || p.margins === 'custom' || p.margins === 'normal') ? p.margins : 'normal';
    return {
      size: size,
      orientation: p.orientation === 'landscape' ? 'landscape' : 'portrait',
      margins: margins,
      custom: {
        top: cm(custom.top, 0.5),
        bottom: cm(custom.bottom, 0.6),
        left: cm(custom.left, 2),
        right: cm(custom.right, 2)
      },
      numbers: {
        on: !!(p.numbers && p.numbers.on),
        pos: p.numbers && p.numbers.pos === 'right' ? 'right' : 'center'
      }
    };
  };
  function hfRow(a) {
    a = Array.isArray(a) ? a : [];
    return [0, 1, 2].map(function (i) {
      var s = a[i] == null ? '' : String(a[i]);
      return s.length > 8000 ? s.slice(0, 8000) : s;
    });
  }
  /* DW11: header / footer pictures (hf.img) are kept only when there is one,
     so files without pictures stay exactly as before. */
  function hfImg() {
    if (root && root.Writer && root.Writer.hfimg) return root.Writer.hfimg;
    try { return typeof require === 'function' ? require('./writer-hfimg.js') : null; } catch (e) { return null; }
  }
  /* DW13c: the header / footer is saved as the hf v 2 block (writer-hfimg.js):
     { v: 2, head: [lines], foot: [lines], al: { head, foot }, pic?: { head, foot } }.
     Old 3-slot headers (no v) still load: normalize migrates them. pic is
     written only when there is a picture. The file version stays 1. */
  How.hfOf = function hfOf(h) {
    var I = hfImg();
    if (I && I.normalize) {
      var b = I.normalize(h);
      if (!I.hasPic(b)) delete b.pic;
      return b;
    }
    /* (before DW11) return { head: hfRow(h && h.head), foot: hfRow(h && h.foot) }; */
    /* (before DW13c) the lines below were the whole function (3 slots + img). */
    var out = { head: hfRow(h && h.head), foot: hfRow(h && h.foot) };
    if (I && h && h.img) {
      var img = I.normPics(h.img);
      if (I.hasAny(img)) out.img = img;
    }
    return out;
  };

  /* Build the on-disk object. Extra fields on doc are not kept. */
  How.pack = function pack(doc) {
    doc = doc || {};
    var now = Date.now();
    var created = num(doc.created) || now;
    var updated = num(doc.updated) || now;
    return {
      format: How.FORMAT,
      version: How.VERSION,
      name: How.stem(doc.name || 'Document'),
      created: created,
      updated: updated,
      page: How.pageOf(doc.page),
      hf: How.hfOf(doc.hf),
      html: typeof doc.html === 'string' ? doc.html : ''
    };
  };
  How.stringify = function stringify(doc) {
    return JSON.stringify(How.pack(doc), null, 2);
  };

  /* Read a .how file. Version 1 only. Older Writer records are refused. */
  How.parse = function parse(text) {
    if (typeof text !== 'string') fail('This is not a .how file.');
    if (text.length > How.MAX) fail('This .how file is too large.');
    var data;
    try { data = JSON.parse(text); }
    catch (e) { fail('This .how file could not be read.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('This is not a .how file.');
    if (data.format !== How.FORMAT) fail('This is not a Hub Office Writer .how file.');
    if (data.version !== How.VERSION) fail('This .how file is version ' + data.version + '. Writer reads version 1.');
    if (typeof data.html !== 'string') fail('This .how file has no document.');
    return {
      format: How.FORMAT,
      version: How.VERSION,
      name: How.stem(data.name || 'Document'),
      created: num(data.created),
      updated: num(data.updated),
      page: How.pageOf(data.page),
      hf: How.hfOf(data.hf),
      html: data.html
    };
  };

  How.inHub = function inHub() {
    if (typeof window === 'undefined') return false;
    try {
      if (typeof document !== 'undefined' && document.body && document.body.classList.contains('in-hub')) return true;
      return !!(window.parent && window.parent !== window);
    } catch (e) { return true; }
  };
  How.canLocal = function canLocal() {
    return typeof window !== 'undefined' && !!(window.FsDrives && window.FsDrives.hasLocal);
  };

  function toast(msg) {
    if (root.Writer && root.Writer.ui && root.Writer.ui.showToast) root.Writer.ui.showToast(msg);
  }
  function D() { return root.Writer || {}; }

  How.capture = function capture() {
    var S = D();
    var cfg = S.config;
    var name = S.storage && S.storage.fillNameIfEmpty ? S.storage.fillNameIfEmpty() : 'Document';
    var holder = document.createElement('div');
    holder.innerHTML = S.pages && S.pages.combinedHtml ? S.pages.combinedHtml() : '';
    if (S.editor && S.editor.stripMarks) S.editor.stripMarks(holder);
    var orient = document.body.classList.contains(cfg.landscapeClass) ? 'landscape' : 'portrait';
    var numbers = (S.breaks && S.breaks.loadNumbers) ? S.breaks.loadNumbers() : { on: false, pos: 'center' };
    var now = Date.now();
    if (!How.created) How.created = now;
    return {
      name: How.stem(name),
      created: How.created,
      updated: now,
      html: holder.innerHTML,
      hf: (S.hf && S.hf.get) ? S.hf.get() : { head: ['', '', ''], foot: ['', '', ''] },
      page: {
        size: cfg.paperSize,
        orientation: orient,
        margins: cfg.marginPreset,
        custom: {
          top: cfg.marginTopCm,
          bottom: cfg.marginBottomCm,
          left: cfg.marginLeftCm,
          right: cfg.marginRightCm
        },
        numbers: { on: !!numbers.on, pos: numbers.pos === 'right' ? 'right' : 'center' }
      }
    };
  };

  How.apply = function apply(doc) {
    var S = D();
    if (S.ui && S.ui.setPage) S.ui.setPage(doc.page.size, doc.page.margins, doc.page.custom);
    if (S.ui && S.ui.setOrientation) S.ui.setOrientation(doc.page.orientation);
    if (S.breaks && S.breaks.setNumbers) S.breaks.setNumbers(doc.page.numbers.on, doc.page.numbers.pos);
    if (S.pages && S.pages.rebuildSinglePage) S.pages.rebuildSinglePage();
    var editor = S.pages && S.pages.firstEditor ? S.pages.firstEditor() : null;
    if (editor) {
      editor.innerHTML = doc.html || '<p><br></p>';
      if (S.editor && S.editor.stripMarks) S.editor.stripMarks(editor);
    }
    How.created = doc.created || Date.now();
    setAuto(''); /* HO12b: an opened document keeps its own name */
    if (S.storage) {
      S.storage.loadedName = doc.name;
      if (S.storage.setCurrentName) S.storage.setCurrentName(doc.name, false);
    }
    if (S.hf && S.hf.set) S.hf.set(doc.hf);
    if (S.pages && S.pages.layoutAll) S.pages.layoutAll();
    if (S.history && S.history.reset) S.history.reset();
    if (editor) { editor.focus(); if (S.editor) S.editor.activeEditor = editor; }
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
  function remembered() {
    if (How.dest && How.dest.kind === 'hub') return How.stem(How.dest.name);
    var S = D();
    return (S.storage && S.storage.loadedName) || '';
  }
  function finish(dest, snap, verb) {
    var stem = How.stem(dest && dest.name ? dest.name : snap.name);
    /* (before DW12) return { ok: true, wrote: true, name: stem, verb: verb || 'Saved', dest: dest || null, created: snap.created }; */
    return { ok: true, wrote: true, name: stem, verb: verb || 'Saved', dest: dest || null, created: snap.created, fmt: snap.fmt || 'how' };
  }
  /* DW12: write a .docx / .odt Blob to a Hub folder; a rename of the open file removes the old name. */
  function putBlob(dir, dest, snap, old) {
    return How.blobFor(snap.fmt).then(function (blob) {
      return writeBlob(dir, dest.name, blob);
    }).then(function () {
      var renaming = old && old.kind === 'hub' && old.drive === dest.drive &&
        String(old.path || '') === String(dest.path || '') && old.name !== dest.name;
      var done = function () { return finish(dest, snap, 'Saved'); };
      if (!renaming) return done();
      return dir.removeEntry(old.name).then(done, done);
    });
  }
  function put(dir, dest, snap, old) {
    if (snap.fmt && snap.fmt !== 'how') return putBlob(dir, dest, snap, old);   /* DW12 */
    var stem = How.stem(dest.name);
    var body = How.pack({
      name: stem,
      created: snap.created,
      updated: Date.now(),
      html: snap.html,
      hf: snap.hf,
      page: snap.page
    });
    var blob = new Blob([How.stringify(body)], { type: 'application/json' });
    return writeBlob(dir, dest.name, blob).then(function () {
      var renaming = old && old.kind === 'hub' && old.drive === dest.drive &&
        String(old.path || '') === String(dest.path || '') && old.name !== dest.name;
      if (!renaming) return finish(dest, body, 'Saved');
      return dir.removeEntry(old.name).then(function () { return finish(dest, body, 'Saved'); }, function () {
        return finish(dest, body, 'Saved');
      });
    });
  }
  function clash(dir, dest, snap, old) {
    var stem = How.stem(dest.name);
    var prev = remembered();
    if (How.holdClash === dest.name || How.clashOpen) return Promise.resolve({ ok: true, wrote: false, name: prev || stem });
    var freeP = (window.FsOps && window.FsOps.uniqueName) ? window.FsOps.uniqueName(dir, dest.name) : Promise.resolve(How.fileName(stem + ' (2)', snap.fmt));   /* (before DW12) How.fileName(stem + ' (2)') */
    return freeP.then(function (free) {
      var S = D();
      if (!S.storage || !S.storage.clashDialog) {
        return put(dir, { kind: dest.kind, drive: dest.drive, path: dest.path, name: free }, snap, null);
      }
      How.clashOpen = true;
      return S.storage.clashDialog(stem, How.stem(free)).then(function (pick) {
        How.clashOpen = false;
        if (pick === 'replace') return put(dir, dest, snap, old);
        if (pick === 'use') return put(dir, { kind: dest.kind, drive: dest.drive, path: dest.path, name: free }, snap, old);
        How.holdClash = dest.name;
        if (prev && S.storage.setCurrentName) S.storage.setCurrentName(prev, false);
        return { ok: true, wrote: false, cancelled: true, name: prev || stem };
      }, function (e) { How.clashOpen = false; throw e; });
    });
  }
  function writeHub(snap, opts) {
    /* (before DW12) var fname = How.fileName(snap.name); */
    var fname = How.fileName(snap.name, snap.fmt);
    var dest;
    var old = How.dest && How.dest.kind === 'hub' ? How.dest : null;
    if (opts.saveAs || !old) dest = { kind: 'hub', drive: 'local', path: How.DOCUMENTS, name: fname };
    /* (before DW12) else dest = { kind: 'hub', drive: old.drive, path: old.path || '', name: How.stem(old.name) === snap.name ? old.name : fname }; */
    else dest = { kind: 'hub', drive: old.drive, path: old.path || '', name: (How.stem(old.name) === snap.name && How.formatOf(old.name) === (snap.fmt || 'how')) ? old.name : fname };
    if (How.holdClash && How.holdClash !== dest.name) How.holdClash = '';
    var create = String(dest.path || '') === How.DOCUMENTS;
    return dirFor(dest, create).then(function (dir) {
      return exists(dir, dest.name).then(function (there) {
        var same = !!(old && !opts.saveAs && old.drive === dest.drive && String(old.path || '') === String(dest.path || '') && old.name === dest.name);
        if (there && !same) {
          /* HO12b: an auto-made Untitled name never opens the clash dialog;
             it quietly takes the next free Untitled N. */
          if (!opts.saveAs && isAuto(snap.name)) {
            return How.list().then(function (rows) {
              var free = How.untitledFor(rows, 0);
              setAuto(free);
              /* (before DW12) return put(dir, { kind: 'hub', drive: dest.drive, path: dest.path, name: How.fileName(free) }, snap, null); */
              return put(dir, { kind: 'hub', drive: dest.drive, path: dest.path, name: How.fileName(free, snap.fmt) }, snap, null);
            });
          }
          if (opts.unique && window.FsOps && window.FsOps.uniqueName) {
            return window.FsOps.uniqueName(dir, dest.name).then(function (free) {
              return put(dir, { kind: 'hub', drive: dest.drive, path: dest.path, name: free }, snap, null);
            });
          }
          return clash(dir, dest, snap, opts.saveAs ? null : old);
        }
        /* Save As keeps the previous file. A rename of the open file removes the old name after the new one is written. */
        return put(dir, dest, snap, opts.saveAs ? null : old);
      });
    });
  }
  /* (before DW12) writeHandle, download, writeStandalone, askName and saveNow were:
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
  function writeStandalone(snap, opts) {
    var text = How.stringify(snap);
    if (!opts.saveAs && How.dest && How.dest.kind === 'handle' && How.dest.handle) {
      return writeHandle(How.dest.handle, text).then(function () {
        return finish(How.dest, snap, 'Saved');
      });
    }
    if (!opts.explicit && !opts.saveAs) return Promise.resolve({ ok: true, wrote: false, name: snap.name });
    if (typeof window.showSaveFilePicker === 'function') {
      return window.showSaveFilePicker({
        suggestedName: How.fileName(snap.name),
        types: [{ description: 'Hub Office Writer', accept: { 'application/json': ['.how'] } }]
      }).then(function (handle) {
        var fname = handle.name || How.fileName(snap.name);
        var named = How.pack({
          name: How.stem(fname),
          created: snap.created,
          updated: Date.now(),
          html: snap.html,
          hf: snap.hf,
          page: snap.page
        });
        var dest = { kind: 'handle', handle: handle, name: fname };
        return writeHandle(handle, How.stringify(named)).then(function () { return finish(dest, named, 'Saved'); });
      });
    }
    download(text, How.fileName(snap.name));
    return Promise.resolve(finish(null, snap, 'Downloaded'));
  }
  function askName(opts) {
    if (!opts.saveAs) return Promise.resolve();
    if (!How.inHub() && typeof window.showSaveFilePicker === 'function') return Promise.resolve();
    var S = D();
    if (!S.dialog || !S.dialog.prompt) return Promise.resolve();
    var cur = S.storage && S.storage.currentName ? S.storage.currentName() : '';
    return S.dialog.prompt({ title: 'Save as', label: 'Name', value: cur, okLabel: 'Save' }).then(function (v) {
      if (v === null) { var e = new Error('cancel'); e.name = 'AbortError'; throw e; }
      if (S.storage && S.storage.setCurrentName) S.storage.setCurrentName(How.stem(v), false);
    });
  }
  function blankSkip(snap, opts) {
    if (opts.saveAs) return false;
    var S = D();
    if (!S.storage || !S.storage.isBlankUnsaved) return false;
    return S.storage.isBlankUnsaved(snap.html) && !How.dest;
  }
  function saveNow(opts) {
    opts = opts || {};
    if (How.skipWrite && !opts.explicit && !opts.saveAs) {
      return Promise.resolve({ ok: true, wrote: false, name: remembered() });
    }
    return askName(opts).then(function () {
      var snap = How.capture();
      if (blankSkip(snap, opts)) return { ok: true, wrote: false, name: snap.name };
      var hub = How.inHub() && How.canLocal();
      if (!hub && !opts.explicit && !opts.saveAs && !(How.dest && How.dest.kind === 'handle')) {
        return { ok: true, wrote: false, name: snap.name };
      }
      var op = hub ? writeHub(snap, opts) : writeStandalone(snap, opts);
      return Promise.resolve(op).then(function (res) {
        if (!res) return { ok: true, wrote: false, name: snap.name };
        return res;
      });
    }).then(function (res) {
      if (res && res.wrote) {
        var S = D();
        setAuto(''); /* HO12b: once written, the name is the file's own * /
        if (S.storage) {
          S.storage.loadedName = res.name;
          if (S.storage.setCurrentName) S.storage.setCurrentName(res.name, false);
          if (S.storage.noteSaved) S.storage.noteSaved();
        }
        How.dest = res.dest || null;
        if (res.created) How.created = res.created;
        How.holdClash = '';
      }
      return res || { ok: true, wrote: false };
    });
  }

  */
  /* DW12: body is the .how text or a .docx / .odt Blob. */
  function writeHandle(handle, body, fmt) {
    return handle.createWritable().then(function (w) {
      var blob = (typeof body === 'string') ? new Blob([body], { type: How.mimeOf(fmt) }) : body;
      return w.write(blob).then(function () { return w.close(); }, function (e) {
        return w.abort().then(function () { throw e; }, function () { throw e; });
      });
    });
  }
  function download(body, name, fmt) {
    var blob = (typeof body === 'string') ? new Blob([body], { type: How.mimeOf(fmt) }) : body;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  /* DW12: the bytes for a format: .how text (named after stem) or a generated Blob. */
  function bodyFor(fmt, snap, stem) {
    if (fmt !== 'how') return How.blobFor(fmt);
    return Promise.resolve(How.stringify(How.pack({
      name: How.stem(stem || snap.name),
      created: snap.created,
      updated: Date.now(),
      html: snap.html,
      hf: snap.hf,
      page: snap.page
    })));
  }
  function writeStandalone(snap, opts) {
    var fmt = snap.fmt || 'how';
    if (!opts.saveAs && How.dest && How.dest.kind === 'handle' && How.dest.handle) {
      var held = How.dest;
      return bodyFor(fmt, snap).then(function (body) {
        return writeHandle(held.handle, body, fmt);
      }).then(function () {
        return finish(held, snap, 'Saved');
      });
    }
    if (!opts.explicit && !opts.saveAs) return Promise.resolve({ ok: true, wrote: false, name: snap.name });
    if (typeof window.showSaveFilePicker === 'function') {
      var F = How.FORMATS[fmt];
      var accept = {};
      accept[F.mime] = [F.ext];
      return window.showSaveFilePicker({
        suggestedName: How.fileName(snap.name, fmt),
        types: [{ description: F.label, accept: accept }]
      }).then(function (handle) {
        var fname = handle.name || How.fileName(snap.name, fmt);
        /* A known extension typed in the picker wins over the format chosen before. */
        var use = How.extFormat(fname) || fmt;
        var named = { name: How.stem(fname), created: snap.created, html: snap.html, hf: snap.hf, page: snap.page, fmt: use };
        var dest = { kind: 'handle', handle: handle, name: fname };
        return bodyFor(use, named, fname).then(function (body) {
          return writeHandle(handle, body, use);
        }).then(function () { return finish(dest, named, 'Saved'); });
      });
    }
    return bodyFor(fmt, snap, snap.name).then(function (body) {
      download(body, How.fileName(snap.name, fmt), fmt);
      return finish(null, snap, 'Downloaded');
    });
  }
  /* DW12: Save As asks for the name and the format in one in-app dialog
     (outside the Hub the browser's picker then asks where). No format warning. */
  function askName(opts) {
    if (!opts.saveAs) return Promise.resolve();
    var S = D();
    var cur = S.storage && S.storage.currentName ? S.storage.currentName() : '';
    var fmt = opts.format || How.format || 'how';
    var picker = !How.inHub() && typeof window.showSaveFilePicker === 'function';
    if (S.dialog && S.dialog.form) {
      return S.dialog.form({
        title: 'Save as',
        fields: [
          { key: 'name', label: 'Name', type: 'text', value: cur },
          { key: 'format', label: 'Format', type: 'select', value: fmt,
            options: How.FORMAT_ORDER.map(function (k) { return { value: k, label: How.FORMATS[k].label }; }) }
        ],
        okLabel: 'Save',
        validate: function (v) { return String(v && v.name || '').trim() ? '' : 'Type a name.'; }
      }).then(function (v) {
        if (v === null || v === undefined) { var e = new Error('cancel'); e.name = 'AbortError'; throw e; }
        var pick = How.FORMATS[v.format] ? v.format : fmt;
        opts.format = How.extFormat(v.name) || pick;
        if (S.storage && S.storage.setCurrentName) S.storage.setCurrentName(How.stem(v.name), false);
      });
    }
    if (picker) return Promise.resolve();
    if (!S.dialog || !S.dialog.prompt) return Promise.resolve();
    return S.dialog.prompt({ title: 'Save as', label: 'Name', value: cur, okLabel: 'Save' }).then(function (v) {
      if (v === null) { var e = new Error('cancel'); e.name = 'AbortError'; throw e; }
      if (How.extFormat(v)) opts.format = How.extFormat(v);
      if (S.storage && S.storage.setCurrentName) S.storage.setCurrentName(How.stem(v), false);
    });
  }
  function blankSkip(snap, opts) {
    if (opts.saveAs) return false;
    var S = D();
    if (!S.storage || !S.storage.isBlankUnsaved) return false;
    return S.storage.isBlankUnsaved(snap.html) && !How.dest;
  }
  /* DW12 autosave rule for a .docx / .odt document (How.format):
     - the typing timer and the periodic timer (opts.timer) never write it;
     - other flushes (leaving the page, New, opening another file, a rename in the
       name box, Read Aloud) write it to its own file only when there is one
       (How.dest) and the content changed since it was opened or saved;
     - Save / Save As (opts.explicit / opts.saveAs) always write it.
     A .how document autosaves exactly as before. */
  function saveNow(opts) {
    opts = opts || {};
    if (How.skipWrite && !opts.explicit && !opts.saveAs) {
      return Promise.resolve({ ok: true, wrote: false, name: remembered() });
    }
    var user = !!(opts.explicit || opts.saveAs);
    if (!user && (opts.format || How.format) !== 'how' && (opts.timer || !How.dest)) {
      return Promise.resolve({ ok: true, wrote: false, name: remembered() || (D().storage && D().storage.currentName ? D().storage.currentName() : '') });
    }
    var snap = null;
    return askName(opts).then(function () {
      snap = How.capture();
      snap.fmt = opts.format || How.format || 'how';
      if (snap.fmt !== 'how' && !user && How.sig(snap) === How.savedSig) return { ok: true, wrote: false, name: snap.name };
      if (blankSkip(snap, opts)) return { ok: true, wrote: false, name: snap.name };
      var hub = How.inHub() && How.canLocal();
      if (!hub && !opts.explicit && !opts.saveAs && !(How.dest && How.dest.kind === 'handle')) {
        return { ok: true, wrote: false, name: snap.name };
      }
      var op = hub ? writeHub(snap, opts) : writeStandalone(snap, opts);
      return Promise.resolve(op).then(function (res) {
        if (!res) return { ok: true, wrote: false, name: snap.name };
        return res;
      });
    }).then(function (res) {
      if (res && res.wrote) {
        var S = D();
        setAuto(''); /* HO12b: once written, the name is the file's own */
        if (S.storage) {
          S.storage.loadedName = res.name;
          if (S.storage.setCurrentName) S.storage.setCurrentName(res.name, false);
          if (S.storage.noteSaved) S.storage.noteSaved();
        }
        How.dest = res.dest || null;
        if (res.created) How.created = res.created;
        How.holdClash = '';
        How.format = res.fmt || 'how';   /* DW12: later Saves keep this format */
        if (snap) { snap.name = res.name; How.savedSig = How.sig(snap); }
      }
      return res || { ok: true, wrote: false };
    });
  }

  /* explicit: Save / Save As (picker or download outside the Hub).
     unique: pick a free Documents name instead of asking (imported .docx).
     Autosave writes only when a Hub file or a picked file is already the destination,
     and the first Hub save creates Documents/<name>.how. */
  How.save = function save(opts) {
    var p = enqueue(function () {
      return saveNow(opts).catch(function (e) {
        if (e && (e.name === 'AbortError' || e.code === 20)) return { ok: true, cancelled: true, wrote: false };
        var S = D();
        if (S.storage && S.storage.noteFailed) S.storage.noteFailed(e);
        throw e;
      });
    });
    p.catch(function () {});
    return p;
  };
  How.autosave = function autosave(opts) {
    return How.save(opts || {});
  };
  /* DW12: a .docx / .odt was just opened (writer-docxopen.js): Save writes back to dest
     (a Hub file, a picked file handle, or null = ask / Documents on the first Save) in
     that format. No .how copy is made. */
  How.opened = function opened(fmt, dest) {
    var S = D();
    How.format = How.FORMATS[fmt] ? fmt : 'how';
    How.dest = dest || null;
    How.created = 0;
    How.holdClash = '';
    setAuto('');
    if (S.storage) S.storage.loadedName = S.storage.currentName ? S.storage.currentName() : '';
    try { How.savedSig = How.sig(How.capture()); } catch (e) { How.savedSig = ''; }
    return How.format;
  };

  How.openFile = function openFile(file, dest, opts) {
    opts = opts || {};
    if (!file) return Promise.resolve(false);
    if (file.size > How.MAX) { toast('This .how file is too large.'); return Promise.resolve(false); }
    if (!opts.quiet) toast('Opening ' + (file.name || 'document') + '\u2026');
    var S = D();
    if (S.app) clearTimeout(S.app.inputTimer);
    return file.text().then(function (text) {
      var doc = How.parse(text);
      /* Apply inside the save queue so a keystroke save cannot land between the flush and the new document. */
      return enqueue(function () {
        return saveNow({}).catch(function () {}).then(function () {
          How.apply(doc);
          How.dest = dest || null;
          How.holdClash = '';
          How.format = 'how';   /* DW12 */
          How.savedSig = '';
          if (!opts.quiet) toast('Opened ' + doc.name);
          return true;
        });
      });
    }).catch(function (e) {
      toast(e && (e.userMessage || e.message) ? (e.userMessage || e.message) : 'Could not open document');
      return false;
    });
  };
  How.openRef = function openRef(ref, opts) {
    if (!window.FsRef) return Promise.resolve(false);
    return window.FsRef.resolve(ref).then(function (got) {
      return got.file.getFile().then(function (file) {
        return How.openFile(file, { kind: 'hub', drive: ref.drive, path: ref.path || '', name: ref.name }, opts);
      });
    }).catch(function (e) {
      toast(e && (e.userMessage || e.message) ? (e.userMessage || e.message) : 'Could not open document');
      return false;
    });
  };
  How.openName = function openName(name, opts) {
    return How.openRef({ drive: 'local', path: How.DOCUMENTS, name: /\.how$/i.test(name) ? name : How.fileName(name) }, opts);
  };
  How.openFromHash = function openFromHash() {
    if (typeof window === 'undefined' || !window.FsRef || !window.location) return Promise.resolve(false);
    var ref = window.FsRef.parse(window.location.hash);
    /* (before DW7) if (!ref || !/\.how$/i.test(ref.name || '')) return Promise.resolve(false); */
    if (!ref || !ref.name) return Promise.resolve(false);
    var key = window.FsRef.hash(ref);
    if (key === How.lastHash) return Promise.resolve(false);
    /* (before DW9) if (/\.(docx|odt)$/i.test(ref.name) && D().docxopen && D().docxopen.open) { */
    if (/\.(docx|odt|txt)$/i.test(ref.name) && D().docxopen && D().docxopen.open) {
      How.lastHash = key;
      return window.FsRef.resolve(ref).then(function (got) {
        return got.file.getFile().then(function (file) {
          /* (before DW12) return D().docxopen.open(file).then(function (name) { return !!name; }); */
          var dest = { kind: 'hub', drive: ref.drive, path: ref.path || '', name: ref.name };
          return D().docxopen.open(file, { dest: dest }).then(function (name) { return !!name; });
        });
      }).then(function (ok) {
        if (!ok) How.lastHash = '';
        return !!ok;
      }).catch(function () {
        How.lastHash = '';
        return false;
      });
    }
    if (!/\.how$/i.test(ref.name)) return Promise.resolve(false);
    How.lastHash = key;
    return How.openRef(ref).then(function (ok) {
      if (!ok) How.lastHash = '';
      return !!ok;
    });
  };
  How.list = function list() {
    if (!How.inHub() || !How.canLocal() || !window.FsOps) return Promise.resolve([]);
    return window.FsDrives.handle('local').then(function (root) {
      if (!root) return [];
      return root.getDirectoryHandle(How.DOCUMENTS).then(function (dir) {
        return window.FsOps.list(dir);
      }, function () { return []; });
    }).then(function (items) {
      return (items || []).filter(function (e) { return e.kind === 'file' && /\.how$/i.test(e.name); })
        .sort(function (a, b) { return (b.modified || 0) - (a.modified || 0); });
    }).catch(function () { return []; });
  };
  How.remove = function remove(name) {
    var file = /\.how$/i.test(name) ? name : How.fileName(name);
    var dest = (How.dest && How.dest.kind === 'hub' && (How.dest.name === file || How.stem(How.dest.name) === How.stem(file)))
      ? How.dest
      : { kind: 'hub', drive: 'local', path: How.DOCUMENTS, name: file };
    return dirFor(dest, false).then(function (dir) { return dir.removeEntry(dest.name); });
  };
  How.fresh = function fresh() {
    var S = D();
    How.format = 'how';   /* DW12: a new document is a .how until Save As picks another format */
    How.savedSig = '';
    How.dest = null;
    How.created = 0;
    How.holdClash = '';
    if (S.storage) S.storage.loadedName = '';
    if (S.pages && S.pages.rebuildSinglePage) S.pages.rebuildSinglePage();
    var editor = S.pages && S.pages.firstEditor ? S.pages.firstEditor() : null;
    if (editor) editor.innerHTML = '<p><br></p>';
    /* (before HO12b) if (S.storage && S.storage.fillNameIfEmpty) S.storage.fillNameIfEmpty();
    return How.list().then(function (rows) {
      var base = S.storage && S.storage.currentName ? S.storage.currentName() : 'Document';
      var name = base;
      var n = 2;
      var taken = {};
      rows.forEach(function (r) { taken[How.stem(r.name).toLowerCase()] = true; });
      while (taken[String(name).toLowerCase()]) name = base + '_' + (n++);
      if (S.storage && S.storage.setCurrentName) S.storage.setCurrentName(name, false); */
    return How.list().then(function (rows) {
      var name = How.untitledFor(rows, 0);
      setAuto(name);
      if (S.storage && S.storage.setCurrentName) S.storage.setCurrentName(name, false);
      if (S.hf && S.hf.set && S.hf.blank) S.hf.set(S.hf.blank());
      if (S.pages && S.pages.layoutAll) S.pages.layoutAll();
      if (editor) { editor.focus(); if (S.editor) S.editor.activeEditor = editor; }
      if (S.history && S.history.reset) S.history.reset();
      return name;
    });
  };
  /* HO12b: name the blank document of a new Hub Office tab Untitled N
     (?untitled=N when free in Documents). Only while the name is still auto-made. */
  How.nameNew = function nameNew(pref) {
    var S = D();
    var D2 = root && root.OfficeDocName;
    if (pref == null) pref = (D2 && D2.preferred) ? D2.preferred() : 0;
    return How.list().then(function (rows) {
      var cur = S.storage && S.storage.currentName ? S.storage.currentName() : '';
      if (cur && !isAuto(cur)) return cur;
      var name = How.untitledFor(rows, pref);
      setAuto(name);
      if (S.storage && S.storage.setCurrentName) S.storage.setCurrentName(name, false);
      return name;
    });
  };
  How.start = function start() {
    return How.openFromHash().then(function (opened) {
      if (opened) return true;
      /* (before HO12) if (!How.inHub() || !How.canLocal()) return false;
      return How.list().then(function (rows) {
        if (rows.length) return How.openName(rows[0].name, { quiet: true });
        return false;
      }); */
      /* (before HO12b) a new tab kept the name from fillNameIfEmpty:
      if (typeof OfficeNewDoc !== 'undefined' && OfficeNewDoc.isNewDocLaunch && OfficeNewDoc.isNewDocLaunch()) return false; */
      if (typeof OfficeNewDoc !== 'undefined' && OfficeNewDoc.isNewDocLaunch && OfficeNewDoc.isNewDocLaunch()) return How.nameNew().then(function () { return false; });
      if (!How.inHub() || !How.canLocal()) return false;
      return How.list().then(function (rows) {
        if (rows.length) return How.openName(rows[0].name, { quiet: true });
        return false;
      });
    }).catch(function () { return false; });
  };

  How.bind = function bind() {
    if (typeof window === 'undefined') return;
    window.addEventListener('hashchange', function () { How.openFromHash(); });
  };

  /* (before HOW1) Draftly.storage.save wrote the document to IndexedDB.
     The original function stays on saveLegacy for the HO2 check. */
  How.install = function install() {
    var S = D();
    if (S.storage && S.storage.save && !S.storage.saveLegacy) {
      S.storage.saveLegacy = S.storage.save;
      S.storage.save = function () { return How.autosave(); };
    }
    How.bind();
  };

  if (typeof module === 'object' && module.exports) module.exports = How;
  if (root) {
    root.Writer = root.Writer || {};
    root.Writer.how = How;
    if (root.document) How.install();
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
