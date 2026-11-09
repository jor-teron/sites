/* PDF Viewer — pv_print.js: render all pages to images and print. PV1 */
(function (root) {
  'use strict';

  var H = root.PVHelpers;

  /**
   * Print the whole PDF. Renders each page to a PNG in #print-root at a
   * moderate scale, then calls window.print(). Cleans up afterward.
   */
  async function printDocument(opts) {
    var doc = opts.doc;
    var printRoot = opts.printRoot;
    var onStatus = opts.onStatus || function () {};
    var scale = opts.scale == null ? 1.25 : opts.scale;

    if (!doc) {
      onStatus('Nothing to print', 'error');
      return;
    }

    var n = doc.numPages;
    if (n > H.PRINT_PAGE_WARN) {
      var ok = root.confirm(
        'This PDF has ' + n + ' pages. Printing may be slow or use a lot of memory. Continue?'
      );
      if (!ok) {
        onStatus('Print cancelled');
        return;
      }
    }

    onStatus('Preparing print…', 'busy');
    printRoot.innerHTML = '';
    printRoot.style.display = 'block';

    try {
      for (var i = 1; i <= n; i++) {
        onStatus('Preparing print… page ' + i + ' / ' + n, 'busy');
        var page = await doc.getPage(i);
        var viewport = page.getViewport({ scale: scale });
        var canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        var ctx = canvas.getContext('2d', { alpha: false });
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        var img = document.createElement('img');
        img.src = canvas.toDataURL('image/jpeg', 0.85);
        img.alt = 'Page ' + i;
        printRoot.appendChild(img);
        // Free canvas bitmap promptly.
        canvas.width = 0;
        canvas.height = 0;
      }

      // Let the browser lay out images before printing.
      await new Promise(function (r) { setTimeout(r, 50); });
      root.print();
      onStatus('Print dialog opened');
    } catch (e) {
      console.error(e);
      onStatus('Print failed: ' + ((e && e.message) || e), 'error');
    } finally {
      // Cleanup after print dialog returns (or on failure).
      setTimeout(function () {
        printRoot.innerHTML = '';
        printRoot.style.display = 'none';
      }, 500);
    }
  }

  root.PVPrint = { printDocument: printDocument };
})(typeof globalThis !== 'undefined' ? globalThis : this);
