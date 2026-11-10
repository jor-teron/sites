/* ============================================================
   FILE: modules/draftly-vendor.js
   PROJECT: Draftly
   ROLE: HO2 — load the big export libraries on first use.
         Same local files as the old <script> tags in draftly.html
         (vendor/jspdf.umd.min.js, vendor/html2canvas.min.js,
         vendor/html-docx.js). Nothing is fetched from a CDN.
   (before HO2) those three files were script tags on every page open.
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.vendor = {
  pending: {},
  /* src is relative to draftly.html, same as the old script tags. */
  load: function (src) {
    var V = Draftly.vendor;
    if (V.pending[src]) return V.pending[src];
    V.pending[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () { resolve(); };
      s.onerror = function () {
        delete V.pending[src];
        reject(new Error('Could not load ' + src));
      };
      document.head.appendChild(s);
    });
    return V.pending[src];
  },
  ensurePdf: function () {
    return Promise.all([
      this.load('vendor/jspdf.umd.min.js'),
      this.load('vendor/html2canvas.min.js')
    ]);
  },
  ensureDocx: function () {
    return this.load('vendor/html-docx.js');
  }
};
