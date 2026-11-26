/**
 * Photo Collage — Offscreen cropped image preview LRU cache (core/pc_crop_cache.js)
 */
(function (root, factory) {
  var cropMath = (typeof require === 'function' && typeof module === 'object')
    ? require('./pc_crop_math.js')
    : (root.PhotoCollageCore && root.PhotoCollageCore.cropMath);
  var api = factory(cropMath);
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.PhotoCollageCore = root.PhotoCollageCore || {};
  root.PhotoCollageCore.cropCache = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (cropMath) {
  'use strict';

  var cropRenderCache = new Map();
  var MAX_CROP_CACHE = 40;

  function makeCropCacheKey(photo) {
    if (!photo || !photo.crop) return '';
    var c = cropMath.normalizeCrop(photo.crop);
    if (!c) return '';
    return photo.id + '|' + c.x + ',' + c.y + ',' + c.w + ',' + c.h + '|' + (photo.src ? photo.src.length : 0);
  }

  function getCachedCroppedUrl(photo) {
    var key = makeCropCacheKey(photo);
    return key ? (cropRenderCache.get(key) || null) : null;
  }

  function renderCroppedDataUrl(photo, callback) {
    if (!photo || !photo.src || typeof document === 'undefined' || typeof Image === 'undefined') {
      if (callback) callback(photo ? photo.src : '');
      return;
    }
    var c = cropMath.normalizeCrop(photo.crop);
    if (!c) {
      if (callback) callback(photo.src);
      return;
    }
    var key = makeCropCacheKey(photo);
    if (cropRenderCache.has(key)) {
      if (callback) callback(cropRenderCache.get(key));
      return;
    }
    var img = new Image();
    img.onload = function () {
      try {
        var rect = cropMath.calcSourceCropRect(img.naturalWidth, img.naturalHeight, c);
        var canvas = document.createElement('canvas');
        canvas.width = rect.sw;
        canvas.height = rect.sh;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh);
        var isJpeg = /^data:image\/jpe?g/i.test(photo.src);
        var outUrl = isJpeg ? canvas.toDataURL('image/jpeg', 0.94) : canvas.toDataURL('image/png');
        if (cropRenderCache.size >= MAX_CROP_CACHE) {
          var oldestKey = cropRenderCache.keys().next().value;
          cropRenderCache.delete(oldestKey);
        }
        cropRenderCache.set(key, outUrl);
        if (callback) callback(outUrl);
      } catch (_) {
        if (callback) callback(photo.src);
      }
    };
    img.onerror = function () {
      if (callback) callback(photo.src);
    };
    img.src = photo.src;
  }

  return {
    makeCropCacheKey: makeCropCacheKey,
    getCachedCroppedUrl: getCachedCroppedUrl,
    renderCroppedDataUrl: renderCroppedDataUrl
  };
});
