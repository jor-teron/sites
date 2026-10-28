/* Multi-Screen Wall MW1 — wall maths + drawing (no DOM besides the canvas it is given).
   Layout: the host's grid is rows × cols cells. Column width = the widest device (CSS px) placed in that column,
   row height = the tallest device in that row (empty: 480 × 300). Between neighbouring cells sits a "bezel" gap
   (bezel compensation, wall px): content that falls in the gap is hidden, so lines run straight across frames.
   Each device is centred in its cell; its rect {x, y, w, h} (wall px) is the slice it shows.
   Content kinds: pattern (grid | gradient | solid), clock, text (scrolling), image (cover | contain).
   Everything time-based uses the host's clock (now = Date.now() + offset measured by ping), so slices agree. */
(function () {
  'use strict';
  var EMPTY_W = 480, EMPTY_H = 300;

  function layout(st, devs) {
    var rows = st.rows, cols = st.cols, gap = +st.bezel || 0, colW = [], rowH = [], r, c;
    for (c = 0; c < cols; c++) colW[c] = 0;
    for (r = 0; r < rows; r++) rowH[r] = 0;
    var placed = {};
    Object.keys(st.cells || {}).forEach(function (d) {
      var p = st.cells[d], v = devs[d];
      if (!p || p.r >= rows || p.c >= cols || !v) return;
      placed[d] = p;
      colW[p.c] = Math.max(colW[p.c], v.w || EMPTY_W); rowH[p.r] = Math.max(rowH[p.r], v.h || EMPTY_H);
    });
    for (c = 0; c < cols; c++) if (!colW[c]) colW[c] = EMPTY_W;
    for (r = 0; r < rows; r++) if (!rowH[r]) rowH[r] = EMPTY_H;
    var colX = [0], rowY = [0];
    for (c = 1; c <= cols; c++) colX[c] = colX[c - 1] + colW[c - 1] + (c < cols ? gap : 0);
    for (r = 1; r <= rows; r++) rowY[r] = rowY[r - 1] + rowH[r - 1] + (r < rows ? gap : 0);
    var rects = {};
    Object.keys(placed).forEach(function (d) {
      var p = placed[d], v = devs[d], w = v.w || EMPTY_W, h = v.h || EMPTY_H;
      rects[d] = { x: Math.round(colX[p.c] + (colW[p.c] - w) / 2), y: Math.round(rowY[p.r] + (rowH[p.r] - h) / 2), w: w, h: h, r: p.r, c: p.c, n: p.r * cols + p.c + 1 };
    });
    return { W: colX[cols], H: rowY[rows], colX: colX, rowY: rowY, colW: colW, rowH: rowH, rects: rects };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clockText(t) { var d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  var FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

  /* text width in wall px for a font size (the host measures once and sends twu = width per px of font size,
     so every slice loops alike even when fonts differ a little) */
  var mctx = null;
  function textWidth(text, size) {
    mctx = mctx || document.createElement('canvas').getContext('2d');
    mctx.font = '700 ' + size + 'px ' + FONT;
    return Math.ceil(mctx.measureText(text || ' ').width);
  }

  /* o = {wall:{W,H}, view:{x,y,w,h} (wall px), px:{w,h} (canvas px), content, img, now} */
  function draw(ctx, o) {
    var cv = ctx.canvas, W = o.wall.W, H = o.wall.H, v = o.view, k = o.px.w / v.w, C = o.content || {};
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(k, 0, 0, o.px.h / v.h, -v.x * k, -v.y * (o.px.h / v.h));
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    var bg = C.bg || '#101820', fg = C.fg || '#ffffff';
    if (C.kind === 'pattern' && C.pattern === 'gradient') {
      var g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, bg); g.addColorStop(1, C.bg2 || '#2563eb');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ringsAndCross(ctx, W, H, 'rgba(255,255,255,.55)', Math.max(2, 2 / k));
    } else if (C.kind === 'pattern' && C.pattern === 'solid') {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    } else if (C.kind === 'pattern') {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); grid(ctx, W, H, fg, k);
    } else {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    }
    if (C.kind === 'image' && o.img && o.img.naturalWidth) {
      var iw = o.img.naturalWidth, ih = o.img.naturalHeight, s = C.fit === 'contain' ? Math.min(W / iw, H / ih) : Math.max(W / iw, H / ih);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(o.img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
    } else if (C.kind === 'image') {
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '600 ' + Math.round(H / 12) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(C.img ? 'Receiving picture…' : 'No picture yet', W / 2, H / 2);
    }
    if (C.kind === 'clock') {
      var t = clockText(o.now), fs = Math.min(H * 0.62, W / 4.6);
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '700 ' + Math.round(fs) + 'px ' + FONT;
      // fixed-width digits: draw each glyph in its own slot so slices never jitter between devices
      var slot = fs * 0.62, colon = fs * 0.32, total = slot * 6 + colon * 2, x = (W - total) / 2;
      for (var i = 0; i < t.length; i++) { var wd = t[i] === ':' ? colon : slot; ctx.fillText(t[i], x + wd / 2, H / 2); x += wd; }
      ctx.font = '500 ' + Math.round(fs * 0.16) + 'px ' + FONT; ctx.globalAlpha = 0.7;
      ctx.fillText(new Date(o.now).toDateString(), W / 2, H / 2 + fs * 0.62); ctx.globalAlpha = 1;
    }
    if (C.kind === 'text') {
      var size = Math.max(10, H * (C.size || 60) / 100), tw = C.twu ? C.twu * size : textWidth(C.text, size);
      var el = Math.max(0, o.now - (C.t0 || 0)) / 1000, loop = W + tw, sp = Math.max(10, +C.speed || 160);
      var xx = W - ((el * sp) % loop);
      ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '700 ' + Math.round(size) + 'px ' + FONT;
      ctx.fillText(C.text || '', xx, H / 2);
    }
    ctx.restore();
  }
  function ringsAndCross(ctx, W, H, col, lw) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, H); ctx.moveTo(W, 0); ctx.lineTo(0, H); ctx.stroke();
    var R = Math.min(W, H) / 2;
    [0.95, 0.6, 0.25].forEach(function (f) { ctx.beginPath(); ctx.arc(W / 2, H / 2, R * f, 0, Math.PI * 2); ctx.stroke(); });
  }
  function grid(ctx, W, H, fg, k) {
    var lw = Math.max(1, 1 / k), x, y;
    ctx.strokeStyle = fg; ctx.globalAlpha = 0.18; ctx.lineWidth = lw; ctx.beginPath();
    for (x = 0; x <= W; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (y = 0; y <= H; y += 50) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.globalAlpha = 0.45; ctx.lineWidth = lw * 2; ctx.beginPath();
    for (x = 0; x <= W; x += 200) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (y = 0; y <= H; y += 200) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ringsAndCross(ctx, W, H, '#f59e0b', Math.max(3, 3 / k));
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = Math.max(6, 6 / k); ctx.strokeRect(0, 0, W, H);
    ctx.fillStyle = fg; ctx.globalAlpha = 0.75; ctx.font = '600 ' + Math.max(12, 14 / Math.max(k, 0.3)) + 'px ' + FONT; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    for (x = 0; x < W; x += 200) for (y = 0; y < H; y += 200) ctx.fillText(x + ',' + y, x + 6, y + 6);
    ctx.globalAlpha = 1;
  }

  /* picture → JPEG data URL, longest side ≤ max (default 1920) */
  function compress(file, max) {
    max = max || 1920;
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * s)); c.height = Math.max(1, Math.round(im.naturalHeight * s));
        var x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u); res(c.toDataURL('image/jpeg', 0.82));
      };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('That file is not a picture this browser can open.')); };
      im.src = u;
    });
  }
  var CHUNK = 16000;
  function chunks(data) { var a = []; for (var i = 0; i < data.length; i += CHUNK) a.push(data.slice(i, i + CHUNK)); return a; }

  window.SWWall = { layout: layout, draw: draw, textWidth: textWidth, compress: compress, chunks: chunks, clockText: clockText, CHUNK: CHUNK };
})();
