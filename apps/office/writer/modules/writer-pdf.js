/* ============================================================
   FILE: modules/writer-pdf.js
   DF25: was modules/draftly-pdf.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Download a real .pdf (true A4 or Legal, current orientation and
         margins), one PDF page per paper card.
   HOW: Each paper is rendered by html2canvas (vendor/) in a
        print-like state (light colours, no marks, no shadow)
        and placed full-page with jsPDF (vendor/). Pages are
        images, so text in the PDF is not selectable.
   DEPENDS: Writer.config, Writer.storage, Writer.ui,
            window.jspdf, window.html2canvas
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.pdf = {};
Writer.pdf.busy = false;

Writer.pdf.fileName = function fileName() {
  var name = (Writer.storage && Writer.storage.currentName()) || Writer.config.pdfFileName;
  name = String(name).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document';
  return /\.pdf$/i.test(name) ? name : name + '.pdf';
};

Writer.pdf.download = function download() {
  var cfg = Writer.config;
  if (Writer.pdf.busy) return;
  /* (before HO2) if the libraries were missing the download returned immediately.
     They used to be script tags. HO2 loads them here, from the same vendor files. */
  Writer.pdf.busy = true;
  var ready = (Writer.vendor && Writer.vendor.ensurePdf) ? Writer.vendor.ensurePdf() : Promise.resolve();
  ready.then(function () {
  if (typeof window.html2canvas !== 'function' || !window.jspdf || !window.jspdf.jsPDF) {
    if (Writer.ui) Writer.ui.showToast('PDF libraries missing');
    Writer.pdf.busy = false;
    return;
  }
  if (Writer.editor) Writer.editor.saveSelection();
  if (Writer.ui) Writer.ui.showToast('Making PDF…');
  var landscape = document.body.classList.contains(cfg.landscapeClass);
  var w = landscape ? cfg.paperHeightCm * 10 : cfg.paperWidthCm * 10;   // mm
  var h = landscape ? cfg.paperWidthCm * 10 : cfg.paperHeightCm * 10;
  var doc = new window.jspdf.jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: [Math.min(w, h), Math.max(w, h)], compress: true });
  var papers = Array.prototype.slice.call(document.querySelectorAll('.paper'));
  var i = 0;

  function onclone(cloneDoc) {
    var b = cloneDoc.body;
    b.classList.remove(cfg.darkClass);
    var st = cloneDoc.createElement('style');
    st.textContent =
      '.np-layer{display:none!important}' +
      '#pages{transform:none!important}' +
      '.paper{box-shadow:none!important;border-radius:0!important;background:#fff!important;transition:none!important}' +
      '.editor{color:#000!important;caret-color:transparent!important}' +
      '.editor .dr-pagebreak{visibility:hidden!important}' +
      '.paper .page-number{color:#000!important}' +
      '.editor:empty:before{content:none!important}';
    cloneDoc.head.appendChild(st);
  }

  function next() {
    if (i >= papers.length) {
      try { doc.save(Writer.pdf.fileName()); if (Writer.ui) Writer.ui.showToast('PDF downloaded'); }
      catch (e) { if (Writer.ui) Writer.ui.showToast('Could not save PDF'); }
      done();
      return;
    }
    var paper = papers[i];
    window.html2canvas(paper, {
      scale: cfg.pdfScale,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      onclone: onclone
    }).then(function (canvas) {
      if (i > 0) doc.addPage([Math.min(w, h), Math.max(w, h)], landscape ? 'landscape' : 'portrait');
      doc.addImage(canvas.toDataURL('image/jpeg', cfg.pdfJpegQuality), 'JPEG', 0, 0, w, h, undefined, 'FAST');
      i++;
      next();
    }).catch(function (err) {
      console.warn('writer: pdf page failed', err);
      if (Writer.ui) Writer.ui.showToast('Could not make PDF');
      done();
    });
  }
  function done() {
    Writer.pdf.busy = false;
    if (Writer.editor) Writer.editor.restoreSelection();
  }
  next();
  }).catch(function () {
    if (Writer.ui) Writer.ui.showToast('PDF libraries missing');
    Writer.pdf.busy = false;
  });
};
