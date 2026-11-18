/* ============================================================
   FILE: modules/writer-export.js
   DF25: was modules/draftly-export.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: DOCX download (offline; real DOCX from writer-docxgen.js, html-docx as fallback),
         ODT download (DW8, writer-odtgen.js) and Print dialog.
         DW11a: header / footer text and pictures go into both.
         PDF download lives in writer-pdf.js.
   DEPENDS: Writer.config, Writer.pages, Writer.ui, Writer.docxgen, Writer.odtgen, htmlDocx (fallback)
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

/* DW11a: header / footer pictures for export. One row (3 slots) of
   { bytes, ext, w, h } (w / h in mm, the DW11 size and margin-fit math of
   writer-hfimg.js) or null. data: other header / footer (mail merge); its
   pictures, or the open document's when it has none. Pictures that are not
   PNG / JPEG / GIF (e.g. a hand-made .webp) are skipped with one console note. */
Writer.export.hfPics = function hfPics(part, isLandscape, data) {
  var I = Writer.hfimg, D = Writer.docxgen, cfg = Writer.config, none = [null, null, null];
  if (!I || !D || !D.dataUrlBytes || !Writer.hf) return none;
  var img = (data && data.img) || (Writer.hf.data && Writer.hf.data.img);
  if (!I.hasAny(img)) return none;
  var row = I.normPics(img)[part];
  var ps = cfg.paperSizes[cfg.paperSize] || cfg.paperSizes.A4;
  var pageWmm = (isLandscape ? ps.heightCm : ps.widthCm) * 10;
  var colMm = (pageWmm - (cfg.marginLeftCm + cfg.marginRightCm) * 10) / 3;
  var margin = (part === 'head' ? cfg.marginTopCm : cfg.marginBottomCm) * 10;
  return row.map(function (pic) {
    if (!pic) return null;
    var bytes = D.dataUrlBytes(pic.src), info = bytes && D.sniffImage(bytes);
    if (!info || !info.w || !info.h || !/^(png|jpeg|gif)$/.test(info.ext)) {
      if (!Writer.export.warnedHfPic) { Writer.export.warnedHfPic = true; console.warn('writer: a header / footer picture is not PNG / JPEG / GIF and was left out of the export'); }
      return null;
    }
    var box = I.fit(info.w / info.h, pic.size, margin, colMm);
    return { bytes: bytes, ext: info.ext, w: box.w, h: box.h };
  });
};

/* DW11a: distance (mm) from the paper edge to a header / footer box that
   holds pictures (writer-hfimg.js boxTop, as in print and PDF), or null. */
Writer.export.hfEdgeMm = function hfEdgeMm(part, pics) {
  var I = Writer.hfimg, cfg = Writer.config, boxH = I ? I.TEXT_MM : 0, any = false;
  (pics || []).forEach(function (p) { if (p) { any = true; boxH = Math.max(boxH, p.h); } });
  if (!any || !I) return null;
  return I.boxTop((part === 'head' ? cfg.marginTopCm : cfg.marginBottomCm) * 10, boxH);
};

/* Word header / footer part for one row of slots, or '' when empty.
   Left / centre / right use a centre and a right tab stop; {page} and
   {pages} become PAGE / NUMPAGES fields; {date} is today's date.
   DW11a: hfPart also puts each slot's picture (inline drawing) before that
   slot's text and returns the pictures for word/_rels/header1.xml.rels:
   { xml, media: [{ id, bytes, ext }], edgeMm }. noPics: text only (the
   html-docx fallback). Without pictures the XML is exactly as before DW11a. */
Writer.export.hfXml = function hfXml(part, isLandscape, data) {
  return Writer.export.hfPart(part, isLandscape, data, true).xml;
};

