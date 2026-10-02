/* ============================================================
   FILE: modules/draftly-export.js
   PROJECT: draftly
   ROLE: DOCX download and print / PDF via the browser dialog.
   DEPENDS: Draftly.config, Draftly.pages, Draftly.ui, htmlDocx
   ISOLATION: DOCX failure shows a toast and does not throw
              out to the click handler.
   ============================================================ */

/* Shared namespace. */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

/* Export helpers. */
Draftly.export = {};

/* Join every page into one HTML string, with a break between pages. */
Draftly.export.combinedHtml = function combinedHtml() {
  var cfg = Draftly.config;
  var papers = document.querySelectorAll('.paper');
  var combinedHTML = '';
  var i;
  var ed;
  var clone;
  for (i = 0; i < papers.length; i++) {
    ed = papers[i].querySelector('.' + cfg.editorClass);
    if (!ed) continue;
    clone = ed.cloneNode(true);
    clone.classList.remove(cfg.nonPrintClass);
    if (Draftly.editor) Draftly.editor.stripMarks(clone);
    combinedHTML += clone.innerHTML;
    if (i < papers.length - 1) combinedHTML += cfg.pageBreakHtml;
  }
  return combinedHTML;
};

/* Inject a print stylesheet that matches the current orientation. */
Draftly.export.setupPrintStyles = function setupPrintStyles() {
  var cfg = Draftly.config;
  var existing = document.getElementById(cfg.printStyleId);
  if (existing) existing.remove();

  var isLandscape = document.body.classList.contains(cfg.landscapeClass);
  var printStyle = document.createElement('style');
  printStyle.id = cfg.printStyleId;
  printStyle.textContent =
    '@page { size: ' + cfg.pageSizeName + ' ' + (isLandscape ? 'landscape' : 'portrait') + ';' +
    ' margin: ' + cfg.marginTopCm + 'cm ' + cfg.marginRightCm + 'cm; }' +
    '@media print {' +
    ' body { background: #fff !important; overflow: visible !important; height: auto !important; }' +
    ' .toolbar, .status-bar, .toast { display: none !important; }' +
    ' .workspace { overflow: visible !important; padding: 0 !important; background: #fff !important; display: block !important; }' +
    ' .paper { box-shadow: none !important; border-radius: 0 !important; margin: 0 !important; padding: ' +
    cfg.marginTopCm + 'cm ' + cfg.marginRightCm + 'cm !important; width: auto !important; min-height: auto !important; background: #fff !important; page-break-after: always; }' +
    ' .paper:last-child { page-break-after: auto; }' +
    ' .paper .page-number { display: none !important; }' +
    ' .editor { color: #000 !important; min-height: auto !important; }' +
    ' .editor.show-nonprinting p::after, .editor.show-nonprinting br::after { display: none !important; content: none !important; }' +
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

/* Open the print dialog. Used for Print and PDF. */
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
    'p { margin: 0 0 0.5em 0; }' +
    '</style></head><body>' + Draftly.export.combinedHtml() + '</body></html>';

  try {
    if (typeof htmlDocx === 'undefined') throw new Error('html-docx-js missing');
    var blob = htmlDocx.asBlob(fullHtml, {
      orientation: isLandscape ? 'landscape' : 'portrait',
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
