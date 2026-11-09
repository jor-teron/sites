/* PDF Viewer — pv_main.js: wire modules together. PV1 */
(function () {
  'use strict';

  // Point pdf.js worker at the vendored classic build (no CDN).
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
  }

  var els = {
    fileInput: document.getElementById('file-input'),
    openLabel: document.getElementById('open-label'),
    controls: document.getElementById('controls'),
    meta: document.getElementById('toolbar-meta'),
    prevBtn: document.getElementById('prev-btn'),
    nextBtn: document.getElementById('next-btn'),
    pageInput: document.getElementById('page-input'),
    pageCount: document.getElementById('page-count'),
    zoomOutBtn: document.getElementById('zoom-out-btn'),
    zoomInBtn: document.getElementById('zoom-in-btn'),
    zoomLabel: document.getElementById('zoom-label'),
    fitBtn: document.getElementById('fit-btn'),
    printBtn: document.getElementById('print-btn'),
    viewer: document.getElementById('viewer'),
    pages: document.getElementById('pages'),
    empty: document.getElementById('empty'),
    overlay: document.getElementById('drop-overlay'),
    status: document.getElementById('status'),
    printRoot: document.getElementById('print-root')
  };

  var ui = PVUi.createUi({ els: els });

  var renderer = PVRender.createRenderer({
    viewer: els.viewer,
    pagesEl: els.pages,
    onPageChange: function (cur, total) {
      ui.updatePage(cur, total);
    },
    onStatus: function (msg, kind) {
      ui.setStatus(msg, kind);
    }
  });
  ui.setRenderer(renderer);
  ui.setEmpty(true);

  var opening = false;

  async function handleFile(file) {
    if (!file || opening) return;
    opening = true;
    ui.setStatus('Opening…', 'busy');
    try {
      var opened = await PVLoad.openPdfFile(file);
      await renderer.loadDocument(opened.doc);
      ui.onDocReady(opened.name, opened.numPages);
      ui.updateZoom();
    } catch (e) {
      console.error(e);
      var msg = 'Could not open this file.';
      if (e && e.code === 'NOT_PDF') msg = 'That does not look like a PDF.';
      else if (e && e.code === 'PASSWORD') msg = 'Password required — open cancelled.';
      else if (e && e.message) msg = e.message;
      ui.setStatus(msg, 'error');
      if (!renderer.getDoc()) ui.setEmpty(true);
    } finally {
      opening = false;
    }
  }

  PVLoad.bindOpeners({
    fileInput: els.fileInput,
    overlay: els.overlay,
    onFile: handleFile
  });

  if (els.printBtn) {
    els.printBtn.addEventListener('click', function () {
      var doc = renderer.getDoc();
      if (!doc) {
        ui.setStatus('Open a PDF first', 'error');
        return;
      }
      PVPrint.printDocument({
        doc: doc,
        printRoot: els.printRoot,
        onStatus: function (m, k) { ui.setStatus(m, k); }
      });
    });
  }
})();
