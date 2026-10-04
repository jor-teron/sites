/* ============================================================
   FILE: modules/draftly-pdf.js
   PROJECT: draftly
   ROLE: Download a real .pdf (true A4, current orientation and
         margins), one PDF page per paper card.
   HOW: Each paper is rendered by html2canvas (vendor/) in a
        print-like state (light colours, no marks, no shadow)
        and placed full-page with jsPDF (vendor/). Pages are
        images, so text in the PDF is not selectable.
   DEPENDS: Draftly.config, Draftly.storage, Draftly.ui,
            window.jspdf, window.html2canvas
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.pdf = {};
Draftly.pdf.busy = false;

Draftly.pdf.fileName = function fileName() {
  var name = (Draftly.storage && Draftly.storage.currentName()) || Draftly.config.pdfFileName;
  name = String(name).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document';
  return /\.pdf$/i.test(name) ? name : name + '.pdf';
};

Draftly.pdf.download = function download() {
  var cfg = Draftly.config;
  if (Draftly.pdf.busy) return;
  if (typeof window.html2canvas !== 'function' || !window.jspdf || !window.jspdf.jsPDF) {
    if (Draftly.ui) Draftly.ui.showToast('PDF libraries missing');
    return;
  }
  Draftly.pdf.busy = true;
  if (Draftly.editor) Draftly.editor.saveSelection();
  if (Draftly.ui) Draftly.ui.showToast('Making PDF…');
  var landscape = document.body.classList.contains(cfg.landscapeClass);
  var w = landscape ? cfg.paperHeightCm * 10 : cfg.paperWidthCm * 10;   // mm
  var h = landscape ? cfg.paperWidthCm * 10 : cfg.paperHeightCm * 10;
  var doc = new window.jspdf.jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
  var papers = Array.prototype.slice.call(document.querySelectorAll('.paper'));
  var i = 0;

  function onclone(cloneDoc) {
    var b = cloneDoc.body;
    b.classList.remove(cfg.darkClass);
    var st = cloneDoc.createElement('style');
    st.textContent =
      '.np-layer{display:none!important}' +
      '.paper{box-shadow:none!important;border-radius:0!important;background:#fff!important;transition:none!important}' +
      '.editor{color:#000!important;caret-color:transparent!important}' +
      '.editor:empty:before{content:none!important}';
    cloneDoc.head.appendChild(st);
  }

  function next() {
    if (i >= papers.length) {
      try { doc.save(Draftly.pdf.fileName()); if (Draftly.ui) Draftly.ui.showToast('PDF downloaded'); }
      catch (e) { if (Draftly.ui) Draftly.ui.showToast('Could not save PDF'); }
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
      if (i > 0) doc.addPage('a4', landscape ? 'landscape' : 'portrait');
      doc.addImage(canvas.toDataURL('image/jpeg', cfg.pdfJpegQuality), 'JPEG', 0, 0, w, h, undefined, 'FAST');
      i++;
      next();
    }).catch(function (err) {
      console.warn('draftly: pdf page failed', err);
      if (Draftly.ui) Draftly.ui.showToast('Could not make PDF');
      done();
    });
  }
  function done() {
    Draftly.pdf.busy = false;
    if (Draftly.editor) Draftly.editor.restoreSelection();
  }
  next();
};
