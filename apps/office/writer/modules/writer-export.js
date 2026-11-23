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
  var html = Writer.flow.joinedHtml();
  if (Writer.editor && Writer.editor.stripPending && typeof document !== 'undefined') {
    var holder = document.createElement('div');
    holder.innerHTML = html;
    Writer.editor.stripPending(holder);
    return holder.innerHTML;
  }
  return html;
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
  var hfEx = (Writer.hf && Writer.hf.extra) || { head: 0, foot: 0 };   /* DW13c */
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
    /* (before DW13c) ' padding: ' + cfg.marginTopCm + 'cm ' + cfg.marginRightCm + 'cm ' + cfg.marginBottomCm + 'cm ' + cfg.marginLeftCm + 'cm !important;' + */
    /* DW13c: a grown header / footer block moves the body (as on screen). */
    ' padding: ' + (cfg.marginTopCm + hfEx.head / 10) + 'cm ' + cfg.marginRightCm + 'cm ' + (cfg.marginBottomCm + hfEx.foot / 10) + 'cm ' + cfg.marginLeftCm + 'cm !important;' +
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

/* (before DW13c) Writer.export.hfPics(part, isLandscape, data) returned one row
   (3 slots) of { bytes, ext, w, h } sized by the DW11 S / M / L margin-fit math,
   and Writer.export.hfEdgeMm(part, pics) moved the header into the margin
   (writer-hfimg.js boxTop). The DW11a slot XML (left / centre / right on tab
   stops in one paragraph, each picture before its slot's text) is replaced by
   the DW13c letterhead block below.

   DW13c: the header / footer picture for export: { bytes, ext, w, h, a } (w / h
   in mm: its height, cut to the text column, aspect kept) or null. data: other
   header / footer (mail merge); its picture, or the open document's when it has
   none. Pictures that are not PNG / JPEG / GIF (e.g. a hand-made .webp) are
   skipped with one console note. */
Writer.export.hfPic = function hfPic(part, isLandscape, data) {
  var I = Writer.hfimg, D = Writer.docxgen, cfg = Writer.config;
  if (!I || !D || !D.dataUrlBytes || !Writer.hf) return null;
  var src = (data && data.pic) || (Writer.hf.data && Writer.hf.data.pic) || {};
  var pic = I.normBlockPic(src[part]);
  if (!pic) return null;
  var ps = cfg.paperSizes[cfg.paperSize] || cfg.paperSizes.A4;
  var pageWmm = (isLandscape ? ps.heightCm : ps.widthCm) * 10;
  var colMm = pageWmm - (cfg.marginLeftCm + cfg.marginRightCm) * 10;
  var bytes = D.dataUrlBytes(pic.src), info = bytes && D.sniffImage(bytes);
  if (!info || !info.w || !info.h || !/^(png|jpeg|gif)$/.test(info.ext)) {
    if (!Writer.export.warnedHfPic) { Writer.export.warnedHfPic = true; console.warn('writer: a header / footer picture is not PNG / JPEG / GIF and was left out of the export'); }
    return null;
  }
  var box = I.fitPic(info.w / info.h, pic.h, colMm);
  return { bytes: bytes, ext: info.ext, w: box.w, h: box.h, a: pic.a };
};

/* DW13c: the lines of one part as [{ t, a }] ({date} filled in). data: other
   header / footer lines (mail merge); its alignments, or the open document's. */
Writer.export.hfLines = function hfLines(part, data) {
  var I = Writer.hfimg, d = Writer.hf.data || {};
  var texts = (data || d)[part] || [];
  var al = (data && data.al && data.al[part]) || (d.al && d.al[part]) || [];
  return texts.map(function (t, i) {
    return { t: String(t == null ? '' : t).replace(/\{date\}/g, Writer.hf.today()), a: I ? I.normAlign(al[i]) : 'c' };
  });
};

/* DW13c: mm the body moves for a grown block (writer-hfimg.js extraMm), for exports. */
Writer.export.hfExtraMm = function hfExtraMm(part, lines, pic) {
  var I = Writer.hfimg, cfg = Writer.config;
  if (!I || (!pic && !lines.map(function (l) { return l.t; }).join('').trim())) return 0;
  return I.extraMm((part === 'head' ? cfg.marginTopCm : cfg.marginBottomCm) * 10, I.blockMm(lines.length, pic ? pic.h : 0));
};

/* Word header / footer part, or '' when empty. DW13c: one picture paragraph
   (inline drawing, aligned) then one paragraph per text line, each with its
   alignment; {page} and {pages} become PAGE / NUMPAGES fields; {date} is
   today's date. Returns { xml, media: [{ id, bytes, ext }], extraMm } (media
   for word/_rels/header1.xml.rels). noPics: text only (the html-docx fallback). */
