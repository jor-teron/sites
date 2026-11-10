/* Image Converter — ic_edit.js: crop, rotate size, watermark placement. CI2 */
(function (root) {
  'use strict';

  function parseRatio(spec) {
    if (spec == null) return null;
    var s = String(spec).trim().toLowerCase();
    if (!s || s === 'none' || s === 'free') return null;
    if (s === 'passport') return 7 / 9;
    var m = s.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    var a = Number(m[1]);
    var b = Number(m[2]);
    if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return null;
    return a / b;
  }

  function sizeAfterRotate(w, h, rot) {
    rot = ((Number(rot) || 0) % 360 + 360) % 360;
    if (rot === 90 || rot === 270) return { width: h, height: w };
    return { width: w, height: h };
  }

  /**
   * Largest centred rectangle of the given width/height ratio inside srcW×srcH.
   * Returns pixel crop {x,y,w,h}. If ratio is null, the full image is used.
   */
  function centerCrop(srcW, srcH, ratio) {
    srcW = Math.max(1, Number(srcW) || 1);
    srcH = Math.max(1, Number(srcH) || 1);
    if (ratio == null || !isFinite(ratio) || ratio <= 0) {
      return { x: 0, y: 0, w: srcW, h: srcH };
    }
    var srcR = srcW / srcH;
    var w, h, x, y;
    if (srcR > ratio) {
      h = srcH;
      w = h * ratio;
      x = (srcW - w) / 2;
      y = 0;
    } else {
      w = srcW;
      h = w / ratio;
      x = 0;
      y = (srcH - h) / 2;
    }
    return { x: x, y: y, w: w, h: h };
  }

  function asCrop(crop) {
    if (!crop) return null;
    var x = Number(crop.x), y = Number(crop.y), w = Number(crop.w), h = Number(crop.h);
    if (![x, y, w, h].every(isFinite)) return null;
    return { x: x, y: y, w: w, h: h };
  }

  /**
   * Keep a crop inside the image. If ratio is set, lock the aspect.
   * Crop is in pixels. Minimum edge is 2 px.
   */
  function clampCrop(crop, srcW, srcH, ratio) {
    srcW = Math.max(1, Number(srcW) || 1);
    srcH = Math.max(1, Number(srcH) || 1);
    var c = asCrop(crop) || { x: 0, y: 0, w: srcW, h: srcH };
    var min = 2;
    if (ratio && isFinite(ratio) && ratio > 0) {
      var maxW = srcW;
      var maxH = srcH;
      var w = Math.min(Math.max(c.w, min), maxW);
      var h = w / ratio;
      if (h > maxH) { h = maxH; w = h * ratio; }
      if (w < min) { w = min; h = w / ratio; }
      if (h < min) { h = min; w = h * ratio; }
      w = Math.min(w, srcW);
      h = Math.min(h, srcH);
      var x = c.x;
      var y = c.y;
      if (x < 0) x = 0;
      if (y < 0) y = 0;
      if (x + w > srcW) x = srcW - w;
      if (y + h > srcH) y = srcH - h;
      if (x < 0) x = 0;
      if (y < 0) y = 0;
      return { x: x, y: y, w: w, h: h };
    }
    var w2 = Math.min(Math.max(c.w, min), srcW);
    var h2 = Math.min(Math.max(c.h, min), srcH);
    var x2 = c.x;
    var y2 = c.y;
    if (x2 < 0) x2 = 0;
    if (y2 < 0) y2 = 0;
    if (x2 + w2 > srcW) x2 = srcW - w2;
    if (y2 + h2 > srcH) y2 = srcH - h2;
    return { x: x2, y: y2, w: w2, h: h2 };
  }

  /** Convert a pixel crop to fractions of the source (0–1). */
  function cropToFrac(crop, srcW, srcH) {
    srcW = Math.max(1, Number(srcW) || 1);
    srcH = Math.max(1, Number(srcH) || 1);
    var c = asCrop(crop) || { x: 0, y: 0, w: srcW, h: srcH };
    return { x: c.x / srcW, y: c.y / srcH, w: c.w / srcW, h: c.h / srcH };
  }

  function fracToCrop(frac, srcW, srcH) {
    srcW = Math.max(1, Number(srcW) || 1);
    srcH = Math.max(1, Number(srcH) || 1);
    var f = asCrop(frac);
    if (!f) return { x: 0, y: 0, w: srcW, h: srcH };
    return { x: f.x * srcW, y: f.y * srcH, w: f.w * srcW, h: f.h * srcH };
  }

  /**
   * Resolve the pixel crop for an image.
   * settings.crop is a fraction rect (preferred, per item).
   * Otherwise a centred crop of settings.cropRatio is used.
   */
  function resolveCrop(srcW, srcH, settings) {
    settings = settings || {};
    var ratio = parseRatio(settings.cropRatio);
    if (settings.crop) {
      return clampCrop(fracToCrop(settings.crop, srcW, srcH), srcW, srcH, ratio);
    }
    return clampCrop(centerCrop(srcW, srcH, ratio), srcW, srcH, ratio);
  }

  var POSITIONS = [
    'top-left', 'top', 'top-right',
    'left', 'center', 'right',
    'bottom-left', 'bottom', 'bottom-right'
  ];

  /**
   * Top-left of a mark of size markW×markH on a canvas, given a named position.
   */
  function watermarkPosition(canvasW, canvasH, markW, markH, position, pad) {
    canvasW = Math.max(0, Number(canvasW) || 0);
    canvasH = Math.max(0, Number(canvasH) || 0);
    markW = Math.max(0, Number(markW) || 0);
    markH = Math.max(0, Number(markH) || 0);
    pad = pad == null ? Math.round(Math.min(canvasW, canvasH) * 0.03) : Number(pad) || 0;
    var pos = String(position || 'bottom-right').toLowerCase();
    var x = pad;
    var y = pad;
    var maxX = Math.max(0, canvasW - markW - pad);
    var maxY = Math.max(0, canvasH - markH - pad);
    var midX = Math.max(0, Math.round((canvasW - markW) / 2));
    var midY = Math.max(0, Math.round((canvasH - markH) / 2));
    if (pos === 'top' || pos === 'bottom' || pos === 'center') x = midX;
    if (pos === 'top-right' || pos === 'right' || pos === 'bottom-right') x = maxX;
    if (pos === 'left' || pos === 'center' || pos === 'right') y = midY;
    if (pos === 'bottom-left' || pos === 'bottom' || pos === 'bottom-right') y = maxY;
    if (pos === 'top-left' || pos === 'top' || pos === 'top-right') y = pad;
    return { x: x, y: y, pad: pad };
  }

  function watermarkSize(canvasW, canvasH, srcW, srcH, scalePct) {
    var pct = Number(scalePct);
    if (!isFinite(pct) || pct <= 0) pct = 20;
    var maxW = canvasW * (pct / 100);
    var maxH = canvasH * 0.4;
    srcW = Math.max(1, Number(srcW) || 1);
    srcH = Math.max(1, Number(srcH) || 1);
    var s = Math.min(maxW / srcW, maxH / srcH);
    return { width: Math.max(1, Math.round(srcW * s)), height: Math.max(1, Math.round(srcH * s)) };
  }

  var api = {
    parseRatio: parseRatio,
    sizeAfterRotate: sizeAfterRotate,
    centerCrop: centerCrop,
    clampCrop: clampCrop,
    cropToFrac: cropToFrac,
    fracToCrop: fracToCrop,
    resolveCrop: resolveCrop,
    POSITIONS: POSITIONS,
    watermarkPosition: watermarkPosition,
    watermarkSize: watermarkSize
  };

  root.ICEdit = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
