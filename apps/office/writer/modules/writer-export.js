/* ============================================================
   FILE: modules/writer-export.js
   DF25: was modules/draftly-export.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: DOCX download (offline; real DOCX from writer-docxgen.js, html-docx as fallback) and Print dialog.
         PDF download lives in writer-pdf.js.
   DEPENDS: Writer.config, Writer.pages, Writer.ui, Writer.docxgen, htmlDocx (fallback)
   ISOLATION: DOCX failure shows a toast and does not throw
              out to the click handler.
   ============================================================ */

/* Shared namespace. */
/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

/* Export helpers. */
Writer.export = {};

/* Whole document as one HTML string: continuation pieces re-joined, no marks.
   No forced page breaks: Word re-paginates with the same page size and margins. */
Writer.export.combinedHtml = function combinedHtml() {
  return Writer.flow.joinedHtml();
};

/* Word-HTML for DOCX: page-break markers become Word's page-break <br>.
   html: optional, other document HTML instead of the open document (mail merge). */
Writer.export.docxHtml = function docxHtml(html) {
  var holder = document.createElement('div');
  holder.innerHTML = html != null ? html : Writer.export.combinedHtml();
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
Writer.export.setupPrintStyles = function setupPrintStyles() {
  var cfg = Writer.config;
  var existing = document.getElementById(cfg.printStyleId);
  if (existing) existing.remove();

  var isLandscape = document.body.classList.contains(cfg.landscapeClass);
  var printStyle = document.createElement('style');
  printStyle.id = cfg.printStyleId;
  var w = (isLandscape ? cfg.paperHeightCm : cfg.paperWidthCm) + 'cm';
  var h = (isLandscape ? cfg.paperWidthCm : cfg.paperHeightCm) + 'cm';
  /* Each paper card is printed as one sheet of the chosen size, exactly as on screen. */
  printStyle.textContent =
    OfficePage.pageRule({ paper: cfg.paperSize, orientation: isLandscape ? 'landscape' : 'portrait', margins: '0' }) +
    '@media print {' +
    ' body { background: #fff !important; overflow: visible !important; height: auto !important; }' +
    ' .toolbar, .of-notes, .np-layer, .status-bar, .find-bar { display: none !important; }' +
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
Writer.export.cleanupPrintStyles = function cleanupPrintStyles() {
  var node = document.getElementById(Writer.config.printStyleId);
  if (node) node.remove();
  if (Writer.editor) Writer.editor.restoreSelection();
};

/* Open the print dialog (Print button only). */
/* Browser menu print (not Ctrl+P / button) still gets the right sheet. */
window.addEventListener('beforeprint', function () {
  if (!document.getElementById(Writer.config.printStyleId)) {
    Writer.export.setupPrintStyles();
    var done = function () { Writer.export.cleanupPrintStyles(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
  }
});

Writer.export.printDocument = function printDocument() {
  if (Writer.editor) Writer.editor.saveSelection();
  Writer.export.setupPrintStyles();
  window.print();
  var cleanup = function () {
    Writer.export.cleanupPrintStyles();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  setTimeout(function () {
    if (document.getElementById(Writer.config.printStyleId)) cleanup();
  }, Writer.config.printCleanupMs);
};

/* Word header / footer part for one row of slots, or '' when empty.
   Left / centre / right use a centre and a right tab stop; {page} and
   {pages} become PAGE / NUMPAGES fields; {date} is today's date. */
Writer.export.hfXml = function hfXml(part, isLandscape, data) {
  var cfg = Writer.config;
  if (!Writer.hf) return '';
  var slots = (data || Writer.hf.data)[part];   /* data: other header / footer text (mail merge) */
  if (!slots.join('').trim()) return '';
  var ps = cfg.paperSizes[cfg.paperSize] || cfg.paperSizes.A4;
  var pageW = isLandscape ? ps.docxH : ps.docxW;
  var textW = pageW - cfg.docxMarginLeft - cfg.docxMarginRight;
  var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var rpr = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="20"/></w:rPr>';
  var run = function (t) { return '<w:r>' + rpr + '<w:t xml:space="preserve">' + esc(t) + '</w:t></w:r>'; };
  var field = function (instr, shown) { return '<w:fldSimple w:instr="' + instr + '"><w:r>' + rpr + '<w:t>' + shown + '</w:t></w:r></w:fldSimple>'; };
  var runs = slots.map(function (t, k) {
    var out = k ? '<w:r>' + rpr + '<w:tab/></w:r>' : '';
    String(t).replace(/\{date\}/g, Writer.hf.today()).split(/(\{page\}|\{pages\})/).forEach(function (bit) {
      if (bit === '{page}') out += field('PAGE', '1');
      else if (bit === '{pages}') out += field('NUMPAGES', '1');
      else if (bit) out += run(bit);
    });
    return out;
  }).join('');
  var tag = part === 'head' ? 'hdr' : 'ftr';
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:' + tag + ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<w:p><w:pPr><w:tabs><w:tab w:val="center" w:pos="' + Math.round(textW / 2) + '"/><w:tab w:val="right" w:pos="' + textW + '"/></w:tabs>' +
    '<w:spacing w:before="0" w:after="0"/></w:pPr>' + runs + '</w:p></w:' + tag + '>';
};

/* DOCX Blob from body HTML (what docxHtml() returns). hfData: optional {head, foot} slots
   instead of the open document's header / footer (mail merge).
   MM6: real WordprocessingML via writer-docxgen.js (the text is in word/document.xml, so Word,
   LibreOffice and viewers all show it). html-docx (the old altChunk file) is only a fallback
   if the conversion throws. Throws if both fail. */
Writer.export.makeDocxBlob = function makeDocxBlob(bodyHtml, hfData) {
  var cfg = Writer.config;
  var isLandscape = document.body.classList.contains(cfg.landscapeClass);
  var ps = cfg.paperSizes[cfg.paperSize] || cfg.paperSizes.A4;
  var margins = {
    top: cfg.docxMarginTop,
    right: cfg.docxMarginRight,
    bottom: cfg.docxMarginBottom,
    left: cfg.docxMarginLeft,
    header: Math.round(cfg.marginTopCm * 0.4 * 567),
    footer: Math.round(cfg.marginBottomCm * 0.4 * 567)
  };
  var headerXml = Writer.export.hfXml('head', isLandscape, hfData);
  var footerXml = Writer.export.hfXml('foot', isLandscape, hfData);

  if (Writer.docxgen) {
    try {
      return Writer.docxgen.build(bodyHtml, {
        landscape: isLandscape, pageW: ps.docxW, pageH: ps.docxH, margins: margins,
        headerXml: headerXml, footerXml: footerXml,
        defaults: { font: cfg.fontCommandName, sizePt: cfg.fontSizePt, lineHeight: cfg.lineHeight, paraAfterPt: cfg.paragraphSpacingPt }
      });
    } catch (e) {
      console.warn('writer docx: real DOCX build failed, using the html-docx fallback', e);
    }
  }

  var fullHtml =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    OfficePage.pageRule({ paper: cfg.paperSize, orientation: isLandscape ? 'landscape' : 'portrait',
      margins: cfg.marginTopCm + 'cm ' + cfg.marginRightCm + 'cm' }) +
    'body { font-family: ' + cfg.fontFamily + '; font-size: ' + cfg.fontSizePt + 'pt; line-height: ' + cfg.lineHeight + '; }' +
    'p { margin: 0 0 ' + cfg.paragraphSpacingPt + 'pt 0; }' +
    '</style></head><body>' + bodyHtml + '</body></html>';
  if (typeof htmlDocx === 'undefined') throw new Error('html-docx-js missing');
  return htmlDocx.asBlob(fullHtml, {
    orientation: isLandscape ? 'landscape' : 'portrait',
    pageSize: { width: ps.docxW, height: ps.docxH },
    margins: margins,
    headerXml: headerXml,
    footerXml: footerXml
  });
};

/* Try fn(). If the html-docx fallback is missing, load vendor/html-docx.js and try once more.
   The real DOCX writer (writer-docxgen.js) does not need that file. */
Writer.export.withDocx = function withDocx(fn) {
  function once() { return fn(); }
  try {
    return Promise.resolve(once());
  } catch (e) {
    /* (before HO2) html-docx.js was already loaded, so this throw did not happen on a normal export. */
    if (typeof htmlDocx !== 'undefined' || !Writer.vendor || !/html-docx-js missing/.test(String(e && e.message || ''))) {
      return Promise.reject(e);
    }
    return Writer.vendor.ensureDocx().then(once);
  }
};

/* Build a DOCX blob from the joined HTML and download it. */
Writer.export.exportDocx = function exportDocx() {
  var cfg = Writer.config;
  if (Writer.editor) Writer.editor.saveSelection();

  /* (before HO2) the try/catch called makeDocxBlob directly (html-docx already on the page). */
  Writer.export.withDocx(function () {
    return Writer.export.makeDocxBlob(Writer.export.docxHtml());
  }).then(function (blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (Writer.storage && Writer.storage.currentName()) || cfg.docxFileName.replace(/\.docx$/, '');
    if (a.download.indexOf('.docx') !== a.download.length - 5) a.download += '.docx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, cfg.docxUrlRevokeMs);
    if (Writer.ui) Writer.ui.showToast('DOCX exported successfully');
  }).catch(function () {
    if (Writer.ui) Writer.ui.showToast('Failed to export DOCX');
  }).then(function () {
    if (Writer.editor) Writer.editor.restoreSelection();
  });
};

/* File menu: Print / Export DOCX / Export PDF, and Ctrl+P. */
Writer.export.bind = function bind() {
  Writer.ui.onClick('printBtn', function () { Writer.export.printDocument(); });
  Writer.ui.onClick('exportDocxBtn', function () { Writer.export.exportDocx(); });
  /* Legacy (before MM4): image PDF only.
  Draftly.ui.onClick('exportPdfBtn', function () { Draftly.pdf.download(); }); */
  Writer.ui.onClick('exportPdfBtn', function () { if (Writer.pdfgen) Writer.pdfgen.exportDocument(); else Writer.pdf.download(); });   /* MM4 / DF14 real-text PDF */
  /* HO1: Ctrl/Cmd+P goes through ../shared/office-quick.js (same printDocument). */
};