Writer.export.hfXml = function hfXml(part, isLandscape, data) {
  return Writer.export.hfPart(part, isLandscape, data, true).xml;
};

Writer.export.hfPart = function hfPart(part, isLandscape, data, noPics) {
  /* (before DW11a) if (!Writer.hf) return ''; */
  if (!Writer.hf) return { xml: '', media: [], extraMm: 0 };
  var lines = Writer.export.hfLines(part, data);
  var pic = noPics ? null : Writer.export.hfPic(part, isLandscape, data);
  if (!lines.map(function (l) { return l.t; }).join('').trim() && !pic) return { xml: '', media: [], extraMm: 0 };
  var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var rpr = '<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="20"/></w:rPr>';
  var run = function (t) { return '<w:r>' + rpr + '<w:t xml:space="preserve">' + esc(t) + '</w:t></w:r>'; };
  var field = function (instr, shown) { return '<w:fldSimple w:instr="' + instr + '"><w:r>' + rpr + '<w:t>' + shown + '</w:t></w:r></w:fldSimple>'; };
  var jc = function (a) { return '<w:jc w:val="' + ({ l: 'left', c: 'center', r: 'right' }[a] || 'center') + '"/>'; };
  var media = [], base = part === 'head' ? 1000 : 2000, body = '';
  if (pic) {
    var id = 'rId1', n = base + 1;
    var cx = Math.max(9525, Math.round(pic.w * 36000)), cy = Math.max(9525, Math.round(pic.h * 36000));   /* mm -> EMU */
    media.push({ id: id, bytes: pic.bytes, ext: pic.ext });
    var gapTw = Math.round((Writer.hfimg ? Writer.hfimg.PIC_GAP_MM : 1.5) * 56.7);
    body += '<w:p><w:pPr>' + jc(pic.a) + '<w:spacing w:before="0" w:after="' + gapTw + '" w:line="240" w:lineRule="auto"/></w:pPr>' +
      '<w:r>' + rpr + '<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="' + cx + '" cy="' + cy + '"/>' +
      '<wp:docPr id="' + n + '" name="Header picture ' + n + '"/>' +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="' + n + '" name="hf-' + part + '.' + pic.ext + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + id + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  }
  /* trailing empty lines after the text are kept (they are part of the block) */
  lines.forEach(function (l) {
    var runs = '';
    l.t.split(/(\{page\}|\{pages\})/).forEach(function (bit) {
      if (bit === '{page}') runs += field('PAGE', '1');
      else if (bit === '{pages}') runs += field('NUMPAGES', '1');
      else if (bit) runs += run(bit);
    });
    body += '<w:p><w:pPr>' + jc(l.a) + '<w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>' + rpr + '</w:pPr>' + runs + '</w:p>';
  });
  if (!lines.length) body += '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>';   /* Word needs a paragraph last */
  var tag = part === 'head' ? 'hdr' : 'ftr';
  var ns = pic ? ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"' : '';
  return {
    xml: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:' + tag + ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' + ns + '>' +
      body + '</w:' + tag + '>',
    media: media,
    extraMm: Writer.export.hfExtraMm(part, lines, pic)
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
  /* (before DW13c) DW11a: a header / footer with pictures sat where print and PDF put it (writer-hfimg.js boxTop):
  if (head.edgeMm != null) docxMargins.header = Math.round(head.edgeMm * 56.7);
  if (foot.edgeMm != null) docxMargins.footer = Math.round(foot.edgeMm * 56.7); */
  var docxMargins = {};
  for (var mk in margins) docxMargins[mk] = margins[mk];
  /* DW13c: the header stays 0.4 x the margin from the edge and a grown block moves the body, as on screen. */
  docxMargins.top = margins.top + Math.round(head.extraMm * 56.7);
  docxMargins.bottom = margins.bottom + Math.round(foot.extraMm * 56.7);

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

  var ready = (Writer.vendor && Writer.vendor.ensureExport && (!Writer.docxgen || !Writer.zip))
    ? Writer.vendor.ensureExport('docx') : Promise.resolve();
  /* (before HO2) the try/catch called makeDocxBlob directly (html-docx already on the page). */
  return ready.then(function () {
    return Writer.export.withDocx(function () {
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
  });
};

/* DW11a: header / footer for the .odt (writer-odtgen.js opts.hf), or null.
   (before DW13c) { slots: [3 text], pics: [3], edgeMm } per part.
   DW13c: { lines: [{ t, a }], pic: { bytes, ext, w, h, a } | null } per part;
   {date} filled in ({page} / {pages} become page fields), the picture as in
   the .docx. The page layout keeps the header 0.4 x the margin from the edge
   and the header grows (fo:min-height), as in Writer. */
Writer.export.odtHf = function odtHf(isLandscape, data) {
  if (!Writer.hf) return null;
  var out = { head: null, foot: null }, any = false;
  ['head', 'foot'].forEach(function (part) {
    var lines = Writer.export.hfLines(part, data);
    var pic = Writer.export.hfPic(part, isLandscape, data);
    if (!lines.map(function (l) { return l.t; }).join('').trim() && !pic) return;
    out[part] = { lines: lines, pic: pic, edgeMm: null };
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
  var run = function () {
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
  if (Writer.vendor && Writer.vendor.ensureExport && (!Writer.odtgen || !Writer.zip)) {
    return Writer.vendor.ensureExport('odt').then(run, function (e) {
      fail(e);
      if (Writer.editor) Writer.editor.restoreSelection();
    });
  }
  run();
};

/* File menu: Print / Export DOCX / Export ODT / Export PDF, and Ctrl+P. */
/* (before DW8) File menu: Print / Export DOCX / Export PDF, and Ctrl+P. */
/* DW14: File menu has one Export... item; the format buttons live in #exportMenu. */
Writer.export.isChooserOpen = function isChooserOpen() {
  var menu = document.getElementById('exportMenu');
  return !!(menu && !menu.hidden);
};

Writer.export.closeChooser = function closeChooser() {
  var menu = document.getElementById('exportMenu');
  var btn = document.getElementById('exportBtn');
  if (menu) menu.hidden = true;
  if (btn) {
    btn.classList.remove('active');
    btn.setAttribute('aria-expanded', 'false');
  }
};

Writer.export.openChooser = function openChooser() {
  var menu = document.getElementById('exportMenu');
  var btn = document.getElementById('exportBtn');
  var fileBtn = document.getElementById('fileBtn');
  if (!menu) return;
  if (Writer.ribbon && Writer.ribbon.setFile) Writer.ribbon.setFile(false);
  menu.hidden = false;
  if (btn) btn.setAttribute('aria-expanded', 'true');
  var anchor = fileBtn || btn;
  if (Writer.view && Writer.view.place && anchor) Writer.view.place(menu, anchor);
  /* DW16: same window-height cap as the File menu. */
  if (Writer.ui && Writer.ui.setFileMenuTop) Writer.ui.setFileMenuTop(menu);
};

Writer.export.bind = function bind() {
  if (Writer.export._bound) return;
  Writer.export._bound = true;
  if (!(Writer.app && Writer.app._exportButtonsBound)) {
    Writer.ui.onClick('printBtn', function () { Writer.export.printDocument(); });
    Writer.ui.onClick('exportBtn', function () { Writer.export.openChooser(); });
    /* (before DW14) Writer.ui.onClick('exportDocxBtn', function () { Writer.export.exportDocx(); });
    Writer.ui.onClick('exportOdtBtn', function () { Writer.export.exportOdt(); });
    Writer.ui.onClick('exportPdfBtn', function () { if (Writer.pdfgen) Writer.pdfgen.exportDocument(); else Writer.pdf.download(); }); */
    Writer.ui.onClick('exportDocxBtn', function () { Writer.export.closeChooser(); Writer.export.exportDocx(); });
    Writer.ui.onClick('exportOdtBtn', function () { Writer.export.closeChooser(); Writer.export.exportOdt(); });
    /* Legacy (before MM4): image PDF only.
    Draftly.ui.onClick('exportPdfBtn', function () { Draftly.pdf.download(); }); */
    Writer.ui.onClick('exportPdfBtn', function () {
      Writer.export.closeChooser();
      if (Writer.pdfgen) { Writer.pdfgen.exportDocument(); return; }
      if (Writer.vendor && Writer.vendor.ensureExport) {
        Writer.vendor.ensureExport('pdf').then(function () {
          if (Writer.pdfgen) Writer.pdfgen.exportDocument(); else if (Writer.pdf) Writer.pdf.download();
        });
      } else if (Writer.pdf) Writer.pdf.download();
    });   /* MM4 / DF14 real-text PDF */
  }
  document.addEventListener('mousedown', function (e) {
    if (!Writer.export.isChooserOpen()) return;
    var menu = document.getElementById('exportMenu');
    if (menu && menu.contains(e.target)) return;
    Writer.export.closeChooser();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && Writer.export.isChooserOpen()) Writer.export.closeChooser();
  });
  /* HO1: Ctrl/Cmd+P goes through ../shared/office-quick.js (same printDocument). */
};
