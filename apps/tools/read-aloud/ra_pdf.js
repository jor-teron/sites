/* Read Aloud RA2 -- ra_pdf.js: lazy-load Mozilla pdf.js from shared/vendor/pdfjs
   (3.11.174 legacy UMD, Apache-2.0; same copy pdf-tools uses) and extract text per page.
   The library is loaded only when a PDF is opened. */
var RAPdf = (function () {
  var SRC = '../../../shared/vendor/pdfjs/pdf.min.js';
  var WORKER = '../../../shared/vendor/pdfjs/pdf.worker.min.js';
  var loadP = null;
  var MIN_WORDS = 20;

  function absUrl(rel) {
    try { return new URL(rel, location.href).href; } catch (e) { return rel; }
  }

  function load() {
    if (typeof window !== 'undefined' && window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (loadP) return loadP;
    loadP = new Promise(function (resolve, reject) {
      if (typeof document === 'undefined') { reject(new Error('no-dom')); return; }
      var s = document.createElement('script');
      s.src = SRC;
      s.async = true;
      s.onload = function () {
        if (!window.pdfjsLib) { loadP = null; reject(new Error('missing')); return; }
        try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = absUrl(WORKER); } catch (e) {}
        resolve(window.pdfjsLib);
      };
      s.onerror = function () { loadP = null; reject(new Error('load')); };
      (document.head || document.documentElement).appendChild(s);
    });
    return loadP;
  }

  function pageText(content) {
    var out = '', lastY = null;
    (content && content.items || []).forEach(function (it) {
      var s = it.str || '';
      var y = it.transform ? it.transform[5] : null;
      if (lastY != null && y != null && Math.abs(y - lastY) > 2) out += '\n';
      else if (out && !/\s$/.test(out) && s && !/^\s/.test(s)) out += ' ';
      out += s;
      if (y != null) lastY = y;
    });
    return out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  function extract(data) {
    return load().then(function (lib) {
      return lib.getDocument({ data: data, isEvalSupported: false, disableAutoFetch: true, disableStream: false }).promise;
    }).then(function (pdf) {
      var n = pdf.numPages || 0, i = 1, pages = [];
      function next() {
        if (i > n) {
          var all = pages.map(function (p) { return p.text; }).join('\n');
          var words = 0;
          all.trim().split(/\s+/).forEach(function (w) { if (w) words++; });
          return { pages: pages, pageCount: n, words: words, empty: words < MIN_WORDS };
        }
        var num = i++;
        return pdf.getPage(num).then(function (page) {
          return page.getTextContent().then(function (c) {
            pages.push({ page: num, text: pageText(c) });
            return next();
          });
        });
      }
      return next();
    });
  }

  function errorMessage(err) {
    var code = err && (err.name || err.message) ? String(err.name || err.message) : '';
    if (/Password|password/i.test(code) || (err && err.name === 'PasswordException')) {
      return 'This PDF is password protected, so its text cannot be read here.';
    }
    if (code === 'load' || code === 'missing') {
      return 'Could not load the PDF reader. Check that the Hub files are complete (shared/vendor/pdfjs).';
    }
    return 'This PDF could not be opened. It may be damaged, or your browser may have blocked it.';
  }

  function emptyMessage() {
    return 'This PDF has no readable text layer (it may be a scan of a printed page). Read Aloud cannot use OCR here. You can try the OCR app in Office to recognise the words, then paste them on the Text tab.';
  }

  return { load: load, extract: extract, pageText: pageText, errorMessage: errorMessage, emptyMessage: emptyMessage, MIN_WORDS: MIN_WORDS, SRC: SRC, WORKER: WORKER };
})();