Writer.export.hfPart = function hfPart(part, isLandscape, data, noPics) {
  var cfg = Writer.config;
  /* (before DW11a) if (!Writer.hf) return ''; */
  if (!Writer.hf) return { xml: '', media: [], edgeMm: null };
  var slots = (data || Writer.hf.data)[part];   /* data: other header / footer text (mail merge) */
  /* (before DW11a) if (Writer.hf.warnExport) Writer.hf.warnExport(); */
  var pics = noPics ? [null, null, null] : Writer.export.hfPics(part, isLandscape, data);
  var hasPic = !!(pics[0] || pics[1] || pics[2]);
  /* (before DW11a) if (!slots.join('').trim()) return ''; */
  if (!slots.join('').trim() && !hasPic) return { xml: '', media: [], edgeMm: null };
  var ps = cfg.paperSizes[cfg.paperSize] || cfg.paperSizes.A4;
  var pageW = isLandscape ? ps.docxH : ps.docxW;
  var textW = pageW - cfg.docxMarginLeft - cfg.docxMarginRight;
  var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var rpr = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="20"/></w:rPr>';
  var run = function (t) { return '<w:r>' + rpr + '<w:t xml:space="preserve">' + esc(t) + '</w:t></w:r>'; };
  var field = function (instr, shown) { return '<w:fldSimple w:instr="' + instr + '"><w:r>' + rpr + '<w:t>' + shown + '</w:t></w:r></w:fldSimple>'; };
  var media = [], base = part === 'head' ? 1000 : 2000;
  var drawing = function (p, k) {
    var id = 'rId' + (media.length + 1), n = base + k + 1;
    var cx = Math.max(9525, Math.round(p.w * 36000)), cy = Math.max(9525, Math.round(p.h * 36000));   /* mm -> EMU */
    media.push({ id: id, bytes: p.bytes, ext: p.ext });
    var gap = String(String(slots[k] || '').length ? Math.round((Writer.hfimg ? Writer.hfimg.PIC_GAP_MM : 1.5) * 36000) : 0);   /* gap to the slot text */
    return '<w:r>' + rpr + '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="' + gap + '"><wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:docPr id="' + n + '" name="Header picture ' + n + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + n + '" name="hf-' + part + '-' + (k + 1) + '.' + p.ext + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>';
  };
  var runs = slots.map(function (t, k) {
    var out = k ? '<w:r>' + rpr + '<w:tab/></w:r>' : '';
    if (pics[k]) out += drawing(pics[k], k);   /* DW11a: the picture sits before the slot's text */
    String(t).replace(/\{date\}/g, Writer.hf.today()).split(/(\{page\}|\{pages\})/).forEach(function (bit) {
      if (bit === '{page}') out += field('PAGE', '1');
      else if (bit === '{pages}') out += field('NUMPAGES', '1');
      else if (bit) out += run(bit);
    });
    return out;
  }).join('');
  var tag = part === 'head' ? 'hdr' : 'ftr';
  var ns = hasPic ? ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"' : '';
  return {
    xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:' + tag + ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' + ns + '>' +
      '<w:p><w:pPr><w:tabs><w:tab w:val="center" w:pos="' + Math.round(textW / 2) + '"/><w:tab w:val="right" w:pos="' + textW + '"/></w:tabs>' +
      '<w:spacing w:before="0" w:after="0"/></w:pPr>' + runs + '</w:p></w:' + tag + '>',
    media: media,
    edgeMm: hasPic ? Writer.export.hfEdgeMm(part, pics) : null
  };
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
  /* (before DW11a) var headerXml = Writer.export.hfXml('head', isLandscape, hfData); */
  /* (before DW11a) var footerXml = Writer.export.hfXml('foot', isLandscape, hfData); */
  var headerXml = Writer.export.hfXml('head', isLandscape, hfData);   /* DW11a: text only, for the html-docx fallback */
  var footerXml = Writer.export.hfXml('foot', isLandscape, hfData);
  var head = Writer.export.hfPart('head', isLandscape, hfData);       /* DW11a: text + pictures */
  var foot = Writer.export.hfPart('foot', isLandscape, hfData);
  /* DW11a: a header / footer with pictures sits where print and PDF put it (writer-hfimg.js boxTop). */
  var docxMargins = {};
  for (var mk in margins) docxMargins[mk] = margins[mk];
  if (head.edgeMm != null) docxMargins.header = Math.round(head.edgeMm * 56.7);
  if (foot.edgeMm != null) docxMargins.footer = Math.round(foot.edgeMm * 56.7);

  if (Writer.docxgen) {
    try {
      return Writer.docxgen.build(bodyHtml, {
        /* (before DW11a) landscape: isLandscape, pageW: ps.docxW, pageH: ps.docxH, margins: margins, */
        landscape: isLandscape, pageW: ps.docxW, pageH: ps.docxH, margins: docxMargins,
        /* (before DW11a) headerXml: headerXml, footerXml: footerXml, */
        headerXml: head.xml, footerXml: foot.xml, headerMedia: head.media, footerMedia: foot.media,
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

/* DW11a: header / footer for the .odt (writer-odtgen.js opts.hf), or null.
   Text slots with {date} filled in ({page} / {pages} become page fields),
   pictures from hfPics (same sizes as DOCX / PDF), and the edge distance. */
Writer.export.odtHf = function odtHf(isLandscape, data) {
  if (!Writer.hf) return null;
  var d = data || Writer.hf.data, out = { head: null, foot: null }, any = false;
  ['head', 'foot'].forEach(function (part) {
    var slots = (d[part] || ['', '', '']).map(function (t) { return String(t == null ? '' : t).replace(/\{date\}/g, Writer.hf.today()); });
    var pics = Writer.export.hfPics(part, isLandscape, data);
    var hasPic = !!(pics[0] || pics[1] || pics[2]);
    if (!slots.join('').trim() && !hasPic) return;
    out[part] = { slots: slots, pics: pics, edgeMm: Writer.export.hfEdgeMm(part, pics) };
    any = true;
  });
  return any ? out : null;
};

/* DW11a: .odt Blob from body HTML (was inline in exportOdt). hfData as in makeDocxBlob. */
Writer.export.makeOdtBlob = function makeOdtBlob(bodyHtml, hfData) {
  var cfg = Writer.config;
  if (!Writer.odtgen || !Writer.odtgen.build) throw new Error('ODT export is not available');
  var isLandscape = document.body.classList.contains(cfg.landscapeClass);
  var ps = cfg.paperSizes[cfg.paperSize] || cfg.paperSizes.A4;
  return Writer.odtgen.build(bodyHtml, {
    landscape: isLandscape,
    pageWidthCm: isLandscape ? ps.heightCm : ps.widthCm,
    pageHeightCm: isLandscape ? ps.widthCm : ps.heightCm,
    margins: { top: cfg.marginTopCm, right: cfg.marginRightCm, bottom: cfg.marginBottomCm, left: cfg.marginLeftCm },
    defaults: { font: cfg.fontCommandName, sizePt: cfg.fontSizePt, lineHeight: cfg.lineHeight, paraAfterPt: cfg.paragraphSpacingPt },
    hf: Writer.export.odtHf(isLandscape, hfData)   /* DW11a */
  });
};

/* DW8: write the open document as a LibreOffice .odt and download it. */
Writer.export.exportOdt = function exportOdt() {
  var cfg = Writer.config;
  if (Writer.editor) Writer.editor.saveSelection();
  function fail(e) {
    var msg = (e && (e.userMessage || e.message)) || 'Failed to export ODT.';
    if (Writer.dialog && Writer.dialog.alert) Writer.dialog.alert({ title: 'Could not export ODT', message: msg });
    else if (Writer.ui) Writer.ui.showToast('Failed to export ODT');
  }
  try {
    if (!Writer.odtgen || !Writer.odtgen.build) throw new Error('ODT export is not available');
    /* (before DW11a) the odtgen.build(...) call was here; it moved to makeOdtBlob (adds the header / footer). */
    var blob = Writer.export.makeOdtBlob(Writer.export.combinedHtml());
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (Writer.storage && Writer.storage.currentName()) || (cfg.docxFileName || 'document').replace(/\.docx$/, '');
    if (a.download.indexOf('.odt') !== a.download.length - 4) a.download += '.odt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, cfg.docxUrlRevokeMs);
    if (Writer.ui) Writer.ui.showToast('ODT exported successfully');
  } catch (e) {
    fail(e);
  }
  if (Writer.editor) Writer.editor.restoreSelection();
};

/* File menu: Print / Export DOCX / Export ODT / Export PDF, and Ctrl+P. */
/* (before DW8) File menu: Print / Export DOCX / Export PDF, and Ctrl+P. */
Writer.export.bind = function bind() {
  Writer.ui.onClick('printBtn', function () { Writer.export.printDocument(); });
  Writer.ui.onClick('exportDocxBtn', function () { Writer.export.exportDocx(); });
  Writer.ui.onClick('exportOdtBtn', function () { Writer.export.exportOdt(); });
  /* Legacy (before MM4): image PDF only.
  Draftly.ui.onClick('exportPdfBtn', function () { Draftly.pdf.download(); }); */
  Writer.ui.onClick('exportPdfBtn', function () { if (Writer.pdfgen) Writer.pdfgen.exportDocument(); else Writer.pdf.download(); });   /* MM4 / DF14 real-text PDF */
  /* HO1: Ctrl/Cmd+P goes through ../shared/office-quick.js (same printDocument). */
};
