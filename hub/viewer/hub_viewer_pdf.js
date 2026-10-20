/**
 * Hub — PDF glue for the received-file viewer (hub_viewer.js).
 * Loads Mozilla pdf.js once from shared/vendor/pdfjs/ and paints every page into
 * stacked <canvas> elements inside a scroll host. Returns a handle with clear().
 */
(function () {
  'use strict';
  let ready = null;

  function loadLib() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (ready) return ready;
    ready = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'shared/vendor/pdfjs/pdf.min.js';
      s.onload = () => {
        try {
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'shared/vendor/pdfjs/pdf.worker.min.js';
          resolve(pdfjsLib);
        } catch (e) { reject(e); }
      };
      s.onerror = () => reject(new Error('pdf.js failed to load'));
      document.head.appendChild(s);
    });
    return ready;
  }

  /** Render every page of pdfUrl into host. Returns { clear() }. */
  async function render(host, pdfUrl) {
    const lib = await loadLib();
    const task = lib.getDocument({ url: pdfUrl, withCredentials: false });
    const pdf = await task.promise;
    const canvases = [];
    const maxW = Math.floor(host.clientWidth || window.innerWidth * 0.8);
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(2, maxW / base.width);
      const vp = page.getViewport({ scale: scale });
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.style.width = '100%';
      c.style.height = 'auto';
      c.style.display = 'block';
      c.style.margin = '0 0 12px';
      host.appendChild(c);
      canvases.push(c);
      await page.render({ canvasContext: c.getContext('2d', { alpha: false }), viewport: vp }).promise;
    }
    return {
      clear() {
        try { pdf.destroy(); } catch (_) { /* ignore */ }
        canvases.forEach((c) => c.remove());
      },
    };
  }

  window.HubViewerPdf = { render: render };
})();
