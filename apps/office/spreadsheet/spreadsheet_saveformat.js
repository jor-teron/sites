/* ============================================================
   FILE: spreadsheet_saveformat.js
   ROLE: SH32 Spreadsheet saves straight to .xlsx, .ods and .csv,
         like LibreOffice Calc (the Writer DW12 pattern).
         - An opened .xlsx / .ods / .csv (Open, drop, Hub #drive=&file=)
           is the Save target: Save (Ctrl+S, button, File menu) writes
           back to that file in that format through the existing
           generators (xlsxWriteBook in spreadsheet_xlsx.js, csvText in
           spreadsheet_files.js). No .hos copy is made.
         - Save As shows one in-app box: Name and Format (.hos, .xlsx,
           .ods, .csv). The current format is preselected, later Saves
           keep the chosen one, and the old file is kept. A typed
           extension picks the format.
         - No format warnings. CSV writes the active sheet silently.
         - Autosave: the edit timer never writes .xlsx / .ods / .csv.
           Leaving the page, New and opening another file write it only
           when it has a target and the content changed. Explicit Save
           always writes. A .hos workbook autosaves exactly as before
           (SHEET_HOS from ../shared/office-native.js).
         Wraps SHEET_HOS.save / autosave / openFile / prepareNew.
         No new libraries. In-app dialogs only.
         SH33: .xlsm (Excel with macros). An opened .xlsm keeps its macro parts
         in memory (F.macro, from SHEET_XLSM.extract in spreadsheet_xlsm.js);
         Save writes back to the same .xlsm through the .xlsx generator plus
         SHEET_XLSM.inject, so the macros still run in Excel. Save As lists
         "Excel with macros (.xlsm)" only for a workbook that came from an
         .xlsm. Choosing .xlsx drops the macros from that file, silently.
         F.macro is never written to localStorage or .hos.
   DEPENDS: SHEET_HOS (spreadsheet_hos.js), xlsxLoad / xlsxWriteBook,
            csvText, parseCsv, OfficeDialog, FsDrives / FsOps (Hub).
   ============================================================ */
