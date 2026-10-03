/*
 * Photo Editor v2 — pe_view.js
 * Screen rendering: fit-to-screen, zoom and pan, and the preview copy.
 * Pipeline: photo --(crop + orientation, downscaled to screen size)--> base
 *           base  --(adjustments, pe_adjust.js)-->                     shown
 * Only the screen-sized copy is processed while editing; the full photo is
 * processed once, on save.
 */
(function (PE) {
  'use strict';

  const V = PE.view = { zoom: 1, panX: 0, panY: 0, cw: 0, ch: 0, dpr: 1, shown: null };
  const S = PE.state, T = PE.transform;
  const cfg = () => PE.config.view;
  let canvas, ctx, base, bctx, adj, actx, baseData = null, workData = null;
  let rebuildTimer = 0, resizeTimer = 0, rafId = 0;
  V.baseScale = 0;

  V.init = () => {
    V.stage = document.getElementById('stage');
    canvas = document.getElementById('view');
    ctx = canvas.getContext('2d');
    base = document.createElement('canvas');
    bctx = base.getContext('2d', { willReadFrequently: true });
    adj = document.createElement('canvas');
    actx = adj.getContext('2d');
    if (window.ResizeObserver) new ResizeObserver(() => V.resize()).observe(V.stage);
    else window.addEventListener('resize', () => V.resize());
    V.resize(true);
    PE.on((kind) => {
      if (kind === 'adj' || kind === 'adjlive') buildAdjusted();
      else if (kind === 'photo') { V.zoom = 1; V.panX = V.panY = 0; buildBase(); }
      else if (kind === 'geom' || kind === 'history' || kind === 'crop') { clampPan(); buildBase(); }
    });
  };

  V.resize = (now) => {
    const r = V.stage.getBoundingClientRect();
    V.cw = Math.max(1, r.width); V.ch = Math.max(1, r.height);
    V.dpr = Math.min(window.devicePixelRatio || 1, cfg().dprCap);
    canvas.width = Math.round(V.cw * V.dpr); canvas.height = Math.round(V.ch * V.dpr);
    canvas.style.width = V.cw + 'px'; canvas.style.height = V.ch + 'px';
    clampPan();
    V.renderNow();                         // stretched old preview right away …
    clearTimeout(resizeTimer);             // … sharp one shortly after
    if (S.photo) resizeTimer = setTimeout(buildBase, now === true ? 0 : 90);
  };

  // What is on screen: the crop (or the whole photo while cropping) after orientation.
  V.content = () => {
    const P = S.photo, e = S.edits;
    const crop = PE.crop.active ? { x: 0, y: 0, w: P.w, h: P.h } : e.crop;
    return { crop: crop, O: T.orientedSize(crop.w, crop.h, e.m) };
  };
  V.pad = () => (PE.crop.active ? PE.config.crop.pad : cfg().pad);
  V.fit = () => {
    if (!S.photo) return 1;
    const O = V.content().O, p = V.pad();
    return Math.max(1e-4, Math.min((V.cw - 2 * p) / O.w, (V.ch - 2 * p) / O.h));
  };
  // Photo rectangle on screen (CSS px) and s = screen px per photo px.
  V.imageRect = () => {
    const O = V.content().O, s = V.fit() * V.zoom;
    const w = O.w * s, h = O.h * s;
    return { x: V.cw / 2 + V.panX - w / 2, y: V.ch / 2 + V.panY - h / 2, w: w, h: h, s: s };
  };
  V.toImage = (sx, sy) => { const r = V.imageRect(); return { x: (sx - r.x) / r.s, y: (sy - r.y) / r.s }; };

  function clampPan() {
    if (!S.photo) { V.panX = V.panY = 0; return; }
    const r = V.imageRect();
    const mx = Math.max(0, (r.w - V.cw) / 2 + V.pad()), my = Math.max(0, (r.h - V.ch) / 2 + V.pad());
    if (r.w <= V.cw) V.panX = 0; else V.panX = Math.max(-mx, Math.min(mx, V.panX));
    if (r.h <= V.ch) V.panY = 0; else V.panY = Math.max(-my, Math.min(my, V.panY));
  }

  V.zoomAt = (f, sx, sy) => {
    if (!S.photo || PE.crop.active || !isFinite(f) || f <= 0) return;
    const r = V.imageRect();
    const ix = (sx - r.x) / r.s, iy = (sy - r.y) / r.s;
    const z = Math.max(cfg().zoomMin, Math.min(cfg().zoomMax, V.zoom * f));
    if (z === V.zoom) return;
    V.zoom = z;
    const s = V.fit() * z, O = V.content().O;
    V.panX = sx - ix * s - V.cw / 2 + O.w * s / 2;
    V.panY = sy - iy * s - V.ch / 2 + O.h * s / 2;
    clampPan();
    V.requestRender();
    scheduleRebuild();
  };
  V.panBy = (dx, dy) => {
    if (!S.photo || PE.crop.active) return;
    V.panX += dx; V.panY += dy; clampPan(); V.requestRender();
  };
  V.resetZoom = () => {
    if (V.zoom === 1 && !V.panX && !V.panY) return;
    V.zoom = 1; V.panX = V.panY = 0; buildBase();
  };
  V.toggleZoom = (sx, sy) => {
    if (V.zoom > 1.01) V.resetZoom(); else V.zoomAt(cfg().doubleTapZoom, sx, sy);
  };

  // Preview resolution: screen size x zoom x dpr, never above the photo or previewMaxPixels.
  function targetScale(O) {
    let k = Math.min(1, V.fit() * V.zoom * V.dpr);
    const maxPx = cfg().previewMaxPixels;
    if (O.w * O.h * k * k > maxPx) k = Math.sqrt(maxPx / (O.w * O.h));
    return k;
  }
  function scheduleRebuild() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      if (!S.photo) return;
      const k = targetScale(V.content().O);
      if (Math.abs(k - V.baseScale) / Math.max(k, 1e-6) > 0.2) buildBase();
    }, cfg().rebuildDelay);
  }

  function buildBase() {
    clearTimeout(resizeTimer);
    if (!S.photo) { V.shown = null; V.renderNow(); return; }
    const t0 = performance.now();
    const P = S.photo, e = S.edits, c = V.content(), O = c.O;
    const k = targetScale(O);
    const bw = Math.max(1, Math.round(O.w * k)), bh = Math.max(1, Math.round(O.h * k));
    base.width = bw; base.height = bh;               // also clears it
    bctx.imageSmoothingEnabled = true;
    bctx.imageSmoothingQuality = 'high';
    T.drawOriented(bctx, P.bitmap, c.crop.x, c.crop.y, c.crop.w, c.crop.h, e.m, bw, bh, bw / O.w);
    V.baseScale = k;
    baseData = null;
    V.lastBaseMs = performance.now() - t0;
    buildAdjusted();
  }

  function buildAdjusted() {
    if (!S.photo) return;
    const t0 = performance.now();
    const eff = PE.adjust.effective(S.edits);
    if (PE.adjust.isIdentity(eff)) {
      V.shown = base;
    } else {
      const w = base.width, h = base.height;
      if (!baseData) {
        baseData = bctx.getImageData(0, 0, w, h);
        workData = new ImageData(w, h);
        adj.width = w; adj.height = h;
      }
      workData.data.set(baseData.data);
      PE.adjust.process(workData.data, PE.adjust.build(eff));
      actx.putImageData(workData, 0, 0);
      V.shown = adj;
    }
    V.renderNow();
    V.lastAdjMs = performance.now() - t0;
  }

  V.requestRender = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; V.renderNow(); });
  };

  V.renderNow = () => {
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PE.config.colors.stage;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (S.photo && V.shown) {
      const r = V.imageRect(), d = V.dpr;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(V.shown, r.x * d, r.y * d, r.w * d, r.h * d);
      if (PE.crop.active) PE.crop.draw(ctx, r, d);
    }
    if (V.onRender) V.onRender();
  };
})(window.PE);
