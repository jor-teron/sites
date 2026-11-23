/* ============================================================
   FILE: modules/writer-vendor.js
   DF25: was modules/draftly-vendor.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: HO2 + DW26 — load big export libraries and lazy UI/logic
         modules + stylesheets on first use.
         Same local files as the old <script> / <link> tags in
         writer.html. Nothing is fetched from a CDN or via fetch().
   (before HO2) the three vendor libs were script tags on every open.
   (before DW26) 21 non-core modules and 5 feature stylesheets were
                 also loaded upfront on every open.
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.vendor = {
  pending: {},
  pendingCss: {},
  LAZY_MODULES: [
    'modules/writer-export.js',
    'modules/writer-pdf.js',
    'modules/writer-pdfgen.js',
    'modules/writer-zip.js',
    'modules/writer-odtgen.js',
    'modules/writer-docxgen.js',
    'modules/writer-docxread.js',
    'modules/writer-odtread.js',
    'modules/writer-txt.js',
    'modules/writer-imgdrop.js',
    'modules/writer-docxopen.js',
    'modules/writer-csv.js',
    'modules/writer-numfmt.js',
    'modules/writer-xlsx.js',
    'modules/writer-hos.js',
    'modules/writer-merge.js',
    'modules/writer-merge-ui.js',
    'modules/writer-hfimg.js',
    'modules/writer-find.js',
    'modules/writer-writetext.js',
    'modules/writer-write.js'
  ],
  LAZY_CSS: [
    'ui/merge.css',
    '../shared/office-settings.css',
    'ui/find.css',
    'ui/write.css',
    'ui/margins.css'
  ],
  /* src is relative to writer.html, same as the old script tags. */
  load: function (src) {
    var V = Writer.vendor;
    if (V.pending[src]) return V.pending[src];
    if (typeof document === 'undefined' || !document.head) return Promise.resolve();
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
  /* DW26: load a feature stylesheet on demand (<link>, works on file:// too). */
  loadCss: function (href) {
    var V = Writer.vendor;
    if (V.pendingCss[href]) return V.pendingCss[href];
    if (typeof document === 'undefined' || !document.head) return Promise.resolve();
    if (document.querySelector) {
      var existing = document.querySelector('link[rel="stylesheet"][href="' + href + '"]');
      if (existing) {
        V.pendingCss[href] = Promise.resolve();
        return V.pendingCss[href];
      }
    }
    V.pendingCss[href] = new Promise(function (resolve, reject) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = href;
      l.onload = function () { resolve(); };
      l.onerror = function () {
        delete V.pendingCss[href];
        reject(new Error('Could not load ' + href));
      };
      document.head.appendChild(l);
    });
    return V.pendingCss[href];
  },
  loadAll: function (list) {
    var V = Writer.vendor;
    return Promise.all((list || []).map(function (src) { return V.load(src); }));
  },
  ensurePdf: function () {
    return Promise.all([
      this.load('vendor/jspdf.umd.min.js'),
      this.load('vendor/html2canvas.min.js')
    ]);
  },
  ensureDocx: function () {
    return this.load('vendor/html-docx.js');
  },
  ensureHfimg: function () {
    if (Writer.hfimg) return Promise.resolve();
    return this.load('modules/writer-hfimg.js');
  },
  ensureExport: function (kind) {
    var list = [];
    if (kind === 'docx') {
      if (!Writer.hfimg) list.push('modules/writer-hfimg.js');
      if (!Writer.zip) list.push('modules/writer-zip.js');
      if (!Writer.docxgen) list.push('modules/writer-docxgen.js');
    } else if (kind === 'odt') {
      if (!Writer.hfimg) list.push('modules/writer-hfimg.js');
      if (!Writer.zip) list.push('modules/writer-zip.js');
      if (!Writer.odtgen) list.push('modules/writer-odtgen.js');
    } else if (kind === 'pdf') {
      if (!Writer.hfimg) list.push('modules/writer-hfimg.js');
      if (!Writer.pdfgen) list.push('modules/writer-pdfgen.js');
      if (!Writer.pdf) list.push('modules/writer-pdf.js');
    } else if (kind !== 'menu' && kind !== 'print') {
      if (!Writer.hfimg) list.push('modules/writer-hfimg.js');
      if (!Writer.zip) list.push('modules/writer-zip.js');
      if (!Writer.odtgen) list.push('modules/writer-odtgen.js');
      if (!Writer.docxgen) list.push('modules/writer-docxgen.js');
      if (!Writer.pdfgen) list.push('modules/writer-pdfgen.js');
      if (!Writer.pdf) list.push('modules/writer-pdf.js');
    }
    if (!Writer.export) list.push('modules/writer-export.js');
    if (!list.length) return Promise.resolve();
    return this.loadAll(list);
  },
  ensureImport: function (kind) {
    var list = [];
    if (kind === 'docx') {
      if (!Writer.docxread) list.push('modules/writer-docxread.js');
    } else if (kind === 'odt') {
      if (!Writer.odtread) list.push('modules/writer-odtread.js');
    } else if (kind === 'txt') {
      if (!Writer.txt) list.push('modules/writer-txt.js');
    } else if (kind === 'img') {
      if (!Writer.hfimg) list.push('modules/writer-hfimg.js');
      if (!Writer.imgdrop) list.push('modules/writer-imgdrop.js');
    } else {
      if (!Writer.docxread) list.push('modules/writer-docxread.js');
      if (!Writer.odtread) list.push('modules/writer-odtread.js');
      if (!Writer.txt) list.push('modules/writer-txt.js');
      if (!Writer.hfimg) list.push('modules/writer-hfimg.js');
      if (!Writer.imgdrop) list.push('modules/writer-imgdrop.js');
    }
    if (!Writer.docxopen) list.push('modules/writer-docxopen.js');
    if (!list.length) return Promise.resolve();
    return this.loadAll(list);
  },
  ensureMerge: function () {
    var jobs = [this.loadCss('ui/merge.css')];
    if (!Writer.mergeUi) {
      jobs.push(this.loadAll([
        'modules/writer-csv.js',
        'modules/writer-numfmt.js',
        'modules/writer-xlsx.js',
        'modules/writer-hos.js',
        'modules/writer-merge.js',
        'modules/writer-merge-ui.js'
      ]));
    }
    return Promise.all(jobs);
  },
  ensureFind: function () {
    var jobs = [this.loadCss('ui/find.css')];
    if (!(Writer.find && Writer.find.show)) jobs.push(this.load('modules/writer-find.js'));
    return Promise.all(jobs);
  },
  ensureWrite: function () {
    var jobs = [this.loadCss('ui/write.css')];
    var list = [];
    if (!Writer.writeText) list.push('modules/writer-writetext.js');
    if (!Writer.write) list.push('modules/writer-write.js');
    if (list.length) jobs.push(this.loadAll(list));
    return Promise.all(jobs);
  },
  ensureMarginsCss: function () {
    return this.loadCss('ui/margins.css');
  },
  ensureSettingsCss: function () {
    return this.loadCss('../shared/office-settings.css');
  }
};
