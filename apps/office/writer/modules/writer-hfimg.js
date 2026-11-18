/* ============================================================
   FILE: modules/writer-hfimg.js
   PROJECT: Writer
   ROLE: DW11 header / footer pictures, the pure part (no DOM).
         Each header / footer slot (left, centre, right) may hold
         one small picture, e.g. a logo, drawn before its text.
   MODEL: hf.img = { head: [pic|null x3], foot: [pic|null x3] }
          pic   = { src: 'data:image/png|jpeg|gif|webp;base64,...',
                    size: 'S' | 'M' | 'L' }
          Sizes are picture heights: S 8 mm, M 14 mm, L 20 mm, cut
          down to what fits inside the page margin, so a picture
          never reaches the body text.
   ENTRY: Writer.hfimg.normalize(hf) -> { head, foot, img }
          Writer.hfimg.normPics(img) -> img with 2 x 3 slots
          Writer.hfimg.hasAny(img) -> true when any slot has a picture
          Writer.hfimg.heightMm(size, marginMm) -> picture height (mm)
          Writer.hfimg.fit(ar, size, marginMm, colMm) -> { w, h } mm
          Writer.hfimg.boxTop(marginMm, boxHmm) -> mm from the page
            edge to the box (head: top edge, foot: bottom edge)
          Writer.hfimg.place(k, picW, textW, g) -> { picX, textX }
          All UMD: loaded by writer.html and by node tests.
   ============================================================ */
(function (root) {
  'use strict';

  var I = {};
  I.SIZES = { S: 8, M: 14, L: 20 };     /* picture height in mm */
  I.DEFAULT = 'M';
  I.MAX_PX = 600;                        /* longest side kept for a header picture */
  I.MAX_SRC = 3 * 1024 * 1024;           /* data URL length cap per picture */
  I.MIN_MM = 3;                          /* smallest height drawn */
  I.EDGE_MM = 1;                         /* gap to the paper edge */
  I.GAP_MM = 1;                          /* gap to the body text */
  I.PIC_GAP_MM = 1.5;                    /* gap between picture and slot text */
  I.TEXT_MM = 10 * 0.3528 * 1.2;         /* one 10 pt header line */
  var SRC = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+\/=\s]+$/i;

  function textRow(a) {
    a = Array.isArray(a) ? a : [];
    return [0, 1, 2].map(function (i) { return a[i] == null ? '' : String(a[i]); });
  }

  I.normPic = function normPic(p) {
    if (!p || typeof p !== 'object' || typeof p.src !== 'string') return null;
    if (p.src.length > I.MAX_SRC || !SRC.test(p.src)) return null;
    var size = typeof p.size === 'string' ? p.size.toUpperCase() : '';
    return { src: p.src, size: I.SIZES[size] ? size : I.DEFAULT };
  };

  function picRow(a) {
    a = Array.isArray(a) ? a : [];
    return [0, 1, 2].map(function (i) { return I.normPic(a[i]); });
  }

  I.normPics = function normPics(img) {
    img = img && typeof img === 'object' ? img : {};
    return { head: picRow(img.head), foot: picRow(img.foot) };
  };

  I.blankPics = function blankPics() { return { head: [null, null, null], foot: [null, null, null] }; };

  I.hasAny = function hasAny(img) {
    if (!img) return false;
    var parts = ['head', 'foot'];
    for (var p = 0; p < 2; p++) {
      var row = img[parts[p]];
      if (!Array.isArray(row)) continue;
      for (var k = 0; k < 3; k++) if (row[k] && row[k].src) return true;
    }
    return false;
  };

  /* Any header / footer value (old, missing, broken) -> full shape. */
  I.normalize = function normalize(hf) {
    hf = hf && typeof hf === 'object' ? hf : {};
    return { head: textRow(hf.head), foot: textRow(hf.foot), img: I.normPics(hf.img) };
  };

  /* Height the size asks for, cut to what fits in the margin. */
  I.heightMm = function heightMm(size, marginMm) {
    var want = I.SIZES[size] || I.SIZES[I.DEFAULT];
    var room = (Number(marginMm) || 0) - I.EDGE_MM - I.GAP_MM;
    return Math.max(I.MIN_MM, Math.min(want, room));
  };

  /* Picture box (mm) for aspect ratio ar (w / h), never wider than the column. */
  I.fit = function fit(ar, size, marginMm, colMm) {
    ar = Number(ar) > 0 && isFinite(ar) ? Number(ar) : 1;
    var h = I.heightMm(size, marginMm), w = h * ar;
    var maxW = Math.max(1, (Number(colMm) || 0) * 0.9);
    if (w > maxW) { w = maxW; h = w / ar; }
    return { w: w, h: h };
  };

  /* Distance from the page edge to the header / footer box so a box of
     boxH sits centred in the margin, at least EDGE_MM from the edge. */
  I.boxTop = function boxTop(marginMm, boxH) {
    return Math.max(I.EDGE_MM, ((Number(marginMm) || 0) - boxH) / 2);
  };

  /* Horizontal place (mm) of picture + text in slot k (0 left, 1 centre,
     2 right). g = { w, ml, mr } page width and margins in mm. textX is
     the left edge of the text. */
  I.place = function place(k, picW, textW, g) {
    var gap = picW && textW ? I.PIC_GAP_MM : 0;
    var total = picW + gap + textW, colW = (g.w - g.ml - g.mr) / 3, x;
    if (k === 0) x = g.ml;
    else if (k === 1) x = g.ml + colW * 1.5 - total / 2;
    else x = g.w - g.mr - total;
    return { picX: x, textX: x + picW + gap };
  };

  /* Pixel size to downscale a picture to (keeps aspect, longest side MAX_PX). */
  I.scaleTo = function scaleTo(w, h, max) {
    max = max || I.MAX_PX;
    if (!(w > 0 && h > 0)) return { w: 0, h: 0 };
    var s = Math.min(1, max / Math.max(w, h));
    return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
  };

  if (typeof module === 'object' && module.exports) module.exports = I;
  if (root) {
    root.Writer = root.Writer || {};
    root.Writer.hfimg = I;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
