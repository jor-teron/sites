/*
 * Hub Photo Studio (HPS2, hooks for HPS3 masks) — ps_layers.js, the Layers feature (one file, registered through PE.studio).
 *
 * Model (all inside the engine's edit settings, so undo / redo and the 60-step history just work):
 *   S.edits.bg     = { name, visible, opacity }                 the photo = the background layer
 *   S.edits.layers = [ bottom … top ] each { id, type:'image'|'text'|'shape', name, visible, opacity 0..1,
 *                    blend (canvas globalCompositeOperation), x, y (centre), w, h (own size), scale, rot (radians),
 *                    image: src · text: text, font, size, color, bold, align · shape: shape, fill, fillOn, stroke, sw }
 *   Positions are in BACKGROUND-PHOTO pixels (the uncropped, unrotated original working copy), so the
 *   engine's crop / rotate / flip / resize — which already work on that space — carry the layers along.
 *   Image pixels live outside the history in L.images (src id → decoded bitmap + the untouched file).
 *
 * Rendering: wraps the engine hook PE.view.drawPhoto (pe_view.js, HPS2). Preview and Save both draw
 * background → layers (opacity + blend) in photo space, clipped to the crop; then the engine applies
 * Adjust / Looks / Sharpen to the flattened result, as before. The preview is rebuilt only when
 * something changes (rAF-throttled while dragging); decoded bitmaps are kept, text metrics cached.
 *
 * Interaction (Layers panel open, key L): tap a layer to select, drag to move, corner handles scale,
 * the round handle rotates (snaps to 90°), double-tap a text layer to edit it. Empty area: pan / pinch.
 */
