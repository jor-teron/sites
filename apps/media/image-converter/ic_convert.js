/* Image Converter — ic_convert.js: decode, edit, encode, optional EXIF write-back. CI3 */
(function (root) {
  'use strict';

  var H = root.ICHelpers;
  var E = root.ICExif;
  var avifKnown = null;
  var avifPending = null;

  function detectAvif() {
    if (avifKnown !== null) return Promise.resolve(avifKnown);
    if (avifPending) return avifPending;
    avifPending = new Promise(function (resolve) {
      try {
        if (typeof document === 'undefined' || !document.createElement) {
          avifKnown = false;
          resolve(false);
          return;
        }
        var c = document.createElement('canvas');
        c.width = 1;
        c.height = 1;
        if (typeof c.toBlob !== 'function') {
          avifKnown = false;
          resolve(false);
          return;
        }
        var done = false;
        var t = setTimeout(function () {
          if (done) return;
          done = true;
          avifKnown = false;
          resolve(false);
        }, 1500);
        c.toBlob(function (blob) {
          if (done) return;
          done = true;
          clearTimeout(t);
          avifKnown = !!(blob && blob.type === 'image/avif' && blob.size > 0);
          resolve(avifKnown);
        }, 'image/avif', 0.5);
      } catch (_) {
        avifKnown = false;
        resolve(false);
      }
    }).then(function (v) {
      avifPending = null;
      return v;
    });
    return avifPending;
  }

  function loadImageUrl(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('This browser could not open that image')); };
      img.src = url;
    });
  }

  function closeBitmap(bmp) {
    if (bmp && typeof bmp.close === 'function') {
      try { bmp.close(); } catch (_) { /* ok */ }
    }
  }

  /**
   * Decode a File/Blob, honouring EXIF orientation.
   * Uses createImageBitmap({ imageOrientation: 'from-image' }) when the
   * bitmap size shows the option was applied; otherwise falls back to a
   * canvas transform from the EXIF Orientation tag.
   * Returns { canvas, width, height, orientation, sourceW, sourceH }.
   * Caller should drop the canvas after encoding.
   */
  async function decodeOriented(file) {
    var buf = await file.arrayBuffer();
    var u8 = new Uint8Array(buf);
    var orient = 1;
    var sof = null;
    if (E && E.isJpeg(u8)) {
      var parsed = E.parseJpeg(u8);
      if (parsed) {
        orient = parsed.orientation || 1;
        if (parsed.width) sof = { width: parsed.width, height: parsed.height };
      }
    }
    /* Drop the source buffer so the File is the only retained copy. */
    buf = null;
    u8 = null;

    var src = null;
    var usedFromImage = false;
    if (typeof createImageBitmap === 'function') {
      try {
        src = await createImageBitmap(file, { imageOrientation: 'from-image' });
        usedFromImage = true;
        if (orient >= 5 && sof && sof.width && src.width === sof.width && src.height === sof.height) {
          usedFromImage = false;
        } else if (orient >= 5 && sof && sof.width && src.width === sof.height && src.height === sof.width) {
          usedFromImage = true;
        } else if (orient === 1 || orient === 2 || orient === 3 || orient === 4) {
          usedFromImage = true;
        }
      } catch (_) {
        src = null;
        usedFromImage = false;
      }
    }
    if (!src) {
      var url = URL.createObjectURL(file);
      try {
        src = await loadImageUrl(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    var srcW = src.width || src.naturalWidth;
    var srcH = src.height || src.naturalHeight;
    if (!srcW || !srcH) {
      closeBitmap(src);
      throw new Error('Image has no size');
    }

    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      closeBitmap(src);
      throw new Error('Canvas is not available');
    }

    if (usedFromImage) {
      canvas.width = srcW;
      canvas.height = srcH;
      ctx.drawImage(src, 0, 0);
      closeBitmap(src);
      return { canvas: canvas, width: srcW, height: srcH, orientation: orient, sourceW: srcW, sourceH: srcH };
    }

    var out = E && E.sizeAfterOrientation ? E.sizeAfterOrientation(srcW, srcH, orient) : { width: srcW, height: srcH };
    canvas.width = out.width;
    canvas.height = out.height;
    ctx.save();
    if (E && E.applyOrientation) E.applyOrientation(ctx, srcW, srcH, orient);
    ctx.drawImage(src, 0, 0);
    ctx.restore();
    closeBitmap(src);
    return { canvas: canvas, width: out.width, height: out.height, orientation: orient, sourceW: srcW, sourceH: srcH };
  }

  function drawResized(srcCanvas, outW, outH) {
    if (srcCanvas.width === outW && srcCanvas.height === outH) return srcCanvas;
    var c = document.createElement('canvas');
    c.width = outW;
    c.height = outH;
    var ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(srcCanvas, 0, 0, srcCanvas.width, srcCanvas.height, 0, 0, outW, outH);
    return c;
  }

  function applyRotateFlip(srcCanvas, rot, flipH, flipV) {
    rot = ((Number(rot) || 0) % 360 + 360) % 360;
    flipH = !!flipH;
    flipV = !!flipV;
    if (!rot && !flipH && !flipV) return srcCanvas;
    var w = srcCanvas.width;
    var h = srcCanvas.height;
    var cw = (rot === 90 || rot === 270) ? h : w;
    var ch = (rot === 90 || rot === 270) ? w : h;
    var c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    var ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(rot * Math.PI / 180);
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
    ctx.drawImage(srcCanvas, -w / 2, -h / 2);
    return c;
  }

  function applyWatermark(ctx, width, height, wm) {
    var Edit = root.ICEdit;
    if (!wm || !Edit) return;
    var opacity = Number(wm.opacity);
    if (!isFinite(opacity)) opacity = 0.6;
    if (opacity <= 0) return;
    if (opacity > 1) opacity = 1;
    ctx.save();
    ctx.globalAlpha = opacity;
    var padPct = wm.pad;
    if (wm.logo && (wm.logo.width || wm.logo.naturalWidth)) {
      var lw = wm.logo.width || wm.logo.naturalWidth;
      var lh = wm.logo.height || wm.logo.naturalHeight;
      var sz = Edit.watermarkSize(width, height, lw, lh, wm.scale);
      var pos = Edit.watermarkPosition(width, height, sz.width, sz.height, wm.position, padPct);
      ctx.drawImage(wm.logo, pos.x, pos.y, sz.width, sz.height);
    } else if (wm.text) {
      var scale = Number(wm.scale);
      if (!isFinite(scale) || scale <= 0) scale = 6;
      var fontPx = Math.max(10, Math.round(width * (scale / 100)));
      ctx.font = '700 ' + fontPx + 'px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      var text = String(wm.text);
      var tw = ctx.measureText(text).width;
      var th = fontPx * 1.2;
      var posT = Edit.watermarkPosition(width, height, tw, th, wm.position, padPct);
      ctx.lineWidth = Math.max(2, Math.round(fontPx / 12));
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.fillStyle = wm.color || '#ffffff';
      ctx.strokeText(text, posT.x, posT.y);
      ctx.fillText(text, posT.x, posT.y);
    }
    ctx.restore();
  }

  /* CI2: rotate / flip, crop, background fill, resize, watermark. */
  function applyTransforms(srcCanvas, settings) {
    settings = settings || {};
    var Edit = root.ICEdit;
    var work = applyRotateFlip(srcCanvas, settings.rotate, settings.flipH, settings.flipV);
    var crop = Edit
      ? Edit.resolveCrop(work.width, work.height, settings)
      : { x: 0, y: 0, w: work.width, h: work.height };
    var size = H.computeSize(crop.w, crop.h, settings.resize || 'none', {
      longest: settings.longest,
      percent: settings.percent,
      width: settings.width,
      height: settings.height,
      keepAspect: settings.keepAspect !== false,
      noEnlarge: settings.noEnlarge !== false
    });
    var out = document.createElement('canvas');
    out.width = size.width;
    out.height = size.height;
    var ctx = out.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    var format = H.formatOf(settings.format) || 'jpeg';
    var bg = settings.bg || '';
    if (format === 'jpeg' || format === 'avif' || (bg && settings.fillBg !== false)) {
      ctx.fillStyle = bg || '#ffffff';
      ctx.fillRect(0, 0, out.width, out.height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(work, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height);
    if (settings.watermark) applyWatermark(ctx, out.width, out.height, settings.watermark);
    if (work !== srcCanvas) dropCanvas(work);
    return out;
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (resolve, reject) {
      try {
        if (typeof canvas.toBlob === 'function') {
          var args = [function (blob) {
            if (!blob) {
              reject(new Error('This browser could not encode ' + mime));
              return;
            }
            resolve(blob);
          }, mime];
          if (mime !== 'image/png' && quality != null) args.push(quality);
          canvas.toBlob.apply(canvas, args);
          return;
        }
        var dataUrl = quality != null && mime !== 'image/png'
          ? canvas.toDataURL(mime, quality)
          : canvas.toDataURL(mime);
        var parts = dataUrl.split(',');
        var bin = atob(parts[1] || '');
        var u8 = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        resolve(new Blob([u8], { type: mime }));
      } catch (err) {
        reject(err);
      }
    });
  }

  function dropCanvas(canvas) {
    if (!canvas) return;
    try {
      canvas.width = 0;
      canvas.height = 0;
    } catch (_) { /* ok */ }
  }

  /**
   * Convert one file. Releases bitmaps and working canvases before returning.
   * settings: { format, resize, longest, percent, width, height, keepAspect,
   *             noEnlarge, quality (1–100), useTarget, targetKb }
   * Returns { blob, width, height, qualityUsed, overTarget, mime, size }.
   */
  async function processFile(file, settings) {
    settings = settings || {};
    var format = H.formatOf(settings.format) || 'jpeg';
    var mime = H.mimeOf(format);
    if (!mime) throw new Error('Unknown output format');
    if (format === 'avif') {
      var ok = await detectAvif();
      if (!ok) throw new Error('AVIF is not supported in this browser');
    }

    var decoded = await decodeOriented(file);
    var src = decoded.canvas;
    var outCanvas = null;
    try {
      outCanvas = applyTransforms(src, settings);
      if (outCanvas !== src) dropCanvas(src);
      src = null;

      var quality = H.clamp((Number(settings.quality) || 80) / 100, 0.01, 1);
      var blob;
      var overTarget = false;
      var qualityUsed = format === 'png' ? null : quality;

      if (format !== 'png' && settings.useTarget && Number(settings.targetKb) > 0) {
        var target = H.kbToBytes(settings.targetKb);
        var lastBlob = null;
        var found = await H.findQuality(function (q) {
          return canvasToBlob(outCanvas, mime, q).then(function (b) {
            lastBlob = b;
            return { size: b.size, payload: b };
          });
        }, target, { maxTries: 8 });
        blob = found.payload || lastBlob;
        qualityUsed = found.quality;
        overTarget = !!found.overTarget;
        if (!blob) throw new Error('Could not encode the image');
      } else {
        blob = await canvasToBlob(outCanvas, mime, format === 'png' ? undefined : quality);
      }

      if (format === 'jpeg' && E && settings.exifKeep && settings.exifInfo) {
        var opts = E.keepFromDescribe(settings.exifInfo, settings.exifKeep);
        if (opts.date || opts.make || opts.model || opts.gps) {
          var bytes = new Uint8Array(await blob.arrayBuffer());
          bytes = E.writeJpegExif(bytes, opts);
          blob = new Blob([bytes], { type: mime });
        }
      }

      return {
        blob: blob,
        width: outCanvas.width,
        height: outCanvas.height,
        qualityUsed: qualityUsed,
        overTarget: overTarget,
        mime: mime,
        size: blob.size
      };
    } finally {
      dropCanvas(outCanvas);
      dropCanvas(src);
    }
  }

  /**
   * Decode, honour orientation, apply CI2 transforms, and return the
   * working canvas. Caller must dropCanvas when done.
   */
  async function rasterize(file, settings) {
    var decoded = await decodeOriented(file);
    var out = applyTransforms(decoded.canvas, settings);
    if (out !== decoded.canvas) dropCanvas(decoded.canvas);
    return out;
  }

  /** Draw src into a square PNG of `size` px (contain, optional background). */
  async function pngAtSize(srcCanvas, size, bg) {
    size = Math.max(1, Math.round(Number(size) || 1));
    var c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    var ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, size, size);
    }
    var s = Math.min(size / srcCanvas.width, size / srcCanvas.height);
    var w = Math.max(1, Math.round(srcCanvas.width * s));
    var h = Math.max(1, Math.round(srcCanvas.height * s));
    var x = Math.round((size - w) / 2);
    var y = Math.round((size - h) / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = size >= 48 ? 'high' : 'medium';
    ctx.drawImage(srcCanvas, x, y, w, h);
    try {
      return await canvasToBlob(c, 'image/png');
    } finally {
      dropCanvas(c);
    }
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '')); };
      r.onerror = function () { reject(new Error('Could not read the file')); };
      r.readAsDataURL(blob);
    });
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name || 'image';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1000);
  }

  root.ICConvert = {
    detectAvif: detectAvif,
    decodeOriented: decodeOriented,
    applyTransforms: applyTransforms,
    processFile: processFile,
    rasterize: rasterize,
    pngAtSize: pngAtSize,
    canvasToBlob: canvasToBlob,
    blobToDataUrl: blobToDataUrl,
    downloadBlob: downloadBlob,
    dropCanvas: dropCanvas
  };
})(typeof window !== 'undefined' ? window : globalThis);
