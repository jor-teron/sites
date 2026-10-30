/* ============================================================
   FILE: modules/draftly-pdfgen.js
   PROJECT: Draftly
   ROLE: MM4 / DF14 real-text PDF. Lays the document HTML out in a
         hidden copy of the editor (so the browser does the line
         breaking, justify, lists, tables and images exactly as on
         screen), then writes every word with jsPDF text calls at
         its measured place. Text in the PDF can be selected and
         searched. Pages are cut between lines / table rows, never
         through them; .dr-pagebreak starts a new page.
   ENTRY: Draftly.pdfgen.render(parts, opts) -> Promise<jsPDF>
            parts: [{ html, hf: {head:[3], foot:[3]} | null }]
                   each part starts on a new page (mail merge rows);
                   {page}/{pages} count inside one part.
          Draftly.pdfgen.canUse(htmlList, hfList) -> false when text is
            outside the jsPDF standard fonts (WinAnsi / Latin-1).
          Draftly.pdfgen.exportDocument() -> File > Export PDF.
   FONTS: jsPDF standard fonts only (no embedding, offline): serif
          faces -> Times, monospace -> Courier, all else -> Helvetica.
   DEPENDS: Draftly.config, Draftly.hf, Draftly.pages, window.jspdf;
            Draftly.pdf (old html2canvas image PDF, fallback).
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.pdfgen = (function () {
  'use strict';
  var PX_MM = 25.4 / 96;      /* CSS px -> mm */
  var PX_PT = 0.75;           /* CSS px -> pt */
  /* cp1252 extras that jsPDF's standard fonts can write (WinAnsiEncoding) */
  var WINANSI = '\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178';
  var ZW = /[\u200b\u200c\u200d\ufeff\u00ad]/g;

  function cfg() { return Draftly.config; }
  function toast(m) { if (Draftly.ui && Draftly.ui.showToast) Draftly.ui.showToast(m); }

  /* true when every character can be written with a standard font */
  function latinOk(text) {
    text = String(text || '').replace(ZW, '');
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c > 255 && WINANSI.indexOf(text.charAt(i)) === -1) return false;
    }
    return true;
  }
  function htmlText(html) { var d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent; }
  function canUse(htmlList, hfList) {
    var all = (htmlList || []).map(htmlText).join('\n');
    (hfList || []).forEach(function (hf) { if (hf) all += hf.head.join(' ') + hf.foot.join(' '); });
    return latinOk(all);
  }

  /* -------------------------------------------- page geometry (mm) */
  function geometry() {
    var c = cfg(), ps = c.paperSizes[c.paperSize] || c.paperSizes.A4;
    var land = document.body.classList.contains(c.landscapeClass);
    var w = (land ? ps.heightCm : ps.widthCm) * 10, h = (land ? ps.widthCm : ps.heightCm) * 10;
    return { land: land, w: w, h: h, mt: c.marginTopCm * 10, mb: c.marginBottomCm * 10, ml: c.marginLeftCm * 10, mr: c.marginRightCm * 10 };
  }

  /* -------------------------------------------- style helpers */
  function rgb(v) {
    var m = /rgba?\(([^)]+)\)/.exec(v || '');
    if (!m) return null;
    var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
    if (p.length >= 4 && p[3] === 0) return null;
    return [p[0] | 0, p[1] | 0, p[2] | 0];
  }
  function pdfFont(family) {
    var f = String(family || '').toLowerCase().split(',')[0].replace(/['"]/g, '').trim();
    if (/mono|courier|consol|menlo/.test(f)) return 'courier';
    if (/times|tinos|serif|georgia|garamond|cambria|book|palatino|liberation serif|baskerville/.test(f) && !/sans/.test(f)) return 'times';
    return 'helvetica';
  }
  function fontStyle(cs) {
    var b = (parseInt(cs.fontWeight, 10) || 400) >= 600, i = /italic|oblique/.test(cs.fontStyle);
    return b && i ? 'bolditalic' : b ? 'bold' : i ? 'italic' : 'normal';
  }
  /* underline / line-through from the element and its ancestors up to root */
  function decoration(el, root, cache) {
    if (!el || el === root) return '';
    if (cache.has(el)) return cache.get(el);
    var own = getComputedStyle(el).textDecorationLine || '';
    var d = own + ' ' + decoration(el.parentElement, root, cache);
    cache.set(el, d);
    return d;
  }

  /* -------------------------------------------- measure box */
  function measureBox(html) {
    var paper = document.querySelector('.paper'), ed = document.querySelector('.paper .editor');
    var p = paper ? paper.cloneNode(false) : document.createElement('div');
    var e = ed ? ed.cloneNode(false) : document.createElement('div');
    p.removeAttribute('id'); e.removeAttribute('id');
    if (!ed) e.className = 'editor';
    e.removeAttribute('contenteditable');
    p.classList.add('dl-pdf-measure');
    p.setAttribute('aria-hidden', 'true');
    p.style.cssText += ';position:absolute;left:-20000px;top:0;height:auto;min-height:0;overflow:visible;box-shadow:none;transition:none;visibility:visible;';
    e.style.cssText += ';height:auto;overflow:visible;color:#000;opacity:1;';
    e.innerHTML = html;
    p.appendChild(e);
    document.body.appendChild(p);
    return { paper: p, ed: e };
  }
  function waitImages(root) {
    var imgs = Array.prototype.slice.call(root.querySelectorAll('img'));
    return Promise.all(imgs.map(function (im) {
      if (im.complete && im.naturalWidth) return null;
      return (im.decode ? im.decode() : Promise.resolve()).catch(function () { return null; });
    }));
  }
  function imageData(im) {
    var src = im.getAttribute('src') || '';
    var m = /^data:image\/(png|jpe?g)/i.exec(src);
    if (m) return { data: src, fmt: /png/i.test(m[1]) ? 'PNG' : 'JPEG' };
    try {   /* GIF / WebP / SVG / files: redraw as PNG (may fail on file:// for non-data src) */
      var c = document.createElement('canvas');
      c.width = im.naturalWidth || im.width; c.height = im.naturalHeight || im.height;
      if (!c.width || !c.height) return null;
      c.getContext('2d').drawImage(im, 0, 0);
      return { data: c.toDataURL('image/png'), fmt: 'PNG' };
    } catch (e) { return null; }
  }

  /* -------------------------------------------- collect draw ops
     Each op: {t, b (px from editor top), kind, ...}. Ops inside a table
     row carry row = that <tr> so the row moves to the next page whole. */
  function collect(ed) {
    var base = ed.getBoundingClientRect(), ops = [], deco = new Map();
    function rel(r) { return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height }; }
    function rowOf(el) { var tr = el.closest ? el.closest('tr') : null; return tr && ed.contains(tr) ? tr : null; }

    /* text, word by word (keeps justify and wrapping exactly) */
    var tw = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT, null), node;
    var range = document.createRange();
    while ((node = tw.nextNode())) {
      var el = node.parentElement;
      if (!el || el.closest('.dr-pagebreak')) continue;
      var cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      var txt = node.nodeValue, re = /[^\s]+/g, mm;
      var font = pdfFont(cs.fontFamily), style = fontStyle(cs), px = parseFloat(cs.fontSize) || 16;
      var col = rgb(cs.color) || [0, 0, 0], dec = decoration(el, ed, deco);
      var bg = null, a = el;
      while (a && a !== ed && !bg) { if (getComputedStyle(a).display === 'inline') bg = rgb(getComputedStyle(a).backgroundColor); else break; a = a.parentElement; }
      var row = rowOf(el);
      while ((mm = re.exec(txt))) {
        var word = mm[0].replace(ZW, '');
        if (!word) continue;
        range.setStart(node, mm.index); range.setEnd(node, mm.index + mm[0].length);
        var rects = range.getClientRects();
        if (!rects.length) continue;
        if (rects.length > 1) {   /* a long word the browser broke over lines: place per character */
          for (var k = 0; k < mm[0].length; k++) {
            range.setStart(node, mm.index + k); range.setEnd(node, mm.index + k + 1);
            var rc = range.getClientRects()[0];
            if (!rc) continue;
            var q = rel(rc);
            ops.push({ kind: 'text', t: q.y, b: q.y + q.h, x: q.x, w: q.w, s: mm[0].charAt(k), font: font, style: style, px: px, col: col, dec: dec, bg: bg, row: row });
          }
          continue;
        }
        var r = rel(rects[0]);
        ops.push({ kind: 'text', t: r.y, b: r.y + r.h, x: r.x, w: r.w, s: word, font: font, style: style, px: px, col: col, dec: dec, bg: bg, row: row });
      }
    }

    /* list markers (::marker / ::before are not in the text) */
    Array.prototype.forEach.call(ed.querySelectorAll('li'), function (li) {
      var list = li.parentElement;
      if (!list) return;
      var cs = getComputedStyle(li), idx = 1, sib = li;
      while ((sib = sib.previousElementSibling)) if (sib.tagName === 'LI') idx++;
      var start = parseInt(list.getAttribute('start'), 10); if (isFinite(start)) idx += start - 1;
      var styleKey = list.getAttribute('data-style'), suffix = list.getAttribute('data-suffix');
      var lst = cs.listStyleType, mark;
      if (list.tagName === 'OL') {
        var kind = styleKey || (lst === 'lower-alpha' || lst === 'lower-latin' ? 'a' : lst === 'upper-alpha' || lst === 'upper-latin' ? 'A' : lst === 'lower-roman' ? 'i' : lst === 'upper-roman' ? 'I' : '1');
        var n = kind === 'a' ? alpha(idx) : kind === 'A' ? alpha(idx).toUpperCase() : kind === 'i' ? roman(idx) : kind === 'I' ? roman(idx).toUpperCase() : String(idx);
        mark = n + (suffix == null ? '.' : suffix === 'none' ? '' : suffix);
      } else {
        if (lst === 'none') return;
        mark = lst === 'circle' ? 'o' : lst === 'square' ? '\u25aa' : '\u2022';
        if (mark === '\u25aa') mark = '\u2022';
      }
      if (styleKey && getComputedStyle(li, '::before').content === 'none') return;
      /* first line box of the item */
      var r0 = null, w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT, null), tn;
      while ((tn = w.nextNode())) {
        if (!tn.nodeValue.trim()) continue;
        if (tn.parentElement && tn.parentElement.closest('li') !== li) break;
        var rg = document.createRange(); rg.selectNodeContents(tn);
        r0 = rg.getClientRects()[0]; break;
      }
      var lr = li.getBoundingClientRect();
      var top = r0 ? r0.top : lr.top, h = r0 ? r0.height : parseFloat(cs.fontSize) * 1.15;
      var px = parseFloat(cs.fontSize) || 16;
      var x = lr.left - base.left;
      ops.push({ kind: 'text', t: top - base.top, b: top - base.top + h, x: x, w: 0, s: mark, font: pdfFont(cs.fontFamily), style: 'normal', px: px,
        col: rgb(cs.color) || [0, 0, 0], dec: '', bg: null, row: rowOf(li), marker: styleKey ? 'before' : 'outside' });
    });

    /* images */
    Array.prototype.forEach.call(ed.querySelectorAll('img'), function (im) {
      var r = rel(im.getBoundingClientRect());
      if (r.w < 1 || r.h < 1) return;
      var d = imageData(im);
      if (!d) { console.warn('draftly pdf: image skipped'); return; }
      ops.push({ kind: 'img', t: r.y, b: r.y + r.h, x: r.x, w: r.w, h: r.h, img: d, row: rowOf(im) });
    });

    /* table cells: background + borders */
    Array.prototype.forEach.call(ed.querySelectorAll('td, th'), function (td) {
      var cs = getComputedStyle(td), r = rel(td.getBoundingClientRect());
      var sides = ['Top', 'Right', 'Bottom', 'Left'].map(function (s) {
        var w = parseFloat(cs['border' + s + 'Width']) || 0;
        return cs['border' + s + 'Style'] === 'none' || cs['border' + s + 'Style'] === 'hidden' ? 0 : w;
      });
      var cols = ['Top', 'Right', 'Bottom', 'Left'].map(function (s) { return rgb(cs['border' + s + 'Color']) || [0, 0, 0]; });
      ops.unshift({ kind: 'cell', t: r.y, b: r.y + r.h, x: r.x, w: r.w, h: r.h, sides: sides, cols: cols, bg: rgb(cs.backgroundColor), row: rowOf(td) });
    });

    /* manual page breaks */
    Array.prototype.forEach.call(ed.querySelectorAll('.dr-pagebreak, [style*="page-break-before"]'), function (pb) {
      var r = rel(pb.getBoundingClientRect());
      ops.push({ kind: 'break', t: r.y, b: r.y + Math.max(r.h, 0.01), row: null });
    });
    return ops;
  }
  function alpha(n) { var s = ''; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; }
  function roman(n) {
    var v = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1], s = ['m', 'cm', 'd', 'cd', 'c', 'xc', 'l', 'xl', 'x', 'ix', 'v', 'iv', 'i'], o = '';
    for (var i = 0; i < v.length; i++) while (n >= v[i]) { o += s[i]; n -= v[i]; }
    return o;
  }

  /* -------------------------------------------- pagination
     Units = table rows, or runs of vertically overlapping ops (one line).
     A unit that does not fit in what is left of the page moves down to
     the next page (unless it is taller than a page). */
  function paginate(ops, pageH) {
    var units = [], byRow = new Map();
    ops.forEach(function (op) {
      if (op.row) {
        var u = byRow.get(op.row);
        if (!u) { u = { t: op.t, b: op.b, ops: [], row: true }; byRow.set(op.row, u); units.push(u); }
        u.ops.push(op); u.t = Math.min(u.t, op.t); u.b = Math.max(u.b, op.b);
      } else units.push({ t: op.t, b: op.b, ops: [op], brk: op.kind === 'break' });
    });
    units.sort(function (a, b) { return a.t - b.t || a.b - b.b; });
    var merged = [];
    units.forEach(function (u) {
      var last = merged[merged.length - 1];
      if (last && !u.row && !last.row && !u.brk && !last.brk && u.t < last.b - 1) { last.ops = last.ops.concat(u.ops); last.b = Math.max(last.b, u.b); }
      else merged.push(u);
    });
    var offset = 0, pages = 1;
    merged.forEach(function (u) {
      var t = u.t + offset, b = u.b + offset, pg = Math.floor(t / pageH);
      if (u.brk) {
        offset += (pg + 1) * pageH - t;
        u.page = -1;
        pages = Math.max(pages, pg + 2);
        return;
      }
      if (b > (pg + 1) * pageH + 0.5 && (u.b - u.t) <= pageH && t > pg * pageH + 0.5) { offset += (pg + 1) * pageH - t; t = u.t + offset; pg++; }
      u.page = pg; u.dy = offset - pg * pageH;
      pages = Math.max(pages, pg + 1, Math.floor((u.b + offset - 0.5) / pageH) + 1);
    });
    return { units: merged, pages: pages };
  }

  /* -------------------------------------------- drawing */
  function drawOp(doc, op, g, dy) {
    var X = function (px) { return g.ml + px * PX_MM; }, Y = function (px) { return g.mt + (px + dy) * PX_MM; };
    if (op.kind === 'cell') {
      if (op.bg) { doc.setFillColor(op.bg[0], op.bg[1], op.bg[2]); doc.rect(X(op.x), Y(op.t), op.w * PX_MM, op.h * PX_MM, 'F'); }
      var x0 = X(op.x), y0 = Y(op.t), x1 = X(op.x + op.w), y1 = Y(op.t + op.h);
      var lines = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x0, y1, x1, y1], [x0, y0, x0, y1]];
      for (var i = 0; i < 4; i++) {
        if (!op.sides[i]) continue;
        doc.setDrawColor(op.cols[i][0], op.cols[i][1], op.cols[i][2]);
        doc.setLineWidth(Math.max(op.sides[i], 0.5) * PX_MM);
        doc.line(lines[i][0], lines[i][1], lines[i][2], lines[i][3]);
      }
    } else if (op.kind === 'img') {
      try { doc.addImage(op.img.data, op.img.fmt, X(op.x), Y(op.t), op.w * PX_MM, op.h * PX_MM, undefined, 'FAST'); }
      catch (e) { console.warn('draftly pdf: image failed', e); }
    } else if (op.kind === 'text') {
      var pt = op.px * PX_PT;
      doc.setFont(op.font, op.style); doc.setFontSize(pt);
      doc.setTextColor(op.col[0], op.col[1], op.col[2]);
      var base = op.b - op.px * 0.215;     /* content box bottom minus descent -> baseline */
      var x = op.x;
      if (op.marker === 'outside') x = op.x - doc.getTextWidth(op.s + ' ') / PX_MM;
      if (op.bg) { doc.setFillColor(op.bg[0], op.bg[1], op.bg[2]); doc.rect(X(op.x), Y(op.t), op.w * PX_MM, (op.b - op.t) * PX_MM, 'F'); }
      doc.text(op.s, X(x), Y(base), { baseline: 'alphabetic' });
      if (/underline|line-through/.test(op.dec)) {
        doc.setDrawColor(op.col[0], op.col[1], op.col[2]); doc.setLineWidth(Math.max(pt / 18, 0.2) * 25.4 / 72);
        var w = op.w * PX_MM;
        if (/underline/.test(op.dec)) doc.line(X(op.x), Y(base + op.px * 0.1), X(op.x) + w, Y(base + op.px * 0.1));
        if (/line-through/.test(op.dec)) doc.line(X(op.x), Y(base - op.px * 0.28), X(op.x) + w, Y(base - op.px * 0.28));
      }
    }
  }
  function drawHf(doc, g, slots, top, page, pages) {
    if (!slots || !slots.join('').trim()) return;
    var c = cfg(), pt = 10, colW = (g.w - g.ml - g.mr) / 3;
    doc.setFont(pdfFont(c.fontFamily), 'normal'); doc.setFontSize(pt); doc.setTextColor(0, 0, 0);
    var y = top ? c.marginTopCm * 4 + pt * 0.3528 * 0.95 : g.h - c.marginBottomCm * 4 - pt * 0.3528 * 0.3;
    slots.forEach(function (t, k) {
      var s = String(t || '').replace(/\{date\}/g, Draftly.hf && Draftly.hf.today ? Draftly.hf.today() : '')
        .replace(/\{page\}/g, String(page)).replace(/\{pages\}/g, String(pages));
      if (!s) return;
      s.split(/\r?\n/).forEach(function (line, li) {
        var yy = top ? y + li * pt * 0.3528 * 1.2 : y;
        if (k === 0) doc.text(line, g.ml, yy);
        else if (k === 1) doc.text(line, g.ml + colW * 1.5, yy, { align: 'center' });
        else doc.text(line, g.w - g.mr, yy, { align: 'right' });
      });
    });
  }

  /* One part (document / merge row) -> pages added to doc. */
  function renderPart(doc, part, g, first) {
    var box = measureBox(part.html);
    return waitImages(box.ed).then(function () {
      var ops = collect(box.ed);
      var pageH = (g.h - g.mt - g.mb) / PX_MM;
      var p = paginate(ops, pageH);
      for (var i = 0; i < p.pages; i++) {
        if (!(first && i === 0)) doc.addPage([Math.min(g.w, g.h), Math.max(g.w, g.h)], g.land ? 'landscape' : 'portrait');
        var pageNo = doc.getNumberOfPages();
        p.units.forEach(function (u) {
          if (u.page !== i) return;
          u.ops.forEach(function (op) { drawOp(doc, op, g, u.dy); });
        });
        doc.setPage(pageNo);
        if (part.hf) { drawHf(doc, g, part.hf.head, true, i + 1, p.pages); drawHf(doc, g, part.hf.foot, false, i + 1, p.pages); }
      }
      box.paper.remove();
      return p.pages;
    }, function (e) { box.paper.remove(); throw e; });
  }

  function render(parts, opts) {
    opts = opts || {};
    if (!window.jspdf || !window.jspdf.jsPDF) return Promise.reject(new Error('jsPDF missing'));
    var g = geometry();
    var doc = new window.jspdf.jsPDF({ orientation: g.land ? 'landscape' : 'portrait', unit: 'mm', format: [Math.min(g.w, g.h), Math.max(g.w, g.h)], compress: true });
    doc.setProperties({ title: opts.title || 'Draftly document', creator: 'Draftly (Hub)' });
    var i = 0;
    function next() {
      if (i >= parts.length) return Promise.resolve(doc);
      var k = i++;
      if (opts.onProgress) opts.onProgress(k, parts.length);
      if (opts.cancelled && opts.cancelled()) return Promise.reject(new Error('cancelled'));
      return renderPart(doc, parts[k], g, k === 0).then(function () {
        return new Promise(function (res) { setTimeout(res, 0); });   /* repaint between rows */
      }).then(next);
    }
    return next();
  }

  /* Image fallback for parts with non-Latin text (mail merge rows): each part is
     drawn by html2canvas off screen and cut at page height (a line can be cut). */
  function renderImages(parts, opts) {
    opts = opts || {};
    if (typeof window.html2canvas !== 'function') return Promise.reject(new Error('html2canvas missing'));
    var g = geometry(), c = cfg();
    var doc = new window.jspdf.jsPDF({ orientation: g.land ? 'landscape' : 'portrait', unit: 'mm', format: [Math.min(g.w, g.h), Math.max(g.w, g.h)], compress: true });
    var pageHpx = (g.h - g.mt - g.mb) / PX_MM, i = 0, firstPage = true;
    function next() {
      if (i >= parts.length) return Promise.resolve(doc);
      var part = parts[i++];
      if (opts.onProgress) opts.onProgress(i - 1, parts.length);
      if (opts.cancelled && opts.cancelled()) return Promise.reject(new Error('cancelled'));
      var box = measureBox(part.html);
      return waitImages(box.ed).then(function () {
        return window.html2canvas(box.ed, { scale: c.pdfScale || 2, backgroundColor: '#ffffff', logging: false, useCORS: true });
      }).then(function (cv) {
        box.paper.remove();
        var sc = cv.width / box.ed.offsetWidth, n = Math.max(1, Math.ceil(cv.height / sc / pageHpx - 0.01));
        for (var k = 0; k < n; k++) {
          if (!firstPage) doc.addPage([Math.min(g.w, g.h), Math.max(g.w, g.h)], g.land ? 'landscape' : 'portrait');
          firstPage = false;
          var sl = document.createElement('canvas'), hpx = Math.min(pageHpx * sc, cv.height - k * pageHpx * sc);
          sl.width = cv.width; sl.height = Math.max(1, Math.round(hpx));
          var cx = sl.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, sl.width, sl.height);
          cx.drawImage(cv, 0, -Math.round(k * pageHpx * sc));
          doc.addImage(sl.toDataURL('image/jpeg', c.pdfJpegQuality || 0.92), 'JPEG', g.ml, g.mt, sl.width / sc * PX_MM, sl.height / sc * PX_MM, undefined, 'FAST');
          if (part.hf) {   /* header / footer text still real text when it is Latin */
            if (latinOk(part.hf.head.join('') + part.hf.foot.join(''))) { drawHf(doc, g, part.hf.head, true, k + 1, n); drawHf(doc, g, part.hf.foot, false, k + 1, n); }
          }
        }
      }, function (e) { box.paper.remove(); throw e; }).then(next);
    }
    return next();
  }

  /* The open document's body HTML (continuations joined, no marks). */
  function docHtml() {
    var h = Draftly.pages && Draftly.pages.combinedHtml ? Draftly.pages.combinedHtml() : Draftly.flow.joinedHtml();
    var d = document.createElement('div'); d.innerHTML = h;
    if (Draftly.editor && Draftly.editor.stripMarks) Draftly.editor.stripMarks(d);
    return d.innerHTML;
  }
  function hfData() { return Draftly.hf && !Draftly.hf.isEmpty() ? { head: Draftly.hf.data.head.slice(), foot: Draftly.hf.data.foot.slice() } : null; }

  function fileName(suffix) {
    var name = (Draftly.storage && Draftly.storage.currentName()) || cfg().pdfFileName || 'document';
    name = String(name).replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document';
    return name + (suffix || '') + '.pdf';
  }

  var busy = false;
  /* Real-text PDF of the open document (the template, when in Merge). */
  function exportTemplate() {
    if (busy) return;
    var html = docHtml(), hf = hfData();
    if (!canUse([html], [hf])) {
      toast('Text outside Latin letters: making an image PDF instead');
      Draftly.pdf.download();
      return;
    }
    busy = true;
    if (Draftly.editor) Draftly.editor.saveSelection();
    toast('Making PDF\u2026');
    render([{ html: html, hf: hf }], { title: fileName('').replace(/\.pdf$/, '') }).then(function (doc) {
      doc.save(fileName(''));
      toast('PDF downloaded');
    }).catch(function (e) {
      console.warn('draftly pdf: real-text PDF failed, using the image PDF', e);
      busy = false;
      Draftly.pdf.download();
    }).then(function () { busy = false; if (Draftly.editor) Draftly.editor.restoreSelection(); });
  }

  /* File > Export PDF. With merge data loaded, Merge decides (template / rows). */
  function exportDocument() {
    var M = Draftly.merge, U = Draftly.mergeUi;
    if (M && M.data && M.count() && U && U.pdfDialog) { U.pdfDialog(true); return; }
    exportTemplate();
  }

  return { render: render, renderImages: renderImages, canUse: canUse, latinOk: latinOk, exportDocument: exportDocument, exportTemplate: exportTemplate,
    fileName: fileName, docHtml: docHtml, hfData: hfData, _paginate: paginate };
})();
