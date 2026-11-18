/* ============================================================
   FILE: modules/writer-hfimg.js
   PROJECT: Writer
   ROLE: DW11 header / footer pictures, the pure part (no DOM).
         DW13c: also the letterhead block model. The header (and the
         footer) is ONE full-width block: an optional picture on top,
         then any number of text lines, each aligned l / c / r. The
         block grows to fit; the body moves down (up for the footer).
   (before DW13c) Each header / footer slot (left, centre, right) may hold
         one small picture, e.g. a logo, drawn before its text.
   MODEL (DW13c, hf v 2):
          hf  = { v: 2, head: [line text], foot: [line text],
                  al: { head: ['l'|'c'|'r'], foot: [...] },
                  pic: { head: pic|null, foot: pic|null } }
          pic = { src: 'data:image/png|jpeg|gif|webp;base64,...',
                  h: height in mm (6..60), a: 'l'|'c'|'r' }
          Old shape (before DW13c, no v): { head: [3 slots], foot: [3],
          img: { head: [pic|null x3], foot } }, pic = { src, size S|M|L }.
          normalize() reads both and always returns v 2: each non-empty
          slot becomes its own line with that slot's alignment, the first
          slot picture (left, centre, right) becomes the picture at its
          preset height and its slot's alignment.
   (before DW13c) MODEL: hf.img = { head: [pic|null x3], foot: [pic|null x3] }
          pic   = { src: 'data:image/png|jpeg|gif|webp;base64,...',
                    size: 'S' | 'M' | 'L' }
          Sizes are picture heights: S 8 mm, M 14 mm, L 20 mm, cut
          down to what fits inside the page margin, so a picture
          never reaches the body text.
   ENTRY: Writer.hfimg.normalize(hf) -> v 2 block (DW13c; was the slot shape)
          Writer.hfimg.normalizeSlots(hf) -> old { head, foot, img } (before DW13c)
          Writer.hfimg.normPics(img) -> img with 2 x 3 slots (old shape)
          Writer.hfimg.hasAny(img) -> true when any slot has a picture
          Writer.hfimg.heightMm(size, marginMm) -> picture height (mm)
          Writer.hfimg.fit(ar, size, marginMm, colMm) -> { w, h } mm
          Writer.hfimg.boxTop(marginMm, boxHmm) -> mm from the page
            edge to the box (head: top edge, foot: bottom edge)
          Writer.hfimg.place(k, picW, textW, g) -> { picX, textX }
          DW13c: clampH, normBlockPic, fitPic, resizeH, blockMm, edgeMm,
          extraMm, picX, presetOf, lines, hasPic, isEmpty (see below).
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

  /* Any header / footer value (old, missing, broken) -> full shape.
     (before DW13c) this was I.normalize; it is the old 3-slot shape. */
  I.normalizeSlots = function normalizeSlots(hf) {
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


  /* ----- DW13c: one full-width block per header / footer ----------- */
  I.V = 2;
  I.MIN_H = 6;                           /* picture height clamp (mm) */
  I.MAX_H = 60;
  I.DEFAULT_H = 14;                      /* about three 10 pt lines */
  I.PRESETS = { S: 8, M: 14, L: 20 };    /* Picture… S / M / L */
  I.ALIGNS = ['l', 'c', 'r'];
  I.DEFAULT_ALIGN = 'c';                 /* new lines and pictures are centred */
  I.MAX_LINES = 30;
  I.MAX_LINE = 2000;
  var SLOT_ALIGN = ['l', 'c', 'r'];      /* old slot k -> alignment */

  I.clampH = function clampH(h) {
    h = Number(h);
    if (!isFinite(h)) h = I.DEFAULT_H;
    return Math.round(Math.max(I.MIN_H, Math.min(I.MAX_H, h)) * 100) / 100;
  };
  I.normAlign = function normAlign(a, def) {
    a = String(a || '').toLowerCase();
    if (a === 'left' || a === 'start') a = 'l';
    else if (a === 'center' || a === 'centre') a = 'c';
    else if (a === 'right' || a === 'end') a = 'r';
    return I.ALIGNS.indexOf(a) !== -1 ? a : (def || I.DEFAULT_ALIGN);
  };
  I.cssAlign = function cssAlign(a) { return { l: 'left', c: 'center', r: 'right' }[I.normAlign(a)]; };
  /* Picture: { src, h, a }; also takes an old { src, size } (preset height). */
  I.normBlockPic = function normBlockPic(p, defAlign) {
    if (!p || typeof p !== 'object' || typeof p.src !== 'string') return null;
    if (p.src.length > I.MAX_SRC || !SRC.test(p.src)) return null;
    var h = p.h;
    if (h == null) { var sz = typeof p.size === 'string' ? p.size.toUpperCase() : ''; h = I.PRESETS[sz] || I.DEFAULT_H; }
    return { src: p.src, h: I.clampH(h), a: I.normAlign(p.a, defAlign) };
  };
  function lineText(t) {
    t = t == null ? '' : String(t).replace(/[\r\n]+/g, ' ');
    return t.length > I.MAX_LINE ? t.slice(0, I.MAX_LINE) : t;
  }
  I.blank = function blank() {
    return { v: I.V, head: [], foot: [], al: { head: [], foot: [] }, pic: { head: null, foot: null } };
  };
  I.isBlock = function isBlock(hf) { return !!hf && typeof hf === 'object' && Number(hf.v) >= 2; };

  /* Old slot shape -> block. Non-empty slots become lines (left, centre,
     right order) with their slot's alignment; the first slot picture wins. */
  I.migrate = function migrate(old) {
    var o = I.normalizeSlots(old), out = I.blank();
    ['head', 'foot'].forEach(function (part) {
      for (var k = 0; k < 3; k++) {
        if (!o[part][k].trim()) continue;
        out[part].push(lineText(o[part][k]));
        out.al[part].push(SLOT_ALIGN[k]);
      }
      for (var j = 0; j < 3; j++) {
        var p = o.img[part][j];
        if (p) { out.pic[part] = I.normBlockPic({ src: p.src, size: p.size, a: SLOT_ALIGN[j] }); break; }
      }
    });
    return out;
  };

  /* Any header / footer value (block, old slots, missing, broken) -> block. */
  I.normalize = function normalize(hf) {
    if (!I.isBlock(hf)) return I.migrate(hf);
    var out = I.blank(), al = hf.al && typeof hf.al === 'object' ? hf.al : {}, pic = hf.pic && typeof hf.pic === 'object' ? hf.pic : {};
    ['head', 'foot'].forEach(function (part) {
      var lines = Array.isArray(hf[part]) ? hf[part].slice(0, I.MAX_LINES) : [];
      var as = Array.isArray(al[part]) ? al[part] : [];
      out[part] = lines.map(lineText);
      out.al[part] = lines.map(function (x, i) { return I.normAlign(as[i]); });
      out.pic[part] = I.normBlockPic(pic[part]);
    });
    /* blank lines are kept (spacing under the text); only an all-blank block becomes [] */
    ['head', 'foot'].forEach(function (part) {
      if (!out[part].join('').trim()) { out[part] = []; out.al[part] = []; }
    });
    return out;
  };

  I.hasPic = function hasPic(hf) { return !!(hf && hf.pic && (hf.pic.head || hf.pic.foot)); };
  I.partEmpty = function partEmpty(hf, part) {
    if (!hf) return true;
    if (hf.pic && hf.pic[part]) return false;
    return !(hf[part] || []).join('').trim();
  };
  I.isEmpty = function isEmpty(hf) { return I.partEmpty(hf, 'head') && I.partEmpty(hf, 'foot'); };

  /* Picture box (mm) at height h for aspect ar, never wider than the column. */
  I.fitPic = function fitPic(ar, h, colMm) {
    ar = Number(ar) > 0 && isFinite(ar) ? Number(ar) : 1;
    h = I.clampH(h);
    var w = h * ar, maxW = Math.max(1, Number(colMm) || 0);
    if (colMm && w > maxW) { w = maxW; h = w / ar; }
    return { w: w, h: h };
  };
  /* Corner drag: start height + the drag (mm, down / outwards is bigger),
     clamped. The width follows from the aspect ratio. */
  I.resizeH = function resizeH(startH, dyMm) { return I.clampH((Number(startH) || I.DEFAULT_H) + (Number(dyMm) || 0)); };
  /* 'S' | 'M' | 'L' when h is a preset, else ''. */
  I.presetOf = function presetOf(h) {
    for (var k in I.PRESETS) if (Math.abs(I.PRESETS[k] - h) < 0.05) return k;
    return '';
  };
  /* Height (mm) of a block: picture (picH, 0 for none) + gap + n text lines
     (at least one line is always counted, as before DW13c). */
  I.blockMm = function blockMm(nLines, picH) {
    var n = Math.max(1, nLines | 0), ph = Number(picH) || 0;
    return (ph > 0 ? ph + I.PIC_GAP_MM : 0) + n * I.TEXT_MM;
  };
  /* Distance from the paper edge to the block: 0.4 x the margin, as the
     one-line header always sat (headerfooter.css). */
  I.edgeMm = function edgeMm(marginMm) { return Math.max(0, (Number(marginMm) || 0) * 0.4); };
  /* How much further the body must move (mm) so a block of blockH never
     overlaps it: the body starts GAP_MM under the block. A plain one-line
     block needs nothing (it sits in the margin and looks as before). */
  I.extraMm = function extraMm(marginMm, blockH) {
    var m = Number(marginMm) || 0, e = I.edgeMm(m), b = Number(blockH) || 0;
    if (b <= I.TEXT_MM + 0.01) return 0;
    return Math.max(0, Math.round((e + b + I.GAP_MM - m) * 100) / 100);
  };
  /* Left edge (mm from the column's left) of a picture w wide, aligned a. */
  I.picX = function picX(a, w, colMm) {
    a = I.normAlign(a);
    if (a === 'l') return 0;
    if (a === 'r') return Math.max(0, colMm - w);
    return Math.max(0, (colMm - w) / 2);
  };
  /* Lines of a part with their alignment: [{ t, a }]. */
  I.lines = function lines(hf, part) {
    var ls = (hf && hf[part]) || [], al = (hf && hf.al && hf.al[part]) || [];
    return ls.map(function (t, i) { return { t: String(t == null ? '' : t), a: I.normAlign(al[i]) }; });
  };

  if (typeof module === 'object' && module.exports) module.exports = I;
  if (root) {
    root.Writer = root.Writer || {};
    root.Writer.hfimg = I;
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
