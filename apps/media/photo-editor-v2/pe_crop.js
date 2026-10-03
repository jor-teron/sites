/*
 * Photo Editor v2 — pe_crop.js
 * Crop mode: the whole (oriented) photo is shown with a crop box on top. Drag the
 * corners/edges (large touch handles) or the inside to move. Outside is dimmed.
 * Ratios: Free, Original, 1:1, 4:3, 16:9 (tap a ratio again to turn it portrait, e.g. 3:4).
 * The box is kept in oriented-photo pixels; on Apply it is converted back to
 * original-photo pixels and stored as an edit.
 */
(function (PE) {
  'use strict';

  const C = PE.crop = { active: false, box: null, ratioId: 'free', ratioFlip: false };
  const S = PE.state, T = PE.transform;
  const cfg = () => PE.config.crop;
  let drag = null, chipsEl = null;

  C.full = () => T.orientedSize(S.photo.w, S.photo.h, S.edits.m);

  C.init = () => {
    chipsEl = document.getElementById('ratio-chips');
    for (const o of cfg().ratios) {
      const b = document.createElement('button');
      b.type = 'button'; b.tabIndex = -1; b.className = 'chip'; b.dataset.id = o.id;
      PE.ui.onTap(b, () => C.setRatio(o.id));
      chipsEl.appendChild(b);
    }
    PE.on(() => C.syncChips());
    C.syncChips();
  };

  C.start = () => {
    if (!S.photo || C.active) return;
    const P = S.photo, e = S.edits;
    C.box = T.sourceRectToDisplay(e.crop, e.m, P.w, P.h);
    C.ratioId = 'free'; C.ratioFlip = false;
    C.active = true;
    PE.view.zoom = 1; PE.view.panX = PE.view.panY = 0;
    PE.emit('crop');
  };

  C.cancel = () => {
    if (!C.active) return;
    C.active = false; drag = null;
    PE.emit('crop');
  };

  C.apply = () => {
    if (!C.active) return;
    const P = S.photo, e = S.edits;
    const r = T.displayRectToSource(C.box, e.m, P.w, P.h);
    const x = Math.max(0, Math.min(P.w - 1, Math.round(r.x)));
    const y = Math.max(0, Math.min(P.h - 1, Math.round(r.y)));
    const w = Math.max(1, Math.min(P.w, Math.round(r.x + r.w)) - x);
    const h = Math.max(1, Math.min(P.h, Math.round(r.y + r.h)) - y);
    C.active = false; drag = null;
    e.crop = { x: x, y: y, w: w, h: h };
    if (!S.commit('geom')) PE.emit('crop');
  };

  C.ratio = () => {
    const o = cfg().ratios.find((q) => q.id === C.ratioId);
    if (!o || !o.r) return 0;
    let R = o.r > 0 ? o.r : (S.photo.w / S.photo.h);
    if (o.r < 0 && T.swaps(S.edits.m)) R = 1 / R;      // "Original" follows the current orientation
    return C.ratioFlip ? 1 / R : R;
  };

  C.setRatio = (id) => {
    if (!C.active) return;
    const o = cfg().ratios.find((q) => q.id === id);
    if (!o) return;
    if (id === C.ratioId) {
      if (o.r === 0) { const O = C.full(); C.box = { x: 0, y: 0, w: O.w, h: O.h }; }   // Free again = whole photo
      else if (o.r !== 1) C.ratioFlip = !C.ratioFlip;
    } else { C.ratioId = id; C.ratioFlip = false; }
    const R = C.ratio();
    if (R) {
      const O = C.full();
      let w = O.w, h = w / R;
      if (h > O.h) { h = O.h; w = h * R; }
      C.box = { x: (O.w - w) / 2, y: (O.h - h) / 2, w: w, h: h };
    }
    C.syncChips();
    PE.view.requestRender();
  };

  C.syncChips = () => {
    if (!chipsEl) return;
    for (const b of chipsEl.children) {
      const o = cfg().ratios.find((q) => q.id === b.dataset.id);
      const sel = C.ratioId === o.id;
      let label = o.label;
      if (sel && C.ratioFlip && o.r > 0 && o.r !== 1) label = label.split(':').reverse().join(':');
      if (sel && C.ratioFlip && o.r < 0) label += ' ⇄';
      b.textContent = label;
      b.classList.toggle('sel', sel);
    }
  };

  // ----- hit testing / dragging (screen CSS px) -----
  function screenBox() {
    const r = PE.view.imageRect(), b = C.box;
    return { l: r.x + b.x * r.s, t: r.y + b.y * r.s, r: r.x + (b.x + b.w) * r.s, b: r.y + (b.y + b.h) * r.s, s: r.s };
  }

  C.hit = (x, y) => {
    if (!C.active || !C.box) return null;
    const q = screenBox(), H = cfg().hit;
    const nearL = Math.abs(x - q.l) <= H, nearR = Math.abs(x - q.r) <= H;
    const nearT = Math.abs(y - q.t) <= H, nearB = Math.abs(y - q.b) <= H;
    const inX = x > q.l - H && x < q.r + H, inY = y > q.t - H && y < q.b + H;
    // pick the closer edge when the box is small
    const hx = nearL && nearR ? (Math.abs(x - q.l) < Math.abs(x - q.r) ? 'w' : 'e') : nearL ? 'w' : nearR ? 'e' : '';
    const hy = nearT && nearB ? (Math.abs(y - q.t) < Math.abs(y - q.b) ? 'n' : 's') : nearT ? 'n' : nearB ? 's' : '';
    if (hx && hy) return hy + hx;
    if (hx && inY) return hx;
    if (hy && inX) return hy;
    if (x > q.l && x < q.r && y > q.t && y < q.b) return 'move';
    return null;
  };

  const CURSORS = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', move: 'move' };
  C.cursor = (x, y) => CURSORS[C.hit(x, y)] || '';

  C.down = (x, y) => {
    const h = C.hit(x, y);
    if (!h) return false;
    const b = C.box;
    drag = { h: h, x: x, y: y, s: screenBox().s, l: b.x, t: b.y, r: b.x + b.w, b: b.y + b.h, orig: Object.assign({}, b) };
    return true;
  };
  C.abortDrag = () => { if (drag) { C.box = drag.orig; drag = null; PE.view.requestRender(); } };
  C.up = () => { drag = null; };

  C.move = (x, y) => {
    if (!drag) return;
    const O = C.full(), min = Math.min(cfg().minSize, O.w, O.h);
    const dx = (x - drag.x) / drag.s, dy = (y - drag.y) / drag.s;
    const d = drag, h = d.h, R = C.ratio();
    let l = d.l, t = d.t, r = d.r, b = d.b;
    const clamp = (v, a, z) => Math.max(a, Math.min(z, v));

    if (h === 'move') {
      const w = r - l, hh = b - t;
      l = clamp(l + dx, 0, O.w - w); t = clamp(t + dy, 0, O.h - hh); r = l + w; b = t + hh;
    } else if (!R) {
      if (h.includes('w')) l = clamp(d.l + dx, 0, d.r - min);
      if (h.includes('e')) r = clamp(d.r + dx, d.l + min, O.w);
      if (h.includes('n')) t = clamp(d.t + dy, 0, d.b - min);
      if (h.includes('s')) b = clamp(d.b + dy, d.t + min, O.h);
    } else if (h.length === 2) {
      // corner with fixed ratio: the opposite corner stays put
      const dirX = h.includes('w') ? -1 : 1, dirY = h.includes('n') ? -1 : 1;
      const ax = dirX < 0 ? d.r : d.l, ay = dirY < 0 ? d.b : d.t;
      const px = (dirX < 0 ? d.l : d.r) + dx, py = (dirY < 0 ? d.t : d.b) + dy;
      let w = Math.max(min, (px - ax) * dirX), hh = Math.max(min, (py - ay) * dirY);
      if (w / hh > R) w = hh * R; else hh = w / R;
      const availW = dirX > 0 ? O.w - ax : ax, availH = dirY > 0 ? O.h - ay : ay;
      if (w > availW) { w = availW; hh = w / R; }
      if (hh > availH) { hh = availH; w = hh * R; }
      l = dirX > 0 ? ax : ax - w; r = l + w; t = dirY > 0 ? ay : ay - hh; b = t + hh;
    } else if (h === 'e' || h === 'w') {
      // side edge with fixed ratio: height follows, centred
      const dir = h === 'w' ? -1 : 1, ax = dir < 0 ? d.r : d.l;
      let w = Math.max(min, ((dir < 0 ? d.l : d.r) + dx - ax) * dir), hh = w / R;
      const cy = (d.t + d.b) / 2, maxH = 2 * Math.min(cy, O.h - cy), availW = dir > 0 ? O.w - ax : ax;
      if (hh > maxH) { hh = maxH; w = hh * R; }
      if (w > availW) { w = availW; hh = w / R; }
      l = dir > 0 ? ax : ax - w; r = l + w; t = cy - hh / 2; b = t + hh;
    } else {
      const dir = h === 'n' ? -1 : 1, ay = dir < 0 ? d.b : d.t;
      let hh = Math.max(min, ((dir < 0 ? d.t : d.b) + dy - ay) * dir), w = hh * R;
      const cx = (d.l + d.r) / 2, maxW = 2 * Math.min(cx, O.w - cx), availH = dir > 0 ? O.h - ay : ay;
      if (w > maxW) { w = maxW; hh = w / R; }
      if (hh > availH) { hh = availH; w = hh * R; }
      t = dir > 0 ? ay : ay - hh; b = t + hh; l = cx - w / 2; r = l + w;
    }
    C.box = { x: l, y: t, w: r - l, h: b - t };
    PE.view.requestRender();
  };

  // ----- drawing (device px) -----
  C.draw = (ctx, ir, d) => {
    const q = screenBox();
    const L = q.l * d, Tp = q.t * d, R = q.r * d, B = q.b * d;
    const X0 = ir.x * d, Y0 = ir.y * d, X1 = (ir.x + ir.w) * d, Y1 = (ir.y + ir.h) * d;
    const col = PE.config.colors;
    ctx.fillStyle = col.dim;
    ctx.fillRect(X0, Y0, X1 - X0, Tp - Y0);
    ctx.fillRect(X0, B, X1 - X0, Y1 - B);
    ctx.fillRect(X0, Tp, L - X0, B - Tp);
    ctx.fillRect(R, Tp, X1 - R, B - Tp);
    // thirds grid
    ctx.strokeStyle = col.cropGrid; ctx.lineWidth = 1 * d;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      const gx = L + (R - L) * i / 3, gy = Tp + (B - Tp) * i / 3;
      ctx.moveTo(gx, Tp); ctx.lineTo(gx, B); ctx.moveTo(L, gy); ctx.lineTo(R, gy);
    }
    ctx.stroke();
    ctx.strokeStyle = col.cropLine; ctx.lineWidth = 1.5 * d;
    ctx.strokeRect(L, Tp, R - L, B - Tp);
    // corner + edge handles
    const k = Math.min(18 * d, (R - L) / 3, (B - Tp) / 3), w = 4 * d;
    ctx.fillStyle = col.cropLine;
    const corner = (x, y, sx, sy) => { ctx.fillRect(x, y, sx * k, sy * w); ctx.fillRect(x, y, sx * w, sy * k); };
    corner(L - w / 2, Tp - w / 2, 1, 1); corner(R + w / 2, Tp - w / 2, -1, 1);
    corner(L - w / 2, B + w / 2, 1, -1); corner(R + w / 2, B + w / 2, -1, -1);
    const mx = (L + R) / 2, my = (Tp + B) / 2, e = Math.min(14 * d, (R - L) / 4, (B - Tp) / 4);
    ctx.fillRect(mx - e, Tp - w / 2, 2 * e, w); ctx.fillRect(mx - e, B - w / 2, 2 * e, w);
    ctx.fillRect(L - w / 2, my - e, w, 2 * e); ctx.fillRect(R - w / 2, my - e, w, 2 * e);
  };
})(window.PE);
