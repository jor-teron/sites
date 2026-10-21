/* ============================================================
   FILE: modules/draftly-export.js
   PROJECT: Draftly
   ROLE: DOCX download (offline, vendor/html-docx.js) and Print dialog.
         PDF download lives in draftly-pdf.js.
   DEPENDS: Draftly.config, Draftly.pages, Draftly.ui, htmlDocx
   ISOLATION: DOCX failure shows a toast and does not throw
              out to the click handler.
   ============================================================ */

/* Shared namespace. */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

/* Export helpers. */
Draftly.export = {};

/* Whole document as one HTML string: continuation pieces re-joined, no marks.
   No forced page breaks: Word re-paginates with the same page size and margins. */
Draftly.export.combinedHtml = function combinedHtml() {
  return Draftly.flow.joinedHtml();
};

/* Word-HTML for DOCX: page-break markers become Word's page-break <br>. */
Draftly.export.docxHtml = function docxHtml() {
  var holder = document.createElement('div');
  holder.innerHTML = Draftly.export.combinedHtml();
  var pbs = holder.querySelectorAll('.dr-pagebreak');
  for (var i = 0; i < pbs.length; i++) {
    var br = document.createElement('br');
    br.setAttribute('clear', 'all');
    br.setAttribute('style', 'page-break-before:always');
    pbs[i].parentNode.replaceChild(br, pbs[i]);
  }
  return holder.innerHTML;
};

/* Inject a print stylesheet that matches the current orientation. */
Draftly.export.setupPrintStyles = function setupPrintStyles() {
  var cfg = Draftly.config;
  var existing = document.getElementById(cfg.printStyleId);
  if (existing) existing.remove();

  var isLandscape = document.body.classList.contains(cfg.landscapeClass);
  var printStyle = document.createElement('style');
  printStyle.id = cfg.printStyleId;
  var w = (isLandscape ? cfg.paperHeightCm : cfg.paperWidthCm) + 'cm';
  var h = (isLandscape ? cfg.paperWidthCm : cfg.paperHeightCm) + 'cm';
  /* Each paper card is printed as one sheet of the chosen size, exactly as on screen. */
  printStyle.textContent =
    '@page { size: ' + cfg.pageSizeName + ' ' + (isLandscape ? 'landscape' : 'portrait') + '; margin: 0; }' +
    '@media print {' +
    ' body { background: #fff !important; overflow: visible !important; height: auto !important; }' +
    ' .toolbar, .toast, .np-layer, .status-bar, .find-bar { display: none !important; }' +
    ' .workspace { overflow: visible !important; padding: 0 !important; background: #fff !important; display: block !important; }' +
    ' .pages-scaler { width: auto !important; height: auto !important; }' +
    ' .pages { transform: none !important; width: auto !important; gap: 0 !important; }' +
    ' .pop-menu { display: none !important; }' +
    ' .paper { box-shadow: none !important; border-radius: 0 !important; margin: 0 !important;' +
    ' width: ' + w + ' !important; height: ' + h + ' !important; min-height: 0 !important;' +
    ' padding: ' + cfg.marginTopCm + 'cm ' + cfg.marginRightCm + 'cm ' + cfg.marginBottomCm + 'cm ' + cfg.marginLeftCm + 'cm !important;' +
    ' overflow: hidden !important; background: #fff !important; page-break-after: always; break-after: page; }' +
    ' .paper:last-child { page-break-after: auto; break-after: auto; }' +
    ' body:not(.pn-on) .paper .page-number { display: none !important; }' +
    ' body.pn-on .paper .page-number { color: #000 !important; }' +
    ' .editor .dr-pagebreak { visibility: hidden !important; }' +
    ' .editor { color: #000 !important; }' +
    '}';
  document.head.appendChild(printStyle);
  return printStyle;
};

/* Remove the injected print stylesheet and restore the caret. */
Draftly.export.cleanupPrintStyles = function cleanupPrintStyles() {
  var node = document.getElementById(Draftly.config.printStyleId);
  if (node) node.remove();
  if (Draftly.editor) Draftly.editor.restoreSelection();
};

/* Open the print dialog (Print button only). */
/* Browser menu print (not Ctrl+P / button) still gets the right sheet. */
window.addEventListener('beforeprint', function () {
  if (!document.getElementById(Draftly.config.printStyleId)) {
    Draftly.export.setupPrintStyles();
    var done = function () { Draftly.export.cleanupPrintStyles(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
  }
});

Draftly.export.printDocument = function printDocument() {
  if (Draftly.editor) Draftly.editor.saveSelection();
  Draftly.export.setupPrintStyles();
  window.print();
  var cleanup = function () {
    Draftly.export.cleanupPrintStyles();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(function () {
    if (document.getElementById(Draftly.config.printStyleId)) cleanup();
  }, Draftly.config.printCleanupMs);
};

/* Build a DOCX blob from the joined HTML and download it. */
Draftly.export.exportDocx = function exportDocx() {
  var cfg = Draftly.config;
  if (Draftly.editor) Draftly.editor.saveSelection();

  var isLandscape = document.body.classList.contains(cfg.landscapeClass);
  var fullHtml =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    '@page { size: ' + cfg.pageSizeName + ' ' + (isLandscape ? 'landscape' : 'portrait') + ';' +
    ' margin: ' + cfg.marginTopCm + 'cm ' + cfg.marginRightCm + 'cm; }' +
    'body { font-family: ' + cfg.fontFamily + '; font-size: ' + cfg.fontSizePt + 'pt; line-height: ' + cfg.lineHeight + '; }' +
    'p { margin: 0 0 ' + cfg.paragraphSpacingPt + 'pt 0; }' +
    '</style></head><body>' + Draftly.export.docxHtml() + '</body></html>';

  try {
    if (typeof htmlDocx === 'undefined') throw new Error('html-docx-js missing');
    var blob = htmlDocx.asBlob(fullHtml, {
      orientation: isLandscape ? 'landscape' : 'portrait',
      pageSize: {
        width: (cfg.paperSizes[cfg.paperSize] || cfg.paperSizes.A4).docxW,
        height: (cfg.paperSizes[cfg.paperSize] || cfg.paperSizes.A4).docxH
      },
      margins: {
        top: cfg.docxMarginTop,
        right: cfg.docxMarginRight,
        bottom: cfg.docxMarginBottom,
        left: cfg.docxMarginLeft
      }
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (Draftly.storage && Draftly.storage.currentName()) || cfg.docxFileName.replace(/\.docx$/, '');
    if (a.download.indexOf('.docx') !== a.download.length - 5) a.download += '.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, cfg.docxUrlRevokeMs);
    if (Draftly.ui) Draftly.ui.showToast('DOCX exported successfully');
  } catch (e) {
    if (Draftly.ui) Draftly.ui.showToast('Failed to export DOCX');
  }
  if (Draftly.editor) Draftly.editor.restoreSelection();
};

/* File menu: Print / Export DOCX / Export PDF, and Ctrl+P. */
Draftly.export.bind = function bind() {
  Draftly.ui.onClick('printBtn', function () { Draftly.export.printDocument(); });
  Draftly.ui.onClick('exportDocxBtn', function () { Draftly.export.exportDocx(); });
  Draftly.ui.onClick('exportPdfBtn', function () { Draftly.pdf.download(); });
  document.addEventListener('keydown', function (e) {
    if (!((e.ctrlKey || e.metaKey) && !e.altKey)) return;   /* Ctrl or Cmd */
    if (e.key.toLowerCase() !== 'p' || e.shiftKey) return;
    e.preventDefault();
    Draftly.export.printDocument();
  });
};
