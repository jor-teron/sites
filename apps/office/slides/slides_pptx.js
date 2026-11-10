/* Hub Office Slides SL9 — PPTX export / import (SLPptx). No DOM, safe to load in Node.
   build(deck) → { files, warnings }. parse(files) → { deck, warnings }.
   A blank 16:9 layout; title / body / shapes / tables / pictures / notes / footer as text;
   hidden flag as p:sld show="0". Unknown import parts are skipped and listed in warnings.
   Zip packing is SLZip (store); the caller packs / unpacks. */
(function (root) {
  'use strict';
  var NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  var NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  var NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
  var W = 960, H = 540, EMU = 9525;
  var CX = W * EMU, CY = H * EMU;
  var THEMES = {
    light:     { bg: 'FFFFFF', tc: '111827', fg: '1F2430', acc: 'F97316', mut: '6B7280', font: 'Calibri' },
    dark:      { bg: '16181D', tc: 'F3F4F6', fg: 'D1D5DB', acc: '60A5FA', mut: '9AA3AE', font: 'Calibri' },
    ocean:     { bg: 'F0F9FF', tc: '0C4A6E', fg: '0F172A', acc: '0369A1', mut: '4B6B80', font: 'Calibri' },
    forest:    { bg: 'F4F7EF', tc: '1A2E14', fg: '243022', acc: '3F6B3A', mut: '5C6D56', font: 'Georgia' },
    sunset:    { bg: 'FFF7ED', tc: '7C2D12', fg: '431407', acc: 'C2410C', mut: '9A6248', font: 'Calibri' },
    slate:     { bg: 'F4F5F7', tc: '0F172A', fg: '1E293B', acc: '334155', mut: '64748B', font: 'Calibri' },
    paper:     { bg: 'FAF6EE', tc: '1C1917', fg: '292524', acc: '9A3412', mut: '78716C', font: 'Georgia' },
    midnight:  { bg: '0B1220', tc: 'F8FAFC', fg: 'E2E8F0', acc: 'FBBF24', mut: '94A3B8', font: 'Calibri' }
  };
  var PRST = { rect: 'rect', round: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', star: 'star5', callout: 'wedgeRectCallout' };
  var FROM_PRST = { rect: 'rect', roundRect: 'round', ellipse: 'ellipse', triangle: 'triangle', star5: 'star', star: 'star', wedgeRectCallout: 'callout', wedgeRoundRectCallout: 'callout' };

  function emu(px) { return Math.round((+px || 0) * EMU); }
  function px(e) { return Math.round((+e || 0) / EMU); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function hex(c) {
    c = String(c || '').replace(/^#/, '').toUpperCase();
    if (/^[0-9A-F]{3}$/.test(c)) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    return /^[0-9A-F]{6}$/.test(c) ? c : '';
  }
  function themeOf(id) { return THEMES[id] || THEMES.light; }
  function szHundredths(pxSize, fallback) {
    var n = +pxSize || 0;
    if (!n) n = fallback || 18;
    return Math.max(200, Math.min(40000, Math.round(n * 0.75 * 100)));
  }
  function b64decode(s) {
    if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(s, 'base64'));
    var bin = (typeof atob === 'function' ? atob(s) : ''), u = new Uint8Array(bin.length), i;
    for (i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function b64encode(u) {
    u = u instanceof Uint8Array ? u : new Uint8Array(u || 0);
    if (typeof Buffer !== 'undefined') return Buffer.from(u).toString('base64');
    var s = '', i;
    for (i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return (typeof btoa === 'function') ? btoa(s) : '';
  }
  function mediaFromSrc(src) {
    var m = /^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(src || ''));
    if (!m) return null;
    var ext = m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase();
    return { ext: ext, bytes: b64decode(m[2].replace(/\s+/g, '')) };
  }
  function mimeExt(ext) { return ext === 'jpeg' ? 'jpeg' : ext; }

  function layoutBoxes(lay) {
    var padX = 64, padY = 44, iw = W - padX * 2;
    if (lay === 'blank') return {};
    if (lay === 'to') return { title: { x: padX, y: 200, w: iw, h: 140 } };
    if (lay === 'title') return { title: { x: padX, y: 170, w: iw, h: 110 }, body: { x: padX, y: 300, w: iw, h: 120 } };
    if (lay === 'sec') return { title: { x: padX, y: 190, w: iw, h: 90 }, body: { x: padX, y: 300, w: iw, h: 120 } };
    if (lay === 'two') return { title: { x: padX, y: padY, w: iw, h: 90 }, body: { x: padX, y: 150, w: 392, h: 330 }, body2: { x: 504, y: 150, w: 392, h: 330 } };
    if (lay === 'pic') return { title: { x: padX, y: padY, w: iw, h: 70 }, body: { x: padX, y: 400, w: iw, h: 80 } };
    return { title: { x: padX, y: padY, w: iw, h: 90 }, body: { x: padX, y: 150, w: iw, h: 330 } };
  }

  function solidFill(rgb) { rgb = hex(rgb); return rgb ? '<a:solidFill><a:srgbClr val="' + rgb + '"/></a:solidFill>' : '<a:noFill/>'; }
  function lnXml(color, wPx) {
    var rgb = hex(color), w = Math.max(0, Math.round((+wPx || 0) * 12700));
    if (!rgb || !w) return '<a:ln><a:noFill/></a:ln>';
    return '<a:ln w="' + w + '">' + solidFill(rgb) + '</a:ln>';
  }
  function xfrm(x, y, w, h, flip) {
    var extra = '';
    if (flip) extra = ' flipH="0" flipV="1"';
    return '<a:xfrm' + extra + '><a:off x="' + emu(x) + '" y="' + emu(y) + '"/><a:ext cx="' + emu(Math.max(0, w)) + '" cy="' + emu(Math.max(0, h)) + '"/></a:xfrm>';
  }

  function runXml(r, defSize, defColor) {
    r = r || {};
    var t = String(r.text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    t = t.replace(/\n/g, ' ');
    if (!t) return '';
    var rPr = ' lang="en-GB" sz="' + szHundredths(r.size, defSize) + '"';
    if (r.b) rPr += ' b="1"';
    if (r.i) rPr += ' i="1"';
    if (r.u) rPr += ' u="sng"';
    if (r.s) rPr += ' strike="sngStrike"';
    var fill = solidFill(r.color || defColor || '1F2430');
    var hl = hex(r.hl) ? '<a:highlight><a:srgbClr val="' + hex(r.hl) + '"/></a:highlight>' : '';
    return '<a:r><a:rPr' + rPr + '>' + fill + hl + '</a:rPr><a:t>' + esc(t) + '</a:t></a:r>';
  }
  function paraXml(p, defSize, defColor, defList) {
    p = p || {};
    var runs = p.runs && p.runs.length ? p.runs : [{ text: '' }];
    var list = p.list || defList || 'none';
    var lvl = Math.max(0, Math.min(8, p.level | 0));
    var algn = p.align === 'center' ? 'ctr' : (p.align === 'right' ? 'r' : 'l');
    var pPr = '<a:pPr algn="' + algn + '" lvl="' + lvl + '">';
    var marL = 342900 * (list === 'none' ? 0 : 1) + 342900 * lvl;
    if (list === 'bullet') pPr = '<a:pPr algn="' + algn + '" lvl="' + lvl + '" marL="' + marL + '" indent="-171450"><a:buFont typeface="Arial"/><a:buChar char="•"/>';
    else if (list === 'number') pPr = '<a:pPr algn="' + algn + '" lvl="' + lvl + '" marL="' + marL + '" indent="-171450"><a:buFont typeface="Arial"/><a:buAutoNum type="arabicPeriod"/>';
    else pPr += '<a:buNone/>';
    pPr += '</a:pPr>';
    var body = '';
    runs.forEach(function (r) { body += runXml(r, defSize, defColor); });
    if (!body) body = '<a:endParaRPr sz="' + szHundredths(defSize, 18) + '"/>';
    return '<a:p>' + pPr + body + '</a:p>';
  }
  function docXml(doc, defSize, defColor, defList) {
    var T = root.SLText;
    doc = T ? T.clean(doc, { list: defList || 'none' }) : doc;
    var paras = (doc && doc.paragraphs) || [];
    if (!paras.length) return '<a:p><a:endParaRPr sz="' + szHundredths(defSize, 18) + '"/></a:p>';
    var h = '';
    paras.forEach(function (p) { h += paraXml(p, defSize, defColor, defList); });
    return h;
  }
  function txBody(doc, defSize, defColor, defList, anchor) {
    return '<p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="' + (anchor || 't') + '"/><a:lstStyle/>' +
      docXml(doc, defSize, defColor, defList) + '</p:txBody>';
  }
  function nvSp(id, name, txBox) {
    return '<p:nvSpPr><p:cNvPr id="' + id + '" name="' + esc(name) + '"/><p:cNvSpPr' + (txBox ? ' txBox="1"' : '') + '/>' +
      '<p:nvPr/></p:nvSpPr>';
  }
  function spBox(id, name, box, doc, style) {
    style = style || {};
    var fill = style.fill ? solidFill(style.fill) : '<a:noFill/>';
    var ln = lnXml(style.stroke || style.border, style.sw != null ? style.sw : (style.border ? 1 : 0));
    var prst = style.prst || 'rect';
    return '<p:sp>' + nvSp(id, name, !!style.txBox) + '<p:spPr>' + xfrm(box.x, box.y, box.w, box.h) +
      '<a:prstGeom prst="' + prst + '"><a:avLst/></a:prstGeom>' + fill + ln + '</p:spPr>' +
      txBody(doc, style.size || 18, style.color, style.list || 'none', style.anchor) + '</p:sp>';
  }
  function cxnSp(id, name, sh) {
    var w = Math.max(1, sh.w), h = Math.max(1, sh.h);
    var tail = sh.kind === 'arrow' ? '<a:tailEnd type="triangle" w="med" len="med"/>' : '';
    var ln = '<a:ln w="' + Math.max(12700, Math.round((sh.sw || 3) * 12700)) + '">' + solidFill(sh.stroke || '111827') + tail + '</a:ln>';
    return '<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="' + id + '" name="' + esc(name) + '"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>' +
      '<p:spPr>' + xfrm(sh.x, sh.y, w, h, sh.flip) + '<a:prstGeom prst="line"><a:avLst/></a:prstGeom>' + ln + '</p:spPr></p:cxnSp>';
  }

  function tableXml(id, name, tb) {
    var rows = tb.rows || (tb.cells && tb.cells.length) || 1;
    var cols = tb.cols || (tb.cells && tb.cells[0] && tb.cells[0].length) || 1;
    var cw = emu(tb.w / cols), rh = emu(tb.h / rows);
    var grid = '', r, c, h = '';
    for (c = 0; c < cols; c++) grid += '<a:gridCol w="' + cw + '"/>';
    for (r = 0; r < rows; r++) {
      h += '<a:tr h="' + rh + '">';
      for (c = 0; c < cols; c++) {
        var cell = tb.cells && tb.cells[r] && tb.cells[r][c];
        var fill = (tb.header && r === 0 && tb.hfill) ? tb.hfill : tb.fill;
        var tcPr = '<a:tcPr>' + (fill ? solidFill(fill) : '<a:noFill/>') +
          (tb.border ? '<a:lnL w="12700">' + solidFill(tb.border) + '</a:lnL><a:lnR w="12700">' + solidFill(tb.border) + '</a:lnR><a:lnT w="12700">' + solidFill(tb.border) + '</a:lnT><a:lnB w="12700">' + solidFill(tb.border) + '</a:lnB>' : '') +
          '</a:tcPr>';
        h += '<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>' + docXml(cell && cell.doc, 16, '111827', 'none') + '</a:txBody>' + tcPr + '</a:tc>';
      }
      h += '</a:tr>';
    }
    return '<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="' + id + '" name="' + esc(name) + '"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>' +
      '<p:xfrm>' + xfrm(tb.x, tb.y, tb.w, tb.h).replace(/<\/?a:xfrm[^>]*>/g, '') + '</p:xfrm>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>' +
      '<a:tblGrid>' + grid + '</a:tblGrid>' + h + '</a:tbl></a:graphicData></a:graphic></p:graphicFrame>';
  }

  function picXml(id, name, p, rId) {
    return '<p:pic><p:nvPicPr><p:cNvPr id="' + id + '" name="' + esc(name) + '"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
      '<p:blipFill><a:blip r:embed="' + rId + '"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
      '<p:spPr>' + xfrm(p.x, p.y, p.w, p.h) + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>';
  }

  /* ---------- package parts ---------- */
  function contentTypes(slides, noteNs, hasNotes) {
    var d = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Default Extension="jpg" ContentType="image/jpeg"/>' +
      '<Default Extension="gif" ContentType="image/gif"/>' +
      '<Default Extension="webp" ContentType="image/webp"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>';
    var i;
    for (i = 1; i <= slides; i++) d += '<Override PartName="/ppt/slides/slide' + i + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
    if (hasNotes) {
      d += '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>';
      (noteNs || []).forEach(function (n) {
        d += '<Override PartName="/ppt/notesSlides/notesSlide' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>';
      });
    }
    return d + '</Types>';
  }
  function relsRoot() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>';
  }
  function themeXml(th) {
    var t = themeOf(th);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<a:theme xmlns:a="' + NS_A + '" name="Hub Slides"><a:themeElements><a:clrScheme name="' + esc(th || 'light') + '">' +
      '<a:dk1><a:srgbClr val="' + t.tc + '"/></a:dk1><a:lt1><a:srgbClr val="' + t.bg + '"/></a:lt1>' +
      '<a:dk2><a:srgbClr val="' + t.fg + '"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2>' +
      '<a:accent1><a:srgbClr val="' + t.acc + '"/></a:accent1><a:accent2><a:srgbClr val="' + t.mut + '"/></a:accent2>' +
      '<a:accent3><a:srgbClr val="16A34A"/></a:accent3>' +
      '<a:accent4><a:srgbClr val="2563EB"/></a:accent4><a:accent5><a:srgbClr val="DC2626"/></a:accent5>' +
      '<a:accent6><a:srgbClr val="CA8A04"/></a:accent6>' +
      '<a:hlink><a:srgbClr val="2563EB"/></a:hlink><a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>' +
      '</a:clrScheme><a:fontScheme name="' + esc(t.font) + '">' +
      '<a:majorFont><a:latin typeface="' + t.font + '"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
      '<a:minorFont><a:latin typeface="' + t.font + '"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
      '</a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
      '<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst>' +
      '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
      '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
      '</a:fmtScheme></a:themeElements></a:theme>';
  }
  function masterXml(th) {
    var t = themeOf(th);
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<p:sldMaster xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '"><p:cSld><p:bg><p:bgPr>' + solidFill(t.bg) + '<a:effectLst/></p:bgPr></p:bg>' +
      '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + CX + '" cy="' + CY + '"/><a:chOff x="0" y="0"/><a:chExt cx="' + CX + '" cy="' + CY + '"/></a:xfrm></p:grpSpPr>' +
      '</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>';
  }
  function layoutXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<p:sldLayout xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '" type="blank" preserve="1"><p:cSld name="Blank">' +
      '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + CX + '" cy="' + CY + '"/><a:chOff x="0" y="0"/><a:chExt cx="' + CX + '" cy="' + CY + '"/></a:xfrm></p:grpSpPr>' +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
  }
  function notesMasterXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<p:notesMaster xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '"><p:cSld><p:spTree>' +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
      '</p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:notesMaster>';
  }
  function notesSlideXml(text) {
    var T = root.SLText;
    var doc = T ? T.fromPlain(text || '', { list: 'none' }) : { paragraphs: [{ runs: [{ text: text || '' }], list: 'none' }] };
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<p:notes xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '"><p:cSld><p:spTree>' +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>' +
      spBox(2, 'Notes', { x: 40, y: 40, w: 680, h: 500 }, doc, { size: 14, color: '111827' }) +
      '</p:spTree></p:cSld></p:notes>';
  }
  function rels(pairs) {
    var h = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    pairs.forEach(function (p) {
      h += '<Relationship Id="' + p.id + '" Type="' + p.type + '" Target="' + esc(p.target) + '"' + (p.mode ? ' TargetMode="' + p.mode + '"' : '') + '/>';
    });
    return h + '</Relationships>';
  }
  var RT = {
    slide: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide',
    layout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
    master: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
    theme: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme',
    notes: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
    notesMaster: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster',
    image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'
  };

  function slideXml(s, i, deck, mediaRels, nid) {
    var th = themeOf(deck.theme), T = root.SLText, M = root.SLMaster;
    var lay = s.layout || 'tc', boxes = layoutBoxes(lay);
    var hide = s.hide ? ' show="0"' : '';
    var id = 2, body = '';
    var bg = hex(s.bg) || th.bg;
    function nextId() { return id++; }
    if (boxes.title && T && T.has(s.title)) {
      body += spBox(nextId(), 'Title', boxes.title, s.title, { size: 44, color: th.tc, list: 'none', anchor: 'ctr', txBox: true });
    }
    if (boxes.body && T && T.has(s.body)) {
      body += spBox(nextId(), 'Content', boxes.body, s.body, { size: 28, color: th.fg, list: (lay === 'title' || lay === 'sec' || lay === 'pic') ? 'none' : 'bullet', txBox: true });
    }
    if (boxes.body2 && T && T.has(s.body2)) {
      body += spBox(nextId(), 'Content 2', boxes.body2, s.body2, { size: 28, color: th.fg, list: 'bullet', txBox: true });
    }
    var items = [];
    (s.pics || []).forEach(function (p) { items.push({ z: p.z || 0, kind: 'pic', obj: p }); });
    (s.texts || s.tboxes || []).forEach(function (t) { items.push({ z: t.z || 1, kind: 'tbox', obj: t }); });
    (s.shapes || []).forEach(function (sh) { items.push({ z: sh.z || 2, kind: 'shape', obj: sh }); });
    (s.tables || []).forEach(function (tb) { items.push({ z: tb.z || 3, kind: 'table', obj: tb }); });
    items.sort(function (a, b) { return a.z - b.z; });
    items.forEach(function (it) {
      var o = it.obj;
      if (it.kind === 'pic') {
        var rid = mediaRels[o.id] || mediaRels[o.key] || mediaRels._src && mediaRels._src[o.src];
        if (rid) body += picXml(nextId(), 'Picture', o, rid);
        return;
      }
      if (it.kind === 'tbox') {
        body += spBox(nextId(), 'Text box', o, o.doc, { size: 18, color: th.fg, fill: o.fill, border: o.border, sw: o.border ? 1 : 0, list: 'none', txBox: true });
        return;
      }
      if (it.kind === 'shape') {
        if (o.kind === 'line' || o.kind === 'arrow') { body += cxnSp(nextId(), o.kind, o); return; }
        body += spBox(nextId(), o.kind || 'Shape', o, o.doc, { size: 18, color: th.fg, fill: o.fill, stroke: o.stroke, sw: o.sw, prst: PRST[o.kind] || 'rect', list: 'none', anchor: 'ctr' });
        return;
      }
      if (it.kind === 'table') body += tableXml(nextId(), 'Table', o);
    });
    if (M) {
      var foot = M.footerFor(deck, i, {});
      if (foot) {
        var txt = [foot.text, foot.date, foot.num].filter(Boolean).join('    ');
        var fdoc = T ? T.fromPlain(txt, { list: 'none' }) : { paragraphs: [{ runs: [{ text: txt }], list: 'none' }] };
        body += spBox(nextId(), 'Footer', { x: 48, y: 508, w: 864, h: 24 }, fdoc, { size: 14, color: th.mut, list: 'none', txBox: true });
      }
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<p:sld xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '"' + hide + '><p:cSld><p:bg><p:bgPr>' + solidFill(bg) + '<a:effectLst/></p:bgPr></p:bg>' +
      '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + CX + '" cy="' + CY + '"/><a:chOff x="0" y="0"/><a:chExt cx="' + CX + '" cy="' + CY + '"/></a:xfrm></p:grpSpPr>' +
      body + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  }

  function iso(d) {
    try { return new Date(d || Date.now()).toISOString(); } catch (_) { return new Date().toISOString(); }
  }
  function build(deck, o) {
    o = o || {};
    deck = deck || {};
    var slides = deck.slides || [], warnings = [], files = {}, mediaN = 0, hasNotes = false;
    var i, s, T = root.SLText;
    slides.forEach(function (sl) { if (sl.notes && String(sl.notes).replace(/\s+/g, '')) hasNotes = true; });
    var noteNs = [];
    files['_rels/.rels'] = relsRoot();
    files['docProps/core.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + esc(deck.name || 'Slides') + '</dc:title><dc:creator>Hub Office Slides</dc:creator>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + iso(deck.created) + '</dcterms:created>' +
      '<dcterms:modified xsi:type="dcterms:W3CDTF">' + iso(deck.updated) + '</dcterms:modified></cp:coreProperties>';
    files['docProps/app.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Hub Office Slides</Application><Slides>' + slides.length + '</Slides><PresentationFormat>On-screen Show (16:9)</PresentationFormat></Properties>';
    files['ppt/theme/theme1.xml'] = themeXml(deck.theme);
    files['ppt/slideMasters/slideMaster1.xml'] = masterXml(deck.theme);
    files['ppt/slideMasters/_rels/slideMaster1.xml.rels'] = rels([
      { id: 'rId1', type: RT.layout, target: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', type: RT.theme, target: '../theme/theme1.xml' }
    ]);
    files['ppt/slideLayouts/slideLayout1.xml'] = layoutXml();
    files['ppt/slideLayouts/_rels/slideLayout1.xml.rels'] = rels([{ id: 'rId1', type: RT.master, target: '../slideMasters/slideMaster1.xml' }]);
    if (hasNotes) {
      files['ppt/notesMasters/notesMaster1.xml'] = notesMasterXml();
      files['ppt/notesMasters/_rels/notesMaster1.xml.rels'] = rels([{ id: 'rId1', type: RT.theme, target: '../theme/theme1.xml' }]);
    }
    var presRels = [{ id: 'rId100', type: RT.master, target: 'slideMasters/slideMaster1.xml' }];
    if (hasNotes) presRels.push({ id: 'rId101', type: RT.notesMaster, target: 'notesMasters/notesMaster1.xml' });
    var sldIds = '';
    for (i = 0; i < slides.length; i++) {
      s = slides[i];
      var n = i + 1, rid = 'rId' + n;
      presRels.push({ id: rid, type: RT.slide, target: 'slides/slide' + n + '.xml' });
      sldIds += '<p:sldId id="' + (256 + i) + '" r:id="' + rid + '"/>';
      var slideRels = [{ id: 'rId1', type: RT.layout, target: '../slideLayouts/slideLayout1.xml' }];
      var mediaRels = {}, relN = 2;
      (s.pics || []).forEach(function (p) {
        var med = mediaFromSrc(p.src);
        if (!med) {
          if (p.src || p.key) warnings.push('Slide ' + n + ': a picture had no bitmap in memory and was skipped (export after pictures have loaded, or use Export .hslides).');
          return;
        }
        if (med.ext === 'webp') {
          if (o.webpToPng && typeof o.webpToPng === 'function') {
            var conv = o.webpToPng(med.bytes);
            if (conv && conv.bytes) { med = { ext: 'png', bytes: conv.bytes }; }
            else warnings.push('Slide ' + n + ': a WebP picture could not be converted and was stored as WebP (some apps may not open it).');
          } else {
            warnings.push('Slide ' + n + ': a WebP picture was stored as WebP (some apps may not open it).');
          }
        }
        mediaN++;
        var fname = 'image' + mediaN + '.' + (med.ext === 'jpeg' ? 'jpeg' : med.ext);
        files['ppt/media/' + fname] = med.bytes;
        var mr = 'rId' + relN++;
        slideRels.push({ id: mr, type: RT.image, target: '../media/' + fname });
        mediaRels[p.id] = mr;
        if (p.key) mediaRels[p.key] = mr;
      });
      var noteText = s.notes ? String(s.notes) : '';
      if (hasNotes && noteText.replace(/\s+/g, '')) {
        noteNs.push(n);
        var nr = 'rId' + relN++;
        slideRels.push({ id: nr, type: RT.notes, target: '../notesSlides/notesSlide' + n + '.xml' });
        files['ppt/notesSlides/notesSlide' + n + '.xml'] = notesSlideXml(noteText);
        files['ppt/notesSlides/_rels/notesSlide' + n + '.xml.rels'] = rels([
          { id: 'rId1', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide', target: '../slides/slide' + n + '.xml' },
          { id: 'rId2', type: RT.notesMaster, target: '../notesMasters/notesMaster1.xml' }
        ]);
      }
      files['ppt/slides/slide' + n + '.xml'] = slideXml(s, i, deck, mediaRels, n);
      files['ppt/slides/_rels/slide' + n + '.xml.rels'] = rels(slideRels);
    }
    if (deck.sections && deck.sections.length) warnings.push('Named sections are not written into the PowerPoint file.');
    if (slides.some(function (sl) { return sl.trans && sl.trans !== 'none' && sl.trans !== ''; })) {
      warnings.push('Slide transitions are not written into the PowerPoint file.');
    }
    if (slides.some(function (sl) { return sl.ink && sl.ink.length; })) {
      warnings.push('Pen and laser ink is not written into the PowerPoint file.');
    }
    files['[Content_Types].xml'] = contentTypes(slides.length, noteNs, hasNotes);
    files['ppt/presentation.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<p:presentation xmlns:a="' + NS_A + '" xmlns:r="' + NS_R + '" xmlns:p="' + NS_P + '">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId100"/></p:sldMasterIdLst>' +
      '<p:sldIdLst>' + sldIds + '</p:sldIdLst>' +
      '<p:sldSz cx="' + CX + '" cy="' + CY + '" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
    files['ppt/_rels/presentation.xml.rels'] = rels(presRels);
    return { files: files, warnings: warnings };
  }

  /* ---------- import ---------- */
  function fileOf(files, path) {
    path = String(path || '').replace(/^\/+/, '').replace(/\\/g, '/');
    if (files[path]) return files[path];
    var low = path.toLowerCase(), k;
    for (k in files) if (k.replace(/^\/+/, '').replace(/\\/g, '/').toLowerCase() === low) return files[k];
    return null;
  }
  function textOf(files, path) {
    var v = fileOf(files, path);
    return v == null ? '' : (root.SLZip ? SLZip.asText(v) : (typeof v === 'string' ? v : ''));
  }
  function parseRels(xml) {
    var map = {}, re = /<Relationship\b([^>]+)>/g, m;
    while ((m = re.exec(xml))) {
      var id = /Id="([^"]+)"/.exec(m[1]), typ = /Type="([^"]+)"/.exec(m[1]), tgt = /Target="([^"]+)"/.exec(m[1]);
      if (id && tgt) map[id[1]] = { target: tgt[1].replace(/\\/g, '/'), type: typ ? typ[1] : '' };
    }
    return map;
  }
  function resolve(from, target) {
    if (!target) return '';
    if (/^https?:/i.test(target)) return target;
    var base = from.split('/').slice(0, -1);
    target.split('/').forEach(function (p) {
      if (p === '..') base.pop();
      else if (p !== '.') base.push(p);
    });
    return base.join('/');
  }
  function attr(tag, name) {
    var m = new RegExp('\\b' + name + '="([^"]*)"', 'i').exec(tag);
    return m ? m[1] : '';
  }
  function inner(xml, reOpen, reClose) {
    var m = reOpen.exec(xml);
    if (!m) return '';
    var start = m.index + m[0].length, end = xml.indexOf(reClose, start);
    return end < 0 ? xml.slice(start) : xml.slice(start, end);
  }
  function decode(t) {
    return String(t || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  function srgbIn(xml) {
    var m = /<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(xml || '');
    return m ? '#' + m[1].toLowerCase() : '';
  }
  function offExt(xml) {
    var off = /<a:off[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/.exec(xml) || /<a:off[^>]*\by="(-?\d+)"[^>]*\bx="(-?\d+)"/.exec(xml);
    var ext = /<a:ext[^>]*\bcx="(-?\d+)"[^>]*\bcy="(-?\d+)"/.exec(xml) || /<a:ext[^>]*\bcy="(-?\d+)"[^>]*\bcx="(-?\d+)"/.exec(xml);
    var x = off ? px(off[1]) : 0, y = off ? px(off[2]) : 0;
    /* if the second regex swapped, check attribute order — both patterns above assume x then y / cx then cy first. */
    if (off && / y="/.test(off[0]) && off[0].indexOf('y="') < off[0].indexOf('x="')) { x = px(off[2]); y = px(off[1]); }
    var w = ext ? px(ext[1]) : 100, h = ext ? px(ext[2]) : 40;
    if (ext && ext[0].indexOf('cy="') < ext[0].indexOf('cx="') && / cy="/.test(ext[0])) { w = px(ext[2]); h = px(ext[1]); }
    return { x: x, y: y, w: Math.max(8, w), h: Math.max(8, h), flip: /flipV="1"/.test(xml || '') };
  }
  function parasFromTx(xml) {
    var T = root.SLText, paras = [], pRe = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g, pm;
    while ((pm = pRe.exec(xml || ''))) {
      var chunk = pm[1], pPr = (/<a:pPr\b([^>]*)>/.exec(chunk) || [])[1] || '';
      var lvl = +(attr(' ' + pPr, 'lvl') || 0);
      var algnRaw = attr(' ' + pPr, 'algn');
      var align = algnRaw === 'ctr' || algnRaw === 'center' ? 'center' : (algnRaw === 'r' || algnRaw === 'right' ? 'right' : '');
      var list = /<a:buNone\b/.test(chunk) || /<a:buNone\/>/.test(chunk) ? 'none' :
        (/<a:buAutoNum\b/.test(chunk) ? 'number' : (/<a:buChar\b|<a:buFont\b|<a:buSz/.test(chunk) ? 'bullet' : 'none'));
      var runs = [], rRe = /<a:r\b[^>]*>([\s\S]*?)<\/a:r>/g, rm;
      while ((rm = rRe.exec(chunk))) {
        var rc = rm[1], t = '';
        var tm = /<a:t(?: [^>]*)?>([\s\S]*?)<\/a:t>/.exec(rc);
        if (tm) t = decode(tm[1]);
        var rPr = (/<a:rPr\b([^>]*)>/.exec(rc) || /<a:rPr\b([^>]*)\/>/.exec(rc) || [])[1] || '';
        var run = { text: t };
        if (/\bb="1"/.test(rPr)) run.b = true;
        if (/\bi="1"/.test(rPr)) run.i = true;
        if (/\bu="sng"/.test(rPr) || /\bu="1"/.test(rPr)) run.u = true;
        if (/strike="sngStrike"/.test(rPr)) run.s = true;
        var sz = /\bsz="(\d+)"/.exec(rPr);
        if (sz) run.size = Math.round((+sz[1] / 100) / 0.75);
        var col = srgbIn(rc);
        if (col) run.color = col;
        runs.push(run);
      }
      if (!runs.length) {
        var only = /<a:t(?: [^>]*)?>([\s\S]*?)<\/a:t>/g, ot, acc = '';
        while ((ot = only.exec(chunk))) acc += decode(ot[1]);
        if (acc) runs.push({ text: acc });
      }
      var para = { runs: runs.length ? runs : [{ text: '' }], level: lvl, list: list };
      if (align) para.align = align;
      paras.push(para);
    }
    if (!paras.length) return T ? T.empty('none') : { paragraphs: [{ runs: [{ text: '' }], list: 'none' }] };
    var doc = { paragraphs: paras };
    return T ? T.clean(doc, { list: paras[0].list || 'none' }) : doc;
  }
  function warnUnknown(xml, warnings, label) {
    if (/<c:chart\b|<p:oleObj\b|<p:videoFile\b|<p:audioFile\b|<a:dgm\b|smartArt|p:sldTransition/i.test(xml)) {
      warnings.push(label + ': a chart, video, SmartArt or similar part was skipped.');
    }
  }

  function parseSlide(xml, relsMap, files, warnings, n) {
    var T = root.SLText, s = { layout: 'blank', pics: [], texts: [], shapes: [], tables: [], hide: /\bshow="0"/.test(/<p:sld\b[^>]*>/.exec(xml) ? /<p:sld\b[^>]*>/.exec(xml)[0] : '') };
    var bg = /<p:bg>[\s\S]*?<\/p:bg>/.exec(xml);
    if (bg) { var c = srgbIn(bg[0]); if (c) s.bg = c; }
    warnUnknown(xml, warnings, 'Slide ' + n);

    function eachBlock(tag, fn) {
      var re = new RegExp('<' + tag + '\\b[^>]*>[\\s\\S]*?<\\/' + tag + '>', 'g'), m;
      while ((m = re.exec(xml))) fn(m[0]);
    }
    eachBlock('p:sp', function (block) {
      var box = offExt(block), doc = parasFromTx(block);
      var prst = /<a:prstGeom[^>]*prst="([^"]+)"/.exec(block);
      var fill = srgbIn((/<a:solidFill>[\s\S]*?<\/a:solidFill>/.exec(block) || [])[0] || '');
      var name = attr((/<p:cNvPr\b[^>]*>/.exec(block) || [''])[0], 'name').toLowerCase();
      var kind = prst && FROM_PRST[prst[1]];
      var isTx = /txBox="1"/.test(block);
      if (name === 'footer' || (name.indexOf('footer') >= 0 && box.y >= 480 && box.h <= 48)) {
        return;
      }
      if (kind && (!isTx || name === kind || name === 'shape' || name === PRST[kind])) {
        var st = '';
        var lnM = /<a:ln\b[\s\S]*?<\/a:ln>/.exec(block) || /<a:ln\b[^/]*\/>/.exec(block);
        if (lnM) st = srgbIn(lnM[0]) || '';
        s.shapes.push({ kind: kind, x: box.x, y: box.y, w: box.w, h: box.h, fill: fill || '', stroke: st, sw: 1, doc: doc, z: 2 });
        return;
      }
      /* title / body heuristics */
      if (!s.title && (name.indexOf('title') >= 0 || box.y < 160 && box.h <= 160 && T && T.has(doc))) {
        s.title = doc; s.layout = s.layout === 'blank' ? 'tc' : s.layout; return;
      }
      if (!s.body && (name.indexOf('content') >= 0 || name.indexOf('placeholder') >= 0 || name.indexOf('body') >= 0)) {
        s.body = doc; s.layout = s.layout === 'blank' ? 'tc' : s.layout; return;
      }
      if (!s.body && T && T.has(doc) && box.w > 300 && box.y >= 120 && !s.body) {
        s.body = doc; s.layout = s.layout === 'blank' ? 'tc' : s.layout; return;
      }
      s.texts.push({ x: box.x, y: box.y, w: box.w, h: box.h, doc: doc, fill: fill || '', z: 1 });
    });
    eachBlock('p:cxnSp', function (block) {
      var box = offExt(block);
      var arrow = /<a:tailEnd\b/.test(block);
      var st = srgbIn(block) || '#111827';
      s.shapes.push({ kind: arrow ? 'arrow' : 'line', x: box.x, y: box.y, w: box.w, h: box.h, stroke: st, sw: 2, flip: box.flip, z: 2 });
    });
    eachBlock('p:pic', function (block) {
      var box = offExt(block);
      var emb = /r:embed="([^"]+)"/.exec(block);
      if (!emb || !relsMap[emb[1]]) { warnings.push('Slide ' + n + ': a picture reference was missing and was skipped.'); return; }
      var path = resolve('ppt/slides/slide' + n + '.xml', relsMap[emb[1]].target);
      var bytes = fileOf(files, path);
      if (!bytes) { warnings.push('Slide ' + n + ': a picture file was missing from the package.'); return; }
      var ext = (path.split('.').pop() || 'png').toLowerCase();
      if (ext === 'jpg') ext = 'jpeg';
      if (ext !== 'png' && ext !== 'jpeg' && ext !== 'gif' && ext !== 'webp') ext = 'png';
      var u = bytes instanceof Uint8Array ? bytes : (root.SLZip ? SLZip.u8(bytes) : bytes);
      var src = 'data:image/' + ext + ';base64,' + b64encode(u);
      s.pics.push({ x: box.x, y: box.y, w: box.w, h: box.h, src: src, fit: 'contain', z: 0 });
    });
    eachBlock('a:tbl', function (block) {
      var rows = [], trRe = /<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g, tm;
      while ((tm = trRe.exec(block))) {
        var row = [], tcRe = /<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g, cm;
        while ((cm = tcRe.exec(tm[1]))) row.push({ doc: parasFromTx(cm[1]) });
        if (row.length) rows.push(row);
      }
      if (!rows.length) return;
      /* graphicFrame xfrm is just outside a:tbl — search a bit before */
      var pos = xml.lastIndexOf('<p:graphicFrame', xml.indexOf(block));
      var frame = pos >= 0 ? xml.slice(pos, xml.indexOf(block) + 200) : block;
      var box = offExt(/<p:xfrm>[\s\S]*?<\/p:xfrm>/.exec(frame) ? /<p:xfrm>[\s\S]*?<\/p:xfrm>/.exec(frame)[0] : (frame + block));
      s.tables.push({ x: box.x, y: box.y, w: box.w || 480, h: box.h || 200, cells: rows, rows: rows.length, cols: rows[0].length, header: false, z: 3 });
    });
    if (s.title && s.body) s.layout = 'tc';
    else if (s.title && !s.body) s.layout = 'to';
    else if (!s.title && s.body) { s.title = T ? T.empty('none') : { paragraphs: [] }; s.layout = 'tc'; }
    return s;
  }

  function notesText(xml) {
    var T = root.SLText, doc = parasFromTx(xml);
    return T ? T.plain(doc) : '';
  }
  function themeIdFrom(xml) {
    var lt = /<a:lt1>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(xml);
    var acc = /<a:accent1>[\s\S]*?<a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(xml);
    var bg = lt ? lt[1].toUpperCase() : '';
    var a = acc ? acc[1].toUpperCase() : '';
    var best = 'light', bestD = 1e9, id;
    for (id in THEMES) {
      var t = THEMES[id], d = 0;
      function ch(p, q) {
        var i, s = 0;
        for (i = 0; i < 3; i++) s += Math.abs(parseInt(p.slice(i * 2, i * 2 + 2), 16) - parseInt(q.slice(i * 2, i * 2 + 2), 16));
        return s;
      }
      if (bg) d += ch(t.bg, bg);
      if (a) d += ch(t.acc, a);
      if (d < bestD) { bestD = d; best = id; }
    }
    return best;
  }

  function parse(files) {
    files = files || {};
    var warnings = [];
    if (!fileOf(files, 'ppt/presentation.xml') && !fileOf(files, 'ppt\\presentation.xml')) {
      return { error: 'This is not a PowerPoint file I can read (no presentation.xml).' };
    }
    var pres = textOf(files, 'ppt/presentation.xml');
    var presRels = parseRels(textOf(files, 'ppt/_rels/presentation.xml.rels'));
    var themePath = '';
    Object.keys(presRels).forEach(function (id) {
      if (/slideMaster/.test(presRels[id].type)) {
        var mp = resolve('ppt/presentation.xml', presRels[id].target);
        var mr = parseRels(textOf(files, mp.replace(/[^/]+$/, '_rels/' + mp.split('/').pop() + '.rels')));
        Object.keys(mr).forEach(function (k) { if (/theme/.test(mr[k].type)) themePath = resolve(mp, mr[k].target); });
      }
    });
    var theme = themePath ? themeIdFrom(textOf(files, themePath)) : 'light';
    var ids = [], re = /<p:sldId\b([^>]*)>/g, m;
    while ((m = re.exec(pres))) {
      var rid = attr(m[1], 'r:id') || attr(m[1], 'r:Id');
      if (rid) ids.push(rid);
    }
    if (!ids.length) warnings.push('No slide list was found; looked for other slide parts.');
    var slides = [], name = 'Imported deck';
    var core = textOf(files, 'docProps/core.xml');
    var tm = /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/.exec(core);
    if (tm) name = decode(tm[1]).slice(0, 80) || name;
    ids.forEach(function (rid, i) {
      var rel = presRels[rid];
      if (!rel) { warnings.push('Slide ' + (i + 1) + ' is listed but its file is missing.'); return; }
      var path = resolve('ppt/presentation.xml', rel.target);
      var xml = textOf(files, path);
      if (!xml) { warnings.push('Slide ' + (i + 1) + ' could not be read.'); return; }
      var srels = parseRels(textOf(files, path.replace(/[^/]+$/, '_rels/' + path.split('/').pop() + '.rels')));
      var s = parseSlide(xml, srels, files, warnings, i + 1);
      Object.keys(srels).forEach(function (k) {
        if (/notesSlide/.test(srels[k].type)) {
          var np = resolve(path, srels[k].target);
          var nt = notesText(textOf(files, np));
          if (nt) s.notes = nt;
        }
      });
      slides.push(s);
    });
    if (!slides.length) return { error: 'This PowerPoint file has no slides I could read.', warnings: warnings };
    if (slides.length > 500) { slides = slides.slice(0, 500); warnings.push('Only the first 500 slides were imported.'); }
    return { deck: { name: name, theme: theme, slides: slides }, warnings: warnings };
  }

  var API = {
    W: W, H: H, EMU: EMU, THEMES: THEMES, emu: emu, px: px, hex: hex, themeOf: themeOf,
    layoutBoxes: layoutBoxes, mediaFromSrc: mediaFromSrc, b64encode: b64encode, b64decode: b64decode,
    build: build, parse: parse, docXml: docXml, parasFromTx: parasFromTx
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.SLPptx = API;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