(function (root) {
  'use strict';

  var F = {};
  F.FORMATS = {
    hos: { ext: '.hos', mime: 'application/json', label: 'Hub Office Spreadsheet (.hos)' },
    xlsx: { ext: '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', label: 'Excel (.xlsx)' },
    ods: { ext: '.ods', mime: 'application/vnd.oasis.opendocument.spreadsheet', label: 'OpenDocument Spreadsheet (.ods)' },
    csv: { ext: '.csv', mime: 'text/csv', label: 'CSV (.csv)' },
    /* SH33 */
    xlsm: { ext: '.xlsm', mime: 'application/vnd.ms-excel.sheet.macroEnabled.12', label: 'Excel with macros (.xlsm)' }
  };
  F.ORDER = ['hos', 'xlsx', 'ods', 'csv'];
  /* SH33: macro parts of the opened .xlsm (memory only), or null. */
  F.macro = null;
  /* SH33: Save As formats; .xlsm only for a workbook that came from an .xlsm. */
  F.order = function order() {
    return F.macro ? ['hos', 'xlsx', 'xlsm', 'ods', 'csv'] : F.ORDER.slice();
  };
  F.DOCUMENTS = 'Documents';
  /* Current Save format and, for xlsx / ods / csv, the file it writes to:
     { kind:'hub', drive, path, name } | { kind:'handle', handle, name } | null. */
  F.format = 'hos';
  F.dest = null;
  F.savedSig = '';
  F.pendingName = null;
  var tail = Promise.resolve();

  function enqueue(fn) {
    var run = tail.then(fn, fn);
    tail = run.then(function () {}, function () {});
    return run;
  }
  function abort() { var e = new Error('cancel'); e.name = 'AbortError'; return e; }
  function fail(msg) { var e = new Error(msg); e.userMessage = msg; return e; }
  function S() { return root.SHEET_HOS || null; }

  /* ---------- pure helpers ---------- */
  F.extFormat = function extFormat(name) {
    /* (before SH33) var m = /\.(hos|xlsx|ods|csv)$/i.exec(String(name || '').trim()); */
    var m = /\.(hos|xlsx|xlsm|ods|csv)$/i.exec(String(name || '').trim());
    return m ? m[1].toLowerCase() : '';
  };
  /* The format Save keeps for an opened file: .xlsx / .ods / .csv write back,
     anything else (.hos, .xls, no extension) saves as .hos. */
  F.formatOf = function formatOf(name) {
    var f = F.extFormat(name);
    return f || 'hos';
  };
  /* (before SH33) F.isDirect = function isDirect(fmt) { return fmt === 'xlsx' || fmt === 'ods' || fmt === 'csv'; }; */
  F.isDirect = function isDirect(fmt) { return fmt === 'xlsx' || fmt === 'xlsm' || fmt === 'ods' || fmt === 'csv'; };
  F.stem = function stem(name) {
    /* (before SH33) var s = String(name || '').trim().replace(/\.(hos|xlsx|ods|csv)$/i, ''); */
    var s = String(name || '').trim().replace(/\.(hos|xlsx|xlsm|ods|csv)$/i, '');
    s = s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) s = 'Sheet';
    if (s.length > 180) s = s.slice(0, 180).trim();
    return s;
  };
  F.fileName = function fileName(name, fmt) {
    return F.stem(name) + (F.FORMATS[fmt] || F.FORMATS.hos).ext;
  };
  F.mimeOf = function mimeOf(fmt) { return (F.FORMATS[fmt] || F.FORMATS.hos).mime; };
  /* Which generator writes a format (the save router). */
  F.generatorFor = function generatorFor(fmt) {
    /* (before SH33) if (fmt === 'xlsx' || fmt === 'ods') return 'sheetjs'; */
    if (fmt === 'xlsx' || fmt === 'xlsm' || fmt === 'ods') return 'sheetjs';
    if (fmt === 'csv') return 'csv';
    return 'hos';
  };
  /* Save As box result -> { name, format }. A typed extension wins over the select. */
  F.saveAsChoice = function saveAsChoice(v, cur) {
    var typed = F.extFormat(v && v.name);
    var pick = F.FORMATS[v && v.format] ? v.format : (cur || 'hos');
    var fmt = typed || pick;
    if (fmt === 'xlsm' && !F.macro) fmt = 'xlsx';   /* SH33: .xlsm is offered only for a workbook from an .xlsm */
    return { name: F.stem(v && v.name), format: fmt, file: F.fileName(v && v.name, fmt) };
  };

  /* ---------- environment ---------- */
  F.inHub = function inHub() {
    if (root.OfficeNative && root.OfficeNative.inHub) return root.OfficeNative.inHub();
    return false;
  };
  F.canLocal = function canLocal() { return !!(root.FsDrives && root.FsDrives.hasLocal); };
  F.currentName = function currentName() {
    var s = S();
    return s && s.stemName ? s.stemName() : 'Sheet';
  };
  F.setName = function setName(name) {
    var s = S();
    var stem = F.stem(name);
    if (root.SHEET_HUB && root.SHEET_HUB.setTitle) root.SHEET_HUB.setTitle(stem);
    else if (s && s.noteStem) s.noteStem(stem);
    if (s) s.autoName = '';
    return stem;
  };
  /* Fingerprint of the live workbook (name + every sheet), to skip rewriting an unchanged file. */
  F.sig = function sig() {
    var H = root.SHEET_HOS_FORMAT;
    try {
      if (H && H.capture && H.pack) {
        var p = H.pack(H.capture());
        p.created = 0; p.updated = 0;
        return JSON.stringify(p);
      }
    } catch (e) {}
    return '';
  };

  /* Bytes of the live workbook in a format. sync: return a Blob now or null
     (xlsx / ods need SheetJS already loaded). */
  F.blobNow = function blobNow(fmt) {
    if (fmt === 'csv' && typeof root.csvText === 'function') return new Blob([root.csvText()], { type: F.mimeOf('csv') });
    if ((fmt === 'xlsx' || fmt === 'ods') && root.XLSX && typeof root.xlsxWriteBook === 'function') {
      return new Blob([root.xlsxWriteBook(root.XLSX, fmt, 'array')], { type: F.mimeOf(fmt) });
    }
    if (fmt === 'xlsm' && root.XLSX && typeof root.xlsxWriteBook === 'function') return F.xlsmBlob(root.XLSX);   /* SH33 */
    return null;
  };
  /* SH33: the .xlsx generator's bytes with the kept macro parts put back. Without
     kept parts (an .xlsm with no macros) it is the plain workbook with the
     macroEnabled content type, so Excel accepts the .xlsm name. */
  F.xlsmBlob = function xlsmBlob(X) {
    var M = root.SHEET_XLSM;
    if (!M || !M.inject) throw fail('Could not build the .xlsm file.');
    var plain = root.xlsxWriteBook(X, 'xlsx', 'array');
    return new Blob([M.inject(X, plain, F.macro || M.empty())], { type: F.mimeOf('xlsm') });
  };
  F.blobFor = function blobFor(fmt) {
    var gen = F.generatorFor(fmt);
    if (gen === 'hos') return Promise.reject(fail('This format is saved by the .hos path.'));
    var now = null;
    try { now = F.blobNow(fmt); } catch (e) { return Promise.reject(e); }
    if (now) return Promise.resolve(now);
    if (gen === 'csv') return Promise.reject(fail('Could not build the .csv file.'));
    if (typeof root.xlsxLoad !== 'function') return Promise.reject(fail('Could not build the ' + F.FORMATS[fmt].ext + ' file.'));
    return root.xlsxLoad().then(function (X) {
      if (fmt === 'xlsm') return F.xlsmBlob(X);   /* SH33 */
      return new Blob([root.xlsxWriteBook(X, fmt, 'array')], { type: F.mimeOf(fmt) });
    });
  };

  /* ---------- writers ---------- */
  function dirFor(dest, create) {
    return root.FsDrives.handle(dest.drive).then(function (dir) {
      if (!dir) throw fail('The Hub drive is not available.');
      var parts = String(dest.path || '').split('/').filter(Boolean);
      var i = 0;
      function next() {
        if (i >= parts.length) return dir;
        var part = parts[i++];
        var got = (create && i === parts.length) ? dir.getDirectoryHandle(part, { create: true }) : dir.getDirectoryHandle(part);
        return got.then(function (child) { dir = child; return next(); });
      }
      return next();
    });
  }
  function exists(dir, name) {
    if (root.FsOps && root.FsOps.exists) return root.FsOps.exists(dir, name);
    return dir.getFileHandle(name).then(function () { return true; }, function () { return false; });
  }
  function writeDirBlob(dir, name, blob) {
    if (root.FsOps && root.FsOps.writeFile) return root.FsOps.writeFile(dir, name, blob);
    return dir.getFileHandle(name, { create: true }).then(function (fh) { return writeHandle(fh, blob); });
  }
  function writeHandle(handle, blob) {
    return handle.createWritable().then(function (w) {
      return w.write(blob).then(function () { return w.close(); }, function (e) {
        return Promise.resolve(w.abort && w.abort()).then(function () { throw e; }, function () { throw e; });
      });
    });
  }
  function download(blob, name) {
    var a = root.document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    root.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  F._download = download;
  function done(dest, name, fmt, verb) {
    return { ok: true, wrote: true, name: F.stem(dest && dest.name ? dest.name : name), dest: dest || null, fmt: fmt, verb: verb || 'Saved' };
  }
  function sameFile(a, b) {
    return !!(a && b && a.kind === 'hub' && b.kind === 'hub' && a.drive === b.drive &&
      String(a.path || '') === String(b.path || '') && a.name === b.name);
  }
  function hubFolder() {
    var s = S();
    var d = (F.dest && F.dest.kind === 'hub') ? F.dest : ((s && s.dest && s.dest.kind === 'hub') ? s.dest : null);
    return d ? { drive: d.drive, path: d.path || '' } : { drive: 'local', path: F.DOCUMENTS };
  }
  /* Hub: Save writes the opened file (a rename writes the new name in the same folder
     and removes the old one); Save As writes a new file in the file's folder (or
     Documents) and keeps the old one. A taken name asks Replace / Use free / Cancel,
     except an auto-made Untitled name, which takes the next free name. */
  function writeHub(fmt, name, opts, blob) {
    var old = (F.dest && F.dest.kind === 'hub' && !opts.saveAs) ? F.dest : null;
    var folder = old ? { drive: old.drive, path: old.path || '' } : hubFolder();
    var fname = (old && F.stem(old.name) === F.stem(name) && F.formatOf(old.name) === fmt) ? old.name : F.fileName(name, fmt);
    var dest = { kind: 'hub', drive: folder.drive, path: folder.path, name: fname };
    var create = String(dest.path || '') === F.DOCUMENTS;
    return dirFor(dest, create).then(function (dir) {
      function put(target, prev) {
        return writeDirBlob(dir, target.name, blob).then(function () {
          if (!prev || prev.name === target.name || prev.drive !== target.drive || String(prev.path || '') !== String(target.path || '')) return done(target, name, fmt);
          return dir.removeEntry(prev.name).then(function () { return done(target, name, fmt); }, function () { return done(target, name, fmt); });
        });
      }
      return exists(dir, dest.name).then(function (there) {
        var mine = sameFile(dest, F.dest);
        if (!there || mine) return put(dest, old);
        var s = S();
        var freeP = (root.FsOps && root.FsOps.uniqueName) ? root.FsOps.uniqueName(dir, dest.name) : Promise.resolve(F.fileName(F.stem(name) + ' (2)', fmt));
        return freeP.then(function (free) {
          var other = { kind: 'hub', drive: dest.drive, path: dest.path, name: free };
          if ((s && s.isAutoName && s.isAutoName(name)) || opts.unique || !(root.OfficeNative && root.OfficeNative.clashDialog)) return put(other, old);
          return root.OfficeNative.clashDialog(F.stem(dest.name), F.stem(free)).then(function (pick) {
            if (pick === 'replace') return put(dest, old);
            if (pick === 'use') return put(other, old);
            throw abort();
          });
        });
      });
    });
  }
  function pickerTypes(fmt) {
    var f = F.FORMATS[fmt], accept = {};
    accept[f.mime] = [f.ext];
    return [{ description: f.label, accept: accept }];
  }
  /* Outside the Hub: the held file handle (open picker / drop), else the save picker, else a download. */
  function writeStandalone(fmt, name, opts) {
    var held = (!opts.saveAs && F.dest && F.dest.kind === 'handle' && F.dest.handle) ? F.dest : null;
    if (held) {
      return F.blobFor(fmt).then(function (blob) { return writeHandle(held.handle, blob); })
        .then(function () { return done(held, name, fmt); });
    }
    if (typeof root.showSaveFilePicker === 'function') {
      return root.showSaveFilePicker({ suggestedName: F.fileName(name, fmt), types: pickerTypes(fmt) }).then(function (handle) {
        var fname = (handle && handle.name) || F.fileName(name, fmt);
        var use = F.extFormat(fname);
        if (!F.isDirect(use)) use = fmt;
        var dest = { kind: 'handle', handle: handle, name: fname };
        return F.blobFor(use).then(function (blob) { return writeHandle(handle, blob); })
          .then(function () { return done(dest, fname, use); });
      });
    }
    return F.blobFor(fmt).then(function (blob) {
      download(blob, F.fileName(name, fmt));
      return done(null, name, fmt, 'Downloaded');
    });
  }
  function noteSaved(res) {
    var verb = res && res.verb ? res.verb : 'Saved';
    if (typeof root.setStatus === 'function') root.setStatus(verb === 'Saved' && root.TXT ? root.TXT.saved : verb);
    if (root.OfficeNotify && root.OfficeNotify.saveOk) root.OfficeNotify.saveOk('spreadsheet');
  }
  function noteFailed(err) {
    if (typeof root.setStatus === 'function' && root.TXT) root.setStatus(root.TXT.saveFailed);
    if (root.OfficeNotify && root.OfficeNotify.saveProblem) root.OfficeNotify.saveProblem('spreadsheet', err);
  }
  /* After a direct write: later Saves keep this format and file. The .hos session is detached
     and held, so its timer and flush never write a .hos copy. */
  function adopt(res) {
    var s = S();
    F.format = res.fmt;
    F.dest = res.dest || null;
    if (s) {
      if (s.detach) s.detach();
      s.skipWrite = true;
    }
    F.setName(res.name);
    F.savedSig = F.sig();
    noteSaved(res);
    return res;
  }

  /* One direct write of the live workbook as fmt (xlsx / ods / csv). */
  F.writeDirect = function writeDirect(fmt, opts) {
    opts = opts || {};
    var name = F.pendingName != null ? F.pendingName : F.currentName();
    var hub = F.inHub() && F.canLocal();
    var op = hub
      ? F.blobFor(fmt).then(function (blob) { return writeHub(fmt, name, opts, blob); })
      : writeStandalone(fmt, name, opts);
    return op.then(adopt);
  };

  /* ---------- Save As box ---------- */
  F.askSaveAs = function askSaveAs() {
    var cur = F.currentName();
    var fmt = F.format || 'hos';
    var D = root.OfficeDialog;
    if (!D || !D.form) return Promise.resolve({ name: F.stem(cur), format: fmt, file: F.fileName(cur, fmt) });
    return D.form({
      title: 'Save as',
      fields: [
        { key: 'name', label: 'Name', type: 'text', value: cur },
        { key: 'format', label: 'Format', type: 'select', value: fmt,
          /* (before SH33) options: F.ORDER.map(function (k) { return { value: k, label: F.FORMATS[k].label }; }) */
          options: F.order().map(function (k) { return { value: k, label: F.FORMATS[k].label }; }) }
      ],
      okLabel: 'Save',
      validate: function (v) { return String(v && v.name || '').trim() ? '' : 'Type a name.'; }
    }).then(function (v) {
      if (v === null || v === undefined) throw abort();
      return F.saveAsChoice(v, fmt);
    });
  };
  /* spreadsheet_hos.js promptName takes the name already chosen in the Save As box. */
  F.takeName = function takeName() {
    var v = F.pendingName;
    F.pendingName = null;
    return v;
  };

  /* ---------- wrapped session ---------- */
  var orig = {};
  F.save = function save(opts) {
    opts = opts || {};
    var s = S();
    if (opts.saveAs) {
      return enqueue(function () {
        return F.askSaveAs().then(function (pick) {
          if (pick.format === 'hos') {
            /* Native Save As: the .hos path, with the name from the box (no second question). */
            var prev = { format: F.format, dest: F.dest, skip: s ? s.skipWrite : false };
            F.setName(pick.name);
            F.pendingName = pick.name;
            if (F.format !== 'hos' && s) { s.detach(); s.skipWrite = false; }
            F.format = 'hos';
            return orig.save({ explicit: true, saveAs: true }).then(function (res) {
              F.pendingName = null;
              if (res && res.wrote) { F.dest = null; F.savedSig = ''; return res; }
              F.format = prev.format; F.dest = prev.dest;
              if (s) s.skipWrite = prev.skip;
              return res;
            });
          }
          F.pendingName = pick.name;
          return F.writeDirect(pick.format, { saveAs: true }).then(function (res) {
            F.pendingName = null;
            return res;
          }, function (e) { F.pendingName = null; throw e; });
        });
      }).catch(function (e) {
        if (e && (e.name === 'AbortError' || e.code === 20)) return { ok: true, cancelled: true, wrote: false };
        noteFailed(e);
        throw e;
      });
    }
    if (F.format === 'hos') return orig.save(opts);
    if (!opts.explicit) return F.autosave(opts);
    return enqueue(function () { return F.writeDirect(F.format, opts); }).catch(function (e) {
      if (e && (e.name === 'AbortError' || e.code === 20)) return { ok: true, cancelled: true, wrote: false };
      noteFailed(e);
      throw e;
    });
  };
  /* Timer: never writes xlsx / ods / csv. opts.flush (page leave, New, open another
     file): writes only to an existing target when the content changed. */
  F.autosave = function autosave(opts) {
    opts = opts || {};
    if (F.format === 'hos') return orig.autosave(opts);
    if (!opts.flush) return Promise.resolve({ ok: true, wrote: false, name: F.currentName() });
    return F.flush();
  };
  /* Capture now (before the workbook is replaced), write later. */
  F.flush = function flush() {
    if (!F.isDirect(F.format) || !F.dest) return Promise.resolve({ ok: true, wrote: false });
    var hub = F.inHub() && F.canLocal();
    if (F.dest.kind === 'hub' && !hub) return Promise.resolve({ ok: true, wrote: false });
    if (F.dest.kind !== 'hub' && F.dest.kind !== 'handle') return Promise.resolve({ ok: true, wrote: false });
    var sigNow = F.sig();
    if (sigNow && sigNow === F.savedSig) return Promise.resolve({ ok: true, wrote: false });
    var blob = null;
    try { blob = F.blobNow(F.format); } catch (e) { blob = null; }
    if (!blob) return Promise.resolve({ ok: true, wrote: false });
    var fmt = F.format, dest = F.dest;
    F.savedSig = sigNow;
    /* Always the target's own file name: the title may already show the next file. */
    return enqueue(function () {
      if (dest.kind === 'handle') return writeHandle(dest.handle, blob).then(function () { return done(dest, dest.name, fmt); });
      return dirFor(dest, false).then(function (dir) { return writeDirBlob(dir, dest.name, blob); })
        .then(function () { return done(dest, dest.name, fmt); });
    }).then(function (res) { return res; }, function (e) { noteFailed(e); return { ok: false, wrote: false }; });
  };
  /* An .xlsx / .ods / .csv was just opened (spreadsheet_xlsx.js, openCsvFile). */
  /* (before SH33) F.opened = function opened(fmt, dest, fileName) { */
  F.opened = function opened(fmt, dest, fileName, macro) {
    var s = S();
    F.format = F.isDirect(fmt) ? fmt : 'hos';
    F.dest = dest || null;
    /* SH33: an .xlsm keeps its macro parts (memory only); anything else forgets them. */
    F.macro = F.format === 'xlsm' ? (macro || (root.SHEET_XLSM ? root.SHEET_XLSM.empty() : null)) : null;
    if (s) {
      if (s.detach) s.detach();
      s.skipWrite = F.format !== 'hos';
    }
    if (fileName) F.setName(fileName);
    F.savedSig = F.sig();
    return F.format;
  };
  /* Back to the .hos path (New, a .hos or .xls opened). */
  F.reset = function reset() {
    var s = S();
    var was = F.format;
    F.format = 'hos';
    F.dest = null;
    F.savedSig = '';
    F.macro = null;   /* SH33 */
    if (s && was !== 'hos') s.skipWrite = false;
  };

  /* Open a .csv as its own one-sheet workbook; Save writes back to it. */
  F.openCsvFile = function openCsvFile(file, o) {
    o = o || {};
    if (!file) return Promise.resolve(false);
    F.flush();
    var read = file.text ? file.text() : new Promise(function (ok, bad) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result)); };
      r.onerror = function () { bad(r.error); };
      r.readAsText(file);
    });
    return read.then(function (text) {
      var s = S();
      var rows = root.parseCsv(String(text));
      var stem = F.stem(String(file.name || 'Sheet').replace(/\.csv$/i, ''));
      var nameMax = (root.CFG && root.CFG.sheets && root.CFG.sheets.nameMax) || 31;
      var sheetName = stem.replace(/[\\/*?:\[\]]/g, ' ').slice(0, nameMax).trim() || 'Sheet1';
      if (typeof root.undoRecord === 'function') root.undoRecord('import');
      if (typeof root.stashSheetView === 'function') root.stashSheetView();
      root.workbook = { sheets: [root.makeSheet(sheetName)], active: 0 };
      if (typeof root.bindActiveSheet === 'function') root.bindActiveSheet();
      var grid = root.workbook.sheets[0].cells, r, c;
      var R = root.ROWS || 100, C = root.COLS || 26;
      for (r = 0; r < Math.min(R, rows.length); r++) {
        for (c = 0; c < Math.min(C, rows[r].length); c++) grid[r][c].formula = rows[r][c];
      }
      if (s) { if (s.detach) s.detach(); s.skipWrite = true; }
      root.selR = root.selC = root.extR = root.extC = 0; root.selMode = 'cell';
      if (typeof root.afterChange === 'function') root.afterChange();
      if (typeof root.applyWidths === 'function') root.applyWidths();
      if (typeof root.renderSheetTabs === 'function') root.renderSheetTabs();
      if (typeof root.highlightSel === 'function') root.highlightSel();
      var dest = o.dest || (o.handle ? { kind: 'handle', handle: o.handle, name: o.handle.name || file.name } : null);
      F.opened('csv', dest, file.name);
      if (typeof root.setStatus === 'function' && root.TXT) root.setStatus(root.TXT.csvLoaded);
      return true;
    }).catch(function (e) {
      if (typeof root.setStatus === 'function') root.setStatus('Could not open file: ' + ((e && (e.userMessage || e.message)) || e));
      return false;
    });
  };

  /* Route a picked / dropped file. */
  F.openAny = function openAny(file, o) {
    o = o || {};
    var s = S();
    var n = String(file && file.name || '');
    if (/\.hos$/i.test(n) && s && s.openFile) return s.openFile(file, null);
    /* (before SH33) if (/\.(xlsx|xls|ods)$/i.test(n) && typeof root.importXlsxFile === 'function') return root.importXlsxFile(file, o); */
    if (/\.(xlsx|xlsm|xls|ods)$/i.test(n) && typeof root.importXlsxFile === 'function') return root.importXlsxFile(file, o);
    return F.openCsvFile(file, o);
  };
  /* Outside the Hub, the browser's open picker gives a handle, so Save can write back. */
  F.canPick = function canPick() {
    return typeof root.showOpenFilePicker === 'function' && !F.inHub();
  };
  F.pickTypes = function pickTypes() {
    return [{
      /* (before SH33) description: 'Spreadsheets (.xlsx, .ods, .csv, .xls)', */
      description: 'Spreadsheets (.xlsx, .xlsm, .ods, .csv, .xls)',
      accept: {
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],   /* SH33 */
        'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
        'text/csv': ['.csv'],
        'application/vnd.ms-excel': ['.xls']
      }
    }];
  };
  /* A dropped file's handle (Chromium, outside the Hub). Must be called inside the drop event. */
  F.dropHandle = function dropHandle(e, file) {
    var item = e && e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items[0];
    if (!item || !item.getAsFileSystemHandle || F.inHub() || !F.isDirect(F.formatOf(file && file.name))) return null;
    try { return item.getAsFileSystemHandle(); } catch (err) { return null; }
  };

  F.install = function install(session) {
    if (!session || session._sh32) return;
    session._sh32 = true;
    orig.save = session.save;
    orig.autosave = session.autosave;
    orig.openFile = session.openFile;
    orig.prepareNew = session.prepareNew;
    session.save = F.save;
    session.autosave = F.autosave;
    /* Opening a .hos (button, drop, Hub link, start): flush a direct target first; its own
       pre-open save stays held so no .hos copy of an .xlsx / .ods / .csv is written. */
    session.openFile = function (file, dest, opts) {
      if (F.format === 'hos') return orig.openFile.call(session, file, dest, opts);
      F.flush();
      return orig.openFile.call(session, file, dest, opts).then(function (ok) {
        if (ok) F.reset();
        return ok;
      });
    };
    if (orig.prepareNew) {
      session.prepareNew = function () {
        F.reset();
        return orig.prepareNew.apply(session, arguments);
      };
    }
  };
  F._orig = orig;

  if (typeof module === 'object' && module.exports) module.exports = F;
  if (root) {
    root.SHEET_SAVEFMT = F;
    if (root.SHEET_HOS) F.install(root.SHEET_HOS);
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));

/* SH32: File → Open (XLSX / ODS / CSV) uses the browser's open picker outside the Hub
   (a file handle, so Save writes back to the same file); otherwise the file input as before. */
if (typeof SHEET_INIT !== 'undefined' && typeof document !== 'undefined') {
  SHEET_INIT.push(function () {
    var F = window.SHEET_SAVEFMT;
    var inp = document.getElementById('file-import');
    var label = inp && inp.parentNode;
    if (!F || !label) return;
    label.addEventListener('click', function (e) {
      if (e.target === inp || !F.canPick()) return;
      e.preventDefault();
      if (typeof ribbonSetFile === 'function') ribbonSetFile(false);
      window.showOpenFilePicker({ types: F.pickTypes(), multiple: false }).then(function (hs) {
        var h = hs && hs[0];
        if (!h) return;
        return h.getFile().then(function (f) { return F.openAny(f, F.isDirect(F.formatOf(f.name)) ? { handle: h } : {}); });
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        inp.value = '';
        inp.click();
      });
    });
  });
}
