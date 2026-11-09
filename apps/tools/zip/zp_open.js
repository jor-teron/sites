/* Zip — zp_open.js: open a zip, list entries, extract one / all (folder or download), password + cancel. ZP1+ZP2 */
(function (root) {
  'use strict';

  var H = root.ZPHelpers;

  async function openZip(blobOrFile) {
    var z = root.zip;
    if (!z || !z.ZipReader) throw new Error('zip.js is not loaded');
    var reader = new z.ZipReader(new z.BlobReader(blobOrFile));
    var entries = await reader.getEntries();
    return { reader: reader, entries: entries || [] };
  }

  async function closeZip(handle) {
    if (handle && handle.reader) {
      try { await handle.reader.close(); } catch (e) { /* ignore */ }
    }
  }

  function needsPassword(entries) {
    var list = entries || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].encrypted && !list[i].directory) return true;
    }
    return false;
  }

  /** Extract one entry to a Blob. */
  async function extractEntryBlob(entry, password, signal) {
    var z = root.zip;
    if (!entry || entry.directory) throw new Error('Not a file entry');
    if (signal && signal.aborted) throw abortErr();
    var opts = {};
    if (password) opts.password = password;
    try {
      return await entry.getData(new z.BlobWriter(), opts);
    } catch (err) {
      if (H.isPasswordError(err)) {
        var e = new Error('Wrong password');
        e.name = 'PasswordError';
        e.cause = err;
        throw e;
      }
      throw err;
    }
  }

  /**
   * Extract all safe file entries.
   * sink: { mode: 'folder'|'download', save: ZPSave, onFile, onProgress, signal, password }
   */
  async function extractAll(entries, sink) {
    var z = root.zip;
    var list = entries || [];
    var files = [];
    var skipped = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.directory) continue;
      var clean = H.sanitizeZipPath(e.filename);
      if (!clean.ok) {
        skipped.push({ path: e.filename, reason: clean.reason });
        continue;
      }
      files.push({ entry: e, path: clean.path });
    }

    var total = files.length || 1;
    var saved = [];
    var password = sink && sink.password ? String(sink.password) : '';
    var signal = sink && sink.signal;
    var useFolder = !!(sink && sink.mode === 'folder' && sink.save && sink.save.ready());

    for (var j = 0; j < files.length; j++) {
      if (signal && signal.aborted) throw abortErr();
      var item = files[j];
      var getOpts = {};
      if (password) getOpts.password = password;
      if (sink && sink.onProgress) {
        getOpts.onprogress = (function (idx) {
          return function (progress, size) {
            var frac = size ? progress / size : 0;
            sink.onProgress(idx + frac, total);
          };
        })(j);
      }

      try {
        if (useFolder) {
          var opened = await sink.save.openUniqueWritable(item.path);
          try {
            // FileSystemWritableFileStream is a WritableStream; zip.js closes it by default
            await item.entry.getData(opened.writable, getOpts);
            saved.push(opened.savedPath);
          } catch (err) {
            try { await opened.writable.abort(); } catch (e) { /* ignore */ }
            throw err;
          }
        } else {
          var blob = await item.entry.getData(new z.BlobWriter(), getOpts);
          var name = item.path.split('/').pop() || 'file';
          sink.save.downloadBlob(blob, name);
          saved.push(name);
        }
      } catch (err) {
        if (H.isPasswordError(err)) {
          var pe = new Error('Wrong password');
          pe.name = 'PasswordError';
          pe.cause = err;
          throw pe;
        }
        throw err;
      }
      if (sink && sink.onFile) sink.onFile(saved[saved.length - 1], j, files.length);
      if (sink && sink.onProgress) sink.onProgress(j + 1, total);
    }
    return { saved: saved, skipped: skipped };
  }

  function abortErr() {
    var e = new Error('Cancelled');
    e.name = 'AbortError';
    return e;
  }

  root.ZPOpen = {
    openZip: openZip,
    closeZip: closeZip,
    needsPassword: needsPassword,
    extractEntryBlob: extractEntryBlob,
    extractAll: extractAll
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
