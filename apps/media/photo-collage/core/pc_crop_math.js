/**
 * Photo Collage — Pure crop normalization, rotation mapping, and drag geometry (core/pc_crop_math.js)
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PhotoCollageCore = root.PhotoCollageCore || {};
  root.PhotoCollageCore.cropMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var MIN_CROP_SIZE = 0.05;

  function roundCropVal(v) {
    return Math.round(v * 10000) / 10000;
  }

  function normalizeCrop(crop) {
    if (!crop || typeof crop !== 'object') return null;
    var x = Number(crop.x);
    var y = Number(crop.y);
    var w = Number(crop.w);
    var h = Number(crop.h);
    if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) {
      return null;
    }
    x = Math.max(0, Math.min(1 - MIN_CROP_SIZE, x));
    y = Math.max(0, Math.min(1 - MIN_CROP_SIZE, y));
    w = Math.max(MIN_CROP_SIZE, Math.min(1 - x, w));
    h = Math.max(MIN_CROP_SIZE, Math.min(1 - y, h));
    if (x <= 0.001 && y <= 0.001 && w >= 0.999 && h >= 0.999) {
      return null;
    }
    return {
      x: roundCropVal(x),
      y: roundCropVal(y),
      w: roundCropVal(w),
      h: roundCropVal(h)
    };
  }

  function cropToVisual(crop, rotation) {
    var c = normalizeCrop(crop) || { x: 0, y: 0, w: 1, h: 1 };
    var rot = (((rotation || 0) % 360) + 360) % 360;
    if (rot === 90) {
      return { x: roundCropVal(1 - (c.y + c.h)), y: c.x, w: c.h, h: c.w };
    }
    if (rot === 180) {
      return { x: roundCropVal(1 - (c.x + c.w)), y: roundCropVal(1 - (c.y + c.h)), w: c.w, h: c.h };
    }
    if (rot === 270) {
      return { x: c.y, y: roundCropVal(1 - (c.x + c.w)), w: c.h, h: c.w };
    }
    return { x: c.x, y: c.y, w: c.w, h: c.h };
  }

  function visualToCrop(vcrop, rotation) {
    if (!vcrop || typeof vcrop !== 'object') return null;
    var x = Number(vcrop.x);
    var y = Number(vcrop.y);
    var w = Number(vcrop.w);
    var h = Number(vcrop.h);
    if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return null;
    var rot = (((rotation || 0) % 360) + 360) % 360;
    var orig;
    if (rot === 90) {
      orig = { x: y, y: 1 - (x + w), w: h, h: w };
    } else if (rot === 180) {
      orig = { x: 1 - (x + w), y: 1 - (y + h), w: w, h: h };
    } else if (rot === 270) {
      orig = { x: 1 - (y + h), y: x, w: h, h: w };
    } else {
      orig = { x: x, y: y, w: w, h: h };
    }
    return normalizeCrop(orig);
  }

  function calcSourceCropRect(naturalW, naturalH, crop) {
    var nw = Math.max(1, Number(naturalW) || 1);
    var nh = Math.max(1, Number(naturalH) || 1);
    var c = normalizeCrop(crop);
    if (!c) {
      return { sx: 0, sy: 0, sw: nw, sh: nh };
    }
    var sx = Math.max(0, Math.min(nw - 1, Math.round(c.x * nw)));
    var sy = Math.max(0, Math.min(nh - 1, Math.round(c.y * nh)));
    var sw = Math.max(1, Math.min(nw - sx, Math.round(c.w * nw)));
    var sh = Math.max(1, Math.min(nh - sy, Math.round(c.h * nh)));
    return { sx: sx, sy: sy, sw: sw, sh: sh };
  }

  function computeAspectCropRect(visualImgW, visualImgH, targetAspect) {
    var imgW = Math.max(1, Number(visualImgW) || 1);
    var imgH = Math.max(1, Number(visualImgH) || 1);
    var aspect = Number(targetAspect);
    if (!isFinite(aspect) || aspect <= 0) {
      return { x: 0, y: 0, w: 1, h: 1 };
    }
    var imgAspect = imgW / imgH;
    var w = 1;
    var h = 1;
    if (aspect > imgAspect) {
      w = 1;
      h = imgAspect / aspect;
    } else {
      h = 1;
      w = aspect / imgAspect;
    }
    w = Math.max(MIN_CROP_SIZE, Math.min(1, w));
    h = Math.max(MIN_CROP_SIZE, Math.min(1, h));
    return {
      x: roundCropVal((1 - w) / 2),
      y: roundCropVal((1 - h) / 2),
      w: roundCropVal(w),
      h: roundCropVal(h)
    };
  }

  function stepCropBoxDrag(startBox, handle, dx, dy, visualW, visualH, aspect) {
    var base = {
      x: Number(startBox.x) || 0,
      y: Number(startBox.y) || 0,
      w: Math.max(MIN_CROP_SIZE, Number(startBox.w) || 1),
      h: Math.max(MIN_CROP_SIZE, Number(startBox.h) || 1)
    };
    if (handle === 'move') {
      return {
        x: roundCropVal(Math.max(0, Math.min(1 - base.w, base.x + dx))),
        y: roundCropVal(Math.max(0, Math.min(1 - base.h, base.y + dy))),
        w: roundCropVal(base.w),
        h: roundCropVal(base.h)
      };
    }

    var left = base.x;
    var top = base.y;
    var right = base.x + base.w;
    var bottom = base.y + base.h;

    if (!aspect || !isFinite(aspect) || aspect <= 0) {
      if (handle.indexOf('w') !== -1) left = Math.max(0, Math.min(right - MIN_CROP_SIZE, base.x + dx));
      if (handle.indexOf('e') !== -1) right = Math.min(1, Math.max(left + MIN_CROP_SIZE, base.x + base.w + dx));
      if (handle.indexOf('n') !== -1) top = Math.max(0, Math.min(bottom - MIN_CROP_SIZE, base.y + dy));
      if (handle.indexOf('s') !== -1) bottom = Math.min(1, Math.max(top + MIN_CROP_SIZE, base.y + base.h + dy));
      return {
        x: roundCropVal(left),
        y: roundCropVal(top),
        w: roundCropVal(right - left),
        h: roundCropVal(bottom - top)
      };
    }

    // Aspect-locked resize
    var vw = Math.max(1, Number(visualW) || 1);
    var vh = Math.max(1, Number(visualH) || 1);
    var normRatio = aspect * (vh / vw);
    var minW = Math.max(MIN_CROP_SIZE, MIN_CROP_SIZE * normRatio);
    var minH = Math.max(MIN_CROP_SIZE, MIN_CROP_SIZE / normRatio);

    var anchorX = handle.indexOf('w') !== -1 ? right : left;
    var anchorY = handle.indexOf('n') !== -1 ? bottom : top;
    var dirX = handle.indexOf('w') !== -1 ? -1 : 1;
    var dirY = handle.indexOf('n') !== -1 ? -1 : 1;

    var maxW = dirX < 0 ? anchorX : (1 - anchorX);
    var maxH = dirY < 0 ? anchorY : (1 - anchorY);

    var nextW, nextH;
    if (handle === 'n' || handle === 's') {
      maxW = 1 - left;
      var rawH = Math.max(minH, Math.min(maxH, base.h + dirY * dy));
      nextH = Math.min(rawH, maxW / normRatio);
      nextW = nextH * normRatio;
      return {
        x: roundCropVal(left),
        y: roundCropVal(handle === 'n' ? anchorY - nextH : anchorY),
        w: roundCropVal(nextW),
        h: roundCropVal(nextH)
      };
    }
    if (handle === 'e' || handle === 'w') {
      maxH = 1 - top;
      var rawW = Math.max(minW, Math.min(maxW, base.w + dirX * dx));
      nextW = Math.min(rawW, maxH * normRatio);
      nextH = nextW / normRatio;
      return {
        x: roundCropVal(handle === 'w' ? anchorX - nextW : anchorX),
        y: roundCropVal(top),
        w: roundCropVal(nextW),
        h: roundCropVal(nextH)
      };
    }

    // Corner handles: nw, ne, se, sw
    var candW = base.w + dirX * dx;
    var candH = base.h + dirY * dy;
    var rawCornerW = Math.abs(dx) >= Math.abs(dy) ? candW : (candH * normRatio);
    var clampedMaxW = Math.min(maxW, maxH * normRatio);
    nextW = Math.max(minW, Math.min(clampedMaxW, rawCornerW));
    nextH = nextW / normRatio;
    return {
      x: roundCropVal(dirX < 0 ? anchorX - nextW : anchorX),
      y: roundCropVal(dirY < 0 ? anchorY - nextH : anchorY),
      w: roundCropVal(nextW),
      h: roundCropVal(nextH)
    };
  }

  return {
    MIN_CROP_SIZE: MIN_CROP_SIZE,
    roundCropVal: roundCropVal,
    normalizeCrop: normalizeCrop,
    cropToVisual: cropToVisual,
    visualToCrop: visualToCrop,
    calcSourceCropRect: calcSourceCropRect,
    computeAspectCropRect: computeAspectCropRect,
    stepCropBoxDrag: stepCropBoxDrag
  };
});