(function (PE) {
  'use strict';
  const S = PE.state, V = PE.view, C = PE.config, T = PE.transform;
  const LC = () => C.studio.layers;
  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const clamp = (v, a, z) => Math.max(a, Math.min(z, v));

  const BLENDS = [
    ['source-over', 'Normal', 'svg:src-over'], ['multiply', 'Multiply', 'svg:multiply'], ['screen', 'Screen', 'svg:screen'],
    ['overlay', 'Overlay', 'svg:overlay'], ['darken', 'Darken', 'svg:darken'], ['lighten', 'Lighten', 'svg:lighten'],
    ['color-dodge', 'Colour dodge', 'svg:color-dodge'], ['color-burn', 'Colour burn', 'svg:color-burn'],
    ['hard-light', 'Hard light', 'svg:hard-light'], ['soft-light', 'Soft light', 'svg:soft-light'],
    ['difference', 'Difference', 'svg:difference'], ['exclusion', 'Exclusion', 'svg:exclusion'],
    ['hue', 'Hue', 'svg:hue'], ['saturation', 'Saturation', 'svg:saturation'], ['color', 'Colour', 'svg:color'],
    ['luminosity', 'Luminosity', 'svg:luminosity']
  ];
  const FONTS = [
    ['system-ui, sans-serif', 'Sans'], ['Georgia, serif', 'Serif'], ['ui-monospace, Consolas, monospace', 'Mono'],
    ['Impact, "Arial Black", sans-serif', 'Impact'], ['"Comic Sans MS", "Comic Neue", cursive', 'Casual']
  ];

  const L = PE.layers = {
    open: false, sel: null, images: new Map(), bgFile: null, loadingProject: false,
    BLENDS, FONTS, seq: 0, imgSeq: 0
  };
  L.list = () => (S.edits && S.edits.layers) || [];
  L.bg = () => Object.assign({ name: 'Background', visible: true, opacity: 1 }, (S.edits && S.edits.bg) || {});
  L.get = (id) => L.list().find((l) => l.id === id) || null;
  L.count = () => L.list().length + 1;                  // + the background
  L.oraOp = (blend) => (BLENDS.find((b) => b[0] === blend) || BLENDS[0])[2];
  L.newId = () => 'L' + (++L.seq);
  L.syncSeq = () => {
    for (const l of L.list()) { const n = parseInt(String(l.id).slice(1), 10); if (n > L.seq) L.seq = n; }
    for (const k of L.images.keys()) { const n = parseInt(String(k).slice(1), 10); if (n > L.imgSeq) L.imgSeq = n; }
  };

  // ---------- text metrics (cached) ----------
  const mctx = document.createElement('canvas').getContext('2d');
  const mcache = new Map();
  const fontOf = (l) => (l.bold ? 'bold ' : '') + l.size + 'px ' + l.font;
  L.measure = (l) => {
    const key = fontOf(l) + '|' + l.text;
    let r = mcache.get(key);
    if (!r) {
      mctx.font = fontOf(l);
      const lines = String(l.text || ' ').split('\n');
      let w = 0;
      for (const s of lines) w = Math.max(w, mctx.measureText(s || ' ').width);
      const pad = l.size * 0.2;
      r = { w: Math.ceil(w + 2 * pad), h: Math.ceil(lines.length * l.size * 1.25), lines, pad };
      if (mcache.size > 200) mcache.clear();
      mcache.set(key, r);
    }
    return r;
  };

  // ---------- drawing ----------
  function drawContent(x, l) {
    const w = l.w, h = l.h;
    if (l.type === 'image') {
      const im = L.images.get(l.src);
      if (im && im.bitmap) { x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.drawImage(im.bitmap, -w / 2, -h / 2, w, h); }
    } else if (l.type === 'text') {
      const m = L.measure(l), lh = l.size * 1.25;
      x.font = fontOf(l); x.fillStyle = l.color; x.textBaseline = 'middle';
      x.textAlign = l.align === 'left' ? 'left' : l.align === 'right' ? 'right' : 'center';
      const tx = l.align === 'left' ? -w / 2 + m.pad : l.align === 'right' ? w / 2 - m.pad : 0;
      m.lines.forEach((s, i) => x.fillText(s, tx, -h / 2 + lh * (i + 0.5)));
    } else if (l.type === 'shape') {
      x.beginPath();
      if (l.shape === 'ellipse') x.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
      else if (l.shape === 'line') { x.moveTo(-w / 2, 0); x.lineTo(w / 2, 0); }
      else x.rect(-w / 2, -h / 2, w, h);
      if (l.shape !== 'line' && l.fillOn) { x.fillStyle = l.fill; x.fill(); }
      if ((l.shape === 'line' || l.strokeOn) && l.sw > 0) {
        x.strokeStyle = l.stroke; x.lineWidth = l.sw; x.lineJoin = 'round'; x.lineCap = 'round'; x.stroke();
      }
    }
  }
  // One layer, in photo space (x's transform maps photo px → output). raw: ignore opacity / blend.
  L.drawLayer = (x, l, raw) => {
    x.save();
    x.globalAlpha = raw ? 1 : clamp(+l.opacity, 0, 1);
    x.globalCompositeOperation = raw ? 'source-over' : (l.blend || 'source-over');
    x.translate(l.x, l.y); x.rotate(l.rot || 0); x.scale(l.scale || 1, l.scale || 1);
    drawContent(x, l);
    x.restore();
  };

  // Engine hook: background + layers. opts.only = 'bg' | layer id (ORA export: one part, raw).
  const engineDraw = V.drawPhoto;
  // HPS3: the background draw and the "background is masked" test are hooks, so ps_mask.js can mask it.
  L.engineDraw = engineDraw;
  L.bgMasked = () => false;
  L.drawBg = (x, P, cr, m, w, h, a, b, alpha) => { x.save(); x.globalAlpha = alpha; engineDraw(x, P, cr, m, w, h, a, b); x.restore(); };
  L.drawAll = (x, P, cr, m, w, h, a, b, opts) => {
    const only = opts && opts.only, bg = L.bg(), ls = L.list();
    // legacy (HPS2): if (!only && !ls.length && bg.visible && bg.opacity >= 1) return engineDraw(x, P, cr, m, w, h, a, b);
    if (!only && !ls.length && bg.visible && bg.opacity >= 1 && !L.bgMasked()) return engineDraw(x, P, cr, m, w, h, a, b);
    if (only === 'bg' || (!only && bg.visible)) {
      // legacy (HPS2): x.save(); x.globalAlpha = only ? 1 : clamp(bg.opacity, 0, 1); engineDraw(x, P, cr, m, w, h, a, b); x.restore();
      L.drawBg(x, P, cr, m, w, h, a, b, only ? 1 : clamp(bg.opacity, 0, 1));
    }
    if (only === 'bg') return;
    const bb = b == null ? a : b;
    x.save();
    x.setTransform(m[0] * a, m[2] * a, m[1] * bb, m[3] * bb, w / 2, h / 2);
    x.translate(-cr.x - cr.w / 2, -cr.y - cr.h / 2);
    x.beginPath(); x.rect(cr.x, cr.y, cr.w, cr.h); x.clip();
    for (const l of ls) {
      if (only ? l.id === only : l.visible) L.drawLayer(x, l, !!only);
    }
    x.restore();
    x.setTransform(1, 0, 0, 1, 0, 0);
  };
  V.drawPhoto = (x, P, cr, m, w, h, a, b) => L.drawAll(x, P, cr, m, w, h, a, b);

  let rebuildRaf = 0;
  L.rebuildSoon = () => {
    if (rebuildRaf) return;
    rebuildRaf = requestAnimationFrame(() => { rebuildRaf = 0; V.rebuild(); });
  };

  // ---------- screen ↔ photo mapping ----------
  function mapping() {
    const r = V.imageRect(), c = V.content(), m = S.edits.m, s = r.s;
    const a = s * c.sx, b = s * c.sy;
    return { A: m[0] * a, B: m[1] * b, C: m[2] * a, D: m[3] * b,
      cx: c.crop.x + c.crop.w / 2, cy: c.crop.y + c.crop.h / 2, rx: r.x + r.w / 2, ry: r.y + r.h / 2 };
  }
  L.mapping = mapping;                                  // HPS3: used by ps_select.js / ps_mask.js
  L.toScreen = (px, py, M) => {
    M = M || mapping(); const dx = px - M.cx, dy = py - M.cy;
    return { x: M.A * dx + M.B * dy + M.rx, y: M.C * dx + M.D * dy + M.ry };
  };
  L.toPhoto = (sx, sy, M) => {
    M = M || mapping(); const u = sx - M.rx, v = sy - M.ry, det = M.A * M.D - M.B * M.C || 1e-9;
    return { x: (M.D * u - M.B * v) / det + M.cx, y: (-M.C * u + M.A * v) / det + M.cy };
  };
  const ppp = (M) => Math.sqrt(Math.abs(M.A * M.D - M.B * M.C)) || 1;   // screen px per photo px
  function localPt(l, lx, ly) {
    const c = Math.cos(l.rot || 0), s = Math.sin(l.rot || 0), k = l.scale || 1;
    return { x: l.x + (lx * c - ly * s) * k, y: l.y + (lx * s + ly * c) * k };
  }
  function toLocal(l, p) {
    const dx = p.x - l.x, dy = p.y - l.y, c = Math.cos(-(l.rot || 0)), s = Math.sin(-(l.rot || 0)), k = l.scale || 1;
    return { x: (dx * c - dy * s) / k, y: (dx * s + dy * c) / k };
  }
  L.toLocal = toLocal; L.localPt = localPt;             // HPS3
  const boxH = (l) => (l.type === 'shape' && l.shape === 'line' ? Math.max(l.h, l.sw || 1) : l.h);
  L.boxH = boxH;
  // Screen geometry of a layer's box + handles.
  L.geom = (l, M) => {
    M = M || mapping();
    const hw = l.w / 2, hh = boxH(l) / 2;
    const cs = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([a, b]) => { const p = localPt(l, a, b); return L.toScreen(p.x, p.y, M); });
    const ctr = L.toScreen(l.x, l.y, M), tp = localPt(l, 0, -hh), top = L.toScreen(tp.x, tp.y, M);
    let dx = top.x - ctr.x, dy = top.y - ctr.y, d = Math.hypot(dx, dy);
    if (d < 1e-3) { dx = 0; dy = -1; d = 1; }
    const g = LC().rotGap;
    return { corners: cs, ctr, top, rot: { x: top.x + dx / d * g, y: top.y + dy / d * g } };
  };
  // Hit test at a screen point: { id, part:'rot'|'scale'|'body' } or null.
  L.hit = (sx, sy) => {
    if (!S.photo) return null;
    const M = mapping(), H = LC().handle, p = L.toPhoto(sx, sy, M), k = ppp(M);
    const sel = L.get(L.sel);
    if (sel && sel.visible) {
      const g = L.geom(sel, M);
      if (Math.hypot(sx - g.rot.x, sy - g.rot.y) <= H) return { id: sel.id, part: 'rot' };
      for (let i = 0; i < 4; i++) if (Math.hypot(sx - g.corners[i].x, sy - g.corners[i].y) <= H) return { id: sel.id, part: 'scale', corner: i };
    }
    const inside = (l) => {
      const q = toLocal(l, p), pad = 8 / (k * (l.scale || 1));
      return Math.abs(q.x) <= l.w / 2 + pad && Math.abs(q.y) <= boxH(l) / 2 + Math.max(pad, l.type === 'shape' && l.shape === 'line' ? 12 / (k * (l.scale || 1)) : 0);
    };
    if (sel && sel.visible && inside(sel)) return { id: sel.id, part: 'body' };
    const ls = L.list();
    for (let i = ls.length - 1; i >= 0; i--) if (ls[i].visible && inside(ls[i])) return { id: ls[i].id, part: 'body' };
    return null;
  };

  // ---------- handles (drawn on the screen canvas after each render) ----------
  function drawHandles() {
    if (!L.open || !S.photo || PE.crop.active) return;
    const l = L.get(L.sel);
    if (!l || !l.visible) return;
    const ctx = $('view').getContext('2d'), d = V.dpr, g = L.geom(l), col = C.colors.accent;
    ctx.save(); ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.setLineDash([]);
    const poly = () => { ctx.beginPath(); g.corners.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y))); ctx.closePath(); };
    poly(); ctx.lineWidth = 3; ctx.stroke();
    poly(); ctx.lineWidth = 1.5; ctx.strokeStyle = col; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(g.top.x, g.top.y); ctx.lineTo(g.rot.x, g.rot.y); ctx.strokeStyle = col; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.strokeStyle = col; ctx.lineWidth = 2;
    for (const c of g.corners) { ctx.beginPath(); ctx.rect(c.x - 6, c.y - 6, 12, 12); ctx.fill(); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(g.rot.x, g.rot.y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ---------- commands (all through the history) ----------
  const tooMany = () => {
    if (L.count() < LC().maxLayers) return false;
    PE.ui.notify('Photo Studio allows up to ' + LC().maxLayers + ' layers (the background counts as one), so it stays smooth on this device.\nDelete a layer to add another.');
    return true;
  };
  L.apply = (fn) => S.apply((e) => { if (!e.layers) e.layers = []; fn(e); }, 'geom');
  // Centre of what is on screen (the crop) and a size that fits it.
  function placeAt() { const c = S.edits.crop; return { x: c.x + c.w / 2, y: c.y + c.h / 2, w: c.w, h: c.h }; }
  function uniqueName(base) {
    const names = new Set(L.list().map((l) => l.name));
    if (!names.has(base)) return base;
    for (let i = 2; ; i++) if (!names.has(base + ' ' + i)) return base + ' ' + i;
  }
  L.add = (layer) => {
    if (!S.photo || tooMany()) return null;
    const l = Object.assign({ id: L.newId(), visible: true, opacity: 1, blend: 'source-over', scale: 1, rot: 0 }, layer);
    l.name = uniqueName(l.name || l.type);
    L.sel = l.id;
    L.apply((e) => e.layers.push(l));
    L.render(); V.requestRender();
    return l;
  };
  L.addText = (props) => {
    const p = placeAt(), l = Object.assign({ type: 'text', name: 'Text', text: 'Text', font: FONTS[0][0], size: Math.max(12, Math.round(Math.min(p.w, p.h) / 10)),
      color: '#ffffff', bold: true, align: 'center', x: p.x, y: p.y }, props || {});
    const m = L.measure(l); l.w = m.w; l.h = m.h;
    if (!props || !props.name) l.name = (String(l.text).split('\n')[0] || 'Text').slice(0, 24);
    return L.add(l);
  };
  L.addShape = (shape, props) => {
    const p = placeAt(), s = Math.round(Math.min(p.w, p.h) * 0.4);
    const names = { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line' };
    const l = Object.assign({ type: 'shape', shape: shape, name: names[shape] || 'Shape', x: p.x, y: p.y,
      w: shape === 'line' ? s * 1.4 : s * 1.3, h: shape === 'line' ? 0 : s,
      fill: '#3b6fd8', fillOn: shape !== 'line', stroke: '#ffffff', strokeOn: true, sw: Math.max(2, Math.round(s / 30)) }, props || {});
    if (l.shape === 'line') l.h = 0;
    return L.add(l);
  };
  // Decode an image file for a layer, kept at most the canvas size and the pixel cap.
  L.decodeLayerImage = async (blob, fitW, fitH) => {
    let bm = null;
    try { bm = await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (_) { bm = null; }
    if (!bm) {
      bm = await new Promise((res, rej) => { const u = URL.createObjectURL(blob), im = new Image(); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('decode')); }; im.src = u; });
    }
    const w0 = bm.naturalWidth || bm.width, h0 = bm.height || bm.naturalHeight;
    let tw, th;
    if (fitW && fitH) { tw = fitW; th = fitH; }
    else {
      const P = S.photo, k = Math.min(1, Math.max(P.w, P.h) / Math.max(w0, h0), Math.sqrt(LC().maxPixels / (w0 * h0)));
      tw = Math.max(1, Math.round(w0 * k)); th = Math.max(1, Math.round(h0 * k));
    }
    if (tw < w0 || th < h0) {
      let out = null;
      try { out = await createImageBitmap(bm, { resizeWidth: tw, resizeHeight: th, resizeQuality: 'high' }); } catch (_) { out = null; }
      if (!out) { out = document.createElement('canvas'); out.width = tw; out.height = th; const x = out.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(bm, 0, 0, tw, th); }
      if (bm.close) bm.close();
      bm = out;
    }
    return { bitmap: bm, w: tw, h: th, origW: w0, origH: h0 };
  };
  L.addImage = async (blob, name) => {
    if (!S.photo || tooMany()) return null;
    if (blob.type && !blob.type.startsWith('image/')) { PE.ui.toast('That is not an image'); return null; }
    PE.ui.busy('Adding image…');
    try {
      const d = await L.decodeLayerImage(blob);
      const src = 'i' + (++L.imgSeq);
      L.images.set(src, { bitmap: d.bitmap, blob: blob, name: name || 'image', type: blob.type || 'image/png', w: d.w, h: d.h });
      const p = placeAt(), sc = Math.min(1, 0.6 * p.w / d.w, 0.6 * p.h / d.h);
      PE.ui.busy(false);
      return L.add({ type: 'image', name: (name || 'Image').replace(/\.[^.]+$/, '').slice(0, 30) || 'Image', src: src, w: d.w, h: d.h, x: p.x, y: p.y, scale: sc });
    } catch (err) {
      PE.ui.busy(false); PE.ui.toast('Could not open that image'); console.warn('[photo-studio] layer image', err);
      return null;
    }
  };
  L.update = (id, props, live) => {
    const l = L.get(id); if (!l) return;
    Object.assign(l, props);
    if (l.type === 'text') { const m = L.measure(l); l.w = m.w; l.h = m.h; }
    if (live) { L.rebuildSoon(); return; }
    if (!S.commit('geom')) V.rebuild();
  };
  L.setBg = (props, live) => {
    S.edits.bg = Object.assign(L.bg(), props);
    if (live) { L.rebuildSoon(); return; }
    if (!S.commit('geom')) V.rebuild();
  };
  L.duplicate = (id) => {
    const l = L.get(id); if (!l || tooMany()) return null;
    const n = clone(l), M = mapping(), off = 20 / ppp(M);
    n.id = L.newId(); n.name = uniqueName(l.name + ' copy'); n.x += off; n.y += off;
    L.sel = n.id;
    L.apply((e) => { const i = e.layers.findIndex((q) => q.id === id); e.layers.splice(i + 1, 0, n); });
    L.render(); V.requestRender();
    return n;
  };
  L.remove = (id) => { L.apply((e) => { e.layers = e.layers.filter((q) => q.id !== id); }); if (L.sel === id) L.sel = null; L.render(); };
  L.askDelete = async (id) => {
    const l = L.get(id); if (!l) return false;
    const ok = await PE.studio.ask({ title: 'Delete layer?', text: '“' + l.name + '” will be removed. You can undo this.', ok: 'Delete', danger: true });
    if (ok) L.remove(id);
    return !!ok;
  };
  // Move to index (bottom = 0) in the stack.
  L.moveTo = (id, to) => {
    const ls = L.list(), from = ls.findIndex((q) => q.id === id);
    if (from < 0) return;
    to = clamp(to, 0, ls.length - 1);
    if (to === from) return;
    L.apply((e) => { const [x] = e.layers.splice(from, 1); e.layers.splice(to, 0, x); });
  };
  L.move = (id, dir) => { const i = L.list().findIndex((q) => q.id === id); if (i >= 0) L.moveTo(id, i + dir); };
  L.rename = async (id) => {
    const isBg = id === 'bg', l = isBg ? L.bg() : L.get(id); if (!l) return;
    const v = await PE.studio.ask({ title: 'Rename layer', input: l.name, ok: 'Rename' });
    if (v == null) return;
    const name = String(v).trim().slice(0, 60) || l.name;
    if (isBg) L.setBg({ name: name }); else L.update(id, { name: name });
  };
  L.select = (id) => { L.sel = id; L.render(); V.requestRender(); };

  // ---------- pointer: select / move / scale / rotate ----------
  let drag = null, lastTap = { id: null, t: 0 }, emptyTap = null;
  const stagePos = (e) => { const r = V.stage.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const modal = () => !!document.querySelector('.dlg-wrap:not([hidden])');   // any in-app dialog (resize, settings, message, ask, text)
  const active = () => L.open && !!S.photo && !PE.crop.active && !PE.resize.open && !modal();
  function onDown(e) {
    if (!active() || !e.target.closest || !e.target.closest('#stage') || e.target.closest('button, #empty')) return;
    if (drag) { e.stopImmediatePropagation(); e.preventDefault(); return; }     // one finger per layer drag
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const p = stagePos(e), h = L.hit(p.x, p.y);
    if (!h) { emptyTap = { id: e.pointerId, x: p.x, y: p.y, t: performance.now() }; return; }    // engine pans
    e.stopImmediatePropagation(); e.preventDefault();
    PE.ui.closePopovers();
    try { V.stage.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (L.sel !== h.id) L.select(h.id);
    const l = L.get(h.id);
    drag = { id: h.id, pid: e.pointerId, part: h.part, s0: p, p0: L.toPhoto(p.x, p.y), l0: clone(l), moved: false, t: performance.now() };
  }
  function onMove(e) {
    if (!drag) {
      if (e.pointerType === 'mouse' && active() && e.target.closest && e.target.closest('#stage')) {
        const p = stagePos(e), h = L.hit(p.x, p.y);
        V.stage.style.cursor = !h ? '' : h.part === 'rot' ? 'crosshair' : h.part === 'scale' ? 'nwse-resize' : 'move';
      }
      return;
    }
    if (e.pointerId !== drag.pid) { e.stopImmediatePropagation(); return; }
    e.stopImmediatePropagation(); e.preventDefault();
    const s = stagePos(e);
    if (!drag.moved && Math.hypot(s.x - drag.s0.x, s.y - drag.s0.y) < 4) return;
    drag.moved = true;
    const l = L.get(drag.id); if (!l) return;
    const p = L.toPhoto(s.x, s.y), d = drag, l0 = d.l0;
    if (d.part === 'body') { l.x = l0.x + (p.x - d.p0.x); l.y = l0.y + (p.y - d.p0.y); }
    else if (d.part === 'scale') {
      const r0 = Math.hypot(d.p0.x - l0.x, d.p0.y - l0.y) || 1, r1 = Math.hypot(p.x - l0.x, p.y - l0.y);
      const P = S.photo, big = Math.max(l0.w, boxH(l0), 1);
      l.scale = clamp(l0.scale * r1 / r0, LC().minSize / big, 4 * Math.max(P.w, P.h) / big);
    } else if (d.part === 'rot') {
      let r = l0.rot + Math.atan2(p.y - l0.y, p.x - l0.x) - Math.atan2(d.p0.y - l0.y, d.p0.x - l0.x);
      r = Math.atan2(Math.sin(r), Math.cos(r));
      const step = e.shiftKey ? Math.PI / 12 : Math.PI / 2, near = Math.round(r / step) * step;
      if (e.shiftKey || Math.abs(r - near) < 0.05) r = near;
      l.rot = Math.abs(r) < 1e-9 ? 0 : r;
    }
    L.rebuildSoon();
  }
  function onUp(e) {
    if (emptyTap && e.pointerId === emptyTap.id) {
      const p = stagePos(e), t = emptyTap; emptyTap = null;
      if (Math.hypot(p.x - t.x, p.y - t.y) < 8 && performance.now() - t.t < 300 && L.sel && L.sel !== 'bg') L.select(null);
    }
    if (!drag || e.pointerId !== drag.pid) return;
    e.stopImmediatePropagation();
    const d = drag; drag = null;
    if (d.moved) { if (!S.commit('geom')) V.rebuild(); return; }
    // tap: double-tap a text layer edits it
    const now = performance.now();
    if (now - d.t < 350) {
      if (lastTap.id === d.id && now - lastTap.t < 400) {
        lastTap = { id: null, t: 0 };
        const l = L.get(d.id);
        if (l && l.type === 'text') L.editText(l.id);
      } else lastTap = { id: d.id, t: now };
    }
  }
  function onCancel(e) {
    if (!drag || e.pointerId !== drag.pid) return;
    e.stopImmediatePropagation();
    const l = L.get(drag.id); if (l) Object.assign(l, drag.l0);
    drag = null; V.rebuild();
  }
  L.dragging = () => !!drag;

  // ---------- text dialog ----------
  let textDone = null;
  L.textOpen = () => !$('dlg-text').hidden;
  function textDialog(l) {
    return new Promise((res) => {
      $('tx-title').textContent = l ? 'Edit text' : 'Add text';
      $('tx-ok').textContent = l ? 'Done' : 'Add';
      const v = l || { text: '', font: FONTS[0][0], size: Math.max(12, Math.round(Math.min(S.edits.crop.w, S.edits.crop.h) / 10)), color: '#ffffff', bold: true, align: 'center' };
      $('tx-text').value = v.text; $('tx-font').value = v.font; $('tx-size').value = v.size; $('tx-color').value = v.color;
      $('tx-bold').classList.toggle('sel', !!v.bold);
      for (const b of $('tx-align').children) b.classList.toggle('sel', b.dataset.v === v.align);
      $('dlg-text').hidden = false; textDone = res;
      setTimeout(() => { try { $('tx-text').focus(); $('tx-text').select(); } catch (_) { /* ignore */ } }, 30);
    });
  }
  function closeText(ok) {
    if (!textDone) return;
    const r = textDone; textDone = null;
    $('dlg-text').hidden = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (!ok) { r(null); return; }
    const al = [...$('tx-align').children].find((b) => b.classList.contains('sel'));
    r({ text: $('tx-text').value.replace(/\r/g, '').slice(0, 2000) || 'Text', font: $('tx-font').value,
      size: clamp(Math.round(+$('tx-size').value || 48), 4, 2000), color: /^#[0-9a-f]{6}$/i.test($('tx-color').value) ? $('tx-color').value : '#ffffff',
      bold: $('tx-bold').classList.contains('sel'), align: al ? al.dataset.v : 'center' });
  }
  L.newText = async () => {
    if (!S.photo || tooMany()) return;
    const v = await textDialog(null);
    if (v) L.addText(v);
  };
  L.editText = async (id) => {
    const l = L.get(id); if (!l || l.type !== 'text') return;
    const v = await textDialog(l);
    if (v) L.update(id, v);
  };

  // ---------- panel ----------
  const ICON = {
    image: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 18l5-5 3 3 2-2 4 4"/>',
    text: '<path d="M6 6h12M12 6v13"/>',
    rect: '<rect x="5" y="6" width="14" height="12" rx="1"/>', ellipse: '<ellipse cx="12" cy="12" rx="7.5" ry="5.5"/>',
    line: '<path d="M5 18L19 6"/>', bg: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 15l5-4 4 3 3-2 4 3"/>'
  };
  const EYE = '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/>';
  const EYE_OFF = '<path d="M2.5 12s3.5-6 9.5-6c2 0 3.7.7 5.1 1.6M21.5 12s-3.5 6-9.5 6c-2 0-3.7-.7-5.1-1.6"/><path d="M4 20L20 4"/>';
  const svg = (p) => '<svg viewBox="0 0 24 24">' + p + '</svg>';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const iconOf = (l) => ICON[l.type === 'shape' ? l.shape : l.type] || ICON.rect;

  L.render = () => {
    const el = $('ps-layers'); if (!el) return;
    el.hidden = !L.open;
    const tb = $('tb-layers'); if (tb) tb.classList.toggle('active', L.open);
    if (!L.open) return;
    if (L.sel && L.sel !== 'bg' && !L.get(L.sel)) L.sel = null;
    const ls = L.list(), bg = L.bg();
    $('pl-count').textContent = L.count() + ' / ' + LC().maxLayers;
    let h = '';
    for (let i = ls.length - 1; i >= 0; i--) {
      const l = ls[i];
      h += '<li class="pl-row' + (l.id === L.sel ? ' sel' : '') + (l.visible ? '' : ' off') + '" data-id="' + l.id + '">' +
        '<span class="pl-grip" title="Drag to reorder" data-a="grip">⋮⋮</span>' +
        '<button type="button" tabindex="-1" class="pl-ic" data-a="eye" title="' + (l.visible ? 'Hide' : 'Show') + '">' + svg(l.visible ? EYE : EYE_OFF) + '</button>' +
        '<span class="pl-type">' + svg(iconOf(l)) + '</span>' +
        '<span class="pl-name">' + esc(l.name) + '</span>' +
        (l.opacity < 1 ? '<span class="pl-op">' + Math.round(l.opacity * 100) + '%</span>' : '') +
        '<button type="button" tabindex="-1" class="pl-ic" data-a="up" title="Move up"' + (i === ls.length - 1 ? ' disabled' : '') + '>▲</button>' +
        '<button type="button" tabindex="-1" class="pl-ic" data-a="down" title="Move down"' + (i === 0 ? ' disabled' : '') + '>▼</button></li>';
    }
    h += '<li class="pl-row bg' + (L.sel === 'bg' ? ' sel' : '') + (bg.visible ? '' : ' off') + '" data-id="bg">' +
      '<span class="pl-grip"></span><button type="button" tabindex="-1" class="pl-ic" data-a="eye" title="' + (bg.visible ? 'Hide' : 'Show') + '">' + svg(bg.visible ? EYE : EYE_OFF) + '</button>' +
      '<span class="pl-type">' + svg(ICON.bg) + '</span><span class="pl-name">' + esc(bg.name) + '</span>' +
      (bg.opacity < 1 ? '<span class="pl-op">' + Math.round(bg.opacity * 100) + '%</span>' : '') + '<span class="pl-lock" title="The photo stays at the bottom">🔒</span></li>';
    $('pl-list').innerHTML = h;
    renderProps();
  };
  function renderProps() {
    const box = $('pl-props'), id = L.sel;
    if (!id) { box.hidden = true; return; }
    const isBg = id === 'bg', l = isBg ? L.bg() : L.get(id);
    if (!l) { box.hidden = true; return; }
    box.hidden = false;
    $('pl-op').value = Math.round(l.opacity * 100); $('pl-op-v').textContent = Math.round(l.opacity * 100) + '%';
    $('pl-blend-row').hidden = isBg;
    if (!isBg) $('pl-blend').value = l.blend || 'source-over';
    $('pl-dup').hidden = $('pl-del').hidden = isBg;
    $('pl-edit').hidden = !(l.type === 'text');
    const sh = l.type === 'shape';
    $('pl-shape').hidden = !sh;
    if (sh) {
      const line = l.shape === 'line';
      $('pl-fill-row').hidden = line;
      $('pl-fill').value = l.fill; $('pl-fill-on').classList.toggle('sel', !!l.fillOn);
      $('pl-stroke').value = l.stroke; $('pl-sw').value = line || l.strokeOn ? l.sw : 0; $('pl-sw-v').textContent = (line || l.strokeOn ? l.sw : 0) + ' px';
    }
  }
  L.toggle = (on) => {
    on = on == null ? !L.open : !!on;
    if (on === L.open) return;
    if (on) {
      if (!S.photo) return;
      if (PE.crop.active) PE.crop.cancel();
      PE.ui.panel = null;
    }
    L.open = on;
    if (!on) { V.stage.style.cursor = ''; drag = null; }
    L.render();
    PE.ui.sync();
    V.requestRender();
  };

  // reorder by dragging the grip
  let rdrag = null;
  function rowDown(e) {
    const g = e.target.closest('[data-a="grip"]'); if (!g) return;
    const row = g.closest('.pl-row'); if (!row || row.dataset.id === 'bg') return;
    e.preventDefault(); e.stopPropagation();
    try { g.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const rows = [...$('pl-list').querySelectorAll('.pl-row:not(.bg)')];
    rdrag = { id: row.dataset.id, pid: e.pointerId, y0: e.clientY, row, rows, idx: rows.indexOf(row), rh: row.getBoundingClientRect().height || 40, el: g, to: rows.indexOf(row) };
    row.classList.add('dragging');
  }
  function rowMove(e) {
    if (!rdrag || e.pointerId !== rdrag.pid) return;
    const dy = e.clientY - rdrag.y0, n = rdrag.rows.length;
    rdrag.row.style.transform = 'translateY(' + dy + 'px)';
    rdrag.to = clamp(Math.round(rdrag.idx + dy / rdrag.rh), 0, n - 1);
    rdrag.rows.forEach((r, i) => { r.classList.toggle('drop-above', i === rdrag.to && rdrag.to < rdrag.idx); r.classList.toggle('drop-below', i === rdrag.to && rdrag.to > rdrag.idx); });
  }
  function rowUp(e) {
    if (!rdrag || e.pointerId !== rdrag.pid) return;
    const d = rdrag; rdrag = null;
    d.row.style.transform = '';
    const n = d.rows.length;
    if (d.to !== d.idx) L.moveTo(d.id, n - 1 - d.to);    // list is top-first, the stack bottom-first
    else L.render();
  }

  // ---------- init ----------
  function bindPanel() {
    const on = PE.ui.onTap, list = $('pl-list');
    on($('pl-add-image'), () => $('ps-layer-in').click());
    on($('pl-add-text'), () => L.newText());
    on($('pl-add-rect'), () => L.addShape('rect'));
    on($('pl-add-ellipse'), () => L.addShape('ellipse'));
    on($('pl-add-line'), () => L.addShape('line'));
    on($('pl-close'), () => L.toggle(false));
    $('ps-layer-in').addEventListener('change', () => { const f = $('ps-layer-in').files && $('ps-layer-in').files[0]; $('ps-layer-in').value = ''; if (f) L.addImage(f, f.name); });
    list.addEventListener('pointerdown', rowDown);
    list.addEventListener('pointermove', rowMove);
    list.addEventListener('pointerup', rowUp);
    list.addEventListener('pointercancel', rowUp);
    let lastRow = { id: null, t: 0 };
    list.addEventListener('click', (e) => {
      const row = e.target.closest('.pl-row'); if (!row) return;
      const id = row.dataset.id, a = (e.target.closest('[data-a]') || {}).dataset;
      const act = a && a.a;
      if (act === 'eye') { if (id === 'bg') L.setBg({ visible: !L.bg().visible }); else { const l = L.get(id); if (l) L.update(id, { visible: !l.visible }); } return; }
      if (act === 'up') { L.move(id, 1); return; }
      if (act === 'down') { L.move(id, -1); return; }
      if (act === 'grip') return;
      const now = performance.now();
      if (lastRow.id === id && now - lastRow.t < 400) { lastRow = { id: null, t: 0 }; const l = L.get(id); if (l && l.type === 'text') L.editText(id); else L.rename(id); return; }
      lastRow = { id, t: now };
      L.select(id);
    });
    const op = $('pl-op');
    op.addEventListener('input', () => {
      const v = clamp(+op.value, 0, 100) / 100; $('pl-op-v').textContent = Math.round(v * 100) + '%';
      if (L.sel === 'bg') L.setBg({ opacity: v }, true); else L.update(L.sel, { opacity: v }, true);
    });
    op.addEventListener('change', () => { const v = clamp(+op.value, 0, 100) / 100; if (L.sel === 'bg') L.setBg({ opacity: v }); else L.update(L.sel, { opacity: v }); });
    $('pl-blend').addEventListener('change', () => L.update(L.sel, { blend: $('pl-blend').value }));
    on($('pl-rename'), () => L.rename(L.sel));
    on($('pl-dup'), () => L.duplicate(L.sel));
    on($('pl-del'), () => L.askDelete(L.sel));
    on($('pl-edit'), () => L.editText(L.sel));
    $('pl-fill').addEventListener('input', () => L.update(L.sel, { fill: $('pl-fill').value, fillOn: true }, true));
    $('pl-fill').addEventListener('change', () => L.update(L.sel, { fill: $('pl-fill').value, fillOn: true }));
    on($('pl-fill-on'), () => { const l = L.get(L.sel); if (l) L.update(l.id, { fillOn: !l.fillOn }); });
    $('pl-stroke').addEventListener('input', () => L.update(L.sel, { stroke: $('pl-stroke').value }, true));
    $('pl-stroke').addEventListener('change', () => L.update(L.sel, { stroke: $('pl-stroke').value }));
    const sw = $('pl-sw');
    const swv = () => { const v = clamp(Math.round(+sw.value), 0, 200); $('pl-sw-v').textContent = v + ' px'; const l = L.get(L.sel); return l && l.shape === 'line' ? { sw: Math.max(1, v) } : { sw: Math.max(1, v), strokeOn: v > 0 }; };
    sw.addEventListener('input', () => L.update(L.sel, swv(), true));
    sw.addEventListener('change', () => L.update(L.sel, swv()));
    // blend + font options
    $('pl-blend').innerHTML = BLENDS.map((b) => '<option value="' + b[0] + '">' + b[1] + '</option>').join('');
    $('tx-font').innerHTML = FONTS.map((f) => '<option value="' + esc(f[0]) + '">' + f[1] + '</option>').join('');
    // text dialog
    on($('tx-ok'), () => closeText(true));
    on($('tx-cancel'), () => closeText(false));
    on($('tx-bold'), () => $('tx-bold').classList.toggle('sel'));
    for (const b of $('tx-align').children) on(b, () => { for (const c of $('tx-align').children) c.classList.toggle('sel', c === b); });
  }

  function init() {
    bindPanel();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    const prevRender = V.onRender;
    V.onRender = () => { if (prevRender) prevRender(); drawHandles(); };
    // the Layers panel shares the space with Crop / Adjust: opening one closes the other
    const engineSync = PE.ui.sync;
    PE.ui.sync = () => {
      if (L.open && (PE.crop.active || PE.ui.panel || !S.photo)) { L.open = false; V.stage.style.cursor = ''; L.render(); }
      engineSync();
    };
    PE.on((kind) => {
      if (kind === 'adjlive') return;
      if (kind === 'photo' && !L.loadingProject) { L.sel = null; }
      L.render();
    });
    // keys: dialog capture, then layer keys
    window.addEventListener('keydown', (e) => {
      if (L.textOpen()) {
        if (e.key === 'Escape') { closeText(false); e.preventDefault(); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || e.target.tagName !== 'TEXTAREA')) { closeText(true); e.preventDefault(); }
        e.stopImmediatePropagation();
        return;
      }
      if (!active() || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && L.sel && L.sel !== 'bg') { e.preventDefault(); e.stopImmediatePropagation(); L.askDelete(L.sel); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (L.sel) L.select(null); else L.toggle(false); }
    }, true);
    // drop / paste an image while the Layers panel is open = new image layer (not a new photo)
    window.addEventListener('drop', (e) => {
      if (!active()) return;
      const f = e.dataTransfer && Array.from(e.dataTransfer.files || []).find((x) => x.type.startsWith('image/'));
      if (!f) return;
      e.preventDefault(); e.stopImmediatePropagation(); document.body.classList.remove('dragging');
      L.addImage(f, f.name);
    }, true);
    window.addEventListener('paste', (e) => {
      if (!active()) return;
      for (const it of (e.clipboardData && e.clipboardData.items) || []) {
        if (it.kind === 'file' && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) { e.preventDefault(); e.stopImmediatePropagation(); L.addImage(f, 'pasted'); return; } }
      }
    }, true);
    L.render();
  }

  PE.studio.feature({ id: 'layers', init: init });
  PE.studio.addTool({
    id: 'layers', title: 'Layers (L)', key: 'l',
    svg: '<path d="M12 3.5l8.5 4.5-8.5 4.5L3.5 8z"/><path d="M3.5 12l8.5 4.5 8.5-4.5"/><path d="M3.5 16l8.5 4.5 8.5-4.5"/>',
    onTap() { L.toggle(); }
  });
})(window.PE);
