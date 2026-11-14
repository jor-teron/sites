/* PDF Viewer — pv_load.js: open from file input + window drag-and-drop. PV1 */
(function (root) {
  'use strict';

  var H = root.PVHelpers;

  function isPdfFile(file) {
    if (!file) return false;
    var name = (file.name || '').toLowerCase();
    return file.type === 'application/pdf' || name.endsWith('.pdf');
  }

  function readFileAsArrayBuffer(file) {
    return file.arrayBuffer();
  }

  /**
   * Open a File with pdf.js. Returns { doc, file, name, numPages }.
   * Uses prompt() when the PDF is password-protected.
   */
  async function openPdfFile(file) {
    if (!isPdfFile(file)) {
      var err = new Error('Not a PDF');
      err.code = 'NOT_PDF';
      throw err;
    }
    if (!root.pdfjsLib) {
      throw new Error('pdf.js is not loaded');
    }

    var data = await readFileAsArrayBuffer(file);
    var loadingTask = root.pdfjsLib.getDocument({
      data: data,
      // No cmaps vendored in PV1 — Latin PDFs are fine; CJK may need them later.
      password: undefined
    });

    // pdf.js calls this when a password is needed (and again on wrong password).
    loadingTask.onPassword = function (updatePassword, reason) {
      var msg =
        reason === 1 /* NEED_PASSWORD */
          ? 'This PDF is password-protected. Enter the password:'
          : 'Incorrect password. Try again:';
      var pw = root.prompt(msg, '');
      if (pw == null || pw === '') {
        // Cancel the load (pdf.js treats a thrown error as abort).
        throw new Error('Password cancelled');
      }
      updatePassword(pw);
    };

    try {
      var doc = await loadingTask.promise;
      return {
        doc: doc,
        file: file,
        name: file.name || 'document.pdf',
        numPages: doc.numPages
      };
    } catch (e) {
      var msg = (e && e.message) || String(e);
      var out = new Error(msg);
      if (/password/i.test(msg)) out.code = 'PASSWORD';
      else if (/Invalid PDF|Missing PDF|format/i.test(msg)) out.code = 'NOT_PDF';
      else out.code = 'OPEN_FAILED';
      throw out;
    }
  }

  /**
   * Wire file input + drag-and-drop. onFile(file) is called with a File.
   * overlayEl gets class "show" while dragging a file over the window.
   */
  function bindOpeners(opts) {
    var fileInput = opts.fileInput;
    var overlay = opts.overlay;
    var onFile = opts.onFile;
    var dragDepth = 0;

    function takeFile(file) {
      if (!file) return;
      onFile(file);
    }

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        takeFile(f);
        // Allow re-opening the same file later.
        fileInput.value = '';
      });
    }

    function hasFiles(e) {
      var dt = e.dataTransfer;
      if (!dt) return false;
      if (dt.types && (dt.types.indexOf
        ? dt.types.indexOf('Files') !== -1
        : [].indexOf.call(dt.types, 'Files') !== -1)) {
        return true;
      }
      return !!(dt.files && dt.files.length);
    }

    window.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth += 1;
      if (overlay) overlay.classList.add('show');
    });

    window.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });

    window.addEventListener('dragleave', function (e) {
      if (!hasFiles(e) && dragDepth === 0) return;
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0 && overlay) overlay.classList.remove('show');
    });

    window.addEventListener('drop', function (e) {
      e.preventDefault();
      dragDepth = 0;
      if (overlay) overlay.classList.remove('show');
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) takeFile(files[0]);
    });
  }

  root.PVLoad = {
    isPdfFile: isPdfFile,
    openPdfFile: openPdfFile,
    bindOpeners: bindOpeners,
    PRINT_PAGE_WARN: H.PRINT_PAGE_WARN
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
