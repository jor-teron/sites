/* Video Editor — ve_draw.js: canvas frames for export and PNG snapshots. VD3 */
(function (root) {
  'use strict';

  var F = root.VEFx;
  var tmp = null;

  function supportsCtxFilter() {
    try {
      var c = document.createElement('canvas');
      c.width = 2;
      c.height = 2;
      var ctx = c.getContext('2d');
      if (!ctx || typeof ctx.filter === 'undefined') return false;
      ctx.filter = 'brightness(2)';
      var applied = String(ctx.filter || '');
      return applied.indexOf('brightness') >= 0;
    } catch (_) { return false; }
  }

  function tempCanvas(w, h) {
    if (typeof document === 'undefined') return null;
    if (!tmp) tmp = document.createElement('canvas');
    tmp.width = Math.max(2, w);
    tmp.height = Math.max(2, h);
    return tmp;
  }

  /**
   * Draw the current video frame of `clip` into destCtx, contained in destW x destH,
   * with filters (if allowed), rotate, flip, crop, and fade alpha. Letterboxes.
   */
  function drawClipFrame(destCtx, video, clip, destW, destH, alpha, filterOk) {
    if (!destCtx || !video) return;
    var c = F ? F.migrateClip(clip) : clip;
    var srcW = video.videoWidth || c.width || destW;
    var srcH = video.videoHeight || c.height || destH;
    if (!srcW || !srcH) return;
    var rot = F ? F.normalizeRotate(c.rotate) : 0;
    var rotSize = F ? F.rotatedSize(srcW, srcH, rot) : { width: srcW, height: srcH };
    var work = tempCanvas(rotSize.width, rotSize.height);
    if (!work) return;
    var tctx = work.getContext('2d');
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, work.width, work.height);
    if (filterOk && F) tctx.filter = F.cssFilter(c);
    else tctx.filter = 'none';
    tctx.save();
    tctx.translate(work.width / 2, work.height / 2);
    tctx.rotate(rot * Math.PI / 180);
    tctx.scale(c.flipH ? -1 : 1, c.flipV ? -1 : 1);
    try { tctx.drawImage(video, -srcW / 2, -srcH / 2, srcW, srcH); } catch (_) { /* not ready */ }
    tctx.restore();
    tctx.filter = 'none';

    var crop = F ? F.normalizeCrop(c.crop) : { x: 0, y: 0, w: 1, h: 1 };
    var sx = crop.x * work.width;
    var sy = crop.y * work.height;
    var sw = Math.max(1, crop.w * work.width);
    var sh = Math.max(1, crop.h * work.height);
    if (sx + sw > work.width) sw = work.width - sx;
    if (sy + sh > work.height) sh = work.height - sy;
    var scale = Math.min(destW / sw, destH / sh);
    var dw = sw * scale;
    var dh = sh * scale;
    var dx = (destW - dw) / 2;
    var dy = (destH - dh) / 2;
    destCtx.save();
    destCtx.globalAlpha = Math.max(0, Math.min(1, alpha == null ? 1 : alpha));
    try { destCtx.drawImage(work, sx, sy, sw, sh, dx, dy, dw, dh); } catch (_) { /* ok */ }
    destCtx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    if (w < 2) w = 2;
    if (h < 2) h = 2;
    if (r * 2 > w) r = w / 2;
    if (r * 2 > h) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawOverlays(ctx, overlays, t, destW, destH) {
    if (!ctx || !F) return;
    (overlays || []).forEach(function (raw) {
      var o = F.migrateOverlay(raw);
      var a = F.overlayAlpha(o, t);
      if (a <= 0 || !String(o.text || '').trim()) return;
      var lines = String(o.text).split('\n');
      var fontSize = Math.max(8, o.size * destH);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = '700 ' + fontSize + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var x = o.x * destW;
      var y = o.y * destH;
      var lineH = fontSize * 1.2;
      var maxW = 0;
      lines.forEach(function (line) {
        var w = ctx.measureText(line).width;
        if (w > maxW) maxW = w;
      });
      var boxH = lineH * lines.length;
      if (o.box) {
        var padX = fontSize * 0.45;
        var padY = fontSize * 0.25;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        roundRect(ctx, x - maxW / 2 - padX, y - boxH / 2 - padY, maxW + padX * 2, boxH + padY * 2, fontSize * 0.2);
        ctx.fill();
      }
      ctx.fillStyle = o.color || '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = Math.max(1, fontSize / 16);
      var startY = y - (boxH - lineH) / 2;
      lines.forEach(function (line, i) {
        var ly = startY + i * lineH;
        if (!o.box) ctx.strokeText(line, x, ly);
        ctx.fillText(line, x, ly);
      });
      ctx.restore();
    });
  }

  function paintOutput(ctx, video, clip, overlays, t, destW, destH, fadeAlpha, filterOk) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.filter = 'none';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, destW, destH);
    drawClipFrame(ctx, video, clip, destW, destH, fadeAlpha, filterOk);
    drawOverlays(ctx, overlays, t, destW, destH);
  }

  function snapshotBlob(opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      var size = opts.size || { width: 1280, height: 720 };
      var canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      var ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Could not draw the frame.')); return; }
      paintOutput(ctx, opts.video, opts.clip, opts.overlays || [], opts.time || 0,
        size.width, size.height, 1, opts.filterOk !== false);
      if (canvas.toBlob) {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('Could not save the frame.'));
        }, 'image/png');
      } else {
        try {
          var url = canvas.toDataURL('image/png');
          var bin = atob(url.split(',')[1] || '');
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          resolve(new Blob([arr], { type: 'image/png' }));
        } catch (err) { reject(err); }
      }
    });
  }

  root.VEDraw = {
    supportsCtxFilter: supportsCtxFilter,
    drawClipFrame: drawClipFrame,
    drawOverlays: drawOverlays,
    paintOutput: paintOutput,
    snapshotBlob: snapshotBlob
  };
})(typeof window !== 'undefined' ? window : globalThis);
