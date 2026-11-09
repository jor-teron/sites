/* Zip — zp_make.js: build a zip from File list (optional AES-256 password), progress + cancel. ZP1+ZP2 */
(function (root) {
  'use strict';

  var H = root.ZPHelpers;

  /**
   * Create a zip Blob from items: [{ relPath, file }].
   * options: { password?, onProgress(done,total), signal? AbortSignal }
   * Uses global zip (zip.js UMD).
   */
  async function createZip(items, options) {
    var z = root.zip;
    if (!z || !z.ZipWriter) throw new Error('zip.js is not loaded');
    var opts = options || {};
    var list = Array.isArray(items) ? items : [];
    if (!list.length) throw new Error('No files to zip');

    var signal = opts.signal;
    if (signal && signal.aborted) throw abortErr();

    var password = opts.password ? String(opts.password) : '';
    var writerOpts = { bufferedWrite: true, keepOrder: true };
    var zipWriter = new z.ZipWriter(new z.BlobWriter('application/zip'), writerOpts);

    var total = 0;
    for (var i = 0; i < list.length; i++) {
      total += Number(list[i].file && list[i].file.size) || 0;
    }
    if (total <= 0) total = list.length;
    var done = 0;

    try {
      for (var j = 0; j < list.length; j++) {
        if (signal && signal.aborted) throw abortErr();
        var item = list[j];
        var rel = String(item.relPath || (item.file && item.file.name) || ('file-' + j));
        var clean = H.sanitizeZipPath(rel);
        if (!clean.ok) {
          // Flatten unsafe paths to basename only
          rel = H.sanitizeZipPath((item.file && item.file.name) || ('file-' + j)).path || ('file-' + j);
          clean = H.sanitizeZipPath(rel);
          if (!clean.ok) rel = 'file-' + j;
          else rel = clean.path;
        } else {
          rel = clean.path;
        }
        var addOpts = {
          onprogress: function (progress, size) {
            if (opts.onProgress) {
              var base = done;
              opts.onProgress(base + progress, total);
            }
          }
        };
        if (password) {
          addOpts.password = password;
          addOpts.encryptionStrength = 3; // AES-256
        }
        await zipWriter.add(rel, new z.BlobReader(item.file), addOpts);
        done += Number(item.file && item.file.size) || 0;
        if (opts.onProgress) opts.onProgress(Math.min(done, total), total);
      }
      if (signal && signal.aborted) throw abortErr();
      var blob = await zipWriter.close();
      if (opts.onProgress) opts.onProgress(total, total);
      return blob;
    } catch (err) {
      try { await zipWriter.close(); } catch (e) { /* ignore */ }
      throw err;
    }
  }

  function abortErr() {
    var e = new Error('Cancelled');
    e.name = 'AbortError';
    return e;
  }

  /**
   * Collect File objects from a DataTransfer or <input type=file>.
   * Prefer webkitRelativePath for folder picks.
   */
  function filesFromList(fileList) {
    var out = [];
    var list = fileList || [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (!f) continue;
      var rel = f.webkitRelativePath || f.name;
      out.push({ id: H.newId(), relPath: rel, file: f, size: f.size || 0, name: f.name });
    }
    return out;
  }

  root.ZPMake = {
    createZip: createZip,
    filesFromList: filesFromList
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
